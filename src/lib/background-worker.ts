import { prisma } from "@/lib/prisma";
import { getBrowser } from "./browser";
import { getProductDetail } from "./c2c-scraper";
import { parseCertificate } from "./pdf-parser";
import pLimit from "p-limit";
import { Product as PrismaProduct } from "@prisma/client";

const DEFAULT_NA = "N/A";
const DEFAULT_ERROR = "Error";

export async function runBackgroundScrape(jobId: string) {
  try {
    // 1. Fetch pending products for this job
    const pendingProducts = await prisma.product.findMany({
      where: { jobId, status: "pending" },
    });

    if (pendingProducts.length === 0) {
      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: "completed" },
      });
      return;
    }

    const browser = await getBrowser();
    const limit = pLimit(3); // strictly 3 tabs

    // 2. Define the worker function
    const processSingleProduct = async (product: PrismaProduct) => {
      try {
        console.log(`Worker: Extracting ${product.slug}...`);
        const detail = await getProductDetail(browser, product.slug);

        let pdfData = {
          leadBody: DEFAULT_NA,
          healthBody: DEFAULT_NA,
          effectiveDate: DEFAULT_NA,
          pdfExpirationDate: DEFAULT_NA,
        };

        if (detail.pdfUrl && detail.pdfUrl !== DEFAULT_NA) {
          pdfData = await parseCertificate(detail.pdfUrl);
        }

        // Update product in DB as success
        await prisma.product.update({
          where: { id: product.id },
          data: {
            status: "success",
            company: (detail.productName !== DEFAULT_NA && detail.company) ? (detail.company as string) : (product.company ?? DEFAULT_NA),
            productName: (detail.productName !== DEFAULT_NA && detail.productName) ? (detail.productName as string) : (product.productName ?? DEFAULT_NA),
            level: detail.level || DEFAULT_NA,
            standardVersion: detail.standardVersion || DEFAULT_NA,
            effectiveDate: pdfData.effectiveDate,
            expirationDate: (detail.expirationDate && detail.expirationDate !== DEFAULT_NA) ? detail.expirationDate : pdfData.pdfExpirationDate,
            leadAssessmentBody: pdfData.leadBody,
            materialHealthAssessmentBody: pdfData.healthBody,
            pdfUrl: detail.pdfUrl || DEFAULT_NA,
            updatedAt: new Date().toISOString(),
          },
        });

      } catch (err: any) {
        console.error(`Worker: Error for ${product.slug}:`, err.message);
        // Mark as error
        await prisma.product.update({
          where: { id: product.id },
          data: { 
            status: "error", 
            errorReason: err.message,
            updatedAt: new Date().toISOString(),
          },
        });
      } finally {
        // Increment processedItems regardless of success/fail
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: { 
            processedItems: { increment: 1 },
            updatedAt: new Date().toISOString(),
          },
        });
      }
    };

    // 3. Process all pending products with strict concurrency limit
    await Promise.all(pendingProducts.map((p) => limit(() => processSingleProduct(p))));

    // 4. Mark job as completed
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { 
        status: "completed",
        updatedAt: new Date().toISOString(),
      },
    });
    console.log(`Worker: Job ${jobId} completed!`);

  } catch (error) {
    console.error(`Worker: Fatal error in job ${jobId}:`, error);
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { 
        status: "failed",
        updatedAt: new Date().toISOString(),
      },
    });
  }
}
