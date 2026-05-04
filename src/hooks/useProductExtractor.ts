"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { extractionService } from "@/services/extractionService";

interface LogEntry {
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

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
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
  }, []);

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
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  const startPolling = useCallback((pollJobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const poll = async () => {
      try {
        const statusData = await extractionService.getStatus(pollJobId);
        retryCountRef.current = 0;
        
        setProgress(statusData.processedItems);
        setTotal(statusData.totalItems);
        
        if (statusData.status === "running") {
          setCurrentProduct(`Extracting... ${statusData.processedItems} / ${statusData.totalItems}`);
          setIsExtracting(true);
          setIsCompleted(false);
          setIsReconnecting(false); 
        }

        if (statusData.status === "completed" || statusData.status === "failed" || statusData.status === "cancelled") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsExtracting(false);
          setCurrentProduct("");
          setIsReconnecting(false); 
          
          if (statusData.status === "completed") {
            setIsCompleted(true);
            addLog("Extraction complete! Click below to download the Excel report.", "success");
          } else if (statusData.status === "cancelled") {
            addLog("Extraction cancelled successfully.", "warning");
            localStorage.removeItem("c2c_jobId");
            setJobId(null);
          } else {
            addLog("Job failed on the server. Check server logs.", "error");
          }
        }
      } catch (err) {
        retryCountRef.current += 1;
        if (retryCountRef.current > 3) {
          addLog("Warning: Active job not found. Clearing state.", "warning");
          clearResults();
        }
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [addLog, clearResults]);

  const startExtraction = async (limit?: number) => {
    const newJobId = `job_${Math.random().toString(36).substring(2, 11)}`;
    
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
      addLog(`Job ${newJobId} confirmed. Found ${startData.totalExpected} products.`, "success");
      startPolling(newJobId);
    } catch (err) {
      addLog("Startup error. Check console.", "error");
      setIsExtracting(false);
    }
  };

  const stopExtraction = async () => {
    if (!jobId) return;
    addLog("System: Sending stop signal...", "warning");
    try {
      setIsExtracting(false);
      localStorage.removeItem("c2c_jobId");
      setJobId(null);
      await extractionService.stop(jobId);
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
      startPolling(savedJobId);
    }
    setHasHydrated(true);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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
    progress,
    total,
    currentProduct,
    logs,
    results: isCompleted ? ["ready"] : [], 
    logEndRef,
    startExtraction,
    stopExtraction,
    handleDownload,
    clearResults,
  };
}
