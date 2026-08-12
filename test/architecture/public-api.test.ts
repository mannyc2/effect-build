import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);

const declarationEntryPoints = ["index", "Bun", "Deno"] as const;

const builtDeclarationExports = (): Readonly<Record<typeof declarationEntryPoints[number], readonly string[]>> => {
  const rootNames = declarationEntryPoints.map((module) => resolve(root, `dist/${module}.d.ts`));
  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  const namesFor = (module: typeof declarationEntryPoints[number]): readonly string[] => {
    const file = resolve(root, `dist/${module}.d.ts`);
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`declaration program did not load ${file}`);
    const symbol = checker.getSymbolAtLocation(source);
    if (symbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
    return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
  };
  return { index: namesFor("index"), Bun: namesFor("Bun"), Deno: namesFor("Deno") };
};

const builtProviderCallTypeParameterCounts = (): Readonly<Record<"Bun" | "Deno", readonly number[]>> => {
  const rootNames = declarationEntryPoints.map((module) => resolve(root, `dist/${module}.d.ts`));
  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  const countsFor = (module: "Bun" | "Deno"): readonly number[] => {
    const file = resolve(root, `dist/${module}.d.ts`);
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`declaration program did not load ${file}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
    const exported = checker.getExportsOfModule(moduleSymbol);
    return ["compileExecutable", "compileExecutableMatrix"].map((name) => {
      const symbol = exported.find((candidate) => candidate.getName() === name);
      const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      if (symbol === undefined || declaration === undefined) {
        throw new Error(`missing callable declaration ${module}.${name}`);
      }
      const signatures = checker.getSignaturesOfType(
        checker.getTypeOfSymbolAtLocation(symbol, declaration),
        ts.SignatureKind.Call,
      );
      if (signatures.length !== 1) throw new Error(`${module}.${name} must have exactly one call signature`);
      return signatures[0]?.typeParameters?.length ?? 0;
    });
  };
  return { Bun: countsFor("Bun"), Deno: countsFor("Deno") };
};

const exactExportedDeclarations = {
  index: ["Artifact", "BuildError", "MatrixError", "Target"],
  Bun: [
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
  Deno: [
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
} as const;

describe("built public API", () => {
  it("matches the authored runtime-key allowlists", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      subpaths: string[];
      rootRuntimeKeys: string[];
      toolRuntimeKeys: string[];
    };
    expect(manifest.subpaths).toEqual([".", "./bun", "./deno"]);

    const api = await import(resolve(root, "dist/index.js"));
    expect(Object.keys(api)).toEqual(manifest.rootRuntimeKeys);

    for (const module of ["Bun", "Deno"]) {
      const tool = await import(resolve(root, `dist/${module}.js`));
      expect(Object.keys(tool)).toEqual(manifest.toolRuntimeKeys);
    }

    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(Object.keys(packageJson.exports).sort()).toEqual([...manifest.subpaths].sort());
    expect(packageJson.exports["./bun"]).toEqual({ types: "./dist/Bun.d.ts", import: "./dist/Bun.js" });
    expect(packageJson.exports["./deno"]).toEqual({ types: "./dist/Deno.d.ts", import: "./dist/Deno.js" });
  });

  it("exposes exactly the frozen runtime and type-only declaration names", async () => {
    const exports = builtDeclarationExports();
    for (const [module, expected] of Object.entries(exactExportedDeclarations)) {
      expect(exports[module as keyof typeof exports], module).toEqual([...expected].sort());
    }
  });

  it("keeps both provider operations concrete rather than publicly generic", () => {
    expect(builtProviderCallTypeParameterCounts()).toEqual({ Bun: [0, 0], Deno: [0, 0] });
  });

  it("rejects missing, extra, duplicate, and out-of-order manifest keys", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as {
      version: number;
      subpaths: string[];
      rootRuntimeKeys: string[];
      toolRuntimeKeys: string[];
    };
    const { validatePublicApi } = await import(resolve(root, "scripts/read-tooling.mjs")) as {
      validatePublicApi: (api: unknown) => unknown;
    };
    const rejected = (mutate: (api: typeof manifest) => void): void => {
      const api = structuredClone(manifest);
      mutate(api);
      expect(() => validatePublicApi(api)).toThrow(/unexpected public API/);
    };

    rejected((api) => api.rootRuntimeKeys.pop());
    rejected((api) => api.toolRuntimeKeys.push("extra"));
    rejected((api) => api.rootRuntimeKeys.push(api.rootRuntimeKeys[0]!));
    rejected((api) => api.toolRuntimeKeys.reverse());
  });

  it("keeps the build output at exactly the standalone module tree", async () => {
    const entries = await readdir(resolve(root, "dist"), { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(directories).toEqual(["standalone"]);
    const moduleNames = new Set(
      entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name),
    );
    expect([...moduleNames].sort()).toEqual(["Bun.js", "Deno.js", "index.js"]);
  });
});
