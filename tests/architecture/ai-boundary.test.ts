import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture boundary: only packages/email-generation may import an AI
 * provider SDK, adapter, or reference the AI provider API key. Every other
 * package/app in the monorepo (including apps/web and apps/worker) must be
 * free of these imports so that scraping, CSV parsing, validation,
 * scheduling, reply classification, and analytics can never silently start
 * calling an LLM.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const ALLOWED_PACKAGE = "packages/email-generation";
const SCAN_ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIR_NAMES = new Set(["node_modules", "dist", ".next", ".turbo", "coverage"]);

// Matches the AI SDK package itself and any hypothetical alternate providers,
// plus direct references to the provider API key env var, outside the one
// allowed package.
const FORBIDDEN_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "AI provider SDK import (@anthropic-ai/sdk)", pattern: /@anthropic-ai\/sdk/ },
  { label: "AI provider SDK import (openai)", pattern: /from\s+["']openai["']/ },
  {
    label: "AI provider API key usage",
    pattern: /(process\.env|env)\.AI_PROVIDER_API_KEY/,
  },
  {
    label: "direct AI provider adapter import outside email-generation",
    pattern: /@mail-orbyt\/email-generation\/src\/client/,
  },
];

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("AI SDK import boundary", () => {
  const files = SCAN_ROOTS.flatMap((root) => {
    const rootPath = join(REPO_ROOT, root);
    try {
      return collectSourceFiles(rootPath);
    } catch {
      return [];
    }
  });

  it("scans a non-trivial number of source files", () => {
    // Guards against this test silently passing because the scan found nothing.
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const relativePath = relative(REPO_ROOT, file);
    const isAllowed = relativePath.startsWith(ALLOWED_PACKAGE);

    if (isAllowed) continue;

    it(`${relativePath} does not import the AI provider SDK or key`, () => {
      const content = readFileSync(file, "utf-8");
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${relativePath} contains forbidden ${label}`).toBe(false);
      }
    });
  }

  it("packages/email-generation is the only package declaring the AI SDK as a dependency", () => {
    const allPackageJsonDirs = new Set<string>();
    for (const root of SCAN_ROOTS) {
      const rootPath = join(REPO_ROOT, root);
      let entries: string[] = [];
      try {
        entries = readdirSync(rootPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        allPackageJsonDirs.add(join(rootPath, entry));
      }
    }

    const offenders: string[] = [];
    for (const dir of allPackageJsonDirs) {
      const pkgJsonPath = join(dir, "package.json");
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
          name?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        const hasAiSdk = Object.keys(deps).some(
          (dep) => dep.includes("anthropic") || dep === "openai",
        );
        if (hasAiSdk && pkgJson.name !== "@mail-orbyt/email-generation") {
          offenders.push(pkgJson.name ?? dir);
        }
      } catch {
        continue;
      }
    }

    expect(offenders, `unexpected AI SDK dependency in: ${offenders.join(", ")}`).toEqual([]);
  });
});
