import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/extract/store
 * Saves the extraction results into the Node.js global context.
 * This allows the browser to subsequently perform a GET request to download the data.
 */
export async function POST(req: Request) {
  try {
    const { results } = await req.json();
    
    if (!results) {
      return NextResponse.json({ error: "No results provided" }, { status: 400 });
    }

    // Save to global context (shared across all requests in the same Node process)
    (global as any).__c2cExportResults = results;
    
    console.log(`Store API: Buffered ${results.length} results to global state.`);
    
    return NextResponse.json({ success: true, count: results.length });
  } catch (err: any) {
    console.error("Store Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
