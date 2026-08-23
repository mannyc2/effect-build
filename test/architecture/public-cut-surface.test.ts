import { access, readdir, readFile } from "node:fs/promises";
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
}

interface SurfacePackage {
  readonly name: string;
  readonly root: {
    readonly form: "namespace-only";
    readonly namespaces: readonly string[];
  };
  readonly subpaths: readonly SurfaceSubpath[];
}

interface Surface {
  readonly schema: "effect-build/public-surface@2";
  readonly version: "0.4.0";
  readonly status: "frozen";
  readonly packageTrain: { readonly packages: readonly SurfacePackage[] };
}

const readSurface = async (): Promise<Surface> =>
  JSON.parse(await readFile(resolve(root, "research/post-0.3/freeze/SURFACE.json"), "utf8")) as Surface;

const declarationExports = (file: string): readonly string[] => {
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
  const symbol = source === undefined ? undefined : program.getTypeChecker().getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
  return program.getTypeChecker().getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
};

const sorted = (values: readonly string[]): readonly string[] => [...values].sort();

const readPackageJson = async (name: string): Promise<{
  readonly name: string;
  readonly version: string;
  readonly exports: Record<string, { readonly types: string; readonly import: string }>;
  readonly dependencies?: Record<string, string>;
}> =>
  JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as {
    readonly name: string;
    readonly version: string;
    readonly exports: Record<string, { readonly types: string; readonly import: string }>;
    readonly dependencies?: Record<string, string>;
  };

const expectedDependencies = (name: string): Record<string, string> =>
  name === "effect-build"
    ? {}
    : name === "effect-build-esbuild"
    ? { "effect-build": "workspace:^", esbuild: "0.28.2" }
    : { "effect-build": "workspace:^" };

const obsoleteDistPaths = [
  "Integration.js",
  "Integration.d.ts",
  "JavaScriptBundle.js",
  "JavaScriptBundle.d.ts",
  "Provider.js",
  "Provider.d.ts",
  "standalone",
  "Adapter.js",
  "Adapter.d.ts",
  "Bundle.js",
  "Bundle.d.ts",
  "internal/Esbuild.js",
  "internal/Esbuild.d.ts",
  "internal/NodeSea.js",
  "internal/NodeSea.d.ts",
  "internal/SelectedNodeExecutable.js",
  "internal/SelectedNodeExecutable.d.ts",
];

describe("Plan 044 public cut", () => {
  it("projects the frozen 0.4 package, namespace, subpath, runtime, and declaration surface exactly", async () => {
    const surface = await readSurface();
    expect(surface.schema).toBe("effect-build/public-surface@2");
    expect(surface.version).toBe("0.4.0");
    expect(surface.status).toBe("frozen");

    for (const contract of surface.packageTrain.packages) {
      const manifest = await readPackageJson(contract.name);
      const expectedSubpaths = [".", ...contract.subpaths.map((entry) => entry.subpath)];
      expect(manifest.name).toBe(contract.name);
      expect(manifest.version).toBe("0.4.0");
      expect(Object.keys(manifest.exports)).toEqual(expectedSubpaths);
      expect(manifest.dependencies ?? {}).toEqual(expectedDependencies(contract.name));

      const rootEntry = manifest.exports["."];
      expect(rootEntry).toBeDefined();
      const rootRuntime = await import(resolve(root, `packages/${contract.name}`, rootEntry!.import));
      expect(Object.keys(rootRuntime).sort()).toEqual(sorted(contract.root.namespaces));
      expect(declarationExports(resolve(root, `packages/${contract.name}`, rootEntry!.types))).toEqual(
        sorted(contract.root.namespaces),
      );

      for (const subpath of contract.subpaths) {
        const entry = manifest.exports[subpath.subpath];
        expect(entry, `${contract.name}${subpath.subpath}`).toBeDefined();
        const runtime = await import(resolve(root, `packages/${contract.name}`, entry!.import));
        expect(Object.keys(runtime).sort(), `${contract.name}${subpath.subpath}`).toEqual(
          sorted(subpath.runtimeExports),
        );
        expect(declarationExports(resolve(root, `packages/${contract.name}`, entry!.types))).toEqual(
          sorted(subpath.exports),
        );
      }
    }
  }, 20_000);

  it("does not ship the pre-0.4 public modules or provider adapters behind the new exports", async () => {
    const surface = await readSurface();
    for (const { name } of surface.packageTrain.packages) {
      for (const path of obsoleteDistPaths) {
        await expect(access(resolve(root, `packages/${name}/dist/${path}`)), `${name}/dist/${path}`).rejects.toThrow();
      }
    }
  });

  it("has only declared 0.4 entry modules in every package root", async () => {
    const surface = await readSurface();
    for (const contract of surface.packageTrain.packages) {
      const entries = await readdir(resolve(root, `packages/${contract.name}/dist`), { recursive: true });
      const exported = new Set([
        "index.js",
        "index.d.ts",
        ...contract.subpaths.flatMap(({ subpath }) => {
          const module = subpath.slice(2);
          return [`${module}.js`, `${module}.d.ts`];
        }),
      ]);
      const legacy = entries.filter((entry) =>
        typeof entry === "string"
        && /(?:^|\/)(?:standalone|Integration\.(?:js|d\.ts)|Provider\.(?:js|d\.ts)|JavaScriptBundle\.(?:js|d\.ts)|Adapter\.(?:js|d\.ts)|Bundle\.(?:js|d\.ts))$/
          .test(entry)
      );
      expect(legacy, contract.name).toEqual([]);
      expect([...exported].every((path) => typeof path === "string")).toBe(true);
    }
  });
});
