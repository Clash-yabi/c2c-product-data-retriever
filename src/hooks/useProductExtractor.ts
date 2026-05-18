"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { extractionService } from "@/services/extractionService";
import { formattedDate } from "@/utils/dateConverter";
import { v6 } from "uuid";

export interface LogEntry {
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: string;
}

const getTimestamp = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

interface ExtractionState {
  jobId: string | null;
  status:
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "reconnecting";
  progress: number;
  total: number;
  currentProduct: string;
  logs: LogEntry[];
}

export function useProductExtractor() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [state, setState] = useState<ExtractionState>({
    jobId: null,
    status: "idle",
    progress: 0,
    total: 0,
    currentProduct: "",
    logs: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const isActionInProgress = useRef(false); // Voorkomt dubbele acties tijdens start/stop
  const logEndRef = useRef<HTMLDivElement>(null);

  // Helper voor consistente logging
  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs, { message, type, timestamp: getTimestamp() }],
      }));
    },
    [],
  );

  const clearResults = useCallback(() => {
    localStorage.removeItem("c2c_jobId");
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({
      jobId: null,
      status: "idle",
      progress: 0,
      total: 0,
      currentProduct: "",
      logs: [],
    });
    isActionInProgress.current = false;
  }, []);

  const startListening = useCallback(
    (listenJobId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(
        `/api/extract/events?jobId=${listenJobId}`,
      );
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState((prev) => {
          if (prev.status === "reconnecting") {
            return {
              ...prev,
              logs: [
                ...prev.logs,
                {
                  message: "System: Connection re-established.",
                  type: "success",
                  timestamp: getTimestamp(),
                },
              ],
            };
          }
          return prev;
        });
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status === "not_found") {
            addLog(
              "Warning: Active job not found. Resetting state.",
              "warning",
            );
            clearResults();
            return;
          }

          const isTerminal = ["completed", "failed", "cancelled"].includes(
            data.status,
          );

          setState((prev) => {
            const newStatus = data.status;
            const currentTotal = data.totalItems ?? prev.total;
            const currentProgress = data.processedItems ?? prev.progress;

            let updatedLogs = prev.logs;
            if (data.status === "completed" && prev.status !== "completed") {
              updatedLogs = [
                ...prev.logs,
                {
                  message:
                    "Extraction complete! Click below to download the Excel report.",
                  type: "success",
                  timestamp: getTimestamp(),
                },
              ];
            } else if (data.status === "failed" && prev.status !== "failed") {
              updatedLogs = [
                ...prev.logs,
                {
                  message: "Job failed on the server. Check server logs.",
                  type: "error",
                  timestamp: getTimestamp(),
                },
              ];
            }

            return {
              ...prev,
              status: newStatus,
              progress: currentProgress,
              total: currentTotal,
              currentProduct: isTerminal
                ? ""
                : `Extracting... ${currentProgress} / ${currentTotal}`,
              logs: updatedLogs,
              jobId: listenJobId, // Behoud jobId voor downloads, ook na voltooiing
            };
          });

          if (isTerminal) {
            eventSource.close();
            eventSourceRef.current = null;
            isActionInProgress.current = false;
            localStorage.removeItem("c2c_jobId");
          }
        } catch (err) {
          console.error("Fout bij parsen van Event-Driven data:", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          console.warn(
            "SSE Connection lost. Browser will attempt reconnection...",
          );
        }
      };
    },
    [addLog, clearResults],
  );

  const startExtraction = useCallback(
    async (limit?: number) => {
      if (isActionInProgress.current) return;

      isActionInProgress.current = true;
      localStorage.removeItem("c2c_jobId");

      const uuid = v6();
      const newJobId = `job_${uuid}`;

      setState({
        jobId: newJobId,
        status: "running",
        progress: 0,
        total: 0,
        currentProduct: "Initializing...",
        logs: [],
      });

      addLog(
        `System: Starting new ${limit ? "test " : ""}extraction...`,
        "info",
      );
      localStorage.setItem("c2c_jobId", newJobId);

      try {
        const startData = await extractionService.start(newJobId, limit);

        if (localStorage.getItem("c2c_jobId") !== newJobId) return;

        setState((prev) => ({ ...prev, total: startData.totalExpected }));
        addLog(
          `Job confirmed. Found ${startData.totalExpected} products.`,
          "success",
        );

        startListening(newJobId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addLog(`Startup error: ${msg}`, "error");
        setState((prev) => ({ ...prev, status: "failed" }));
        isActionInProgress.current = false;
      }
    },
    [addLog, startListening],
  );

  const stopExtraction = useCallback(async () => {
    const currentJobId = state.jobId;
    if (!currentJobId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    addLog("System: Sending stop signal...", "warning");
    setState((prev) => ({ ...prev, status: "cancelled" }));
    localStorage.removeItem("c2c_jobId");
    isActionInProgress.current = false;

    try {
      await extractionService.stop(currentJobId);
      addLog("Extraction cancelled successfully.", "warning");
    } catch (err: unknown) {
      console.error("Stop job failed:", err);
      addLog("Error while stopping job.", "error");
    }
  }, [state.jobId, addLog]);

  const handleDownload = useCallback(async () => {
    const downloadId = state.jobId;
    if (!downloadId) return;

    addLog("System: Preparing report download...", "info");
    try {
      const blob = await extractionService.downloadReport(downloadId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `C2C_Report_${formattedDate()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      addLog("Report downloaded successfully.", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addLog(`Download failed: ${msg}`, "error");
    }
  }, [state.jobId, addLog]);

  useEffect(() => {
    const savedJobId = localStorage.getItem("c2c_jobId");
    if (savedJobId) {
      setState((prev) => ({
        ...prev,
        jobId: savedJobId,
        status: "reconnecting",
      }));
      addLog(`System: Reconnecting to session ${savedJobId}...`, "info");
      startListening(savedJobId);
    }
    setHasHydrated(true);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [state.logs]);

  return {
    hasHydrated,
    isExtracting: ["running", "reconnecting"].includes(state.status),
    isCompleted: state.status === "completed",
    progress: state.progress,
    total: state.total,
    currentProduct: state.currentProduct,
    logs: state.logs,
    logEndRef,
    startExtraction,
    stopExtraction,
    handleDownload,
    clearResults,
  };
}
