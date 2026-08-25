import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as BunProfile from "../../packages/effect-build-bun/dist/Profile.js";
import * as EsbuildProfile from "../../packages/effect-build-esbuild/dist/Profile.js";
import * as RolldownProfile from "../../packages/effect-build-rolldown/dist/Profile.js";
import * as Raw from "../../packages/effect-build-node-sea/dist/Raw.js";
import * as NodeMain from "../../packages/effect-build/dist/Author/NodeMain.js";
import {
  canonicalBytes,
  capability,
  coordinate,
  nodeProfile,
  positiveDecimal,
  requireEnvironment,
  sha256,
  systemTarget,
  targetCell,
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
  const producerGroup = args.producer;
  const format = args.format;
  const constructionHost = args["construction-host"];
  const target = args.target;
  const builder = args.builder;
  const base = args.base;
  const bun = args.bun;
  const output = args.output;
  if ([producerGroup, format, constructionHost, target, builder, base, output].some((value) => value === undefined)) {
    throw new Error("producer, format, construction-host, target, builder, base, and output are required");
  }
  if (systemTarget() !== constructionHost) throw new Error(`construction host mismatch: ${systemTarget()} != ${constructionHost}`);
  const coordinateName = coordinate({ producerGroup, format, constructionHost, target });
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "effect-build-node-construct-"));
  try {
    const entrypoint = join(scratch, format === "module" ? "entry.mjs" : "entry.cjs");
    await writeFile(entrypoint, 'console.log("effect-build-node-main-ok");\n', { flag: "wx" });
    const provider = producerGroup === "bun-cli"
      ? BunProfile.layer({ executable: bun })
      : producerGroup === "esbuild-api"
      ? EsbuildProfile.layer
      : producerGroup === "rolldown-api"
      ? RolldownProfile.layer
      : undefined;
    if (provider === undefined) throw new Error(`unsupported producer ${producerGroup}`);
    const constructedFileName = `${coordinateName}--constructed${target.startsWith("windows-") ? ".exe" : ""}`;
    const outfile = join(outputRoot, constructedFileName);
    const result = await Effect.runPromise(
      Effect.scoped(Effect.gen(function*() {
        const sealed = yield* NodeMain.seal({ protocol: NodeMain.profile, entrypoint, format });
        const artifact = yield* Raw.assembleExecutable({
          main: { _tag: "File", path: sealed.path, format: sealed.format },
          outfile,
          target,
        });
        return { sealed, artifact };
      })).pipe(
        Effect.provide(provider),
        Effect.provide(Raw.layer({ builderExecutable: builder, baseExecutable: base })),
        Effect.provide(NodeServices.layer),
      ),
    );
    if (result.artifact.path !== outfile) throw new Error(`Raw constructed unexpected path ${result.artifact.path}`);
    const bytes = await readFile(outfile);
    if (sha256(bytes) !== result.artifact.digest.value) throw new Error("constructed artifact digest changed");
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
      mainSha256: result.sealed.digest.value,
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
