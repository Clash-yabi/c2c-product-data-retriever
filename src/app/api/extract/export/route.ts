import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const { results } = await req.json();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('C2C Certified Products');

    // Define columns
    worksheet.columns = [
      { header: 'Company', key: 'company', width: 30 },
      { header: 'Product Name', key: 'productName', width: 40 },
      { header: 'Level', key: 'level', width: 15 },
      { header: 'Standard Version', key: 'standardVersion', width: 20 },
      { header: 'Effective Date', key: 'effectiveDate', width: 15 },
      { header: 'Expiration Date', key: 'expirationDate', width: 15 },
      { header: 'Lead Assessment Body', key: 'leadAssessmentBody', width: 30 },
      { header: 'Material Health Assessment Body', key: 'materialHealthAssessmentBody', width: 30 },
      { header: 'Certificate URL', key: 'pdfUrl', width: 50 },
    ];

    // Style the header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F6FEB' }
    };

    // Add rows
    worksheet.addRows(results);

    // Save to file
    const fileName = `c2c-report-${Date.now()}.xlsx`;
    const exportPath = path.join(process.cwd(), 'public', 'exports', fileName);
    
    await workbook.xlsx.writeFile(exportPath);

    return NextResponse.json({ downloadUrl: `/exports/${fileName}` });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
