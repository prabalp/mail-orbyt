import { parse } from "node-html-parser";

export interface JsonLdNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

/**
 * Extracts every `<script type="application/ld+json">` block, parses it,
 * and flattens `@graph` arrays — deterministic structured-data extraction,
 * no AI/inference involved. Malformed JSON-LD blocks are skipped rather
 * than failing the whole extraction (real-world pages routinely ship
 * invalid JSON-LD).
 */
export function extractJsonLd(html: string): JsonLdNode[] {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  const nodes: JsonLdNode[] = [];

  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        const graph = (candidate as JsonLdNode)["@graph"];
        if (Array.isArray(graph)) {
          nodes.push(
            ...graph.filter((node): node is JsonLdNode =>
              Boolean(node && typeof node === "object"),
            ),
          );
        } else {
          nodes.push(candidate as JsonLdNode);
        }
      }
    }
  }

  return nodes;
}

function typeMatches(node: JsonLdNode, type: string): boolean {
  const nodeType = node["@type"];
  if (typeof nodeType === "string") return nodeType === type;
  if (Array.isArray(nodeType)) return nodeType.includes(type);
  return false;
}

export function findByType(nodes: JsonLdNode[], type: string): JsonLdNode[] {
  return nodes.filter((node) => typeMatches(node, type));
}
