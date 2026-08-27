import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import * as NodeMain from "../../packages/effect-build/dist/Author/NodeMain.js";
import {
  canonicalBytes,
  capability,
  assertCertificationHost,
  coordinate,
  decodeDistributionDescriptor,
  nodeProfile,
  positiveDecimal,
  requireEnvironment,
  sha256,
  systemTarget,
  targetCell,
} from "./common.mjs";
import { makePrivateAssemblerLayer, makeProducerLayer } from "./private-adapters.mjs";

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
  const producerGroup = args.producer;
  const format = args.format;
  const constructionHost = args["construction-host"];
  const target = args.target;
  const builderDescriptorPath = args["builder-descriptor"];
  const baseDescriptorPath = args["base-descriptor"];
  const bun = args.bun;
  const output = args.output;
  if (
    [producerGroup, format, constructionHost, target, builderDescriptorPath, baseDescriptorPath, output]
      .some((value) => value === undefined)
  ) {
    throw new Error(
      "producer, format, construction-host, target, builder-descriptor, base-descriptor, and output are required",
    );
  }
  const host = assertCertificationHost(constructionHost);
  if (systemTarget() !== host.systemTarget) throw new Error("construction host target observation changed");
  const builder = decodeDistributionDescriptor(await readFile(resolve(builderDescriptorPath)));
  const base = decodeDistributionDescriptor(await readFile(resolve(baseDescriptorPath)));
  if (builder.target !== host.systemTarget) throw new Error("authenticated builder descriptor target mismatch");
  if (base.target !== target) throw new Error("authenticated base descriptor target mismatch");
  const coordinateName = coordinate({ producerGroup, format, constructionHost, target });
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "effect-build-node-construct-"));
  try {
    const entrypoint = join(scratch, format === "module" ? "entry.mjs" : "entry.cjs");
    const source = format === "module"
      ? 'import { isSea } from "node:sea"; if (!isSea()) throw new Error("expected SEA execution"); console.log("effect-build-node-main-ok");\n'
      : 'const { isSea } = require("node:sea"); if (!isSea()) throw new Error("expected SEA execution"); console.log("effect-build-node-main-ok");\n';
    await writeFile(entrypoint, source, { flag: "wx" });
    const constructedFileName = `${coordinateName}--constructed${target.startsWith("windows-") ? ".exe" : ""}`;
    const outfile = join(outputRoot, constructedFileName);
    let sealed;
    const adapters = Layer.mergeAll(
      makeProducerLayer({ producerGroup, ...(bun === undefined ? {} : { bunExecutable: bun }) }),
      makePrivateAssemblerLayer({ builder, base, target, captureMain: (value) => { sealed = value; } }),
      BorrowedOutput.CleanupReporter.layer,
    );
    const artifact = await Effect.runPromise(
      NodeMain.assemble({
        program: { protocol: NodeMain.profile, entrypoint, format },
        outfile,
      }).pipe(
        Effect.provide(adapters),
        Effect.provide(NodeServices.layer),
      ),
    );
    if (sealed === undefined) throw new Error("private assembler did not consume the sealed main");
    if (artifact.path !== outfile) throw new Error(`private assembler constructed unexpected path ${artifact.path}`);
    if (artifact.target !== target || artifact.runtime.name !== "node" || artifact.runtime.version !== "26.7.0") {
      throw new Error("private assembler returned incompatible executable facts");
    }
    const bytes = await readFile(outfile);
    if (sha256(bytes) !== artifact.digest.value) throw new Error("constructed artifact digest changed");
    const sourceSha = requireEnvironment("GITHUB_SHA");
    const repository = requireEnvironment("GITHUB_REPOSITORY");
    const runId = positiveDecimal(requireEnvironment("GITHUB_RUN_ID"), "GITHUB_RUN_ID");
    const runAttempt = positiveDecimal(requireEnvironment("GITHUB_RUN_ATTEMPT"), "GITHUB_RUN_ATTEMPT");
    if (repository !== capability.authority.repository) throw new Error(`repository authority mismatch: ${repository}`);
    if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error("GITHUB_SHA must be lowercase 40-hex");
    const cell = targetCell(target);
    const offer = {
      protocol: "effect-build/assembler-offer@1",
      sourceSha,
      workflowRepository: repository,
      workflowPath: capability.authority.workflowPath,
      workflowRef: requireEnvironment("GITHUB_WORKFLOW_REF"),
      workflowRunId: runId,
      workflowRunAttempt: runAttempt,
      workflowRunHeadSha: sourceSha,
      constructionJobName: `construct--${coordinateName}`,
      coordinate: coordinateName,
      target,
      format,
      nodeVersion: nodeProfile.assemblerCell.slice("node@".length),
      mainSha256: sealed.identity.digest.value,
      baseArchiveName: cell.distribution,
      baseArchiveSha256: cell.sha256,
      constructionHost,
      constructedFileName,
      constructedBytes: String(bytes.length),
      constructedSha256: sha256(bytes),
      inputArtifactName: `${coordinateName}--constructed`,
    };
    const offerName = `${coordinateName}--assembler-offer.json`;
    await writeFile(join(outputRoot, offerName), canonicalBytes(offer), { flag: "wx" });
    process.stdout.write(`${JSON.stringify({ coordinate: coordinateName, constructedFileName, offerName })}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

await main();
