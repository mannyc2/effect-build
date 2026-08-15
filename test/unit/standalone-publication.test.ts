import { NodeServices } from "@effect/platform-node";
import { Cause, Crypto, Effect, Exit, Fiber, FileSystem, Latch, Path, PlatformError, Result, Stream } from "effect";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ToolFailed } from "../../packages/effect-build/src/standalone/BuildError.js";
import type { CommandCompilerAdapter } from "../../packages/effect-build/src/standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "../../packages/effect-build/src/standalone/internal/CompilerEngine.js";
import {
  acquireExecutableCandidate,
  type ExecutableCandidate,
  isLockedRenameError,
  validateAndPublishExecutable,
} from "../../packages/effect-build/src/standalone/internal/ExecutableLifecycle.js";
import { makeTargetTable } from "../../packages/effect-build/src/standalone/internal/TargetTable.js";

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/publication/fake-compiler.mjs", import.meta.url));

// The suite runs on every advertised publication host. Windows cells validate a
// PE output because extensionless files carry no POSIX execute bit there.
const windowsHost = process.platform === "win32";
const hostTarget = windowsHost ? "windows-x64" as const : "macos-aarch64" as const;
const successMode = windowsHost ? "pe" : "success";

const fat64 = (byteOrder: "big" | "little"): Uint8Array => {
  const bytes = new Uint8Array(40);
  bytes.set(byteOrder === "big" ? [0xca, 0xfe, 0xba, 0xbf] : [0xbf, 0xba, 0xfe, 0xca], 0);
  new DataView(bytes.buffer).setUint32(4, 1, byteOrder === "little");
  return bytes;
};

const unsafeElfProgramHeaderOffset = (): Uint8Array => {
  const bytes = new Uint8Array(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  bytes.set([0x3e, 0x00], 18);
  new DataView(bytes.buffer).setBigUint64(32, BigInt(Number.MAX_SAFE_INTEGER) + 1n, true);
  new DataView(bytes.buffer).setUint16(54, 56, true);
  new DataView(bytes.buffer).setUint16(56, 1, true);
  return bytes;
};

const malformedPublicationCases = [
  {
    name: "big-endian FAT64",
    bytes: fat64("big"),
    reason: "unsupported-fat64",
    preserveOldDestination: false,
  },
  {
    name: "byte-swapped FAT64",
    bytes: fat64("little"),
    reason: "unsupported-fat64",
    preserveOldDestination: true,
  },
  {
    name: "unsafe ELF program-header offset",
    bytes: unsafeElfProgramHeaderOffset(),
    reason: "header-offset-overflow",
    preserveOldDestination: true,
  },
] as const;

const targetTable = makeTargetTable(
  [
    ["macos-aarch64", "test-macos-aarch64"],
    ["windows-x64", "test-windows-x64"],
  ] as const,
);
type TestTarget = typeof targetTable.Target.Type;
type BunStages = readonly [{
  readonly operation: "compile-executable";
  readonly tool: { readonly name: "bun"; readonly version: string; readonly path: string };
}];

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

const discoveredCompiler = () => ({
  artifactTool: { name: "bun" as const, version: "test", path: process.execPath },
});

const platformFailure = () =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "test",
    method: "stream",
    cause: new Error("controlled platform failure"),
  });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-publish-"));
  roots.push(root);
  return root;
};

const pathWithSeparator = (path: Path.Path, sep: "/" | "\\"): Path.Path => ({ ...path, sep });

const adapter = (mode = successMode): CommandCompilerAdapter<
  "bun",
  TestTarget,
  BunStages,
  Record<string, never>
