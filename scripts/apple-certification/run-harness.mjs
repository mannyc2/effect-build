import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { authenticateCandidate, candidateRequestFromEnvironment } from "../release/candidate.mjs";
import {
  canonicalBytes,
  requireEnvironment,
  sha256,
} from "../node-finalizer/common.mjs";
import { categoryCoordinates, coordinateSlug, validateReceipt } from "./receipt.mjs";

const execute = promisify(execFile);
const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
};
const category = argument("--category");
const coordinate = argument("--coordinate");
const outputRoot = resolve(argument("--output"));
const evidenceRootIndex = process.argv.indexOf("--prior-evidence");
const priorEvidence = evidenceRootIndex < 0 ? undefined : resolve(process.argv[evidenceRootIndex + 1]);
if (!Object.hasOwn(categoryCoordinates, category) || !categoryCoordinates[category].includes(coordinate)) {
  throw new Error(`unsupported certification coordinate ${category}/${coordinate}`);
}
const repository = requireEnvironment("GITHUB_REPOSITORY");
const token = requireEnvironment("GITHUB_TOKEN");
const certificationWorkflowRunId = requireEnvironment("GITHUB_RUN_ID");
const certificationWorkflowRunAttempt = requireEnvironment("GITHUB_RUN_ATTEMPT");
if (certificationWorkflowRunAttempt !== "1") throw new Error("Apple certification reruns are forbidden");
const candidate = await authenticateCandidate({
  repository,
  token,
  inputs: candidateRequestFromEnvironment(),
});
const checkedOutSourceSha = requireEnvironment("CHECKED_OUT_SOURCE_SHA");
if (checkedOutSourceSha !== candidate.descriptor.sourceSha || requireEnvironment("GITHUB_SHA") !== candidate.descriptor.sourceSha) {
  throw new Error("Apple certification checkout does not match candidate source");
}
const certifierInput = requireEnvironment("EFFECT_BUILD_APPLE_CERTIFIER");
if (!isAbsolute(certifierInput)) throw new Error("EFFECT_BUILD_APPLE_CERTIFIER must be an absolute path");
const certifier = await realpath(certifierInput);
await access(certifier);
const temporaryRoot = await mkdtemp(join(tmpdir(), "effect-build-apple-certification-"));
const candidateRoot = join(temporaryRoot, "candidate");
await mkdir(candidateRoot);
for (const [filename, bytes] of candidate.payloadEntries) {
  await writeFile(join(candidateRoot, filename), bytes, { flag: "wx" });
}
const slug = coordinateSlug(category, coordinate);
await mkdir(outputRoot, { recursive: true });
const receiptPath = join(outputRoot, `${slug}.receipt.json`);
const evidencePath = join(outputRoot, `${slug}.evidence.bin`);
const requestPath = join(temporaryRoot, "request.json");
const request = {
  protocol: "effect-build/apple-certification-request@1",
  version: "0.5.0",
  category,
  coordinate,
  sourceSha: candidate.descriptor.sourceSha,
  candidateWorkflowRunId: candidate.descriptor.workflowRunId,
  candidateDescriptorDigest: candidate.descriptorDigest,
  certificationWorkflowRunId,
  certificationWorkflowRunAttempt,
  candidateDirectory: candidateRoot,
  priorEvidenceDirectory: priorEvidence ?? "",
  receiptPath,
  evidencePath,
};
await writeFile(requestPath, canonicalBytes(request), { flag: "wx" });
const childEnvironment = Object.fromEntries([
  "HOME",
  "PATH",
  "TMPDIR",
  "RUNNER_TEMP",
  "EFFECT_BUILD_APPLE_APPLICATION_FINGERPRINT",
  "EFFECT_BUILD_APPLE_INSTALLER_FINGERPRINT",
  "EFFECT_BUILD_APPLE_TEAM_ID",
  "EFFECT_BUILD_APPLE_NOTARY_KEYCHAIN_PROFILE",
].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
try {
  await execute(certifier, ["--request", requestPath], {
    cwd: temporaryRoot,
    env: childEnvironment,
    timeout: 60 * 60 * 1000,
    maxBuffer: 1_048_576,
    windowsHide: true,
  });
  const receiptBytes = await readFile(receiptPath);
  const evidenceBytes = await readFile(evidencePath);
  const receipt = validateReceipt({
    receiptBytes,
    evidenceBytes,
    expected: {
      category,
      coordinate,
      sourceSha: candidate.descriptor.sourceSha,
      candidateWorkflowRunId: candidate.descriptor.workflowRunId,
      candidateDescriptorDigest: candidate.descriptorDigest,
      certificationWorkflowRunId,
    },
    runner: { os: requireEnvironment("RUNNER_OS"), arch: requireEnvironment("RUNNER_ARCH") },
  });
  process.stdout.write(
    `${JSON.stringify({ coordinate, evidenceSha256: receipt.evidenceSha256, receiptSha256: sha256(receiptBytes) })}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
