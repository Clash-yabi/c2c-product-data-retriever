import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { saveTicket, getTicket, removeTicket } from "@/lib/export-store";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/extract/export
 * Creates a temporary download ticket and stores the Excel buffer in memory.
 */
export async function POST(req: Request) {
  try {
    const { results } = await req.json();

    console.log(`Export POST: Generating ticket for ${results?.length ?? 0} results.`);

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

     workbook.clearThemes(); // Avoid potential corruption bugs in some versions of exceljs
    const buffer = await workbook.xlsx.writeBuffer();
    const binaryData = Buffer.from(buffer as any);

    console.log(`Export POST: Returning binary for ${results.length} results (${binaryData.length} bytes).`);

    return new NextResponse(binaryData, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="C2C_Certified_Products.xlsx"',
        "Content-Length": binaryData.length.toString(),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/extract/export
 * Consumes a download ticket and returns the binary stream.
 * browsers trust GET requests for downloads much more than POST responses.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const ticket = getTicket(token);
    if (!ticket) {
      return new Response("Ticket expired or not found", { status: 404 });
    }

    console.log(`Export GET: Delivering binary for ticket ${token} (${ticket.buffer.length} bytes)`);

    // Note: Ticket is NOT removed immediately. 
    // It will be cleaned up by the 5-minute interval in export-store.ts.
    // This handles cases where browsers "double-fetch" or use background threads.

    return new Response(ticket.buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="C2C_Certified_Products.xlsx"',
        "Content-Length": ticket.buffer.length.toString(),
        "X-Content-Type-Options": "nosniff", // Security header
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export GET Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
