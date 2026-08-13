import { NodeServices } from "@effect/platform-node";
import { Cause, Crypto, Effect, Exit, Fiber, FileSystem, Latch, Path, PlatformError, Result } from "effect";
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
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ToolFailed } from "../../src/standalone/BuildError.js";
import type { CompilerAdapter } from "../../src/standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "../../src/standalone/internal/CompilerEngine.js";
import {
  acquireExecutableCandidate,
  type ExecutableCandidate,
  isLockedRenameError,
  validateAndPublishExecutable,
} from "../../src/standalone/internal/ExecutableLifecycle.js";
import type { OperatingSystem } from "../../src/standalone/internal/TargetCatalog.js";
import { makeTargetTable } from "../../src/standalone/internal/TargetTable.js";

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/publication/fake-compiler.mjs", import.meta.url));

// The suite runs on every advertised publication host. Windows cells validate a
// PE output because extensionless files carry no POSIX execute bit there.
const windowsHost = process.platform === "win32";
const hostTarget = windowsHost ? "windows-x64" as const : "macos-aarch64" as const;
const successMode = windowsHost ? "pe" : "success";

const targetTable = makeTargetTable(
  {
    "macos-aarch64": "test-macos-aarch64",
    "windows-x64": "test-windows-x64",
  } as const,
);
type TestTarget = typeof targetTable.Target.Type;

const discoveredCompiler = (hostOs: OperatingSystem = windowsHost ? "windows" : "macos") => ({
  artifactTool: { name: "bun" as const, version: "test", path: process.execPath },
  hostOs,
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-publish-"));
  roots.push(root);
  return root;
};

const adapter = (mode = successMode): CompilerAdapter<Record<string, never>, "bun", TestTarget> => ({
  toolName: "bun",
  probeArgv: [],
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
        const crypto = yield* Crypto.Crypto;
        return yield* validateAndPublishExecutable(countingFileSystem, crypto, candidate, {
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
          const first = yield* validateAndPublishExecutable(countingFileSystem, crypto, candidate, {
            digest: false,
            resolveTarget: () => Result.succeed("macos-aarch64" as const),
          });
          const effectsAfterFirst = fileEffects;
          const second = yield* validateAndPublishExecutable(countingFileSystem, crypto, candidate, {
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
    const capturing: CompilerAdapter<Record<string, never>, "bun", TestTarget> = {
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
    const hanging: CompilerAdapter<Record<string, never>, "bun", TestTarget> = {
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
    const windowsTargetTable = makeTargetTable({ "windows-x64": "test-windows-x64" } as const);
    const windows: CompilerAdapter<
      Record<string, never>,
      "bun",
      typeof windowsTargetTable.Target.Type
    > = {
      toolName: "bun",
      probeArgv: [],
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, "pe"];
      },
      interpretFailure: adapter().interpretFailure,
    };
    const artifact = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(windows, discoveredCompiler("windows"));
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

  it("uses the compiler host OS for omitted-target Windows staging without leaking it", async () => {
    const root = makeRoot();
    const outfile = join(root, "host-win-app");
    let staged = "";
    const windowsTargetTable = makeTargetTable({ "windows-x64": "test-windows-x64" } as const);
    const windows: CompilerAdapter<
      Record<string, never>,
      "bun",
      typeof windowsTargetTable.Target.Type
    > = {
      toolName: "bun",
      probeArgv: [],
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, "pe"];
      },
      interpretFailure: adapter().interpretFailure,
    };
    const artifact = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(windows, discoveredCompiler("windows"));
        return yield* service.compileExecutable({ entrypoint: "unused.ts", outfile });
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(basename(staged)).toBe("host-win-app.exe");
    expect(artifact.path).toBe(outfile);
    expect(artifact.target).toBe("windows-x64");
    expect(Object.keys(artifact.tool).sort()).toEqual(["name", "path", "version"]);
    expect(Object.hasOwn(artifact.tool, "hostOs")).toBe(false);
    expect(existsSync(outfile)).toBe(true);
    expect(existsSync(`${outfile}.exe`)).toBe(false);
  });

  it("rejects an observed canonical target outside the selected provider table", async () => {
    const root = makeRoot();
    const outfile = join(root, "outside-provider");
    const windowsTargetTable = makeTargetTable({ "windows-x64": "test-windows-x64" } as const);
    const windowsOnly: CompilerAdapter<
      Record<string, never>,
      "bun",
      typeof windowsTargetTable.Target.Type
    > = {
      toolName: "bun",
      probeArgv: [],
      targetTable: windowsTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, "success"],
      interpretFailure: adapter().interpretFailure,
    };

    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(windowsOnly, discoveredCompiler("windows"));
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
      {
        "macos-x64": "test-macos-x64",
        "macos-aarch64": "test-macos-aarch64",
      } as const,
    );
    const wide: CompilerAdapter<Record<string, never>, "bun", typeof wideTargetTable.Target.Type> = {
      toolName: "bun",
      probeArgv: [],
      targetTable: wideTargetTable,
      validateOptions: () => ({ _tag: "Valid", value: {} }),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, successMode],
      interpretFailure: adapter().interpretFailure,
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
    const counting: CompilerAdapter<Record<string, never>, "bun", TestTarget> = {
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
