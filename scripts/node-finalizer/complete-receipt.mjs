import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  canonicalBytes,
  capability,
  coordinate,
  decodeCanonical,
  downloadArtifact,
  observeArtifact,
  readArtifactZip,
  requireEntries,
  requireEnvironment,
  sha256,
} from "./common.mjs";

const parseArguments = () => {
  const values = Object.create(null);
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error("expected --name value arguments");
    values[name.slice(2)] = value;
  }
  return values;
};

const main = async () => {
  const args = parseArguments();
  const coordinateName = coordinate({
    producerGroup: args.producer,
    format: args.format,
    constructionHost: args["construction-host"],
    target: args.target,
  });
  if (args.pending === undefined || args.request === undefined || args.output === undefined) {
    throw new Error("pending, request, and output are required");
  }
  const repository = requireEnvironment("GITHUB_REPOSITORY");
  const runId = requireEnvironment("GITHUB_RUN_ID");
  const sourceSha = requireEnvironment("GITHUB_SHA");
  const token = requireEnvironment("GITHUB_TOKEN");
  const pending = JSON.parse(await readFile(resolve(args.pending), "utf8"));
  const requestBytes = await readFile(resolve(args.request));
  const request = decodeCanonical(requestBytes, capability.requestFieldSet);
  if (!canonicalBytes(pending.request).equals(requestBytes) || sha256(requestBytes) !== pending.requestSha256) {
    throw new Error("pending finalizer record does not bind the canonical request");
  }
  const outputArtifactName = `${coordinateName}--finalized`;
  const artifact = await observeArtifact({ repository, runId, name: outputArtifactName, token });
  if (String(artifact.workflow_run?.id) !== runId || artifact.workflow_run?.head_sha !== sourceSha) {
    throw new Error("output artifact workflow binding mismatch");
  }
  const wrapper = await downloadArtifact(artifact, token);
  const entries = readArtifactZip(wrapper);
  requireEntries(entries, [pending.finalizedFileName]);
  const finalized = entries.get(pending.finalizedFileName);
  if (String(finalized.length) !== pending.finalizedBytes || sha256(finalized) !== pending.finalizedSha256) {
    throw new Error("output artifact content identity mismatch");
  }
  const response = {
    protocol: capability.receiptProtocol,
    requestSha256: pending.requestSha256,
    sourceSha: request.sourceSha,
    workflowRunId: request.workflowRunId,
    workflowRunAttempt: request.workflowRunAttempt,
    workflowRunHeadSha: request.workflowRunHeadSha,
    constructionJobId: request.constructionJobId,
    constructionJobName: request.constructionJobName,
    finalizerJobId: pending.finalizerJobId,
    finalizerJobName: pending.finalizerJobName,
    coordinate: request.coordinate,
    target: request.target,
    runner: pending.runner,
    inputArtifactId: request.inputArtifactId,
    inputArtifactName: request.inputArtifactName,
    inputArtifactDigest: request.inputArtifactDigest,
    inputArtifactExpired: false,
    inputArtifactExpiresAt: request.inputArtifactExpiresAt,
    constructedFileName: request.constructedFileName,
    constructedBytes: request.constructedBytes,
    constructedSha256: request.constructedSha256,
    outputArtifactId: String(artifact.id),
    outputArtifactName,
    outputArtifactDigest: artifact.digest,
    outputArtifactExpired: false,
    outputArtifactExpiresAt: artifact.expires_at,
    finalizedFileName: pending.finalizedFileName,
    finalizedMode: pending.finalizedMode,
    finalizedBytes: pending.finalizedBytes,
    finalizedSha256: pending.finalizedSha256,
    nativeFormat: pending.nativeFormat,
    inspectedArchitecture: pending.inspectedArchitecture,
    executionExitCode: pending.executionExitCode,
    stdoutSha256: pending.stdoutSha256,
    stderrSha256: pending.stderrSha256,
  };
  const responseBytes = canonicalBytes(response);
  decodeCanonical(responseBytes, capability.responseFieldSet);
  const destination = resolve(args.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, responseBytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ coordinate: coordinateName, receipt: destination })}\n`);
};

await main();
