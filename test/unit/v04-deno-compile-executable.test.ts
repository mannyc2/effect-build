import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { appendFile, chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as DenoCompile from "../../packages/effect-build-deno/src/CompileExecutable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";

const fixture = resolve(new URL("../fixtures/v04/fake-deno.mjs", import.meta.url).pathname);
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-v04-deno-"));
  executable = join(root, "deno");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(
  effect: Effect.Effect<A, E, DenoCompile.Compiler>,
  allowUntestedVersion = false,
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(DenoCompile.layer({
        executable: executable as AbsolutePath,
        allowUntestedVersion,
      })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const absent = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (error as { readonly code?: string }).code === "ENOENT";
  }
};

const input = (
  name: string,
  overrides: Partial<DenoCompile.CompileExecutableInput<"hashed">> = {},
) => ({
  entrypoint: "main.ts",
  outfile: join(root, name),
  observation: "hashed" as const,
  ...overrides,
});

const nativeTarget = (target: DenoCompile.Target): string => {
  switch (target) {
    case "macos-x64":
      return "x86_64-apple-darwin";
    case "macos-aarch64":
      return "aarch64-apple-darwin";
    case "linux-x64-gnu":
      return "x86_64-unknown-linux-gnu";
    case "linux-aarch64-gnu":
      return "aarch64-unknown-linux-gnu";
    case "windows-x64":
      return "x86_64-pc-windows-msvc";
    case "windows-aarch64":
      return "aarch64-pc-windows-msvc";
  }
};

const nativeRuntime = (target: DenoCompile.Target): Uint8Array => {
  if (target === "macos-x64" || target === "macos-aarch64") {
    const bytes = new Uint8Array(8);
    bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
    new DataView(bytes.buffer).setUint32(4, target === "macos-aarch64" ? 0x0100000c : 0x01000007, true);
    return bytes;
  }
  if (target === "windows-x64" || target === "windows-aarch64") {
    const bytes = new Uint8Array(70);
    bytes.set([0x4d, 0x5a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(60, 64, true);
    bytes.set([0x50, 0x45, 0, 0], 64);
    view.setUint16(68, target === "windows-aarch64" ? 0xaa64 : 0x8664, true);
    return bytes;
  }
  const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
  const bytes = new Uint8Array(120 + interpreter.byteLength);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, target === "linux-aarch64-gnu" ? 183 : 62, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, 1, true);
  view.setUint32(64, 3, true);
  view.setBigUint64(72, 120n, true);
  view.setBigUint64(96, BigInt(interpreter.byteLength), true);
  bytes.set(interpreter, 120);
  return bytes;
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crc32Table[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const storedZip = (member: string, contents: Uint8Array): Uint8Array => {
  const name = new TextEncoder().encode(member);
  const localLength = 30 + name.byteLength + contents.byteLength;
  const centralLength = 46 + name.byteLength;
  const bytes = new Uint8Array(localLength + centralLength + 22);
  const view = new DataView(bytes.buffer);
  const crc = crc32(contents);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, contents.byteLength, true);
  view.setUint32(22, contents.byteLength, true);
  view.setUint16(26, name.byteLength, true);
  bytes.set(name, 30);
  bytes.set(contents, 30 + name.byteLength);

  const central = localLength;
  view.setUint32(central, 0x02014b50, true);
  view.setUint16(central + 4, 20, true);
  view.setUint16(central + 6, 20, true);
  view.setUint32(central + 16, crc, true);
  view.setUint32(central + 20, contents.byteLength, true);
  view.setUint32(central + 24, contents.byteLength, true);
  view.setUint16(central + 28, name.byteLength, true);
  bytes.set(name, central + 46);

  const end = central + centralLength;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, centralLength, true);
  view.setUint32(end + 16, central, true);
  return bytes;
};

const cacheDirectory = (): string => join(root, "deno-cache");

const installCachedRuntime = async (target: DenoCompile.Target, contents = nativeRuntime(target)): Promise<void> => {
  const archive = join(
    cacheDirectory(),
    "dl",
    "release",
    "v2.9.3",
    "denort-" + nativeTarget(target) + ".zip",
  );
  await mkdir(dirname(archive), { recursive: true });
  const member = target === "windows-x64" || target === "windows-aarch64" ? "denort.exe" : "denort";
  await writeFile(archive, storedZip(member, contents));
};

describe.sequential("staged 0.4 Deno CompileExecutable", () => {
  it("uses Deno 2.9 eval's implicit-permission argv for layer acquisition", async () => {
    const probeLog = join(root, "probe-argv.log");
    const inheritedDenort = process.env.DENORT_BIN;
    process.env.FAKE_DENO_PROBE_LOG = probeLog;
    delete process.env.DENORT_BIN;
    try {
      const service = await Effect.runPromise(
        DenoCompile.Compiler.pipe(
          Effect.provide(DenoCompile.layer({ executable: executable as AbsolutePath })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(service.compileExecutable).toBeTypeOf("function");
      const argv = JSON.parse(await readFile(probeLog, "utf8")) as readonly string[];
      expect(argv).toEqual(["eval", expect.any(String)]);
      expect(argv[1]).toContain("Deno.execPath()");
      expect(argv[1]).toContain("Deno.env.get('DENORT_BIN')");
      expect(argv).not.toContain("--allow-env=DENORT_BIN");
      expect(argv).not.toContain("--allow-read=/etc/os-release");
    } finally {
      delete process.env.FAKE_DENO_PROBE_LOG;
      if (inheritedDenort === undefined) delete process.env.DENORT_BIN;
      else process.env.DENORT_BIN = inheritedDenort;
    }
  });

  it("canonicalizes native x86_64 while rejecting an unknown Deno architecture", async () => {
    const inheritedArchitecture = process.env.FAKE_DENO_ARCH;
    const inheritedDenort = process.env.DENORT_BIN;
    delete process.env.DENORT_BIN;
    const acquire = () =>
      Effect.runPromise(
        DenoCompile.Compiler.pipe(
          Effect.provide(DenoCompile.layer({ executable: executable as AbsolutePath })),
          Effect.provide(NodeServices.layer),
        ),
      );
    try {
      process.env.FAKE_DENO_ARCH = "x86_64";
      await expect(acquire()).resolves.toMatchObject({
        compileExecutable: expect.any(Function),
        compileExecutableMatrix: expect.any(Function),
      });

      process.env.FAKE_DENO_ARCH = "amd64";
      await expect(acquire()).rejects.toMatchObject({
        _tag: "IdentityIncomplete",
        reason: "identity-probe-fields-are-incomplete",
      });
    } finally {
      if (inheritedArchitecture === undefined) delete process.env.FAKE_DENO_ARCH;
      else process.env.FAKE_DENO_ARCH = inheritedArchitecture;
      if (inheritedDenort === undefined) delete process.env.DENORT_BIN;
      else process.env.DENORT_BIN = inheritedDenort;
    }
  });

  it("refuses a missing default denort archive before destination or candidate mutation", async () => {
    const denoDir = join(root, "empty-deno-cache");
    const outputDirectory = join(root, "cold-output");
    const outfile = join(outputDirectory, "app");
    const log = join(root, "cold-compile.log");
    process.env.FAKE_DENO_DIR = denoDir;
    process.env.FAKE_DENO_LOG = log;
    try {
      const exit = await run(
        DenoCompile.compileExecutable({
          entrypoint: "main.ts",
          outfile,
          observation: "hashed",
        }),
        true,
      );
      const failure = failureOf(exit) as DenoCompile.CompileExecutableError;
      expect(failure._tag).toBe("RelationUnsatisfied");
      if (failure._tag === "RelationUnsatisfied") {
        expect(failure.reason).toContain("denort-cache:stat:NotFound");
      }
      expect(await absent(outfile)).toBe(true);
      expect(await absent(outputDirectory)).toBe(true);
      expect(await absent(log)).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_DIR;
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("rejects a corrupt cached archive before output mutation", async () => {
    const archive = join(
      cacheDirectory(),
      "dl",
      "release",
      "v2.9.3",
      "denort-x86_64-unknown-linux-gnu.zip",
    );
    await mkdir(dirname(archive), { recursive: true });
    await writeFile(archive, "not-a-zip");
    process.env.FAKE_DENO_DIR = cacheDirectory();
    try {
      const outfile = join(root, "corrupt-output", "app");
      const exit = await run(
        DenoCompile.compileExecutable({
          entrypoint: "main.ts",
          outfile,
          observation: "hashed",
        }),
        true,
      );
      const failure = failureOf(exit) as DenoCompile.CompileExecutableError;
      expect(failure._tag).toBe("RelationUnsatisfied");
      expect(await absent(outfile)).toBe(true);
      expect(await absent(dirname(outfile))).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_DIR;
      await rm(cacheDirectory(), { recursive: true, force: true });
    }
  });

  it("binds Deno's warmed cache, freezes its cache root, and publishes after the admission override", async () => {
    await installCachedRuntime("linux-x64-gnu");
    process.env.FAKE_DENO_DIR = cacheDirectory();
    const log = join(root, "warm-compile.log");
    process.env.FAKE_DENO_LOG = log;
    process.env.FAKE_PROJECT_MARKER = "preserved";
    try {
      const exit = await run(
        DenoCompile.compileExecutable(input("warm-output", {
          cwd: root,
          outfile: "warm-output",
          options: { bundle: true, minify: true, permissions: { read: true } },
        })),
        true,
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toMatchObject({
          _tag: "HashedExecutable",
          provider: "deno",
          nativeFormat: "elf",
          target: "linux-x64-gnu",
          runtime: { name: "deno", version: "2.9.3" },
          publication: { commit: "same-parent-rename", committed: true },
        });
        expect(exit.value.digest.value).toMatch(/^[0-9a-f]{64}$/);
      }
      const invocation = JSON.parse((await readFile(log, "utf8")).trim()) as {
        readonly argv: readonly string[];
        readonly marker: string;
        readonly denoDir: string;
      };
      expect(invocation.marker).toBe("preserved");
      expect(invocation.denoDir).toBe(cacheDirectory());
      expect(invocation.argv).toEqual(expect.arrayContaining([
        "compile",
        "--bundle",
        "--minify",
        "--allow-read",
      ]));
    } finally {
      delete process.env.FAKE_DENO_DIR;
      delete process.env.FAKE_DENO_LOG;
      delete process.env.FAKE_PROJECT_MARKER;
      await rm(cacheDirectory(), { recursive: true, force: true });
    }
  });

  it("pins the DENO_DIR cache observed before user work and never falls back to a later cache root", async () => {
    await installCachedRuntime("linux-x64-gnu");
    const observedCache = cacheDirectory();
    const laterCache = join(root, "later-deno-cache");
    const log = join(root, "pinned-cache.log");
    const originalDenoDir = process.env.DENO_DIR;
    process.env.DENO_DIR = observedCache;
    process.env.FAKE_DENO_LOG = log;
    try {
      const program = Effect.gen(function*() {
        yield* Effect.sync(() => {
          process.env.DENO_DIR = laterCache;
        });
        return yield* DenoCompile.compileExecutable(input("pinned-cache-output"));
      }).pipe(
        Effect.provide(DenoCompile.layer({
          executable: executable as AbsolutePath,
          allowUntestedVersion: true,
        })),
        Effect.provide(NodeServices.layer),
      );
      const exit = await Effect.runPromiseExit(program);
      expect(Exit.isSuccess(exit)).toBe(true);
      const invocation = JSON.parse((await readFile(log, "utf8")).trim()) as { readonly denoDir: string };
      expect(invocation.denoDir).toBe(observedCache);
      expect(await absent(laterCache)).toBe(true);
    } finally {
      if (originalDenoDir === undefined) delete process.env.DENO_DIR;
      else process.env.DENO_DIR = originalDenoDir;
      delete process.env.FAKE_DENO_LOG;
      await rm(observedCache, { recursive: true, force: true });
    }
  });

  it("validates every frozen target runtime archive before compiling the matching target", async () => {
    for (const target of DenoCompile.Target.literals) await installCachedRuntime(target);
    process.env.FAKE_DENO_DIR = cacheDirectory();
    try {
      for (const target of DenoCompile.Target.literals) {
        const exit = await run(DenoCompile.compileExecutable(input("target-" + target, { target })), true);
        expect(Exit.isSuccess(exit), target).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.target).toBe(target);
          expect(exit.value.nativeFormat).toBe(
            target.startsWith("macos") ? "mach-o" : target.startsWith("windows") ? "pe" : "elf",
          );
        }
      }
    } finally {
      delete process.env.FAKE_DENO_DIR;
      await rm(cacheDirectory(), { recursive: true, force: true });
    }
  });

  it("does not let explicit DENORT_BIN satisfy a different target before output mutation", async () => {
    const override = join(root, "denort-x64");
    await writeFile(override, nativeRuntime("linux-x64-gnu"));
    await chmod(override, 0o755);
    process.env.DENORT_BIN = override;
    try {
      const outfile = join(root, "override-output", "app");
      const exit = await run(
        DenoCompile.compileExecutable({
          entrypoint: "main.ts",
          outfile,
          observation: "hashed",
          target: "linux-aarch64-gnu",
        }),
        true,
      );
      expect((failureOf(exit) as DenoCompile.CompileExecutableError)._tag).toBe("RelationUnsatisfied");
      expect(await absent(outfile)).toBe(true);
      expect(await absent(dirname(outfile))).toBe(true);
    } finally {
      delete process.env.DENORT_BIN;
    }
  });

  it("keeps a valid relation at SupportUnknown without explicit override", async () => {
    await installCachedRuntime("linux-x64-gnu");
    process.env.FAKE_DENO_DIR = cacheDirectory();
    try {
      const outfile = join(root, "support-unknown", "app");
      const exit = await run(DenoCompile.compileExecutable({
        entrypoint: "main.ts",
        outfile,
        observation: "hashed",
      }));
      const failure = failureOf(exit) as DenoCompile.CompileExecutableError;
      expect(failure._tag).toBe("SupportUnknown");
      expect(await absent(outfile)).toBe(true);
      expect(await absent(dirname(outfile))).toBe(true);
    } finally {
      delete process.env.FAKE_DENO_DIR;
      await rm(cacheDirectory(), { recursive: true, force: true });
    }
  });

  it("rejects changed selected Deno content before launch or staging", async () => {
    await installCachedRuntime("linux-x64-gnu");
    process.env.FAKE_DENO_DIR = cacheDirectory();
    const outfile = join(root, "changed-deno-output", "app");
    try {
      const program = Effect.gen(function*() {
        yield* Effect.promise(() => appendFile(executable, "\n// changed selected command\n"));
        return yield* DenoCompile.compileExecutable({
          entrypoint: "main.ts",
          outfile,
          observation: "hashed",
        });
      }).pipe(
        Effect.provide(DenoCompile.layer({
          executable: executable as AbsolutePath,
          allowUntestedVersion: true,
        })),
        Effect.provide(NodeServices.layer),
      );
      const exit = await Effect.runPromiseExit(program);
      expect((failureOf(exit) as DenoCompile.CompileExecutableError)._tag).toBe("SelectedCommandChanged");
      expect(await absent(outfile)).toBe(true);
      expect(await absent(dirname(outfile))).toBe(true);
    } finally {
      await copyFile(fixture, executable);
      await chmod(executable, 0o755);
      delete process.env.FAKE_DENO_DIR;
      await rm(cacheDirectory(), { recursive: true, force: true });
    }
  });
});
