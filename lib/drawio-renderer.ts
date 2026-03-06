import { getBrowser } from "./browser";

export interface DrawioOptions {
  scale?: number;
  width?: number;
  height?: number;
}

export async function renderDrawio(
  xmlContent: string,
  options: DrawioOptions = {}
): Promise<Buffer> {
  const { scale = 2, width = 1920, height = 1080 } = options;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: scale,
    });

    const encodedXml = JSON.stringify({
      highlight: "#0000ff",
      nav: false,
      resize: true,
      toolbar: "hidden",
      edit: "_blank",
      xml: xmlContent,
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
          }
          #container {
            background: transparent;
            display: inline-block;
          }
          .geDiagramContainer {
            background: transparent !important;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <div class="mxgraph" data-mxgraph='${encodedXml.replace(/'/g, "&#39;")}'>
          </div>
        </div>
        <script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for draw.io viewer to render the diagram
    await page.waitForSelector(".geDiagramContainer", { timeout: 15000 });
    await page.waitForSelector(".geDiagramContainer svg", { timeout: 10000 });

    // Small delay for any final rendering
    await new Promise((r) => setTimeout(r, 500));

    const element = await page.$(".geDiagramContainer");
    if (!element) {
      throw new Error("Failed to find rendered draw.io diagram container");
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
