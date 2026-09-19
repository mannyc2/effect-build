import { readFile, writeFile } from "node:fs/promises";
import { Tool } from "effect-build";

const packages = ["bun", "deno", "node-sea", "archives", "python", "nfpm", "sbom", "windows", "apple", "esbuild", "rolldown"];
const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
const rows = [];
for (const suffix of packages) {
  const name = `effect-build-${suffix}`;
  const provider = await import(name);
  for (const version of provider.tested) {
    if (Tool.parseVersion(version) === undefined || !Tool.satisfies(provider.supported)(version)) {
      throw new Error(`${name}: tested version ${version} is not an exact version inside ${provider.supported}`);
    }
  }
  const constraints = Object.entries(provider.constraints).flatMap(([operation, values]) => values.map((constraint) =>
    `\`${operation}\` rejects \`${cell(constraint.range)}\`: ${cell(constraint.reason)}`)).join("<br>");
  rows.push(`| ${name} | \`${provider.name}\` | \`${cell(provider.supported)}\` | ${provider.tested.map((version) => `\`${version}\``).join(", ")} | ${constraints || "—"} |`);
}
const table = ["| Provider | Tool | `supported` | `tested` | Operation constraints |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
const path = new URL("../docs/providers.md", import.meta.url);
const before = await readFile(path, "utf8");
const start = "<!-- providers-table:start -->";
const end = "<!-- providers-table:end -->";
if (!before.includes(start) || !before.includes(end)) throw new Error("Provider table markers are missing");
const after = before.slice(0, before.indexOf(start) + start.length) + "\n\n" + table + "\n\n" + before.slice(before.indexOf(end));
if (process.argv.includes("--check")) {
  if (before !== after) throw new Error("Provider table is stale; run bun scripts/providers-table.mjs");
} else {
  await writeFile(path, after);
}
