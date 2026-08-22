import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, FileSystem, Path, PlatformError, type Scope } from "effect";
import { JavaScriptBundle } from "effect-build";
import * as Integration from "effect-build/Integration";
import * as esbuild from "esbuild";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BundleContext,
  Esbuild as EsbuildServiceTag,
  type EsbuildApi,
  type EsbuildService,
  InvalidBundleInput,
  JavaScriptBundleInvalid,
  layer,
  makeEsbuildService,
  withJavaScriptBundle,
} from "../../packages/effect-build-esbuild/src/internal/Esbuild.js";

type JavaScriptBundleArtifact = JavaScriptBundle.Artifact<
  readonly [{
    readonly operation: "bundle";
    readonly tool: { readonly name: "esbuild"; readonly version: "0.28.2" };
  }]
>;

const root = resolve(new URL("../..", import.meta.url).pathname);
const fixtureRoot = resolve(root, "test/fixtures/esbuild");
const outfile = resolve(fixtureRoot, "out/main.mjs");
const installedEffectIndex = relative(
  root,
  resolve(dirname(realpathSync(createRequire(import.meta.url).resolve("effect/package.json"))), "dist/index.js"),
).replaceAll("\\", "/");

const logOverride = {
  "unsupported-dynamic-import": "error",
  "unsupported-require-call": "error",
  "indirect-require": "error",
  "require-resolve-not-external": "error",
  "direct-eval": "error",
  "ignored-dynamic-import": "error",
  "empty-glob": "error",
} as const;

const optionsFor = (
  entrypoint: string,
  format: "esm" | "cjs" = "esm",
  overrides: esbuild.BuildOptions = {},
): esbuild.BuildOptions => ({
  absWorkingDir: root,
  entryPoints: [resolve(fixtureRoot, entrypoint)],
  outfile: format === "esm" ? outfile : outfile.replace(/\.mjs$/, ".cjs"),
  bundle: true,
  splitting: false,
  platform: "node",
  packages: "bundle",
  format,
  target: "node26.7",
  write: false,
  metafile: true,
  logLevel: "silent",
  plugins: [],
  supported: { "dynamic-import": false },
  logOverride,
  ...overrides,
});

const rebuild = async (options: esbuild.BuildOptions) => {
  const context = await esbuild.context(options);
  try {
    return await context.rebuild();
  } finally {
    await context.cancel();
    await context.dispose();
  }
};

const failureFor = async (entrypoint: string, format: "esm" | "cjs" = "esm") => {
  try {
    await rebuild(optionsFor(entrypoint, format));
    throw new Error("expected esbuild to reject the fixture");
  } catch (error) {
    expect(error).toHaveProperty("errors");
    return error as esbuild.BuildFailure;
  }
};

