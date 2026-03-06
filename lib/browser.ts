import puppeteer, { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK_URL =
  "https://github.com/nicholidev/chromium-brotli-data/releases/download/v143.0.0/chromium-v143.0.0-pack.tar";

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isVercel) {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    browserInstance = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
  } else {
    // Local development: use system Chrome/Chromium
    const possiblePaths = [
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];

    let executablePath: string | undefined;
    const fs = await import("fs");
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    browserInstance = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      executablePath,
      headless: true,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
  }

  return browserInstance;
}
