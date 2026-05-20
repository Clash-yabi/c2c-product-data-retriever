import { Browser } from "puppeteer";
import { prisma } from "@/lib/prisma";
import { getBrowser, closeBrowser } from "@/lib/browser";
import { getProductDetail } from "@/lib/scraper/detail";
import { parseCertificate } from "@/lib/pdf-parser";
import pLimit from "p-limit";
import { Product as PrismaProduct } from "@prisma/client";
import { C2CProduct, PDFData } from "@/types/products";
import { DEFAULT_NA, TIMEOUT_SHORT_MS, SCRAPER_MAX_RETRIES, SCRAPER_RETRY_DELAY_MS, BROWSER_RECYCLE_LIMIT, DELAY_BATCH_MS } from "@/lib/scraper/constants";
import { jobEmitter } from "@/lib/event-emitter";

/**
 * Responsible for processing a single product: scraping, parsing, and saving.
 */
export class ProductProcessor {
  constructor(
    private jobId: string,
    private browser: Browser,
  ) {}

  async process(product: PrismaProduct) {
    let lastError: unknown = null;
    const maxRetries = SCRAPER_MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Worker: Extracting ${product.slug} (Attempt ${attempt}/${maxRetries})...`);
        const detail = await getProductDetail(this.browser, product.slug);

        let pdfData: PDFData = {
          leadBody: DEFAULT_NA,
          healthBody: DEFAULT_NA,
          effectiveDate: DEFAULT_NA,
          pdfExpirationDate: DEFAULT_NA,
        };

        if (detail.pdfUrl && detail.pdfUrl !== DEFAULT_NA) {
          pdfData = await parseCertificate(detail.pdfUrl);
        }

        const updateData = this.mapScrapeResultToProductData(
          product,
          detail,
          pdfData,
        );

        await prisma.product.update({
          where: { id: product.id },
          data: updateData,
        });

        // Success - exit process
        return;
      } catch (err: unknown) {
        lastError = err;
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(`Worker: Attempt ${attempt}/${maxRetries} failed for ${product.slug}:`, errorMessage);
        
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, SCRAPER_RETRY_DELAY_MS));
        }
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`Worker: All ${maxRetries} attempts failed for ${product.slug}. Final error:`, errorMessage);

    try {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: "error",
          errorReason: errorMessage,
        },
      });
    } catch (dbErr: unknown) {
      console.error(`Worker: Double fault. Failed to save error status for ${product.slug}:`, dbErr);
      throw dbErr;
    }
  }

  /**
   * Maps results to DB format. Logic is strictly preserved from the original implementation.
   */
  private mapScrapeResultToProductData(
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
}

/**
 * Manages the lifecycle, batching, and concurrency of a scrape job.
 */
class JobOrchestrator {
  private lastStatusCheck = 0;
  private cachedStatus = "running";
  private limit = pLimit(3);
  private productsProcessedSinceLastRecycle = 0;

  constructor(private jobId: string) {}

  async run() {
    let hasMore = true;

    while (hasMore) {
      // 1. Fetch pending products in batches of 50
      const pendingProducts = await prisma.product.findMany({
        where: { jobId: this.jobId, status: "pending" },
        take: 50,
      });

      if (pendingProducts.length === 0) {
        hasMore = false;
        break;
      }

      // Recycle the browser if threshold is reached
      if (this.productsProcessedSinceLastRecycle >= BROWSER_RECYCLE_LIMIT) {
        console.log(`Worker: Recycle threshold reached (${this.productsProcessedSinceLastRecycle} >= ${BROWSER_RECYCLE_LIMIT}). Relaunching browser...`);
        await closeBrowser();
        this.productsProcessedSinceLastRecycle = 0;
      }

      const browser = await getBrowser();
      const processor = new ProductProcessor(this.jobId, browser);

      // 2. Process the current batch with strict concurrency
      const results = await Promise.allSettled(
        pendingProducts.map((product) =>
          this.limit(() =>
            this.processProductWithStatusCheck(processor, product),
          ),
        ),
      );

      // Check if any task failed fatally (e.g. database error)
      const rejectedResult = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (rejectedResult) {
        throw rejectedResult.reason;
      }

      this.productsProcessedSinceLastRecycle += pendingProducts.length;

      // Add pacing delay between batches if there might be more products to process
      if (pendingProducts.length === 50) {
        console.log(`Worker: Batch completed. Pacing delay of ${DELAY_BATCH_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, DELAY_BATCH_MS));
      }
    }

    await this.completeJob();
  }

  private async processProductWithStatusCheck(
    processor: ProductProcessor,
    product: PrismaProduct,
  ) {
    // Throttled Status Check (Every 5 seconds)
    const now = Date.now();
    if (now - this.lastStatusCheck > TIMEOUT_SHORT_MS) {
      const currentJob = await prisma.scrapeJob.findUnique({
        where: { id: this.jobId },
        select: { status: true },
      });
      this.cachedStatus = currentJob?.status || "failed";
      this.lastStatusCheck = now;
    }

    if (this.cachedStatus !== "running") {
      console.log(
        `Worker: Job ${this.jobId} is no longer running (${this.cachedStatus}). Aborting ${product.slug}.`,
      );

      await prisma.product.update({
        where: { id: product.id },
        data: { status: "cancelled" },
      });

      // Update job progress even for cancelled items to keep totals correct
      await this.reportProgress(this.cachedStatus);
      return;
    }

    await processor.process(product);
    await this.reportProgress(this.cachedStatus);
  }

  private async reportProgress(status: string) {
    const updatedJob = await prisma.scrapeJob.update({
      where: { id: this.jobId },
      data: { processedItems: { increment: 1 } },
      select: { processedItems: true, totalItems: true },
    });

    jobEmitter.emit(`job-${this.jobId}`, {
      status: status === "running" ? "running" : status,
      processedItems: updatedJob.processedItems,
      totalItems: updatedJob.totalItems,
    });
  }

  private async completeJob() {
    const finalJob = await prisma.scrapeJob.findUnique({
      where: { id: this.jobId },
      select: { status: true },
    });

    if (finalJob?.status === "running") {
      const completedJob = await prisma.scrapeJob.update({
        where: { id: this.jobId },
        data: { status: "completed" },
        select: { processedItems: true, totalItems: true },
      });

      jobEmitter.emit(`job-${this.jobId}`, {
        status: "completed",
        processedItems: completedJob.processedItems,
        totalItems: completedJob.totalItems,
      });
      console.log(`Worker: Job ${this.jobId} completed!`);
    } else {
      console.log(
        `Worker: Job ${this.jobId} finished with status "${finalJob?.status}". No further updates.`,
      );
    }
  }

  async handleFatalError(error: unknown) {
    try {
      console.error(`Worker: Job ${this.jobId} encountered a fatal error:`, error);
      
      const failedJob = await prisma.scrapeJob.update({
        where: { id: this.jobId },
        data: { status: "failed" },
        select: { processedItems: true, totalItems: true },
      });

      jobEmitter.emit(`job-${this.jobId}`, {
        status: "failed",
        processedItems: failedJob.processedItems,
        totalItems: failedJob.totalItems,
      });
    } catch (dbError: unknown) {
      const errorMessage = dbError instanceof Error ? dbError.message : "Unknown error";
      console.error(`Worker: Failed to update job status to 'failed' for job ${this.jobId}:`, errorMessage);
    }
  }
}

/**
 * Main entry point for the background scraper.
 * Orchestrates the job and ensures resources are cleaned up.
 */
export async function runBackgroundScrape(jobId: string) {
  const orchestrator = new JobOrchestrator(jobId);
  try {
    await orchestrator.run();
  } catch (error) {
    console.error(`Worker: Fatal error in job ${jobId}:`, error);
    await orchestrator.handleFatalError(error);
  } finally {
    console.log("Worker: Closing browser to free up memory...");
    await closeBrowser();
  }
}
