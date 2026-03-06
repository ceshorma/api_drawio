import { JSDOM } from "jsdom";
import { Resvg } from "@resvg/resvg-js";

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
    theme = "default",
    fontFamily,
    fontSize,
  } = options;

  const safeTheme = VALID_THEMES.includes(theme) ? theme : "default";

  // Create a jsdom instance to provide DOM for mermaid
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"container\"></div></body></html>", {
    pretendToBeVisual: true,
  });

  // Set globals that mermaid expects
  const { window } = dom;
  (global as any).window = window;
  (global as any).document = window.document;
  (global as any).navigator = window.navigator;
  (global as any).DOMParser = window.DOMParser;
  (global as any).XMLSerializer = window.XMLSerializer;

  try {
    // Dynamic import to ensure globals are set before mermaid loads
    const mermaid = (await import("mermaid")).default;

    const themeVariables: Record<string, string> = {};
    if (fontFamily) themeVariables.fontFamily = fontFamily;
    if (fontSize) themeVariables.fontSize = fontSize;

    mermaid.initialize({
      startOnLoad: false,
      theme: safeTheme as any,
      securityLevel: "loose",
      ...(Object.keys(themeVariables).length > 0 && { themeVariables }),
    });

    const { svg: svgString } = await mermaid.render("diagram", content);

    // Convert SVG to PNG using resvg
    const resvg = new Resvg(svgString, {
      fitTo: {
        mode: "zoom",
        value: scale,
      },
      background: "rgba(0, 0, 0, 0)",
    });

    const pngData = resvg.render();
    return Buffer.from(pngData.asPng());
  } finally {
    // Clean up globals
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).navigator;
    delete (global as any).DOMParser;
    delete (global as any).XMLSerializer;
    dom.window.close();
  }
}
