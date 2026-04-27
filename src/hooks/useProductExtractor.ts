"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { formattedDate } from "@/utils/dateConverter";

export interface Log {
  msg: string;
  type: string;
}

export function useProductExtractor() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentProduct, setCurrentProduct] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const addLog = useCallback((msg: string, type: string = "info") => {
    console.log(`[ExtrLog] ${type}: ${msg}`);
    setLogs((prev) => [...prev, { msg, type }]);
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const clearResults = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    localStorage.removeItem("c2c_jobId");
    setJobId(null);
    setIsCompleted(false);
    setIsExtracting(false);
    setIsReconnecting(false);
    setLogs([]);
    setProgress(0);
    setTotal(0);
    setCurrentProduct("");
  }, []);

  const startPolling = useCallback((pollJobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const poll = async () => {
      try {
        const statusRes = await fetch(`/api/extract/status?jobId=${pollJobId}`);
        
        // SELF-HEALING: If we get 404 multiple times, the job is likely deleted/stale
        if (!statusRes.ok) {
           retryCountRef.current += 1;
           if (retryCountRef.current > 3) {
             console.warn("Self-Healing: Detected stale Job ID. Clearing state.");
             addLog("Warning: Previous job not found on server. Clearing stale data.", "warning");
             clearResults();
           }
           return;
        }

        // Reset retry count on any successful response
        retryCountRef.current = 0;

        const statusData = await statusRes.json();
        setProgress(statusData.processedItems);
        setTotal(statusData.totalItems);
        
        if (statusData.status === "running") {
          setCurrentProduct(`Extracting... ${statusData.processedItems} / ${statusData.totalItems}`);
          setIsExtracting(true);
          setIsCompleted(false);
          setIsReconnecting(false); 
        }

        if (statusData.status === "completed" || statusData.status === "failed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsExtracting(false);
          setCurrentProduct("");
          setIsReconnecting(false); 
          
          if (statusData.status === "completed") {
              setIsCompleted(true);
              addLog("Extraction complete! Click below to download the Excel report.", "success");
          } else {
              addLog("Job failed on the server. Check logs.", "error");
          }
        }
      } catch (err) {
          console.error("Polling error:", err);
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
  }, [addLog, clearResults]);

  // PHASE 4: HYDRATION SAFE MOUNT
  useEffect(() => {
    setHasHydrated(true);
    const savedJobId = localStorage.getItem("c2c_jobId");
    if (savedJobId) {
      setJobId(savedJobId);
      setIsReconnecting(true);
      setIsExtracting(true); // Assume extracting until proven otherwise
      addLog(`System: Reconnecting to background job ${savedJobId}...`, "info");
      startPolling(savedJobId);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [startPolling, addLog]);

  const handleDownload = async () => {
    if (!jobId) return;

    try {
      addLog("Generating Excel file from database...", "info");
      const res = await fetch(`/api/extract/export?jobId=${jobId}&t=${Date.now()}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Server Error Response:", errorText);
        throw new Error(
          `Server returned ${res.status}: ${errorText.substring(0, 100)}`,
        );
      }

      const blob = await res.blob();
      if (blob.size < 100) {
        throw new Error("Received an empty or invalid file from the server.");
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      addLog("File ready! Check your Downloads folder.", "success");

      const link = document.createElement("a");
      link.href = downloadUrl;
      const filename = `C2C_Certified_Report-${formattedDate()}.xlsx`;
      link.setAttribute("download", filename);
      link.download = filename;

      document.body.appendChild(link);
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
      }, 50);

      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 30000);
    } catch (err: any) {
      console.error("Download Error:", err);
      addLog(`Download failed: ${err.message}`, "error");
    }
  };

  const startExtraction = async (limit?: number) => {
    if (isReconnecting || isExtracting) return; 

    const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    setIsExtracting(true);
    setProgress(0);
    setLogs([]);
    setTotal(0);
    setJobId(newJobId);
    localStorage.setItem("c2c_jobId", newJobId);
    setIsCompleted(false);

    addLog(
      limit
        ? `Starting Test Extraction (${limit} products)...`
        : "Starting Full C2C Data Extraction in Background...",
      "info",
    );

    try {
      setCurrentProduct("Initializing backend job...");

      const startRes = await fetch("/api/extract/start", {
        method: "POST",
        body: JSON.stringify({ limit, jobId: newJobId }),
        headers: { "Content-Type": "application/json" },
      });
      
      if (!startRes.ok) {
         throw new Error("Failed to start job on the server");
      }

      const startData = await startRes.json();
      setTotal(startData.totalExpected);
      addLog(`Job ${newJobId} confirmed by server. Found ${startData.totalExpected} products.`, "success");

      startPolling(newJobId);

    } catch (err) {
      console.error(err);
      addLog("An error occurred during startup. Check console.", "error");
      setIsExtracting(false);
      setCurrentProduct("");
    }
  };

  return {
    hasHydrated,
    isExtracting: isExtracting || isReconnecting,
    progress,
    total,
    currentProduct: isReconnecting ? "Reconnecting to server..." : currentProduct,
    logs,
    results: isCompleted ? ["ready"] : [], 
    logEndRef,
    startExtraction,
    handleDownload,
    clearResults,
  };
}
