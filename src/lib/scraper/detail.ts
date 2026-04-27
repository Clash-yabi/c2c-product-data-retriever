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
      const productName = document.querySelector("h1")?.textContent?.trim() || "N/A";

      // --- 1. Company Name (Semantic -> Sibling Fallback) ---
      let company = "N/A";
      const companyEl = document.querySelector(".product-detail__company");
      if (companyEl && companyEl.textContent?.trim()) {
        company = companyEl.textContent.trim();
      } else {
        // Fallback: first non-empty sibling of h1
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
      }

      // --- 2. Level & Standard Version (Structured -> Regex Fallback) ---
      let level = "N/A";
      let standardVersion = "N/A";

      // Attempt Structured Extraction
      const certInfoBlocks = Array.from(document.querySelectorAll(".certification-info"));
      const levelBlock = certInfoBlocks.find(b => b.textContent?.toLowerCase().includes("certification level"));
      const versionBlock = certInfoBlocks.find(b => b.textContent?.toLowerCase().includes("standard version"));

      if (levelBlock) {
        level = levelBlock.querySelector(".certification-info__value")?.textContent?.trim() || "N/A";
      }
      if (versionBlock) {
        standardVersion = versionBlock.querySelector(".certification-info__value")?.textContent?.trim() || "N/A";
      }

      // Fallback: Pattern Match in Body
      if (level === "N/A" || standardVersion === "N/A") {
        const lvlMatch = body.match(/(Bronze|Silver|Gold|Platinum),\s*version\s+([\d.]+)/i);
        if (lvlMatch) {
          if (level === "N/A") level = lvlMatch[1];
          if (standardVersion === "N/A") standardVersion = lvlMatch[2];
        }
      }

      // --- 3. Dates Extraction (Standard patterns) ---
      let effectiveDate = "N/A";
      let expirationDate = "N/A";

      const effMatch = body.match(/Effective\s*Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
      const expMatch = body.match(/Expiration\s*Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);

      if (effMatch) effectiveDate = effMatch[1];
      if (expMatch) expirationDate = expMatch[1];

      // --- 4. PDF Link (Direct Selector -> URL Pattern Fallback) ---
      let pdfUrl = "N/A";
      const pdfBtn = document.querySelector("a[href*='certifications'], button[onclick*='certifications']");
      if (pdfBtn) {
        if (pdfBtn.tagName === "A") {
          pdfUrl = (pdfBtn as HTMLAnchorElement).href;
        }
      }

      // Final Fallback for PDF: scan all links
      if (pdfUrl === "N/A") {
        const allLinks = Array.from(document.querySelectorAll("a"));
        const certLink = allLinks.find(a => a.href.includes("certifications") && a.href.endsWith(".pdf"));
        if (certLink) pdfUrl = certLink.href;
      }

      return {
        productName,
        company,
        level,
        standardVersion,
        effectiveDate,
        expirationDate,
        pdfUrl,
      };
    }); 

    console.log(
      `getProductDetail: name="${detail.productName}", company="${detail.company}", level="${detail.level}", ver="${detail.standardVersion}", expires="${detail.expirationDate}"`
    );

    // --- PDF URL via Downloads button ---
    let pdfUrl: string | null = detail.pdfUrl !== "N/A" ? detail.pdfUrl : null;
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
