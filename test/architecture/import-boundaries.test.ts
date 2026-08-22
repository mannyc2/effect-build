import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const packagesRoot = resolve(root, "packages");
const integrationPackages = [
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
] as const;

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

  it("confines raw esbuild to its independently installable integration", async () => {
    const released = resolve(root, "packages/effect-build-esbuild/src/internal/Esbuild.ts");
    const staged = [
      "packages/effect-build-esbuild/src/Build.ts",
      "packages/effect-build-esbuild/src/Context.ts",
      "packages/effect-build-esbuild/src/internal/v04/compatibility.ts",
      "packages/effect-build-esbuild/src/internal/v04/installed.ts",
    ].map((path) => resolve(root, path));
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if (importSpecifiers(await readFile(file, "utf8")).includes("esbuild")) found.push(file);
    }
    expect(found.sort()).toEqual([released, ...staged].sort());
    const producer = await readFile(released, "utf8");
    expect(producer).not.toContain(".watch(");
    expect(producer).not.toContain("esbuild.stop");
    for (const path of staged) {
      const source = await readFile(path, "utf8");
      expect(source, path).not.toContain("esbuild.stop");
      expect(source, path).not.toContain("esbuild.initialize");
    }
  });

  it("keeps one core-owned process implementation and forbids shell or download escapes", async () => {
    const processImporters: string[] = [];
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      if (source.includes("effect/unstable/process")) processImporters.push(relative(root, file));
      expect(source, file).not.toMatch(/\b(?:exec|spawn)Sync\b|\bexecFileSync\b/);
    }
    expect(processImporters.sort()).toEqual([
      "packages/effect-build-node-sea/src/internal/NodeSea.ts",
      "packages/effect-build/src/Author/Tool.ts",
      "packages/effect-build/src/Integration.ts",
      "packages/effect-build/src/Provider.ts",
      "packages/effect-build/src/standalone/internal/CompilerEngine.ts",
      "packages/effect-build/src/standalone/internal/ToolDiscovery.ts",
    ]);
    const toolContract = await readFile(resolve(root, "packages/effect-build/src/Author/Tool.ts"), "utf8");
    expect(toolContract).toMatch(/^import type \{ ChildProcess \} from "effect\/unstable\/process";$/m);
    expect(toolContract).not.toMatch(/ChildProcess\.(?:make|start|spawn)/);
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
        expect(specifier, file).not.toMatch(/^effect-build-(?:bun|deno|esbuild|node-sea)(?:\/|$)/);
      }
    }
    for (const provider of integrationPackages) {
      for (
        const file of (await sourceFiles()).filter((path) => path.startsWith(resolve(root, `packages/${provider}/src`)))
      ) {
        for (const specifier of importSpecifiers(await readFile(file, "utf8"))) {
          expect(specifier, file).not.toMatch(/^effect-build\/(?:internal|standalone)/);
          for (const sibling of integrationPackages) {
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
    expect(lifecycle).not.toMatch(/effect-build-(?:bun|deno|esbuild|node-sea)/);

    for (const provider of integrationPackages) {
      const source = await readFile(resolve(root, `packages/${provider}/src/index.ts`), "utf8");
      expect(source).not.toMatch(/ExecutableLifecycle|ChildProcessSpawner|JavaScriptBundleArtifact|NodeSeaService/);
    }
    const coreIndex = await readFile(resolve(root, "packages/effect-build/src/index.ts"), "utf8");
    expect(coreIndex).not.toMatch(/Esbuild|NodeSea|ExecutableLifecycle|Process/);
  });

  it("names each reusable Effect boundary exactly once", async () => {
    const compiler = await readFile(
      resolve(root, "packages/effect-build/src/standalone/internal/CompilerEngine.ts"),
      "utf8",
    );
    expect(
      compiler.match(/Effect\.fn\(\s*`effect-build\/\$\{adapter\.toolName\}\.compileExecutable`,/g),
    ).toHaveLength(1);
    expect(
      compiler.match(/Effect\.fn\(\s*`effect-build\/\$\{adapter\.toolName\}\.compileExecutableMatrix`/g),
    ).toHaveLength(1);

    const esbuild = await readFile(resolve(root, "packages/effect-build-esbuild/src/internal/Esbuild.ts"), "utf8");
    expect(esbuild.match(/Effect\.fn\(\s*"effect-build-esbuild\/Esbuild\.withJavaScriptBundle"/g)).toHaveLength(1);
    const bun = await readFile(resolve(root, "packages/effect-build-bun/src/Bundle.ts"), "utf8");
    expect(bun.match(/Effect\.fn\(\s*"Bun\.withJavaScriptBundle"/g)).toHaveLength(1);
    expect(bun).not.toMatch(/Bun\.build|globalThis\.Bun|node:/);
    const nodeSea = await readFile(resolve(root, "packages/effect-build-node-sea/src/internal/NodeSea.ts"), "utf8");
    expect(nodeSea.match(/Effect\.fn\(\s*"effect-build-node-sea\/NodeSea\.createExecutable"/g)).toHaveLength(1);
  });

  it("keeps target authority local to each scalar compiler integration", async () => {
    await expect(
      readFile(resolve(root, "packages/effect-build/src/internal/ProviderContracts.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    for (const provider of ["bun", "deno"] as const) {
      const adapter = await readFile(resolve(root, `packages/effect-build-${provider}/src/Adapter.ts`), "utf8");
      expect(adapter).toContain("targetEntries");
      expect(adapter).toContain("export const Stages");
    }

    const provider = await readFile(resolve(root, "packages/effect-build/src/Provider.ts"), "utf8");
    expect(provider).not.toMatch(/\b(?:bun|deno|esbuild|node-sea)\b/);
  });

  it("publishes only package roots plus the closed provider-author SPI", async () => {
    for (const name of ["effect-build", ...integrationPackages]) {
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
