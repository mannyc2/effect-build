import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, FileSystem, PlatformError } from "effect";
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
import { isLockedRenameError } from "../../src/standalone/internal/AtomicOutput.js";
import type { CompilerAdapter } from "../../src/standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "../../src/standalone/internal/CompilerEngine.js";

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/publication/fake-compiler.mjs", import.meta.url));

// The suite runs on every advertised publication host. Windows cells validate a
// PE output because extensionless files carry no POSIX execute bit there.
const windowsHost = process.platform === "win32";
const hostTarget = windowsHost ? "windows-x64" as const : "macos-aarch64" as const;
const successMode = windowsHost ? "pe" : "success";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-publish-"));
  roots.push(root);
  return root;
};

const adapter = (mode = successMode): CompilerAdapter<Record<string, never>> => ({
  toolName: "bun",
  probeArgv: [],
  supportedTargets: ["macos-aarch64", "windows-x64"],
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
    const service = yield* makeCompilerService(adapter(mode), {
      name: "bun",
      version: "test",
      path: process.execPath,
    });
    return yield* service.compileExecutable({
      entrypoint: "unused.ts",
      outfile: join(root, "nested", "app"),
      target: hostTarget,
      digest,
    });
  }).pipe(Effect.provide(NodeServices.layer));

describe("standalone atomic publication", () => {
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
    const capturing: CompilerAdapter<Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, successMode];
      },
    };
    await Effect.runPromise(
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const service = yield* makeCompilerService(capturing, {
          name: "bun",
          version: "test",
          path: process.execPath,
        });
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
    const hanging: CompilerAdapter<Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => [fixture, stagedOutfile, "hang", sentinel],
    };
    const fiber = Effect.runFork(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(hanging, { name: "bun", version: "test", path: process.execPath });
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

  it("stages a windows target with .exe while publishing the exact requested outfile", async () => {
    const root = makeRoot();
    const outfile = join(root, "win-app");
    let staged = "";
    const windows: CompilerAdapter<Record<string, never>> = {
      ...adapter(),
      supportedTargets: ["windows-x64"],
      renderArgv: ({ stagedOutfile }) => {
        staged = stagedOutfile;
        return [fixture, stagedOutfile, "pe"];
      },
    };
    const artifact = await Effect.runPromise(
      Effect.gen(function*() {
        const service = yield* makeCompilerService(windows, { name: "bun", version: "test", path: process.execPath });
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

  it("rejects a requested target that disagrees with the native output", async () => {
    const root = makeRoot();
    const outfile = join(root, "nested", "app");
    mkdirSync(join(root, "nested"));
    writeFileSync(outfile, "old", { flush: true });
    const wide: CompilerAdapter<Record<string, never>> = {
      ...adapter(),
      supportedTargets: ["macos-x64", "macos-aarch64"],
    };
    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(wide, { name: "bun", version: "test", path: process.execPath });
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
    const counting: CompilerAdapter<Record<string, never>> = {
      ...adapter(),
      renderArgv: ({ stagedOutfile }) => {
        rendered += 1;
        return [fixture, stagedOutfile, successMode];
      },
    };
    await expect(
      Effect.runPromise(
        Effect.gen(function*() {
          const service = yield* makeCompilerService(counting, {
            name: "bun",
            version: "test",
            path: process.execPath,
          });
          return yield* service.compileExecutable({
            entrypoint: "unused.ts",
            outfile: join(root, "nested", "app"),
            target: "linux-x64-gnu",
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
