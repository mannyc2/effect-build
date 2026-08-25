import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Resolve the core package from source so no suite needs a prior build.
const core = (module: string) => resolve(import.meta.dirname, `packages/effect-build/src/${module}.ts`);

export default defineConfig({
  resolve: {
    alias: {
      "effect-build/Artifact": core("Artifact"),
      "effect-build/Author/BorrowedContent": core("Author/BorrowedContent"),
      "effect-build/Author/Generation": core("Author/Generation"),
      "effect-build/Author/NodeMain": core("Author/NodeMain"),
      "effect-build/Author/Tool": core("Author/Tool"),
      "effect-build/Author/TreeSnapshot": core("Author/TreeSnapshot"),
      "effect-build/BuildError": core("BuildError"),
      "effect-build/Profile/StaticBrowserApplication": core("Profile/StaticBrowserApplication"),
      "effect-build/Target": core("Target"),
    },
  },
  test: {
    passWithNoTests: false,
    include: ["test/**/*.test.ts"],
  },
});