> => ({
  toolName: "bun",
  targetTable,
  validateOptions: () => ({ _tag: "Valid", value: {} }),
  renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, mode],
  interpretFailure: (completion) =>
    new ToolFailed({
      tool: "bun",
      exitCode: completion.exitCode,
      diagnostics: [
        { channel: "stdout", ...completion.stdout },
        { channel: "stderr", ...completion.stderr },
      ],
    }),
  decodeStages: (input) =>
    Array.isArray(input)
      && input.length === 1
      && typeof input[0] === "object"
      && input[0] !== null
      && "tool" in input[0]
      && typeof input[0].tool === "object"
      && input[0].tool !== null
      && "name" in input[0].tool
      && input[0].tool.name === "bun"
      ? Result.succeed(input as unknown as BunStages)
      : Result.fail(new ToolFailed({ tool: "bun", exitCode: 1, diagnostics: [] })),
});

const compile = (root: string, mode = successMode, digest = true) =>
  Effect.gen(function*() {
    const service = yield* makeCompilerService(adapter(mode), discoveredCompiler());
    return yield* service.compileExecutable({
      entrypoint: "unused.ts",
      outfile: join(root, "nested", "app"),
      target: hostTarget,
      digest,
    });
  }).pipe(Effect.provide(NodeServices.layer));

const compileWithFileSystem = (root: string, fileSystem: FileSystem.FileSystem) =>
  Effect.gen(function*() {
    const service = yield* makeCompilerService(adapter(), discoveredCompiler());
    return yield* service.compileExecutable({
      entrypoint: "unused.ts",
      outfile: join(root, "nested", "app"),
      target: hostTarget,
      digest: true,
    });
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, fileSystem),
    Effect.provide(NodeServices.layer),
  );

const assertCandidateCapabilityIsStagedPathOnly = (candidate: ExecutableCandidate): void => {
  void candidate.staged;
  // @ts-expect-error Publication authority is not exposed on the candidate.
  void candidate.commit;
  // @ts-expect-error The final destination is retained only by lifecycle identity.
  void candidate.destination;
};
void assertCandidateCapabilityIsStagedPathOnly;

