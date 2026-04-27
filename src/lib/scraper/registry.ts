import { getBrowser } from "@/lib/browser";
import { C2CProduct, C2CProductSchema } from "@/types/products";
import {
  BASE_URL,
  TIMEOUT_PAGE_LOAD,
  TIMEOUT_PAGINATION_WAIT,
  TIMEOUT_SELECTOR_WAIT, 
  DELAY_PAGINATION_MS 
} from "./constants";

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
