import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as PythonBuild from "../../packages/effect-build-python/src/Build.js";
import { finalizedTree } from "../fixtures/finalized-artifacts.js";
import { requiredExecutable } from "./acceptance-support.js";

const execute = promisify(execFile);
const uv = requiredExecutable("EFFECT_BUILD_UV_BIN");
const python = requiredExecutable("EFFECT_BUILD_PYTHON_BIN");
const fixtures = resolve(fileURLToPath(new URL("./fixtures/python", import.meta.url)));
const oracle = resolve(fileURLToPath(new URL("../../scripts/acceptance/assert-python-artifacts.py", import.meta.url)));
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-python-acceptance-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, PythonBuild.Builder>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(PythonBuild.layer({ executable: uv })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const verifyPublishedArtifact = async (artifact: {
  readonly path: string;
  readonly bytes: string;
  readonly digest: { readonly value: string };
}) => {
  const contents = await readFile(artifact.path);
  expect(artifact.bytes).toBe(String(contents.byteLength));
  expect(artifact.digest.value).toBe(createHash("sha256").update(contents).digest("hex"));
};

describe.sequential("real uv 0.12.0 Python build acceptance", () => {
  it.each(
    [
      ["uv-build", "effect_build_uv_fixture", "uv_build", "effect-build-uv-fixture"],
      ["poetry-core", "effect_build_poetry_fixture", "poetry-core", "effect-build-poetry-fixture"],
    ] as const,
  )("builds, inspects, clean-installs, and imports the %s fixture", async (fixture, module, backend, distribution) => {
    const artifacts = await run(PythonBuild.build(
      new PythonBuild.BuildInput({
        source: await finalizedTree(join(fixtures, fixture)),
        outdir: join(root, fixture),
      }),
    ));
    expect(artifacts.wheel.provenance).toMatchObject({
      name: "uv",
      participants: [{ name: "uv", version: "0.12.0" }],
    });
    expect(artifacts.sdist.provenance).toEqual(artifacts.wheel.provenance);
    await verifyPublishedArtifact(artifacts.wheel);
    await verifyPublishedArtifact(artifacts.sdist);
    const completion = await execute(python, [
      oracle,
      "--wheel",
      artifacts.wheel.path,
      "--sdist",
      artifacts.sdist.path,
      "--module",
      module,
      "--backend",
      backend,
      "--distribution",
      distribution,
      "--version",
      "1.0.0",
      "--workdir",
      join(root, `${fixture}-oracle`),
    ], { env: { ...process.env, PYTHONUTF8: "1" }, maxBuffer: 8 * 1024 * 1024 });
    expect(completion.stdout).toContain(`${module}:${backend}:wheel:ok`);
    expect(completion.stdout).toContain(`${module}:${backend}:sdist:ok`);
  }, 300_000);
});
