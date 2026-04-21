import { NextResponse } from 'next/server';
import { getProductDetail, parseCertificate } from '@/lib/c2c-scraper';
import { C2CProduct } from '@/types/products';

export async function POST(req: Request) {
  try {
    const { products } = await req.json();
    
    // Process each product in the batch
    const processed = await Promise.all(products.map(async (p: C2CProduct) => {
      // 1. Get info from detail page
      const detail = await getProductDetail(p.slug);
      
      // 2. Parse PDF if URL exists
      let bodies = { leadBody: 'N/A', healthBody: 'N/A' };
      if (detail.pdfUrl) {
        bodies = await parseCertificate(detail.pdfUrl);
      }
      
      return {
        ...p,
        ...detail,
        leadAssessmentBody: bodies.leadBody,
        materialHealthAssessmentBody: bodies.healthBody
      };
    }));

    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error('Process error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
