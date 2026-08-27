import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  assertExactTargetHost,
  canonicalBytes,
  capability,
  coordinate,
  decodeCanonical,
  downloadArtifact,
  hex,
  inspectNativeExecutable,
  nodeMainExecutionExpectation,
  nodeMainExpectedStdout,
  observeArtifact,
  observeJob,
  observeRun,
  positiveDecimal,
  readArtifactZip,
  requireEntries,
  requireEnvironment,
  sha256,
  targetCell,
  targetHost,
} from "./common.mjs";

const execute = promisify(execFile);

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

const validateOffer = (offer, expected) => {
  if (offer.protocol !== "effect-build/assembler-offer@1") throw new Error("assembler offer protocol mismatch");
  hex(offer.sourceSha, 40, "sourceSha");
  hex(offer.workflowRunHeadSha, 40, "workflowRunHeadSha");
  hex(offer.mainSha256, 64, "mainSha256");
  hex(offer.baseArchiveSha256, 64, "baseArchiveSha256");
  hex(offer.constructedSha256, 64, "constructedSha256");
  positiveDecimal(offer.workflowRunId, "workflowRunId");
  positiveDecimal(offer.workflowRunAttempt, "workflowRunAttempt");
  positiveDecimal(offer.constructedBytes, "constructedBytes");
  for (const [field, value] of Object.entries(expected)) {
    if (offer[field] !== value) throw new Error(`assembler offer ${field} mismatch`);
  }
};

