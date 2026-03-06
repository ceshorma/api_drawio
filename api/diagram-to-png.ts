import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderMermaid } from "../lib/mermaid-renderer";
import { renderDrawio } from "../lib/drawio-renderer";

const VALID_TYPES = ["mermaid", "drawio"] as const;
type DiagramType = (typeof VALID_TYPES)[number];

interface RequestBody {
  type: DiagramType;
  content: string;
  scale?: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { type, content, scale } = req.body as RequestBody;

  if (!type || !VALID_TYPES.includes(type)) {
    return res
      .status(400)
      .json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return res.status(400).json({ error: "Content is required and must be a non-empty string." });
  }

  const diagramScale = Math.min(Math.max(scale ?? 2, 1), 4);

  try {
    let pngBuffer: Buffer;

    if (type === "mermaid") {
      pngBuffer = await renderMermaid(content, diagramScale);
    } else {
      pngBuffer = await renderDrawio(content, diagramScale);
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", pngBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(pngBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Diagram rendering failed:", message);
    return res.status(500).json({ error: "Failed to render diagram", details: message });
  }
}
