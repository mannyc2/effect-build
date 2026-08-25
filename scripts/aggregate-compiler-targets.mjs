import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compilerTargetReceiptExpectation } from "./compiler-target-receipt.mjs";
import {
  canonicalBytes,
  downloadArtifact,
  evidenceControl,
  observeArtifact,
  observeJob,
  readArtifactZip,
  researchContract,
  requireEntries,
  requireEnvironment,
} from "./node-finalizer/common.mjs";

const output = process.argv[2];
if (output === undefined) throw new Error("usage: aggregate-compiler-targets.mjs <output-file>");
const repository = requireEnvironment("GITHUB_REPOSITORY");
const runId = requireEnvironment("GITHUB_RUN_ID");
const sourceSha = requireEnvironment("GITHUB_SHA");
const token = requireEnvironment("GITHUB_TOKEN");
const rule = evidenceControl.coordinateRules.compilerTargets;
if (
  rule.rule !== "explicit-exact-coordinate-list"
  || rule.coordinates.length !== rule.expectedCoordinateCount
  || rule.expectedCoordinateCount !== 12
) throw new Error("compiler-target aggregate authority changed");

const host = evidenceControl.certificationHosts.find(({ id }) => id === rule.constructionHost);
if (host === undefined || rule.constructionHost !== "linux-x64") {
  throw new Error("compiler-target construction host authority changed");
}
const expectedHost = {
  hostPlatform: "linux",
  hostArchitecture: "x64",
  hostLibc: "glibc",
  hostSystemTarget: host.systemTarget,
};
const lowercaseSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const positiveDecimal = (value) => typeof value === "string" && /^[1-9][0-9]*$/u.test(value);

const readReceipt = async (compiler, target) => {
  const jobName = `Target ${compiler}/${target}`;
  const artifactName = `compiler-target--${compiler}--${target}--receipt`;
  const filename = `compiler-target--${compiler}--${target}.json`;
  const job = await observeJob({ repository, runId, name: jobName, token });
  if (job.conclusion !== "success" || String(job.run_id) !== runId) {
    throw new Error(`compiler-target job did not succeed: ${jobName}`);
  }
  const artifact = await observeArtifact({ repository, runId, name: artifactName, token });
  if (String(artifact.workflow_run?.id) !== runId || artifact.workflow_run?.head_sha !== sourceSha) {
    throw new Error(`compiler-target artifact workflow mismatch: ${artifactName}`);
  }
  const entries = readArtifactZip(await downloadArtifact(artifact, token));
  requireEntries(entries, [filename]);
  const receipt = JSON.parse(entries.get(filename).toString("utf8"));
  const expected = {
    ...compilerTargetReceiptExpectation(compiler, target),
    ...expectedHost,
    artifactBytes: positiveDecimal,
    artifactSha256: lowercaseSha256,
  };
  if (JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(Object.keys(expected).sort())) {
    throw new Error(`compiler-target receipt fields mismatch: ${compiler}/${target}`);
  }
  for (const [field, value] of Object.entries(expected)) {
    const valid = typeof value === "function"
      ? value(receipt[field])
      : JSON.stringify(receipt[field]) === JSON.stringify(value);
    if (!valid) throw new Error(`compiler-target receipt ${field} mismatch: ${compiler}/${target}`);
  }
  return receipt;
};

const receipts = [];
for (const { compiler, target } of rule.coordinates) receipts.push(await readReceipt(compiler, target));
if (receipts.length !== 12) throw new Error(`expected 12 compiler-target receipts, observed ${receipts.length}`);

const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, canonicalBytes({
  schema: "effect-build/compiler-target-evidence-aggregate@1",
  sourceSha,
  workflowRunId: runId,
  scopeSchema: researchContract.schema,
  targetExecutionClaim: rule.targetExecutionClaim,
  receipts,
}), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ receipts: receipts.length, output: destination })}\n`);