describe("standalone atomic publication", () => {
  it.each(malformedPublicationCases)(
    "maps $name to a typed finite publication failure without replacing destination bytes",
    async ({ bytes, reason, preserveOldDestination }) => {
      const root = makeRoot();
      const destination = join(root, "nested", "app");
      if (preserveOldDestination) {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, "old", { flush: true });
      }

      let staged = "";
      let targetResolutions = 0;
      const exit = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const fileSystem = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const crypto = yield* Crypto.Crypto;
            const candidate = yield* acquireExecutableCandidate(fileSystem, path, { destination });
            staged = candidate.staged;
            yield* fileSystem.writeFile(candidate.staged, bytes);
            yield* fileSystem.chmod(candidate.staged, 0o755);
            return yield* validateAndPublishExecutable(fileSystem, path, crypto, candidate, {
              digest: false,
              resolveTarget: () => {
                targetResolutions += 1;
                return Result.succeed(hostTarget);
              },
            }).pipe(Effect.exit);
          }),
        ).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(Exit.hasDies(exit)).toBe(false);
      const failure = failureOf(exit);
      expect(failure).toMatchObject({
        _tag: "OutputInvalid",
        path: staged,
      });
      expect(targetResolutions).toBe(0);
      if (preserveOldDestination) expect(readFileSync(destination, "utf8")).toBe("old");
      else expect(existsSync(destination)).toBe(false);
      expect(existsSync(dirname(staged))).toBe(false);
      expect(failure).toMatchObject({ reason });
    },
  );

  it("preserves interruption combined with a native-inspection read failure and cleans staging", async () => {
    const root = makeRoot();
    const destination = join(root, "nested", "app");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, "old", { flush: true });
    const interruptor = 31_031;
    const mixed = Cause.combine(Cause.fail(platformFailure()), Cause.interrupt(interruptor));
    let staged = "";

    const exit = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const hostFileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const crypto = yield* Crypto.Crypto;
          const fileSystem: FileSystem.FileSystem = {
            ...hostFileSystem,
            stream: () => Stream.failCause(mixed),
          };
          const candidate = yield* acquireExecutableCandidate(fileSystem, path, { destination });
          staged = candidate.staged;
          yield* fileSystem.writeFile(candidate.staged, new Uint8Array(64));
          yield* fileSystem.chmod(candidate.staged, 0o755);
          return yield* validateAndPublishExecutable(fileSystem, path, crypto, candidate, {
            digest: false,
            resolveTarget: () => Result.succeed(hostTarget),
          }).pipe(Effect.exit);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) throw new Error("expected native inspection to fail");
    expect([...Cause.interruptors(exit.cause)]).toContain(interruptor);
    expect(failureOf(exit)).toMatchObject({
      _tag: "OutputInvalid",
      path: staged,
      reason: "read-failed",
    });
    expect(readFileSync(destination, "utf8")).toBe("old");
    expect(existsSync(dirname(staged))).toBe(false);
  });

  it("publishes through the production bounded range reader for a sparse distant ELF", async () => {
    const root = makeRoot();
    const destination = join(root, "nested", "app");
    const programHeaderOffset = 2_000_000;
    const interpreterOffset = 3_000_000;
    const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
    const requests: Array<{ readonly offset: number; readonly length: number }> = [];
    let staged = "";

    const artifact = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const hostFileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const crypto = yield* Crypto.Crypto;
          const fileSystem: FileSystem.FileSystem = {
            ...hostFileSystem,
            stream: (file, options) => {
              requests.push({
                offset: Number(options?.offset ?? 0),
                length: Number(options?.bytesToRead ?? 0),
              });
              return hostFileSystem.stream(file, options);
            },
          };
          const candidate = yield* acquireExecutableCandidate(fileSystem, path, { destination });
          staged = candidate.staged;
          const header = new Uint8Array(64);
          header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
          const headerView = new DataView(header.buffer);
          headerView.setUint16(18, 62, true);
          headerView.setBigUint64(32, BigInt(programHeaderOffset), true);
          headerView.setUint16(54, 56, true);
          headerView.setUint16(56, 1, true);
          const programHeader = new Uint8Array(56);
          const programHeaderView = new DataView(programHeader.buffer);
          programHeaderView.setUint32(0, 3, true);
          programHeaderView.setBigUint64(8, BigInt(interpreterOffset), true);
          programHeaderView.setBigUint64(32, BigInt(interpreter.byteLength), true);
          const handle = openSync(candidate.staged, "w");
          try {
            writeSync(handle, header, 0, header.byteLength, 0);
            writeSync(handle, programHeader, 0, programHeader.byteLength, programHeaderOffset);
            writeSync(handle, interpreter, 0, interpreter.byteLength, interpreterOffset);
          } finally {
            closeSync(handle);
          }
          yield* fileSystem.chmod(candidate.staged, 0o755);
          return yield* validateAndPublishExecutable(fileSystem, path, crypto, candidate, {
            digest: false,
            resolveTarget: (observation) =>
              observation.format === "elf"
                && observation.os === "linux"
                && observation.architecture === "x64"
                && observation.abi === "gnu"
                ? Result.succeed("linux-x64-gnu" as const)
                : Result.fail("unexpected-observation"),
          });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(artifact).toMatchObject({ path: destination, target: "linux-x64-gnu" });
    expect(requests).toEqual([
      { offset: 0, length: 1024 * 1024 },
      { offset: programHeaderOffset, length: 56 },
      { offset: interpreterOffset, length: interpreter.byteLength },
    ]);
    expect(existsSync(destination)).toBe(true);
    expect(existsSync(dirname(staged))).toBe(false);
  });

  it("rejects forged and scope-closed candidates as defects before filesystem effects", async () => {
    const root = makeRoot();
    const hostFileSystem = await Effect.runPromise(
      FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
    );
    let fileEffects = 0;
    const countingFileSystem: FileSystem.FileSystem = {
      ...hostFileSystem,
      exists: (path) => {
        fileEffects += 1;
        return hostFileSystem.exists(path);
      },
      stat: (path) => {
        fileEffects += 1;
        return hostFileSystem.stat(path);
      },
      rename: (from, to) => {
        fileEffects += 1;
        return hostFileSystem.rename(from, to);
      },
    };
    const check = (candidate: ExecutableCandidate) =>
      Effect.gen(function*() {
        const path = yield* Path.Path;
        const crypto = yield* Crypto.Crypto;
        return yield* validateAndPublishExecutable(countingFileSystem, path, crypto, candidate, {
          digest: false,
          resolveTarget: () => Result.succeed(hostTarget),
        });
      }).pipe(Effect.provide(NodeServices.layer), Effect.exit);

    const forged = { staged: join(root, "forged") } as unknown as ExecutableCandidate;
    const forgedExit = await Effect.runPromise(check(forged));
    expect(Exit.hasDies(forgedExit)).toBe(true);
    expect(fileEffects).toBe(0);

    const stale = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const path = yield* Path.Path;
          return yield* acquireExecutableCandidate(hostFileSystem, path, {
            destination: join(root, "stale"),
          });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    const staleExit = await Effect.runPromise(check(stale));
    expect(Exit.hasDies(staleExit)).toBe(true);
    expect(fileEffects).toBe(0);
  });

  it("consumes executable candidate identity exactly once", async () => {
    const root = makeRoot();
    let fileEffects = 0;
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const crypto = yield* Crypto.Crypto;
          const countingFileSystem: FileSystem.FileSystem = {
            ...fileSystem,
            exists: (file) => {
              fileEffects += 1;
              return fileSystem.exists(file);
            },
            stat: (file) => {
              fileEffects += 1;
              return fileSystem.stat(file);
            },
            rename: (from, to) => {
              fileEffects += 1;
              return fileSystem.rename(from, to);
            },
          };
          const candidate = yield* acquireExecutableCandidate(countingFileSystem, path, {
            destination: join(root, "published"),
            executableSuffix: process.platform === "win32" ? ".exe" : "",
          });
          yield* fileSystem.writeFile(
            candidate.staged,
            new Uint8Array([
              0xcf,
              0xfa,
              0xed,
              0xfe,
              0x0c,
              0x00,
              0x00,
              0x01,
            ]),
          );
          yield* fileSystem.chmod(candidate.staged, 0o755);
          const first = yield* validateAndPublishExecutable(countingFileSystem, path, crypto, candidate, {
            digest: false,
            resolveTarget: () => Result.succeed("macos-aarch64" as const),
          });
          const effectsAfterFirst = fileEffects;
          const second = yield* validateAndPublishExecutable(countingFileSystem, path, crypto, candidate, {
            digest: false,
            resolveTarget: () => Result.succeed("macos-aarch64" as const),
          }).pipe(Effect.exit);
          return { first, second, effectsAfterFirst };
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(result.first.path).toBe(join(root, "published"));
    expect(Exit.hasDies(result.second)).toBe(true);
    expect(fileEffects).toBe(result.effectsAfterFirst);
  });

  it("uses host Path semantics for execute bits independently of the output target suffix", async () => {
    const root = makeRoot();
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const crypto = yield* Crypto.Crypto;

          const windowsHostCandidate = yield* acquireExecutableCandidate(
            fileSystem,
            pathWithSeparator(path, "\\"),
            { destination: join(root, "windows-host-linux-target") },
          );
          const elf = new Uint8Array(120);
          elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
          elf.set([0x3e, 0x00], 18);
          new DataView(elf.buffer).setBigUint64(32, 64n, true);
          new DataView(elf.buffer).setUint16(54, 56, true);
          new DataView(elf.buffer).setUint16(56, 1, true);
          yield* fileSystem.writeFile(windowsHostCandidate.staged, elf);
          const windowsHostArtifact = yield* validateAndPublishExecutable(
            fileSystem,
            pathWithSeparator(path, "\\"),
            crypto,
            windowsHostCandidate,
            {
              digest: false,
              resolveTarget: (observation) =>
                observation.format === "elf"
                  && observation.os === "linux"
                  && observation.architecture === "x64"
                  ? Result.succeed("linux-x64-gnu" as const)
                  : Result.fail("not-linux-x64"),
            },
          );

          const posixHostCandidate = yield* acquireExecutableCandidate(
            fileSystem,
            pathWithSeparator(path, "/"),
            { destination: join(root, "posix-host-windows-target"), executableSuffix: ".exe" },
          );
          const pe = new Uint8Array(72);
          pe.set([0x4d, 0x5a], 0);
          pe[60] = 64;
          pe.set([0x50, 0x45, 0x00, 0x00], 64);
          pe.set([0x64, 0x86], 68);
          yield* fileSystem.writeFile(posixHostCandidate.staged, pe);
          const posixHostExit = yield* validateAndPublishExecutable(
            fileSystem,
            pathWithSeparator(path, "/"),
            crypto,
            posixHostCandidate,
            {
              digest: false,
              resolveTarget: () => Result.succeed("windows-x64" as const),
            },
          ).pipe(Effect.exit);
          return { windowsHostArtifact, posixHostExit };
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(result.windowsHostArtifact.target).toBe("linux-x64-gnu");
    expect(failureOf(result.posixHostExit)).toMatchObject({
      _tag: "OutputInvalid",
      reason: "not-executable",
    });
  });

  it("recognizes normalized locks and Windows rename EPERM", () => {
    const platformError = (tag: PlatformError.SystemErrorTag, code?: string) =>
      PlatformError.systemError({
        _tag: tag,
        module: "FileSystem",
        method: "rename",
        ...(code === undefined ? {} : { cause: { code } }),
      });

    expect(isLockedRenameError(platformError("Busy"))).toBe(true);
    expect(isLockedRenameError(platformError("Unknown", "EPERM"))).toBe(true);
    expect(isLockedRenameError(platformError("Unknown", "ENOENT"))).toBe(false);
  });

  it("publishes a validated artifact and replaces old bytes atomically", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    const first = await Effect.runPromise(compile(root));
    const bytes = readFileSync(outfile);
    expect(first.path).toBe(outfile);
    expect(first.bytes).toBe(bytes.byteLength);
    expect(first.digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(first.target).toBe(hostTarget);

    writeFileSync(outfile, "old");
    const second = await Effect.runPromise(compile(root, successMode, false));
    expect(second.digest).toBeUndefined();
    expect(readFileSync(outfile)).toEqual(bytes);
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("preserves the old destination on tool failure or missing output", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    await expect(Effect.runPromise(compile(root, "fail"))).rejects.toMatchObject({ _tag: "ToolFailed" });
    expect(readFileSync(outfile, "utf8")).toBe("old");
    await expect(Effect.runPromise(compile(root, "missing"))).rejects.toMatchObject({ _tag: "OutputMissing" });
    expect(readFileSync(outfile, "utf8")).toBe("old");
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("uses the destination basename for the staged compiler path", async () => {
    const root = makeRoot();
    let staged = "";
    const capturing: CommandCompilerAdapter<"bun", TestTarget, BunStages, Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, successMode];
      },
    };
    await Effect.runPromise(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const service = yield* makeCompilerService(capturing, discoveredCompiler());
        const artifact = yield* service.compileExecutable({
          entrypoint: "unused.ts",
          outfile: join(root, "named-app"),
          target: hostTarget,
        });
        expect(yield* fs.exists(artifact.path)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(basename(staged)).toBe(windowsHost ? "named-app.exe" : "named-app");
  });

  it("preserves the destination and removes staging on interruption", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    const sentinel = join(root, "started");
    const hanging: CommandCompilerAdapter<"bun", TestTarget, BunStages, Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, "hang", sentinel],
    };
    const fiber = Effect.runFork(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(hanging, discoveredCompiler());
        return yield* service.compileExecutable({
          entrypoint: "unused.ts",
          outfile,
          target: hostTarget,
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    for (let index = 0; index < 200 && !existsSync(sentinel); index++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(existsSync(sentinel)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.interruptors(exit.cause).size > 0).toBe(true);
    expect(readFileSync(outfile, "utf8")).toBe("old");
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("keeps the old destination when interrupted before rename begins", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    const hostFileSystem = await Effect.runPromise(
      FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
    );
    const renameEntered = Latch.makeUnsafe();
    const permitRename = Latch.makeUnsafe();
    const barrierFileSystem: FileSystem.FileSystem = {
      ...hostFileSystem,
      rename: (from, to) =>
        Effect.gen(function*() {
          yield* renameEntered.open;
          yield* permitRename.await;
          yield* hostFileSystem.rename(from, to);
        }),
    };
    const fiber = Effect.runFork(compileWithFileSystem(root, barrierFileSystem));
    await Effect.runPromise(renameEntered.await);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));

    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(readFileSync(outfile, "utf8")).toBe("old");
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("allows publication to remain linearized when interruption is observed after rename", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    const hostFileSystem = await Effect.runPromise(
      FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
    );
    const renameLinearized = Latch.makeUnsafe();
    const permitRenameCallback = Latch.makeUnsafe();
    const barrierFileSystem: FileSystem.FileSystem = {
      ...hostFileSystem,
      rename: (from, to) =>
        Effect.gen(function*() {
          yield* hostFileSystem.rename(from, to);
          yield* renameLinearized.open;
          yield* permitRenameCallback.await;
        }),
    };
    const fiber = Effect.runFork(compileWithFileSystem(root, barrierFileSystem));
    await Effect.runPromise(renameLinearized.await);
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));

    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(readFileSync(outfile, "utf8")).not.toBe("old");
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("stages a windows target with .exe while publishing the exact requested outfile", async () => {
    const root = makeRoot();
    const outfile = join(root, "win-app");
    let staged = "";
    const windowsTargetTable = makeTargetTable([["windows-x64", "test-windows-x64"]] as const);
    const windows: CommandCompilerAdapter<
      "bun",
      typeof windowsTargetTable.Target.Type,
      BunStages,
      Record<string, never>
    > = {
      toolName: "bun",
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, "pe"];
      },
      interpretFailure: adapter().interpretFailure,
      decodeStages: adapter().decodeStages,
    };
    const artifact = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(windows, discoveredCompiler());
        return yield* service.compileExecutable({
          entrypoint: "unused.ts",
          outfile,
          target: "windows-x64",
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(basename(staged)).toBe("win-app.exe");
    expect(artifact.path).toBe(outfile);
    expect(artifact.target).toBe("windows-x64");
    expect(existsSync(outfile)).toBe(true);
    expect(existsSync(`${outfile}.exe`)).toBe(false);
  });

  it("uses the host Path separator for omitted-target Windows staging without leaking it", async () => {
    const root = makeRoot();
    const outfile = join(root, "host-win-app");
    let staged = "";
    const windowsTargetTable = makeTargetTable([["windows-x64", "test-windows-x64"]] as const);
    const windows: CommandCompilerAdapter<
      "bun",
      typeof windowsTargetTable.Target.Type,
      BunStages,
      Record<string, never>
    > = {
      toolName: "bun",
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, "pe"];
      },
      interpretFailure: adapter().interpretFailure,
      decodeStages: adapter().decodeStages,
    };
    const hostPath = await Effect.runPromise(Path.Path.pipe(Effect.provide(NodeServices.layer)));
    const artifact = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(windows, discoveredCompiler());
        return yield* service.compileExecutable({ entrypoint: "unused.ts", outfile });
      }).pipe(
        Effect.provideService(Path.Path, pathWithSeparator(hostPath, "\\")),
        Effect.provide(NodeServices.layer),
      ),
    );

    expect(basename(staged)).toBe("host-win-app.exe");
    expect(artifact.path).toBe(outfile);
    expect(artifact.target).toBe("windows-x64");
    expect(artifact.provider).toBe("bun");
    expect(Object.keys(artifact.stages[0].tool).sort()).toEqual(["name", "path", "version"]);
    expect(existsSync(outfile)).toBe(true);
    expect(existsSync(`${outfile}.exe`)).toBe(false);
  });

  it("rejects an observed canonical target outside the selected provider table", async () => {
    const root = makeRoot();
    const outfile = join(root, "outside-provider");
    const windowsTargetTable = makeTargetTable([["windows-x64", "test-windows-x64"]] as const);
    const windowsOnly: CommandCompilerAdapter<
      "bun",
      typeof windowsTargetTable.Target.Type,
      BunStages,
      Record<string, never>
    > = {
      toolName: "bun",
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, "success"],
      interpretFailure: adapter().interpretFailure,
      decodeStages: adapter().decodeStages,
    };

    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(windowsOnly, discoveredCompiler());
          return yield* service.compileExecutable({ entrypoint: "unused.ts", outfile });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ).rejects.toMatchObject({
      _tag: "OutputInvalid",
      reason: expect.stringContaining("unsupported by the selected compiler"),
    });
    expect(existsSync(outfile)).toBe(false);
    expect(existsSync(`${outfile}.exe`)).toBe(false);
  });

  it("rejects a requested target that disagrees with the native output", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    const wideTargetTable = makeTargetTable(
      [
        ["macos-x64", "test-macos-x64"],
        ["macos-aarch64", "test-macos-aarch64"],
      ] as const,
    );
    const wide: CommandCompilerAdapter<
      "bun",
      typeof wideTargetTable.Target.Type,
      BunStages,
      Record<string, never>
    > = {
      toolName: "bun",
      targetTable: wideTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, successMode],
      interpretFailure: adapter().interpretFailure,
      decodeStages: adapter().decodeStages,
    };
    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(wide, discoveredCompiler());
          return yield* service.compileExecutable({
            entrypoint: "unused.ts",
            outfile,
            target: "macos-x64",
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ).rejects.toMatchObject({ _tag: "OutputInvalid" });
    expect(readFileSync(outfile, "utf8")).toBe("old");
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("rejects an unsupported target before rendering or spawning", async () => {
    const root = makeRoot();
    let rendered = 0;
    const counting: CommandCompilerAdapter<"bun", TestTarget, BunStages, Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => {
        rendered += 1;
        return [fixture, stagedOutfile, successMode];
      },
    };
    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(counting, discoveredCompiler());
          return yield* service.compileExecutable({
            entrypoint: "unused.ts",
            outfile: join(root, "nested", "app"),
            target: "linux-x64-gnu" as never,
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ).rejects.toMatchObject({
      _tag: "TargetUnsupported",
      requested: "linux-x64-gnu",
      available: ["macos-aarch64", "windows-x64"],
    });
    expect(rendered).toBe(0);
    expect(existsSync(join(root, "nested"))).toBe(false);
  });

  it("keeps concurrent staging directories unique for one destination", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    const [first, second] = await Effect.runPromise(
      Effect.all([compile(root), compile(root)], { concurrency: 2 }),
    );
    expect(first.path).toBe(outfile);
    expect(second.path).toBe(outfile);
    expect(existsSync(outfile)).toBe(true);
    expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it.runIf(process.platform === "win32")(
    "preserves a Windows destination that is locked by another handle",
    async () => {
      const root = makeRoot();
      const outfile = join(root, "nested", "app");
      mkdirSync(join(root, "nested"));
      writeFileSync(outfile, "old", { flush: true });
      const handle = openSync(outfile, "r");
      try {
        await expect(Effect.runPromise(compile(root))).rejects.toMatchObject({ _tag: "OutputLocked", path: outfile });
      } finally {
        closeSync(handle);
      }
      expect(readFileSync(outfile, "utf8")).toBe("old");
      expect(readdirSync(join(root, "nested")).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
    },
  );
});
