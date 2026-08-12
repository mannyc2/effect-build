import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const readTooling = async () => {
  const load = async (name) => JSON.parse(await readFile(resolve(root, "tooling", name), "utf8"));
  const pins = await load("tool-pins.json");
  const support = await load("support-matrix.json");
  const api = await load("public-api.json");
  if (pins.version !== 1 || support.version !== 1 || api.version !== 1) {
    throw new Error("unsupported tooling version");
  }
  if (new Set(pins.tools.map((entry) => entry.tool)).size !== pins.tools.length) {
    throw new Error("duplicate tool pin");
  }
  if (new Set(support.publicationHosts).size !== support.publicationHosts.length) {
    throw new Error("duplicate publication host");
  }
  if (JSON.stringify(api.subpaths) !== JSON.stringify([".", "./bun", "./deno"])) {
    throw new Error("unexpected public subpaths");
  }
  return { pins, support, api };
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await readTooling()));
}
