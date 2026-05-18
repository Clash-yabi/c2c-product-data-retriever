import { describe, it, expect } from "vitest";
import { extractDataFromText } from "../pdf-parser";
import { DEFAULT_NA } from "../scraper/constants";

describe("pdf-parser extraction logic", () => {
  it("should extract lead and health bodies correctly from a standard layout", () => {
    const rawText = `
      Cradle to Cradle Certified Product Certificate
      Issued To: Example Company
      Lead Assessment Body MBDC
      Material Health Assessment Body MBDC
      Effective Date 12 October 2023
      Expiration Date 11 October 2025
    `;

    const result = extractDataFromText(rawText);

    expect(result.leadBody).toBe("MBDC");
    expect(result.healthBody).toBe("MBDC");
    expect(result.effectiveDate).toBe("12 October 2023");
    expect(result.pdfExpirationDate).toBe("11 October 2025");
  });

  it("should handle mixed labels and noise", () => {
    const rawText = `
      Lead Assessment Body EPEA GmbH - Part of Drees & Sommer
      Material Health Assessment Body EPEA GmbH - Part of Drees & Sommer
      Executive Director Elwyn Grainger-Jones
      Effective Date April 24, 2024
      Expires April 23, 2026
    `;

    const result = extractDataFromText(rawText);

    expect(result.leadBody).toBe("EPEA GmbH - Part of Drees & Sommer");
    expect(result.healthBody).toBe("EPEA GmbH - Part of Drees & Sommer");
    expect(result.effectiveDate).toBe("April 24, 2024");
    expect(result.pdfExpirationDate).toBe("April 23, 2026");
  });

  it("should handle missing Material Health body without falling back to Lead body", () => {
    const rawText = `
      Lead Assessment Body MBDC
      Effective Date 12 October 2023
    `;

    const result = extractDataFromText(rawText);

    expect(result.leadBody).toBe("MBDC");
    expect(result.healthBody).toBe(DEFAULT_NA);
  });

  it("should not match checkmarks/checklist items as Material Health body in MHC/Bronze certificates", () => {
    const rawText = `
      TPE for SJEOW
      ISSUED TO Exito Electronics Co., Ltd.
      STANDARD 3.1 EXPIRES 28 November 2026
      LEAD ASSESSMENT BODY
      MBDC
      PHASES AND PROCESSES CONSIDERED IN THE CHEMICAL TOXICITY ASSESSMENT
      Manufacturing; Professional Use; Use; Intended end of use: recycling
      PRODUCTS COVERED
      TPE for SJEOW (five resin options)
      PRODUCT OPTIMIZATION SUMMARY
      Cradle to Cradle Certified® Banned List compliant
      Material Health optimization strategy developed
      No exposure from carcinogens, mutagens, or reproductive toxicants
      Meets VOC emissions testing requirements
    `;

    const result = extractDataFromText(rawText);

    expect(result.leadBody).toBe("MBDC");
    expect(result.healthBody).toBe(DEFAULT_NA); // Should be N/A, not "optimization strategy developed..."
  });

  it("should correctly parse the Cotton Woven Label GOLD certificate from Silver Printing Co Ltd", () => {
    const rawText = `Cotton Woven Label GOLD ISSUED TO Silver Printing Co.,Ltd STANDARD 3.1 EXPIRES 3 August 2026 LEAD ASSESSMENT BODY EPEA GmbH - Part of Drees & Sommer PHASES AND PROCESSES CONSIDERED IN THE CHEMICAL TOXICITY ASSESSMENT Manufacturing; Final manufacturing; Professional use; Use; Intended end-of use processes: recycling; Unintended end- of use processes: landfilling, incineration, uncontrolled burning PRODUCTS COVERED Print content and label sizes vary depending on customer needs PRODUCT OPTIMIZATION SUMMARY R Cradle to Cradle Certified® Banned List compliant R Material Health optimization strategy not required R No exposure from carcinogens, mutagens, or reproductive toxicants R VOC emissions testing not required for this product type R Product is fully optimized - does not contain any GREY or x-assessed chemicals * Process chemicals have been identified and none are GREY or x-assessed PERCENTAGE OF CHEMICAL SUBSTANCES ASSESSED BY WEIGHT ASSESSMENT RATINGS PRODUCT BY WEIGHT OPTIMIZATION 100% a or b: 99% c: 1% Inventory threshold for chemicals in each material = 100 ppm x: 0% GREY: 0% % CHEMICAL SUBSTANCES 2 CHEMICAL SUBSTANCES MHC8435 1 1 0 0 a or b c x GREY`;

    const result = extractDataFromText(rawText);

    expect(result.leadBody).toBe("EPEA GmbH - Part of Drees & Sommer");
    expect(result.healthBody).toBe(DEFAULT_NA);
    expect(result.effectiveDate).toBe(DEFAULT_NA);
    expect(result.pdfExpirationDate).toBe("3 August 2026");
  });
});
