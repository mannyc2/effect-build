import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

const declarationEntryPoints = {
  "effect-build": "packages/effect-build/dist/index.d.ts",
  "effect-build/Provider": "packages/effect-build/dist/Provider.d.ts",
  "effect-build-bun": "packages/effect-build-bun/dist/index.d.ts",
  "effect-build-deno": "packages/effect-build-deno/dist/index.d.ts",
} as const;

type DeclarationName = keyof typeof declarationEntryPoints;

const declarationProgram = () =>
  ts.createProgram({
    rootNames: Object.values(declarationEntryPoints).map((path) => resolve(root, path)),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });

const builtDeclarationExports = (): Readonly<Record<DeclarationName, readonly string[]>> => {
  const program = declarationProgram();
  const checker = program.getTypeChecker();
  return Object.fromEntries(
    Object.entries(declarationEntryPoints).map(([name, path]) => {
      const file = resolve(root, path);
      const source = program.getSourceFile(file);
      if (source === undefined) throw new Error(`declaration program did not load ${file}`);
      const symbol = checker.getSymbolAtLocation(source);
      if (symbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
      return [name, checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort()];
    }),
  ) as unknown as Readonly<Record<DeclarationName, readonly string[]>>;
};

const providerCallTypeParameterCounts = (): Readonly<
  Record<"effect-build-bun" | "effect-build-deno", readonly number[]>
> => {
  const program = declarationProgram();
  const checker = program.getTypeChecker();
  const countsFor = (name: "effect-build-bun" | "effect-build-deno"): readonly number[] => {
    const file = resolve(root, declarationEntryPoints[name]);
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`declaration program did not load ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
    const exported = checker.getExportsOfModule(moduleSymbol);
    return ["compileExecutable", "compileExecutableMatrix"].map((operation) => {
      const symbol = exported.find((candidate) => candidate.getName() === operation);
      const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      if (symbol === undefined || declaration === undefined) throw new Error(`missing ${name}.${operation}`);
      const signatures = checker.getSignaturesOfType(
        checker.getTypeOfSymbolAtLocation(symbol, declaration),
        ts.SignatureKind.Call,
      );
      if (signatures.length !== 1) throw new Error(`${name}.${operation} must have one call signature`);
      return signatures[0]?.typeParameters?.length ?? 0;
    });
  };
  return { "effect-build-bun": countsFor("effect-build-bun"), "effect-build-deno": countsFor("effect-build-deno") };
};

const exactDeclarations = {
  "effect-build": ["Artifact", "BuildError", "MatrixError", "Target"],
  "effect-build/Provider": [
    "BuildError",
    "CommandCompletion",
    "CommandOutput",
    "CompileExecutableInput",
    "CompileExecutableMatrixInput",
    "CompilerService",
    "Defined",
    "Definition",
    "Diagnostic",
    "LayerOptions",
    "MatrixErrorFor",
    "PreparedCompileInput",
    "ProviderArtifact",
    "ProviderLayerRequirements",
    "ProviderName",
    "ProviderTargets",
    "TargetFor",
    "ToolNotFound",
    "ToolProbeFailed",
    "Validation",
    "define",
  ],
  "effect-build-bun": [
    "Artifact",
    "CompileExecutableInput",
    "CompileExecutableMatrixInput",
    "Compiler",
    "LayerOptions",
    "MatrixError",
    "Options",
    "Target",
    "compileExecutable",
    "compileExecutableMatrix",
    "layer",
  ],
  "effect-build-deno": [
    "Artifact",
    "CompileExecutableInput",
    "CompileExecutableMatrixInput",
    "Compiler",
    "LayerOptions",
    "MatrixError",
    "Options",
    "PermissionValue",
    "Permissions",
    "Target",
    "compileExecutable",
    "compileExecutableMatrix",
    "layer",
  ],
} as const satisfies Readonly<Record<DeclarationName, readonly string[]>>;

describe("built public API", () => {
  it("matches the authored package and runtime-key allowlists", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      version: number;
      packages: Record<string, { subpaths: string[]; runtimeKeys: Record<string, string[]> }>;
    };
    expect(manifest.version).toBe(2);
    expect(Object.keys(manifest.packages)).toEqual(["effect-build", "effect-build-bun", "effect-build-deno"]);

    const runtimeModules = {
      "effect-build": await import("effect-build"),
      "effect-build/Provider": await import("effect-build/Provider"),
      "effect-build-bun": await import("effect-build-bun"),
      "effect-build-deno": await import("effect-build-deno"),
    };
    for (const [name, contract] of Object.entries(manifest.packages)) {
      const packageJson = JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as {
        exports: Record<string, unknown>;
      };
      expect(Object.keys(packageJson.exports)).toEqual(contract.subpaths);
      for (const subpath of contract.subpaths) {
        const moduleName = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
        expect(Object.keys(runtimeModules[moduleName as keyof typeof runtimeModules]), moduleName)
          .toEqual(contract.runtimeKeys[subpath]);
      }
    }
  });

  it("exposes exactly the frozen runtime and type-only declaration names", () => {
    const exports = builtDeclarationExports();
    for (const [module, expected] of Object.entries(exactDeclarations)) {
      expect(exports[module as DeclarationName], module).toEqual([...expected].sort());
    }
  });

  it("keeps both provider operations concrete rather than publicly generic", () => {
    expect(providerCallTypeParameterCounts()).toEqual({ "effect-build-bun": [0, 0], "effect-build-deno": [0, 0] });
  });

  it("rejects any public API manifest drift", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      version: number;
      packages: Record<string, { subpaths: string[]; runtimeKeys: Record<string, string[]> }>;
    };
    const { validatePublicApi } = await import(resolve(root, "scripts/read-tooling.mjs")) as {
      validatePublicApi: (api: unknown) => unknown;
    };
    const rejected = (mutate: (api: typeof manifest) => void): void => {
      const api = structuredClone(manifest);
      mutate(api);
      expect(() => validatePublicApi(api)).toThrow(/unexpected public API/);
    };
    rejected((api) => api.packages["effect-build"]!.subpaths.pop());
    rejected((api) => api.packages["effect-build-bun"]!.runtimeKeys["."]!.push("extra"));
    rejected((api) => api.packages["effect-build-deno"]!.runtimeKeys["."]!.reverse());
    rejected((api) => delete api.packages["effect-build"]);
  });

  it("keeps each build output inside its owner package", async () => {
    for (const name of ["effect-build-bun", "effect-build-deno"] as const) {
      const entries = await readdir(resolve(root, `packages/${name}/dist`), { withFileTypes: true });
      expect(entries.filter((entry) => entry.isDirectory())).toHaveLength(0);
      expect(entries.filter((entry) => entry.name.endsWith(".js")).map((entry) => entry.name).sort())
        .toEqual(["Adapter.js", "index.js"]);
    }
    const coreEntries = await readdir(resolve(root, "packages/effect-build/dist"), { withFileTypes: true });
    expect(coreEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort())
      .toEqual(["internal", "standalone"]);
    expect(coreEntries.filter((entry) => entry.name.endsWith(".js")).map((entry) => entry.name).sort())
      .toEqual(["Provider.js", "index.js"]);
  });
});
