import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests-emulador/**/*.test.mjs"], testTimeout: 30000, fileParallelism: false },
});
