import puppeteer from "puppeteer";
import axios from "axios";
import { PDFParse } from "pdf-parse";
import { C2CProduct } from "@/types/products";

const BASE_URL = "https://c2ccertified.org";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "x-remix-request": "1",
  Referer: "https://c2ccertified.org",
};
/**
 * Fetches the list of all certified products using a headless browser to bypass Cloudflare.
 * Paginates through all available pages in the registry.
 */
export async function getProductsList(): Promise<C2CProduct[]> {
  console.log("getProductsList: Launching browser...");
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const products: C2CProduct[] = [];
    const totalPages = 53; 
    const batchSize = 5; 
    
    for (let i = 1; i <= totalPages; i += batchSize) {
      const pageBatch = [];
      for (let j = i; j < i + batchSize && j <= totalPages; j++) {
        pageBatch.push(j);
      }

      console.log(`getProductsList: Scraping Registry Pages ${pageBatch.join(', ')}...`);
      
      const results = await Promise.all(pageBatch.map(async (pageNum) => {
        const page = await browser.newPage();
        try {
          await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36");
          const url = `${BASE_URL}/certified-products?certified_products_by_date_asc[page]=${pageNum}`;
          console.log(`getProductsList: Visiting page ${pageNum}...`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
          
          const items = await page.evaluate(() => {
            const registryItems = document.querySelectorAll('a[href^="/certified-products/"]');
            const res: any[] = [];
            registryItems.forEach(item => {
              const href = item.getAttribute('href') || '';
              const slug = href.replace('/certified-products/', '');
              if (slug && !slug.includes('?') && !slug.includes('/')) {
                const titleElement = item.querySelector('h2, h3, .title');
                const companyElement = item.querySelector('.company, .manufacturer');
                res.push({
                  productName: titleElement?.textContent?.trim() || 'N/A',
                  company: companyElement?.textContent?.trim() || 'N/A',
                  slug: slug,
                  level: 'N/A',
                  standardVersion: 'N/A'
                });
              }
            });
            return res;
          });
          console.log(`getProductsList: Found ${items.length} items on page ${pageNum}`);
          return items;
        } catch (err: any) {
          console.error(`getProductsList: Error on page ${pageNum}:`, err.message);
          return [];
        } finally {
          await page.close();
        }
      }));

      results.flat().forEach(p => {
        if (!products.find(existing => existing.slug === p.slug)) {
          products.push(p);
        }
      });
    }

    console.log(`getProductsList: Successfully extracted ${products.length} product entries.`);
    return products;

  } catch (error) {
    console.error("getProductsList: GLOBAL ERROR:", error);
    throw error;
  } finally {
    console.log("getProductsList: Closing browser...");
    await browser.close();
  }
}

/**
 * Fetches detail for a single product.
 */
export async function getProductDetail(
  slug: string,
): Promise<Partial<C2CProduct>> {
  try {
    const response = await axios.get(
      `${BASE_URL}/certified-products/${slug}?_data=routes%2Fcertified-products.%24slug`,
      {
        headers: BROWSER_HEADERS,
      },
    );

    const p = response.data.product || {};
    const docs = p.documents || [];
    const mainCert =
      docs.find(
        (d: any) =>
          d.title?.toLowerCase().includes("certificate") ||
          d.fileName?.toLowerCase().includes(".pdf"),
      ) || docs[0];

    return {
      effectiveDate: p.issueDate || p.issuedAt || "N/A",
      expirationDate: p.validUntil || p.expiresAt || "N/A",
      pdfUrl: mainCert?.url || null,
    };
  } catch (error) {
    console.error(`Error fetching detail for slug ${slug}:`, error);
    return {};
  }
}

/**
 * Downloads and parses the certificate PDF.
 */
export async function parseCertificate(
  pdfUrl: string,
): Promise<{ leadBody: string; healthBody: string }> {
  try {
    if (!pdfUrl) return { leadBody: "N/A", healthBody: "N/A" };

    const fullUrl = pdfUrl.startsWith("http") ? pdfUrl : `${BASE_URL}${pdfUrl}`;
    const response = await axios.get(fullUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;

    const leadMatch = text.match(/Lead\s+Assessment\s+Body:?\s*\n*\s*(.*)/i);
    const healthMatch = text.match(/Material\s+Health\s+Assessment\s+Body:?\s*\n*\s*(.*)/i);
    
    // Fallback for multi-line labels where label and value are split
    let leadBody = leadMatch ? leadMatch[1].trim() : "N/A";
    let healthBody = healthMatch ? healthMatch[1].trim() : "N/A";

    if (leadBody === "" || leadBody === "N/A") {
      const altLeadMatch = text.match(/Lead\s+Assessment\s+Body:?\s*([\s\S]*?)(?=\n\n|\r\n\r\n|Certified|$)/i);
      if (altLeadMatch) leadBody = altLeadMatch[1].trim();
    }
    
    if (healthBody === "" || healthBody === "N/A") {
      const altHealthMatch = text.match(/Material\s+Health\s+Assessment\s+Body:?\s*([\s\S]*?)(?=\n\n|\r\n\r\n|Certified|$)/i);
      if (altHealthMatch) healthBody = altHealthMatch[1].trim();
    }

    return {
      leadBody: leadBody || "N/A",
      healthBody: healthBody || "N/A",
    };
  } catch (error) {
    console.error(`Error parsing PDF ${pdfUrl}:`, error);
    return { leadBody: "Error", healthBody: "Error" };
  }
}
