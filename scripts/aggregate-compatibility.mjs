import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { providerNativeReceiptExpectation } from "./provider-native-receipt.mjs";
import {
  packedProviderRuntimeEvidence,
  researchEvidenceAccountingForPackage,
} from "./research-evidence-accounting.mjs";

const output = process.argv[2];
if (output === undefined) throw new Error("usage: aggregate-compatibility.mjs <output-file>");
const repository = requireEnvironment("GITHUB_REPOSITORY");
const runId = requireEnvironment("GITHUB_RUN_ID");
const runAttempt = requireEnvironment("GITHUB_RUN_ATTEMPT");
const sourceSha = requireEnvironment("GITHUB_SHA");
const token = requireEnvironment("GITHUB_TOKEN");
const rules = evidenceControl.coordinateRules;
const nativeRule = rules.providerNativeLanes;
const nativeCartesianCount = nativeRule.axes.providerRuntimeCell.length
  * nativeRule.axes.certificationHost.length;
const nativeExclusionKeys = nativeRule.explicitUnsupportedCoordinates.map(
  ({ providerRuntimeCell, certificationHost, reason }) => {
    if (
      !nativeRule.axes.providerRuntimeCell.includes(providerRuntimeCell)
      || !nativeRule.axes.certificationHost.includes(certificationHost)
      || reason !== "public-node-sea-host-target-is-linux-x64-gnu-only"
    ) throw new Error("provider-native exclusion is outside the frozen axes or reason");
    return `${providerRuntimeCell}|${certificationHost}`;
  },
);
if (
  nativeCartesianCount !== 35
  || nativeRule.expectedCartesianCoordinateCount !== nativeCartesianCount
  || nativeRule.expectedUnsupportedCoordinateCount !== 4
  || new Set(nativeExclusionKeys).size !== 4
  || nativeRule.expectedCoordinateCount !== nativeCartesianCount - nativeExclusionKeys.length
) throw new Error("provider-native D13 applicability accounting changed");
const releasePacked = new Set(rules.packedConsumers.axes.package);
if (rules.packedConditionalProviderCandidates.axes.package.some((packageName) => releasePacked.has(packageName))) {
  throw new Error("conditional package candidate entered the packed release-train matrix");
}

const packedPublicSubpathCount = (packageName) => {
  if (packageName === "effect-build") return researchContract.targetPublicSurface.coreModules.length;
  if (packageName === "effect-build-apple") return researchContract.targetPublicSurface.appleModules.length;
  if (rules.packedConditionalProviderCandidates.axes.package.includes(packageName)) return 0;
  const provider = researchContract.targetPublicSurface.providerLanes.find(
    ({ package: candidate }) => candidate === packageName,
  );
  if (provider === undefined) throw new Error(`research-complete target surface omits ${packageName}`);
  return provider.lanes.filter(({ requirement }) => requirement === "required").length;
};

const unsupportedNativeCoordinate = (providerRuntimeCell, certificationHost) =>
  rules.providerNativeLanes.explicitUnsupportedCoordinates.some(
    (coordinate) => coordinate.providerRuntimeCell === providerRuntimeCell
      && coordinate.certificationHost === certificationHost,
  );

const receiptHostFields = (certificationHost) => {
  const definition = evidenceControl.certificationHosts.find(
    ({ id }) => id === certificationHost,
  );
  if (definition === undefined) throw new Error(`unknown D13 receipt host ${certificationHost}`);
  const [platform, architecture] = certificationHost.split("-", 2);
  return {
    hostPlatform: platform === "macos" ? "darwin" : platform === "windows" ? "win32" : "linux",
    hostArchitecture: architecture === "arm64" ? "arm64" : "x64",
    hostLibc: platform === "linux" ? "glibc" : "not-applicable",
    hostSystemTarget: definition.systemTarget,
  };
};

