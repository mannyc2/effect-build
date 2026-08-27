import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import * as BunCompile from "../../packages/effect-build-bun/src/CompileExecutable.js";
import * as DenoCompile from "../../packages/effect-build-deno/src/CompileExecutable.js";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";

const execute = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "effect-build-target-support-"));
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required for the target-support cell`);
  return value;
};

type Execution = "headers" | "native" | "alpine";

const peMachineOracle = (bytes: Uint8Array, target: string): void => {
  if (target !== "windows-x64" && target !== "windows-aarch64") return;
  if (bytes.byteLength < 0x40) {
    throw new Error(`the ${target} artifact is too short to contain a DOS header`);
  }
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error(`the ${target} artifact does not begin with the MZ signature`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  const coffHeaderLength = 4 + 20;
  if (peOffset < 0x40 || peOffset > bytes.byteLength - coffHeaderLength) {
    throw new Error(`the ${target} artifact has an out-of-bounds PE header offset ${peOffset}`);
  }
  if (
    bytes[peOffset] !== 0x50
    || bytes[peOffset + 1] !== 0x45
    || bytes[peOffset + 2] !== 0
    || bytes[peOffset + 3] !== 0
  ) {
    throw new Error(`the ${target} artifact does not contain a PE\\0\\0 signature at offset ${peOffset}`);
  }

  const expectedMachine = target === "windows-x64" ? 0x8664 : 0xaa64;
  const machine = view.getUint16(peOffset + 4, true);
  expect(machine, `${target} PE/COFF Machine`).toBe(expectedMachine);
};

const headerOracle = async (path: string, target: string): Promise<void> => {
  try {
    accessSync("/usr/bin/file", constants.X_OK);
  } catch {
    throw new Error("/usr/bin/file is required for the independent target-support oracle");
  }
  const options = { env: { ...process.env, LC_ALL: "C" }, maxBuffer: 8 * 1024 * 1024 } as const;
  const { stdout: fileOutput } = await execute(
    "/usr/bin/file",
    ["--brief", "-P", "elf_shsize=268435456", "--", path],
    options,
  );
  if (target.startsWith("macos-")) {
    expect(fileOutput).toMatch(/Mach-O/);
    expect(fileOutput).toMatch(target === "macos-x64" ? /\bx86_64\b/ : /\barm64\b/);
    return;
  }
  if (target.startsWith("windows-")) {
    expect(fileOutput).toMatch(/PE32\+/);
    expect(fileOutput).toMatch(target === "windows-x64" ? /\bx86-64\b/i : /\bAarch64\b/i);
    return;
  }
  try {
    accessSync("/usr/bin/readelf", constants.X_OK);
  } catch {
    throw new Error("/usr/bin/readelf is required for the independent ELF target-support oracle");
  }
  const [{ stdout: header }, { stdout: programHeaders }, { stdout: versionInformation }] = await Promise.all([
    execute("/usr/bin/readelf", ["-hW", path], options),
    execute("/usr/bin/readelf", ["-lW", path], options),
    execute("/usr/bin/readelf", ["-VW", path], options),
  ]);
  expect(fileOutput).toMatch(/ELF 64-bit/);
  expect(header).toMatch(/Class:\s+ELF64/);
  expect(header).toMatch(target.includes("-x64-") ? /Machine:\s+Advanced Micro Devices X86-64/ : /Machine:\s+AArch64/);
  expect(programHeaders.match(/Requesting program interpreter:/g)).toHaveLength(1);
  if (target.endsWith("-gnu")) {
    expect(programHeaders).toMatch(/ld-linux/);
    expect(versionInformation).not.toMatch(/\bMUSL\b/i);
  } else {
    expect(programHeaders).toMatch(/ld-musl/);
    expect(versionInformation).not.toMatch(/\bGLIBC(?:XX)?_/);
  }
};

const executionOracle = async (path: string, execution: Execution): Promise<void> => {
  if (execution === "headers") return;
  if (execution === "native") {
    const completion = await execute(path, []);
    expect(completion.stdout).toBe("effect-build-ok\n");
    return;
  }
  const docker = requiredEnvironment("EFFECT_BUILD_DOCKER_BIN");
  if (!isAbsolute(docker)) throw new Error("EFFECT_BUILD_DOCKER_BIN must be absolute");
  accessSync(docker, constants.X_OK);
  const completion = await execute(docker, [
    "run",
    "--rm",
    "--volume",
    `${path}:/effect-build-target:ro`,
    "oven/bun@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
    "/effect-build-target",
  ]);
  expect(completion.stdout).toBe("effect-build-ok\n");
};

describe("provider target support", () => {
  it("compiles and independently validates exactly one environment-selected cell", async () => {
    const compiler = requiredEnvironment("EFFECT_BUILD_TARGET_COMPILER");
    if (compiler !== "bun" && compiler !== "deno") throw new Error("EFFECT_BUILD_TARGET_COMPILER must be bun or deno");
    const requested = requiredEnvironment("EFFECT_BUILD_TARGET");
    const execution = (process.env.EFFECT_BUILD_TARGET_EXECUTION ?? "headers") as Execution;
    if (execution !== "headers" && execution !== "native" && execution !== "alpine") {
      throw new Error("EFFECT_BUILD_TARGET_EXECUTION must be headers, native, or alpine");
    }
    const executable = requiredEnvironment(compiler === "bun" ? "EFFECT_BUILD_BUN_BIN" : "EFFECT_BUILD_DENO_BIN");
    if (!isAbsolute(executable)) throw new Error(`the provisioned ${compiler} executable must be absolute`);
    accessSync(executable, constants.X_OK);

    let target: BunCompile.Target | DenoCompile.Target;
    let artifact: Artifact.Executable;
    if (compiler === "bun") {
      target = Schema.decodeUnknownSync(BunCompile.Target)(requested);
      artifact = await Effect.runPromise(
        BunCompile.compileExecutable({ entrypoint, outfile: join(root, `${compiler}-${target}`), target }).pipe(
          Effect.provide(BunCompile.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
    } else {
      target = Schema.decodeUnknownSync(DenoCompile.Target)(requested);
      artifact = await Effect.runPromise(
        DenoCompile.compileExecutable({ entrypoint, outfile: join(root, `${compiler}-${target}`), target }).pipe(
          Effect.provide(DenoCompile.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
    }
    const bytes = readFileSync(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "Executable",
      bytes: bytes.byteLength,
      target,
    });
    expect(artifact.tool.name).toBe(compiler);
    expect(artifact.tool.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(artifact.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(isAbsolute(artifact.path)).toBe(true);
    expect(basename(artifact.path).endsWith(".exe")).toBe(target.startsWith("windows-"));
    peMachineOracle(bytes, target);
    if (process.platform !== "win32") await headerOracle(artifact.path, target);
    await executionOracle(artifact.path, execution);
  }, 300_000);
});
