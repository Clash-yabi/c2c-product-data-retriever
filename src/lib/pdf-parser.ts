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
  const cleaned = raw.replace(/\s+/g, " ").trim();
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
      const leadMatch = text.match(
        /Lead\s+Assessment\s+Body\s+([\s\S]*?)(?=Material\s+Health|Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Elwyn\s+Grainger|Executive\s+Director|Phases\s+and\s+Processes|PRODUCT\s+OPTIMIZATION|$)/i
      );
      let leadBody = cleanField(leadMatch?.[1]);

      // ---- Material Health Assessment Body ----
      const healthMatch = text.match(
        /Material\s+Health\s+Assessment\s+Body\s+([\s\S]*?)(?=Effective\s+Date|Expiration\s+Date|Expires|Issued\s+To|Elwyn\s+Grainger|Executive\s+Director|Phases\s+and\s+Processes|PRODUCT\s+OPTIMIZATION|$)/i
      );
      let healthBody = cleanField(healthMatch?.[1]);

      // Handle Hutchinson-style side-by-side labels where Lead might be empty 
      // because Material Health was the next word.
      if (leadBody === DEFAULT_NA && text.includes("Lead Assessment Body") && healthBody !== DEFAULT_NA) {
        // If they are side by side, healthBody might contain both names.
        // For now, we apply the user's logic: if only one is found, we can use it for both.
        leadBody = healthBody;
      }

      // User Logic: If only one is found, duplicate it to the other so no field is empty
      if (leadBody !== DEFAULT_NA && healthBody === DEFAULT_NA) {
        healthBody = leadBody;
      } else if (healthBody !== DEFAULT_NA && leadBody === DEFAULT_NA) {
        leadBody = healthBody;
      }

      // MHC Fallback: If it's an MHC certificate and one is still missing
      if (healthBody === DEFAULT_NA && leadBody !== DEFAULT_NA && (pdfUrl.includes("MHC") || text.includes("Material Health"))) {
        healthBody = leadBody;
      }

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
