'use client';

import { useState, useRef, useEffect } from 'react';
import { Rocket, Check, X, ChevronLeft } from "lucide-react";


export default function Home() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentProduct, setCurrentProduct] = useState('');
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([]);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, type: string = 'info') => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const startExtraction = async () => {
    setIsExtracting(true);
    setProgress(0);
    setLogs([]);
    setExcelUrl(null);
    addLog('Starting C2C Data Extraction...', 'info');

    try {
      // 1. Get Product List
      setCurrentProduct('Browsing registry pages (this may take a minute)...');
      addLog('Launching headless browser to bypass Cloudflare...', 'info');
      
      const listRes = await fetch('/api/extract/start', { method: 'POST' });
      const { products } = await listRes.json();
      
      if (!products || products.length === 0) {
        throw new Error('No products found in registry.');
      }
      
      setTotal(products.length);
      addLog(`Found ${products.length} products. Beginning detailed scan.`, 'success');

      // 2. Process each product (in batches to be polite and avoid timeouts)
      // We will tell the server to process chunks and return partial info
      const batchSize = 10;
      let results = [];

      for (let i = 0; i < products.length; i += batchSize) {
        const chunk = products.slice(i, i + batchSize);
        setCurrentProduct(`Processing batch ${Math.floor(i / batchSize) + 1}...`);
        
        const processRes = await fetch('/api/extract/process', {
          method: 'POST',
          body: JSON.stringify({ products: chunk }),
          headers: { 'Content-Type': 'application/json' }
        });
        
        const { processed } = await processRes.json();
        results.push(...processed);
        
        setProgress(Math.min(i + batchSize, products.length));
        addLog(`Processed ${Math.min(i + batchSize, products.length)} / ${products.length} products.`, 'info');
      }

      // 3. Finalize Excel
      addLog('Generating Excel file...', 'info');
      const exportRes = await fetch('/api/extract/export', {
        method: 'POST',
        body: JSON.stringify({ results }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const { downloadUrl } = await exportRes.json();
      setExcelUrl(downloadUrl);
      addLog('Extraction complete! Your file is ready.', 'success');
      
    } catch (err) {
      console.error(err);
      addLog('An error occurred during extraction. Check console.', 'error');
    } finally {
      setIsExtracting(false);
      setCurrentProduct('');
    }
  };

  return (
    <main className="container">
      <div className="card">
        <h1>C2C Registry Scraper</h1>
        <p className="subtitle">Automated product intelligence for Cradle to Cradle Certified products.</p>

        {!isExtracting && !excelUrl && (
          <button className="btn" onClick={startExtraction}>
            <span><Rocket /></span> Start Full Extraction
          </button>
        )}

        {isExtracting && (
          <div className="progress-container">
            <p className="progress-label">
              {currentProduct}
            </p>
            <div className="progress-bar-bg">
              <div 
                className="progress-bar-fill" 
                style={{ 
                  '--progress': total === 0 ? '5%' : `${(progress / total) * 100}%` 
                } as React.CSSProperties}
              ></div>
            </div>
            <p className="progress-status">
              {total === 0 ? 'Searching for products...' : `${progress} of ${total} products processed`}
            </p>
          </div>
        )}

        {excelUrl && (
          <div className="action-container">
            <a href={excelUrl} download="C2C_Certified_Products.xlsx" className="btn btn-success">
              <span>📥</span> Download Excel Report
            </a>
            <button 
              className="btn btn-outline" 
              onClick={() => { setExcelUrl(null); setLogs([]); setProgress(0); }}
            >
              Start Over
            </button>
          </div>
        )}

        <div className="log-container">
          {logs.map((log, i) => (
            <div key={i} className={`log-entry ${log.type}`}>
              {log.type === 'success' ? <Check /> : log.type === 'error' ? <X /> : <ChevronLeft />} 
              {log.msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      <footer className="footer">
        Designed for biannual product inventory updates | &copy; 2026 Yabetse Solomon
      </footer>
    </main>
  );
}
