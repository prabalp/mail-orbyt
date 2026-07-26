import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    testTimeout: 20000,
    // Integration tests share one real Postgres/Redis/MinIO — run serially
    // to avoid cross-test interference within the same organisation data.
    fileParallelism: false,
  },
});
