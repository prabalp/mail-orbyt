import { parse } from "node-html-parser";

export type OpenGraphTags = Record<string, string>;

/** Extracts `<meta property="og:*">` tags into a flat record, e.g. `{ "og:description": "..." }`. */
export function extractOpenGraph(html: string): OpenGraphTags {
  const root = parse(html);
  const tags: OpenGraphTags = {};

  for (const meta of root.querySelectorAll("meta")) {
    const property = meta.getAttribute("property");
    const content = meta.getAttribute("content");
    if (property?.startsWith("og:") && content) {
      tags[property] = content;
    }
  }

  return tags;
}

export interface MetaTags {
  title?: string;
  description?: string;
}

/** Extracts the document `<title>` and `<meta name="description">`. */
export function extractMetaTags(html: string): MetaTags {
  const root = parse(html);
  const title = root.querySelector("title")?.textContent.trim();
  const description = root
    .querySelectorAll("meta")
    .find((meta) => meta.getAttribute("name")?.toLowerCase() === "description")
    ?.getAttribute("content")
    ?.trim();

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}
