import axios from "axios";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFData } from "@/types/products";
import { DEFAULT_NA } from "@/lib/scraper/constants";

const TIMEOUT_PDF_FETCH = 20000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

/** Trim and remove known noise from extracted PDF text fields */
function cleanField(raw: string | undefined): string {
  if (!raw) return DEFAULT_NA;
  
  // Remove known noise from signature blocks that often gets interleaved
  let cleaned = raw
    .replace(/Executive\s+Director/gi, "")
    .replace(/Elwyn\s+Grainger-Jones/gi, "")
    .replace(/Cradle\s+to\s+Cradle\s+Products\s+Innovation\s+Institute/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) return DEFAULT_NA;
  return cleaned;
}

/**
 * Downloads and parses the certificate PDF using pdfjs-dist.
 * Extracts: effectiveDate, expirationDate (backup), leadBody, healthBody
 */
export async function parseCertificate(pdfUrl: string): Promise<PDFData> {
  const empty = {
    leadBody: DEFAULT_NA,
    healthBody: DEFAULT_NA,
    effectiveDate: DEFAULT_NA,
    pdfExpirationDate: DEFAULT_NA,
  };

  try {
    if (!pdfUrl || pdfUrl === DEFAULT_NA) return empty;

    const response = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      timeout: TIMEOUT_PDF_FETCH,
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
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        text += pageText + " ";
      }

      console.log(
        `parseCertificate: Raw PDF text (first 400 chars): ${text.substring(0, 400)}`
      );

      // ---- Lead Assessment Body ----
      const leadRegex = /Lead\s+Assessment\s+Body\s+([\s\S]*?)(?=Material\s+Health|Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Phases\s+and\s+Processes|PRODUCT\s+OPTIMIZATION|PERCENTAGE\s+ASSESSED|ASSESSMENT\s+RATINGS|$)/i;
      const leadMatch = text.match(leadRegex);
      let leadBody = cleanField(leadMatch?.[1]);

      // Determine where to start searching for Health Body (after Lead Body)
      let searchStartIndex = 0;
      if (leadMatch && leadMatch.index !== undefined) {
        searchStartIndex = leadMatch.index + leadMatch[0].length;
      }
      const textAfterLead = text.substring(searchStartIndex);

      // ---- Material Health Assessment Body ----
      // Use negative lookahead to skip titles (Gold/Silver etc.) and summary keywords (e.g. (no grey chemicals))
      const healthRegex = /(?:Material\s+Health\s+Assessment(?:\s+Body)?|Material\s+Health(?!\s+(?:Gold|Silver|Bronze|Platinum|Basic|MHC|is\s+optimized|is\s+certified|\(no)))\s+([\s\S]*?)(?=Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Phases\s+and\s+Processes|PRODUCT\s+OPTIMIZATION|PERCENTAGE\s+ASSESSED|ASSESSMENT\s+RATINGS|$)/gi;
      
      const healthMatches = Array.from(textAfterLead.matchAll(healthRegex));
      const healthMatch = healthMatches[0];
      let healthBody = cleanField(healthMatch?.[1]);

      console.log(`parseCertificate: healthMatch found: ${healthMatch ? healthMatch[0] : "NONE"}`);

      // User wants N/A if not specifically found, so we don't fall back to leadBody anymore.

      // ---- Effective Date ----
      // Also look for "Issued" as it's common in MHC/Hutchinson
      const effectiveDateMatch = text.match(
        /(?:Effective\s+Date|Issued|Date\s+of\s+Issue)\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
      );
      const effectiveDate = effectiveDateMatch
        ? effectiveDateMatch[1].trim()
        : DEFAULT_NA;

      // ---- Expiration Date ----
      // Also look for "Expires"
      const expirationDateMatch = text.match(
        /(?:Expiration\s+Date|Expires|Valid\s+Until)\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
      );
      const pdfExpirationDate = expirationDateMatch
        ? expirationDateMatch[1].trim()
        : DEFAULT_NA;

      console.log(
        `parseCertificate: lead="${leadBody}", health="${healthBody}", effective="${effectiveDate}", expiry="${pdfExpirationDate}"`
      );

      return { leadBody, healthBody, effectiveDate, pdfExpirationDate };
    } catch (pdfErr: unknown) {
      console.error(`parseCertificate: PDFjs error for ${pdfUrl}:`, (pdfErr as Error).message || pdfErr);
      return empty;
    }
  } catch (error: unknown) {
    console.error(`parseCertificate: Fetch error for ${pdfUrl}:`, (error as Error).message || error);
    return empty;
  }
}
