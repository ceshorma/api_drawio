import { JSDOM } from "jsdom";
import { Resvg } from "@resvg/resvg-js";
import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflateRawAsync = promisify(inflateRaw);

export interface DrawioOptions {
  scale?: number;
  width?: number;
  height?: number;
}

interface MxCell {
  id: string;
  value: string;
  style: Record<string, string>;
  isVertex: boolean;
  isEdge: boolean;
  parent: string;
  geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
    relative?: boolean;
    points?: { x: number; y: number }[];
    sourcePoint?: { x: number; y: number };
    targetPoint?: { x: number; y: number };
  };
  source?: string;
  target?: string;
}

function parseStyle(styleStr: string): Record<string, string> {
  const style: Record<string, string> = {};
  if (!styleStr) return style;
  for (const part of styleStr.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx >= 0) {
      style[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
    } else {
      // Shape names like "ellipse" have no value
      style.shape = trimmed;
    }
  }
  return style;
}

async function decodeDrawioContent(xmlString: string): Promise<string> {
  const trimmed = xmlString.trim();

  if (trimmed.startsWith("<mxGraphModel")) {
    return trimmed;
  }

  const dom = new JSDOM(trimmed, { contentType: "text/xml" });
  const doc = dom.window.document;

  const diagramEl = doc.querySelector("diagram");
  if (diagramEl) {
    const inner = diagramEl.textContent?.trim();
    if (inner) {
      if (inner.startsWith("<")) {
        dom.window.close();
        return inner;
      }
      try {
        const decoded = Buffer.from(inner, "base64");
        const inflated = await inflateRawAsync(decoded);
        dom.window.close();
        return decodeURIComponent(inflated.toString("utf-8"));
      } catch {
        dom.window.close();
        return Buffer.from(inner, "base64").toString("utf-8");
      }
    }
  }

  dom.window.close();
  return trimmed;
}

