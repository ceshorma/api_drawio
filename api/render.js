const crypto = require("crypto");

const MAX_XML_LENGTH = 500_000; // 500KB

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // --- Auth ---
  const secret = process.env.API_SECRET;
  if (!secret) {
    console.error("API_SECRET environment variable is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : "";

  if (!token || !safeEqual(token, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // --- Validate body ---
  const { xml, scale } = req.body || {};

  if (!xml || typeof xml !== "string" || xml.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "xml is required and must be a non-empty string." });
  }

  if (xml.length > MAX_XML_LENGTH) {
    return res.status(400).json({
      error: `xml exceeds maximum length of ${MAX_XML_LENGTH} characters.`,
    });
  }

  const diagramScale = Math.min(Math.max(Number(scale) || 2, 1), 4);

  // --- Proxy to export.diagrams.net ---
  const params = new URLSearchParams({
    xml,
    format: "png",
    scale: String(diagramScale),
  });

  try {
    const upstream = await fetch("https://export.diagrams.net/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: "Export service failed",
        status: upstream.status,
        details: text.slice(0, 500),
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Export service error:", err.message || err);
    return res.status(502).json({ error: "Export service unavailable" });
  }
};

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
