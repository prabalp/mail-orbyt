import { parse } from "node-html-parser";

/**
 * Strips script/style/noscript content and collapses whitespace to get the
 * plain visible text of a page. The leading `<!doctype ...>` declaration is
 * stripped before parsing — node-html-parser doesn't treat it as an element,
 * so it would otherwise leak verbatim into `textContent`.
 */
export function extractVisibleText(html: string): string {
  const withoutDoctype = html.replace(/<!doctype[^>]*>/i, "");
  const root = parse(withoutDoctype);
  for (const el of root.querySelectorAll("script, style, noscript")) {
    el.remove();
  }
  return root.textContent.replace(/\s+/g, " ").trim();
}
