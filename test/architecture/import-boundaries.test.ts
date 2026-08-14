import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const packagesRoot = resolve(root, "packages");
const providerPackages = ["effect-build-bun", "effect-build-deno", "effect-build-node-sea"] as const;

const sourceFiles = async (): Promise<string[]> => {
  const entries = await readdir(packagesRoot, { recursive: true });
  return entries
    .filter((entry) => !entry.includes("node_modules/") && /(?:^|\/)src\/.*\.ts$/.test(entry))
    .map((entry) => resolve(packagesRoot, entry));
};

const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("source ownership boundaries", () => {
  it("keeps every public-package source on Effect platform-neutral services", async () => {
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/^import[^;\n]*from ["']node:/m);
      expect(source, file).not.toContain("Effect.runPromise");
    }
  });

  it("confines esbuild to the Node SEA package-private bundle producer", async () => {
    const allowed = resolve(root, "packages/effect-build-node-sea/src/internal/Esbuild.ts");
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if (importSpecifiers(await readFile(file, "utf8")).includes("esbuild")) found.push(file);
    }
    expect(found).toEqual([allowed]);
    const producer = await readFile(allowed, "utf8");
    expect(producer).not.toContain(".watch(");
    expect(producer).not.toContain("esbuild.stop");
  });

  it("keeps one core-owned process implementation and forbids shell or download escapes", async () => {
    const processImporters: string[] = [];
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      if (source.includes("effect/unstable/process")) processImporters.push(relative(root, file));
      expect(source, file).not.toMatch(/\b(?:exec|spawn)Sync\b|\bexecFileSync\b/);
    }
    expect(processImporters.sort()).toEqual([
      "packages/effect-build/src/Integration.ts",
      "packages/effect-build/src/Provider.ts",
      "packages/effect-build/src/standalone/internal/CompilerEngine.ts",
      "packages/effect-build/src/standalone/internal/ToolDiscovery.ts",
    ]);
    const integration = await readFile(resolve(root, "packages/effect-build/src/Integration.ts"), "utf8");
    expect(integration.match(/ChildProcess\.make\(/g)).toHaveLength(1);
    const nodeSea = await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/NodeSea.ts"), "utf8");
    expect(nodeSea).not.toMatch(/postject|download|npm|pnpm|yarn|bun add|https?:\/\//i);
  });

  it("keeps core provider-neutral and provider dependencies one-way", async () => {
    for (
      const file of (await sourceFiles()).filter((path) => path.startsWith(resolve(root, "packages/effect-build/src")))
    ) {
      for (const specifier of importSpecifiers(await readFile(file, "utf8"))) {
        expect(specifier, file).not.toMatch(/^effect-build-(?:bun|deno|node-sea)(?:\/|$)/);
      }
    }
    for (const provider of providerPackages) {
      for (
        const file of (await sourceFiles()).filter((path) => path.startsWith(resolve(root, `packages/${provider}/src`)))
      ) {
        for (const specifier of importSpecifiers(await readFile(file, "utf8"))) {
          expect(specifier, file).not.toMatch(/^effect-build\/(?:internal|standalone)/);
          for (const sibling of providerPackages) {
            if (sibling !== provider) expect(specifier, file).not.toMatch(new RegExp(`^${sibling}(?:/|$)`));
          }
        }
      }
    }
  });

  it("keeps lifecycle and Node SEA stage implementations out of public entrypoints", async () => {
    const lifecycle = await readFile(
      resolve(root, "packages/effect-build/src/standalone/internal/ExecutableLifecycle.ts"),
      "utf8",
    );
    expect(lifecycle).not.toMatch(/effect-build-(?:bun|deno|node-sea)/);

    for (const provider of providerPackages) {
      const source = await readFile(resolve(root, `packages/${provider}/src/index.ts`), "utf8");
      expect(source).not.toMatch(/ExecutableLifecycle|ChildProcessSpawner|JavaScriptBundleArtifact|NodeSeaService/);
    }
    const coreIndex = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    expect(coreIndex).not.toMatch(/Esbuild|NodeSea|ExecutableLifecycle|Process/);
  });

  it("keeps one closed provider-target authority", async () => {
    const authority = await readFile(resolve(root, "packages/effect-build/src/internal/ProviderContracts.ts"), "utf8");
    expect(authority.match(/export const ProviderContracts\b/g)).toHaveLength(1);
    for (const provider of ["bun", "deno"]) expect(authority).toContain(`${provider}:`);
    expect(authority).toContain('"node-sea":');

    for (const provider of providerPackages) {
      const sources = (await sourceFiles()).filter((path) =>
        path.startsWith(resolve(root, `packages/${provider}/src`))
      );
      for (const file of sources) {
        expect(await readFile(file, "utf8"), file).not.toContain("ProviderContracts");
      }
    }
  });

  it("publishes only package roots plus the closed provider-author SPI", async () => {
    for (const name of ["effect-build", ...providerPackages]) {
      const manifest = JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as {
        exports: Record<string, unknown>;
        engines?: unknown;
      };
      expect(Object.keys(manifest.exports)).toEqual(
        name === "effect-build" ? [".", "./Integration", "./Provider"] : ["."],
      );
      expect(manifest.engines).toBeUndefined();
      expect(Object.keys(manifest.exports).some((path) => /internal|standalone/.test(path))).toBe(false);
    }
  });
});
