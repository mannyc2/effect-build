import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  canonicalBytes,
  capability,
  coordinate,
  decodeCanonical,
  downloadArtifact,
  evidenceControl,
  observeArtifact,
  observeJob,
  observeRun,
  readArtifactZip,
  requireEntries,
  requireEnvironment,
  sha256,
  targetCell,
  targetHost,
} from "./common.mjs";

const output = process.argv[2];
if (output === undefined) throw new Error("usage: aggregate.mjs <output-file>");

const repository = requireEnvironment("GITHUB_REPOSITORY");
const runId = requireEnvironment("GITHUB_RUN_ID");
const runAttempt = requireEnvironment("GITHUB_RUN_ATTEMPT");
const sourceSha = requireEnvironment("GITHUB_SHA");
const workflowRef = requireEnvironment("GITHUB_WORKFLOW_REF");
const token = requireEnvironment("GITHUB_TOKEN");
const run = await observeRun({ repository, runId, token });
if (String(run.id) !== runId || String(run.run_attempt) !== runAttempt || run.head_sha !== sourceSha) {
  throw new Error("aggregation workflow-run binding mismatch");
}

const axes = evidenceControl.coordinateRules.nodeMainExecutable.axes;
const receipts = [];
for (const producerGroup of axes.producerGroup) {
  for (const format of axes.mainFormat) {
    for (const constructionHost of axes.constructionHost) {
      for (const target of axes.target) {
        const name = coordinate({ producerGroup, format, constructionHost, target });
        const constructionJobName = `construct--${name}`;
        const finalizerJobName = `finalize--${name}`;
        const [constructionJob, finalizerJob] = await Promise.all([
          observeJob({ repository, runId, name: constructionJobName, token }),
          observeJob({ repository, runId, name: finalizerJobName, token }),
        ]);
        if (constructionJob.conclusion !== "success" || finalizerJob.conclusion !== "success") {
          throw new Error(`coordinate jobs are not successful for ${name}`);
        }
        const inputName = `${name}--constructed`;
        const outputName = `${name}--finalized`;
        const receiptName = `${name}--receipt`;
        const [inputArtifact, outputArtifact, receiptArtifact] = await Promise.all([
          observeArtifact({ repository, runId, name: inputName, token }),
          observeArtifact({ repository, runId, name: outputName, token }),
          observeArtifact({ repository, runId, name: receiptName, token }),
        ]);
        const [inputWrapper, outputWrapper, receiptWrapper] = await Promise.all([
          downloadArtifact(inputArtifact, token),
          downloadArtifact(outputArtifact, token),
          downloadArtifact(receiptArtifact, token),
        ]);
        const constructedFileName = `${name}--constructed${target.startsWith("windows-") ? ".exe" : ""}`;
        const offerName = `${name}--assembler-offer.json`;
        const inputEntries = readArtifactZip(inputWrapper);
        requireEntries(inputEntries, [constructedFileName, offerName]);
        const offer = decodeCanonical(inputEntries.get(offerName), capability.constructionOfferFieldSet);
        const constructed = inputEntries.get(constructedFileName);
        if (String(constructed.length) !== offer.constructedBytes || sha256(constructed) !== offer.constructedSha256) {
          throw new Error(`constructed identity mismatch for ${name}`);
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
        const receiptFileName = `${name}--target-finalizer-receipt.json`;
        const receiptEntries = readArtifactZip(receiptWrapper);
        requireEntries(receiptEntries, [receiptFileName]);
        const receipt = decodeCanonical(receiptEntries.get(receiptFileName), capability.responseFieldSet);
        const finalizedFileName = `${name}--finalized${target.startsWith("windows-") ? ".exe" : ""}`;
        const outputEntries = readArtifactZip(outputWrapper);
        requireEntries(outputEntries, [finalizedFileName]);
        const finalized = outputEntries.get(finalizedFileName);
        const cell = targetCell(target);
        const expected = {
          protocol: capability.receiptProtocol,
          requestSha256: sha256(requestBytes),
          sourceSha,
          workflowRunId: runId,
          workflowRunAttempt: runAttempt,
          workflowRunHeadSha: sourceSha,
          constructionJobId: String(constructionJob.id),
          constructionJobName,
          finalizerJobId: String(finalizerJob.id),
          finalizerJobName,
          coordinate: name,
          target,
          runner: targetHost(target).runner,
          inputArtifactId: String(inputArtifact.id),
          inputArtifactName: inputName,
          inputArtifactDigest: inputArtifact.digest,
          inputArtifactExpired: false,
          inputArtifactExpiresAt: inputArtifact.expires_at,
          constructedFileName,
          constructedBytes: offer.constructedBytes,
          constructedSha256: offer.constructedSha256,
          outputArtifactId: String(outputArtifact.id),
          outputArtifactName: outputName,
          outputArtifactDigest: outputArtifact.digest,
          outputArtifactExpired: false,
          outputArtifactExpiresAt: outputArtifact.expires_at,
          finalizedFileName,
          finalizedMode: target.startsWith("windows-") ? "not-applicable" : "0755",
          finalizedBytes: String(finalized.length),
          finalizedSha256: sha256(finalized),
          nativeFormat: target.startsWith("macos-") ? "mach-o" : target.startsWith("linux-") ? "elf" : "pe",
          inspectedArchitecture: target.endsWith("aarch64") ? "aarch64" : "x64",
          executionExitCode: "0",
        };
        for (const [field, value] of Object.entries(expected)) {
          if (receipt[field] !== value) throw new Error(`receipt ${field} mismatch for ${name}`);
        }
        if (
          offer.workflowRef !== workflowRef || offer.baseArchiveName !== cell.distribution
          || offer.baseArchiveSha256 !== cell.sha256
        ) throw new Error(`offer authority or base mismatch for ${name}`);
        receipts.push(receipt);
      }
    }
  }
}
const expectedReceipts = evidenceControl.coordinateRules.nodeMainExecutable.expectedCoordinateCount;
if (expectedReceipts !== 180 || receipts.length !== expectedReceipts) {
  throw new Error(`expected 180 receipts, observed ${receipts.length}`);
}
const evidence = { sourceSha, workflowRunId: runId, workflowRunAttempt: runAttempt, receipts };
const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, canonicalBytes(evidence), { flag: "wx" });
process.stdout.write(`${JSON.stringify({ receipts: receipts.length, output: destination })}\n`);
