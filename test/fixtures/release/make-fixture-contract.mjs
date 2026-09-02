#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
} from "../../../scripts/effect-build-contract/model.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const releaseSourceSha = process.argv[2];
if (!/^[0-9a-f]{40}$/u.test(releaseSourceSha ?? "")) throw new Error("fixture source SHA is not exact");
const contract = buildContract(await readInputs(repositoryRoot));
process.stdout.write(renderJson(contract));