const readReceipt = async (name, filename, expected) => {
  const job = await observeJob({ repository, runId, runAttempt, name, token });
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
    const valid = typeof value === "function"
      ? value(receipt[field])
      : JSON.stringify(receipt[field]) === JSON.stringify(value);
    if (!valid) throw new Error(`receipt ${field} mismatch: ${name}`);
  }
  return receipt;
};

const receipts = [];
for (const providerGroup of rules.browserModulePayload.axes.providerGroup) {
  for (const browserEngine of rules.browserModulePayload.axes.browserEngine) {
    for (const certificationHost of rules.browserModulePayload.axes.certificationHost) {
      const name = `browser--${providerGroup}--${browserEngine}--${certificationHost}`;
      receipts.push(await readReceipt(name, `${name}.json`, {
        providerGroup,
        browserEngine,
        certificationHost,
        ...receiptHostFields(certificationHost),
        manifestSha256: (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
        claim: "conditional-candidate-executed-no-profile-admission",
        profile: "effect-build/profile/browser-module-payload@1",
      }));
    }
  }
}
for (const providerRuntimeCell of rules.providerNativeLanes.axes.providerRuntimeCell) {
  for (const certificationHost of rules.providerNativeLanes.axes.certificationHost) {
    if (unsupportedNativeCoordinate(providerRuntimeCell, certificationHost)) continue;
    const name = `native--${providerRuntimeCell}--${certificationHost}`;
    receipts.push(await readReceipt(name, `${name}.json`, {
      providerRuntimeCell,
      certificationHost,
      ...receiptHostFields(certificationHost),
      ...providerNativeReceiptExpectation(providerRuntimeCell, certificationHost),
    }));
  }
}
const readPackedCoordinates = async (rule, admission, claim) => {
  for (const packageName of rule.axes.package) {
    for (const effect of rule.axes.effect) {
      for (const certificationHost of rule.axes.certificationHost) {
      const name = `packed--${packageName}--effect-${effect}--${certificationHost}`;
      const accounting = researchEvidenceAccountingForPackage(packageName);
      receipts.push(await readReceipt(name, `${name}.json`, {
        schema: "effect-build/packed-consumer-evidence-receipt@1",
        package: packageName,
        admission,
        effect,
        certificationHost,
        ...receiptHostFields(certificationHost),
        claim,
        scopeSchema: researchContract.schema,
        operationEvidenceClass: "contract-referenced-installed-dist-fixtures-not-operation-certification",
        exactProviderRuntimeEvidence: packedProviderRuntimeEvidence(packageName, certificationHost),
        wrapperJobCount: "1",
        publicSubpathCount: String(packedPublicSubpathCount(packageName)),
        coreTarballSha256: (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
        packageTarballSha256: (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
        packageLockSha256: (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value),
        effectRuntimeIdentityCount: "1",
        operationCount: String(accounting.operationIds.length),
        operationIds: accounting.operationIds,
        atomCount: String(accounting.atomIds.length),
        atomIds: accounting.atomIds,
      }));
      }
    }
  }
};
await readPackedCoordinates(
  rules.packedConsumers,
  "release-train",
  "packed-declaration-runtime-fixtures-executed-no-operation-admission",
);
await readPackedCoordinates(
  rules.packedConditionalProviderCandidates,
  "conditional-provider-candidate",
  "conditional-provider-packed-runtime-fixtures-executed-no-package-admission",
);
const expectedReceipts = rules.browserModulePayload.expectedCoordinateCount
  + rules.providerNativeLanes.expectedCoordinateCount
  + rules.packedConsumers.expectedCoordinateCount
  + rules.packedConditionalProviderCandidates.expectedCoordinateCount;
if (expectedReceipts !== 146 || receipts.length !== expectedReceipts) {
  throw new Error(`expected 146 applicable non-Apple compatibility receipts, observed ${receipts.length}`);
}
const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, canonicalBytes({
  sourceSha,
  workflowRunId: runId,
  receipts,
  explicitUnsupportedCoordinates: rules.providerNativeLanes.explicitUnsupportedCoordinates,
}), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ receipts: receipts.length, output: destination })}\n`);
