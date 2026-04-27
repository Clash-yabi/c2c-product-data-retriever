import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 });
    }

    const job = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
      include: {
        products: true, // we might just return the count or the whole array depending on frontend needs
      }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      products: job.products,
    });

  } catch (error: any) {
    console.error("Status API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
