import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContract, contractPath, readInputs, renderJson, validateContract } from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [mode, ...rest] = process.argv.slice(2);
if (rest.length > 0 || (mode !== undefined && mode !== "--stdout")) {
  throw new Error("usage: node scripts/effect-build-contract/generate.mjs [--stdout]");
}

const inputs = await readInputs(repositoryRoot);
const rendered = renderJson(validateContract(buildContract(inputs), inputs));
const output = resolve(repositoryRoot, contractPath);

if (mode === "--stdout") {
  process.stdout.write(rendered);
} else {
  await writeFile(output, rendered);
}
