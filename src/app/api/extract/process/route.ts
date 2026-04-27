import { NextResponse } from "next/server";
import { C2CProductSchema, C2CProduct } from "@/types/products";
import { processProductBatch } from "@/lib/product-processor";

export async function POST(req: Request) {
  try {
    const { products: rawProducts } = await req.json();
    
    // Validate input with Zod
    if (!rawProducts || !Array.isArray(rawProducts)) {
      return NextResponse.json({ error: "Invalid payload: 'products' array is required" }, { status: 400 });
    }

    const products: C2CProduct[] = rawProducts.map((p: unknown) => C2CProductSchema.parse(p));

    console.log(`API Process: Processing ${products.length} products in parallel.`);

    const processed = await processProductBatch(products);

    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error("Process error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  } finally {
    console.log("API Process: Task complete.");
  }
}
