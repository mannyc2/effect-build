import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
} from "./model.mjs";
import { renderProjections } from "./projections.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const contract = validateContract(buildContract(inputs), inputs);
for (const [path, expected] of renderProjections(contract)) {
  const current = await readFile(resolve(repositoryRoot, path), "utf8").catch(() => undefined);
  if (current !== expected) throw new Error(`${path} is stale; run bun run generate:contract`);
}
await validateImplementationCoordinates(contract, repositoryRoot);
validatePublicApiProjection(contract, inputs.publicApi);
process.stdout.write("combined effect-build contract valid\n");
