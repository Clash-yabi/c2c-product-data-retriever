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
});
