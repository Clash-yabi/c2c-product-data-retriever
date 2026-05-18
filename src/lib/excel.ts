import ExcelJS from "exceljs";
import { C2CProduct } from "../types/products";
import { DEFAULT_NA } from "./scraper/constants";

const SHEET_NAME = "C2C Certified Products";

const HEADER_FONT_COLOR = "FFFFFFFF";
const HEADER_BG_COLOR = "FF1F6FEB";

export async function generateC2CExcelReport(
  results: C2CProduct[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(SHEET_NAME);

  // Define columns
  worksheet.columns = [
    { header: "Company", key: "company", width: 25 },
    { header: "Product Name", key: "productName", width: 40 },
    { header: "Primary Level", key: "level", width: 15 },
    { header: "Primary Version", key: "standardVersion", width: 15 },
    { header: "Effective Date", key: "effectiveDate", width: 20 },
    { header: "Expiration Date", key: "expirationDate", width: 20 },
    { header: "Lead Assessment Body", key: "leadAssessmentBody", width: 35 },
    {
      header: "Material Health Body",
      key: "materialHealthAssessmentBody",
      width: 35,
    },
    { header: "Certificate URL", key: "pdfUrl", width: 60 },
    { header: "Full Scope Level", key: "fullScopeLevel", width: 20 },
    { header: "Full Scope Version", key: "fullScopeVersion", width: 20 },
    { header: "Material Health Level", key: "materialHealthLevel", width: 20 },
    { header: "Material Health Version", key: "materialHealthVersion", width: 20 },
    { header: "Circularity Level", key: "circularityLevel", width: 20 },
    { header: "Circularity Version", key: "circularityVersion", width: 20 },
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
      company: row.company || DEFAULT_NA,
      productName: row.productName || DEFAULT_NA,
      level: row.level || DEFAULT_NA,
      standardVersion: row.standardVersion || DEFAULT_NA,
      effectiveDate: row.effectiveDate || DEFAULT_NA,
      expirationDate: row.expirationDate || DEFAULT_NA,
      leadAssessmentBody: row.leadAssessmentBody || DEFAULT_NA,
      materialHealthAssessmentBody:
        row.materialHealthAssessmentBody || DEFAULT_NA,
      pdfUrl: row.pdfUrl || DEFAULT_NA,
      fullScopeLevel: row.fullScopeLevel || DEFAULT_NA,
      fullScopeVersion: row.fullScopeVersion || DEFAULT_NA,
      materialHealthLevel: row.materialHealthLevel || DEFAULT_NA,
      materialHealthVersion: row.materialHealthVersion || DEFAULT_NA,
      circularityLevel: row.circularityLevel || DEFAULT_NA,
      circularityVersion: row.circularityVersion || DEFAULT_NA,
    });
  });

  // Write to buffer
  workbook.clearThemes();
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
