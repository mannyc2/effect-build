import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Application } from "typedoc";

const root = resolve(import.meta.dirname, "../..");
const entryPoints = [];
for (const name of (await readdir(resolve(root, "packages"))).sort()) {
  const directory = resolve(root, "packages", name);
  const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
  if (manifest.private) continue;
  for (const entry of Object.values(manifest.exports)) {
    entryPoints.push(resolve(directory, entry.types));
  }
}

// TypeDoc uses the stable TypeScript compiler API; the repository's build uses native TS7.
const app = await Application.bootstrapWithPlugins({
  entryPoints,
  tsconfig: resolve(import.meta.dirname, "tsconfig.json"),
  name: "effect-build",
  readme: resolve(root, "README.md"),
  excludePrivate: true,
  excludeProtected: true,
  excludeExternals: true,
  navigation: { includeCategories: false },
});
const project = await app.convert();
if (project === undefined) throw new Error("API documentation conversion failed");
await app.generateDocs(project, resolve(root, "dist/api"));
