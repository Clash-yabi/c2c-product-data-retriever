import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;
