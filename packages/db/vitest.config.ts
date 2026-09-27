import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The ledger tests exercise real row locks, so they must not share a database.
    fileParallelism: false,
    testTimeout: 30_000
  }
});
