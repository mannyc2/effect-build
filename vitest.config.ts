import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Resolve the core package from source so no suite needs a prior build.
const core = (module: string) => resolve(import.meta.dirname, `packages/effect-build/src/${module}.ts`);

export default defineConfig({
  resolve: {
    alias: {
      "effect-build/Artifact": core("Artifact"),
      "effect-build/BuildError": core("BuildError"),
      "effect-build/Target": core("Target"),
      "effect-build/Toolchain": core("Toolchain"),
    },
  },
  test: {
    passWithNoTests: false,
    include: ["test/**/*.test.ts"],
  },
});