describe("pinned esbuild API contract", () => {
  it("pins the exact library version and structured ESM/CJS output shape", async () => {
    expect(esbuild.version).toBe("0.28.2");

    const esm = await rebuild(optionsFor("valid.ts"));
    expect(esm.errors).toEqual([]);
    expect(esm.warnings).toEqual([]);
    expect(esm.outputFiles?.map(({ path }) => path)).toEqual([outfile]);
    expect(Object.keys(esm.metafile?.outputs ?? {})).toEqual(["test/fixtures/esbuild/out/main.mjs"]);
    const esmOutput = esm.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"];
    expect(esmOutput?.entryPoint).toBe("test/fixtures/esbuild/valid.ts");
    expect(esmOutput?.cssBundle).toBeUndefined();
    expect(esmOutput?.imports).toEqual([
      { path: "node:fs", kind: "import-statement", external: true },
      { path: "path", kind: "import-statement", external: true },
    ]);
    expect(esm.metafile?.inputs["test/fixtures/esbuild/valid.ts"]?.imports).toEqual(
      expect.arrayContaining([
        { path: "test/fixtures/esbuild/local.ts", kind: "import-statement", original: "./local.js" },
        { path: "test/fixtures/esbuild/dynamic.ts", kind: "dynamic-import", original: "./dynamic.js" },
      ]),
    );
    expect(Object.keys(esm.metafile?.inputs ?? {})).toContain(installedEffectIndex);

    const cjsOutfile = outfile.replace(/\.mjs$/, ".cjs");
    const cjs = await rebuild(optionsFor("valid.cjs", "cjs"));
    expect(cjs.warnings).toEqual([]);
    expect(cjs.outputFiles?.map(({ path }) => path)).toEqual([cjsOutfile]);
    const cjsOutput = cjs.metafile?.outputs["test/fixtures/esbuild/out/main.cjs"];
    expect(cjsOutput?.entryPoint).toBe("test/fixtures/esbuild/valid.cjs");
    expect(cjsOutput?.imports).toEqual([
      { path: "node:fs", kind: "require-call", external: true },
      { path: "path", kind: "require-call", external: true },
    ]);
  });

  it("pins promoted message IDs without depending on English diagnostics", async () => {
    const cases = [
      ["missing.js", "esm", ""],
      ["caught-missing.cjs", "cjs", "ignored-dynamic-import"],
      ["computed-import.js", "esm", "unsupported-dynamic-import"],
      ["computed-require.cjs", "cjs", "unsupported-require-call"],
      ["aliased-require.cjs", "cjs", "indirect-require"],
      ["direct-eval.js", "esm", "direct-eval"],
      ["require-resolve.cjs", "cjs", "require-resolve-not-external"],
    ] as const;
    for (const [entrypoint, format, id] of cases) {
      const failure = await failureFor(entrypoint, format);
      expect(failure.errors.map((diagnostic) => diagnostic.id), entrypoint).toContain(id);
    }
  });

  it("exposes the format-specific external edge needed by structured validation", async () => {
    const dynamicBuiltin = await rebuild(optionsFor("esm-dynamic-builtin.mjs"));
    expect(dynamicBuiltin.metafile?.inputs["test/fixtures/esbuild/esm-dynamic-builtin.mjs"]?.imports).toEqual([
      { path: "node:fs", kind: "dynamic-import", external: true },
    ]);
    expect(dynamicBuiltin.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"]?.imports).toEqual([
      { path: "node:fs", kind: "require-call", external: true },
    ]);

    const externalUrl = await rebuild(optionsFor("external-url.mjs"));
    expect(externalUrl.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"]?.imports).toEqual([
      { path: "https://example.invalid/dependency.js", kind: "import-statement", external: true },
    ]);
    expect((await failureFor("external-custom.mjs")).errors.map(({ id }) => id)).toEqual([""]);
    const explicitCustom = await rebuild(optionsFor("external-custom.mjs", "esm", { external: ["custom:*"] }));
    expect(explicitCustom.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"]?.imports).toEqual([
      { path: "custom:dependency", kind: "import-statement", external: true },
    ]);
  });

  it("pins CSS, asset, and multiple-entry structured shapes that the product rejects", async () => {
    const cssOnly = await rebuild(optionsFor("css-entry.css"));
    expect(cssOnly.outputFiles?.map(({ path }) => path)).toEqual([outfile]);
    expect(cssOnly.metafile?.inputs["test/fixtures/esbuild/css-entry.css"]?.imports).toEqual([
      { path: "test/fixtures/esbuild/style.css", kind: "import-rule", original: "./style.css" },
    ]);

    const cssSideOutput = await rebuild(optionsFor("js-with-css.js"));
    expect(cssSideOutput.outputFiles?.map(({ path }) => path)).toEqual([
      outfile,
      outfile.replace(/\.mjs$/, ".css"),
    ]);
    expect(cssSideOutput.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"]?.cssBundle).toBe(
      "test/fixtures/esbuild/out/main.css",
    );

    const asset = await rebuild(optionsFor("asset-entry.js", "esm", { loader: { ".txt": "file" } }));
    expect(asset.outputFiles).toHaveLength(2);
    expect(
      Object.values(asset.metafile?.outputs ?? {}).some(({ imports }) =>
        imports.some(({ kind }) => kind === "file-loader")
      ),
    ).toBe(true);

    const unsafeOptions = optionsFor("valid.ts", "esm", {
      entryPoints: [resolve(fixtureRoot, "valid.ts"), resolve(fixtureRoot, "second-entry.js")],
    });
    try {
      await rebuild(unsafeOptions);
      throw new Error("expected multiple entries with outfile to fail");
    } catch (error) {
      expect((error as esbuild.BuildFailure).errors.map(({ id }) => id)).toEqual([""]);
    }
  });

  it("freezes the explicit limit: arbitrary runtime dependency construction is not observable", async () => {
    for (
      const entrypoint of [
        "computed-require-resolve.cjs",
        "aliased-require-resolve.cjs",
        "indirect-eval.js",
        "function-constructor.js",
        "global-require.js",
      ]
    ) {
      const result = await rebuild(optionsFor(entrypoint, entrypoint.endsWith(".cjs") ? "cjs" : "esm"));
      expect(result.warnings, entrypoint).toEqual([]);
      expect(result.metafile?.inputs[`test/fixtures/esbuild/${entrypoint}`]?.imports, entrypoint).toEqual([]);
      expect(result.metafile?.outputs[formatOutput(entrypoint)]?.imports, entrypoint).toEqual([]);
    }

    const createRequire = await rebuild(optionsFor("create-require.mjs"));
    expect(createRequire.metafile?.outputs["test/fixtures/esbuild/out/main.mjs"]?.imports).toEqual([
      { path: "node:module", kind: "import-statement", external: true },
    ]);
  });
});

