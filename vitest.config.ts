import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: false,
    include: ["test/**/*.test.ts", "test/host/standalone-node.smoke.ts"],
    exclude: ["test/consumer/**"],
  },
});
