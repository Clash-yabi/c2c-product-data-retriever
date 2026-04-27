import { NextResponse } from 'next/server';
import { getProductsList } from '@lib/c2c-scraper';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit ? parseInt(body.limit, 10) : undefined;
    
    const products = await getProductsList(limit);
    return NextResponse.json({ products });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
