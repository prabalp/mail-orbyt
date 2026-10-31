import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Real password hashing is slow on shared CI runners.
    testTimeout: 20_000,
  },
});
