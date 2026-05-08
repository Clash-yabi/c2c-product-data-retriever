import { prisma } from "@/lib/prisma";
import { getBrowser, closeBrowser } from "@/lib/browser";
import { getProductDetail } from "@/lib/c2c-scraper";
import { parseCertificate } from "@/lib/pdf-parser";
import pLimit from "p-limit";
import { Product as PrismaProduct } from "@prisma/client";
import { C2CProduct, PDFData } from "@/types/products";
import { DEFAULT_NA } from "@/lib/scraper/constants";
import { jobEmitter } from "@/lib/event-emitter";

export async function runBackgroundScrape(jobId: string) {
  let lastStatusCheck = 0;
  let cachedStatus = "running";

  try {
    const limit = pLimit(3); // Concurrency limit for browser tabs
    let hasMore = true;

    while (hasMore) {
      // 1. Fetch pending products in batches of 50 (Solves Risk #3: Memory Scaling)
      const pendingProducts = await prisma.product.findMany({
        where: { jobId, status: "pending" },
        take: 50,
      });

      if (pendingProducts.length === 0) {
        hasMore = false;
        break;
      }

      const browser = await getBrowser();

      // 2. Define the worker function for this batch
      const processSingleProduct = async (product: PrismaProduct) => {
        try {
          // 2.1 Throttled Status Check (Solves Risk #2: Database Overhead)
          // Only hit the DB to check job status every 5 seconds
          const now = Date.now();
          if (now - lastStatusCheck > 5000) {
            const currentJob = await prisma.scrapeJob.findUnique({
              where: { id: jobId },
              select: { status: true },
            });
            cachedStatus = currentJob?.status || "failed";
            lastStatusCheck = now;
          }

          if (cachedStatus !== "running") {
            console.log(
              `Worker: Job ${jobId} is no longer running (${cachedStatus}). Aborting ${product.slug}.`,
            );

            await prisma.product.update({
              where: { id: product.id },
              data: { status: "cancelled" },
            });
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
          const updateData = mapScrapeResultToProductData(
            product,
            detail,
            pdfData,
          );

          // 4. Update product in DB as success
          await prisma.product.update({
            where: { id: product.id },
            data: updateData,
          });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`Worker: Error for ${product.slug}:`, errorMessage);

          await prisma.product.update({
            where: { id: product.id },
            data: {
              status: "error",
              errorReason: errorMessage,
            },
          });
        } finally {
          // Increment processedItems regardless of success/fail/abort
          const updatedJob = await prisma.scrapeJob.update({
            where: { id: jobId },
            data: {
              processedItems: { increment: 1 },
            },
            select: { processedItems: true, totalItems: true },
          });

          // Event uitzenden naar alle luisteraars
          jobEmitter.emit(`job-${jobId}`, {
            status: cachedStatus === "running" ? "running" : cachedStatus,
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
          });
        }
      };

      // 3. Process the current batch with strict concurrency
      await Promise.all(
        pendingProducts.map((p) => limit(() => processSingleProduct(p))),
      );
    }

    // 4. Final check and Mark job as completed
    const finalJob = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (finalJob?.status === "running") {
      const completedJob = await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: "completed" },
        select: { processedItems: true, totalItems: true },
      });

      jobEmitter.emit(`job-${jobId}`, {
        status: "completed",
        processedItems: completedJob.processedItems,
        totalItems: completedJob.totalItems,
      });
      console.log(`Worker: Job ${jobId} completed!`);
    } else {
      console.log(
        `Worker: Job ${jobId} finished with status "${finalJob?.status}". No further updates.`,
      );
    }
  } catch (error) {
    console.error(`Worker: Fatal error in job ${jobId}:`, error);
    const failedJob = await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: "failed" },
      select: { processedItems: true, totalItems: true },
    });

    jobEmitter.emit(`job-${jobId}`, {
      status: "failed",
      processedItems: failedJob.processedItems,
      totalItems: failedJob.totalItems,
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
  pdfData: PDFData,
) {
  const isScrapeValid = scrapedDetail.productName !== DEFAULT_NA;

  return {
    status: "success" as const,
    company:
      isScrapeValid && scrapedDetail.company
        ? (scrapedDetail.company as string)
        : (existingProduct.company ?? DEFAULT_NA),
    productName:
      isScrapeValid && scrapedDetail.productName
        ? (scrapedDetail.productName as string)
        : (existingProduct.productName ?? DEFAULT_NA),
    level: scrapedDetail.level || DEFAULT_NA,
    standardVersion: scrapedDetail.standardVersion || DEFAULT_NA,
    fullScopeLevel: scrapedDetail.fullScopeLevel || DEFAULT_NA,
    fullScopeVersion: scrapedDetail.fullScopeVersion || DEFAULT_NA,
    materialHealthLevel: scrapedDetail.materialHealthLevel || DEFAULT_NA,
    materialHealthVersion: scrapedDetail.materialHealthVersion || DEFAULT_NA,
    circularityLevel: scrapedDetail.circularityLevel || DEFAULT_NA,
    circularityVersion: scrapedDetail.circularityVersion || DEFAULT_NA,
    effectiveDate: pdfData.effectiveDate,
    expirationDate:
      scrapedDetail.expirationDate &&
      scrapedDetail.expirationDate !== DEFAULT_NA
        ? scrapedDetail.expirationDate
        : pdfData.pdfExpirationDate,
    leadAssessmentBody: pdfData.leadBody,
    materialHealthAssessmentBody: pdfData.healthBody,
    pdfUrl: scrapedDetail.pdfUrl || DEFAULT_NA,
  };
}
