import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  canonicalBytes,
  contract,
  downloadArtifact,
  observeArtifact,
  observeJob,
  readArtifactZip,
  requireEntries,
  requireEnvironment,
} from "./node-finalizer/common.mjs";

const output = process.argv[2];
if (output === undefined) throw new Error("usage: aggregate-compatibility.mjs <output-file>");
const repository = requireEnvironment("GITHUB_REPOSITORY");
const runId = requireEnvironment("GITHUB_RUN_ID");
const sourceSha = requireEnvironment("GITHUB_SHA");
const token = requireEnvironment("GITHUB_TOKEN");
const rules = contract.requiredCompatibilityEvidencePoints.coordinateRules;

const readReceipt = async (name, filename, expected) => {
  const job = await observeJob({ repository, runId, name, token });
  if (job.conclusion !== "success" || String(job.run_id) !== runId) throw new Error(`coordinate job did not succeed: ${name}`);
  const artifact = await observeArtifact({ repository, runId, name: `${name}--receipt`, token });
  if (String(artifact.workflow_run?.id) !== runId || artifact.workflow_run?.head_sha !== sourceSha) {
    throw new Error(`coordinate artifact workflow mismatch: ${name}`);
  }
  const entries = readArtifactZip(await downloadArtifact(artifact, token));
  requireEntries(entries, [filename]);
  const receipt = JSON.parse(entries.get(filename).toString("utf8"));
  const actualFields = Object.keys(receipt).sort();
  const expectedFields = Object.keys(expected).sort();
  if (JSON.stringify(actualFields) !== JSON.stringify(expectedFields)) throw new Error(`receipt fields mismatch: ${name}`);
  for (const [field, value] of Object.entries(expected)) {
    if (field !== "manifestSha256" && receipt[field] !== value) throw new Error(`receipt ${field} mismatch: ${name}`);
  }
  if ("manifestSha256" in expected && !/^[0-9a-f]{64}$/u.test(receipt.manifestSha256)) {
    throw new Error(`receipt manifest digest mismatch: ${name}`);
  }
  return receipt;
};

const receipts = [];
for (const providerGroup of rules.staticBrowserApplication.axes.providerGroup) {
  for (const browserEngine of rules.staticBrowserApplication.axes.browserEngine) {
    for (const certificationHost of rules.staticBrowserApplication.axes.certificationHost) {
      const name = `browser--${providerGroup}--${browserEngine}--${certificationHost}`;
      receipts.push(await readReceipt(name, `${name}.json`, {
        providerGroup,
        browserEngine,
        certificationHost,
        manifestSha256: "validated-lowercase-64-hex",
      }));
    }
  }
}
for (const toolCell of rules.providerNativeLanes.axes.toolCell) {
  for (const certificationHost of rules.providerNativeLanes.axes.certificationHost) {
    const name = `native--${toolCell}--${certificationHost}`;
    receipts.push(await readReceipt(name, `${name}.json`, { toolCell, certificationHost }));
  }
}
for (const packageName of rules.packedConsumers.axes.package) {
  for (const effect of rules.packedConsumers.axes.effect) {
    for (const certificationHost of rules.packedConsumers.axes.certificationHost) {
      const name = `packed--${packageName}--effect-${effect}--${certificationHost}`;
      receipts.push(await readReceipt(name, `${name}.json`, { package: packageName, effect, certificationHost }));
    }
  }
}
if (receipts.length !== 84) throw new Error(`expected 84 non-Apple compatibility receipts, observed ${receipts.length}`);
const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, canonicalBytes({ sourceSha, workflowRunId: runId, receipts }), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ receipts: receipts.length, output: destination })}\n`);
