#!/usr/bin/env node
// Regenerates tooling/public-api.json from package entry points. Built output is
// authoritative when present; before a build, the equivalent TypeScript source
// entry points provide a deterministic projection that is verified against dist
// by the architecture suite after compilation.
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");

const exists = async (path) => await access(path).then(() => true, () => false);

const sourceEntry = async (packageRoot, declaration) => {
  const relative = declaration.replace(/^\.\/dist\//u, "").replace(/\.d\.ts$/u, "");
  const candidates = [resolve(packageRoot, "src", `${relative}.ts`), resolve(packageRoot, "src", relative, "index.ts")];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error(`no source entry point for ${declaration}`);
};

const exportReader = (files) => {
  const program = ts.createProgram({
    rootNames: files,
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
    if (symbol === undefined) throw new Error(`entry point has no module symbol: ${file}`);
    const exports = checker.getExportsOfModule(symbol);
    const runtime = exports.filter((entry) => {
      const target = (entry.flags & ts.SymbolFlags.Alias) === 0 ? entry : checker.getAliasedSymbol(entry);
      return (target.flags & ts.SymbolFlags.Value) !== 0;
    }).map((entry) => entry.getName()).sort();
    return { runtime, declarations: exports.map((entry) => entry.getName()).sort() };
  };
};

const runtimeExports = async (file) => Object.keys(await import(pathToFileURL(file).href)).sort();

const packageNames = (await readdir(resolve(root, "packages"))).sort();
const discoveredPackages = await Promise.all(packageNames.map(async (name) => {
  const packageRoot = resolve(root, "packages", name);
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
  if (manifest.private === true) return null;
  const entries = await Promise.all(Object.entries(manifest.exports).map(async ([subpath, entry]) => ({
    subpath,
    entry,
    source: await sourceEntry(packageRoot, entry.types),
    runtime: resolve(packageRoot, entry.import),
    declaration: resolve(packageRoot, entry.types),
  })));
  return { name, entries };
}));
const packages = discoveredPackages.filter((entry) => entry !== null);
const sourceExports = exportReader(packages.flatMap(({ entries }) => entries.map((entry) => entry.source)));
const built = (await Promise.all(packages.flatMap(({ entries }) =>
  entries.flatMap((entry) => [exists(entry.runtime), exists(entry.declaration)])
))).every(Boolean);
const surface = { schema: "effect-build/public-surface@3", packages: {} };

for (const { name, entries } of packages) {
  const readExports = async (entry) => built
    ? {
      runtime: await runtimeExports(entry.runtime),
      declarations: exportReader([entry.declaration])(entry.declaration).declarations,
    }
    : sourceExports(entry.source);
  const rootEntry = entries.find((entry) => entry.subpath === ".");
  if (rootEntry === undefined) throw new Error(`${name} has no root export`);
  const namespaces = (await readExports(rootEntry)).runtime;
  const subpaths = {};
  for (const entry of entries) {
    if (entry.subpath === ".") continue;
    const exports = await readExports(entry);
    const subpath = entry.subpath;
    subpaths[subpath] = {
      runtime: exports.runtime,
      declarations: exports.declarations,
    };
  }
  surface.packages[name] = { namespaces, subpaths };
}

await writeFile(resolve(root, "tooling/public-api.json"), `${JSON.stringify(surface, null, 2)}\n`);
console.log(
  `wrote tooling/public-api.json for ${packages.length} admitted packages from ${built ? "dist" : "source"}`,
);
