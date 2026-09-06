import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, FileSystem } from "effect";
import * as NativeExecutable from "effect-build/Author/NativeExecutable";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as BunExecutable from "../../packages/effect-build-bun/src/internal/Executable.js";
import * as DenoExecutable from "../../packages/effect-build-deno/src/internal/Executable.js";
import type { AbsolutePath } from "../../packages/effect-build/src/Artifact.js";
import type { SystemTarget } from "../../packages/effect-build/src/SystemTarget.js";

type Provider = "bun" | "deno";

const elf = (interpreter?: string, machine = 62): Uint8Array => {
  const encoded = interpreter === undefined ? undefined : new TextEncoder().encode(`${interpreter}\0`);
  const bytes = new Uint8Array(120 + (encoded?.byteLength ?? 0));
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, machine, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, 1, true);
  view.setUint32(64, encoded === undefined ? 1 : 3, true);
  if (encoded !== undefined) {
    view.setBigUint64(72, 120n, true);
    view.setBigUint64(96, BigInt(encoded.byteLength), true);
    bytes.set(encoded, 120);
  }
  return bytes;
};

const fatMacho = (slice: "valid" | "invalid-magic" | "invalid-cpu"): Uint8Array => {
  const cpu = 0x01000007;
  const offset = 32;
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  bytes.set([0xca, 0xfe, 0xba, 0xbe], 0);
  view.setUint32(4, 1, false);
  view.setUint32(8, cpu, false);
  view.setUint32(16, offset, false);
  view.setUint32(20, 16, false);
  bytes.set(slice === "invalid-magic" ? [0, 0, 0, 0] : [0xcf, 0xfa, 0xed, 0xfe], offset);
  view.setUint32(offset + 4, slice === "invalid-cpu" ? 0x0100000c : cpu, true);
  return bytes;
};

const inspect = (provider: Provider, path: AbsolutePath, target: SystemTarget) =>
  provider === "bun"
    ? BunExecutable.inspect(path, "bun", "1.3.14", target)
    : DenoExecutable.inspect(path, "2.9.5", target);

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) throw new Error("expected native inspection failure");
  const failure = Cause.findErrorOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "None") throw new Error("expected typed native inspection failure");
  return failure.value;
};

const thinMacho = (cpu: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe]);
  new DataView(bytes.buffer).setUint32(4, cpu, true);
  return bytes;
};

