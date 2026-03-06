import { getBrowser } from "./browser";

export interface MermaidOptions {
  scale?: number;
  width?: number;
  height?: number;
  theme?: string;
  fontFamily?: string;
  fontSize?: string;
}

const VALID_THEMES = ["default", "dark", "forest", "neutral", "base"];

export async function renderMermaid(
  content: string,
  options: MermaidOptions = {}
): Promise<Buffer> {
  const {
    scale = 2,
    width = 1920,
    height = 1080,
    theme = "default",
    fontFamily,
    fontSize,
  } = options;

  const safeTheme = VALID_THEMES.includes(theme) ? theme : "default";

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: scale,
    });

    // Build themeVariables for mermaid.initialize()
    const themeVariables: Record<string, string> = {};
    if (fontFamily) themeVariables.fontFamily = fontFamily;
    if (fontSize) themeVariables.fontSize = fontSize;

    const mermaidConfig = JSON.stringify({
      startOnLoad: false,
      theme: safeTheme,
      securityLevel: "strict",
      ...(Object.keys(themeVariables).length > 0 && { themeVariables }),
    });

    // Build Google Fonts <link> if a fontFamily is specified
    const googleFontLink = fontFamily
      ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily.split(",")[0].trim())}:wght@400;700&display=swap" rel="stylesheet">`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        ${googleFontLink}
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
        <div id="container"></div>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
        <script>
          (async () => {
            try {
              mermaid.initialize(${mermaidConfig});
              const { svg } = await mermaid.render('diagram', ${JSON.stringify(content)});
              document.getElementById('container').innerHTML = svg;
              document.getElementById('container').dataset.rendered = 'true';
            } catch (e) {
              document.getElementById('container').dataset.error = e.message || 'Unknown render error';
              document.getElementById('container').dataset.rendered = 'error';
            }
          })();
        </script>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for rendering to complete
    await page.waitForFunction(
      () => {
        const el = document.getElementById("container");
        return el?.dataset.rendered === "true" || el?.dataset.rendered === "error";
      },
      { timeout: 15000 }
    );

    // Check for render errors
    const renderError = await page.$eval("#container", (el) =>
      (el as HTMLElement).dataset.error
    ).catch(() => null);

    if (renderError) {
      throw new Error(`Mermaid syntax error: ${renderError}`);
    }

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
