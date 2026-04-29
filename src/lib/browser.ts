import puppeteer, { Browser } from "puppeteer";

let cachedBrowser: Browser | null = null;

/**
 * Returns a singleton instance of the Puppeteer browser.
 * In development, we try to reuse the instance to save resources.
 */
export async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }

  console.log("[Browser] Launching new instance...");
  cachedBrowser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ],
  });

  // Handle browser disconnect/crash
  cachedBrowser.on("disconnected", () => {
    console.warn("[Browser] Disconnected. Clearing cache.");
    cachedBrowser = null;
  });

  return cachedBrowser;
}

/**
 * Closes the browser and clears the cache.
 * Use this only if you want to completely shut down the scraper system.
 */
export async function closeBrowser() {
  if (cachedBrowser) {
    await cachedBrowser.close();
    console.log("[Browser] Closed.");
    cachedBrowser = null;
  }
}
