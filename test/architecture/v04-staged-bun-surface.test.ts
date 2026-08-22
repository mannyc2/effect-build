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

interface Profile {
  readonly plan: string;
  readonly bunImplementationFiles: readonly string[];
  readonly esbuildImplementationFiles: readonly string[];
  readonly coreStagedFiles: readonly string[];
  readonly immutablePublicPaths: readonly string[];
  readonly productionBaseline: {
    readonly handoffSha: string;
    readonly plan039Sha: string;
    readonly plan040Sha: string;
  };
}

const expectedSubpath = "./CompileExecutable";
const sourcePath = "packages/effect-build-bun/src/CompileExecutable.ts";
const distPath = (extension: "js" | "d.ts") =>
  resolve(root, `packages/effect-build-bun/dist/CompileExecutable.${extension}`);

const declarationExports = (program: ts.Program, file: string): readonly string[] => {
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error(`missing declaration module ${file}`);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("staged 0.4 Bun CompileExecutable surface", () => {
  it("stages exactly the frozen Bun subpath without publishing it", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const provider = surface.packageTrain.packages.find(({ name }) => name === "effect-build-bun");
    expect(provider).toBeDefined();
    expect(provider!.root).toEqual({ form: "namespace-only", namespaces: ["CompileExecutable"] });
    expect(provider!.subpaths.map(({ subpath }) => subpath)).toEqual([expectedSubpath]);
    expect(provider!.subpaths[0]!.operationIds).toEqual(["CAN-BUN-012"]);
    expect(profile.plan).toBe("041");
    expect(profile.bunImplementationFiles).toContain(sourcePath);

    const manifest = await readJson<{ readonly exports: Readonly<Record<string, unknown>> }>(
      "packages/effect-build-bun/package.json",
    );
    expect(Object.keys(manifest.exports)).toEqual(["."]);
    const rootIndex = await readFile(resolve(root, "packages/effect-build-bun/src/index.ts"), "utf8");
    expect(rootIndex).not.toContain('from "./CompileExecutable.js"');
  });

  it("emits the exact frozen runtime and declaration symbol sets", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const contract = surface.packageTrain.packages.find(({ name }) => name === "effect-build-bun")!.subpaths[0]!;
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

  it("keeps the staged Bun lane independent of released implementations and provider siblings", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const sourceFiles = (await readdir(resolve(root, "packages/effect-build-bun/src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => `packages/effect-build-bun/src/${entry}`);
    const historicalFiles = git(
      "ls-tree",
      "-r",
      "--name-only",
      profile.productionBaseline.plan040Sha,
      "packages/effect-build-bun/src",
    ).split("\n");
    expect(sourceFiles.filter((path) => !historicalFiles.includes(path)).sort()).toEqual(
      profile.bunImplementationFiles.slice().sort(),
    );
    for (const path of profile.bunImplementationFiles) {
      const source = await readFile(resolve(root, path), "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, relative(root, path)).not.toMatch(/(?:standalone|Integration|Provider|JavaScriptBundle)/);
        expect(specifier, relative(root, path)).not.toMatch(/^effect-build-(?:deno|esbuild|node-sea)(?:\/|$)/);
      }
    }
  });

  it("preserves the certified core, Esbuild, and released 0.3 public paths", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    for (const path of profile.coreStagedFiles) {
      expect(await readFile(resolve(root, path), "utf8"), path).toBe(
        `${git("show", `${profile.productionBaseline.plan039Sha}:${path}`)}\n`,
      );
    }
    for (const path of profile.esbuildImplementationFiles) {
      expect(await readFile(resolve(root, path), "utf8"), path).toBe(
        `${git("show", `${profile.productionBaseline.plan040Sha}:${path}`)}\n`,
      );
    }
    for (const path of profile.immutablePublicPaths) {
      expect(await readFile(resolve(root, path), "utf8"), path).toBe(
        `${git("show", `${profile.productionBaseline.handoffSha}:${path}`)}\n`,
      );
    }
  });
});
