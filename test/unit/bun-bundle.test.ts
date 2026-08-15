import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber } from "effect";
import { JavaScriptBundle } from "effect-build";
import * as Integration from "effect-build/Integration";
import type * as Provider from "effect-build/Provider";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Options, Stages, targetEntries } from "../../packages/effect-build-bun/src/Adapter.js";
import {
  BunBundleFailed,
  BunBundleInvalid,
  BunBundleMaterializationFailed,
  BunBundleSpawnFailed,
  BunBundleVersionMismatch,
  InvalidBundleInput,
  makeService,
  type Service,
} from "../../packages/effect-build-bun/src/Bundle.js";

type Target = (typeof targetEntries)[number][0];
type ExecutableStages = typeof Stages.Type;
type Context = Provider.CommandServiceContext<"bun", Options, Target, ExecutableStages>;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-bun-bundle-test-"));
  roots.push(root);
  return root;
};

const completion = (exitCode = 0, stdout = "", stderr = "") => ({
  exitCode,
  stdout: { text: stdout, truncated: false },
  stderr: { text: stderr, truncated: false },
});

interface CommandOptions {
  readonly version?: string;
  readonly exitCode?: number;
  readonly spawnFailure?: boolean;
  readonly omitOutput?: boolean;
  readonly omitMetafile?: boolean;
  readonly extraRootEntry?: boolean;
  readonly rawMetafile?: string;
  readonly outputKey?: string;
  readonly entryPoint?: string;
  readonly cssBundle?: boolean;
  readonly outputs?: Readonly<Record<string, unknown>>;
  readonly inputs?: unknown;
  readonly execute?: Context["command"]["execute"];
}

interface Harness {
  readonly service: Service;
  readonly calls: Array<{ readonly argv: readonly string[]; readonly cwd?: string }>;
}

const makeHarness = (options: CommandOptions = {}): Harness => {
  const calls: Array<{ readonly argv: readonly string[]; readonly cwd?: string }> = [];
  const execute: Context["command"]["execute"] = options.execute ?? ((argv, cwd) =>
    Effect.sync(() => {
      calls.push({ argv: [...argv], ...(cwd === undefined ? {} : { cwd }) });
      if (options.spawnFailure === true) {
        throw new Error("spawn failure must use the configured failing Effect");
      }
      if ((options.exitCode ?? 0) !== 0) return completion(options.exitCode, "out", "err");
      const outfile = argv.find((value) => value.startsWith("--outfile="))?.slice("--outfile=".length);
      const metafile = argv.find((value) => value.startsWith("--metafile="))?.slice("--metafile=".length);
      const entrypoint = argv.at(-1);
      if (outfile === undefined || metafile === undefined || entrypoint === undefined) {
        throw new Error("missing fixed Bun argv");
      }
      mkdirSync(dirname(outfile), { recursive: true });
      if (options.omitOutput !== true) writeFileSync(outfile, "console.log('bundled')\n");
      if (options.omitMetafile !== true) {
        const outputName = outfile.endsWith(".cjs") ? "main.cjs" : "main.mjs";
        const output = {
          bytes: 23,
          inputs: {},
          imports: [],
          exports: [],
          entryPoint: options.entryPoint ?? entrypoint,
          ...(options.cssBundle === true ? { cssBundle: "main.css" } : {}),
        };
        const body = options.rawMetafile ?? JSON.stringify({
          inputs: options.inputs ?? {
            [entrypoint]: {
              bytes: 1,
              imports: [
                { path: "node:path", kind: "import-statement", external: true },
                { path: "bun:wrap", kind: "import-statement" },
                { path: "node:fs", kind: "import-statement", external: true },
                { path: "node:path", kind: "import-statement", external: true },
              ],
            },
          },
          outputs: options.outputs ?? { [options.outputKey ?? `./${outputName}`]: output },
        });
        writeFileSync(metafile, body);
      }
      if (options.extraRootEntry === true) writeFileSync(join(dirname(outfile), "extra.js"), "extra");
      return completion();
    }));
  const commandExecute: Context["command"]["execute"] = options.spawnFailure === true
    ? (argv, cwd) => {
      calls.push({ argv: [...argv], ...(cwd === undefined ? {} : { cwd }) });
      return Effect.fail({ message: "cannot spawn" } as never);
    }
    : execute;
  const context = {
    compileExecutable: () => Effect.die("unused compileExecutable"),
    compileExecutableMatrix: () => Effect.die("unused compileExecutableMatrix"),
    command: {
      tool: { name: "bun", version: options.version ?? "1.3.9", path: "/tools/bun-1.3.9" },
      execute: commandExecute,
    },
  } as Context;
  return { service: makeService(context), calls };
};

