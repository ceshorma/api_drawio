import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderMermaid } from "../lib/mermaid-renderer";
import { renderDrawio } from "../lib/drawio-renderer";

const VALID_TYPES = ["mermaid", "drawio"] as const;
type DiagramType = (typeof VALID_TYPES)[number];

interface RequestBody {
  type?: DiagramType;
  content: string;
  width?: number;
  height?: number;
  scale?: number;
  theme?: string;
  fontFamily?: string;
  fontSize?: string;
}

const MAX_CONTENT_LENGTH = 500_000; // 500KB

function detectFormat(content: string): DiagramType {
  const trimmed = content.trim();
  if (
    trimmed.includes("<mxfile") ||
    trimmed.includes("<mxGraphModel") ||
    trimmed.startsWith("<diagram")
  ) {
    return "drawio";
  }
  return "mermaid";
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { type, content, width, height, scale, theme, fontFamily, fontSize } =
    req.body as RequestBody;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "content is required and must be a non-empty string." });
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return res
      .status(400)
      .json({ error: `content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters.` });
  }

  if (type && !VALID_TYPES.includes(type)) {
    return res
      .status(400)
      .json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
  }

  const diagramType = type ?? detectFormat(content);
  const diagramScale = Math.min(Math.max(scale ?? 2, 1), 4);
  const viewportWidth = Math.min(Math.max(width ?? 1920, 320), 3840);
  const viewportHeight = Math.min(Math.max(height ?? 1080, 240), 2160);

  try {
    let pngBuffer: Buffer;

    if (diagramType === "mermaid") {
      pngBuffer = await renderMermaid(content, {
        scale: diagramScale,
        width: viewportWidth,
        height: viewportHeight,
        theme: theme ?? "default",
        fontFamily,
        fontSize,
      });
    } else {
      pngBuffer = await renderDrawio(content, {
        scale: diagramScale,
        width: viewportWidth,
        height: viewportHeight,
      });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", pngBuffer.length);
    res.setHeader("Content-Disposition", 'inline; filename="diagram.png"');
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    return res.status(200).send(pngBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Diagram rendering failed:", message);
    return res
      .status(500)
      .json({ error: "Failed to render diagram", details: message });
  }
}
