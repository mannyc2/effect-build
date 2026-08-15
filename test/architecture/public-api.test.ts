import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const providerPackages = ["effect-build-bun", "effect-build-deno"] as const;
const integrationPackages = [
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
] as const;
const packageNames = ["effect-build", ...integrationPackages] as const;
const providerRuntimeKeys = ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"];

const declarationFiles = Object.fromEntries(packageNames.map((name) => [
  name,
  resolve(root, `packages/${name}/dist/index.d.ts`),
])) as Record<typeof packageNames[number], string>;
const providerDeclarationFile = resolve(root, "packages/effect-build/dist/Provider.d.ts");
const integrationDeclarationFile = resolve(root, "packages/effect-build/dist/Integration.d.ts");

const declarationExports = (): Readonly<Record<typeof packageNames[number], readonly string[]>> => {
  const program = ts.createProgram({
    rootNames: Object.values(declarationFiles),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  return Object.fromEntries(packageNames.map((name) => {
    const file = declarationFiles[name];
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`declaration program did not load ${file}`);
    const symbol = checker.getSymbolAtLocation(source);
    if (symbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
    return [name, checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort()];
  })) as unknown as Record<typeof packageNames[number], readonly string[]>;
};

const exactDeclarations = {
  "effect-build": ["Artifact", "BuildError", "JavaScriptBundle", "MatrixError", "Target"],
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
  "effect-build-esbuild": [
    "BundleMaterializationFailed",
    "BundleMaterializationOperation",
    "Esbuild",
    "EsbuildBundleError",
    "EsbuildDiagnostic",
    "EsbuildFailed",
    "EsbuildLayerError",
    "EsbuildVersionMismatch",
    "InvalidBundleInput",
    "JavaScriptBundleInput",
    "JavaScriptBundleInvalid",
    "Service",
    "layer",
    "withJavaScriptBundle",
  ],
  "effect-build-node-sea": [
    "Artifact",
    "CreateExecutableInput",
    "InvalidNodeSeaInput",
    "LayerOptions",
    "NodeSea",
    "NodeSeaCreateError",
    "NodeSeaFailed",
    "NodeSeaLayerError",
    "NodeSeaPreparationFailed",
    "NodeSeaPreparationOperation",
    "NodeSeaProbeFailed",
    "NodeSeaSpawnFailed",
    "NodeSeaStage",
    "NodeSeaSyntaxCheckFailed",
    "NodeSeaToolNotFound",
    "Service",
    "createExecutable",
    "layer",
  ],
} as const;

const exactProviderDeclarations = [
  "BuildError",
  "CommandDefinition",
  "CompileExecutableInput",
  "CompileExecutableMatrixInput",
  "CompilerService",
  "Defined",
  "LayerOptions",
  "PreparedCommandInput",
  "ProviderArtifact",
  "ProviderLayerRequirements",
  "ProviderMatrixError",
  "ProviderStage",
  "ProviderStages",
  "ToolNotFound",
  "ToolProbeFailed",
  "define",
] as const;

const exactIntegrationDeclarations = [
  "CommandCompletion",
  "CommandOutput",
  "ExecuteCommand",
  "NativeExecutableObservation",
  "PublishedExecutable",
  "executeCommand",
  "inspectLiveJavaScriptBundle",
  "produceExecutable",
  "withOwnedJavaScriptBundle",
] as const;

const exactJavaScriptBundleDeclarations = [
  "Artifact",
  "Format",
  "Input",
  "InvalidJavaScriptBundle",
  "InvalidReason",
  "JavaScriptBundleAccessFailed",
  "JavaScriptBundleAccessOperation",
  "JavaScriptBundleError",
  "JavaScriptBundleTemporaryDirectoryFailed",
] as const;

const providerDeclarationExports = (): readonly string[] => {
  const program = ts.createProgram({
    rootNames: [providerDeclarationFile],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const source = program.getSourceFile(providerDeclarationFile);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error("missing effect-build/Provider declaration module");
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const declarationModuleExports = (file: string): readonly string[] => {
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || symbol === undefined) throw new Error(`missing declaration module ${file}`);
  return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const javaScriptBundleDeclarationExports = (): readonly string[] => {
  const file = declarationFiles["effect-build"];
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  const bundleSymbol = moduleSymbol === undefined
    ? undefined
    : checker.getExportsOfModule(moduleSymbol).find((entry) => entry.getName() === "JavaScriptBundle");
  if (bundleSymbol === undefined) throw new Error("missing JavaScriptBundle declaration namespace");
  return checker.getExportsOfModule(bundleSymbol).map((entry) => entry.getName()).sort();
};

const providerCallTypeParameterCounts = (): Readonly<Record<typeof providerPackages[number], readonly number[]>> => {
  const program = ts.createProgram({
    rootNames: providerPackages.map((name) => declarationFiles[name]),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  return Object.fromEntries(providerPackages.map((name) => {
    const file = declarationFiles[name];
    const source = program.getSourceFile(file);
    const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (source === undefined || moduleSymbol === undefined) throw new Error(`missing declaration module ${name}`);
    const exported = checker.getExportsOfModule(moduleSymbol);
    const counts = ["compileExecutable", "compileExecutableMatrix"].map((operation) => {
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
    return [name, counts];
  })) as unknown as Record<typeof providerPackages[number], readonly number[]>;
};

describe("built public API", () => {
  it("matches every authored package/subpath runtime allowlist", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      version: number;
      packages: Record<string, { subpaths: string[]; runtimeKeys: Record<string, string[]> }>;
    };
    expect(manifest.version).toBe(2);
    expect(Object.keys(manifest.packages)).toEqual(packageNames);

    for (const name of packageNames) {
      const contract = manifest.packages[name]!;
      const packageJson = JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as {
        exports: Record<string, { import: string }>;
      };
      expect(Object.keys(packageJson.exports)).toEqual(contract.subpaths);
      for (const subpath of contract.subpaths) {
        const built = await import(resolve(root, `packages/${name}`, packageJson.exports[subpath]!.import));
        expect(Object.keys(built).sort(), `${name}${subpath === "." ? "" : subpath.slice(1)}`).toEqual(
          contract.runtimeKeys[subpath],
        );
      }
    }
    const core = await import(resolve(root, "packages/effect-build/dist/index.js"));
    expect(Object.keys(core.Artifact).sort()).toEqual([
      "AbsolutePath",
      "ByteCount",
      "Digest",
      "ExecutableArtifact",
      "FileArtifact",
      "StageObservation",
      "ToolObservation",
    ]);
    expect(Object.keys(core.Target).sort()).toEqual(["ResolutionTarget", "SystemTarget"]);
    expect(Object.keys(core.JavaScriptBundle)).toEqual([
      "Format",
      "InvalidReason",
      "InvalidJavaScriptBundle",
      "JavaScriptBundleAccessOperation",
      "JavaScriptBundleAccessFailed",
      "JavaScriptBundleTemporaryDirectoryFailed",
      "withFile",
    ]);
  });

  it("exposes exactly the frozen declaration names", () => {
    const exports = declarationExports();
    for (const name of packageNames) expect(exports[name], name).toEqual([...exactDeclarations[name]].sort());
    expect(providerDeclarationExports(), "effect-build/Provider").toEqual([...exactProviderDeclarations].sort());
    expect(declarationModuleExports(integrationDeclarationFile), "effect-build/Integration").toEqual(
      [...exactIntegrationDeclarations].sort(),
    );
    expect(javaScriptBundleDeclarationExports(), "effect-build.JavaScriptBundle").toEqual(
      [...exactJavaScriptBundleDeclarations].sort(),
    );
  });

  it("keeps all four command-provider calls concrete rather than publicly generic", () => {
    expect(providerCallTypeParameterCounts()).toEqual({
      "effect-build-bun": [0, 0],
      "effect-build-deno": [0, 0],
    });
  });

  it("keeps rejected Plan 019 products and implementation types private", async () => {
    const forbidden =
      /ExecutableLifecycle|ProcessCompletion|NodeSeaService|JavaScriptBundleArtifact|PipelineExecutableArtifact|SemanticPlan|BoundExecutionPlan|inspectExecutable|receipt|provenance/i;
    for (const [name, names] of Object.entries(declarationExports())) {
      expect(names.filter((candidate) => forbidden.test(candidate)), name).toEqual([]);
    }
    for (const name of packageNames) {
      const runtime = await import(resolve(root, `packages/${name}/dist/index.js`));
      expect(Object.keys(runtime).filter((candidate) => forbidden.test(candidate)), name).toEqual([]);
    }
  });

  it("rejects missing, extra, duplicate, reordered, and missing-package API contracts", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8"));
    const { validatePublicApi } = await import(resolve(root, "scripts/read-tooling.mjs")) as {
      validatePublicApi: (api: unknown) => unknown;
    };
    const rejected = (mutate: (api: typeof manifest) => void): void => {
      const api = structuredClone(manifest);
      mutate(api);
      expect(() => validatePublicApi(api)).toThrow(/unexpected public API|exactly version and packages/);
    };
    rejected((api) => api.packages["effect-build"].runtimeKeys["."].pop());
    rejected((api) => api.packages["effect-build-node-sea"].runtimeKeys["."].push("extra"));
    rejected((api) => api.packages["effect-build-bun"].runtimeKeys["."].reverse());
    rejected((api) => api.packages["effect-build-deno"].subpaths.push("."));
    rejected((api) => delete api.packages["effect-build-node-sea"]);
  });

  it("keeps build output package-local", async () => {
    await expect(access(resolve(root, "dist"))).rejects.toThrow();
    for (const name of integrationPackages) {
      const entries = await readdir(resolve(root, `packages/${name}/dist`), { withFileTypes: true });
      expect(entries.some((entry) => entry.isFile() && entry.name === "index.js"), name).toBe(true);
      expect(entries.some((entry) => entry.isFile() && entry.name === "index.d.ts"), name).toBe(true);
    }
    const coreEntries = await readdir(resolve(root, "packages/effect-build/dist"), { withFileTypes: true });
    expect(coreEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()).toEqual([
      "standalone",
    ]);
    expect(providerRuntimeKeys).toHaveLength(5);
  });
});
