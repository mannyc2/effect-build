import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

const sourceFiles = async (): Promise<string[]> => {
  const entries = await readdir(resolve(root, "src"), { recursive: true });
  return entries.filter((entry) => entry.endsWith(".ts")).map((entry) => resolve(root, "src", entry));
};

const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

const compilerSpecific = new Set([
  resolve(root, "src/Bun.ts"),
  resolve(root, "src/Deno.ts"),
  resolve(root, "src/standalone/internal/BunAdapter.ts"),
  resolve(root, "src/standalone/internal/DenoAdapter.ts"),
]);

describe("source ownership boundaries", () => {
  it("keeps library source on Effect platform-neutral services", async () => {
    for (const file of await sourceFiles()) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/from "node:/);
      expect(source, file).not.toContain("Effect.runPromise");
    }
  });

  it("confines the esbuild library dependency to its package-private producer", async () => {
    const allowed = [resolve(root, "src/standalone/internal/Esbuild.ts")];
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if (importSpecifiers(await readFile(file, "utf8")).includes("esbuild")) found.push(file);
    }
    expect(found.sort()).toEqual(allowed.sort());

    const producer = await readFile(allowed[0]!, "utf8");
    expect(producer).not.toContain(".watch(");
    expect(producer).not.toContain("esbuild.stop");

    const unitFiles = (await readdir(resolve(root, "test/unit")))
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => resolve(root, "test/unit", entry));
    const directTestImporters: string[] = [];
    for (const file of unitFiles) {
      if (importSpecifiers(await readFile(file, "utf8")).includes("esbuild")) directTestImporters.push(file);
    }
    expect(directTestImporters).toEqual([
      resolve(root, "test/unit/esbuild-bundle.test.ts"),
      resolve(root, "test/unit/node-sea.test.ts"),
    ]);
  });

  it("confines effect/unstable/process to the private process module", async () => {
    const allowed = [
      resolve(root, "src/standalone/internal/Process.ts"),
    ];
    const found: string[] = [];
    for (const file of await sourceFiles()) {
      if ((await readFile(file, "utf8")).includes("effect/unstable/process")) found.push(file);
    }
    expect(found.sort()).toEqual(allowed.sort());
  });

  it("keeps core standalone modules free of compiler-specific imports", async () => {
    for (const file of await sourceFiles()) {
      if (compilerSpecific.has(file) || file === resolve(root, "src/index.ts")) continue;
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/from "[./]*Bun\.js"|from "[./]*Deno\.js"/);
      expect(source, file).not.toMatch(/BunAdapter|DenoAdapter/);
    }
  });

  it("keeps executable lifecycle ownership package-private and provider-neutral", async () => {
    const lifecycle = resolve(root, "src/standalone/internal/ExecutableLifecycle.ts");
    const lifecycleImports = importSpecifiers(await readFile(lifecycle, "utf8"));
    for (const specifier of lifecycleImports) {
      expect(specifier).not.toMatch(/(?:Bun|Deno)(?:Adapter|Target)?\.js$/);
    }

    for (const publicEntrypoint of ["index.ts", "Bun.ts", "Deno.ts"]) {
      const file = resolve(root, "src", publicEntrypoint);
      expect(importSpecifiers(await readFile(file, "utf8")), file)
        .not.toEqual(expect.arrayContaining([expect.stringMatching(/ExecutableLifecycle\.js$/)]));
    }
  });

  it("keeps the exact Node SEA producer private and outside compiler adapters", async () => {
    const nodeSeaFile = resolve(root, "src/standalone/internal/NodeSea.ts");
    const nodeSeaSource = await readFile(nodeSeaFile, "utf8");
    const nodeSeaImports = importSpecifiers(nodeSeaSource);
    for (const specifier of nodeSeaImports) {
      expect(specifier).not.toMatch(/(?:Bun|Deno)(?:Adapter|Target)?\.js$/);
      expect(specifier).not.toMatch(/CompilerAdapter\.js$/);
    }
    expect(nodeSeaSource).not.toMatch(/postject|download|npm|pnpm|yarn|bun add|https?:\/\//i);

    const importers: string[] = [];
    for (const file of await sourceFiles()) {
      if (importSpecifiers(await readFile(file, "utf8")).some((specifier) => specifier.endsWith("NodeSea.js"))) {
        importers.push(file);
      }
    }
    expect(importers).toEqual([]);
  });

  it("keeps provider target tables pure and dependent only on the shared table primitive", async () => {
    for (const name of ["BunTarget.ts", "DenoTarget.ts"]) {
      const file = resolve(root, "src/standalone/internal", name);
      expect(importSpecifiers(await readFile(file, "utf8")), file).toEqual(["./TargetTable.js"]);
    }
  });

  it("allowlists every source module that imports a provider target contract", async () => {
    const importers: string[] = [];
    for (const file of await sourceFiles()) {
      if (
        importSpecifiers(await readFile(file, "utf8")).some((specifier) =>
          /(?:BunTarget|DenoTarget)\.js$/.test(specifier)
        )
      ) {
        importers.push(file);
      }
    }
    expect(importers.sort()).toEqual([
      resolve(root, "src/Bun.ts"),
      resolve(root, "src/Deno.ts"),
      resolve(root, "src/standalone/Artifact.ts"),
      resolve(root, "src/standalone/MatrixError.ts"),
      resolve(root, "src/standalone/internal/BunAdapter.ts"),
      resolve(root, "src/standalone/internal/DenoAdapter.ts"),
    ].sort());
  });

  it("keeps the package export map at exactly the three public paths", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      engines?: unknown;
    };
    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./bun", "./deno"]);
    expect(packageJson.engines).toBeUndefined();

    for (const publicEntrypoint of ["index.ts", "Bun.ts", "Deno.ts"]) {
      const source = await readFile(resolve(root, "src", publicEntrypoint), "utf8");
      expect(source, publicEntrypoint).not.toMatch(
        /Esbuild|withJavaScriptBundle|JavaScriptBundleArtifact|NodeSea|PipelineExecutableArtifact|stages/,
      );
    }
    await expect(readFile(resolve(root, "tooling/node-sea.json"), "utf8")).rejects.toThrow();
  });
});
