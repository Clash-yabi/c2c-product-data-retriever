/**
 * Extraction Service
 * Handles all API communication for the C2C product extraction process.
 * Separates API logic from the React UI hooks.
 */

export interface ExtractionStatus {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  processedItems: number;
  totalItems: number;
}

export const extractionService = {
  /**
   * Starts a new extraction job
   */
  async start(newJobId: string, limit?: number) {
    const res = await fetch("/api/extract/start", {
      method: "POST",
      body: JSON.stringify({ limit, jobId: newJobId }),
      headers: { "Content-Type": "application/json" },
    });
    
    if (!res.ok) throw new Error("Failed to start job on the server");
    return await res.json();
  },

  /**
   * Fetches the current status of a job
   */
  async getStatus(jobId: string): Promise<ExtractionStatus> {
    const res = await fetch(`/api/extract/status?jobId=${jobId}`);
    if (!res.ok) throw new Error("Job not found or server error");
    return await res.json();
  },

  /**
   * Sends a stop signal to a running job
   */
  async stop(jobId: string) {
    const res = await fetch("/api/extract/stop", {
      method: "POST",
      body: JSON.stringify({ jobId }),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Failed to send stop signal");
    return await res.json();
  },

  /**
   * Triggers the Excel report generation and download
   */
  async downloadReport(jobId: string) {
    const res = await fetch(`/api/extract/export?jobId=${jobId}`);
    if (!res.ok) throw new Error("Export failed");
    return await res.blob();
  }
};
