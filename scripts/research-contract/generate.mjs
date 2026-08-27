import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContract, contractPath, readInputs, renderJson, validateContract } from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--check")) {
  throw new Error("usage: node scripts/research-contract/generate.mjs [--check]");
}

const inputs = await readInputs(repositoryRoot);
const contract = buildContract(inputs);
validateContract(contract, inputs);
const rendered = renderJson(contract);
const output = resolve(repositoryRoot, contractPath);

if (arguments_[0] === "--check") {
  const current = await readFile(output, "utf8").catch(() => null);
  if (current !== rendered) throw new Error(`${contractPath} is stale; run bun run generate:research-contract`);
} else {
  await writeFile(output, rendered);
}
