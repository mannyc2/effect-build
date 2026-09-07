import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContract, readInputs, renderJson, validateContract } from "./model.mjs";
import { renderProjections } from "./projections.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, ...rest] = process.argv.slice(2);
if (rest.length > 0 || (mode !== undefined && mode !== "--stdout")) {
  throw new Error("usage: node scripts/effect-build-contract/generate.mjs [--stdout]");
}

const inputs = await readInputs(repositoryRoot);
const contract = validateContract(buildContract(inputs), inputs);

if (mode === "--stdout") {
  process.stdout.write(renderJson(contract));
} else {
  for (const [path, rendered] of renderProjections(contract)) {
    await writeFile(resolve(repositoryRoot, path), rendered);
  }
}
