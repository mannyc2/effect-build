import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as PythonBuild from "../../packages/effect-build-python/src/Build.js";
import { finalizedBundle } from "../fixtures/finalized-artifacts.js";

const executableFixture = resolve(
  fileURLToPath(new URL("../fixtures/tools/fake-uv-build-hard-cut.mjs", import.meta.url)),
);
const pythonFixtures = resolve(fileURLToPath(new URL("../fixtures/python-hard-cut", import.meta.url)));
let root = "";
let uv = "";
let uvBuildSource: Awaited<ReturnType<typeof finalizedBundle>>;
let poetryCoreSource: Awaited<ReturnType<typeof finalizedBundle>>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-python-hard-cut-"));
  uv = join(root, "uv");
  await copyFile(executableFixture, uv);
  await chmod(uv, 0o755);
  uvBuildSource = await finalizedBundle(join(pythonFixtures, "uv-build"));
  poetryCoreSource = await finalizedBundle(join(pythonFixtures, "poetry-core"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, PythonBuild.Builder>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(PythonBuild.layer({ executable: uv })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

describe.sequential("pinned uv Python build hard cut", () => {
  it("uses one resolved/probed uv frontend for uv_build and poetry-core and publishes native filenames", async () => {
    const log = join(root, "uv.log");
    await writeFile(log, "");
    process.env.FAKE_UV_BUILD_LOG = log;
    try {
      const exit = await run(
        Effect.all([
          PythonBuild.build(
            new PythonBuild.BuildInput({
              source: uvBuildSource,
              outdir: join(root, "uv-build-dist"),
            }),
          ),
          PythonBuild.build(
            new PythonBuild.BuildInput({
              source: poetryCoreSource,
              outdir: join(root, "poetry-core-dist"),
            }),
          ),
        ], { concurrency: 1 }),
      );
      expect(Exit.isSuccess(exit), Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "").toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value.map((outputs) => outputs.tool)).toEqual([
          { name: "uv", version: "0.12.0" },
          { name: "uv", version: "0.12.0" },
        ]);
        for (const outputs of exit.value) {
          expect(outputs.wheel.path).toMatch(/\.whl$/);
          expect(outputs.sdist.path).toMatch(/\.tar\.gz$/);
          expect(outputs.wheel.sha256).toMatch(/^[0-9a-f]{64}$/);
          expect(outputs.sdist.sha256).toMatch(/^[0-9a-f]{64}$/);
          expect(await readFile(outputs.wheel.path, "utf8")).toContain("wheel:effect_build_");
          expect(await readFile(outputs.sdist.path, "utf8")).toContain("sdist:effect_build_");
        }
      }
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) =>
        JSON.parse(line) as {
          readonly argv: readonly string[];
        }
      );
      expect(invocations.filter(({ argv }) => argv[0] === "--version")).toHaveLength(1);
      expect(invocations.filter(({ argv }) => argv[0] === "lock" && argv.includes("--check"))).toHaveLength(2);
      const builds = invocations.filter(({ argv }) => argv[0] === "build");
      expect(builds).toHaveLength(2);
      for (const { argv } of builds) {
        expect(argv).toContain("--wheel");
        expect(argv).toContain("--sdist");
        expect(argv).toContain("--force-pep517");
        expect(argv).toContain("--no-python-downloads");
        expect(argv).not.toContain("poetry");
        expect(argv).not.toContain("pip");
      }
    } finally {
      delete process.env.FAKE_UV_BUILD_LOG;
    }
  });

  it("requires pyproject and lock inputs before spawning uv", async () => {
    const source = join(root, "missing-lock");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "pyproject.toml"), '[project]\nname = "missing-lock"\nversion = "1.0.0"\n');
    const exit = await run(PythonBuild.build(
      new PythonBuild.BuildInput({
        source: await finalizedBundle(source),
        outdir: join(root, "missing-lock-dist"),
      }),
    ));
    const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("PythonBuildFailed");
    expect(failure.reason).toContain("uv.lock");
  });

  it("rejects source mutation before uv can consume caller-controlled bytes", async () => {
    const source = join(root, "mutated-source");
    const outdir = join(root, "mutated-source-dist");
    const log = join(root, "mutated-source.log");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "pyproject.toml"), '[project]\nname = "exact"\nversion = "1.0.0"\n');
    await writeFile(join(source, "uv.lock"), 'version = 1\nrevision = 3\nrequires-python = ">=3.12"\n');
    const snapshot = await finalizedBundle(source);
    await writeFile(join(source, "pyproject.toml"), '[project]\nname = "mutated"\nversion = "9.9.9"\n');
    await writeFile(log, "");
    process.env.FAKE_UV_BUILD_LOG = log;
    try {
      const exit = await run(PythonBuild.build(new PythonBuild.BuildInput({ source: snapshot, outdir })));
      const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
      expect(failure._tag).toBe("ArtifactVerificationFailed");
      expect(failure.reason).toContain("mismatch");
      const invocations = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((line) =>
        JSON.parse(line) as { readonly argv: readonly string[] }
      );
      expect(invocations.map(({ argv }) => argv[0])).toEqual(["--version"]);
      await expect(readFile(outdir)).rejects.toThrow();
    } finally {
      delete process.env.FAKE_UV_BUILD_LOG;
    }
  });

  it("rejects missing or extra uv outputs without committing a partial result", async () => {
    for (const mode of ["missing-sdist", "extra"] as const) {
      const outdir = join(root, `invalid-${mode}`);
      process.env.FAKE_UV_BUILD_MODE = mode;
      try {
        const exit = await run(
          PythonBuild.build(new PythonBuild.BuildInput({ source: uvBuildSource, outdir })),
        );
        const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
        expect(failure._tag).toBe("PythonBuildFailed");
        expect(failure.reason).toContain("exactly one wheel and one sdist");
        await expect(readFile(outdir)).rejects.toThrow();
      } finally {
        delete process.env.FAKE_UV_BUILD_MODE;
      }
    }
  });

  it("rejects a uv output symlink before copying producer-external bytes", async () => {
    const outdir = join(root, "invalid-symlink-wheel");
    process.env.FAKE_UV_BUILD_MODE = "symlink-wheel";
    try {
      const exit = await run(PythonBuild.build(new PythonBuild.BuildInput({ source: uvBuildSource, outdir })));
      const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
      expect(failure._tag).toBe("PythonBuildFailed");
      expect(failure.reason).toContain("symbolic link");
      await expect(readFile(outdir)).rejects.toThrow();
    } finally {
      delete process.env.FAKE_UV_BUILD_MODE;
    }
  });

  it("rejects malformed build input at the runtime boundary", async () => {
    const exit = await run(PythonBuild.build({
      source: uvBuildSource,
      outdir: "",
    } as unknown as PythonBuild.BuildInput));
    const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("PythonBuildFailed");
    expect(failure.reason).toContain("decode build input");
  });
});
