#!/usr/bin/env npx ts-node
/**
 * Standalone diagram generator powered by Claude API.
 *
 * Takes a text description, uses Claude to generate a Mermaid or draw.io diagram,
 * then calls the diagram-to-png API to produce a PNG file.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx ts-node tools/generate-diagram.ts "architecture of a microservices app"
 *   ANTHROPIC_API_KEY=sk-... npx ts-node tools/generate-diagram.ts --type drawio "AWS infrastructure with VPC, EC2, and RDS"
 *   ANTHROPIC_API_KEY=sk-... npx ts-node tools/generate-diagram.ts --output my-diagram.png "user login flow"
 *
 * Environment:
 *   ANTHROPIC_API_KEY  - Required. Your Anthropic API key.
 *   DIAGRAM_API_URL    - Optional. Defaults to http://localhost:3000/api/diagram-to-png
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = "http://localhost:3000/api/diagram-to-png";

interface Config {
  description: string;
  preferredType?: "mermaid" | "drawio";
  outputPath: string;
  apiUrl: string;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  let preferredType: "mermaid" | "drawio" | undefined;
  let outputPath = "diagram.png";
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      const t = args[++i];
      if (t === "mermaid" || t === "drawio") preferredType = t;
      else {
        console.error(`Invalid type: ${t}. Use "mermaid" or "drawio".`);
        process.exit(1);
      }
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        `Usage: npx ts-node tools/generate-diagram.ts [--type mermaid|drawio] [--output file.png] "description"`
      );
      process.exit(0);
    } else {
      positional.push(args[i]);
    }
  }

  const description = positional.join(" ").trim();
  if (!description) {
    console.error("Error: Please provide a diagram description.");
    console.error(
      `Usage: npx ts-node tools/generate-diagram.ts "description of the diagram"`
    );
    process.exit(1);
  }

  return {
    description,
    preferredType,
    outputPath,
    apiUrl: process.env.DIAGRAM_API_URL || DEFAULT_API_URL,
  };
}

// ---------------------------------------------------------------------------
// Diagram-to-PNG API call
// ---------------------------------------------------------------------------

function postDiagramApi(
  apiUrl: string,
  body: { type: string; content: string; scale?: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl);
    const payload = JSON.stringify(body);
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `API returned ${res.statusCode}: ${data.toString("utf-8")}`
              )
            );
          } else {
            resolve(data);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Claude tool definition
// ---------------------------------------------------------------------------

const renderDiagramTool: Anthropic.Tool = {
  name: "render_diagram",
  description:
    "Renders a Mermaid or draw.io XML diagram to a PNG image. " +
    "Call this tool with the diagram code once you have generated it. " +
    "The tool returns success or an error message you can use to fix the diagram.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["mermaid", "drawio"],
        description: "The diagram format.",
      },
      content: {
        type: "string",
        description:
          "The full diagram code. Mermaid syntax or draw.io XML (<mxGraphModel>...</mxGraphModel>).",
      },
    },
    required: ["type", "content"],
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const client = new Anthropic();

  const typeHint = config.preferredType
    ? `Use ${config.preferredType} format.`
    : "Choose the best format (Mermaid for flowcharts/sequences, draw.io XML for architecture/infrastructure).";

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Generate a diagram for the following description and render it using the render_diagram tool.\n\n${typeHint}\n\nDescription: ${config.description}`,
    },
  ];

  console.log(`Generating diagram for: "${config.description}"`);
  console.log(`API endpoint: ${config.apiUrl}`);
  console.log();

  let pngBuffer: Buffer | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (!pngBuffer && attempts < maxAttempts) {
    attempts++;

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        "You are an expert diagram designer. When asked to create a diagram, " +
        "generate clean, well-structured diagram code and use the render_diagram tool " +
        "to render it. For Mermaid, use valid Mermaid syntax. For draw.io, generate " +
        "valid mxGraphModel XML with proper mxCell elements including geometry and styles. " +
        "If the tool returns an error, analyze it and try again with fixed code.",
      tools: [renderDiagramTool],
      messages,
    });

    // Process response content
    for (const block of response.content) {
      if (block.type === "text") {
        console.log(block.text);
      }
    }

    // Find tool use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      if (response.stop_reason === "end_turn") {
        console.error(
          "\nClaude did not use the render tool. Try being more specific."
        );
        process.exit(1);
      }
      break;
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as { type: string; content: string };
      console.log(`\nRendering ${input.type} diagram (attempt ${attempts})...`);

      try {
        pngBuffer = await postDiagramApi(config.apiUrl, {
          type: input.type,
          content: input.content,
          scale: 2,
        });
        console.log(`PNG generated: ${pngBuffer.length} bytes`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Success! PNG generated (${pngBuffer.length} bytes).`,
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        console.error(`Render failed: ${errorMsg}`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error rendering diagram: ${errorMsg}. Please fix the diagram code and try again.`,
          is_error: true,
        });
      }
    }

    // Feed tool results back to Claude
    messages.push({ role: "user", content: toolResults });
  }

  if (pngBuffer) {
    fs.writeFileSync(config.outputPath, pngBuffer);
    console.log(`\nDiagram saved to: ${config.outputPath}`);
  } else {
    console.error(
      `\nFailed to generate diagram after ${maxAttempts} attempts.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
