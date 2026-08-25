#!/usr/bin/env node
// Regenerates tooling/public-api.json from the built dist of every package.
// Run `bun run build` first; the architecture suite asserts against the result.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");

const declarationExports = (file) => {
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

const runtimeExports = async (file) => Object.keys(await import(pathToFileURL(file).href)).sort();

const packages = (await readdir(resolve(root, "packages"))).sort();
const surface = { schema: "effect-build/public-surface@3", packages: {} };

for (const name of packages) {
  const manifest = JSON.parse(await readFile(resolve(root, "packages", name, "package.json"), "utf8"));
  const namespaces = await runtimeExports(resolve(root, "packages", name, manifest.exports["."].import));
  const subpaths = {};
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (subpath === ".") continue;
    subpaths[subpath] = {
      runtime: await runtimeExports(resolve(root, "packages", name, entry.import)),
      declarations: declarationExports(resolve(root, "packages", name, entry.types)),
    };
  }
  surface.packages[name] = { namespaces, subpaths };
}

await writeFile(resolve(root, "tooling/public-api.json"), `${JSON.stringify(surface, null, 2)}\n`);
console.log(`wrote tooling/public-api.json for ${packages.length} packages`);
