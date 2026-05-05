import { NextResponse } from "next/server";
import { jobEmitter } from "@/lib/event-emitter";
import { prisma } from "@/lib/prisma";

// Deze variabele vertelt Next.js dat dit een dynamische route is (geen statische HTML)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new NextResponse("Missing jobId", { status: 400 });
  }

  // 1. Check direct even de huidige status in de DB (voor het geval de frontend iets miste)
  const initialJob = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
    select: { status: true, processedItems: true, totalItems: true },
  });

  // 2. We maken een stream open naar de browser
  const stream = new ReadableStream({
    start(controller) {
      // Helper functie om data te sturen in het 'Server-Sent Events' (SSE) formaat
      const sendEvent = (data: any) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          // Stream is mogelijk al gesloten
        }
      };

      if (!initialJob) {
        // Zorgt voor self-healing op de frontend als de job niet meer in de DB staat
        sendEvent({ status: "not_found" });
        controller.close();
        return;
      }

      // Stuur direct de begin-status
      sendEvent({
        status: initialJob.status,
        processedItems: initialJob.processedItems,
        totalItems: initialJob.totalItems,
      });
      
      // Als hij al klaar of mislukt was, kunnen we de stream direct sluiten
      if (["completed", "failed", "cancelled"].includes(initialJob.status)) {
        controller.close();
        return;
      }

      // 3. We gaan "luisteren" naar onze backend "Radio Toren" op de frequentie van deze specifieke job
      const eventName = `job-${jobId}`;
      
      const listener = (data: any) => {
        sendEvent(data);
        // Sluit de stream als de taak is afgerond
        if (["completed", "failed", "cancelled"].includes(data.status)) {
          jobEmitter.off(eventName, listener);
          try { controller.close(); } catch(e) {}
        }
      };

      jobEmitter.on(eventName, listener);

      // 4. Mocht de browser de verbinding verbreken, dan ruimen we netjes op
      req.signal.addEventListener("abort", () => {
        jobEmitter.off(eventName, listener);
        try { controller.close(); } catch(e) {}
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream", // Belangrijk: dit maakt het Event-Driven (SSE)!
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
