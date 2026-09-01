import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
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

interface CombinedContract {
  readonly schema: "effect-build/combined-contract@1";
  readonly publicApiProjection: {
    readonly packages: Readonly<Record<string, unknown>>;
    readonly privatePackages: readonly string[];
  };
  readonly providerOperationRegister: {
    readonly operations: readonly {
      readonly accounting: { readonly surface: "public" | "private" | "absent" };
      readonly implementation: null | {
        readonly package: string;
        readonly lane: string;
        readonly path: string;
      };
    }[];
  };
  readonly privateImplementationRegister: {
    readonly capabilities: readonly {
      readonly package: string;
      readonly path: string;
    }[];
  };
}

const readSurface = async (): Promise<Surface> =>
  JSON.parse(await readFile(resolve(root, "tooling/public-api.json"), "utf8")) as Surface;

const readContract = async (): Promise<CombinedContract> =>
  JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8")) as CombinedContract;

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

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly exports: Record<string, { readonly types: string; readonly import: string }>;
  readonly dependencies?: Record<string, string>;
}

const readManifest = async (name: string): Promise<Manifest> =>
  JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), "utf8")) as Manifest;

const normalized = (value: string): string => value.replaceAll("\\", "/");

const moduleSpecifiers = (source: string, file: string): readonly string[] => {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, false);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)
    ) found.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
};

const reachableModules = async (
  dist: string,
  entrypoints: readonly string[],
  kind: "runtime" | "declaration",
): Promise<ReadonlySet<string>> => {
  const pending = [...entrypoints];
  const reachable = new Set<string>();
  while (pending.length > 0) {
    const module = normalized(pending.shift()!);
    if (reachable.has(module)) continue;
    reachable.add(module);
    const absolute = resolve(dist, module);
    const source = await readFile(absolute, "utf8");
    for (const fileName of moduleSpecifiers(source, absolute)) {
      if (!fileName.startsWith(".")) continue;
      const target = kind === "declaration" && fileName.endsWith(".js")
        ? `${fileName.slice(0, -3)}.d.ts`
        : fileName;
      const candidate = normalized(relative(dist, resolve(dirname(absolute), target)));
      if (candidate === ".." || candidate.startsWith("../")) {
        throw new Error(`${module} reaches outside its package dist through ${fileName}`);
      }
      pending.push(candidate);
    }
  }
  return reachable;
};

