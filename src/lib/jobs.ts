// src/lib/jobs.ts
import { prisma } from "@/lib/prisma";

export async function initializeScrapeJob(jobId: string, totalItems: number) {
  try {
    return await prisma.scrapeJob.create({
      data: { id: jobId, totalItems, status: "running" },
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      // De job was al 'ge-upsert' door de STOP route!
      return null; // Geef null terug om aan te geven: "Niet starten"
    }
    throw error;
  }
}
