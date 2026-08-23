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

const execute = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "effect-build-v04-target-support-"));
const entrypoint = fileURLToPath(new URL("../fixtures/standalone/hello.ts", import.meta.url));
const support = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../tooling/support-matrix.json", import.meta.url)), "utf8"),
) as { readonly compilerFixtures: ReadonlyArray<{ readonly tool: string; readonly version: string }> };

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

describe("required v0.4 provider target support", () => {
  it("compiles and independently validates exactly one environment-selected cell", async () => {
    const compiler = requiredEnvironment("EFFECT_BUILD_TARGET_COMPILER");
    if (compiler !== "bun" && compiler !== "deno") throw new Error("EFFECT_BUILD_TARGET_COMPILER must be bun or deno");
    const requested = requiredEnvironment("EFFECT_BUILD_TARGET");
    const executable = requiredEnvironment(compiler === "bun" ? "EFFECT_BUILD_BUN_BIN" : "EFFECT_BUILD_DENO_BIN");
    if (!isAbsolute(executable)) throw new Error(`the provisioned ${compiler} executable must be absolute`);
    accessSync(executable, constants.X_OK);

    let target: BunCompile.Target | DenoCompile.Target;
    let artifact: BunCompile.Artifact<"hashed"> | DenoCompile.Artifact<"hashed">;
    if (compiler === "bun") {
      target = Schema.decodeUnknownSync(BunCompile.Target)(requested);
      const outfile = join(root, `${compiler}-${target}${target.startsWith("windows-") ? ".exe" : ""}`);
      artifact = await Effect.runPromise(
        BunCompile.compileExecutable({ entrypoint, outfile, target, observation: "hashed" }).pipe(
          Effect.provide(BunCompile.layer({
            executable: executable as import("../../packages/effect-build/src/Artifact.js").AbsolutePath,
            allowUntestedVersion: true,
          })),
          Effect.provide(NodeServices.layer),
        ),
      );
    } else {
      target = Schema.decodeUnknownSync(DenoCompile.Target)(requested);
      const outfile = join(root, `${compiler}-${target}${target.startsWith("windows-") ? ".exe" : ""}`);
      artifact = await Effect.runPromise(
        DenoCompile.compileExecutable({ entrypoint, outfile, target, observation: "hashed" }).pipe(
          Effect.provide(DenoCompile.layer({
            executable: executable as import("../../packages/effect-build/src/Artifact.js").AbsolutePath,
            allowUntestedVersion: true,
          })),
          Effect.provide(NodeServices.layer),
        ),
      );
    }
    const outfile = join(root, `${compiler}-${target}${target.startsWith("windows-") ? ".exe" : ""}`);
    const bytes = readFileSync(artifact.path);
    const expectedVersion = support.compilerFixtures.find((fixture) => fixture.tool === compiler)?.version;
    expect(expectedVersion).toBeDefined();
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      path: outfile,
      bytes: String(bytes.byteLength),
      target,
      provider: compiler,
      runtime: { name: compiler, version: expectedVersion },
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect(artifact.digest.value).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(isAbsolute(artifact.path)).toBe(true);
    expect(basename(artifact.path).endsWith(".exe")).toBe(target.startsWith("windows-"));
    await oracle(artifact.path, target);
  }, 300_000);
});
