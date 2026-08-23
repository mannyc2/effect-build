import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../..");
const scratch = await mkdtemp(join(tmpdir(), "effect-build-plan043-node-sea-consumer-"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

const executable = process.env.PLAN043_NODE_EXECUTABLE;
assert(typeof executable === "string" && isAbsolute(executable), "PLAN043_NODE_EXECUTABLE must be absolute");
await access(executable, constants.X_OK);
assert(process.platform === "linux" && process.arch === "x64", "staged consumer requires Linux x64");
const release = await readFile("/etc/os-release", "utf8");
assert(/^ID=ubuntu$/m.test(release) && /^VERSION_ID="?24\.04"?$/m.test(release), "staged consumer requires Ubuntu 24.04");
assert((await execute(executable, ["--version"])).stdout.trim() === "v26.7.0", "staged consumer requires Node 26.7.0");

const releasedManifest = JSON.parse(await readFile(join(repository, "packages/effect-build-node-sea/package.json"), "utf8"));
assert(releasedManifest.exports["./AssembleExecutable"] === undefined, "Plan 043 must remain nonpublished");

const consumerProgram = `import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import * as AssembleExecutable from "effect-build-node-sea/AssembleExecutable";

const executable = process.env.PLAN043_NODE_EXECUTABLE;
const cjs = process.env.PLAN043_CJS;
const esm = process.env.PLAN043_ESM;
const asset = process.env.PLAN043_ASSET;
const cjsOutfile = process.env.PLAN043_CJS_OUTFILE;
const esmOutfile = process.env.PLAN043_ESM_OUTFILE;

const defaultExit = await Effect.runPromiseExit(
  AssembleExecutable.assembleExecutable({
    main: { _tag: "File", path: cjs, format: "commonjs" },
    outfile: cjsOutfile,
    observation: "unhashed",
  }).pipe(
    Effect.provide(AssembleExecutable.layer({ builderExecutable: executable })),
    Effect.provide(NodeServices.layer),
  ),
);
if (!Exit.isFailure(defaultExit)) throw new Error("default staged consumer did not refuse");
const refusal = Cause.findErrorOption(defaultExit.cause);
if (refusal._tag !== "Some" || refusal.value._tag !== "SupportUnknown") {
  throw new Error("default staged consumer did not fail SupportUnknown");
}

const cjsArtifact = await Effect.runPromise(
  AssembleExecutable.assembleExecutable({
    main: { _tag: "File", path: cjs, format: "commonjs" },
    outfile: cjsOutfile,
    observation: "hashed",
  }).pipe(
    Effect.provide(AssembleExecutable.layer({ builderExecutable: executable, allowUntestedVersion: true })),
    Effect.provide(NodeServices.layer),
  ),
);
const esmArtifact = await Effect.runPromise(
  AssembleExecutable.assembleExecutable({
    main: { _tag: "File", path: esm, format: "module" },
    outfile: esmOutfile,
    observation: "unhashed",
    assets: [{ key: "message", path: asset }],
    disableExperimentalSEAWarning: true,
  }).pipe(
    Effect.provide(AssembleExecutable.layer({ builderExecutable: executable, allowUntestedVersion: true })),
    Effect.provide(NodeServices.layer),
  ),
);
for (const artifact of [cjsArtifact, esmArtifact]) {
  if (
    artifact.provider !== "node-sea"
    || artifact.runtime.name !== "node"
    || artifact.runtime.version !== "26.7.0"
    || artifact.target !== "linux-x64-gnu"
    || artifact.nativeFormat !== "elf"
    || artifact.publication.commit !== "same-parent-rename"
  ) throw new Error("staged consumer artifact violated the frozen contract");
}
if (cjsArtifact.digest.value.length !== 64 || "digest" in esmArtifact) {
  throw new Error("staged consumer observation modes were not preserved");
}
process.stdout.write(JSON.stringify({ cjsArtifact, esmArtifact }));
`;

try {
  const nodeModules = join(scratch, "node_modules");
  const corePackage = join(nodeModules, "effect-build");
  const providerPackage = join(nodeModules, "effect-build-node-sea");
  await mkdir(nodeModules, { recursive: true });
  await cp(join(repository, "packages/effect-build/dist"), corePackage, { recursive: true });
  await cp(join(repository, "packages/effect-build-node-sea/dist"), providerPackage, { recursive: true });
  await writeJson(join(corePackage, "package.json"), {
    name: "effect-build",
    version: "0.3.0",
    type: "module",
    exports: Object.fromEntries(
      ["Artifact", "Author/Executable", "Author/Tool"].map((subpath) => [`./${subpath}`, `./${subpath}.js`]),
    ),
  });
  await writeJson(join(providerPackage, "package.json"), {
    name: "effect-build-node-sea",
    version: "0.3.0",
    type: "module",
    exports: { "./AssembleExecutable": "./AssembleExecutable.js" },
    dependencies: { "effect-build": "0.3.0" },
    peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
  });
  await symlink(resolve(repository, "node_modules/effect"), join(nodeModules, "effect"), "dir");
  await mkdir(join(nodeModules, "@effect"), { recursive: true });
  await symlink(
    resolve(repository, "node_modules/@effect/platform-node"),
    join(nodeModules, "@effect/platform-node"),
    "dir",
  );
  const cjs = join(scratch, "main.cjs");
  const esm = join(scratch, "main.mjs");
  const asset = join(scratch, "message.txt");
  const cjsOutfile = join(scratch, "dist/cjs-app");
  const esmOutfile = join(scratch, "dist/esm-app");
  const consumer = join(scratch, "consumer.mjs");
  await writeFile(cjs, 'console.log("plan043-staged-cjs-ok");\n');
  await writeFile(esm, 'import { getAsset } from "node:sea"; console.log(getAsset("message", "utf8").trim());\n');
  await writeFile(asset, "plan043-staged-asset-ok\n");
  await writeFile(consumer, consumerProgram);
  const result = await execute(process.execPath, [consumer], {
    cwd: scratch,
    env: {
      ...process.env,
      PLAN043_NODE_EXECUTABLE: executable,
      PLAN043_CJS: cjs,
      PLAN043_ESM: esm,
      PLAN043_ASSET: asset,
      PLAN043_CJS_OUTFILE: cjsOutfile,
      PLAN043_ESM_OUTFILE: esmOutfile,
    },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 240_000,
  });
  const artifacts = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert(artifacts.cjsArtifact.path === cjsOutfile, "staged consumer returned another CJS destination");
  assert(artifacts.esmArtifact.path === esmOutfile, "staged consumer returned another ESM destination");
  assert((await execute(cjsOutfile, [])).stdout === "plan043-staged-cjs-ok\n", "staged CJS output did not execute");
  assert((await execute(esmOutfile, [])).stdout === "plan043-staged-asset-ok\n", "staged ESM asset output did not execute");
  process.stdout.write("EFFECT_BUILD_PLAN043_STAGED_NODE_SEA_CONSUMER=passed\n");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
