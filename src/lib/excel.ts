import ExcelJS from "exceljs";
import { C2CProduct } from "../types/products";

const SHEET_NAME = "C2C Certified Products";

const HEADER_FONT_COLOR = "FFFFFFFF";
const HEADER_BG_COLOR = "FF1F6FEB";

export async function generateC2CExcelReport(results: C2CProduct[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(SHEET_NAME);

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
  headerRow.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_BG_COLOR },
  };

  // Add data
  results.forEach((row) => {
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
  return Buffer.from(buffer as any);
}
