import { getBrowser } from "./browser";
import { C2CProduct, C2CProductSchema } from "@/types/products";

const BASE_URL = "https://c2ccertified.org";

const TIMEOUT_PAGE_LOAD = 60000;
const TIMEOUT_PAGINATION_WAIT = 15000;
const TIMEOUT_SELECTOR_WAIT = 10000;
const DELAY_PAGINATION_MS = 300;
const MIN_COMPANY_LENGTH = 2;

/**
 * Fetches the list of all certified products using a shared headless browser.
 */
export async function getProductsList(limit?: number): Promise<C2CProduct[]> {
  console.log("getProductsList: Getting browser instance...");
  const browser = await getBrowser();

  try {
    const products: C2CProduct[] = [];

    // Open a single page and keep it open for all pagination clicking
    const page = await browser.newPage();
    console.log("getProductsList: Loading registry page 1...");
    await page.goto(`${BASE_URL}/certified-products`, {
      waitUntil: "networkidle2",
      timeout: TIMEOUT_PAGE_LOAD,
    });
    await page
      .waitForSelector(".certified-products__pagination-page", {
        timeout: TIMEOUT_PAGINATION_WAIT,
      })
      .catch(() => null);

    const totalPages = await page.evaluate(() => {
      const pageButtons = Array.from(document.querySelectorAll(
        ".certified-products__pagination-page"
      ));
      if (pageButtons.length === 0) return 1;
      
      // Filter the buttons to find the highest page number
      // This ignores navigational arrows or "..." if they happen to share the class
      const pageNumbers = pageButtons
        .map(btn => parseInt(btn.textContent?.trim() || "", 10))
        .filter(num => !isNaN(num));
        
      return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
    });

    console.log(`getProductsList: Detected ${totalPages} total pages.`);

    // Helper: scrape all visible product slugs from the current page state
    const scrapeCurrentPage = async (pageNum: number): Promise<any[]> => {
      await page
        .waitForSelector("a[href^=\"/certified-products/\"]", { timeout: TIMEOUT_SELECTOR_WAIT })
        .catch(() => null);

      const items = await page.evaluate(() => {
        const registryItems = Array.from(
          document.querySelectorAll("a[href^=\"/certified-products/\"]")
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
            "a[href^=\"/certified-products/\"]:not(.certified-products__pagination-page)"
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
              "a[href^=\"/certified-products/\"]:not(.certified-products__pagination-page)"
            );
            return first?.getAttribute("href") !== prevSlug;
          },
          { timeout: TIMEOUT_PAGINATION_WAIT },
          firstSlugBefore
        );

        await new Promise((resolve) => setTimeout(resolve, DELAY_PAGINATION_MS));

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
    
    // Validate with Zod before returning
    const validatedProducts = finalProducts.map(p => C2CProductSchema.parse(p));

    console.log(
      `getProductsList: Successfully extracted ${validatedProducts.length} unique product entries.`
    );
    return validatedProducts;
  } catch (error) {
    console.error("getProductsList: GLOBAL ERROR:", error);
    throw error;
  } finally {
    console.log("getProductsList: Task complete.");
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
    await page.goto(url, { waitUntil: "networkidle2", timeout: TIMEOUT_PAGE_LOAD });

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
        // Use dynamically injected constants, or just literal 2 as we are inside evaluate!
        // Wait, since we can't easily pass constants into evaluate, we'll keep it 2 here.
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
      // 1. Wait for and find the "Downloads" trigger button
      await page.waitForSelector("button.certification-info__btn--download", { timeout: TIMEOUT_SELECTOR_WAIT }).catch(() => null);
      const downloadBtn = await page.$("button.certification-info__btn--download");
      
      if (downloadBtn) {
        console.log(`getProductDetail: Clicking download button for ${slug}...`);
        // Use page.evaluate for a more reliable click that bypasses some overlay issues
        await page.evaluate((btn: any) => btn.click(), downloadBtn);
        
        // 2. Wait for the sidebar to appear and contain PDF links
        // We use a more inclusive selector [href*=".pdf"] to handle potential query params
        const sidebarSelector = ".overlay-sidebar a[href*=\".pdf\"]";
        await page.waitForSelector(sidebarSelector, { timeout: TIMEOUT_SELECTOR_WAIT }).catch(() => {
          console.warn(`getProductDetail: Sidebar or PDF link not found after click for ${slug}`);
        });

        // 3. Extract the best PDF link from the sidebar
        pdfUrl = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll(".overlay-sidebar a[href*=\".pdf\"]"));
          if (links.length === 0) return null;

          // Priority 1: The green button (usually the main certificate)
          const greenBtn = links.find(l => l.classList.contains("button--green"));
          if (greenBtn) return greenBtn.getAttribute("href");

          // Priority 2: Text matching "certificate" or "full scope"
          const certLink = links.find(l => {
            const txt = l.textContent?.toLowerCase() || "";
            return txt.includes("certified® full scope") || txt.includes("certificate");
          });
          if (certLink) return certLink.getAttribute("href");

          // Priority 3: Just the first PDF link found
          return links[0].getAttribute("href");
        });
      } else {
        console.warn(`getProductDetail: Download button not found for ${slug}`);
      }
    } catch (e: any) {
      console.warn(`getProductDetail: PDF extraction failed for ${slug}:`, e.message);
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

