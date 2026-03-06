import { getBrowser } from "./browser";

export async function renderMermaid(
  content: string,
  scale: number = 2
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: scale,
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: transparent;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          #container {
            background: transparent;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <pre class="mermaid">${escapeHtml(content)}</pre>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
        <script>
          mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            securityLevel: 'strict',
          });
        </script>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for Mermaid to finish rendering
    await page.waitForSelector("svg.mermaid", { timeout: 15000 }).catch(() => {
      // Fallback: wait for any SVG inside the mermaid container
      return page.waitForSelector("#container svg", { timeout: 5000 });
    });

    // Small delay for any final rendering
    await new Promise((r) => setTimeout(r, 500));

    const element = await page.$("#container");
    if (!element) {
      throw new Error("Failed to find rendered diagram container");
    }

    const screenshot = await element.screenshot({
      type: "png",
      omitBackground: true,
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
