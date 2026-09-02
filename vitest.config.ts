import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Resolve the core package from source so no suite needs a prior build.
const core = (module: string) => resolve(import.meta.dirname, `packages/effect-build/src/${module}.ts`);

export default defineConfig({
  resolve: {
    alias: {
      "effect-build/Artifact": core("Artifact"),
      "effect-build/Author/BorrowedOutput": core("Author/BorrowedOutput"),
      "effect-build/Author/Executable": core("Author/Executable"),
      "effect-build/Author/File": core("Author/File"),
      "effect-build/Author/Tool": core("Author/Tool"),
      "effect-build/Author/Tree": core("Author/Tree"),
      "effect-build/Matrix": core("Matrix"),
      "effect-build/SystemTarget": core("SystemTarget"),
    },
  },
  test: {
    passWithNoTests: false,
    include: ["test/**/*.test.ts"],
    maxConcurrency: 8,
  },
});
