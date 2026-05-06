import puppeteer, { Browser } from "puppeteer";

const BROWSER_KEY = Symbol.for("c2c.browser");
const globalNode = global as unknown as { [key: symbol]: Browser | null };
let launchPromise: Promise<Browser> | null = null;

if (!(BROWSER_KEY in globalNode)) {
  globalNode[BROWSER_KEY] = null;
}

/**
 * Returns a singleton instance of the Puppeteer browser.
 * In development, we try to reuse the instance to save resources.
 */
export async function getBrowser(): Promise<Browser> {
  const cachedBrowser = globalNode[BROWSER_KEY];
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }

  if (launchPromise) {
    return launchPromise;
  }

  console.log("[Browser] Launching new instance...");
  launchPromise = puppeteer.launch({
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
  }).then((newBrowser) => {
    globalNode[BROWSER_KEY] = newBrowser;
    
    // Handle browser disconnect/crash
    newBrowser.on("disconnected", () => {
      console.warn("[Browser] Disconnected. Clearing cache.");
      globalNode[BROWSER_KEY] = null;
      launchPromise = null;
    });

    return newBrowser;
  }).catch((err) => {
    launchPromise = null;
    throw err;
  });
  
  return launchPromise;
}

/**
 * Closes the browser and clears the cache.
 * Use this only if you want to completely shut down the scraper system.
 */
export async function closeBrowser() {
  const cachedBrowser = globalNode[BROWSER_KEY];
  if (cachedBrowser) {
    await cachedBrowser.close();
    console.log("[Browser] Closed.");
    globalNode[BROWSER_KEY] = null;
  }
}
