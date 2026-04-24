import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { getProductDetail } from '@/lib/c2c-scraper';
import { parseCertificate } from '@/lib/pdf-parser';
import { C2CProductSchema, C2CProduct } from '@/types/products';

export async function POST(req: Request) {
  try {
    const { products: rawProducts } = await req.json();
    
    // Validate input with Zod
    const products: C2CProduct[] = rawProducts.map((p: any) => C2CProductSchema.parse(p));

    console.log(`API Process: Processing ${products.length} products in parallel.`);

    const browser = await getBrowser();

    // Define the processing logic for a single product
    const processSingleProduct = async (p: C2CProduct) => {
      try {
        console.log(`API Process: Starting extraction for ${p.slug}`);

        // 1. Get data from the detail page
        const detail = await getProductDetail(browser, p.slug);

        // 2. Parse the PDF if available
        let pdfData = {
          leadBody: 'N/A',
          healthBody: 'N/A',
          effectiveDate: 'N/A',
          pdfExpirationDate: 'N/A',
        };
        
        if (detail.pdfUrl && detail.pdfUrl !== 'N/A') {
          pdfData = await parseCertificate(detail.pdfUrl);
        }

        return {
          company: (detail.productName !== 'N/A' && detail.company) ? detail.company : p.company,
          productName: (detail.productName !== 'N/A') ? detail.productName : p.productName,
          level: detail.level || 'N/A',
          standardVersion: detail.standardVersion || 'N/A',
          effectiveDate: pdfData.effectiveDate,
          expirationDate: (detail.expirationDate && detail.expirationDate !== 'N/A')
            ? detail.expirationDate
            : pdfData.pdfExpirationDate,
          leadAssessmentBody: pdfData.leadBody,
          materialHealthAssessmentBody: pdfData.healthBody,
          pdfUrl: detail.pdfUrl || 'N/A',
        };
      } catch (err: any) {
        console.error(`API Process: Error for ${p.slug}:`, err.message);
        return {
          company: p.company || 'N/A',
          productName: p.productName || 'N/A',
          level: 'Error',
          standardVersion: 'Error',
          effectiveDate: 'Error',
          expirationDate: 'Error',
          leadAssessmentBody: 'Error',
          materialHealthAssessmentBody: 'Error',
          pdfUrl: 'N/A',
        };
      }
    };

    // Execute all products in the batch at the same time
    // Since our batch size is 10, processing all 10 in parallel is generally safe.
    const processed = await Promise.all(products.map(p => processSingleProduct(p)));

    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error('Process error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    console.log('API Process: Task complete.');
  }
}
