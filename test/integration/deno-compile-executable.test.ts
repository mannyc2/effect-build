import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Compile from "../../packages/effect-build-deno/src/Command/CompileExecutable.js";
import * as CompileWatch from "../../packages/effect-build-deno/src/Command/CompileWatch.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";
import { selectToolFixture } from "./helpers/exact-tool.js";

const execute = promisify(execFile);
const fixture = selectToolFixture("deno");
const selectedDeno = fixture.executable;
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));
const capabilityEntrypoint = fileURLToPath(new URL("../fixtures/app/deno-bundle-capability.ts", import.meta.url));
const executablePath = (name: string): string => join(root, process.platform === "win32" ? `${name}.exe` : name);

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

describe.skipIf(!fixture.supports("compileExecutable"))(`real Deno ${fixture.version} compileExecutable`, () => {
  it("executes a matching native denort and refuses a different real runtime version", async () => {
    const matched = fixture.denort("matched");
    const mismatched = fixture.denort("mismatched");
    const runtimeEntry = join(root, "runtime-version.ts");
    await writeFile(runtimeEntry, "console.log(Deno.version.deno);\n");
    const withRuntime = <A, E, R>(effect: Effect.Effect<A, E, R>, executable: string) =>
      effect.pipe(
        Effect.provide(Runtime.layer({
          executable: selectedDeno as Artifact.AbsolutePath,
          denort: executable as Artifact.AbsolutePath,
        })),
        Effect.provide(NodeServices.layer),
      );
    const artifact = await Effect.runPromise(withRuntime(
      Compile.compileExecutable({
        entrypoint: runtimeEntry,
        outfile: executablePath("matched-runtime"),
        target: hostTarget(),
        observation: "hashed",
      }),
      matched.executable,
    ));
    expect((await execute(artifact.path, [])).stdout).toBe(`${matched.version}\n`);
    expect(artifact.runtimeAcquisition._tag).toBe("ExplicitDenort");
    if (artifact.runtimeAcquisition._tag !== "ExplicitDenort") throw new Error("explicit denort observation missing");
    expect(artifact.runtimeAcquisition.tool.participants[0]).toMatchObject({
      name: "denort",
      version: matched.version,
      content: { digest: { value: matched.sha256 } },
    });
    await fixture.observe("matched-denort-execution", artifact.tool, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "native",
      runtime: { fixture: matched.id, observation: artifact.runtimeAcquisition.tool },
    });

    const mismatch = await Effect.runPromise(withRuntime(
      Effect.gen(function*() {
        const runtime = yield* Runtime.Runtime;
        const refused = yield* Effect.flip(Compile.compileExecutable({
          entrypoint: runtimeEntry,
          outfile: executablePath("mismatched-runtime"),
          target: hostTarget(),
          observation: "unhashed",
        }));
        return { runtime, refused };
      }),
      mismatched.executable,
    ));
    expect(mismatch.refused).toMatchObject({ _tag: "DenoCommandUnsupported", operation: "compileExecutable" });
    expect(mismatch.runtime.denort?.observation.participants[0]).toMatchObject({
      name: "denort",
      version: mismatched.version,
      content: { digest: { value: mismatched.sha256 } },
    });
    await expect(access(executablePath("mismatched-runtime"))).rejects.toMatchObject({ code: "ENOENT" });
    await fixture.observe("mismatched-denort-refusal", mismatch.runtime.tool.observation, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "admission-only",
      runtime: { fixture: mismatched.id, observation: mismatch.runtime.denort?.observation },
    });
  }, 300_000);

  it("compiles, authenticates, atomically publishes, hashes, and executes the host artifact", async () => {
    const outfile = executablePath("app");
    const artifact = await run(Compile.compileExecutable({
      entrypoint,
      outfile,
      target: hostTarget(),
      observation: "hashed",
      allowScripts: ["npm:effect-build-absent-fixture"],
    }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      provider: "deno",
      bytes: `${bytes.byteLength}`,
      denoTarget: hostTarget(),
      runtime: { name: "deno", version: fixture.version },
      publication: { scope: "file", commit: "same-parent-no-replace-link", committed: true },
      runtimeAcquisition: {
        _tag: "ProviderManagedDenort",
        evidenceGate: "cold-warm-corrupt-offline-target-relation-open",
      },
    });
    expect(await realpath(artifact.path)).toBe(await realpath(outfile));
    expect(artifact.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect((await execute(artifact.path, [])).stdout).toBe("effect-build-ok\n");
    await observeProviderNativeEvidence("CAN-DENO-010", "D08.1");
    await fixture.observe("compile-hash-execution", artifact.tool, {
      operation: "compileExecutable",
      target: hostTarget(),
      runner: "native",
    });
  }, 300_000);

  it.skipIf(fixture.version !== "2.9.5")(
    "executes compile watch under Scope and interrupts the real provider child",
    async () => {
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
    },
    300_000,
  );

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

it.skipIf(fixture.supports("compileExecutable"))("rejects real Deno with incompatible compile options", async () => {
  await expect(run(Compile.compileExecutable({
    entrypoint,
    outfile: executablePath("refused-compile"),
    observation: "unhashed",
    allowScripts: true,
  }))).rejects.toMatchObject({
    _tag: "DenoCommandUnsupported",
    operation: "compileExecutable",
    version: fixture.version,
  });
  const runtime = await run(Runtime.Runtime);
  await fixture.observe("rejected-compileExecutable", runtime.tool.observation, {
    operation: "compileExecutable",
    runner: "admission-only",
  });
});
