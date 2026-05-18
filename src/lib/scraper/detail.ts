import { Browser } from "puppeteer";
import { C2CProduct } from "@/types/products";
import {
  BASE_URL,
  TIMEOUT_PAGE_LOAD,
  TIMEOUT_SELECTOR_WAIT,
} from "./constants";

/**
 * Fetches details for a single product page using Puppeteer.
 * Extracts: productName, company, level, standardVersion, expirationDate, pdfUrl
 */
export async function getProductDetail(
  browser: Browser,
  slug: string,
): Promise<Partial<C2CProduct>> {
  const page = await browser.newPage();
  try {
    const url = `${BASE_URL}/certified-products/${slug}`;
    console.log(`getProductDetail: Visiting ${url}...`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: TIMEOUT_PAGE_LOAD,
    });

    const detail = await page.evaluate(() => {
      // --- Helper Functions in Browser Context ---
      const helpers = {
        getProductName(): string {
          return document.querySelector("h1")?.textContent?.trim() || "N/A";
        },

        getCompany(productName: string): string {
          const companyEl = document.querySelector(".product-hero__subtitle");
          if (companyEl && companyEl.textContent?.trim()) {
            return companyEl.textContent.trim();
          }

          // Fallback: first non-empty sibling of h1
          const h1 = document.querySelector("h1");
          let sibling = h1?.nextElementSibling;
          while (sibling) {
            const t = sibling.textContent?.trim();
            if (t && t.length > 2 && t !== productName) {
              return t;
            }
            sibling = sibling.nextElementSibling;
          }
          return "N/A";
        },

        parseLevelAndVersion(value: string): { lvl: string; ver: string } {
          let lvl = "N/A";
          let ver = "N/A";

          const levelMatch = value.match(/(Bronze|Silver|Gold|Platinum)/i);
          const versionMatch = value.match(/version\s+([\d.]+)/i);

          if (levelMatch) {
            lvl = levelMatch[1].charAt(0).toUpperCase() + levelMatch[1].slice(1).toLowerCase();
          }
          if (versionMatch) {
            ver = versionMatch[1];
          }

          // If regex fails, fallback to old split logic
          if (lvl === "N/A" && value.includes(", version ")) {
            const parts = value.split(", version ");
            lvl = parts[0].trim();
            ver = parts[1].trim();
          }

          return { lvl, ver };
        },

        getCertificates(bodyText: string) {
          let level = "N/A";
          let standardVersion = "N/A";
          let fullScopeLevel = "N/A";
          let fullScopeVersion = "N/A";
          let materialHealthLevel = "N/A";
          let materialHealthVersion = "N/A";
          let circularityLevel = "N/A";
          let circularityVersion = "N/A";

          const certBlocks = Array.from(
            document.querySelectorAll(
              ".certification-info__item, .certification-info__block, .certification-achievement__item, .certification-achievement__block",
            ),
          );

          // Fallback: search for any div that looks like a cert block if we found nothing
          if (certBlocks.length === 0) {
            const allDivs = Array.from(document.querySelectorAll("div, section"));
            const potentialBlocks = allDivs.filter((d) =>
              d.textContent?.includes("C2C Certified®"),
            );
            certBlocks.push(...potentialBlocks);
          }

          certBlocks.forEach((block) => {
            const text = block.textContent?.trim() || "";
            if (!text.includes("C2C Certified®")) return;

            // Try to find the label and value within the block
            const label =
              block
                .querySelector(
                  ".certification-info__label, .certification-achievement__label, h4, span",
                )
                ?.textContent?.toLowerCase() || text.toLowerCase();
            
            const value =
              block
                .querySelector(
                  ".certification-info__value, .certification-achievement__value, p, strong",
                )
                ?.textContent?.trim() || text;

            const { lvl, ver } = helpers.parseLevelAndVersion(value);

            if (label.includes("full scope")) {
              fullScopeLevel = lvl;
              fullScopeVersion = ver;
              if (level === "N/A") {
                level = lvl;
                standardVersion = ver;
              }
            } else if (label.includes("material health")) {
              materialHealthLevel = lvl;
              materialHealthVersion = ver;
              if (level === "N/A") {
                level = lvl;
                standardVersion = ver;
              }
            } else if (label.includes("circularity") || label.includes("circular economy")) {
              circularityLevel = lvl;
              circularityVersion = ver;
            }
          });

          // Fallback: Pattern Match in Body if still N/A
          if (level === "N/A" || standardVersion === "N/A") {
            const lvlMatch = bodyText.match(
              /(Bronze|Silver|Gold|Platinum),\s*version\s+([\d.]+)/i,
            );
            if (lvlMatch) {
              if (level === "N/A") level = lvlMatch[1];
              if (standardVersion === "N/A") standardVersion = lvlMatch[2];
            }
          }

          return {
            level,
            standardVersion,
            fullScopeLevel,
            fullScopeVersion,
            materialHealthLevel,
            materialHealthVersion,
            circularityLevel,
            circularityVersion,
          };
        },

        getDates(bodyText: string) {
          let effectiveDate = "N/A";
          let expirationDate = "N/A";

          const effMatch = bodyText.match(
            /(?:Effective\s*Date|Date\s*of\s*Issue):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
          );
          const expMatch = bodyText.match(
            /(?:Expiration\s*Date|Valid\s*Until):\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
          );

          if (effMatch) effectiveDate = effMatch[1];
          if (expMatch) expirationDate = expMatch[1];

          return { effectiveDate, expirationDate };
        },

        getDirectPdfUrl(): string {
          let pdfUrl = "N/A";
          const pdfBtn = document.querySelector(
            "a[href*='certifications'], a[href*='material-health'], button[onclick*='certifications']",
          );
          if (pdfBtn) {
            if (pdfBtn.tagName === "A") {
              pdfUrl = (pdfBtn as HTMLAnchorElement).href;
            }
          }

          // Final Fallback for PDF: scan all links
          if (pdfUrl === "N/A") {
            const allLinks = Array.from(document.querySelectorAll("a"));
            const certLink = allLinks.find(
              (a) =>
                (a.href.includes("certifications") ||
                  a.href.includes("material-health")) &&
                a.href.endsWith(".pdf"),
            );
            if (certLink) pdfUrl = certLink.href;
          }

          return pdfUrl;
        }
      };

      // --- Main Extraction Execution ---
      const bodyText = document.body.innerText;
      const productName = helpers.getProductName();
      const company = helpers.getCompany(productName);
      const certs = helpers.getCertificates(bodyText);
      const dates = helpers.getDates(bodyText);
      const pdfUrl = helpers.getDirectPdfUrl();

      return {
        productName,
        company,
        ...certs,
        ...dates,
        pdfUrl,
      };
    });

    console.log(
      `getProductDetail: name="${detail.productName}", company="${detail.company}", level="${detail.level}", ver="${detail.standardVersion}", expires="${detail.expirationDate}"`,
    );

    // --- PDF URL via Downloads button ---
    let pdfUrl: string | null = detail.pdfUrl !== "N/A" ? detail.pdfUrl : null;
    try {
      // 1. Wait for and find the "Downloads" trigger button
      await page
        .waitForSelector("button.certification-info__btn--download", {
          timeout: TIMEOUT_SELECTOR_WAIT,
        })
        .catch(() => null);
      const downloadBtn = await page.$(
        "button.certification-info__btn--download",
      );

      if (downloadBtn) {
        console.log(
          `getProductDetail: Clicking download button for ${slug}...`,
        );
        // Use page.evaluate for a more reliable click that bypasses some overlay issues
        await page.evaluate((btn: HTMLElement) => btn.click(), downloadBtn);

        // 2. Wait for the sidebar to appear and contain PDF links
        // We use a more inclusive selector [href*=".pdf"] to handle potential query params
        const sidebarSelector = '.overlay-sidebar a[href*=".pdf"]';
        await page
          .waitForSelector(sidebarSelector, { timeout: TIMEOUT_SELECTOR_WAIT })
          .catch(() => {
            console.warn(
              `getProductDetail: Sidebar or PDF link not found after click for ${slug}`,
            );
          });

        // 3. Extract the best PDF link from the sidebar
        pdfUrl = await page.evaluate(() => {
          const links = Array.from(
            document.querySelectorAll('.overlay-sidebar a[href*=".pdf"]'),
          );
          if (links.length === 0) return null;

          // Priority 1: The green button (usually the main certificate)
          const greenBtn = links.find((l) =>
            l.classList.contains("button--green"),
          );
          if (greenBtn) return greenBtn.getAttribute("href");

          // Priority 2: Text matching "certificate", "full scope" or "material health"
          const certLink = links.find((l) => {
            const txt = l.textContent?.toLowerCase() || "";
            return (
              txt.includes("certified® full scope") ||
              txt.includes("material health") ||
              txt.includes("certificate")
            );
          });
          if (certLink) return certLink.getAttribute("href");

          // Priority 3: Just the first PDF link found
          return links[0].getAttribute("href");
        });
      } else {
        console.warn(`getProductDetail: Download button not found for ${slug}`);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      console.warn(
        `getProductDetail: PDF extraction failed for ${slug}:`,
        errorMessage,
      );
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