const main = async () => {
  const args = parseArguments();
  const producerGroup = args.producer;
  const format = args.format;
  const constructionHost = args["construction-host"];
  const target = args.target;
  const output = args.output;
  if ([producerGroup, format, constructionHost, target, output].some((value) => value === undefined)) {
    throw new Error("producer, format, construction-host, target, and output are required");
  }
  assertExactTargetHost(target);
  const coordinateName = coordinate({ producerGroup, format, constructionHost, target });
  const repository = requireEnvironment("GITHUB_REPOSITORY");
  const runId = positiveDecimal(requireEnvironment("GITHUB_RUN_ID"), "GITHUB_RUN_ID");
  const runAttempt = positiveDecimal(requireEnvironment("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT");
  const sourceSha = requireEnvironment("GITHUB_SHA");
  const token = requireEnvironment("GITHUB_TOKEN");
  if (repository !== capability.authority.repository) throw new Error("repository authority mismatch");
  hex(sourceSha, 40, "GITHUB_SHA");
  const run = await observeRun({ repository, runId, token });
  if (
    String(run.id) !== runId || String(run.run_attempt) !== runAttempt || run.head_sha !== sourceSha
    || !capability.authority.workflowEvents.includes(run.event) || run.path !== capability.authority.workflowPath
  ) throw new Error("authoritative workflow run mismatch");

  const constructionJobName = `construct--${coordinateName}`;
  const finalizerJobName = `finalize--${coordinateName}`;
  const constructionJob = await observeJob({ repository, runId, runAttempt, name: constructionJobName, token });
  if (constructionJob.conclusion !== "success" || String(constructionJob.run_id) !== runId) {
    throw new Error("authoritative construction job is not successful");
  }
  const finalizerJob = await observeJob({ repository, runId, runAttempt, name: finalizerJobName, token });
  if (String(finalizerJob.run_id) !== runId) throw new Error("authoritative finalizer job mismatch");

  const inputArtifactName = `${coordinateName}--constructed`;
  const inputArtifact = await observeArtifact({ repository, runId, name: inputArtifactName, token });
  if (String(inputArtifact.workflow_run?.id) !== runId || inputArtifact.workflow_run?.head_sha !== sourceSha) {
    throw new Error("input artifact workflow binding mismatch");
  }
  const wrapper = await downloadArtifact(inputArtifact, token);
  const entries = readArtifactZip(wrapper);
  const constructedFileName = `${coordinateName}--constructed${target.startsWith("windows-") ? ".exe" : ""}`;
  const offerFileName = `${coordinateName}--assembler-offer.json`;
  requireEntries(entries, [constructedFileName, offerFileName]);
  const offer = decodeCanonical(entries.get(offerFileName), capability.constructionOfferFieldSet);
  const cell = targetCell(target);
  validateOffer(offer, {
    sourceSha,
    workflowRepository: repository,
    workflowPath: capability.authority.workflowPath,
    workflowRef: requireEnvironment("GITHUB_WORKFLOW_REF"),
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    workflowRunHeadSha: sourceSha,
    constructionJobName,
    coordinate: coordinateName,
    target,
    format,
    nodeVersion: "26.7.0",
    baseArchiveName: cell.distribution,
    baseArchiveSha256: cell.sha256,
    constructionHost,
    constructedFileName,
    inputArtifactName,
  });
  const constructed = entries.get(constructedFileName);
  if (String(constructed.length) !== offer.constructedBytes || sha256(constructed) !== offer.constructedSha256) {
    throw new Error("constructed entry identity mismatch");
  }
  const request = {
    protocol: capability.protocol,
    ...Object.fromEntries(capability.requestOfferEqualFields.map((field) => [field, offer[field]])),
    constructionJobId: String(constructionJob.id),
    inputArtifactId: String(inputArtifact.id),
    inputArtifactDigest: inputArtifact.digest,
    inputArtifactExpired: false,
    inputArtifactExpiresAt: inputArtifact.expires_at,
  };
  const requestBytes = canonicalBytes(request);
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const working = join(outputRoot, constructedFileName);
  await writeFile(working, constructed, { flag: "wx", mode: target.startsWith("windows-") ? undefined : 0o755 });
  if (!target.startsWith("windows-")) await chmod(working, 0o755);
  if (target.startsWith("macos-")) {
    await execute("codesign", ["--force", "--sign", "-", "--timestamp=none", working], { timeout: 30_000 });
    await execute("codesign", ["--verify", "--strict", working], { timeout: 30_000 });
  }
  const finalizedFileName = `${coordinateName}--finalized${target.startsWith("windows-") ? ".exe" : ""}`;
  const finalizedPath = join(outputRoot, finalizedFileName);
  const finalized = await readFile(working);
  const inspection = inspectNativeExecutable(finalized, target);
  await writeFile(finalizedPath, finalized, { flag: "wx", mode: target.startsWith("windows-") ? undefined : 0o755 });
  if (!target.startsWith("windows-")) await chmod(finalizedPath, 0o755);
  const execution = await execute(finalizedPath, [], { timeout: 30_000, maxBuffer: 1_048_576, encoding: "buffer" });
  if (!Buffer.from(execution.stdout).equals(Buffer.from(nodeMainExpectedStdout)) || execution.stderr.length !== 0) {
    throw new Error("finalized executable output mismatch");
  }
  const pending = {
    request,
    requestSha256: sha256(requestBytes),
    finalizerJobId: String(finalizerJob.id),
    finalizerJobName,
    runner: targetHost(target).runner,
    finalizedFileName,
    finalizedMode: target.startsWith("windows-") ? "not-applicable" : "0755",
    finalizedBytes: String(finalized.length),
    finalizedSha256: sha256(finalized),
    ...inspection,
    executionExitCode: nodeMainExecutionExpectation.executionExitCode,
    stdoutSha256: sha256(Buffer.from(execution.stdout)),
    stderrSha256: sha256(Buffer.from(execution.stderr)),
  };
  await writeFile(join(outputRoot, `${coordinateName}--request.json`), requestBytes, { flag: "wx" });
  await writeFile(join(outputRoot, `${coordinateName}--pending.json`), `${JSON.stringify(pending)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ coordinate: coordinateName, finalizedFileName })}\n`);
};

await main();