const formatOutput = (entrypoint: string): string =>
  entrypoint.endsWith(".cjs") ? "test/fixtures/esbuild/out/main.cjs" : "test/fixtures/esbuild/out/main.mjs";

type CapturedOptions = esbuild.BuildOptions & { readonly write: false; readonly metafile: true };
type CapturedResult = esbuild.BuildResult<CapturedOptions>;

const outputFor = (options: CapturedOptions, overrides: Partial<CapturedResult> = {}): CapturedResult => {
  const stagedPath = options.outfile!;
  const entrypoint = (options.entryPoints as readonly string[])[0]!;
  const kind = options.format === "cjs" ? "require-call" : "import-statement";
  return {
    errors: [],
    warnings: [],
    outputFiles: [{
      path: stagedPath,
      contents: new TextEncoder().encode("console.log('bundled')\n"),
      hash: "fixture",
      text: "console.log('bundled')\n",
    }],
    metafile: {
      inputs: { [entrypoint]: { bytes: 1, imports: [], format: "esm" } },
      outputs: {
        [stagedPath]: {
          bytes: 24,
          inputs: { [entrypoint]: { bytesInOutput: 1 } },
          imports: [
            { path: "node:path", kind, external: true },
            { path: "node:fs", kind, external: true },
            { path: "node:path", kind, external: true },
          ],
          exports: [],
          entryPoint: entrypoint,
        },
      },
    },
    mangleCache: {},
    ...overrides,
  };
};

interface ControlledApi {
  readonly api: EsbuildApi;
  readonly events: string[];
  readonly options: CapturedOptions[];
}

const controlledApi = (configure: {
  readonly version?: string;
  readonly rebuild?: (options: CapturedOptions) => Promise<CapturedResult>;
  readonly cancel?: () => Promise<void>;
  readonly dispose?: () => Promise<void>;
} = {}): ControlledApi => {
  const events: string[] = [];
  const options: CapturedOptions[] = [];
  return {
    events,
    options,
    api: {
      version: configure.version ?? "0.28.2",
      context: async (captured) => {
        events.push("context");
        options.push(captured);
        const context: BundleContext = {
          rebuild: async () => {
            events.push("rebuild:start");
            try {
              return await (configure.rebuild?.(captured) ?? Promise.resolve(outputFor(captured)));
            } finally {
              events.push("rebuild:end");
            }
          },
          cancel: async () => {
            events.push("cancel:start");
            try {
              await configure.cancel?.();
            } finally {
              events.push("cancel:end");
            }
          },
          dispose: async () => {
            events.push("dispose:start");
            try {
              await configure.dispose?.();
            } finally {
              events.push("dispose:end");
            }
          },
        };
        return context;
      },
    },
  };
};

const withService = <A, E, R>(api: EsbuildApi, use: (service: EsbuildService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const service = yield* makeEsbuildService(fileSystem, path, api);
    return yield* use(service);
  }).pipe(Effect.provide(NodeServices.layer));

const withServiceAndFileSystem = <A, E, R>(
  api: EsbuildApi,
  fileSystem: FileSystem.FileSystem,
  use: (service: EsbuildService) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const service = yield* makeEsbuildService(fileSystem, path, api);
    return yield* use(service);
  }).pipe(Effect.provide(NodeServices.layer));

const bundleInput = { entrypoint: "valid.ts", format: "esm" as const, cwd: fixtureRoot };

