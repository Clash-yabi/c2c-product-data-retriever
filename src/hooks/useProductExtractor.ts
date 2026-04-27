"use client";

import { useState, useRef, useEffect } from "react";
import { formattedDate } from "@/helpers/dateConverter";

export interface Log {
  msg: string;
  type: string;
}

export function useProductExtractor() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentProduct, setCurrentProduct] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, type: string = "info") => {
    console.log(`[ExtrLog] ${type}: ${msg}`);
    setLogs((prev) => [...prev, { msg, type }]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const clearResults = () => {
    setResults([]);
    setLogs([]);
    setProgress(0);
    setTotal(0);
    setCurrentProduct("");
  };

  const handleDownload = async () => {
    if (results.length === 0) return;

    try {
      addLog("Generating file... (v2.3)", "info");
      const res = await fetch(`/api/extract/export?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });

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
    setIsExtracting(true);
    setProgress(0);
    setLogs([]);
    setTotal(0);
    setResults([]);
    addLog(
      limit
        ? `Starting Test Extraction (${limit} products)...`
        : "Starting Full C2C Data Extraction...",
      "info",
    );

    try {
      setCurrentProduct("Browsing registry pages...");
      addLog("Launching browser to detect registry state...", "info");

      const listRes = await fetch("/api/extract/start", {
        method: "POST",
        body: JSON.stringify({ limit }),
        headers: { "Content-Type": "application/json" },
      });
      const { products } = await listRes.json();

      if (!products || products.length === 0) {
        throw new Error("No products found in registry.");
      }

      setTotal(products.length);
      addLog(
        `Found ${products.length} products. Beginning detailed scan.`,
        "success",
      );

      const batchSize = 10;
      let currentResults = [];

      for (let i = 0; i < products.length; i += batchSize) {
        const chunk = products.slice(i, i + batchSize);
        setCurrentProduct(
          `Processing batch ${Math.floor(i / batchSize) + 1}...`,
        );

        const processRes = await fetch("/api/extract/process", {
          method: "POST",
          body: JSON.stringify({ products: chunk }),
          headers: { "Content-Type": "application/json" },
        });

        const { processed } = await processRes.json();
        currentResults.push(...processed);

        setProgress(Math.min(i + batchSize, products.length));
        addLog(
          `Processed ${Math.min(i + batchSize, products.length)} / ${products.length} products.`,
          "info",
        );
      }

      setResults(currentResults);
      addLog(
        "Extraction complete! Click below to download the Excel report.",
        "success",
      );
    } catch (err) {
      console.error(err);
      addLog("An error occurred during extraction. Check console.", "error");
    } finally {
      setIsExtracting(false);
      setCurrentProduct("");
    }
  };

  return {
    isExtracting,
    progress,
    total,
    currentProduct,
    logs,
    results,
    logEndRef,
    startExtraction,
    handleDownload,
    clearResults,
  };
}
