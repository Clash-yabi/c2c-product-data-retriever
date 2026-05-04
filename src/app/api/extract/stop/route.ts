import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    console.log(`API Stop: Stopping job ${jobId}...`);

    // Use updateMany instead of update to avoid crashing if the jobId doesn't exist
    // (e.g. if the DB was reset but the client still has an old jobId in localStorage)
    await prisma.scrapeJob.updateMany({
      where: { id: jobId },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ success: true, message: "Stop signal sent to worker" });
  } catch (error: any) {
    console.error("Stop error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
