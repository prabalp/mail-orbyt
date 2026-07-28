// @ts-check
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

const AI_SDK_IMPORT_PATTERNS = [
  {
    group: [
      "@anthropic-ai/sdk",
      "@anthropic-ai/sdk/*",
      "openai",
      "openai/*",
      "@google/genai",
      "@google/genai/*",
    ],
    message:
      "AI provider SDKs may only be imported from packages/email-generation. See docs/ai-boundaries.md.",
  },
];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript itself catches undefined variables/types; no-undef doesn't
      // understand ambient type namespaces (e.g. NodeJS.ProcessEnv) and
      // produces false positives on valid TS-only constructs.
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-restricted-imports": ["error", { patterns: AI_SDK_IMPORT_PATTERNS }],
    },
  },
  {
    files: ["packages/email-generation/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  prettierConfig,
];
