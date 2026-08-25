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

const inspect = (bytes, target) => {
  if (target.startsWith("linux-")) {
    if (!bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error("finalized file is not ELF");
    const machine = bytes.readUInt16LE(18);
    const architecture = machine === 62 ? "x64" : machine === 183 ? "aarch64" : undefined;
    if (architecture === undefined || !target.includes(architecture === "aarch64" ? "aarch64" : "x64")) {
      throw new Error(`ELF architecture mismatch: ${machine}`);
    }
    return { nativeFormat: "elf", architecture };
  }
  if (target.startsWith("windows-")) {
    if (bytes.subarray(0, 2).toString("ascii") !== "MZ") throw new Error("finalized file is not PE");
    const pe = bytes.readUInt32LE(0x3c);
    if (bytes.subarray(pe, pe + 4).toString("binary") !== "PE\0\0") throw new Error("PE signature missing");
    const machine = bytes.readUInt16LE(pe + 4);
    const architecture = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "aarch64" : undefined;
    if (architecture === undefined || !target.endsWith(architecture)) throw new Error(`PE architecture mismatch: ${machine}`);
    return { nativeFormat: "pe", architecture };
  }
  if (bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error("finalized file is not 64-bit little-endian Mach-O");
  const cpu = bytes.readUInt32LE(4);
  const architecture = cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "aarch64" : undefined;
  if (architecture === undefined || !target.endsWith(architecture)) throw new Error(`Mach-O architecture mismatch: ${cpu}`);
  return { nativeFormat: "mach-o", architecture };
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
  const constructionJob = await observeJob({ repository, runId, name: constructionJobName, token });
  if (constructionJob.conclusion !== "success" || String(constructionJob.run_id) !== runId) {
    throw new Error("authoritative construction job is not successful");
  }
  const finalizerJob = await observeJob({ repository, runId, name: finalizerJobName, token });
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
  const inspection = inspect(finalized, target);
  await writeFile(finalizedPath, finalized, { flag: "wx", mode: target.startsWith("windows-") ? undefined : 0o755 });
  if (!target.startsWith("windows-")) await chmod(finalizedPath, 0o755);
  const execution = await execute(finalizedPath, [], { timeout: 30_000, maxBuffer: 1_048_576, encoding: "buffer" });
  if (!Buffer.from(execution.stdout).equals(Buffer.from("effect-build-node-main-ok\n")) || execution.stderr.length !== 0) {
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
    nativeFormat: inspection.nativeFormat,
    inspectedArchitecture: inspection.architecture,
    executionExitCode: "0",
    stdoutSha256: sha256(Buffer.from(execution.stdout)),
    stderrSha256: sha256(Buffer.from(execution.stderr)),
  };
  await writeFile(join(outputRoot, `${coordinateName}--request.json`), requestBytes, { flag: "wx" });
  await writeFile(join(outputRoot, `${coordinateName}--pending.json`), `${JSON.stringify(pending)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ coordinate: coordinateName, finalizedFileName })}\n`);
};

await main();