const assertScopeIsDischarged = (service: EsbuildService): Effect.Effect<void, unknown, never> => {
  const callback = (_bundle: JavaScriptBundleArtifact): Effect.Effect<void, never, Scope.Scope> =>
    Effect.succeed(undefined) as Effect.Effect<void, never, Scope.Scope>;
  return service.withJavaScriptBundle(bundleInput, callback);
};
void assertScopeIsDischarged;

const cleanupEvents = ["cancel:start", "cancel:end", "dispose:start", "dispose:end"];
const firstFailure = (cause: Cause.Cause<unknown>): unknown => cause.reasons.find(Cause.isFailReason)?.error;

describe("internal esbuild bundle operation", () => {
  it("runs the exact default API through the continuation-owned product operation", async () => {
    let staged = "";
    const result = await Effect.runPromise(
      withJavaScriptBundle(bundleInput, (artifact) =>
        Effect.sync(() => {
          staged = artifact.path;
          expect(existsSync(staged)).toBe(true);
          expect(artifact.observedExternalImports).toEqual(["node:fs", "path"]);
          return "real-api";
        })).pipe(
          Effect.provide(layer),
          Effect.provide(NodeServices.layer),
        ),
    );
    expect(result).toBe("real-api");
    expect(existsSync(staged)).toBe(false);
  });

  it("rejects a loaded API version mismatch before creating a context", async () => {
    const controlled = controlledApi({ version: "0.28.3" });
    const exit = await Effect.runPromise(Effect.exit(withService(controlled.api, () => Effect.void)));
    expect(Exit.isFailure(exit) && Exit.hasFails(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit.cause)).toMatchObject({
        _tag: "EsbuildVersionMismatch",
        expected: "0.28.2",
        observed: "0.28.3",
      });
    }
    expect(controlled.events).toEqual([]);
  });

  it("uses exact fixed options and exact artifact keys only inside the live callback", async () => {
    const controlled = controlledApi();
    let callbackPath = "";
    let retained: JavaScriptBundleArtifact | undefined;
    const result = await Effect.runPromise(
      withService(
        controlled.api,
        (service) =>
          service.withJavaScriptBundle(bundleInput, (artifact) =>
            Effect.gen(function*() {
              callbackPath = artifact.path;
              retained = artifact;
              expect(existsSync(artifact.path)).toBe(true);
              expect(yield* Integration.inspectLiveJavaScriptBundle(artifact)).toBe(artifact);
              const forged = yield* Integration.inspectLiveJavaScriptBundle({ ...artifact } as typeof artifact).pipe(
                Effect.flip,
              );
              expect(forged).toMatchObject({ reason: "artifact-not-live" });
              expect(Object.keys(artifact).sort()).toEqual([
                "bytes",
                "digest",
                "format",
                "observedExternalImports",
                "path",
                "resolutionTarget",
                "stages",
              ]);
              expect(artifact).toMatchObject({
                format: "esm",
                resolutionTarget: "node",
                observedExternalImports: ["node:fs", "node:path"],
                stages: [{ operation: "bundle", tool: { name: "esbuild", version: "0.28.2" } }],
              });
              expect(Object.isFrozen(artifact)).toBe(true);
              expect(Object.isFrozen(artifact.observedExternalImports)).toBe(true);
              expect(Object.isFrozen(artifact.stages)).toBe(true);
              expect(Object.isFrozen(artifact.stages[0])).toBe(true);
              expect(Object.isFrozen(artifact.stages[0].tool)).toBe(true);
              return "used";
            })),
      ),
    );

    expect(result).toBe("used");
    expect(existsSync(callbackPath)).toBe(false);
    const stale = await Effect.runPromise(
      Integration.inspectLiveJavaScriptBundle(retained!).pipe(Effect.provide(NodeServices.layer), Effect.flip),
    );
    expect(stale).toMatchObject({ reason: "artifact-not-live" });
    expect(controlled.events).toEqual(["context", "rebuild:start", "rebuild:end", ...cleanupEvents]);
    expect(controlled.options).toHaveLength(1);
    expect(controlled.options[0]).toMatchObject({
      absWorkingDir: fixtureRoot,
      entryPoints: [resolve(fixtureRoot, "valid.ts")],
      bundle: true,
      splitting: false,
      platform: "node",
      packages: "bundle",
      format: "esm",
      target: "node26.7",
      write: false,
      metafile: true,
      logLevel: "silent",
      plugins: [],
      supported: { "dynamic-import": false },
      logOverride,
    });
    expect(Reflect.ownKeys(controlled.options[0]!).sort()).toEqual([
      "absWorkingDir",
      "bundle",
      "entryPoints",
      "format",
      "logLevel",
      "logOverride",
      "metafile",
      "outfile",
      "packages",
      "platform",
      "plugins",
      "splitting",
      "supported",
      "target",
      "write",
    ]);
    expect(controlled.options[0]?.outfile).toMatch(/\/main\.mjs$/);
    for (const forbidden of ["watch", "external", "loader", "splitting"]) {
      if (forbidden !== "splitting") expect(controlled.options[0]).not.toHaveProperty(forbidden);
    }
  });

  it("demonstrates a returned artifact is stale after the continuation scope closes", async () => {
    const controlled = controlledApi();
    const stale = await Effect.runPromise(
      withService(controlled.api, (service) => service.withJavaScriptBundle(bundleInput, Effect.succeed)),
    );
    expect(existsSync(stale.path)).toBe(false);
    const error = await Effect.runPromise(
      Integration.inspectLiveJavaScriptBundle(stale).pipe(Effect.provide(NodeServices.layer), Effect.flip),
    );
    expect(error).toMatchObject({ reason: "artifact-not-live" });
  });

  it("cleans up after callback typed failure and defect", async () => {
    const callbacks = [
      (_artifact: JavaScriptBundleArtifact) => Effect.fail("callback-failure"),
      (_artifact: JavaScriptBundleArtifact) => Effect.die("callback-defect"),
    ];
    for (const callback of callbacks) {
      const controlled = controlledApi();
      let staged = "";
      const exit = await Effect.runPromise(
        Effect.exit(withService(controlled.api, (service) =>
          service.withJavaScriptBundle(bundleInput, (artifact) => {
            staged = artifact.path;
            return callback(artifact);
          }))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(existsSync(staged)).toBe(false);
      expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
    }
  });

  it("passes through a same-tag caller error without the core family marker", async () => {
    const controlled = controlledApi();
    const callerError = { _tag: "InvalidJavaScriptBundle", reason: "caller-owned" } as const;
    const observed = await Effect.runPromise(
      withService(
        controlled.api,
        (service) => service.withJavaScriptBundle(bundleInput, () => Effect.fail(callerError)),
      ).pipe(Effect.flip),
    );

    expect(observed).toBe(callerError);
    expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
  });

  it("passes through a caller-created core bundle error by identity", async () => {
    const controlled = controlledApi();
    const callerError = new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "artifact-not-live" });
    let staged = "";
    const exit = await Effect.runPromise(
      Effect.exit(
        withService(
          controlled.api,
          (service) =>
            service.withJavaScriptBundle(bundleInput, (artifact) => {
              staged = artifact.path;
              return Effect.fail(callerError);
            }),
        ),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(firstFailure(exit.cause)).toBe(callerError);
    expect(existsSync(staged)).toBe(false);
    expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
  });

  it("preserves an exact mixed caller Cause and cleans up after the captured Exit", async () => {
    const controlled = controlledApi();
    const callerError = new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "artifact-not-live" });
    const interruptor = 38_038;
    const callerCause = Cause.combine(Cause.fail(callerError), Cause.interrupt(interruptor));
    let staged = "";
    const exit = await Effect.runPromise(
      Effect.exit(
        withService(
          controlled.api,
          (service) =>
            service.withJavaScriptBundle(bundleInput, (artifact) => {
              staged = artifact.path;
              return Effect.failCause(callerCause);
            }),
        ),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit.cause)).toBe(callerError);
      expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Interrupt"]);
      expect([...Cause.interruptors(exit.cause)]).toEqual([interruptor]);
      expect(Exit.hasDies(exit)).toBe(false);
    }
    expect(existsSync(staged)).toBe(false);
    expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
  });

  it("preserves a sibling caller defect while restoring the captured Exit", async () => {
    const controlled = controlledApi();
    const callerError = new JavaScriptBundle.InvalidJavaScriptBundle({ reason: "artifact-not-live" });
    const callerDefect = new Error("caller-defect");
    const callerCause = Cause.combine(Cause.fail(callerError), Cause.die(callerDefect));
    let staged = "";
    const exit = await Effect.runPromise(
      Effect.exit(
        withService(
          controlled.api,
          (service) =>
            service.withJavaScriptBundle(bundleInput, (artifact) => {
              staged = artifact.path;
              return Effect.failCause(callerCause);
            }),
        ),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(firstFailure(exit.cause)).toBe(callerError);
      expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Die"]);
      expect(exit.cause.reasons.find(Cause.isDieReason)?.defect).toBe(callerDefect);
      expect(Exit.hasInterrupts(exit)).toBe(false);
    }
    expect(existsSync(staged)).toBe(false);
    expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
  });

  it("does not invoke the callback for input, build, or structured validation failure", async () => {
    const cases: Array<{ controlled: ControlledApi; value: unknown; tag: string }> = [
      { controlled: controlledApi(), value: { ...bundleInput, extra: true }, tag: "InvalidBundleInput" },
      {
        controlled: controlledApi({
          rebuild: async () => Promise.reject({ errors: [{ id: "fixture", text: "failed" }] }),
        }),
        value: bundleInput,
        tag: "EsbuildFailed",
      },
      {
        controlled: controlledApi({ rebuild: async (options) => outputFor(options, { outputFiles: [] }) }),
        value: bundleInput,
        tag: "JavaScriptBundleInvalid",
      },
      {
        controlled: controlledApi({
          rebuild: async (options) =>
            outputFor(options, {
              warnings: [{
                id: "fixture-warning",
                pluginName: "",
                text: "warning",
                location: null,
                notes: [],
                detail: undefined,
              }],
            }),
        }),
        value: bundleInput,
        tag: "EsbuildFailed",
      },
    ];
    for (const { controlled, value, tag } of cases) {
      let invoked = false;
      const exit = await Effect.runPromise(
        Effect.exit(
          withService(controlled.api, (service) =>
            service.withJavaScriptBundle(value as typeof bundleInput, () => {
              invoked = true;
              return Effect.void;
            })),
        ),
      );
      expect(invoked, tag).toBe(false);
      expect(Exit.isFailure(exit), tag).toBe(true);
      if (Exit.isFailure(exit)) expect(firstFailure(exit.cause)).toHaveProperty("_tag", tag);
      if (tag === "InvalidBundleInput") expect(controlled.events).toEqual([]);
      else expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
    }
  });

  it("decodes the complete runtime input boundary before acquiring resources", async () => {
    const invalidInputs: readonly unknown[] = [
      null,
      [],
      {},
      { entrypoint: "", format: "esm" },
      { entrypoint: "valid.ts\0", format: "esm" },
      { entrypoint: "valid.ts", format: "iife" },
      { entrypoint: "valid.ts", format: "esm", cwd: "" },
      { entrypoint: "style.css", format: "esm", cwd: fixtureRoot },
      { entrypoint: "missing.ts", format: "esm", cwd: fixtureRoot },
      { entrypoint: "valid.ts", format: "esm", cwd: fixtureRoot, plugins: [] },
    ];
    for (const value of invalidInputs) {
      const controlled = controlledApi();
      const exit = await Effect.runPromise(
        Effect.exit(
          withService(
            controlled.api,
            (service) => service.withJavaScriptBundle(value as typeof bundleInput, () => Effect.void),
          ),
        ),
      );
      expect(Exit.isFailure(exit), JSON.stringify(value)).toBe(true);
      if (Exit.isFailure(exit)) expect(firstFailure(exit.cause)).toHaveProperty("_tag", "InvalidBundleInput");
      expect(controlled.events, JSON.stringify(value)).toEqual([]);
    }
  });

  it("maps scoped temp, write, and final stat failures without invoking the callback", async () => {
    const hostFileSystem = await Effect.runPromise(
      FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
    );
    const failure = (method: string, pathOrDescriptor?: string) =>
      PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method,
        pathOrDescriptor,
        description: "fixture failure",
      });
    const cases: ReadonlyArray<{
      readonly operation: "make-temp" | "write" | "stat";
      readonly fileSystem: FileSystem.FileSystem;
    }> = [
      {
        operation: "make-temp",
        fileSystem: {
          ...hostFileSystem,
          makeTempDirectory: () => Effect.fail(failure("makeTempDirectory")),
        },
      },
      {
        operation: "write",
        fileSystem: {
          ...hostFileSystem,
          writeFile: (file) => Effect.fail(failure("writeFile", file)),
        },
      },
      {
        operation: "stat",
        fileSystem: {
          ...hostFileSystem,
          stat: (file) =>
            /\/main\.(?:mjs|cjs)$/.test(file)
              ? Effect.fail(failure("stat", file))
              : hostFileSystem.stat(file),
        },
      },
    ];
    for (const testCase of cases) {
      const controlled = controlledApi();
      let invoked = false;
      const exit = await Effect.runPromise(Effect.exit(withServiceAndFileSystem(
        controlled.api,
        testCase.fileSystem,
        (service) =>
          service.withJavaScriptBundle(bundleInput, () => {
            invoked = true;
            return Effect.void;
          }),
      )));
      expect(invoked, testCase.operation).toBe(false);
      expect(Exit.isFailure(exit), testCase.operation).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(firstFailure(exit.cause)).toMatchObject({
          _tag: "BundleMaterializationFailed",
          operation: testCase.operation,
        });
      }
      if (testCase.operation === "make-temp") expect(controlled.events).toEqual([]);
      else expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
    }
  });

  it("bounds diagnostics by count and UTF-8 byte length", async () => {
    const controlled = controlledApi({
      rebuild: async () =>
        Promise.reject({
          errors: Array.from({ length: 101 }, (_, index) => ({
            id: index === 0 ? "é".repeat(200) : `id-${index}`,
            text: index === 0 ? "😀".repeat(5_000) : `text-${index}`,
            location: index === 0 ? { file: "界".repeat(2_000), line: 1, column: 0 } : null,
          })),
        }),
    });
    const exit = await Effect.runPromise(
      Effect.exit(
        withService(controlled.api, (service) => service.withJavaScriptBundle(bundleInput, () => Effect.void)),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = firstFailure(exit.cause) as {
        readonly _tag: string;
        readonly diagnostics: readonly {
          readonly id: string;
          readonly text: string;
          readonly location?: { readonly file: string };
        }[];
        readonly truncated: boolean;
      };
      expect(error).toMatchObject({ _tag: "EsbuildFailed", truncated: true });
      expect(error.diagnostics).toHaveLength(100);
      expect(new TextEncoder().encode(error.diagnostics[0]?.id).byteLength).toBeLessThanOrEqual(256);
      expect(new TextEncoder().encode(error.diagnostics[0]?.text).byteLength).toBeLessThanOrEqual(16 * 1024);
      expect(new TextEncoder().encode(error.diagnostics[0]?.location?.file).byteLength).toBeLessThanOrEqual(4 * 1024);
    }
  });

  it("rejects malformed inputs before context creation", async () => {
    const values: unknown[] = [
      null,
      [],
      {},
      { entrypoint: "", format: "esm" },
      { entrypoint: "valid.ts\0", format: "esm" },
      { entrypoint: "valid.ts", format: "other" },
      { entrypoint: "valid.ts", format: "esm", cwd: "" },
      { entrypoint: "valid.ts", format: "esm", cwd: "bad\0cwd" },
      { entrypoint: "css-entry.css", format: "esm", cwd: fixtureRoot },
      { entrypoint: "absent.js", format: "esm", cwd: fixtureRoot },
    ];
    for (const value of values) {
      const controlled = controlledApi();
      const exit = await Effect.runPromise(
        Effect.exit(
          withService(
            controlled.api,
            (service) => service.withJavaScriptBundle(value as typeof bundleInput, () => Effect.void),
          ),
        ),
      );
      expect(Exit.isFailure(exit), JSON.stringify(value)).toBe(true);
      if (Exit.isFailure(exit)) expect(firstFailure(exit.cause)).toBeInstanceOf(InvalidBundleInput);
      expect(controlled.events).toEqual([]);
    }
  });

  it("rejects returned warnings and malformed successful structured results", async () => {
    const warning = { id: "fixture-warning", text: "warning" } as esbuild.Message;
    const cases = [
      controlledApi({ rebuild: async (options) => outputFor(options, { warnings: [warning] }) }),
      controlledApi({
        rebuild: async (options) => {
          const result = outputFor(options);
          const output = Object.values(result.metafile.outputs)[0]!;
          return outputFor(options, {
            metafile: { ...result.metafile, outputs: { ...result.metafile.outputs, extra: output } },
          });
        },
      }),
      controlledApi({
        rebuild: async (options) => {
          const result = outputFor(options);
          const output = Object.values(result.metafile.outputs)[0]!;
          return outputFor(options, {
            metafile: {
              ...result.metafile,
              outputs: { [options.outfile!]: { ...output, cssBundle: "main.css" } },
            },
          });
        },
      }),
      controlledApi({
        rebuild: async (options) => {
          const result = outputFor(options);
          const output = Object.values(result.metafile.outputs)[0]!;
          return outputFor(options, {
            metafile: {
              ...result.metafile,
              outputs: {
                [options.outfile!]: {
                  ...output,
                  imports: [{ path: "node:fs", kind: "require-call", external: true }],
                },
              },
            },
          });
        },
      }),
    ];
    for (const [index, controlled] of cases.entries()) {
      const exit = await Effect.runPromise(
        Effect.exit(
          withService(controlled.api, (service) => service.withJavaScriptBundle(bundleInput, () => Effect.void)),
        ),
      );
      expect(Exit.isFailure(exit), String(index)).toBe(true);
      expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
      if (Exit.isFailure(exit)) {
        expect(firstFailure(exit.cause)).toHaveProperty(
          "_tag",
          index === 0 ? "EsbuildFailed" : "JavaScriptBundleInvalid",
        );
      }
    }
  });

  it("attempts dispose after cleanup failures and leaves them as defects", async () => {
    for (
      const controlled of [
        controlledApi({ cancel: async () => Promise.reject(new Error("cancel sentinel")) }),
        controlledApi({ dispose: async () => Promise.reject(new Error("dispose sentinel")) }),
        controlledApi({
          cancel: async () => Promise.reject(new Error("cancel sentinel")),
          dispose: async () => Promise.reject(new Error("dispose sentinel")),
        }),
      ]
    ) {
      const exit = await Effect.runPromise(
        Effect.exit(
          withService(controlled.api, (service) => service.withJavaScriptBundle(bundleInput, () => Effect.void)),
        ),
      );
      expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true);
      expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
    }
  });

  it("preserves callback and rebuild interruption while awaiting cleanup", async () => {
    for (const rebuildHangs of [false, true]) {
      let callbackStarted = false;
      const controlled = controlledApi(
        rebuildHangs
          ? { rebuild: async () => await new Promise<CapturedResult>(() => undefined) }
          : {},
      );
      const fiber = Effect.runFork(
        withService(
          controlled.api,
          (service) =>
            service.withJavaScriptBundle(
              bundleInput,
              () => Effect.sync(() => void (callbackStarted = true)).pipe(Effect.andThen(Effect.never)),
            ),
        ),
      );
      for (let index = 0; index < 200; index++) {
        if (rebuildHangs ? controlled.events.includes("rebuild:start") : callbackStarted) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await Effect.runPromise(Fiber.interrupt(fiber));
      const exit = await Effect.runPromise(Fiber.await(fiber));
      expect(Exit.isFailure(exit) && Cause.interruptors(exit.cause).size > 0).toBe(true);
      expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
    }
  });

  it("adds cleanup defects to rebuild interruption without translating either", async () => {
    const controlled = controlledApi({
      rebuild: async () => await new Promise<CapturedResult>(() => undefined),
      cancel: async () => Promise.reject(new Error("cancel during interruption")),
    });
    const fiber = Effect.runFork(
      withService(controlled.api, (service) => service.withJavaScriptBundle(bundleInput, () => Effect.void)),
    );
    for (let index = 0; index < 200 && !controlled.events.includes("rebuild:start"); index++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(firstFailure(exit.cause)).toBeUndefined();
    expect(controlled.events.slice(-4)).toEqual(cleanupEvents);
  });

  it("keeps exact package-private tags", () => {
    expect(new InvalidBundleInput({ reason: "invalid-entrypoint" })._tag).toBe("InvalidBundleInput");
    expect(() => new InvalidBundleInput({ reason: "fixture" as never })).toThrow();
    expect(new JavaScriptBundleInvalid({ reason: "expected-one-output-file" })._tag).toBe("JavaScriptBundleInvalid");
    expect(EsbuildServiceTag.key).toBe("effect-build-esbuild/Esbuild");
  });
});
