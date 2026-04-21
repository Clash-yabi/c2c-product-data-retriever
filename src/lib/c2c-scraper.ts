import puppeteer from "puppeteer";
import axios from "axios";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { C2CProduct } from "@/types/products";

const BASE_URL = "https://c2ccertified.org";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

/**
 * Fetches the list of all certified products using a headless browser.
 * IMPORTANT: This website uses client-side pagination — the URL never changes!
 * We keep ONE page open and click the page buttons to navigate between pages.
 */
export async function getProductsList(limit?: number): Promise<C2CProduct[]> {
  console.log("getProductsList: Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ],
  });

  try {
    const products: C2CProduct[] = [];

    // Open a single page and keep it open for all pagination clicking
    const page = await browser.newPage();
    console.log("getProductsList: Loading registry page 1...");
    await page.goto(`${BASE_URL}/certified-products`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page
      .waitForSelector(".certified-products__pagination-page", {
        timeout: 15000,
      })
      .catch(() => null);

    const totalPages = await page.evaluate(() => {
      const pageButtons = document.querySelectorAll(
        ".certified-products__pagination-page"
      );
      if (pageButtons.length === 0) return 1;
      const lastPageButton = pageButtons[pageButtons.length - 1];
      return parseInt(lastPageButton.textContent?.trim() || "1", 10);
    });

    console.log(`getProductsList: Detected ${totalPages} total pages.`);

    // Helper: scrape all visible product slugs from the current page state
    const scrapeCurrentPage = async (pageNum: number): Promise<any[]> => {
      await page
        .waitForSelector('a[href^="/certified-products/"]', { timeout: 10000 })
        .catch(() => null);

      const items = await page.evaluate(() => {
        const registryItems = Array.from(
          document.querySelectorAll('a[href^="/certified-products/"]')
        );
        const res: any[] = [];
        registryItems.forEach((item) => {
          const href = item.getAttribute("href") || "";
          const slug = href.replace("/certified-products/", "");
          if (
            slug &&
            !slug.includes("?") &&
            !slug.includes("/") &&
            !item.classList.contains("certified-products__pagination-page")
          ) {
            res.push({
              productName: "N/A",
              company: "N/A",
              slug,
              level: "N/A",
              standardVersion: "N/A",
            });
          }
        });
        return res;
      });

      console.log(`getProductsList: Page ${pageNum} returned ${items.length} products.`);
      return items;
    };

    // Process page 1
    const page1Items = await scrapeCurrentPage(1);
    page1Items.forEach((p) => {
      if (!products.find((e) => e.slug === p.slug)) products.push(p);
    });

    // Click through pages 2..N using the pagination buttons
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      if (limit && products.length >= limit) break;

      console.log(`getProductsList: Clicking to page ${pageNum}...`);

      try {
        const firstSlugBefore = await page.evaluate(() => {
          const first = document.querySelector(
            'a[href^="/certified-products/"]:not(.certified-products__pagination-page)'
          );
          return first?.getAttribute("href") || "";
        });

        const clicked = await page.evaluate((targetPage: number) => {
          const buttons = Array.from(
            document.querySelectorAll(".certified-products__pagination-page")
          );
          const btn = buttons.find(
            (b) => b.textContent?.trim() === String(targetPage)
          ) as HTMLElement;
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        }, pageNum);

        if (!clicked) {
          console.warn(
            `getProductsList: Could not find button for page ${pageNum}, stopping.`
          );
          break;
        }

        await page.waitForFunction(
          (prevSlug: string) => {
            const first = document.querySelector(
              'a[href^="/certified-products/"]:not(.certified-products__pagination-page)'
            );
            return first?.getAttribute("href") !== prevSlug;
          },
          { timeout: 15000 },
          firstSlugBefore
        );

        await new Promise((resolve) => setTimeout(resolve, 300));

        const items = await scrapeCurrentPage(pageNum);
        items.forEach((p) => {
          if (limit && products.length >= limit) return;
          if (!products.find((e) => e.slug === p.slug)) products.push(p);
        });

        console.log(`getProductsList: Total collected: ${products.length}`);
      } catch (err: any) {
        console.error(
          `getProductsList: Error clicking to page ${pageNum}:`,
          err.message
        );
        break;
      }
    }

    await page.close();

    const finalProducts = limit ? products.slice(0, limit) : products;
    console.log(
      `getProductsList: Successfully extracted ${finalProducts.length} unique product entries.`
    );
    return finalProducts;
  } catch (error) {
    console.error("getProductsList: GLOBAL ERROR:", error);
    throw error;
  } finally {
    console.log("getProductsList: Closing browser...");
    await browser.close();
  }
}

/**
 * Fetches details for a single product page using Puppeteer.
 * Extracts: productName, company, level, standardVersion, expirationDate, pdfUrl
 */
