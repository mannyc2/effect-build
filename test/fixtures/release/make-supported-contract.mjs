#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSupportedReleaseFixtureContract,
  readInputs,
  renderJson,
} from "../../../scripts/effect-build-contract/model.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const releaseSourceSha = process.argv[2];
if (!/^[0-9a-f]{40}$/u.test(releaseSourceSha ?? "")) throw new Error("fixture source SHA is not exact");
const contract = buildSupportedReleaseFixtureContract(await readInputs(repositoryRoot), {
  protocol: "effect-build/supported-release-fixture-activation@1",
  releaseSourceSha,
  operationalJournal: {
    repository: "mannyc2/ts-release",
    workflowPath: ".github/workflows/operational-journal.yml",
    ref: "refs/heads/main",
    sourceSha: "4".repeat(40),
  },
});
process.stdout.write(renderJson(contract));
