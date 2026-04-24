import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

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

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "No results provided" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("C2C Certified Products");

    // Define columns
    worksheet.columns = [
      { header: "Company", key: "company", width: 25 },
      { header: "Product Name", key: "productName", width: 40 },
      { header: "Level", key: "level", width: 12 },
      { header: "Version", key: "standardVersion", width: 12 },
      { header: "Effective Date", key: "effectiveDate", width: 20 },
      { header: "Expiration Date", key: "expirationDate", width: 20 },
      { header: "Lead Assessment Body", key: "leadAssessmentBody", width: 35 },
      { header: "Material Health Body", key: "materialHealthAssessmentBody", width: 35 },
      { header: "Certificate URL", key: "pdfUrl", width: 60 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F6FEB" },
    };

    // Add data
    results.forEach((row: any) => {
      worksheet.addRow({
        company: row.company || "N/A",
        productName: row.productName || "N/A",
        level: row.level || "N/A",
        standardVersion: row.standardVersion || "N/A",
        effectiveDate: row.effectiveDate || "N/A",
        expirationDate: row.expirationDate || "N/A",
        leadAssessmentBody: row.leadAssessmentBody || "N/A",
        materialHealthAssessmentBody: row.materialHealthAssessmentBody || "N/A",
        pdfUrl: row.pdfUrl || "N/A",
      });
    });

    // Write to buffer
    workbook.clearThemes();
    const buffer = await workbook.xlsx.writeBuffer();
    const binaryData = Buffer.from(buffer as any);

    console.log(`Export API: Streaming ${binaryData.length} bytes back to client.`);

    // Return the file directly in the response
    return new NextResponse(binaryData, {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
