import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  canonicalBytes,
  downloadArtifact,
  observeArtifact,
  positiveDecimal,
  readArtifactZip,
  releaseCandidateIdentity,
  releaseControl,
  requireEntries,
  requireEnvironment,
  sha256,
} from "../node-finalizer/common.mjs";
import {
  decodeCandidatePublicNodeSeaEvidence,
  validateCandidateDescriptor,
} from "./candidate.mjs";
import { assertLockstepPackageManifest } from "../lockstep-package.mjs";

const candidate = releaseCandidateIdentity;
const packageNames = releaseControl.orderedPackages;
const payloadRoot = resolve(process.argv[2] ?? "release-candidate-payload");
const output = resolve(process.argv[3] ?? "release-candidate.json");
const publicNodeSeaEvidencePath = process.argv[4];
if (publicNodeSeaEvidencePath === undefined) {
  throw new Error("usage: build-candidate.mjs <payload-directory> <descriptor-output> <public-node-sea-evidence>");
}
const repository = requireEnvironment("GITHUB_REPOSITORY");
const sourceSha = requireEnvironment("GITHUB_SHA");
const sourceRef = requireEnvironment("GITHUB_REF");
const runId = positiveDecimal(requireEnvironment("GITHUB_RUN_ID"), "GITHUB_RUN_ID");
const runAttempt = positiveDecimal(requireEnvironment("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT");
const checkedOutSourceSha = requireEnvironment("CHECKED_OUT_SOURCE_SHA");
const token = requireEnvironment("GITHUB_TOKEN");
if (
  repository !== candidate.workflowRepository || sourceRef !== candidate.sourceRef
  || sourceSha !== checkedOutSourceSha || !/^[0-9a-f]{40}$/u.test(sourceSha)
) throw new Error("candidate workflow authority or checkout mismatch");

const manifestFromTarball = (bytes) => {
  const archive = gunzipSync(bytes);
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").split("\0", 1)[0];
    const size = Number.parseInt(archive.subarray(offset + 124, offset + 136).toString("utf8").trim() || "0", 8);
    if (name === "package/package.json") {
      return JSON.parse(archive.subarray(offset + record, offset + record + size).toString("utf8"));
    }
    offset += Math.ceil(size / record) * record;
  }
  throw new Error("packed package manifest missing");
};

const records = [];
const payloadEntries = new Map();
for (const name of packageNames) {
  const filename = `${name}-0.5.0.tgz`;
  const bytes = await readFile(join(payloadRoot, filename));
  const manifest = manifestFromTarball(bytes);
  assertLockstepPackageManifest({
    manifest,
    name,
    version: "0.5.0",
    firstPartyPackages: packageNames,
    prerequisites: releaseControl.orderedPackagePrerequisites[name],
  });
  records.push({
    name,
    version: "0.5.0",
    filename,
    dependencyPrerequisites: releaseControl.orderedPackagePrerequisites[name],
    bytes: String(bytes.length),
    sha256: sha256(bytes),
    sha1: createHash("sha1").update(bytes).digest("hex"),
    sha512SRI: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    packedName: manifest.name,
    packedVersion: manifest.version,
  });
  payloadEntries.set(filename, bytes);
}
const publicNodeSeaEvidence = decodeCandidatePublicNodeSeaEvidence(
  await readFile(resolve(publicNodeSeaEvidencePath)),
  records,
);

const payloadArtifact = await observeArtifact({
  repository,
  runId,
  name: candidate.payloadArtifactName,
  token,
});
if (String(payloadArtifact.workflow_run?.id) !== runId || payloadArtifact.workflow_run?.head_sha !== sourceSha) {
  throw new Error("payload artifact workflow binding mismatch");
}
const wrapper = await downloadArtifact(payloadArtifact, token);
const entries = readArtifactZip(wrapper);
requireEntries(entries, records.map(({ filename }) => filename));
for (const [filename, expected] of payloadEntries) {
  const observed = entries.get(filename);
  if (!observed.equals(expected)) throw new Error(`payload wrapper changed ${filename}`);
}

const created = new Date();
created.setMilliseconds(0);
const expires = new Date(created.getTime() + candidate.maximumAgeSeconds * 1000);
const descriptor = {
  schema: candidate.schema,
  version: "0.5.0",
  sourceRepository: candidate.sourceRepository,
  sourceRef,
  sourceSha,
  workflowRepository: repository,
  workflowPath: candidate.workflowPath,
  workflowRef: candidate.workflowRef,
  workflowRunId: runId,
  workflowRunAttempt: runAttempt,
  workflowRunHeadSha: sourceSha,
  checkedOutSourceSha,
  payloadArtifactId: String(payloadArtifact.id),
  payloadArtifactName: payloadArtifact.name,
  payloadArtifactDigest: payloadArtifact.digest,
  createdAt: created.toISOString().replace(".000Z", "Z"),
  expiresAt: expires.toISOString().replace(".000Z", "Z"),
  packages: records,
  publicNodeSeaEvidence,
};
const destination = output;
validateCandidateDescriptor(canonicalBytes(descriptor), { now: created });
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, canonicalBytes(descriptor), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ descriptor: destination, sha256: sha256(canonicalBytes(descriptor)) })}\n`);