const makeEntrypoint = (name = "entry.ts"): { readonly root: string; readonly path: string } => {
  const root = makeRoot();
  const path = join(root, name);
  writeFileSync(path, "import 'node:fs'; console.log('entry')\n");
  return { root, path };
};

const failureOf = <E>(exit: Exit.Exit<unknown, E>): E => {
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const failure = exit.cause.reasons.find(Cause.isFailReason);
  if (failure === undefined) throw new Error("expected typed failure");
  return failure.error;
};

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>);

describe("Bun scoped JavaScript bundle producer", () => {
  it.each(["esm", "cjs"] as const)(
    "uses the exact fixed %s argv and returns one live core artifact",
    async (format) => {
      const input = makeEntrypoint(format === "esm" ? "entry.ts" : "entry.cjs");
      const harness = makeHarness();
      let retained: Parameters<Parameters<Service["withJavaScriptBundle"]>[1]>[0] | undefined;
      let callbackPath = "";
      const observed = await run(harness.service.withJavaScriptBundle(
        { entrypoint: input.path, format, cwd: input.root },
        (main) =>
          Effect.sync(() => {
            retained = main;
            callbackPath = main.path;
            expect(existsSync(main.path)).toBe(true);
            return main;
          }),
      ));

      const outputName = format === "esm" ? "main.mjs" : "main.cjs";
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0]).toEqual({
        argv: [
          "build",
          "--target=node",
          `--format=${format}`,
          "--packages=bundle",
          expect.stringMatching(new RegExp(`/effect-build-bun-[^/]+/${outputName}$`)),
          expect.stringMatching(/\/effect-build-bun-[^/]+\/metafile\.json$/),
          input.path,
        ].map((value, index) =>
          index === 4
            ? expect.stringMatching(`^--outfile=.*${outputName}$`)
            : index === 5
            ? expect.stringMatching("^--metafile=.*/metafile.json$")
            : value
        ),
        cwd: input.root,
      });
      expect(observed).toMatchObject({
        format,
        resolutionTarget: "node",
        observedExternalImports: ["node:fs", "node:path"],
        stages: [{
          operation: "bundle-javascript",
          tool: { name: "bun", version: "1.3.9", path: "/tools/bun-1.3.9" },
        }],
      });
      expect(observed.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(existsSync(callbackPath)).toBe(false);
      const stale = await run(Integration.inspectLiveJavaScriptBundle(retained!).pipe(Effect.flip));
      expect(stale).toMatchObject({ _tag: "InvalidJavaScriptBundle", reason: "artifact-not-live" });
    },
  );

  it("validates every request field with the finite reason vocabulary", async () => {
    const cases: readonly [unknown, string][] = [
      [null, "expected-object"],
      [{}, "missing-field"],
      [{ entrypoint: "x.ts", format: "esm", extra: true }, "unknown-field"],
      [{ entrypoint: "", format: "esm" }, "invalid-entrypoint"],
      [{ entrypoint: "x.ts", format: "iife" }, "invalid-format"],
      [{ entrypoint: "x.ts", format: "esm", cwd: 1 }, "invalid-cwd"],
    ];
    for (const [input, reason] of cases) {
      const harness = makeHarness();
      const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(input as never, Effect.succeed)));
      expect(failureOf(exit)).toMatchObject({ _tag: "InvalidBundleInput", reason });
      expect(harness.calls).toHaveLength(0);
    }
    const unsupported = makeEntrypoint("entry.txt");
    const harness = makeHarness();
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: unsupported.path, format: "esm" },
      Effect.succeed,
    )));
    expect(failureOf(exit)).toMatchObject({ _tag: "InvalidBundleInput", reason: "entrypoint-not-regular" });
    expect(harness.calls).toHaveLength(0);
  });

  it("gates only the bundle operation on the sole frozen Bun version", async () => {
    const harness = makeHarness({ version: "1.3.14" });
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: "/missing.ts", format: "esm" },
      Effect.succeed,
    )));
    const error = failureOf(exit);
    expect(error).toBeInstanceOf(BunBundleVersionMismatch);
    expect(error).toMatchObject({ supported: ["1.3.9"], observed: "1.3.14" });
    expect(Object.isFrozen((error as BunBundleVersionMismatch).supported)).toBe(true);
    expect(harness.calls).toHaveLength(0);
  });

  it("separates spawn failures from completed nonzero diagnostics", async () => {
    const input = makeEntrypoint();
    const spawned = makeHarness({ spawnFailure: true });
    const spawnExit = await run(Effect.exit(spawned.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      Effect.succeed,
    )));
    expect(failureOf(spawnExit)).toBeInstanceOf(BunBundleSpawnFailed);

    const failed = makeHarness({ exitCode: 7 });
    const failedExit = await run(Effect.exit(failed.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      Effect.succeed,
    )));
    expect(failureOf(failedExit)).toEqual(
      new BunBundleFailed({
        exitCode: 7,
        diagnostics: [
          { channel: "stdout", text: "out", truncated: false },
          { channel: "stderr", text: "err", truncated: false },
        ],
      }),
    );
  });

  it.each(
    [
      [{ omitOutput: true }, "missing-output"],
      [{ omitMetafile: true }, "missing-metafile"],
      [{ extraRootEntry: true }, "unexpected-root-entry"],
      [{ rawMetafile: "{" }, "invalid-metafile"],
      [{ outputs: {} }, "expected-one-metafile-output"],
      [{ outputKey: "./nested/main.mjs" }, "metafile-output-mismatch"],
      [{ entryPoint: "other.ts" }, "entrypoint-mismatch"],
      [{ cssBundle: true }, "css-output-not-supported"],
      [{ inputs: { bad: {} } }, "invalid-metafile-input"],
      [{ inputs: { bad: { imports: [null] } } }, "invalid-metafile-import"],
      [{ inputs: { bad: { imports: [{ external: true, path: "" }] } } }, "invalid-external-import"],
    ] as const,
  )("rejects invalid materialized Bun output with %s", async (options, reason) => {
    const input = makeEntrypoint();
    const harness = makeHarness(options);
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      Effect.succeed,
    )));
    expect(failureOf(exit)).toMatchObject({ _tag: "BunBundleInvalid", reason });
    expect(failureOf(exit)).toBeInstanceOf(BunBundleInvalid);
  });

  it("maps entrypoint access failure into the named materialization operation", async () => {
    const root = makeRoot();
    const harness = makeHarness();
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: join(root, "missing.ts"), format: "esm" },
      Effect.succeed,
    )));
    expect(failureOf(exit)).toBeInstanceOf(InvalidBundleInput);
    expect(failureOf(exit)).toMatchObject({ reason: "entrypoint-not-regular" });
  });

  it("does not capture a caller error that merely collides with a Bun error tag", async () => {
    const input = makeEntrypoint();
    const harness = makeHarness();
    const callerError = { _tag: "BunBundleInvalid", reason: "caller-owned" } as const;
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      () => Effect.fail(callerError),
    )));
    expect(failureOf(exit)).toBe(callerError);
    expect(failureOf(exit)).not.toBeInstanceOf(BunBundleInvalid);
  });

  it("does not remap a genuine core bundle error returned by caller code", async () => {
    const input = makeEntrypoint();
    const harness = makeHarness();
    const callerError = new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "artifact-not-live" });
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      () => Effect.fail(callerError),
    )));
    expect(failureOf(exit)).toBe(callerError);
  });

  it("removes the owned root after a callback defect", async () => {
    const input = makeEntrypoint();
    const harness = makeHarness();
    let bundlePath = "";
    const exit = await run(Effect.exit(harness.service.withJavaScriptBundle(
      { entrypoint: input.path, format: "esm" },
      (main) =>
        Effect.sync(() => bundlePath = main.path).pipe(
          Effect.andThen(Effect.die("callback defect")),
        ),
    )));
    expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it("interrupts a running selected Bun child and removes its owned root", async () => {
    const input = makeEntrypoint();
    const started = await Effect.runPromise(Deferred.make<string>());
    let cleanupRoot = "";
    const harness = makeHarness({
      execute: (argv) => {
        const outfile = argv.find((value) => value.startsWith("--outfile="))!.slice("--outfile=".length);
        cleanupRoot = dirname(outfile);
        return Deferred.succeed(started, cleanupRoot).pipe(Effect.andThen(Effect.never));
      },
    });
    const fiber = Effect.runFork(
      harness.service.withJavaScriptBundle(
        { entrypoint: input.path, format: "esm" },
        Effect.succeed,
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    await Effect.runPromise(Deferred.await(started));
    expect(existsSync(cleanupRoot)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(Exit.hasInterrupts(await Effect.runPromise(Fiber.await(fiber)))).toBe(true);
    expect(existsSync(cleanupRoot)).toBe(false);
  });

  it("keeps error Schemas finite", () => {
    expect(() => new BunBundleInvalid({ reason: "arbitrary" as never })).toThrow();
    expect(() => new InvalidBundleInput({ reason: "arbitrary" as never })).toThrow();
    expect(new BunBundleMaterializationFailed({ path: "/x", operation: "read", reason: "x" }))
      .toMatchObject({ operation: "read" });
  });
});
