import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { chmod, copyFile, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as ApiBundle from "../../packages/effect-build-deno/src/Api/Bundle.js";
import * as Bundle from "../../packages/effect-build-deno/src/Command/Bundle.js";
import * as Transpile from "../../packages/effect-build-deno/src/Command/Transpile.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-deno.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-command-"));
  executable = join(root, "deno");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: executable as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const absent = (path: string): Promise<boolean> => stat(path).then(() => false, () => true);
const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (await absent(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Deno bundle/transpile command candidates", () => {
  it("keeps bundle stdout caller-owned and preserves project/import/cache authority", async () => {
    const log = join(root, "bundle.log");
    process.env.FAKE_DENO_LOG = log;
    try {
      const exit = await run(Bundle.stdout({
        entrypoint: "src/main.ts",
        cwd: root,
        config: "deno.json",
        importMap: "imports.json",
        lock: false,
        frozen: true,
        noRemote: true,
        nodeModulesDir: "manual",
        conditions: ["development"],
        allowImport: ["example.com:443"],
        platform: "browser",
        format: "esm",
        minify: true,
      }));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(new TextDecoder().decode(exit.value.output)).toContain("bundled src/main.ts");
        expect(exit.value.stability).toBe("experimental");
        expect(exit.value.tool.participants[0]).toMatchObject({ name: "deno", version: "2.9.5" });
      }
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(invocations).toHaveLength(1);
      expect(invocations[0]).toMatchObject({ cwd: await realpath(root) });
      expect(invocations[0].argv).toEqual(expect.arrayContaining([
        "bundle",
        "--config",
        "deno.json",
        "--import-map",
        "imports.json",
        "--no-lock",
        "--frozen",
        "--no-remote",
        "--node-modules-dir=manual",
        "--conditions",
        "development",
        "--allow-import=example.com:443",
        "--platform",
        "browser",
      ]));
      expect(invocations[0].argv).not.toContain("--output");
      expect(invocations[0].argv).not.toContain("--outdir");
    } finally {
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("keeps direct bundle/declaration publication provider-owned and explicit", async () => {
    const output = join(root, "bundle.js");
    const direct = await run(Bundle.direct({
      entrypoints: ["src/main.ts"],
      destination: { _tag: "Output", path: output },
      sourcemap: "external",
    }));
    expect(Exit.isSuccess(direct)).toBe(true);
    if (Exit.isSuccess(direct)) {
      expect(direct.value).toMatchObject({
        _tag: "DirectWriteResult",
        publication: "provider-direct-durable",
        destination: { _tag: "Output", path: output },
      });
    }

    const outdir = join(root, "bundle-declarations");
    const declarations = await run(Bundle.declarations({
      entrypoints: ["src/main.ts"],
      destination: { _tag: "Outdir", path: outdir },
    }));
    expect(Exit.isSuccess(declarations)).toBe(true);
    if (Exit.isSuccess(declarations)) expect(declarations.value.publication).toBe("provider-direct-durable");
  });

  it("covers transpile stdout, direct output, and tsc-backed declarations as distinct operations", async () => {
    const stdout = await run(Transpile.transpile({ file: "src/main.ts", sourceMap: "inline" }));
    expect(Exit.isSuccess(stdout)).toBe(true);
    if (Exit.isSuccess(stdout)) {
      expect(new TextDecoder().decode(stdout.value.output)).toContain("transpiled src/main.ts");
    }

    const outdir = join(root, "transpiled");
    const direct = await run(Transpile.transpileToDirectory({ files: ["src/main.ts"], outdir }));
    expect(Exit.isSuccess(direct)).toBe(true);
    if (Exit.isSuccess(direct)) expect(direct.value.publication).toBe("provider-direct-durable");

    const declarationDir = join(root, "transpiled-declarations");
    const declarations = await run(Transpile.emitDeclarations({ files: ["src/main.ts"], outdir: declarationDir }));
    expect(Exit.isSuccess(declarations)).toBe(true);
    if (Exit.isSuccess(declarations)) expect(declarations.value.outdir).toBe(declarationDir);
  });

  it("refuses a non-pinned Deno after one exact observation", async () => {
    const log = join(root, "refusal.log");
    process.env.FAKE_DENO_LOG = log;
    process.env.FAKE_DENO_VERSION = "2.9.4";
    try {
      const failure = errorOf(
        await run(Transpile.transpile({ file: "src/main.ts" })),
      ) as Runtime.DenoCommandUnsupported;
      expect(failure).toMatchObject({ _tag: "DenoCommandUnsupported", version: "2.9.4" });
      await expect(readFile(log, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete process.env.FAKE_DENO_LOG;
      delete process.env.FAKE_DENO_VERSION;
    }
  });

  it("keeps bundle watch opaque/scoped and preserves interruption Cause", async () => {
    const started = join(root, "bundle-watch-started");
    const log = join(root, "bundle-watch.log");
    process.env.FAKE_DENO_MODE = "delay";
    process.env.FAKE_DENO_STARTED = started;
    process.env.FAKE_DENO_LOG = log;
    try {
      const outer = await Effect.runPromiseExit(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(
              Bundle.watch({
                entrypoints: ["src/main.ts"],
                destination: { _tag: "Outdir", path: join(root, "bundle-watch-dist") },
              }).pipe(Effect.andThen(Effect.never)),
            ),
          );
          yield* Effect.promise(() => waitForFile(started));
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }).pipe(
          Effect.provide(Runtime.layer({ executable: executable as Artifact.AbsolutePath })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(Exit.isSuccess(outer)).toBe(true);
      if (Exit.isSuccess(outer) && Exit.isFailure(outer.value)) {
        expect(Cause.hasInterrupts(outer.value.cause)).toBe(true);
      }
      const invocation = JSON.parse((await readFile(log, "utf8")).trim());
      expect(invocation.argv).toEqual(expect.arrayContaining(["bundle", "--watch"]));
    } finally {
      delete process.env.FAKE_DENO_MODE;
      delete process.env.FAKE_DENO_STARTED;
      delete process.env.FAKE_DENO_LOG;
    }
  });

  it("truthfully reports the experimental host API unavailable in Node", async () => {
    expect(Reflect.has(globalThis, "Deno")).toBe(false);
    const failure = errorOf(
      await Effect.runPromiseExit(
        ApiBundle.memory({ entrypoints: ["src/main.ts"], write: false }).pipe(Effect.provide(ApiBundle.layer)),
      ),
    ) as ApiBundle.DenoBundleUnavailable;
    expect(failure).toMatchObject({
      _tag: "DenoBundleUnavailable",
      expectedVersion: "2.9.5",
      requiredFlag: "--unstable-bundle",
    });
  });
});
