import { getBrowser } from "./browser";
import { getProductDetail } from "./c2c-scraper";
import { parseCertificate } from "./pdf-parser";
import { C2CProduct } from "@/types/products";

const DEFAULT_NA = "N/A";
const DEFAULT_ERROR = "Error";

export async function processProductBatch(products: C2CProduct[]): Promise<C2CProduct[]> {
  const browser = await getBrowser();

  const processSingleProduct = async (p: C2CProduct): Promise<C2CProduct> => {
    try {
      console.log(`API Process: Starting extraction for ${p.slug}`);

      // 1. Get data from the detail page
      const detail = await getProductDetail(browser, p.slug);

      // 2. Parse the PDF if available
      let pdfData = {
        leadBody: DEFAULT_NA,
        healthBody: DEFAULT_NA,
        effectiveDate: DEFAULT_NA,
        pdfExpirationDate: DEFAULT_NA,
      };
      
      if (detail.pdfUrl && detail.pdfUrl !== DEFAULT_NA) {
        pdfData = await parseCertificate(detail.pdfUrl);
      }

      return {
        company: (detail.productName !== DEFAULT_NA && detail.company) ? (detail.company as string) : p.company,
        productName: (detail.productName !== DEFAULT_NA && detail.productName) ? (detail.productName as string) : p.productName,
        slug: p.slug,
        level: detail.level || DEFAULT_NA,
        standardVersion: detail.standardVersion || DEFAULT_NA,
        effectiveDate: pdfData.effectiveDate,
        expirationDate: (detail.expirationDate && detail.expirationDate !== DEFAULT_NA)
          ? detail.expirationDate
          : pdfData.pdfExpirationDate,
        leadAssessmentBody: pdfData.leadBody,
        materialHealthAssessmentBody: pdfData.healthBody,
        pdfUrl: detail.pdfUrl || DEFAULT_NA,
      };
    } catch (err: any) {
      console.error(`API Process: Error for ${p.slug}:`, err.message);
      return {
        company: p.company || DEFAULT_NA,
        productName: p.productName || DEFAULT_NA,
        slug: p.slug,
        level: DEFAULT_ERROR,
        standardVersion: DEFAULT_ERROR,
        effectiveDate: DEFAULT_ERROR,
        expirationDate: DEFAULT_ERROR,
        leadAssessmentBody: DEFAULT_ERROR,
        materialHealthAssessmentBody: DEFAULT_ERROR,
        pdfUrl: DEFAULT_NA,
      };
    }
  };

  return Promise.all(products.map((p) => processSingleProduct(p)));
}
