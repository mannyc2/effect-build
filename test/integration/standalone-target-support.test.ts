import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import * as Bun from "../../src/Bun.js";
import * as Deno from "../../src/Deno.js";
import { bunTargetTable } from "../../src/standalone/internal/BunTarget.js";
import { denoTargetTable } from "../../src/standalone/internal/DenoTarget.js";

const execFileAsync = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "effect-build-target-support-"));
const entrypoint = fileURLToPath(new URL("../fixtures/standalone/hello.ts", import.meta.url));
const support = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../tooling/support-matrix.json", import.meta.url)), "utf8"),
) as { compilerFixtures: Array<{ tool: string; version: string }> };

afterAll(() => rmSync(root, { recursive: true, force: true }));

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required for the target-support cell`);
  return value;
};

const oracle = async (path: string, target: string): Promise<void> => {
  for (const executable of ["/usr/bin/file", "/usr/bin/readelf"]) {
    try {
      accessSync(executable, constants.X_OK);
    } catch {
      throw new Error(`${executable} is required for the independent target-support oracle`);
    }
  }
  const options = { env: { ...process.env, LC_ALL: "C" }, maxBuffer: 8 * 1024 * 1024 } as const;
  const { stdout: fileOutput } = await execFileAsync("/usr/bin/file", ["--brief", "--", path], options);

  if (target.startsWith("macos-")) {
    expect(fileOutput).toMatch(/Mach-O/);
    if (target === "macos-x64") {
      expect(fileOutput).toMatch(/\bx86_64\b/);
      expect(fileOutput).not.toMatch(/\barm64\b/);
    } else {
      expect(fileOutput).toMatch(/\barm64\b/);
      expect(fileOutput).not.toMatch(/\bx86_64\b/);
    }
    return;
  }

  if (target.startsWith("windows-")) {
    expect(fileOutput).toMatch(/PE32\+/);
    if (target === "windows-x64") {
      expect(fileOutput).toMatch(/\bx86-64\b/i);
      expect(fileOutput).not.toMatch(/\bAarch64\b/i);
    } else {
      expect(fileOutput).toMatch(/\bAarch64\b/i);
      expect(fileOutput).not.toMatch(/\bx86-64\b/i);
    }
    return;
  }

  expect(fileOutput).toMatch(/ELF 64-bit/);
  const [{ stdout: header }, { stdout: programHeaders }, { stdout: versionInformation }] = await Promise.all([
    execFileAsync("/usr/bin/readelf", ["-hW", path], options),
    execFileAsync("/usr/bin/readelf", ["-lW", path], options),
    execFileAsync("/usr/bin/readelf", ["-VW", path], options),
  ]);
  expect(header).toMatch(/Class:\s+ELF64/);
  if (target.includes("-x64-")) {
    expect(fileOutput).toMatch(/\bx86-64\b/i);
    expect(header).toMatch(/Machine:\s+Advanced Micro Devices X86-64/);
    expect(header).not.toMatch(/Machine:\s+AArch64/);
  } else {
    expect(fileOutput).toMatch(/\b(aarch64|ARM aarch64)\b/i);
    expect(header).toMatch(/Machine:\s+AArch64/);
    expect(header).not.toMatch(/Machine:\s+Advanced Micro Devices X86-64/);
  }
  expect(programHeaders.match(/Requesting program interpreter:/g)).toHaveLength(1);
  if (target.endsWith("-gnu")) {
    expect(programHeaders).toMatch(/ld-linux/);
    expect(programHeaders).not.toMatch(/ld-musl/);
    expect(versionInformation).not.toMatch(/\bMUSL\b/i);
  } else {
    expect(programHeaders).toMatch(/ld-musl/);
    expect(programHeaders).not.toMatch(/ld-linux/);
    expect(versionInformation).not.toMatch(/\bGLIBC(?:XX)?_/);
  }
};

describe("required provider target support", () => {
  it("compiles and independently validates exactly one environment-selected cell", async () => {
    const compiler = requiredEnvironment("EFFECT_BUILD_TARGET_COMPILER");
    if (compiler !== "bun" && compiler !== "deno") {
      throw new Error("EFFECT_BUILD_TARGET_COMPILER must be bun or deno");
    }
    const requested = requiredEnvironment("EFFECT_BUILD_TARGET");
    const target = compiler === "bun" ? bunTargetTable.resolve(requested) : denoTargetTable.resolve(requested);
    if (target === undefined) throw new Error(`${compiler}/${requested} is not in the provider target table`);
    const executable = requiredEnvironment(compiler === "bun" ? "EFFECT_BUILD_BUN_BIN" : "EFFECT_BUILD_DENO_BIN");
    if (!isAbsolute(executable)) throw new Error(`the provisioned ${compiler} executable must be absolute`);
    accessSync(executable, constants.X_OK);
    if (process.env.DENORT_BIN !== undefined) {
      throw new Error("DENORT_BIN must not be inherited by target-support cells");
    }

    const windows = target.startsWith("windows-");
    const outfile = join(root, `${compiler}-${target}${windows ? ".exe" : ""}`);
    const input = { entrypoint, outfile, target, digest: true } as const;
    const effect = compiler === "bun"
      ? Bun.compileExecutable(input).pipe(Effect.provide(Bun.layer({ executable })))
      : Deno.compileExecutable(input).pipe(Effect.provide(Deno.layer({ executable })));
    const artifact = await Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

    const bytes = readFileSync(artifact.path);
    const expectedVersion = support.compilerFixtures.find((fixture) => fixture.tool === compiler)?.version;
    expect(expectedVersion).toBeDefined();
    expect(artifact).toMatchObject({
      path: outfile,
      bytes: bytes.byteLength,
      target,
      tool: { name: compiler, version: expectedVersion, path: executable },
    });
    expect(artifact.digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(isAbsolute(artifact.path)).toBe(true);
    if (windows) expect(basename(artifact.path)).toMatch(/\.exe$/);
    else expect(basename(artifact.path)).not.toMatch(/\.exe$/);

    await oracle(artifact.path, target);
  }, 300_000);
});
