import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

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

const expectedSubpath = "./CompileExecutable";
const sourcePath = "packages/effect-build-deno/src/CompileExecutable.ts";
const distPath = (extension: "js" | "d.ts") =>
  resolve(root, "packages/effect-build-deno/dist/CompileExecutable." + extension);

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await readFile(resolve(root, path), "utf8")) as A;

const declarationExports = (program: ts.Program, file: string): readonly string[] => {
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error("missing declaration module " + file);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("staged 0.4 Deno CompileExecutable surface", () => {
  it("stages exactly the frozen Deno subpath without changing released package exports", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const provider = surface.packageTrain.packages.find(({ name }) => name === "effect-build-deno");
    expect(provider).toBeDefined();
    expect(provider!.root).toEqual({ form: "namespace-only", namespaces: ["CompileExecutable"] });
    expect(provider!.subpaths.map(({ subpath }) => subpath)).toEqual([expectedSubpath]);
    expect(provider!.subpaths[0]!.operationIds).toEqual(["CAN-DENO-010"]);

    const manifest = await readJson<{ readonly exports: Readonly<Record<string, unknown>> }>(
      "packages/effect-build-deno/package.json",
    );
    expect(Object.keys(manifest.exports)).toEqual(["."]);
    const rootIndex = await readFile(resolve(root, "packages/effect-build-deno/src/index.ts"), "utf8");
    expect(rootIndex).not.toContain('from "./CompileExecutable.js"');
  });

  it("emits the exact frozen runtime and declaration symbol sets", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const contract = surface.packageTrain.packages.find(({ name }) => name === "effect-build-deno")!.subpaths[0]!;
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

  it("keeps the staged Deno lane independent of released Deno adapters and provider siblings", async () => {
    const source = await readFile(resolve(root, sourcePath), "utf8");
    for (const specifier of importSpecifiers(source)) {
      expect(specifier, sourcePath).not.toMatch(/(?:standalone|Integration|Provider|Adapter|JavaScriptBundle)/);
      expect(specifier, sourcePath).not.toMatch(/^effect-build-(?:bun|esbuild|node-sea)(?:\/|$)/);
    }
  });
});
