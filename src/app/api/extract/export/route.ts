import { NextResponse } from "next/server";
import { generateC2CExcelReport } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { Product } from "@prisma/client";

export const runtime = "nodejs";

/**
 * GET /api/extract/export?jobId=...
 * Pulls products from the database for the given job,
 * generates an Excel file, and streams it back to the client.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // Fetch successful products for this job
    const dbProducts = await prisma.product.findMany({
      where: {
        jobId: jobId,
        status: "success",
      },
    });

    console.log(
      `Export API: Generating Excel for ${dbProducts.length} results from job ${jobId}.`,
    );

    if (dbProducts.length === 0) {
      return NextResponse.json(
        { error: "No successful products found for this job" },
        { status: 404 },
      );
    }

    // INDUSTRY STANDARD: Map Database Models to Domain Models
    // This removes 'null' and ensures the Excel generator gets exactly what it needs.
    const results = dbProducts.map((p: Product) => ({
      company: p.company ?? "N/A",
      productName: p.productName ?? "N/A",
      level: p.level ?? "N/A",
      standardVersion: p.standardVersion ?? "N/A",
      slug: p.slug,
      effectiveDate: p.effectiveDate ?? "N/A",
      expirationDate: p.expirationDate ?? "N/A",
      leadAssessmentBody: p.leadAssessmentBody ?? "N/A",
      materialHealthAssessmentBody: p.materialHealthAssessmentBody ?? "N/A",
      pdfUrl: p.pdfUrl ?? "N/A",
    }));

    const binaryData = await generateC2CExcelReport(results);

    console.log(
      `Export API: Streaming ${binaryData.length} bytes back to client.`,
    );

    // Return the file directly in the response
    return new NextResponse(binaryData as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="C2C_Certified_Report.xlsx"',
        "Content-Length": binaryData.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Export API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
