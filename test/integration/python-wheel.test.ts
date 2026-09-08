import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Target } from "effect-build";
import * as Python from "effect-build-python";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const uv = process.env.EFFECT_BUILD_UV_BIN;
if (uv === undefined) throw new Error("Set EFFECT_BUILD_UV_BIN to the exact uv executable under test");
const python = process.env.EFFECT_BUILD_PYTHON_BIN;
if (python === undefined) throw new Error("Set EFFECT_BUILD_PYTHON_BIN to the Python interpreter under test");
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-wheel-install-"))); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real Python wheel installation", () => {
  it.each([["1.2.3", "1.2.3"], ["v02!01.0-preview_2.post01.dev3+LOCAL-002", "2!1.0rc2.post1.dev3+local.2"]])(
    "installs version %s with uv and runs native and Python commands",
    async (version, normalized) => {
      const windows = process.platform === "win32", nativeName = windows ? "native-wheel-fixture.exe" : "native-wheel-fixture";
      const source = join(root, "__init__.py");
      await writeFile(source, [
        "from pathlib import Path", "import subprocess, sysconfig", "",
        "def main():",
        `    subprocess.run([str(Path(sysconfig.get_path('scripts')) / '${nativeName}'), '-e', 'console.log(42)'], check=True)`, "",
      ].join("\n"));
      const native = await run(Artifact.executable(process.execPath, { name: "fixture", version: "0.7.0" }, Target.host()));
      const module = await run(Artifact.file(source, { name: "fixture", version: "0.7.0" }));
      const options = {
        metadata: { name: "Native-Wheel-Fixture", version, requiresPython: ">=3.9" },
        tags: { python: "py3", abi: "none", platform: windows ? `win_${process.arch === "arm64" ? "arm64" : "amd64"}` : process.platform === "darwin" ? `macosx_11_0_${process.arch === "arm64" ? "arm64" : "x86_64"}` : `linux_${process.arch === "arm64" ? "aarch64" : "x86_64"}` },
        entries: [
          { artifact: module, path: "native_wheel_fixture/__init__.py" },
          { artifact: native, path: `native_wheel_fixture-${normalized}.data/scripts/${nativeName}` },
          { artifact: module, path: 'native_wheel_fixture/data,"é".txt' },
        ],
        entryPoints: { console_scripts: { "native-wheel-wrapper": "native_wheel_fixture:main" } },
        outdir: join(root, "dist"),
      };
      const wheel = await run(Python.wheel(options));
      const repeated = await run(Python.wheel({ ...options, entries: [...options.entries].reverse(), outdir: join(root, "repeat") }));
      expect((await readFile(repeated.path)).equals(await readFile(wheel.path))).toBe(true);
      expect(basename(wheel.path)).toContain(`-${normalized}-`);
      // Python's standard ZIP and CSV implementations validate every payload and metadata row independently.
      await execute(python, ["-c", [
        "import base64, csv, hashlib, io, sys, zipfile",
        "with zipfile.ZipFile(sys.argv[1]) as wheel:",
        " assert wheel.testzip() is None",
        " names = wheel.namelist()",
        " assert names == sorted(names, key=lambda name: name.encode('utf-8'))",
        " record = next(name for name in names if name.endswith('.dist-info/RECORD'))",
        " rows = list(csv.reader(io.StringIO(wheel.read(record).decode('utf-8'), newline='')))",
        " assert len(rows) == len(names)",
        " assert {row[0] for row in rows} == set(names)",
        " for name, digest, size in rows:",
        "  if name == record:",
        "   assert digest == size == ''",
        "  else:",
        "   contents = wheel.read(name)",
        "   expected = base64.urlsafe_b64encode(hashlib.sha256(contents).digest()).rstrip(b'=').decode('ascii')",
        "   assert digest == 'sha256=' + expected",
        "   assert int(size) == len(contents)",
        " for entry in wheel.infolist():",
        "  assert entry.date_time == (1980, 1, 1, 0, 0, 0)",
        "  assert entry.compress_type == zipfile.ZIP_STORED",
        "  assert entry.create_system == 3",
        "  assert entry.external_attr >> 16 == (0o100755 if '/scripts/' in entry.filename else 0o100644)",
      ].join("\n"), wheel.path]);
      const environment = join(root, "venv");
      await execute(uv, ["--no-cache", "venv", "--python", python, environment], { timeout: 60_000 });
      const interpreter = join(environment, windows ? "Scripts/python.exe" : "bin/python");
      await execute(uv, ["--no-cache", "pip", "install", "--python", interpreter, "--no-index", "--no-deps", wheel.path], { timeout: 60_000 });
      await rm(source);
      const command = join(environment, windows ? "Scripts/native-wheel-fixture.exe" : "bin/native-wheel-fixture");
      expect((await execute(command, ["-e", "console.log(42)"], { cwd: root })).stdout.trim()).toBe("42");
      const wrapper = join(environment, windows ? "Scripts/native-wheel-wrapper.exe" : "bin/native-wheel-wrapper");
      expect((await execute(wrapper, [], { cwd: root })).stdout.trim()).toBe("42");
      expect((await execute(interpreter, ["-c", "from importlib.metadata import version; print(version('native-wheel-fixture'))"], { cwd: root })).stdout.trim()).toBe(normalized);
      expect((await readdir(root)).sort()).toEqual(["dist", "repeat", "venv"]);
    },
    120_000,
  );
});
