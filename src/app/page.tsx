"use client";

import { useState, useRef, useEffect } from "react";
import { Rocket, Check, X, ChevronLeft, Download } from "lucide-react";

export default function Home() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentProduct, setCurrentProduct] = useState("");
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
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

      // Direct Blob download: This is much more reliable on localhost
      // because it doesn't involve a secondary GET navigation.
      const blob = await res.blob();
      console.log("Blob size received:", blob.size);

      if (blob.size < 100) {
        throw new Error("Received an empty or invalid file from the server.");
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      addLog("File ready! Check your Downloads folder.", "success");

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "C2C_Certified_Report.xlsx");
      link.download = "C2C_Certified_Report.xlsx";
      
      document.body.appendChild(link);
      
      // Delay click by 50ms: some browsers ignore immediate clicks on new elements
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
      }, 50);

      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 30000); // 30s for safety
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
    setExcelUrl(null);
    setResults([]);
    addLog(
      limit
        ? `Starting Test Extraction (${limit} products)...`
        : "Starting Full C2C Data Extraction...",
      "info",
    );

    try {
      // 1. Get Product List
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

      // 2. Process each product
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

  return (
    <main className="container">
      <div className="card">
        <h1 className="card__title">
          <Rocket size={60} color="#7F9FD5" /> C2C Scraper v2.3
        </h1>
        <p className="subtitle">
          Automated product intelligence for Cradle to Cradle Certified
          products.
        </p>

        {!isExtracting && results.length === 0 && (
          <div className="action-container center">
            <button
              className="btn btn-primary"
              onClick={() => startExtraction()}
            >
              <span>
                <Rocket />
              </span>{" "}
              Start Full Extraction
            </button>
            <button
              className="btn btn-outline"
              onClick={() => startExtraction(20)}
            >
              <span>🧪</span> Run Test (20 products)
            </button>
          </div>
        )}

        {isExtracting && (
          <div className="progress-container">
            <p className="progress-label">{currentProduct}</p>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={
                  {
                    "--progress":
                      total === 0 ? "5%" : `${(progress / total) * 100}%`,
                  } as React.CSSProperties
                }
              ></div>
            </div>
            <p className="progress-status">
              {total === 0
                ? "Searching for products..."
                : `${progress} of ${total} products processed`}
            </p>
          </div>
        )}

        {results.length > 0 && !isExtracting && (
          <div className="action-container center">
            <button onClick={handleDownload} className="btn btn-success">
              <span>
                <Download />
              </span>{" "}
              Download Excel Report
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setResults([]);
                setLogs([]);
                setProgress(0);
              }}
            >
              <span>
                <ChevronLeft />
              </span>{" "}
              Clear & Start Over
            </button>
          </div>
        )}
        <div className="log-container">
          {logs.map((log, i) => (
            <div key={i} className={`log-entry ${log.type}`}>
              {log.type === "success" ? (
                <Check />
              ) : log.type === "error" ? (
                <X />
              ) : (
                <ChevronLeft />
              )}
              {log.msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      <footer className="footer">
        Designed for biannual product inventory updates | &copy; 2026 Yabetse
        Solomon | <span style={{ opacity: 0.5 }}>v2.2</span>
      </footer>
    </main>
  );
}
