import { NextResponse } from 'next/server';
import { getProductsList } from '@/lib/c2c-scraper';

export async function POST() {
  try {
    const products = await getProductsList();
    return NextResponse.json({ products });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
