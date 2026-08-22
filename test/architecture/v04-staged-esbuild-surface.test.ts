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
  readonly schema: string;
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
  readonly esbuildImplementationFiles: readonly string[];
  readonly productionBaseline: {
    readonly handoffSha: string;
    readonly plan039Sha: string;
    readonly plan040Sha: string;
  };
}

const expectedSubpaths = ["./Build", "./Context"];
const expectedOperationIds = [["./Build", "CAN-ESB-001"], ["./Context", "CAN-ESB-011"]] as const;

const sourcePathForSubpath = (subpath: string): string => `packages/effect-build-esbuild/src/${subpath.slice(2)}.ts`;

const distPathForSubpath = (subpath: string, extension: "js" | "d.ts"): string =>
  resolve(root, `packages/effect-build-esbuild/dist/${subpath.slice(2)}.${extension}`);

const declarationExports = (program: ts.Program, file: string): readonly string[] => {
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error(`missing declaration module ${file}`);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const importSpecifiers = (source: string): readonly string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(|import\s+)(["'])([^"']+)\1/g)].map((match) => match[2]!);

describe("staged 0.4 esbuild surface", () => {
  it("stages exactly the two frozen esbuild subpaths without publishing them", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const providerPackage = surface.packageTrain.packages.find(({ name }) => name === "effect-build-esbuild");
    expect(providerPackage).toBeDefined();
    expect(providerPackage!.root.form).toBe("namespace-only");
    expect(providerPackage!.root.namespaces).toEqual(["Build", "Context"]);
    const subpaths = providerPackage!.subpaths.map(({ subpath }) => subpath).sort();
    expect(subpaths).toEqual(expectedSubpaths);
    expect(
      providerPackage!.subpaths.map(({ operationIds, subpath }) => [subpath, ...operationIds]).sort(),
    ).toEqual(expectedOperationIds.map((pair) => [...pair]));
    expect(profile.plan).toBe("043");
    for (const subpath of subpaths) {
      expect(profile.esbuildImplementationFiles).toContain(sourcePathForSubpath(subpath));
    }

    const manifest = await readJson<{ readonly exports: Readonly<Record<string, unknown>> }>(
      "packages/effect-build-esbuild/package.json",
    );
    expect(Object.keys(manifest.exports)).toEqual(["."]);

    const rootIndex = await readFile(resolve(root, "packages/effect-build-esbuild/src/index.ts"), "utf8");
    for (const subpath of subpaths) {
      expect(rootIndex).not.toContain(`from "${subpath}.js"`);
    }
  });

  it("emits the exact frozen runtime and declaration symbol sets", async () => {
    const surface = await readJson<Surface>("research/post-0.3/freeze/SURFACE.json");
    const providerPackage = surface.packageTrain.packages.find(({ name }) => name === "effect-build-esbuild")!;
    const declarationPaths = providerPackage.subpaths.map(({ subpath }) => distPathForSubpath(subpath, "d.ts"));
    const program = ts.createProgram({
      rootNames: declarationPaths,
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
      },
    });
    for (const contract of providerPackage.subpaths) {
      const runtime = await import(distPathForSubpath(contract.subpath, "js"));
      expect(Object.keys(runtime).sort(), contract.subpath).toEqual(contract.runtimeExports.slice().sort());
      expect(declarationExports(program, distPathForSubpath(contract.subpath, "d.ts")), contract.subpath).toEqual(
        contract.exports.slice().sort(),
      );
      expect([...new Set([...contract.runtimeExports, ...contract.typeExports])].sort(), contract.subpath).toEqual(
        contract.exports.slice().sort(),
      );
    }
  }, 15_000);

  it("keeps the staged provider modules independent of released implementations and siblings", async () => {
    const profile = await readJson<Profile>("research/post-0.3/implementation/profile.json");
    const sourceFiles = (await readdir(resolve(root, "packages/effect-build-esbuild/src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => `packages/effect-build-esbuild/src/${entry}`);
    const historicalFiles = git(
      "ls-tree",
      "-r",
      "--name-only",
      profile.productionBaseline.plan039Sha,
      "packages/effect-build-esbuild/src",
    ).split("\n");
    expect(sourceFiles.filter((path) => !historicalFiles.includes(path)).sort()).toEqual(
      profile.esbuildImplementationFiles.slice().sort(),
    );
    for (const path of profile.esbuildImplementationFiles) {
      const source = await readFile(resolve(root, path), "utf8");
      for (const specifier of importSpecifiers(source)) {
        expect(specifier, relative(root, path)).not.toMatch(/(?:standalone|Integration|Provider|JavaScriptBundle)/);
        expect(specifier, relative(root, path)).not.toMatch(/^effect-build(?:-(?:bun|deno|node-sea))?(?:\/|$)/);
        expect(
          specifier === "effect" || specifier === "esbuild" || specifier.startsWith("./")
            || specifier.startsWith("../"),
          `${relative(root, path)} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it("keeps the six staged core modules byte-identical to the certified Plan 039 head", async () => {
    const profile = await readJson<Profile & { readonly coreStagedFiles: readonly string[] }>(
      "research/post-0.3/implementation/profile.json",
    );
    expect(profile.coreStagedFiles).toHaveLength(6);
    for (const path of profile.coreStagedFiles) {
      expect(await readFile(resolve(root, path), "utf8"), path).toBe(
        `${git("show", `${profile.productionBaseline.plan039Sha}:${path}`)}\n`,
      );
    }
  });
});
