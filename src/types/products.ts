import { z } from "zod";

export const C2CProductSchema = z.object({
  company: z.string().default("N/A"),
  productName: z.string().default("N/A"),
  level: z.string().default("N/A"),
  standardVersion: z.string().default("N/A"),
  slug: z.string(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  leadAssessmentBody: z.string().optional(),
  materialHealthAssessmentBody: z.string().optional(),
  pdfUrl: z.string().optional().nullable(),
});

export type C2CProduct = z.infer<typeof C2CProductSchema>;

export type PDFData = {
  leadBody: string;
  healthBody: string;
  effectiveDate: string;
  pdfExpirationDate: string;
};
