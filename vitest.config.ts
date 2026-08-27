import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { defineConfig } from "vitest/config";

// Resolve the core package from source so no suite needs a prior build. The
// subpath rule follows the manifest hard cut without another hand-maintained
// alias inventory.
const coreRoot = resolve(import.meta.dirname, "packages/effect-build/src");
const packedNodeModules = process.env.EFFECT_BUILD_PACKED_NODE_MODULES;
const packedPackage = process.env.EFFECT_BUILD_PACKED_PACKAGE;

const packedResolution = packedNodeModules === undefined || packedPackage === undefined
  ? undefined
  : (() => {
    const require = createRequire(resolve(packedNodeModules, "../package.json"));
    const sourceRoots = ["effect-build", packedPackage].map((name) => ({
      name,
      source: `${resolve(import.meta.dirname, "packages", name, "src")}${sep}`,
      dist: resolve(packedNodeModules, name, "dist"),
    }));
    return {
      plugin: {
        name: "effect-build-packed-consumer",
        enforce: "pre" as const,
        resolveId(source: string, importer?: string) {
          if (source === "effect-build" || source.startsWith("effect-build/")) {
            const subpath = source === "effect-build" ? "index" : source.slice("effect-build/".length);
            const candidate = resolve(packedNodeModules, "effect-build", "dist", `${subpath}.js`);
            if (!existsSync(candidate)) throw new Error(`packed effect-build module is missing: ${candidate}`);
            return candidate;
          }
          if (
            source === "effect"
            || source.startsWith("effect/")
            || source === "@effect/platform-node"
            || source.startsWith("@effect/platform-node/")
          ) return require.resolve(source);
          if (importer === undefined || !source.startsWith(".")) return null;
          const importerPath = importer.split("?", 1)[0] ?? importer;
          const absolute = resolve(dirname(importerPath), source);
          for (const root of sourceRoots) {
            if (!absolute.startsWith(root.source)) continue;
            const candidate = resolve(root.dist, relative(root.source, absolute));
            if (!existsSync(candidate)) {
              throw new Error(`packed ${root.name} module is missing: ${candidate}`);
            }
            return candidate;
          }
          return null;
        },
      },
    };
  })();

export default defineConfig({
  plugins: packedResolution === undefined ? [] : [packedResolution.plugin],
  resolve: {
    alias: packedResolution === undefined
      ? [
        { find: /^effect-build\/(.+)$/u, replacement: resolve(coreRoot, "$1.ts") },
        { find: "effect-build", replacement: resolve(coreRoot, "index.ts") },
      ]
      : [],
  },
  test: {
    passWithNoTests: false,
    include: ["test/**/*.test.ts"],
  },
});
