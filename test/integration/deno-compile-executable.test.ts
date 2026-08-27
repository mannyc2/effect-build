import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile, execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Compile from "../../packages/effect-build-deno/src/Command/CompileExecutable.js";
import * as CompileWatch from "../../packages/effect-build-deno/src/Command/CompileWatch.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

const execute = promisify(execFile);
const selectedDeno = process.env.EFFECT_BUILD_DENO ?? "/opt/homebrew/bin/deno";
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
const capabilityEntrypoint = fileURLToPath(new URL("../fixtures/app/deno-bundle-capability.ts", import.meta.url));
const executablePath = (name: string): string => join(root, process.platform === "win32" ? `${name}.exe` : name);

const exactDenoAvailable = (): boolean => {
  try {
    return /^deno 2\.9\.5\b/u.test(execFileSync(selectedDeno, ["--version"], { encoding: "utf8" }));
  } catch {
    return false;
  }
};

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
      await new Promise((resolveTick) => setTimeout(resolveTick, 25));
    }
  }
};

const hostTarget = (): Compile.Target => {
  if (process.platform === "darwin") return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }
  return process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
};

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-real-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | Runtime.Runtime
    | import("effect").FileSystem.FileSystem
    | import("effect").Path.Path
    | import("effect").Crypto.Crypto
  >,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: selectedDeno as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

describe.skipIf(!exactDenoAvailable())("real Deno 2.9.5 compileExecutable", () => {
  it("compiles, authenticates, atomically publishes, hashes, and executes the host artifact", async () => {
    const outfile = executablePath("app");
    const artifact = await run(Compile.compileExecutable({
      entrypoint,
      outfile,
      target: hostTarget(),
      observation: "hashed",
    }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      provider: "deno",
      bytes: `${bytes.byteLength}`,
      denoTarget: hostTarget(),
      runtime: { name: "deno", version: "2.9.5" },
      publication: { commit: "same-parent-rename", committed: true },
      runtimeAcquisition: {
        _tag: "ProviderManagedDenort",
        evidenceGate: "cold-warm-corrupt-offline-target-relation-open",
      },
    });
    expect(await realpath(artifact.path)).toBe(await realpath(outfile));
    expect(artifact.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect((await execute(artifact.path, [])).stdout).toBe("effect-build-ok\n");
    await observeProviderNativeEvidence("CAN-DENO-010", "D08.1");
  }, 300_000);

  it("executes compile watch under Scope and interrupts the real provider child", async () => {
    const outfile = executablePath("watched-app");
    const watchExit = await run(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function*() {
              const watch = yield* CompileWatch.watch({
                entrypoint,
                outfile,
                target: hostTarget(),
                noRemote: true,
                noClearScreen: true,
              });
              expect(watch).toMatchObject({
                _tag: "CompileWatch",
                destination: outfile,
                stability: "experimental",
                publication: "provider-direct-durable",
              });
              expect(yield* watch.process.isRunning).toBe(true);
              return yield* Effect.never;
            }),
          ),
        );
        yield* Effect.promise(() => waitForFile(outfile)).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
        return yield* Fiber.await(fiber);
      }),
    );
    expect(Exit.isFailure(watchExit)).toBe(true);
    if (Exit.isFailure(watchExit)) expect(Cause.hasInterrupts(watchExit.cause)).toBe(true);
    await expect(access(outfile)).resolves.toBeUndefined();
    await observeProviderNativeEvidence("CAN-DENO-011");
  }, 300_000);

  it("records the pinned compiled-runtime Deno.bundle capability as unavailable", async () => {
    const artifact = await run(Compile.compileExecutable({
      entrypoint: capabilityEntrypoint,
      outfile: executablePath("compiled-runtime-capability"),
      target: hostTarget(),
      observation: "unhashed",
    }));
    expect((await execute(artifact.path, [])).stdout).toBe("undefined\n");
  }, 300_000);

  it("preserves native diagnostics as the provider-local typed failure", async () => {
    await expect(run(Compile.compileExecutable({
      entrypoint: join(root, "missing.ts"),
      outfile: join(root, "failure"),
      target: hostTarget(),
      observation: "unhashed",
    }))).rejects.toMatchObject({ _tag: "DenoCommandFailed", operation: "compileExecutable" });
  }, 300_000);
});
