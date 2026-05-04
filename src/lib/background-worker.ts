import { prisma } from "@/lib/prisma";
import { getBrowser, closeBrowser } from "@/lib/browser";
import { getProductDetail } from "@/lib/c2c-scraper";
import { parseCertificate } from "@/lib/pdf-parser";
import pLimit from "p-limit";
import { Product as PrismaProduct } from "@prisma/client";
import { C2CProduct, PDFData } from "@/types/products";
import { DEFAULT_NA } from "@/lib/scraper/constants";





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
    const limit = pLimit(3); // Increased to 3 tabs for faster extraction (Railway metrics show room for this)

    // 2. Define the worker function
    const processSingleProduct = async (product: PrismaProduct) => {
      try {
        // 2.1 Check if the job is still active before starting a product
        const currentJob = await prisma.scrapeJob.findUnique({
          where: { id: jobId },
          select: { status: true }
        });

        if (currentJob?.status !== "running") {
          console.log(`Worker: Job ${jobId} is no longer running. Aborting ${product.slug}.`);
          return;
        }

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

        // 3. Map result to DB format
        const updateData = mapScrapeResultToProductData(product, detail, pdfData);

        // 4. Update product in DB as success
        await prisma.product.update({
          where: { id: product.id },
          data: updateData,
        });

      } catch (err: any) {
        console.error(`Worker: Error for ${product.slug}:`, err.message);
        // Mark as error
        await prisma.product.update({
          where: { id: product.id },
          data: { 
            status: "error", 
            errorReason: err.message,
          },
        });
      } finally {
        // Increment processedItems regardless of success/fail
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: { 
            processedItems: { increment: 1 },
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
      },
    });
    console.log(`Worker: Job ${jobId} completed!`);

  } catch (error) {
    console.error(`Worker: Fatal error in job ${jobId}:`, error);
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { 
        status: "failed",
      },
    });
  } finally {
    // 5. Always close the browser at the end of a job to free up RAM on Railway
    console.log("Worker: Closing browser to free up memory...");
    await closeBrowser();
  }
}

/**
 * Maps the combined results from the scraper and PDF parser to the database format.
 * Implements fallback logic to preserve existing data if scraping fails.
 */
function mapScrapeResultToProductData(
  existingProduct: PrismaProduct,
  scrapedDetail: Partial<C2CProduct>,
  pdfData: PDFData
) {
  const isScrapeValid = scrapedDetail.productName !== DEFAULT_NA;

  return {
    status: "success" as const,
    company: (isScrapeValid && scrapedDetail.company) 
      ? (scrapedDetail.company as string) 
      : (existingProduct.company ?? DEFAULT_NA),
    productName: (isScrapeValid && scrapedDetail.productName) 
      ? (scrapedDetail.productName as string) 
      : (existingProduct.productName ?? DEFAULT_NA),
    level: scrapedDetail.level || DEFAULT_NA,
    standardVersion: scrapedDetail.standardVersion || DEFAULT_NA,
    effectiveDate: pdfData.effectiveDate,
    expirationDate: (scrapedDetail.expirationDate && scrapedDetail.expirationDate !== DEFAULT_NA) 
      ? scrapedDetail.expirationDate 
      : pdfData.pdfExpirationDate,
    leadAssessmentBody: pdfData.leadBody,
    materialHealthAssessmentBody: pdfData.healthBody,
    pdfUrl: scrapedDetail.pdfUrl || DEFAULT_NA,
  };
}
