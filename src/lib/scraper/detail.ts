import { C2CProduct } from "@/types/products";
import { 
  BASE_URL, 
  TIMEOUT_PAGE_LOAD, 
  TIMEOUT_SELECTOR_WAIT 
} from "./constants";

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
