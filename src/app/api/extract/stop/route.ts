import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "Job Id is required" },
        { status: 400 },
      );
    }
    console.log(`API Stop: Stopping job ${jobId}...`);

    await prisma.scrapeJob.upsert({
      where: { id: jobId },
      update: { status: "cancelled" },
      create: {
        id: jobId,
        status: "cancelled",
      },
    });

    await prisma.product.updateMany({
      where: {
        jobId: jobId,
        status: "pending", // Alleen de producten die nog moesten gebeuren
      },
      data: {
        status: "cancelled",
      },
    });

    return NextResponse.json({
      message: "Job stopped successfully",
      jobId: jobId,
    });
  } catch (error: any) {
    console.log("STOP ERROR:", error);
    return NextResponse.json(
      {
        error: error.message || "Record to update not found",
      },
      { status: 500 },
    );
  }
}
