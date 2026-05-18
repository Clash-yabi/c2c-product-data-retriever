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
  const cleaned = raw
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
        
        const items = content.items.filter((item) => "str" in item) as Array<{
          str: string;
          transform: number[];
        }>;

        // Group into left and right columns to prevent horizontally adjacent text from interleaving.
        // A standard page is ~600pts wide. transform[4] is the starting X coordinate.
        // The right column typically starts around X=259 in C2C PDFs.
        // Left column items start < 250. Right column items start >= 250.
        // Full width paragraphs start < 250, so they stay fully in the left column.
        const leftItems = items.filter((item) => item.transform[4] < 250);
        const rightItems = items.filter((item) => item.transform[4] >= 250);

        const pageText =
          leftItems.map((item) => item.str).join(" ") +
          " " +
          rightItems.map((item) => item.str).join(" ");

        text += pageText + " ";
      }

      // Normalize text once after extraction
      const normalizedText = normalizePDFText(text);

      console.log(
        `parseCertificate: Normalized PDF text (first 400 chars): ${normalizedText.substring(0, 400)}`
      );

      return extractDataFromText(normalizedText);
    } catch (pdfErr: unknown) {
      console.error(`parseCertificate: PDFjs error for ${pdfUrl}:`, (pdfErr as Error).message || pdfErr);
      return empty;
    }
  } catch (error: unknown) {
    console.error(`parseCertificate: Fetch error for ${pdfUrl}:`, (error as Error).message || error);
    return empty;
  }
}

/**
 * Normalizes PDF text by consolidating all whitespace into single spaces.
 * This makes regex matching immune to line breaks or weird PDF spacing.
 */
function normalizePDFText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure extraction logic separated for testability.
 */
export function extractDataFromText(text: string): PDFData {
  // Ensure we are working with normalized text if called directly
  const normalizedText = normalizePDFText(text);

  // 1. Locate the boundary of the product optimization/checklist summary to restrict our search scope
  const checklistStartIndex = normalizedText.search(
    /(?:PRODUCT\s+OPTIMIZATION|PERCENTAGE\s+(?:OF\s+)?CHEMICAL|PERCENTAGE\s+ASSESSED|ASSESSMENT\s+RATINGS)/i
  );

  // We want to limit the search to the top of the document (metadata section)
  // to avoid matching random mentions of "Material Health" in the methodology text.
  // With column sorting, PERCENTAGE OF CHEMICAL SUBSTANCES is in the left column,
  // so splitting there truncates the entire right column. We use a safer boundary.
  const metadataText = normalizedText.split(/Material Health Certificate Guide|Assessment Methodology/i)[0];

  // ---- Lead Assessment Body (Scoped to metadataText) ----
  const leadRegex =
    /Lead\s+Assessment\s+Body\s+([\s\S]*?)(?=Material\s+Health|Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Phases\s+and\s+Processes|$)/i;
  const leadMatch = metadataText.match(leadRegex);
  const leadBody = cleanField(leadMatch?.[1]);

  // Determine where to start searching for Health Body inside metadataText (after Lead Body)
  let searchStartIndex = 0;
  if (leadMatch && leadMatch.index !== undefined) {
    searchStartIndex = leadMatch.index + leadMatch[0].length;
  }
  const textAfterLead = metadataText.substring(searchStartIndex);

  // ---- Material Health Assessment Body (Scoped to metadataText) ----
  // Exclude false positives like "Material Health optimization strategy", "Material Health Certificate Guide", etc.
  // Stop capturing at "Effective Date", "Expires", "PRODUCT OPTIMIZATION", "PERCENTAGE OF", etc.
  const healthRegex =
    /(?:Material\s+Health\s+Assessment(?:\s+Body)?|Material\s+Health(?!\s+(?:Gold|Silver|Bronze|Platinum|Basic|MHC|is\s+optimized|is\s+certified|\(no|Certificate|achievement|Assessment\s+Methodology|optimization)))\s+([\s\S]*?)(?=Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Phases\s+and\s+Processes|PRODUCT\s+OPTIMIZATION|PERCENTAGE\s+OF|Material\s+Health\s+Certificate\s+Guide|$)/gi;

  const healthMatches = Array.from(textAfterLead.matchAll(healthRegex));
  const healthMatch = healthMatches[0];
  let healthBody = cleanField(healthMatch?.[1]);

  // ---- Effective Date (Global search remains safe) ----
  const effectiveDateMatch = normalizedText.match(
    /(?:Effective\s+Date|Issued|Date\s+of\s+Issue)\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
  );
  const effectiveDate = effectiveDateMatch
    ? effectiveDateMatch[1].trim()
    : DEFAULT_NA;

  // ---- Expiration Date (Global search remains safe) ----
  const expirationDateMatch = normalizedText.match(
    /(?:Expiration\s+Date|Expires|Valid\s+Until)\s+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/i
  );
  const pdfExpirationDate = expirationDateMatch
    ? expirationDateMatch[1].trim()
    : DEFAULT_NA;

  return { leadBody, healthBody, effectiveDate, pdfExpirationDate };
}
