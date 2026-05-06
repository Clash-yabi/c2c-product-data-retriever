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
      select: {
        id: true,
        status: true,
        totalItems: true,
        processedItems: true,
      }
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Haal de aantallen op per status (bijv. hoeveel success, hoeveel error)
    const stats = await prisma.product.groupBy({
      by: ['status'],
      where: { jobId },
      _count: true
    });

    const counts = {
      success: stats.find(s => s.status === 'success')?._count ?? 0,
      error: stats.find(s => s.status === 'error')?._count ?? 0,
      pending: stats.find(s => s.status === 'pending')?._count ?? 0,
      cancelled: stats.find(s => s.status === 'cancelled')?._count ?? 0,
    };

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      counts,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Status API Error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
