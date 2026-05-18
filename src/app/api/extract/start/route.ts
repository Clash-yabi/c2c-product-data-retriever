import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductsList } from "@/lib/c2c-scraper";
import { prisma } from "@/lib/prisma";
import { runBackgroundScrape } from "@/lib/background-worker";
import { initializeScrapeJob } from "@/lib/jobs";

// We definiëren precies wat we verwachten van de frontend
const startSchema = z.object({
  limit: z.number().int().positive().optional(),
  jobId: z.string().min(1, "JobId is verplicht"),
});

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (err: unknown) {
      console.error("JSON parse error:", err instanceof Error ? err.message : "Unknown error");
      return NextResponse.json({ error: "Ongeldige JSON in request body" }, { status: 400 });
    }
    
    // 1. Validatie met Zod
    const validation = startSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Ongeldige input", details: z.treeifyError(validation.error) },
        { status: 400 }
      );
    }

    const { limit, jobId: clientJobId } = validation.data;

    // 2. Maak de job DIRECT aan in de database
    const job = await initializeScrapeJob(clientJobId, 0);

    if (!job) {
      return NextResponse.json(
        { message: "Job was cancelled before start", jobId: clientJobId },
        { status: 200 },
      );
    }

    // 3. Haal de registry op
    console.log("API Start: Fetching registry list...");
    let products;
    try {
      products = await getProductsList(limit);
      if (!products || products.length === 0) {
        await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: "failed" } });
        return NextResponse.json(
          { error: "No products found in registry" },
          { status: 404 },
        );
      }
    } catch (err: unknown) {
      await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: "failed" } });
      throw err;
    }

    // Update de job nu we weten hoeveel producten we hebben
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { totalItems: products.length }
    });

    // 4. Insert all products as "pending"
    const productData = products.map((p) => ({
      jobId: job.id,
      slug: p.slug,
      productName: p.productName,
      company: p.company,
      level: p.level,
      standardVersion: p.standardVersion,
      status: "pending",
    }));

    await prisma.product.createMany({
      data: productData,
    });

    console.log(
      `API Start: Job ${job.id} created with ${products.length} pending items. Kicking off worker...`,
    );

    // 5. Fire and forget!
    runBackgroundScrape(job.id).catch((err: unknown) => {
      console.error(`Background worker failed for Job ${job.id}:`, err instanceof Error ? err.message : String(err));
    });

    // 6. Return de jobId naar de frontend
    return NextResponse.json(
      {
        message: "Scraping job started successfully in the background",
        jobId: job.id,
        totalExpected: products.length,
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Interne server fout";
    console.error("API Error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
