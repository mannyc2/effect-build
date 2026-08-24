import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface SurfaceSubpath {
  readonly runtime: readonly string[];
  readonly declarations: readonly string[];
}

interface SurfacePackage {
  readonly namespaces: readonly string[];
  readonly subpaths: Readonly<Record<string, SurfaceSubpath>>;
}

interface Surface {
  readonly schema: "effect-build/public-surface@3";
  readonly packages: Readonly<Record<string, SurfacePackage>>;
}

const readSurface = async (): Promise<Surface> =>
  JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as Surface;

const declarationExports = (files: readonly string[]): (file: string) => readonly string[] => {
  const program = ts.createProgram({
    rootNames: [...files],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  return (file) => {
    const source = program.getSourceFile(file);
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (symbol === undefined) throw new Error(`declaration entry point has no module symbol: ${file}`);
    return checker.getExportsOfModule(symbol).map((entry) => entry.getName()).sort();
  };
};

const sorted = (values: readonly string[]): readonly string[] => [...values].sort();

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly exports: Record<string, { readonly types: string; readonly import: string }>;
  readonly dependencies?: Record<string, string>;
}

const readManifest = async (name: string): Promise<Manifest> =>
  JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as Manifest;

describe("public surface", () => {
  it("matches tooling/public-api.json exactly at runtime and in declarations", async () => {
    const surface = await readSurface();
    expect(surface.schema).toBe("effect-build/public-surface@3");
    const manifests = new Map(
      await Promise.all(
        Object.keys(surface.packages).map(async (name) => [name, await readManifest(name)] as const),
      ),
    );
    const declarationFiles = Object.entries(surface.packages).flatMap(([name, contract]) => {
      const manifest = manifests.get(name)!;
      return [manifest.exports["."]!, ...Object.keys(contract.subpaths).map((subpath) => manifest.exports[subpath]!)]
        .map((entry) => resolve(root, `packages/${name}`, entry.types));
    });
    const readDeclarationExports = declarationExports(declarationFiles);
    for (const [name, contract] of Object.entries(surface.packages)) {
      const manifest = manifests.get(name)!;
      expect(Object.keys(manifest.exports), name).toEqual([".", ...Object.keys(contract.subpaths)]);

      const rootEntry = manifest.exports["."]!;
      const rootRuntime = await import(resolve(root, `packages/${name}`, rootEntry.import));
      expect(Object.keys(rootRuntime).sort(), `${name} root`).toEqual(sorted(contract.namespaces));
      expect(readDeclarationExports(resolve(root, `packages/${name}`, rootEntry.types)), `${name} root types`).toEqual(
        sorted(contract.namespaces),
      );

      for (const [subpath, expected] of Object.entries(contract.subpaths)) {
        const entry = manifest.exports[subpath]!;
        const runtime = await import(resolve(root, `packages/${name}`, entry.import));
        expect(Object.keys(runtime).sort(), `${name}${subpath}`).toEqual(sorted(expected.runtime));
        expect(
          readDeclarationExports(resolve(root, `packages/${name}`, entry.types)),
          `${name}${subpath} types`,
        ).toEqual(sorted(expected.declarations));
      }
    }
  }, 30_000);

  it("keeps seven lockstep packages with one-way provider-to-core dependencies", async () => {
    const surface = await readSurface();
    const names = Object.keys(surface.packages);
    expect(names).toEqual([
      "effect-build",
      "effect-build-apple",
      "effect-build-bun",
      "effect-build-deno",
      "effect-build-esbuild",
      "effect-build-node-sea",
      "effect-build-rolldown",
    ]);
    const versions = new Set<string>();
    for (const name of names) {
      const manifest = await readManifest(name);
      versions.add(manifest.version);
      const dependencies = Object.keys(manifest.dependencies ?? {});
      if (name === "effect-build") expect(dependencies).toEqual([]);
      else {
        expect(dependencies, name).toContain("effect-build");
        expect(dependencies.filter((dependency) => dependency.startsWith("effect-build-")), name).toEqual([]);
      }
    }
    expect(versions.size).toBe(1);
  });

  it("keeps publication quarantined after materializing the exact-prepacked control plane", async () => {
    const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("name: Release (quarantined)");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("group: effect-build-release-v0.5.0");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("Stage 9 authority is unearned");
    expect(workflow).toContain("if: false");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("environment: npm");
    expect(workflow).toContain("candidateWorkflowRunId");
    expect(workflow).toContain("appleCertificationArtifactDigest");
    expect(workflow).not.toContain("npm publish");
    expect(workflow).not.toContain("APPLE_RELEASE_");
  });

  it("ships only declared modules in every package dist", async () => {
    const surface = await readSurface();
    for (const [name, contract] of Object.entries(surface.packages)) {
      const entries = await readdir(resolve(root, `packages/${name}/dist`), { recursive: true });
      const declared = new Set(
        ["index", ...Object.keys(contract.subpaths).map((subpath) => subpath.slice(2))].flatMap((module) => [
          `${module}.js`,
          `${module}.d.ts`,
        ]),
      );
      const undeclared = entries.filter((entry) =>
        typeof entry === "string"
        && (entry.endsWith(".js") || entry.endsWith(".d.ts"))
        && !entry.includes("internal")
        && !declared.has(entry.replaceAll("\\", "/"))
      );
      expect(undeclared, name).toEqual([]);
    }
  });

  it("keeps Apple library source platform-neutral and runtime-owned", async () => {
    const sourceRoot = resolve(root, "packages/effect-build-apple/src");
    const entries = await readdir(sourceRoot, { recursive: true });
    for (const entry of entries) {
      if (typeof entry !== "string" || !entry.endsWith(".ts")) continue;
      const source = await readFile(resolve(sourceRoot, entry), "utf8");
      expect(source, entry).not.toMatch(/from\s+["']node:/u);
      expect(source, entry).not.toMatch(/Effect\.run(?:Promise|Sync|Fork|Callback)/u);
    }
  });
});
