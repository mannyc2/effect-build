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
const scratch = await mkdtemp(join(tmpdir(), "effect-build-plan042-deno-consumer-"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");

const executable = process.env.PLAN042_DENO_EXECUTABLE;
assert(typeof executable === "string" && isAbsolute(executable), "PLAN042_DENO_EXECUTABLE must be absolute");
await access(executable, constants.X_OK);
const version = (await execute(executable, ["--version"])).stdout.match(/^deno\s+([^\s]+)/m)?.[1];
assert(version === "2.9.3", "staged consumer requires Deno 2.9.3");

const releasedManifest = JSON.parse(await readFile(join(repository, "packages/effect-build-deno/package.json"), "utf8"));
assert(releasedManifest.exports["./CompileExecutable"] === undefined, "Plan 042 must remain nonpublished");

const consumerProgram = [
  'import { NodeServices } from "@effect/platform-node";',
  'import { Cause, Effect, Exit } from "effect";',
  'import * as CompileExecutable from "effect-build-deno/CompileExecutable";',
  "",
  "const executable = process.env.PLAN042_DENO_EXECUTABLE;",
  "const entrypoint = process.env.PLAN042_ENTRYPOINT;",
  "const outfile = process.env.PLAN042_OUTFILE;",
  "",
  "const defaultExit = await Effect.runPromiseExit(",
  "  CompileExecutable.compileExecutable({ entrypoint, outfile, observation: 'unhashed', target: 'linux-x64-gnu' }).pipe(",
  "    Effect.provide(CompileExecutable.layer({ executable })),",
  "    Effect.provide(NodeServices.layer),",
  "  ),",
  ");",
  'if (!Exit.isFailure(defaultExit)) throw new Error("default staged consumer did not refuse");',
  "const refusal = Cause.findErrorOption(defaultExit.cause);",
  'if (refusal._tag !== "Some" || refusal.value._tag !== "SupportUnknown") {',
  '  throw new Error("default staged consumer did not fail SupportUnknown");',
  "}",
  "",
  "const artifact = await Effect.runPromise(",
  "  CompileExecutable.compileExecutable({",
  "    entrypoint,",
  "    outfile,",
  "    target: 'linux-x64-gnu',",
  "    observation: 'hashed',",
  "  }).pipe(",
  "    Effect.provide(CompileExecutable.layer({ executable, allowUntestedVersion: true })),",
  "    Effect.provide(NodeServices.layer),",
  "  ),",
  ");",
  "if (",
  "  artifact.provider !== 'deno'",
  "  || artifact.runtime.name !== 'deno'",
  "  || artifact.runtime.version !== '2.9.3'",
  "  || artifact.target !== 'linux-x64-gnu'",
  "  || artifact.nativeFormat !== 'elf'",
  "  || artifact.publication.commit !== 'same-parent-rename'",
  "  || artifact.digest.value.length !== 64",
  ') throw new Error("staged consumer artifact violated the frozen contract");',
  "process.stdout.write(JSON.stringify(artifact));",
].join("\n");

try {
  const nodeModules = join(scratch, "node_modules");
  const corePackage = join(nodeModules, "effect-build");
  const providerPackage = join(nodeModules, "effect-build-deno");
  await mkdir(nodeModules, { recursive: true });
  await cp(join(repository, "packages/effect-build/dist"), corePackage, { recursive: true });
  await cp(join(repository, "packages/effect-build-deno/dist"), providerPackage, { recursive: true });
  await writeJson(join(corePackage, "package.json"), {
    name: "effect-build",
    version: "0.3.0",
    type: "module",
    exports: Object.fromEntries([
      "Artifact",
      "Author/Executable",
      "Author/Tool",
      "Matrix",
      "SystemTarget",
    ].map((subpath) => ["./" + subpath, "./" + subpath + ".js"])),
  });
  await writeJson(join(providerPackage, "package.json"), {
    name: "effect-build-deno",
    version: "0.3.0",
    type: "module",
    exports: { "./CompileExecutable": "./CompileExecutable.js" },
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
  const entrypoint = join(scratch, "entry.ts");
  const outfile = join(scratch, "dist/app");
  const consumer = join(scratch, "consumer.mjs");
  await writeFile(entrypoint, 'console.log("plan042-staged-consumer-ok");\n');
  await writeFile(consumer, consumerProgram);
  const result = await execute(process.execPath, [consumer], {
    cwd: scratch,
    env: {
      ...process.env,
      PLAN042_DENO_EXECUTABLE: executable,
      PLAN042_ENTRYPOINT: entrypoint,
      PLAN042_OUTFILE: outfile,
    },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
  });
  const artifact = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert(artifact.path === outfile, "staged consumer returned another destination");
  assert((await execute(outfile, [])).stdout === "plan042-staged-consumer-ok\n", "staged output did not execute");
  process.stdout.write("EFFECT_BUILD_PLAN042_STAGED_DENO_CONSUMER=passed\n");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
