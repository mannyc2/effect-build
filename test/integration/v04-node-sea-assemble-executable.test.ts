import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as AssembleExecutable from "../../packages/effect-build-node-sea/src/AssembleExecutable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const execute = promisify(execFile);
const fixture = new URL("../fixtures/v04/node-sea/", import.meta.url).pathname;
let root = "";
let executable = "";

const osReleaseValue = (source: string, key: string): string | undefined => {
  const line = source.split("\n").find((entry) => entry.startsWith(`${key}=`));
  if (line === undefined) return undefined;
  const value = line.slice(key.length + 1);
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-v04-node-sea-real-"));
  executable = process.env.PLAN043_NODE_EXECUTABLE ?? "";
  if (!isAbsolute(executable)) throw new Error("PLAN043_NODE_EXECUTABLE must be absolute");
  await access(executable, constants.X_OK);
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("Plan 043 integration requires a Linux x64 runner");
  }
  const release = await readFile("/etc/os-release", "utf8");
  if (osReleaseValue(release, "ID") !== "ubuntu" || osReleaseValue(release, "VERSION_ID") !== "24.04") {
    throw new Error("Plan 043 integration requires Ubuntu 24.04");
  }
  const version = (await execute(executable, ["--version"])).stdout.trim().replace(/^v/, "");
  if (version !== "26.7.0") throw new Error(`Plan 043 requires Node 26.7.0, received ${version}`);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, AssembleExecutable.Assembler>, allowUntestedVersion = true) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(AssembleExecutable.layer({
        builderExecutable: executable as AbsolutePath,
        allowUntestedVersion,
      })),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.sequential("real staged 0.4 Node SEA AssembleExecutable", () => {
  it("remains fail-closed by default on the admitted exact coordinate", async () => {
    const exit = await Effect.runPromiseExit(
      AssembleExecutable.assembleExecutable({
        main: { _tag: "File", path: join(fixture, "main.cjs"), format: "commonjs" },
        outfile: join(root, "default-app"),
        observation: "unhashed",
      }).pipe(
        Effect.provide(AssembleExecutable.layer({ builderExecutable: executable as AbsolutePath })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toMatchObject({ _tag: "SupportUnknown" });
    }
  }, 120_000);

  it("assembles, validates, hashes, publishes, and executes CJS and ESM asset mains", async () => {
    const cjsOutfile = join(root, "cjs-app");
    const cjs = await run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: join(fixture, "main.cjs"), format: "commonjs" },
      outfile: cjsOutfile,
      observation: "hashed",
    }));
    const cjsBytes = await readFile(cjsOutfile);
    expect(cjs).toMatchObject({
      _tag: "HashedExecutable",
      path: cjsOutfile,
      bytes: String(cjsBytes.byteLength),
      digest: { value: createHash("sha256").update(cjsBytes).digest("hex") },
      provider: "node-sea",
      runtime: { name: "node", version: "26.7.0" },
      target: "linux-x64-gnu",
      nativeFormat: "elf",
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect((await execute(cjsOutfile, [])).stdout).toBe("node-sea-cjs-ok\n");

    const esmOutfile = join(root, "esm-app");
    const esm = await run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: join(fixture, "main.mjs"), format: "module" },
      outfile: esmOutfile,
      observation: "unhashed",
      assets: [{ key: "message", path: join(fixture, "message.txt") }],
      disableExperimentalSEAWarning: true,
    }));
    expect(esm).toMatchObject({
      _tag: "UnhashedExecutable",
      path: esmOutfile,
      provider: "node-sea",
      runtime: { name: "node", version: "26.7.0" },
      target: "linux-x64-gnu",
      nativeFormat: "elf",
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect("digest" in esm).toBe(false);
    expect((await execute(esmOutfile, [])).stdout).toBe("node-sea-asset-ok\n");
  }, 180_000);
});
