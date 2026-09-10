import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Python from "effect-build-python";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_UV_BIN;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_UV_BIN to the exact uv executable under test");
const python = process.env.EFFECT_BUILD_PYTHON_BIN;
if (python === undefined) throw new Error("Set EFFECT_BUILD_PYTHON_BIN to the Python interpreter under test");
const run = <A, E>(effect: Effect.Effect<A, E, Python.Python | NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Python.layer({ executable })), Effect.provide(NodeServices.layer)));
let root: string;
let project: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-python-")));
  project = join(root, "project");
  await mkdir(join(project, "src", "effect_build_fixture"), { recursive: true });
  await writeFile(join(project, "src", "effect_build_fixture", "__init__.py"), "answer = 42\n");
  await writeFile(join(project, "pyproject.toml"), [
    "[build-system]", 'requires = ["hatchling==1.27.0"]', 'build-backend = "hatchling.build"',
    "[project]", 'name = "effect-build-fixture"', 'version = "1.2.3"', 'requires-python = ">=3.9"',
    "[tool.hatch.build.targets.wheel]", 'packages = ["src/effect_build_fixture"]', "",
  ].join("\n"));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real uv Python builds", () => {
  it.each([true, false])("builds installable wheels and complete sdists with atomic=%s", async (atomic) => {
    const outdir = join(root, "dist");
    await mkdir(outdir);
    if (atomic) await writeFile(join(outdir, "previous-output"), "replace this directory");
    const result = await run(Python.build({ project, outdir, atomic }));
    expect(result.wheel.path).toBe(join(outdir, "effect_build_fixture-1.2.3-py3-none-any.whl"));
    expect(result.sdist.path).toBe(join(outdir, "effect_build_fixture-1.2.3.tar.gz"));
    expect(await run(Artifact.verify(result.wheel))).toEqual(result.wheel);
    expect(await run(Artifact.verify(result.sdist))).toEqual(result.sdist);
    expect(result.wheel.producedBy.name).toBe("uv");
    expect((await readdir(outdir)).sort()).toEqual([basename(result.wheel.path), basename(result.sdist.path)].sort());
    expect(await readdir(project)).not.toContain("uv.lock");
    await execute(python, ["-c", [
      "import sys, tarfile, zipfile",
      "with zipfile.ZipFile(sys.argv[1]) as wheel:",
      " assert wheel.read('effect_build_fixture/__init__.py') == b'answer = 42\\n'",
      " assert b'Version: 1.2.3' in wheel.read('effect_build_fixture-1.2.3.dist-info/METADATA')",
      "with tarfile.open(sys.argv[2]) as sdist:",
      " assert sdist.extractfile('effect_build_fixture-1.2.3/src/effect_build_fixture/__init__.py').read() == b'answer = 42\\n'",
      " assert sdist.extractfile('effect_build_fixture-1.2.3/pyproject.toml') is not None",
    ].join("\n"), result.wheel.path, result.sdist.path]);
    const environment = join(root, "venv");
    await execute(executable, ["venv", "--python", python, environment], { cwd: root, timeout: 60_000 });
    const interpreter = join(environment, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    await execute(executable, ["pip", "install", "--python", interpreter, "--no-deps", result.wheel.path], { timeout: 60_000 });
    await rm(project, { recursive: true });
    expect((await execute(interpreter, ["-c", "from effect_build_fixture import answer; print(answer)"], { cwd: root })).stdout.trim()).toBe("42");
    expect((await readdir(root)).sort()).toEqual(["dist", "venv"]);
  }, 180_000);

  it("preserves the output directory and removes staging when the real backend fails", async () => {
    const outdir = join(root, "dist");
    await mkdir(outdir);
    await writeFile(join(outdir, "previous-output"), "keep this");
    await writeFile(join(project, "pyproject.toml"), "[project\n");
    const failure = await run(Python.build({ project, outdir }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(await readFile(join(outdir, "previous-output"), "utf8")).toBe("keep this");
    expect((await readdir(root)).sort()).toEqual(["dist", "project"]);
    expect(await readdir(outdir)).toEqual(["previous-output"]);
  }, 30_000);

  it("starts a direct output directory empty, so a stale distribution never enters the result", async () => {
    const outdir = join(root, "dist");
    await mkdir(outdir);
    await writeFile(join(outdir, "old-0.1.0-py3-none-any.whl"), "stale wheel");
    const result = await run(Python.build({ project, outdir, atomic: false }));
    expect((await readdir(outdir)).sort()).toEqual([basename(result.wheel.path), basename(result.sdist.path)].sort());
    expect((await readdir(root)).sort()).toEqual(["dist", "project"]);
  }, 180_000);
});
