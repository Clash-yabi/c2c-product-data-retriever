"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { extractionService } from "@/services/extractionService";
import { v6 } from "uuid";

export interface LogEntry {
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: string;
}

export function useProductExtractor() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentProduct, setCurrentProduct] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setLogs((prev) => [
        ...prev,
        {
          message,
          type,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        },
      ]);
    },
    [],
  );

  const clearResults = useCallback(() => {
    localStorage.removeItem("c2c_jobId");
    setJobId(null);
    setIsExtracting(false);
    setProgress(0);
    setTotal(0);
    setCurrentProduct("");
    setLogs([]);
    setIsCompleted(false);
    setIsReconnecting(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startListening = useCallback(
    (listenJobId: string) => {
      // Sluit eventuele oude verbinding af
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/extract/events?jobId=${listenJobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const statusData = JSON.parse(event.data);

          setProgress(statusData.processedItems);
          if (statusData.totalItems) {
            setTotal(statusData.totalItems);
          }

          if (statusData.status === "not_found") {
            addLog("Warning: Active job not found. Clearing state.", "warning");
            clearResults();
            eventSource.close();
            return;
          }

          if (statusData.status === "running") {
            setCurrentProduct(
              `Extracting... ${statusData.processedItems} / ${statusData.totalItems || total}`,
            );
            setIsExtracting(true);
            setIsCompleted(false);
            setIsReconnecting(false);
          }

          if (
            statusData.status === "completed" ||
            statusData.status === "failed" ||
            statusData.status === "cancelled"
          ) {
            eventSource.close();
            setIsExtracting(false);
            setCurrentProduct("");
            setIsReconnecting(false);

            if (statusData.status === "completed") {
              setIsCompleted(true);
              addLog(
                "Extraction complete! Click below to download the Excel report.",
                "success",
              );
            } else if (statusData.status === "cancelled") {
              localStorage.removeItem("c2c_jobId");
              setJobId(null);
            } else {
              addLog("Job failed on the server. Check server logs.", "error");
            }
          }
        } catch (err) {
          console.error("Fout bij parsen van Event-Driven data:", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          addLog("Connection to server lost.", "warning");
        }
      };
    },
    [addLog, clearResults, total],
  );

  const startExtraction = async (limit?: number) => {
    if (isExtracting) return;

    const uuid = v6();
    const newJobId = `job_${uuid}`;

    setIsExtracting(true);
    setIsCompleted(false);
    setJobId(newJobId);
    setLogs([]);
    addLog(`System: Starting new ${limit ? "test " : ""}extraction...`, "info");
    localStorage.setItem("c2c_jobId", newJobId);

    try {
      const startData = await extractionService.start(newJobId, limit);
      if (!localStorage.getItem("c2c_jobId")) return;

      setTotal(startData.totalExpected);
      addLog(
        `Job ${newJobId} confirmed. Found ${startData.totalExpected} products.`,
        "success",
      );
      startListening(newJobId);
    } catch (err) {
      addLog("Startup error. Check console.", "error");
      setIsExtracting(false);
    }
  };

  const stopExtraction = async () => {
    if (!jobId) return;
    
    // 1. Verbinding direct verbreken zodat we geen events meer ontvangen
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    addLog("System: Sending stop signal...", "warning");
    try {
      setIsExtracting(false);
      localStorage.removeItem("c2c_jobId");
      setJobId(null);
      await extractionService.stop(jobId);
      
      // 2. Direct visuele feedback geven aan de gebruiker (instant UI reactie)
      addLog("Extraction cancelled successfully.", "warning");
    } catch (err) {
      addLog("Error while stopping job.", "error");
    }
  };

  const handleDownload = async () => {
    if (!jobId) return;
    addLog("System: Preparing report download...", "info");
    try {
      const blob = await extractionService.downloadReport(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `C2C_Report_${jobId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Report downloaded successfully.", "success");
    } catch (err) {
      addLog("Download failed.", "error");
    }
  };

  useEffect(() => {
    const savedJobId = localStorage.getItem("c2c_jobId");
    if (savedJobId) {
      setJobId(savedJobId);
      setIsReconnecting(true);
      addLog(`System: Reconnecting to session ${savedJobId}...`, "info");
      startListening(savedJobId);
    }
    setHasHydrated(true);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  return {
    hasHydrated,
    isExtracting: isExtracting || isReconnecting,
    isCompleted,
    progress,
    total,
    currentProduct,
    logs,
    logEndRef,
    startExtraction,
    stopExtraction,
    handleDownload,
    clearResults,
  };
}
