import axios from "axios";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFData } from "@/types/products";

const TIMEOUT_PDF_FETCH = 20000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

/** Trim and remove known noise from extracted PDF text fields */
function cleanField(raw: string | undefined): string {
  if (!raw) return "N/A";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 2) return "N/A";
  return cleaned;
}

/**
 * Downloads and parses the certificate PDF using pdfjs-dist.
 * Extracts: effectiveDate, expirationDate (backup), leadBody, healthBody
 */
export async function parseCertificate(pdfUrl: string): Promise<PDFData> {
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
