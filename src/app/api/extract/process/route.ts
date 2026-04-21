import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { getProductDetail, parseCertificate } from '@/lib/c2c-scraper';
import { C2CProduct } from '@/types/products';

export async function POST(req: Request) {
  let browser;
  try {
    const { products } = await req.json();

    console.log(`API Process: Processing ${products.length} products.`);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const processed = [];

    for (const p of products) {
      try {
        console.log(`API Process: Extracting ${p.slug}`);

        // 1. Get data from the detail page
        const detail = await getProductDetail(browser, p.slug);

        // 2. Parse the PDF for assessment bodies and effective date
        let pdfData = {
          leadBody: 'N/A',
          healthBody: 'N/A',
          effectiveDate: 'N/A',
          pdfExpirationDate: 'N/A',
        };
        if (detail.pdfUrl) {
          pdfData = await parseCertificate(detail.pdfUrl);
        }

        processed.push({
          company: detail.productName !== 'N/A' ? detail.company : p.company,
          productName: detail.productName !== 'N/A' ? detail.productName : p.productName,
          level: detail.level || 'N/A',
          standardVersion: detail.standardVersion || 'N/A',
          effectiveDate: pdfData.effectiveDate,
          // Use detail page expiration date; fall back to PDF expiration date
          expirationDate: (detail.expirationDate && detail.expirationDate !== 'N/A')
            ? detail.expirationDate
            : pdfData.pdfExpirationDate,
          leadAssessmentBody: pdfData.leadBody,
          materialHealthAssessmentBody: pdfData.healthBody,
          pdfUrl: detail.pdfUrl || 'N/A',
        });

      } catch (err: any) {
        console.error(`API Process: Error for ${p.slug}:`, err.message);
        processed.push({
          company: p.company || 'N/A',
          productName: p.productName || 'N/A',
          level: 'Error',
          standardVersion: 'Error',
          effectiveDate: 'Error',
          expirationDate: 'Error',
          leadAssessmentBody: 'Error',
          materialHealthAssessmentBody: 'Error',
          pdfUrl: 'N/A',
        });
      }
    }

    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error('Process error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (browser) {
      console.log('API Process: Closing browser.');
      await browser.close();
    }
  }
}
