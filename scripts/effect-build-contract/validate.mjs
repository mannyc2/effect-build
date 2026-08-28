import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contractPath,
  readInputs,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
} from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const contract = JSON.parse(await readFile(resolve(repositoryRoot, contractPath), "utf8"));
validateContract(contract, inputs);
await validateImplementationCoordinates(contract, repositoryRoot);
validatePublicApiProjection(contract, inputs.publicApi);
process.stdout.write("combined effect-build contract valid\n");