describe("public surface", () => {
  it("matches tooling/public-api.json exactly at runtime and in declarations", async () => {
    const surface = await readSurface();
    expect(surface.schema).toBe("effect-build/public-surface@3");
    expect(Object.keys(surface.packages)).toHaveLength(11);
    expect(surface.packages["effect-build-rolldown"]).toBeUndefined();
    expect(
      Object.values(surface.packages).reduce((count, entry) => count + 1 + Object.keys(entry.subpaths).length, 0),
    ).toBe(42);
    for (const [name, contract] of Object.entries(surface.packages)) {
      const manifest = await readManifest(name);
      expect(Object.keys(manifest.exports), name).toEqual([".", ...Object.keys(contract.subpaths)]);

      const rootEntry = manifest.exports["."]!;
      const rootRuntime = await import(resolve(root, `packages/${name}`, rootEntry.import));
      expect(Object.keys(rootRuntime).sort(), `${name} root`).toEqual(sorted(contract.namespaces));
      expect(declarationExports(resolve(root, `packages/${name}`, rootEntry.types)), `${name} root types`).toEqual(
        sorted(contract.namespaces),
      );

      for (const [subpath, expected] of Object.entries(contract.subpaths)) {
        const entry = manifest.exports[subpath]!;
        const runtime = await import(resolve(root, `packages/${name}`, entry.import));
        expect(Object.keys(runtime).sort(), `${name}${subpath}`).toEqual(sorted(expected.runtime));
        expect(
          declarationExports(resolve(root, `packages/${name}`, entry.types)),
          `${name}${subpath} types`,
        ).toEqual(sorted(expected.declarations));
      }
    }
  }, 60_000);

  it("keeps every public or private workspace package in lockstep with one-way core dependencies", async () => {
    const [surface, contract] = await Promise.all([readSurface(), readContract()]);
    expect(contract.schema).toBe("effect-build/combined-contract@1");
    const publicNames = Object.keys(surface.packages);
    expect(sorted(publicNames)).toEqual(sorted(Object.keys(contract.publicApiProjection.packages)));
    const names = [...publicNames, ...contract.publicApiProjection.privatePackages].sort();
    const packageDirectories = (await readdir(resolve(root, "packages"))).sort();
    expect(names).toEqual(packageDirectories);
    const versions = new Set<string>();
    for (const name of names) {
      const manifest = await readManifest(name);
      expect(manifest.name).toBe(name);
      expect(manifest.private === true, name).toBe(!publicNames.includes(name));
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

  it("keeps contract-private packages import-inert", async () => {
    const contract = await readContract();
    for (const name of contract.publicApiProjection.privatePackages) {
      const manifest = await readManifest(name);
      expect(manifest.private, name).toBe(true);
      expect(Object.keys(manifest.exports), name).toEqual(["."]);
      const rootEntry = manifest.exports["."]!;
      const runtime = await import(resolve(root, `packages/${name}`, rootEntry.import));
      expect(Object.keys(runtime), `${name} runtime`).toEqual([]);
      expect(declarationExports(resolve(root, `packages/${name}`, rootEntry.types)), `${name} types`).toEqual([]);
    }
  });

  it("keeps the Apple Notary internals package-private without widening the 42-module surface", async () => {
    const [surface, manifest, indexSource, notarySource, codecSource, rejectionSource, submissionSource] = await Promise
      .all([
        readSurface(),
        readManifest("effect-build-apple"),
        readFile(resolve(root, "packages/effect-build-apple/src/index.ts"), "utf8"),
        readFile(resolve(root, "packages/effect-build-apple/src/Notary.ts"), "utf8"),
        readFile(resolve(root, "packages/effect-build-apple/src/internal/NotaryJournalCodec.ts"), "utf8"),
        readFile(resolve(root, "packages/effect-build-apple/src/internal/NotaryRejectionFixture.ts"), "utf8"),
        readFile(resolve(root, "packages/effect-build-apple/src/internal/NotarySubmission.ts"), "utf8"),
      ]);
    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      "./AppBundle",
      "./Assess",
      "./CodeSign",
      "./DiskImage",
      "./InstallerPackage",
      "./Model",
      "./Notary",
      "./Staple",
    ]);
    expect(Object.keys(surface.packages)).toHaveLength(11);
    expect(
      Object.values(surface.packages).reduce((count, entry) => count + 1 + Object.keys(entry.subpaths).length, 0),
    ).toBe(42);
    for (
      const name of [
        "NotaryJournalCodecError",
        "NotaryJournalValueTag",
        "decodeNotaryJournalValue",
        "encodeNotaryJournalValue",
        "notaryJournalCodecId",
        "submissionReferenceFromSubmission",
      ]
    ) {
      expect(surface.packages["effect-build-apple"]?.subpaths["./Notary"]?.runtime).not.toContain(name);
      expect(surface.packages["effect-build-apple"]?.subpaths["./Notary"]?.declarations).not.toContain(name);
      expect(indexSource).not.toContain(name);
      expect(notarySource).not.toContain(name);
      expect(codecSource).toContain(`export ${name === "NotaryJournalCodecError" ? "class" : "const"} ${name}`);
    }
    for (
      const name of [
        "NotaryRejectionFixture",
        "PreparedAppSubmission",
        "Submitter",
        "makeSubmissionEngine",
        "submitOnce",
      ]
    ) {
      expect(surface.packages["effect-build-apple"]?.subpaths["./Notary"]?.runtime).not.toContain(name);
      expect(surface.packages["effect-build-apple"]?.subpaths["./Notary"]?.declarations).not.toContain(name);
      expect(indexSource).not.toContain(name);
    }
    expect(rejectionSource).toContain("export class Submitter");
    expect(rejectionSource).toContain("export const submitOnce");
    expect(submissionSource).toContain("export const makeSubmissionEngine");
    expect(submissionSource).toContain("export interface PreparedAppSubmission");
    expect(codecSource).toContain("new Notary.SubmissionReference({");
    for (const entry of await readdir(resolve(root, "packages/effect-build-apple/src"), { recursive: true })) {
      if (typeof entry !== "string") continue;
      const normalizedEntry = normalized(entry);
      if (!normalizedEntry.endsWith(".ts") || normalizedEntry === "internal/NotaryJournalCodec.ts") continue;
      const source = await readFile(resolve(root, "packages/effect-build-apple/src", normalizedEntry), "utf8");
      expect(source, normalizedEntry).not.toMatch(/new\s+(?:Notary\.)?SubmissionReference\s*\(/u);
    }
  });

  it("ships only declared modules in every package dist", async () => {
    const [surface, contract] = await Promise.all([readSurface(), readContract()]);
    for (const name of Object.keys(surface.packages)) {
      const manifest = await readManifest(name);
      const dist = resolve(root, `packages/${name}/dist`);
      const entries = (await readdir(dist, { recursive: true }))
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalized);
      const runtimeEntrypoints = Object.values(manifest.exports).map(({ import: target }) =>
        normalized(target).replace(/^\.\/dist\//u, "")
      );
      const declarationEntrypoints = Object.values(manifest.exports).map(({ types }) =>
        normalized(types).replace(/^\.\/dist\//u, "")
      );
      const privateOperations = contract.providerOperationRegister.operations.filter((operation) =>
        operation.accounting.surface === "private" && operation.implementation?.package === name
      );
      const sourcePrefix = `packages/${name}/src/`;
      const privateSupport = contract.privateImplementationRegister.capabilities.filter((capability) =>
        capability.package === name && capability.path.startsWith(sourcePrefix)
      );
      const privateRuntimeEntrypoints = new Set(
        [
          ...privateOperations.flatMap(({ implementation }) => {
            if (implementation === null || !implementation.path.startsWith(sourcePrefix)) return [];
            const module = implementation.path.slice(sourcePrefix.length).replace(/\.ts$/u, ".js");
            const laneIndex = `${implementation.lane}/index.js`;
            return entries.includes(laneIndex) ? [module, laneIndex] : [module];
          }),
          ...privateSupport.map(({ path }) => path.slice(sourcePrefix.length).replace(/\.ts$/u, ".js")),
        ],
      );
      const privateDeclarationEntrypoints = [...privateRuntimeEntrypoints].map((entry) => `${entry.slice(0, -3)}.d.ts`);
      const [runtime, declarations] = await Promise.all([
        reachableModules(dist, [...runtimeEntrypoints, ...privateRuntimeEntrypoints], "runtime"),
        reachableModules(dist, [...declarationEntrypoints, ...privateDeclarationEntrypoints], "declaration"),
      ]);
      expect(entries.filter((entry) => entry.endsWith(".js") && !runtime.has(entry)), `${name} runtime`).toEqual([]);
      const emittedDeclarations = new Set(
        [...runtime].filter((entry) => entry.endsWith(".js")).map((entry) => `${entry.slice(0, -3)}.d.ts`),
      );
      expect(
        entries.filter((entry) =>
          entry.endsWith(".d.ts") && !declarations.has(entry) && !emittedDeclarations.has(entry)
        ),
        `${name} declarations`,
      ).toEqual([]);
    }
  });
});
