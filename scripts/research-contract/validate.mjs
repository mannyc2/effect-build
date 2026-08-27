import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractPath, readInputs, validateContract } from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const contract = JSON.parse(await readFile(resolve(repositoryRoot, contractPath), "utf8"));
validateContract(contract, inputs);
process.stdout.write("research-complete contract valid\n");
