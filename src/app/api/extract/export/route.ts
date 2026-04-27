import { NextResponse } from "next/server";
import { generateC2CExcelReport } from "@lib/excel";

export const runtime = "nodejs";

/**
 * POST /api/extract/export
 * Generates an Excel file from results and streams it directly back to the client.
 * This is 100% stateless and works perfectly in Serverless environments like Vercel.
 */
export async function POST(req: Request) {
  try {
    const { results } = await req.json();

    console.log(`Export API: Generating Excel for ${results?.length ?? 0} results.`);

    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "No results provided" }, { status: 400 });
    }

    const binaryData = await generateC2CExcelReport(results);

    console.log(`Export API: Streaming ${binaryData.length} bytes back to client.`);

    // Return the file directly in the response
    return new NextResponse(binaryData as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="C2C_Certified_Report.xlsx"',
        "Content-Length": binaryData.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

  } catch (error: any) {
    console.error("Export API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
