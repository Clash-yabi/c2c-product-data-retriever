"use client";


import { Header } from "@components/Header";
import { ActionButtons } from "@components/ActionButtons";
import { ProgressBar } from "@components/ProgressBar";
import { LogViewer } from "@components/LogViewer";
import { DownloadSection } from "@components/DownloadSection";
import { useProductExtractor } from "@hooks/useProductExtractor";

export default function Home() {
  const {
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
  } = useProductExtractor();

  const VERSION = "v2.3";

  return (
    <main className="container">
      <article className="card">
        <Header version={VERSION} />

        {!isExtracting && results.length === 0 && (
          <ActionButtons
            onStartFull={() => startExtraction()}
            onStartTest={(limit) => startExtraction(limit)}
            disabled={isExtracting}
          />
        )}

        {isExtracting && (
          <ProgressBar
            currentProduct={currentProduct}
            progress={progress}
            total={total}
          />
        )}

        {results.length > 0 && !isExtracting && (
          <DownloadSection
            onDownload={handleDownload}
            onClear={clearResults}
            disabled={isExtracting}
          />
        )}

        <LogViewer logs={logs} logEndRef={logEndRef} />
      </article>

      <footer className="footer">
        Designed for biannual product inventory updates | &copy; 2026 Sustenuto |{" "}
        <span className="footer-version">{VERSION}</span>
      </footer>
    </main>
  );
}
