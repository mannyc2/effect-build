import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  contractPath,
  readInputs,
  renderJson,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
} from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const current = await readFile(resolve(repositoryRoot, contractPath), "utf8");
const contract = buildContract(inputs);
if (current !== renderJson(contract)) {
  throw new Error(`${contractPath} is stale; run bun run generate:contract`);
}
validateContract(contract, inputs);
await validateImplementationCoordinates(contract, repositoryRoot);
validatePublicApiProjection(contract, inputs.publicApi);
process.stdout.write("combined effect-build contract valid\n");