function parseCells(xmlString: string): MxCell[] {
  const dom = new JSDOM(xmlString, { contentType: "text/xml" });
  const doc = dom.window.document;
  const cellElements = doc.querySelectorAll("mxCell");
  const cells: MxCell[] = [];

  for (const el of cellElements) {
    const geoEl = el.querySelector("mxGeometry");
    let geometry: MxCell["geometry"] | undefined;

    if (geoEl) {
      const points: { x: number; y: number }[] = [];
      let sourcePoint: { x: number; y: number } | undefined;
      let targetPoint: { x: number; y: number } | undefined;

      const pointEls = geoEl.querySelectorAll(":scope > mxPoint");
      for (const pt of pointEls) {
        const px = parseFloat(pt.getAttribute("x") || "0");
        const py = parseFloat(pt.getAttribute("y") || "0");
        const as = pt.getAttribute("as");
        if (as === "sourcePoint") {
          sourcePoint = { x: px, y: py };
        } else if (as === "targetPoint") {
          targetPoint = { x: px, y: py };
        } else {
          points.push({ x: px, y: py });
        }
      }

      const arrayEl = geoEl.querySelector("Array");
      if (arrayEl) {
        const waypoints = arrayEl.querySelectorAll("mxPoint");
        for (const pt of waypoints) {
          points.push({
            x: parseFloat(pt.getAttribute("x") || "0"),
            y: parseFloat(pt.getAttribute("y") || "0"),
          });
        }
      }

      geometry = {
        x: parseFloat(geoEl.getAttribute("x") || "0"),
        y: parseFloat(geoEl.getAttribute("y") || "0"),
        width: parseFloat(geoEl.getAttribute("width") || "0"),
        height: parseFloat(geoEl.getAttribute("height") || "0"),
        relative: geoEl.getAttribute("relative") === "1",
        points: points.length > 0 ? points : undefined,
        sourcePoint,
        targetPoint,
      };
    }

    cells.push({
      id: el.getAttribute("id") || "",
      value: el.getAttribute("value") || "",
      style: parseStyle(el.getAttribute("style") || ""),
      isVertex: el.getAttribute("vertex") === "1",
      isEdge: el.getAttribute("edge") === "1",
      parent: el.getAttribute("parent") || "",
      geometry,
      source: el.getAttribute("source") || undefined,
      target: el.getAttribute("target") || undefined,
    });
  }

  dom.window.close();
  return cells;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateSvg(cells: MxCell[]): string {
  const cellMap = new Map<string, MxCell>();
  for (const c of cells) cellMap.set(c.id, c);

  // Calculate bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const cell of cells) {
    if (!cell.geometry) continue;
    const { x, y, width, height } = cell.geometry;

    if (cell.isVertex) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    if (cell.geometry.points) {
      for (const pt of cell.geometry.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }
    if (cell.geometry.sourcePoint) {
      minX = Math.min(minX, cell.geometry.sourcePoint.x);
      minY = Math.min(minY, cell.geometry.sourcePoint.y);
      maxX = Math.max(maxX, cell.geometry.sourcePoint.x);
      maxY = Math.max(maxY, cell.geometry.sourcePoint.y);
    }
    if (cell.geometry.targetPoint) {
      minX = Math.min(minX, cell.geometry.targetPoint.x);
      minY = Math.min(minY, cell.geometry.targetPoint.y);
      maxX = Math.max(maxX, cell.geometry.targetPoint.x);
      maxY = Math.max(maxY, cell.geometry.targetPoint.y);
    }
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const padding = 30;
  const svgWidth = maxX - minX + padding * 2;
  const svgHeight = maxY - minY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  const elements: string[] = [];

  // Arrow markers
  elements.push(`<defs>`);
  elements.push(
    `  <marker id="arrow" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto"><polygon points="0 0, 12 4, 0 8" fill="#333" /></marker>`
  );
  elements.push(
    `  <marker id="arrow-open" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto"><polyline points="0 0, 12 4, 0 8" fill="none" stroke="#333" stroke-width="1" /></marker>`
  );
  elements.push(`</defs>`);

  // Render edges first (behind vertices)
  for (const cell of cells) {
    if (!cell.isEdge) continue;
    renderEdge(cell, cellMap, elements, offsetX, offsetY);
  }

  // Render vertices
  for (const cell of cells) {
    if (!cell.isVertex) continue;
    renderVertex(cell, elements, offsetX, offsetY);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n${elements.join("\n")}\n</svg>`;
}

function renderVertex(
  cell: MxCell,
  elements: string[],
  offsetX: number,
  offsetY: number
): void {
  if (!cell.geometry) return;

  const { x, y, width, height } = cell.geometry;
  const style = cell.style;
  const cx = x + offsetX;
  const cy = y + offsetY;

  const fillColor = style.fillColor || "#ffffff";
  const strokeColor = style.strokeColor || "#000000";
  const strokeWidth = parseFloat(style.strokeWidth || "1");
  const opacity = parseFloat(style.opacity || "100") / 100;
  const rounded = style.rounded === "1";
  const dashed = style.dashed === "1";
  const fontColor = style.fontColor || "#333333";
  const fontSize = parseFloat(style.fontSize || "12");
  const fontFamily = style.fontFamily || "Helvetica, Arial, sans-serif";
  const fontStyleNum = parseInt(style.fontStyle || "0", 10);
  const isBold = (fontStyleNum & 1) !== 0;
  const isItalic = (fontStyleNum & 2) !== 0;
  const isUnderline = (fontStyleNum & 4) !== 0;

  // Text-only shapes (no visible border)
  const isTextOnly =
    style.shape === "text" ||
    (fillColor === "none" && strokeColor === "none");

  const dashArray = dashed ? ' stroke-dasharray="8 4"' : "";
  const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : "";

  const shape = style.shape || "";

  if (!isTextOnly) {
    if (shape === "ellipse" || style.ellipse === "1") {
      elements.push(
        `<ellipse cx="${cx + width / 2}" cy="${cy + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "rhombus") {
      const mx = cx + width / 2;
      const my = cy + height / 2;
      elements.push(
        `<polygon points="${mx},${cy} ${cx + width},${my} ${mx},${cy + height} ${cx},${my}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "cylinder" || shape === "cylinder3") {
      const ry = Math.min(height * 0.1, 15);
      elements.push(
        `<path d="M ${cx},${cy + ry} L ${cx},${cy + height - ry} A ${width / 2},${ry} 0 0,0 ${cx + width},${cy + height - ry} L ${cx + width},${cy + ry}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
      elements.push(
        `<ellipse cx="${cx + width / 2}" cy="${cy + ry}" rx="${width / 2}" ry="${ry}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${opacityAttr} />`
      );
    } else if (shape === "hexagon") {
      const inset = width * 0.2;
      elements.push(
        `<polygon points="${cx + inset},${cy} ${cx + width - inset},${cy} ${cx + width},${cy + height / 2} ${cx + width - inset},${cy + height} ${cx + inset},${cy + height} ${cx},${cy + height / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "parallelogram") {
      const skew = width * 0.2;
      elements.push(
        `<polygon points="${cx + skew},${cy} ${cx + width},${cy} ${cx + width - skew},${cy + height} ${cx},${cy + height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "triangle") {
      elements.push(
        `<polygon points="${cx + width / 2},${cy} ${cx + width},${cy + height} ${cx},${cy + height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "cloud") {
      const w = width,
        h = height;
      elements.push(
        `<path d="M ${cx + w * 0.25},${cy + h * 0.75} C ${cx},${cy + h * 0.75} ${cx},${cy + h * 0.4} ${cx + w * 0.15},${cy + h * 0.35} C ${cx + w * 0.05},${cy + h * 0.1} ${cx + w * 0.3},${cy} ${cx + w * 0.45},${cy + h * 0.15} C ${cx + w * 0.5},${cy} ${cx + w * 0.75},${cy} ${cx + w * 0.8},${cy + h * 0.2} C ${cx + w},${cy + h * 0.15} ${cx + w},${cy + h * 0.5} ${cx + w * 0.85},${cy + h * 0.55} C ${cx + w},${cy + h * 0.7} ${cx + w * 0.85},${cy + h * 0.85} ${cx + w * 0.7},${cy + h * 0.8} C ${cx + w * 0.6},${cy + h} ${cx + w * 0.35},${cy + h * 0.95} ${cx + w * 0.25},${cy + h * 0.75} Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    } else if (shape === "doubleEllipse") {
      elements.push(
        `<ellipse cx="${cx + width / 2}" cy="${cy + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
      elements.push(
        `<ellipse cx="${cx + width / 2}" cy="${cy + height / 2}" rx="${width / 2 - 4}" ry="${height / 2 - 4}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"${opacityAttr} />`
      );
    } else {
      // Default: rectangle
      const rx = rounded ? Math.min(6, width / 4, height / 4) : 0;
      elements.push(
        `<rect x="${cx}" y="${cy}" width="${width}" height="${height}" rx="${rx}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${opacityAttr} />`
      );
    }
  }

  // Render text label
  if (cell.value) {
    const text = stripHtml(cell.value);
    if (text.trim()) {
      const textX = cx + width / 2;
      const textY = cy + height / 2;
      const fontWeight = isBold ? "bold" : "normal";
      const fontStyleStr = isItalic ? "italic" : "normal";
      const textDecoration = isUnderline ? ' text-decoration="underline"' : "";

      const lines = text.split(/\n/);
      const lineHeight = fontSize * 1.3;
      const startY = textY - ((lines.length - 1) * lineHeight) / 2;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        elements.push(
          `<text x="${textX}" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="central" fill="${fontColor}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}" font-style="${fontStyleStr}"${textDecoration}>${escapeXml(line)}</text>`
        );
      }
    }
  }
}

function renderEdge(
  cell: MxCell,
  cellMap: Map<string, MxCell>,
  elements: string[],
  offsetX: number,
  offsetY: number
): void {
  const style = cell.style;
  const strokeColor = style.strokeColor || "#333333";
  const strokeWidth = parseFloat(style.strokeWidth || "1");
  const dashed = style.dashed === "1";
  const fontColor = style.fontColor || "#333333";
  const fontSize = parseFloat(style.fontSize || "11");

  const points: { x: number; y: number }[] = [];

  // Source point
  if (cell.source) {
    const src = cellMap.get(cell.source);
    if (src?.geometry) {
      points.push({
        x: src.geometry.x + src.geometry.width / 2 + offsetX,
        y: src.geometry.y + src.geometry.height / 2 + offsetY,
      });
    }
  } else if (cell.geometry?.sourcePoint) {
    points.push({
      x: cell.geometry.sourcePoint.x + offsetX,
      y: cell.geometry.sourcePoint.y + offsetY,
    });
  }

  // Waypoints
  if (cell.geometry?.points) {
    for (const pt of cell.geometry.points) {
      points.push({ x: pt.x + offsetX, y: pt.y + offsetY });
    }
  }

  // Target point
  if (cell.target) {
    const tgt = cellMap.get(cell.target);
    if (tgt?.geometry) {
      points.push({
        x: tgt.geometry.x + tgt.geometry.width / 2 + offsetX,
        y: tgt.geometry.y + tgt.geometry.height / 2 + offsetY,
      });
    }
  } else if (cell.geometry?.targetPoint) {
    points.push({
      x: cell.geometry.targetPoint.x + offsetX,
      y: cell.geometry.targetPoint.y + offsetY,
    });
  }

  if (points.length < 2) return;

  // Clip endpoints to shape bounding boxes
  if (cell.source) {
    const src = cellMap.get(cell.source);
    if (src?.geometry) {
      points[0] = clipToRect(
        src.geometry.x + offsetX,
        src.geometry.y + offsetY,
        src.geometry.width,
        src.geometry.height,
        points[1].x,
        points[1].y
      );
    }
  }
  if (cell.target) {
    const tgt = cellMap.get(cell.target);
    if (tgt?.geometry) {
      points[points.length - 1] = clipToRect(
        tgt.geometry.x + offsetX,
        tgt.geometry.y + offsetY,
        tgt.geometry.width,
        tgt.geometry.height,
        points[points.length - 2].x,
        points[points.length - 2].y
      );
    }
  }

  // Build orthogonal or straight path
  const edgeStyle = style.edgeStyle || "";
  let pathData: string;

  if (
    edgeStyle === "orthogonalEdgeStyle" ||
    edgeStyle === "elbowEdgeStyle"
  ) {
    pathData = buildOrthogonalPath(points);
  } else {
    pathData = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
      .join(" ");
  }

  const dashArray = dashed ? ' stroke-dasharray="8 4"' : "";

  // Arrow markers
  const endArrow =
    style.endArrow !== "none" && style.endArrow !== "open"
      ? ' marker-end="url(#arrow)"'
      : style.endArrow === "open"
        ? ' marker-end="url(#arrow-open)"'
        : "";

  elements.push(
    `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashArray}${endArrow} />`
  );

  // Edge label
  if (cell.value) {
    const text = stripHtml(cell.value);
    if (text.trim()) {
      const midIdx = Math.floor(points.length / 2);
      const mid =
        points.length % 2 === 0
          ? {
              x: (points[midIdx - 1].x + points[midIdx].x) / 2,
              y: (points[midIdx - 1].y + points[midIdx].y) / 2,
            }
          : points[midIdx];

      const labelWidth = text.length * fontSize * 0.55 + 8;
      const labelHeight = fontSize * 1.4;
      elements.push(
        `<rect x="${mid.x - labelWidth / 2}" y="${mid.y - labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" fill="white" opacity="0.9" rx="3" />`
      );
      elements.push(
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="central" fill="${fontColor}" font-size="${fontSize}" font-family="Helvetica, Arial, sans-serif">${escapeXml(text)}</text>`
      );
    }
  }
}

function buildOrthogonalPath(
  points: { x: number; y: number }[]
): string {
  if (points.length < 2) return "";
  const parts = [`M ${points[0].x},${points[0].y}`];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (i === points.length - 1 && points.length === 2) {
      // Simple two-point edge: go horizontal then vertical
      const midX = (prev.x + curr.x) / 2;
      parts.push(`L ${midX},${prev.y}`);
      parts.push(`L ${midX},${curr.y}`);
      parts.push(`L ${curr.x},${curr.y}`);
    } else {
      parts.push(`L ${curr.x},${curr.y}`);
    }
  }

  return parts.join(" ");
}

function clipToRect(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  fromX: number,
  fromY: number
): { x: number; y: number } {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = fromX - cx;
  const dy = fromY - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let t: number;
  if (absDx * rh > absDy * rw) {
    t = rw / 2 / absDx;
  } else {
    t = rh / 2 / absDy;
  }

  return { x: cx + dx * t, y: cy + dy * t };
}

export async function renderDrawio(
  xmlContent: string,
  options: DrawioOptions = {}
): Promise<Buffer> {
  const { scale = 2 } = options;

  const graphXml = await decodeDrawioContent(xmlContent);
  const cells = parseCells(graphXml);

  if (cells.filter((c) => c.isVertex || c.isEdge).length === 0) {
    throw new Error("No diagram elements found in the draw.io XML");
  }

  const svgString = generateSvg(cells);

  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: "zoom",
      value: scale,
    },
    background: "rgba(0, 0, 0, 0)",
  });

  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
