"use client";


import { Header } from "@/components/Header";
import { ActionButtons } from "@/components/ActionButtons";
import { ProgressBar } from "@/components/ProgressBar";
import { LogViewer } from "@/components/LogViewer";
import { DownloadSection } from "@/components/DownloadSection";
import { useProductExtractor } from "@/hooks/useProductExtractor";

export default function Home() {
  const {
    hasHydrated,
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

  const VERSION = "v2.4";

  return (
    <main className="container">
      <article className="card">
        <Header version={VERSION} />

        {/* 
          FLICKER FIX: 
          If the app hasn't "woken up" (hydrated) yet, we show nothing 
          to prevent the "Start" button from flashing before we reconnect 
          to a background job.
        */}
        {!hasHydrated ? (
           <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ opacity: 0.5, fontSize: '0.9rem' }}>Initialising...</p>
           </div>
        ) : (
          <>
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
          </>
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
