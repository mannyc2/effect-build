#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript-api";

const root = resolve(import.meta.dirname, "..");
const packages = [];
for (const name of (await readdir(resolve(root, "packages"))).sort()) {
  const directory = resolve(root, "packages", name);
  const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
  if (!manifest.private) packages.push({ name, directory, manifest });
}
const program = ts.createProgram({
  rootNames: packages.flatMap(({ directory, manifest }) =>
    Object.values(manifest.exports).map((entry) => resolve(directory, entry.types))
  ),
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  },
});
const checker = program.getTypeChecker();
const symbols = new Set();
const namespaces = new Set();
const visit = (symbol) => {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (symbols.has(resolved) || namespaces.has(resolved)) return;
  if (resolved.flags & ts.SymbolFlags.Module) {
    namespaces.add(resolved);
    checker.getExportsOfModule(resolved).forEach(visit);
  } else {
    symbols.add(resolved);
  }
};
const declarations = (file) => {
  const source = program.getSourceFile(file);
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  assert.ok(symbol, `no declaration module symbol: ${file}`);
  const exports = checker.getExportsOfModule(symbol);
  exports.forEach(visit);
  return exports.map((entry) => entry.getName()).sort();
};
const surface = { schema: "effect-build/public-surface@4", packages: {}, symbols: {} };
const versions = new Set();
for (const { name, directory, manifest } of packages) {
  versions.add(manifest.version);
  const siblings = Object.keys(manifest.dependencies ?? {}).filter((dependency) =>
    dependency.startsWith("effect-build-")
  );
  assert.deepEqual(siblings, [], `${name} depends on a sibling binding`);
  if (name !== "effect-build") assert.ok(manifest.dependencies?.["effect-build"], `${name} needs core`);
  const entrypoints = {};
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    entrypoints[subpath] = {
      runtime: Object.keys(await import(pathToFileURL(resolve(directory, entry.import)).href)).sort(),
      declarations: declarations(resolve(directory, entry.types)),
    };
  }
  surface.packages[name] = entrypoints;
}
assert.equal(versions.size, 1, "packages must have one lockstep version");
surface.symbols = { named: symbols.size, namespaces: namespaces.size, total: symbols.size + namespaces.size };
const output = `${JSON.stringify(surface, null, 2)}\n`;
const destination = resolve(root, "tooling/public-api.json");
if (process.argv.includes("--check")) {
  assert.equal(await readFile(destination, "utf8"), output, "public surface changed; regenerate deliberately");
} else {
  await writeFile(destination, output);
}
console.log(`${packages.length} packages; ${surface.symbols.total} reachable public symbols`);