const pe = (machine: number): Uint8Array => {
  const bytes = new Uint8Array(70);
  bytes.set([0x4d, 0x5a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(60, 64, true);
  bytes.set([0x50, 0x45], 64);
  view.setUint16(68, machine, true);
  return bytes;
};

const changed = (source: Uint8Array, update: (view: DataView) => void): Uint8Array => {
  const bytes = Uint8Array.from(source);
  update(new DataView(bytes.buffer));
  return bytes;
};

const twoSliceMacho = (overlap: boolean): Uint8Array => {
  const bytes = new Uint8Array(80);
  bytes.set([0xca, 0xfe, 0xba, 0xbe]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, false);
  for (const [entry, cpu, offset] of [[8, 0x01000007, 48], [28, 0x0100000c, overlap ? 56 : 64]]) {
    view.setUint32(entry!, cpu!, false);
    view.setUint32(entry! + 8, offset!, false);
    view.setUint32(entry! + 12, 16, false);
    bytes.set(thinMacho(cpu!), offset!);
  }
  return bytes;
};

const duplicateInterpreter = (): Uint8Array => {
  const bytes = new Uint8Array(200);
  bytes.set(elf("/lib/ld-linux.so.2"));
  const view = new DataView(bytes.buffer);
  view.setUint16(56, 2, true);
  view.setBigUint64(72, 180n, true);
  view.setBigUint64(96, 8n, true);
  view.setUint32(120, 3, true);
  return bytes;
};

describe("public native executable header observation", () => {
  it.each(
    [
      ["ELF GNU x64", elf("/lib64/ld-linux-x86-64.so.2"), {
        nativeFormat: "elf",
        os: "linux",
        architecture: "x64",
        abi: "gnu",
      }],
      ["ELF musl aarch64", elf("/lib/ld-musl-aarch64.so.1", 183), {
        nativeFormat: "elf",
        os: "linux",
        architecture: "aarch64",
        abi: "musl",
      }],
      ["thin Mach-O x64", thinMacho(0x01000007), { nativeFormat: "mach-o", os: "macos", architecture: "x64" }],
      ["thin Mach-O aarch64", thinMacho(0x0100000c), { nativeFormat: "mach-o", os: "macos", architecture: "aarch64" }],
      ["fat Mach-O", fatMacho("valid"), { nativeFormat: "mach-o", os: "macos", architecture: "x64" }],
      ["PE x64", pe(0x8664), { nativeFormat: "pe", os: "windows", architecture: "x64" }],
      ["PE aarch64", pe(0xaa64), { nativeFormat: "pe", os: "windows", architecture: "aarch64" }],
    ] as const,
  )("parses %s without attaching runtime or requested target facts", async (_name, bytes, expected) => {
    const observation = await Effect.runPromise(NativeExecutable.parse(bytes));
    expect(observation).toEqual(expected);
    expect(Object.isFrozen(observation)).toBe(true);
  });

  it.each([undefined, "/lib64/ld-unknown-x86-64.so.1"])(
    "leaves unavailable ELF ABI unknown (%s)",
    async (interpreter) => {
      const observation = await Effect.runPromise(NativeExecutable.parse(elf(interpreter)));
      expect(observation).toEqual({ nativeFormat: "elf", os: "linux", architecture: "x64" });
    },
  );

  it.each(
    [
      ["truncated-header", new Uint8Array(3)],
      ["invalid-native-magic", new Uint8Array(4)],
      ["invalid-elf-header", changed(elf(), (view) => view.setUint8(4, 0))],
      ["unsupported-machine", elf(undefined, 0)],
      ["invalid-program-headers", changed(elf(), (view) => view.setUint16(56, 0, true))],
      ["header-offset-overflow", changed(elf(), (view) => view.setBigUint64(32, 0xffff_ffff_ffff_ffffn, true))],
      ["invalid-interpreter", changed(elf("/lib/ld-linux.so.2"), (view) => view.setBigUint64(96, 0n, true))],
      ["multiple-elf-interpreters", duplicateInterpreter()],
      ["unsupported-fat64", Uint8Array.of(0xca, 0xfe, 0xba, 0xbf, 0, 0, 0, 1)],
      ["invalid-fat-header", changed(fatMacho("valid"), (view) => view.setUint32(4, 0, false))],
      ["invalid-fat-slice-range", changed(fatMacho("valid"), (view) => view.setUint32(16, 16, false))],
      ["overlapping-fat-slices", twoSliceMacho(true)],
      ["ambiguous-fat-architecture", twoSliceMacho(false)],
      ["invalid-fat-slice", fatMacho("invalid-magic")],
      ["invalid-fat-slice", fatMacho("invalid-cpu")],
      ["invalid-pe-signature", changed(pe(0x8664), (view) => view.setUint8(64, 0))],
    ] as const,
  )("reports the finite parse reason %s", async (reason, bytes) => {
    const failure = errorOf(await Effect.runPromiseExit(NativeExecutable.parse(bytes)));
    expect(failure).toBeInstanceOf(NativeExecutable.NativeExecutableParseFailed);
    expect(failure.reason).toBe(reason);
  });

  it("observes a regular executable path and maps read failures without changing their reason", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-native-observe-"));
    try {
      const path = join(root, "app") as AbsolutePath;
      const missing = join(root, "missing") as AbsolutePath;
      await writeFile(path, thinMacho(0x01000007));
      await chmod(path, 0o755);
      const result = await Effect.runPromise(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const observed = yield* NativeExecutable.observe(path);
          const unreadable = yield* Effect.exit(
            NativeExecutable.observe(path).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fileSystem,
                readFile: () => fileSystem.readFile(missing),
              }),
            ),
          );
          const changedSize = yield* Effect.exit(
            NativeExecutable.observe(path).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fileSystem,
                readFile: () => Effect.succeed(new Uint8Array(1)),
              }),
            ),
          );
          const absent = yield* Effect.exit(NativeExecutable.observe(missing));
          const directory = yield* Effect.exit(NativeExecutable.observe(root as AbsolutePath));
          return { observed, unreadable, changedSize, absent, directory };
        }).pipe(Effect.provide(NodeServices.layer)),
      );
      expect(result.observed).toEqual({ nativeFormat: "mach-o", os: "macos", architecture: "x64" });
      for (
        const [exit, reason, failedPath] of [
          [result.unreadable, "unable-to-read", path],
          [result.changedSize, "size-changed-during-read", path],
          [result.absent, "unable-to-stat", missing],
          [result.directory, "not-regular-file", root],
        ] as const
      ) {
        expect(errorOf(exit)).toMatchObject({ _tag: "NativeExecutableObservationFailed", reason, path: failedPath });
      }
      if (process.platform !== "win32") {
        await chmod(path, 0o644);
        const exit = await Effect.runPromiseExit(
          NativeExecutable.observe(path).pipe(Effect.provide(NodeServices.layer)),
        );
        expect(errorOf(exit)).toMatchObject({
          _tag: "NativeExecutableObservationFailed",
          reason: "not-executable",
          path,
        });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Bun and Deno native executable inspection", () => {
  for (const provider of ["bun", "deno"] as const) {
    it(`${provider} retains its error mapping for malformed native bytes`, async () => {
      const root = await mkdtemp(join(tmpdir(), `effect-build-${provider}-malformed-`));
      try {
        const path = join(root, "app") as AbsolutePath;
        await writeFile(path, fatMacho("invalid-magic"));
        await chmod(path, 0o755);
        const exit = await Effect.runPromiseExit(
          inspect(provider, path, "macos-x64").pipe(Effect.provide(NodeServices.layer)),
        );
        expect(errorOf(exit)).toMatchObject({
          _tag: "NativeExecutableInspectionFailed",
          reason: "invalid-fat-slice",
          path,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it(`${provider} rejects Linux artifacts whose ABI is absent or unknown`, async () => {
      const root = await mkdtemp(join(tmpdir(), `effect-build-${provider}-abi-`));
      try {
        for (
          const [name, interpreter] of [
            ["static", undefined],
            ["unknown", "/lib64/ld-unknown-x86-64.so.1"],
          ] as const
        ) {
          const path = join(root, name) as AbsolutePath;
          await writeFile(path, elf(interpreter));
          await chmod(path, 0o755);
          const exit = await Effect.runPromiseExit(
            inspect(provider, path, "linux-x64-gnu").pipe(Effect.provide(NodeServices.layer)),
          );
          expect(errorOf(exit)).toMatchObject({
            _tag: "NativeExecutableInspectionFailed",
            reason: "native-target-does-not-match-request",
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it(`${provider} requires the observed Linux ABI to equal the requested ABI`, async () => {
      const root = await mkdtemp(join(tmpdir(), `effect-build-${provider}-abi-`));
      try {
        for (
          const [name, interpreter, target] of [
            ["gnu", "/lib64/ld-linux-x86-64.so.2", "linux-x64-gnu"],
            ["musl", "/lib/ld-musl-x86_64.so.1", "linux-x64-musl"],
          ] as const
        ) {
          const path = join(root, name) as AbsolutePath;
          await writeFile(path, elf(interpreter));
          await chmod(path, 0o755);
          const matching = await Effect.runPromiseExit(
            inspect(provider, path, target).pipe(Effect.provide(NodeServices.layer)),
          );
          expect(Exit.isSuccess(matching)).toBe(true);
          if (Exit.isSuccess(matching)) {
            expect(matching.value).toEqual({
              nativeFormat: "elf",
              target,
              runtime: { name: provider, version: provider === "bun" ? "1.3.14" : "2.9.5" },
            });
          }

          const mismatched = await Effect.runPromiseExit(
            inspect(
              provider,
              path,
              target === "linux-x64-gnu" ? "linux-x64-musl" : "linux-x64-gnu",
            ).pipe(Effect.provide(NodeServices.layer)),
          );
          expect(errorOf(mismatched)).toMatchObject({
            _tag: "NativeExecutableInspectionFailed",
            reason: "native-target-does-not-match-request",
          });
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