export async function getProductDetail(
  browser: any,
  slug: string
): Promise<Partial<C2CProduct>> {
  const page = await browser.newPage();
  try {
    const url = `${BASE_URL}/certified-products/${slug}`;
    console.log(`getProductDetail: Visiting ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const detail = await page.evaluate(() => {
      const body = document.body.innerText;

      // --- Product Name ---
      const productName =
        document.querySelector("h1")?.textContent?.trim() || "N/A";

      // --- Company: first non-empty sibling of h1, usually uppercase ---
      let company = "N/A";
      const h1 = document.querySelector("h1");
      let sibling = h1?.nextElementSibling;
      while (sibling) {
        const t = sibling.textContent?.trim();
        if (t && t.length > 2 && t !== productName) {
          company = t;
          break;
        }
        sibling = sibling.nextElementSibling;
      }

      // --- Level & Standard Version from "Bronze, version 4.0" pattern ---
      let level = "N/A";
      let standardVersion = "N/A";
      const lvlMatch = body.match(
        /(Bronze|Silver|Gold|Platinum),\s*version\s+([\d.]+)/i
      );
      if (lvlMatch) {
        level = lvlMatch[1];
        standardVersion = lvlMatch[2];
      }

      // --- Expiration Date: look for "Valid Until" label ---
      let expirationDate = "N/A";
      const validUntilMatch = body.match(
        /Valid\s+Until\s*\n\s*([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+ \d{4})/i
      );
      if (validUntilMatch) {
        expirationDate = validUntilMatch[1].trim();
      }

      return { productName, company, level, standardVersion, expirationDate };
    });

    console.log(
      `getProductDetail: name="${detail.productName}", company="${detail.company}", level="${detail.level}", ver="${detail.standardVersion}", expires="${detail.expirationDate}"`
    );

    // --- PDF URL via Downloads button ---
    let pdfUrl: string | null = null;
    try {
      const downloadBtn = await page.$(
        "button.certification-info__btn--download"
      );
      if (downloadBtn) {
        await downloadBtn.click();
        await page
          .waitForSelector('.overlay-sidebar a[href$=".pdf"]', {
            timeout: 8000,
          })
          .catch(() => null);

        pdfUrl = await page.evaluate(() => {
          const links = Array.from(
            document.querySelectorAll('.overlay-sidebar a[href$=".pdf"]')
          );
          const certLink = links.find(
            (l) =>
              l.textContent?.toLowerCase().includes("certified® full scope") ||
              l.textContent?.toLowerCase().includes("certificate") ||
              l.classList.contains("button--green")
          );
          return certLink
            ? certLink.getAttribute("href")
            : links[0]?.getAttribute("href") || null;
        });
      }
    } catch (e) {
      console.warn(`getProductDetail: Could not find PDF for ${slug}`);
    }

    console.log(`getProductDetail: PDF: ${pdfUrl ? "Found" : "N/A"}`);

    return {
      ...detail,
      pdfUrl: pdfUrl
        ? pdfUrl.startsWith("http")
          ? pdfUrl
          : `${BASE_URL}${pdfUrl}`
        : null,
    };
  } catch (error) {
    console.error(`getProductDetail: Error for ${slug}:`, error);
    return {};
  } finally {
    await page.close();
  }
}

/**
 * Downloads and parses the certificate PDF using pdfjs-dist.
 * Extracts: effectiveDate, expirationDate (backup), leadBody, healthBody
 */
export async function parseCertificate(pdfUrl: string): Promise<{
  leadBody: string;
  healthBody: string;
  effectiveDate: string;
  pdfExpirationDate: string;
}> {
  const empty = {
    leadBody: "N/A",
    healthBody: "N/A",
    effectiveDate: "N/A",
    pdfExpirationDate: "N/A",
  };

  try {
    if (!pdfUrl || pdfUrl === "N/A") return empty;

    const response = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      timeout: 20000,
    });

    const buffer = new Uint8Array(response.data);

    try {
      const loadingTask = pdfjs.getDocument({
        data: buffer,
      });

      const doc = await loadingTask.promise;
      let text = "";

      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const content = await pg.getTextContent();
        // Join with a space to create a flat searchable string
        const pageText = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        text += pageText + " ";
      }

      console.log(
        `parseCertificate: Raw PDF text (first 400 chars): ${text.substring(0, 400)}`
      );

      // ---- Lead Assessment Body ----
      // Stop BEFORE "Material Health" to avoid greediness
      const leadMatch = text.match(
        /Lead\s+Assessment\s+Body\s+([\s\S]*?)(?=Material\s+Health|Effective\s+Date|Expiration\s+Date|$)/i
      );
      const leadBody = cleanField(leadMatch?.[1]);

      // ---- Material Health Assessment Body ----
      // Stop BEFORE "Effective Date" 
      const healthMatch = text.match(
        /Material\s+Health\s+Assessment\s+Body\s+([\s\S]*?)(?=Effective\s+Date|Expiration\s+Date|$)/i
      );
      const healthBody = cleanField(healthMatch?.[1]);

      // ---- Effective Date ----
      const effectiveDateMatch = text.match(
        /Effective\s+Date\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
      );
      const effectiveDate = effectiveDateMatch
        ? effectiveDateMatch[1].trim()
        : "N/A";

      // ---- Expiration Date (from PDF, as backup) ----
      const expirationDateMatch = text.match(
        /Expiration\s+Date\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
      );
      const pdfExpirationDate = expirationDateMatch
        ? expirationDateMatch[1].trim()
        : "N/A";

      console.log(
        `parseCertificate: lead="${leadBody}", health="${healthBody}", effective="${effectiveDate}", expiry="${pdfExpirationDate}"`
      );

      return { leadBody, healthBody, effectiveDate, pdfExpirationDate };
    } catch (pdfErr: any) {
      console.error(`parseCertificate: PDFjs error for ${pdfUrl}:`, pdfErr.message);
      return empty;
    }
  } catch (error: any) {
    console.error(`parseCertificate: Fetch error for ${pdfUrl}:`, error.message);
    return empty;
  }
}

/** Trim and remove known noise from extracted PDF text fields */
function cleanField(raw: string | undefined): string {
  if (!raw) return "N/A";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 2) return "N/A";
  return cleaned;
}
