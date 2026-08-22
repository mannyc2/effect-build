import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const readJson = async <A>(path: string): Promise<A> => JSON.parse(await readFile(resolve(root, path), "utf8")) as A;
const git = (...argv: readonly string[]): string =>
  execFileSync("git", [...argv], { cwd: root, encoding: "utf8" }).trim();

interface SurfaceSubpath {
  readonly subpath: string;
  readonly rootNamespace: string;
  readonly exports: readonly string[];
  readonly runtimeExports: readonly string[];
  readonly typeExports: readonly string[];
  readonly operationIds: readonly string[];
}

interface Surface {
  readonly packageTrain: {
    readonly packages: readonly {
      readonly name: string;
      readonly root: { readonly form: string; readonly namespaces: readonly string[] };
      readonly subpaths: readonly SurfaceSubpath[];
    }[];
  };
}

const expectedSubpath = "./AssembleExecutable";
const sourcePath = "packages/effect-build-node-sea/src/AssembleExecutable.ts";
const stagedFiles = [
  sourcePath,
  "packages/effect-build-node-sea/src/internal/v04/compatibility.ts",
  "packages/effect-build-node-sea/src/internal/v04/executable.ts",
  "packages/effect-build-node-sea/src/internal/v04/selected.ts",
].sort();
const distPath = (extension: "js" | "d.ts") =>
  resolve(root, `packages/effect-build-node-sea/dist/AssembleExecutable.${extension}`);

const declarationExports = (program: ts.Program, file: string): readonly string[] => {
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error(`missing declaration module ${file}`);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("staged 0.4 Node SEA AssembleExecutable surface", () => {
  it("stages exactly the frozen Node SEA subpath without publishing it", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const provider = surface.packageTrain.packages.find(({ name }) => name === "effect-build-node-sea");
    expect(provider).toBeDefined();
    expect(provider!.root).toEqual({ form: "namespace-only", namespaces: ["AssembleExecutable"] });
    expect(provider!.subpaths.map(({ subpath }) => subpath)).toEqual([expectedSubpath]);
    expect(provider!.subpaths[0]!.operationIds).toEqual(["CAN-NODE-001"]);

    const manifest = await readJson<{ readonly exports: Readonly<Record<string, unknown>> }>(
      "packages/effect-build-node-sea/package.json",
    );
    expect(Object.keys(manifest.exports)).toEqual(["."]);
    const rootIndex = await readFile(resolve(root, "packages/effect-build-node-sea/src/index.ts"), "utf8");
    expect(rootIndex).not.toContain('from "./AssembleExecutable.js"');
  });

  it("emits the exact frozen runtime and declaration symbol sets", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const contract = surface.packageTrain.packages.find(({ name }) => name === "effect-build-node-sea")!.subpaths[0]!;
    const program = ts.createProgram({
      rootNames: [distPath("d.ts")],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
      },
    });
    const runtime = await import(distPath("js"));
    expect(Object.keys(runtime).sort()).toEqual(contract.runtimeExports.slice().sort());
    expect(declarationExports(program, distPath("d.ts"))).toEqual(contract.exports.slice().sort());
    expect([...new Set([...contract.runtimeExports, ...contract.typeExports])].sort()).toEqual(
      contract.exports.slice().sort(),
    );
  }, 15_000);

  it("adds only the staged Node SEA implementation over the Plan 041 baseline", async () => {
    const sourceFiles = (await readdir(resolve(root, "packages/effect-build-node-sea/src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => `packages/effect-build-node-sea/src/${entry}`)
      .sort();
    const baseline = git(
      "ls-tree",
      "-r",
      "--name-only",
      "2048fcd",
      "packages/effect-build-node-sea/src",
    ).split("\n").filter(Boolean);
    expect(sourceFiles.filter((file) => !baseline.includes(file))).toEqual(stagedFiles);
  });

  it("keeps the direct lane independent of legacy continuation and injection paths", async () => {
    for (const file of stagedFiles) {
      const source = await readFile(resolve(root, file), "utf8");
      const label = relative(root, resolve(root, file));
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, label).not.toMatch(/(?:Integration|Provider|JavaScriptBundle|standalone)/);
        expect(specifier, label).not.toMatch(/^effect-build-(?:bun|deno|esbuild)(?:\/|$)/);
      }
      expect(source, label).not.toContain("./internal/NodeSea.js");
      expect(source, label).not.toMatch(/\b(?:postject|prepareBlob|injector|createExecutable)\b/);
    }
  });
});
