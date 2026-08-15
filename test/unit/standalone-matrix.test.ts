import { NodeServices } from "@effect/platform-node";
import { Cause, Crypto, Effect, Exit, Fiber, FileSystem, Path, Result, Schema } from "effect";
import { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { targetEntries as bunTargetEntries } from "../../packages/effect-build-bun/src/Adapter.js";
import {
  definition as denoDefinition,
  targetEntries as denoTargetEntries,
  type ValidatedOptions as ValidatedDenoOptions,
} from "../../packages/effect-build-deno/src/Adapter.js";
import type { ExecutableArtifact } from "../../packages/effect-build/src/standalone/Artifact.js";
import {
  type BuildError,
  InvalidDriverOptions,
  OutputInvalid,
  OutputLocked,
  OutputMissing,
  PublicationFailed,
  TargetUnsupported,
  ToolFailed,
  ToolNotFound,
  ToolProbeFailed,
} from "../../packages/effect-build/src/standalone/BuildError.js";
import {
  captureCellResult,
  type CellFailureFor,
  type CompileExecutableMatrixInput,
  makeMatrixFailedFor,
  type MatrixErrorFor,
  type MatrixFailedFor,
} from "../../packages/effect-build/src/standalone/CompileExecutableMatrix.js";
import type { CompilerService } from "../../packages/effect-build/src/standalone/Driver.js";
import type {
  CellExecutionError,
  CommandCompilerAdapter,
  DiscoveredCompiler,
  OptionsValidation,
} from "../../packages/effect-build/src/standalone/internal/CompilerAdapter.js";
import { makeCompilerService } from "../../packages/effect-build/src/standalone/internal/CompilerEngine.js";
import { makeTargetTable, type TargetTable } from "../../packages/effect-build/src/standalone/internal/TargetTable.js";
import {
  CellFailure,
  InvalidMatrixInput,
  MatrixError,
  MatrixFailed,
  MatrixIssue,
} from "../../packages/effect-build/src/standalone/MatrixError.js";
import type { SystemTarget } from "../../packages/effect-build/src/standalone/Target.js";

type BunTarget = (typeof bunTargetEntries)[number][0];
type DenoTarget = (typeof denoTargetEntries)[number][0];
type BunStages = readonly [{
  readonly operation: "compile-executable";
  readonly tool: { readonly name: "bun"; readonly version: string; readonly path: string };
}];
type DenoStages = typeof denoDefinition.Stages.Type;
type FixtureStages<Name extends string> = readonly [{
  readonly operation: "compile-executable";
  readonly tool: { readonly name: Name; readonly version: string; readonly path: string };
}];
const bunTargetTable = makeTargetTable(bunTargetEntries);
const denoTargetTable = makeTargetTable(denoTargetEntries);

const denoAdapter: CommandCompilerAdapter<"deno", DenoTarget, DenoStages, ValidatedDenoOptions> = {
  toolName: "deno",
  targetTable: denoTargetTable,
  validateOptions: (input) => {
    const validation = denoDefinition.validateOptions(input);
    return Result.isSuccess(validation)
      ? { _tag: "Valid", value: validation.success }
      : {
        _tag: "Invalid",
        error: new InvalidDriverOptions({ tool: "deno", reason: validation.failure }),
      };
  },
  renderArgv: (request) =>
    denoDefinition.renderArgv({
      input: {
        entrypoint: request.entrypoint,
        ...(request.target === undefined ? {} : { target: request.target }),
        options: request.options,
      },
      ...(request.target === undefined ? {} : { nativeTarget: denoTargetTable.nativeToken(request.target) }),
      stagedOutfile: request.stagedOutfile,
    }),
  interpretFailure: (completion) =>
    new ToolFailed({
      tool: "deno",
      exitCode: completion.exitCode,
      diagnostics: [...denoDefinition.interpretFailure(completion)],
    }),
  decodeStages: (input) =>
    Result.mapError(
      Schema.decodeUnknownResult(denoDefinition.Stages, { onExcessProperty: "error" })(input),
      () => new ToolFailed({ tool: "deno", exitCode: 1, diagnostics: [] }),
    ),
};

const roots: string[] = [];
const childPids = new Set<number>();
const fixture = fileURLToPath(new URL("../fixtures/matrix/fake-compiler.mjs", import.meta.url));

afterEach(() => {
  for (const pid of childPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The assertion path already proved the child was reaped.
    }
  }
  childPids.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-matrix-"));
  roots.push(root);
  return root;
};

type FixtureMode = "success" | "fail" | "hang" | "missing" | "invalid";

interface FixtureOptions {
  readonly marker?: string;
}

interface FixtureBehavior {
  readonly mode?: FixtureMode;
  readonly delay?: number;
}

interface FixtureAdapterConfig<SupportedTarget extends SystemTarget> {
  readonly events: string;
  readonly sentinels?: string;
  readonly behavior?: Readonly<Partial<Record<SupportedTarget, FixtureBehavior>>>;
  readonly invalidOptions?: boolean;
  readonly failureDefectTarget?: SupportedTarget;
  readonly onValidate?: () => void;
  readonly onRender?: (target: SupportedTarget) => void;
}

const fixtureAdapter = <const Name extends string, SupportedTarget extends SystemTarget>(
  toolName: Name,
  targetTable: TargetTable<SupportedTarget>,
  config: FixtureAdapterConfig<SupportedTarget>,
): CommandCompilerAdapter<Name, SupportedTarget, FixtureStages<Name>, FixtureOptions> => ({
  toolName,
  targetTable,
  validateOptions: (value): OptionsValidation<FixtureOptions> => {
    config.onValidate?.();
    if (config.invalidOptions === true) {
      return {
        _tag: "Invalid",
        error: new InvalidDriverOptions({ tool: toolName, reason: "fixture options rejected" }),
      };
    }
    const options: unknown = value ?? {};
    if (
      typeof options !== "object" || options === null || Array.isArray(options)
      || Object.keys(options).some((key) => key !== "marker")
      || ("marker" in options && typeof options.marker !== "string")
    ) {
      return {
        _tag: "Invalid",
        error: new InvalidDriverOptions({ tool: toolName, reason: "invalid fixture options" }),
      };
    }
    return { _tag: "Valid", value: options as FixtureOptions };
  },
  renderArgv: (request) => {
    const target = request.target;
    if (target === undefined) throw new Error("matrix fixture requires a target");
    config.onRender?.(target);
    const behavior = config.behavior?.[target];
    return [
      fixture,
      "--outfile",
      request.stagedOutfile,
      "--target",
      target,
      "--events",
      config.events,
      ...(behavior?.mode === undefined ? [] : ["--mode", behavior.mode]),
      ...(behavior?.delay === undefined ? [] : ["--delay", String(behavior.delay)]),
      ...(config.sentinels === undefined ? [] : ["--sentinels", config.sentinels]),
      ...(request.options.marker === undefined ? [] : ["--marker", request.options.marker]),
    ];
  },
  interpretFailure: (completion) => {
    if (
      config.failureDefectTarget !== undefined
      && completion.stderr.text.includes(config.failureDefectTarget)
    ) throw new Error(`failure interpretation defect: ${config.failureDefectTarget}`);
    return new ToolFailed({
      tool: toolName,
      exitCode: completion.exitCode,
      diagnostics: [
        { channel: "stdout", ...completion.stdout },
        { channel: "stderr", ...completion.stderr },
      ],
    });
  },
  decodeStages: (input) => {
    if (
      Array.isArray(input)
      && input.length === 1
      && typeof input[0] === "object"
      && input[0] !== null
      && "tool" in input[0]
      && typeof input[0].tool === "object"
      && input[0].tool !== null
      && "name" in input[0].tool
      && input[0].tool.name === toolName
    ) return Result.succeed(input as unknown as FixtureStages<Name>);
    return Result.fail(new ToolFailed({ tool: toolName, exitCode: 1, diagnostics: [] }));
  },
});

const discoveredCompiler = <const Name extends string>(toolName: Name): DiscoveredCompiler<Name> => ({
  artifactTool: {
    name: toolName,
    version: toolName === "bun" ? "1.3.9" : "2.9.3",
    path: process.execPath,
  },
});

const runnerFor = <const Name extends string, SupportedTarget extends SystemTarget>(
  toolName: Name,
  targetTable: TargetTable<SupportedTarget>,
  config: FixtureAdapterConfig<SupportedTarget>,
  pathService?: Path.Path,
): Promise<CompilerService<Name, SupportedTarget, FixtureStages<Name>, FixtureOptions>> => {
  const effect = makeCompilerService(fixtureAdapter(toolName, targetTable, config), discoveredCompiler(toolName));
  return Effect.runPromise(
    (pathService === undefined ? effect : effect.pipe(Effect.provideService(Path.Path, pathService))).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );
};

const countServiceCalls = <Service extends object>(
  service: Service,
  onCall: () => void,
): Service =>
  new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: readonly unknown[]) => {
        onCall();
        return Reflect.apply(value, target, args);
      };
    },
  });

interface FixtureEvent {
  readonly event: string;
  readonly target: string;
  readonly pid: number;
  readonly marker?: string;
}

const readEvents = (file: string): ReadonlyArray<FixtureEvent> =>
  existsSync(file)
    ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as FixtureEvent)
    : [];

const maximumActive = (events: ReadonlyArray<FixtureEvent>): number => {
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    if (event.event === "start") {
      active += 1;
      maximum = Math.max(maximum, active);
    } else if (["finish", "fail", "missing", "invalid"].includes(event.event)) {
      active -= 1;
    }
  }
  expect(active).toBe(0);
  return maximum;
};

const waitUntil = async (predicate: () => boolean, timeout = 5_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!predicate()) throw new Error("timed out waiting for matrix fixture state");
};

const pidIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const outputPath = (outdir: string, name: string, target: SystemTarget): string =>
  join(outdir, `${name}-${target}${target.startsWith("windows-") ? ".exe" : ""}`);

const bunTool = { name: "bun", version: "1.3.9", path: "/tools/bun" } as const;
const denoTool = { name: "deno", version: "2.9.3", path: "/tools/deno" } as const;

const bunArtifact = {
  path: "/dist/app-linux-x64-gnu",
  bytes: 42,
  target: "linux-x64-gnu",
  provider: "bun",
  stages: [{ operation: "compile-executable", tool: bunTool }],
} as const;

const bunFailure = {
  provider: "bun",
  target: "windows-x64",
  path: "/dist/app-windows-x64.exe",
  error: new ToolFailed({
    tool: "bun",
    exitCode: 7,
    diagnostics: [{ channel: "stderr", text: "boom", truncated: false }],
  }),
} as const;

const denoArtifact = {
  path: "/dist/app-windows-aarch64.exe",
  bytes: 64,
  target: "windows-aarch64",
  provider: "deno",
  stages: [{ operation: "compile-executable", tool: denoTool }],
} as const;

const denoFailure = {
  provider: "deno",
  target: "macos-aarch64",
  path: "/dist/app-macos-aarch64",
  error: new OutputMissing({ path: "/dist/app-macos-aarch64" }),
} as const;

type BunMatrixFailureInput = Parameters<
  typeof makeMatrixFailedFor<"bun", BunTarget, BunStages>
>[0]["failures"][number];

const reachableExecutionErrors: readonly CellExecutionError[] = [
  new ToolFailed({ tool: "bun", exitCode: 1, diagnostics: [] }),
  new OutputMissing({ path: "/dist/app" }),
  new OutputInvalid({ path: "/dist/app", reason: "bad-header" }),
  new OutputLocked({ path: "/dist/app" }),
  new PublicationFailed({ path: "/dist/app", operation: "rename", reason: "EIO" }),
];
const acceptsReachableExecutionError = (error: CellExecutionError): BunMatrixFailureInput => ({
  provider: "bun",
  target: "macos-x64",
  path: "/dist/app",
  error,
});
void reachableExecutionErrors.map(acceptsReachableExecutionError);

const unreachableAcquisitionAndPreflightErrors = [
  // @ts-expect-error Tool discovery cannot be a completed matrix-cell execution failure.
  new ToolNotFound({ tool: "bun", command: "bun" }) satisfies CellExecutionError,
  // @ts-expect-error Tool probing cannot be a completed matrix-cell execution failure.
  new ToolProbeFailed({ tool: "bun", reason: "bad probe" }) satisfies CellExecutionError,
  // @ts-expect-error Target preflight cannot be a completed matrix-cell execution failure.
  new TargetUnsupported({ tool: "bun", requested: "bad", available: [] }) satisfies CellExecutionError,
  // @ts-expect-error Options preflight cannot be a completed matrix-cell execution failure.
  new InvalidDriverOptions({ tool: "bun", reason: "bad options" }) satisfies CellExecutionError,
];
void unreachableAcquisitionAndPreflightErrors;

const decodeMatrixIssue = Schema.decodeUnknownSync(MatrixIssue);
const decodeInvalidMatrixInput = Schema.decodeUnknownSync(InvalidMatrixInput);
const decodeCellFailure = Schema.decodeUnknownSync(CellFailure);
const decodeMatrixFailed = Schema.decodeUnknownSync(MatrixFailed);
const decodeMatrixError = Schema.decodeUnknownSync(MatrixError);

const assertConstructorRejects = (value: unknown): void => {
  expect(() => new MatrixFailed(value as never)).toThrow();
};

describe("standalone matrix execution", () => {
  it("totally rejects malformed scalar requests before tool, filesystem, render, or child work", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    const outputDirectory = join(root, "out");
    let fileSystemCalls = 0;
    let childProcessCalls = 0;
    let selectedToolReads = 0;
    let validations = 0;
    let renders = 0;
    const services = await Effect.runPromise(
      Effect.gen(function*() {
        return {
          crypto: yield* Crypto.Crypto,
          fileSystem: yield* FileSystem.FileSystem,
          path: yield* Path.Path,
          spawner: yield* EffectChildProcessSpawner.ChildProcessSpawner,
        };
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    const adapter = fixtureAdapter("bun", bunTargetTable, {
      events,
      onValidate: () => validations += 1,
      onRender: () => renders += 1,
    });
    const tool: DiscoveredCompiler<"bun"> = {
      artifactTool: {
        name: "bun",
        version: "1.3.9",
        get path() {
          selectedToolReads += 1;
          return process.execPath;
        },
      },
    };
    const runner = await Effect.runPromise(
      makeCompilerService(adapter, tool).pipe(
        Effect.provideService(Crypto.Crypto, services.crypto),
        Effect.provideService(
          FileSystem.FileSystem,
          countServiceCalls(services.fileSystem, () => fileSystemCalls += 1),
        ),
        Effect.provideService(Path.Path, services.path),
        Effect.provideService(
          EffectChildProcessSpawner.ChildProcessSpawner,
          countServiceCalls(services.spawner, () => childProcessCalls += 1),
        ),
      ),
    );
    const base = {
      entrypoint: "unused.ts",
      outfile: join(outputDirectory, "app"),
      target: "macos-x64",
    } as const;
    const cases: ReadonlyArray<readonly [string, unknown, Readonly<Record<string, unknown>>]> = [
      ["null", null, { _tag: "InvalidDriverOptions", reason: "input must be a non-null object" }],
      ["undefined", undefined, { _tag: "InvalidDriverOptions", reason: "input must be a non-null object" }],
      ["array", [], { _tag: "InvalidDriverOptions", reason: "input must be a non-null object" }],
      ["nonobject", 42, { _tag: "InvalidDriverOptions", reason: "input must be a non-null object" }],
      ["unknown field", { ...base, extra: true }, {
        _tag: "InvalidDriverOptions",
        reason: "input must not contain unknown fields",
      }],
      ["missing entrypoint", { outfile: base.outfile, target: base.target }, {
        _tag: "InvalidDriverOptions",
        reason: "entrypoint must be a non-empty string",
      }],
      ["nonstring entrypoint", { ...base, entrypoint: 1 }, {
        _tag: "InvalidDriverOptions",
        reason: "entrypoint must be a non-empty string",
      }],
      ["empty entrypoint", { ...base, entrypoint: "" }, {
        _tag: "InvalidDriverOptions",
        reason: "entrypoint must be a non-empty string",
      }],
      ["NUL entrypoint", { ...base, entrypoint: "main\0.ts" }, {
        _tag: "InvalidDriverOptions",
        reason: "entrypoint must not contain NUL",
      }],
      ["missing outfile", { entrypoint: base.entrypoint, target: base.target }, {
        _tag: "InvalidDriverOptions",
        reason: "outfile must be a non-empty string",
      }],
      ["nonstring outfile", { ...base, outfile: 1 }, {
        _tag: "InvalidDriverOptions",
        reason: "outfile must be a non-empty string",
      }],
      ["empty outfile", { ...base, outfile: "" }, {
        _tag: "InvalidDriverOptions",
        reason: "outfile must be a non-empty string",
      }],
      ["NUL outfile", { ...base, outfile: "app\0" }, {
        _tag: "InvalidDriverOptions",
        reason: "outfile must not contain NUL",
      }],
      ["undefined cwd", { ...base, cwd: undefined }, {
        _tag: "InvalidDriverOptions",
        reason: "cwd must be a string",
      }],
      ["nonstring cwd", { ...base, cwd: 1 }, {
        _tag: "InvalidDriverOptions",
        reason: "cwd must be a string",
      }],
      ["NUL cwd", { ...base, cwd: "work\0dir" }, {
        _tag: "InvalidDriverOptions",
        reason: "cwd must not contain NUL",
      }],
      ["undefined digest", { ...base, digest: undefined }, {
        _tag: "InvalidDriverOptions",
        reason: "digest must be boolean",
      }],
      ["nonboolean digest", { ...base, digest: "yes" }, {
        _tag: "InvalidDriverOptions",
        reason: "digest must be boolean",
      }],
      ["unsupported target", { ...base, target: "not-a-target" }, {
        _tag: "TargetUnsupported",
        requested: "not-a-target",
      }],
      ["invalid provider options", { ...base, options: { marker: 1 } }, {
        _tag: "InvalidDriverOptions",
        reason: "invalid fixture options",
      }],
      ["first deterministic issue", {
        ...base,
        entrypoint: "",
        outfile: "",
        target: "not-a-target",
        cwd: 1,
        digest: "yes",
        options: { marker: 1 },
      }, {
        _tag: "InvalidDriverOptions",
        reason: "entrypoint must be a non-empty string",
      }],
      ["target precedes later field issues", {
        ...base,
        target: "not-a-target",
        cwd: 1,
        digest: "yes",
        options: { marker: 1 },
      }, {
        _tag: "TargetUnsupported",
        requested: "not-a-target",
      }],
    ];

    for (const [label, input, expected] of cases) {
      const before = { fileSystemCalls, childProcessCalls, selectedToolReads, validations, renders };
      const failure = await Effect.runPromise(runner.compileExecutable(input as never)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure, label).toMatchObject({ tool: "bun", ...expected });
      expect(validations - before.validations, label).toBe(label === "invalid provider options" ? 1 : 0);
      expect({ fileSystemCalls, childProcessCalls, selectedToolReads, renders }, label).toEqual({
        fileSystemCalls: before.fileSystemCalls,
        childProcessCalls: before.childProcessCalls,
        selectedToolReads: before.selectedToolReads,
        renders: before.renders,
      });
      expect(readEvents(events), label).toEqual([]);
      expect(existsSync(outputDirectory), label).toBe(false);
    }
    expect(validations).toBeGreaterThan(0);
  });

  it("uses the same first common-field issue for scalar and one-cell matrix preflight", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    const runner = await runnerFor("bun", bunTargetTable, { events });
    const scalarFailure = await Effect.runPromise(runner.compileExecutable({
      entrypoint: "",
      outfile: join(root, "out", "app"),
      target: "macos-x64",
      cwd: 1,
      digest: "yes",
      options: { marker: 1 },
    } as never)).then(
      () => undefined,
      (error: unknown) => error,
    );
    const matrixFailure = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "",
      outdir: join(root, "out"),
      name: "app",
      targets: ["macos-x64"],
      cwd: 1,
      digest: "yes",
      options: { marker: 1 },
    } as never)).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(scalarFailure).toMatchObject({
      _tag: "InvalidDriverOptions",
      reason: "entrypoint must be a non-empty string",
    });
    expect(matrixFailure).toMatchObject({
      _tag: "InvalidMatrixInput",
      issues: [
        { field: "entrypoint", reason: "must be a non-empty string" },
        { field: "cwd", reason: "must be a string" },
        { field: "digest", reason: "must be boolean" },
        { field: "options", reason: "invalid fixture options" },
      ],
    });
    expect(readEvents(events)).toEqual([]);
  });

  it("publishes every Bun and Deno target under the canonical ordered filenames", async () => {
    const root = makeRoot();
    const bunEvents = join(root, "bun-events.jsonl");
    const denoEvents = join(root, "deno-events.jsonl");
    let bunValidations = 0;
    let denoValidations = 0;
    const bunRunner = await runnerFor("bun", bunTargetTable, {
      events: bunEvents,
      onValidate: () => bunValidations += 1,
    });
    const denoRunner = await runnerFor("deno", denoTargetTable, {
      events: denoEvents,
      onValidate: () => denoValidations += 1,
    });

    const bunArtifacts = await Effect.runPromise(bunRunner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "bun"),
      name: "app",
      targets: bunTargetTable.Target.literals,
      options: { marker: "shared" },
      digest: true,
      concurrency: 3,
    }));
    const denoArtifacts = await Effect.runPromise(denoRunner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "deno"),
      name: "app",
      targets: denoTargetTable.Target.literals,
      concurrency: 3,
    }));

    expect(bunArtifacts.map((artifact) => artifact.target)).toEqual(bunTargetTable.Target.literals);
    expect(bunArtifacts.map((artifact) => basename(artifact.path))).toEqual([
      "app-macos-x64",
      "app-macos-aarch64",
      "app-linux-x64-gnu",
      "app-linux-x64-musl",
      "app-linux-aarch64-gnu",
      "app-windows-x64.exe",
    ]);
    expect(denoArtifacts.map((artifact) => artifact.target)).toEqual(denoTargetTable.Target.literals);
    expect(denoArtifacts.map((artifact) => basename(artifact.path))).toEqual([
      "app-macos-x64",
      "app-macos-aarch64",
      "app-linux-x64-gnu",
      "app-linux-aarch64-gnu",
      "app-windows-x64.exe",
      "app-windows-aarch64.exe",
    ]);
    expect([...bunArtifacts, ...denoArtifacts].every((artifact) => existsSync(artifact.path))).toBe(true);
    expect(bunArtifacts.every((artifact) => artifact.digest?.startsWith("sha256:") === true)).toBe(true);
    expect(denoArtifacts.every((artifact) => artifact.digest === undefined)).toBe(true);
    expect(bunValidations).toBe(1);
    expect(denoValidations).toBe(1);
    expect(readEvents(bunEvents)).toHaveLength(12);
    expect(
      readEvents(bunEvents).filter((event) => event.event === "start").map((event) => event.marker),
    ).toEqual(bunTargetTable.Target.literals.map(() => "shared"));
    expect(readEvents(denoEvents)).toHaveLength(12);
  });

  it("reuses one runner and validates shared options exactly once per matrix", async () => {
    const root = makeRoot();
    let validations = 0;
    const runner = await runnerFor("bun", bunTargetTable, {
      events: join(root, "events.jsonl"),
      onValidate: () => validations += 1,
    });

    const first = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "first"),
      name: "cli",
      targets: ["macos-x64"],
    }));
    const second = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "second"),
      name: "cli",
      targets: ["windows-x64"],
    }));

    expect(first.map((artifact) => basename(artifact.path))).toEqual(["cli-macos-x64"]);
    expect(second.map((artifact) => basename(artifact.path))).toEqual(["cli-windows-x64.exe"]);
    expect(validations).toBe(2);
  });

  it("resolves a relative outdir against cwd before publishing a canonical real-cell path", async () => {
    const root = makeRoot();
    const runner = await runnerFor("bun", bunTargetTable, {
      events: join(root, "events.jsonl"),
    });
    const [artifact] = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      cwd: root,
      outdir: "dist",
      name: "cli",
      targets: ["windows-x64"],
    }));
    const expected = join(root, "dist", "cli-windows-x64.exe");

    expect(artifact?.path).toBe(expected);
    expect(isAbsolute(artifact?.path ?? "")).toBe(true);
    expect(basename(artifact?.path ?? "")).toBe("cli-windows-x64.exe");
    expect(existsSync(expected)).toBe(true);
  });

  it("preserves input order under reverse completion and enforces default and explicit concurrency", async () => {
    const root = makeRoot();
    const targets = ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl"] as const;
    const boundedEvents = join(root, "bounded.jsonl");
    const bounded = await runnerFor("bun", bunTargetTable, {
      events: boundedEvents,
      behavior: {
        "macos-x64": { delay: 240 },
        "macos-aarch64": { delay: 160 },
        "linux-x64-gnu": { delay: 80 },
        "linux-x64-musl": { delay: 0 },
      },
    });
    const artifacts = await Effect.runPromise(bounded.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "bounded"),
      name: "app",
      targets,
      concurrency: 2,
    }));
    expect(artifacts.map((artifact) => artifact.target)).toEqual(targets);
    expect(maximumActive(readEvents(boundedEvents))).toBe(2);

    const sequentialEvents = join(root, "sequential.jsonl");
    const sequential = await runnerFor("bun", bunTargetTable, {
      events: sequentialEvents,
      behavior: {
        "macos-x64": { delay: 30 },
        "macos-aarch64": { delay: 30 },
        "linux-x64-gnu": { delay: 30 },
      },
    });
    await Effect.runPromise(sequential.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "sequential"),
      name: "app",
      targets: ["macos-x64", "macos-aarch64", "linux-x64-gnu"],
    }));
    expect(maximumActive(readEvents(sequentialEvents))).toBe(1);
  });

  it("accumulates deterministic preflight issues before directory, render, or child side effects", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let validations = 0;
    let renders = 0;
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      invalidOptions: true,
      onValidate: () => validations += 1,
      onRender: () => renders += 1,
    });
    const invalidInput = {
      entrypoint: "",
      outdir: `${join(root, "out")}\0`,
      name: "!invalid",
      targets: ["not-a-target", "macos-x64", "macos-x64"],
      cwd: 123,
      digest: "yes",
      options: { marker: "x" },
      concurrency: 0,
      extraMatrixField: true,
    } as never;
    const error = await Effect.runPromise(runner.compileExecutableMatrix(invalidInput)).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(error).toMatchObject({
      _tag: "InvalidMatrixInput",
      issues: [
        { field: "entrypoint" },
        { field: "outdir" },
        { field: "name" },
        { field: "targets", index: 0 },
        { field: "targets", index: 2 },
        { field: "cwd" },
        { field: "digest" },
        { field: "options" },
        { field: "concurrency" },
      ],
    });
    expect(validations).toBe(1);
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(join(root, "out"))).toBe(false);
  });

  it("rejects every invalid name, target, option, and concurrency variant without starting a cell", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let renders = 0;
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      onRender: () => renders += 1,
    });
    const base = {
      entrypoint: "unused.ts",
      outdir: join(root, "out"),
      name: "app",
      targets: ["macos-x64"],
    } as const;
    const cases: ReadonlyArray<unknown> = [
      null,
      { ...base, targets: [] },
      { ...base, targets: ["macos-x64", "macos-x64"] },
      { ...base, targets: ["linux-aarch64-musl"] },
      ...["", ".leading", "space name", "x".repeat(129)].map((name) => ({ ...base, name })),
      { ...base, options: { marker: 1 } },
      ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, -Infinity, "unbounded"].map(
        (concurrency) => ({ ...base, concurrency }),
      ),
    ];

    for (const input of cases) {
      const failure = await Effect.runPromise(runner.compileExecutableMatrix(input as never)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toMatchObject({ _tag: "InvalidMatrixInput" });
    }
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(base.outdir)).toBe(false);
  });

  it("rejects explicitly present undefined optional fields in deterministic order with no side effects", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let renders = 0;
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      onRender: () => renders += 1,
    });
    const outdir = join(root, "out");
    const failure = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir,
      name: "app",
      targets: ["macos-x64"],
      cwd: undefined,
      digest: undefined,
      concurrency: undefined,
    } as never)).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      _tag: "InvalidMatrixInput",
      issues: [
        { field: "cwd", value: "<non-string:undefined>" },
        { field: "digest", value: "<non-string:undefined>" },
        { field: "concurrency", value: "<non-string:undefined>" },
      ],
    });
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(outdir)).toBe(false);
  });

  it("defensively rejects normalized destination collisions before rendering", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let renders = 0;
    const hostPath = await Effect.runPromise(Path.Path.pipe(Effect.provide(NodeServices.layer)));
    const collisionPath: Path.Path = {
      ...hostPath,
      join: (...parts) => {
        const last = parts.at(-1);
        return last?.startsWith("app-") === true
          ? hostPath.join(...parts.slice(0, -1), "same-output")
          : hostPath.join(...parts);
      },
    };
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      onRender: () => renders += 1,
    }, collisionPath);
    const failure = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir: join(root, "out"),
      name: "app",
      targets: ["macos-x64", "macos-aarch64"],
    })).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      _tag: "InvalidMatrixInput",
      issues: [{ field: "output", index: 1, value: expect.stringContaining("same-output") }],
    });
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(join(root, "out"))).toBe(false);
  });

  it("preserves hostile getter failures as defects without validation or side effects", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let validations = 0;
    let renders = 0;
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      onValidate: () => validations += 1,
      onRender: () => renders += 1,
    });
    const input = {
      entrypoint: "unused.ts",
      outdir: join(root, "out"),
      name: "app",
      get targets(): never {
        throw new Error("hostile targets getter");
      },
    };
    const exit = await Effect.runPromise(Effect.exit(runner.compileExecutableMatrix(input as never)));
    expect(Exit.hasDies(exit)).toBe(true);
    expect(Exit.hasFails(exit)).toBe(false);
    expect(validations).toBe(0);
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(join(root, "out"))).toBe(false);
  });

  it("rejects Deno non-boolean allow-all options before output or child side effects", async () => {
    const root = makeRoot();
    const events = join(root, "events.jsonl");
    let renders = 0;
    const adapter = {
      ...denoAdapter,
      renderArgv: (input: Parameters<typeof denoAdapter.renderArgv>[0]) => {
        renders += 1;
        return denoAdapter.renderArgv(input);
      },
    } satisfies typeof denoAdapter;
    const runner = await Effect.runPromise(
      makeCompilerService(adapter, discoveredCompiler("deno")).pipe(Effect.provide(NodeServices.layer)),
    );
    const outdir = join(root, "out");
    const failure = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir,
      name: "app",
      targets: ["macos-x64"],
      options: { permissions: { all: "yes" } },
    })).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      _tag: "InvalidMatrixInput",
      issues: [{ field: "options", reason: "all permission must be boolean" }],
    });
    expect(renders).toBe(0);
    expect(readEvents(events)).toEqual([]);
    expect(existsSync(outdir)).toBe(false);
  });

  it("collects all typed cell failures in order, reports committed artifacts, and never rolls back", async () => {
    const root = makeRoot();
    const outdir = join(root, "out");
    mkdirSync(outdir);
    const targets = bunTargetTable.Target.literals;
    for (const target of targets) writeFileSync(outputPath(outdir, "app", target), "old");
    const runner = await runnerFor("bun", bunTargetTable, {
      events: join(root, "events.jsonl"),
      behavior: {
        "macos-aarch64": { mode: "fail", delay: 40 },
        "linux-x64-gnu": { mode: "missing", delay: 20 },
        "linux-x64-musl": { mode: "invalid" },
      },
    });
    const failure = await Effect.runPromise(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir,
      name: "app",
      targets,
      concurrency: 3,
    })).then(
      () => undefined,
      (error: unknown) => error as MatrixFailed,
    );

    expect(failure).toMatchObject({
      _tag: "MatrixFailed",
      artifacts: [
        { target: "macos-x64" },
        { target: "linux-aarch64-gnu" },
        { target: "windows-x64" },
      ],
      failures: [
        { target: "macos-aarch64", error: { _tag: "ToolFailed" } },
        { target: "linux-x64-gnu", error: { _tag: "OutputMissing" } },
        { target: "linux-x64-musl", error: { _tag: "OutputInvalid" } },
      ],
    });
    if (!(failure instanceof MatrixFailed)) throw new Error("expected MatrixFailed");
    expect(failure.failures.map((cell) => cell.path)).toEqual([
      outputPath(outdir, "app", "macos-aarch64"),
      outputPath(outdir, "app", "linux-x64-gnu"),
      outputPath(outdir, "app", "linux-x64-musl"),
    ]);
    for (const target of ["macos-aarch64", "linux-x64-gnu", "linux-x64-musl"] as const) {
      expect(readFileSync(outputPath(outdir, "app", target), "utf8")).toBe("old");
    }
    for (const artifact of failure.artifacts) {
      expect(existsSync(artifact.path)).toBe(true);
      expect(readFileSync(artifact.path, "utf8")).not.toBe("old");
    }
    expect(readdirSync(outdir).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
  });

  it("keeps a defect outside MatrixFailed, interrupts its active sibling, and skips queued cells", async () => {
    const root = makeRoot();
    const outdir = join(root, "out");
    const sentinels = join(root, "sentinels");
    mkdirSync(outdir);
    const targets = ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl"] as const;
    for (const target of targets) {
      writeFileSync(outputPath(outdir, "app", target), "old");
    }
    const activeSentinel = join(sentinels, "macos-aarch64.pid");
    const runner = await runnerFor("bun", bunTargetTable, {
      events: join(root, "events.jsonl"),
      sentinels,
      behavior: {
        "macos-x64": { mode: "success" },
        "macos-aarch64": { mode: "hang" },
        "linux-x64-gnu": { mode: "fail", delay: 100 },
      },
      failureDefectTarget: "linux-x64-gnu",
    });

    const exit = await Effect.runPromise(Effect.exit(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir,
      name: "app",
      targets,
      concurrency: 2,
    })));
    expect(Exit.hasDies(exit)).toBe(true);
    expect(Exit.hasFails(exit)).toBe(false);
    const pid = Number(readFileSync(activeSentinel, "utf8"));
    childPids.add(pid);
    await waitUntil(() => !pidIsAlive(pid));
    expect(existsSync(join(sentinels, "linux-x64-musl.pid"))).toBe(false);
    expect(readdirSync(outdir).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
    expect(readFileSync(outputPath(outdir, "app", "macos-x64"), "utf8")).not.toBe("old");
    for (const target of ["macos-aarch64", "linux-x64-gnu", "linux-x64-musl"] as const) {
      expect(readFileSync(outputPath(outdir, "app", target), "utf8")).toBe("old");
    }
  }, 10_000);

  it("interrupts and force-reaps active real children while queued cells never start", async () => {
    const root = makeRoot();
    const outdir = join(root, "out");
    const sentinels = join(root, "sentinels");
    const events = join(root, "events.jsonl");
    mkdirSync(outdir);
    const targets = ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl"] as const;
    for (const target of targets) writeFileSync(outputPath(outdir, "app", target), "old");
    const runner = await runnerFor("bun", bunTargetTable, {
      events,
      sentinels,
      behavior: Object.fromEntries(targets.map((target) => [target, { mode: "hang" }])) as never,
    });
    const fiber = Effect.runFork(runner.compileExecutableMatrix({
      entrypoint: "unused.ts",
      outdir,
      name: "app",
      targets,
      concurrency: 2,
    }));
    const activeSentinels = targets.slice(0, 2).map((target) => join(sentinels, `${target}.pid`));
    await waitUntil(() => activeSentinels.every(existsSync));
    const pids = activeSentinels.map((sentinel) => Number(readFileSync(sentinel, "utf8")));
    for (const pid of pids) childPids.add(pid);
    expect(pids.every(pidIsAlive)).toBe(true);
    expect(targets.slice(2).some((target) => existsSync(join(sentinels, `${target}.pid`)))).toBe(false);

    const interrupting = Effect.runPromise(Fiber.interrupt(fiber));
    const signalEvents = () => readEvents(events).filter((event) => ["SIGINT", "SIGTERM"].includes(event.event));
    await waitUntil(() => pids.every((pid) => signalEvents().some((event) => event.pid === pid)));
    expect(new Set(signalEvents().map((event) => event.pid))).toEqual(new Set(pids));
    await interrupting;
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(Exit.hasFails(exit)).toBe(false);
    await waitUntil(() => pids.every((pid) => !pidIsAlive(pid)));
    expect(targets.slice(2).some((target) => existsSync(join(sentinels, `${target}.pid`)))).toBe(false);
    expect(readdirSync(outdir).filter((name) => name.startsWith(".effect-build-"))).toEqual([]);
    for (const target of targets) expect(readFileSync(outputPath(outdir, "app", target), "utf8")).toBe("old");
  }, 10_000);
});

describe("standalone matrix schemas", () => {
  it("round trips checked input and provider-correlated aggregate errors", () => {
    const invalid = new InvalidMatrixInput({
      issues: [
        { field: "targets", reason: "must be non-empty" },
        { field: "concurrency", reason: "must be a positive safe integer", index: 0, value: "0" },
      ],
    });
    const missingFailure = {
      provider: "bun",
      target: "macos-x64",
      path: "/dist/app-macos-x64",
      error: new OutputMissing({ path: "/dist/app-macos-x64" }),
    } as const;
    const invalidFailure = {
      provider: "bun",
      target: "macos-aarch64",
      path: "/dist/app-macos-aarch64",
      error: new OutputInvalid({ path: "/dist/app-macos-aarch64", reason: "bad-header" }),
    } as const;
    const failed = new MatrixFailed({
      artifacts: [bunArtifact],
      failures: [bunFailure, missingFailure, invalidFailure],
    });

    const invalidEncoded = Schema.encodeSync(InvalidMatrixInput)(invalid);
    const failedEncoded = Schema.encodeSync(MatrixFailed)(failed);
    expect(decodeInvalidMatrixInput(invalidEncoded)).toMatchObject(invalid);
    const decodedFailed = decodeMatrixFailed(failedEncoded);
    expect(decodedFailed).toMatchObject(failed);
    expect(decodedFailed.artifacts.map((artifact) => artifact.target)).toEqual(["linux-x64-gnu"]);
    expect(decodedFailed.failures.map((failure) => failure.error._tag)).toEqual([
      "ToolFailed",
      "OutputMissing",
      "OutputInvalid",
    ]);
    expect(decodeMatrixError(invalidEncoded)._tag).toBe("InvalidMatrixInput");
    expect(decodeMatrixError(failedEncoded)._tag).toBe("MatrixFailed");

    expect(new MatrixFailed({ artifacts: [], failures: [bunFailure] }).failures).toHaveLength(1);
    expect(new MatrixFailed({ artifacts: [denoArtifact], failures: [denoFailure] }).failures).toHaveLength(1);
    expect(
      new MatrixFailed({
        artifacts: [],
        failures: [{ ...bunFailure, error: new OutputInvalid({ path: bunFailure.path, reason: "bad-header" }) }],
      }).failures,
    ).toHaveLength(1);
  });

  it("rejects malformed matrix issues through decode and live construction", () => {
    for (
      const issue of [
        { field: "unknown", reason: "bad" },
        { field: "targets", reason: "" },
        { field: "targets", reason: "bad", index: -1 },
        { field: "targets", reason: "bad", index: -0 },
        { field: "targets", reason: "bad", index: 1.5 },
        { field: "targets", reason: "bad", index: Number.MAX_SAFE_INTEGER + 1 },
        { field: "targets", reason: "bad", index: Number.NaN },
        { field: "targets", reason: "bad", index: Number.POSITIVE_INFINITY },
        { field: "targets", reason: "bad", value: undefined },
        { field: "targets", reason: "bad", value: 1 },
      ]
    ) {
      expect(() => decodeMatrixIssue(issue)).toThrow();
    }
    expect(() => decodeInvalidMatrixInput({ _tag: "InvalidMatrixInput", issues: [] })).toThrow();
    expect(() => new InvalidMatrixInput({ issues: [] } as never)).toThrow();
    expect(() => new InvalidMatrixInput({ issues: [{ field: "targets", reason: "" }] })).toThrow();
    expect(
      new InvalidMatrixInput({ issues: [{ field: "targets", reason: "bad" }] }).issues[0],
    ).not.toHaveProperty("index");
  });

  it("rejects empty, relative, mixed-provider, and nested-tool-invalid aggregates", () => {
    const cases: ReadonlyArray<unknown> = [
      { artifacts: [], failures: [] },
      { artifacts: [], failures: [{ ...bunFailure, path: "dist/app-windows-x64.exe" }] },
      { artifacts: [bunArtifact], failures: [denoFailure] },
      {
        artifacts: [],
        failures: [{ ...bunFailure, error: new ToolFailed({ tool: "deno", exitCode: 1, diagnostics: [] }) }],
      },
      {
        artifacts: [],
        failures: [{
          ...bunFailure,
          error: new TargetUnsupported({ tool: "deno", requested: "windows-x64", available: [] }),
        }],
      },
    ];

    for (const value of cases) {
      expect(() => decodeMatrixFailed({ _tag: "MatrixFailed", ...(value as object) })).toThrow();
      assertConstructorRejects(value);
    }
  });

  it("rejects duplicate targets and paths within and across both aggregate arrays", () => {
    const secondBunArtifact = {
      ...bunArtifact,
      path: "/dist/app-macos-x64",
      target: "macos-x64",
    } as const;
    const secondBunFailure = {
      ...bunFailure,
      path: "/dist/app-macos-aarch64",
      target: "macos-aarch64",
    } as const;
    const cases: ReadonlyArray<unknown> = [
      { artifacts: [bunArtifact, { ...bunArtifact, path: "/dist/other" }], failures: [bunFailure] },
      { artifacts: [bunArtifact, { ...secondBunArtifact, path: bunArtifact.path }], failures: [bunFailure] },
      { artifacts: [bunArtifact], failures: [bunFailure, { ...bunFailure, path: "/dist/other" }] },
      { artifacts: [bunArtifact], failures: [bunFailure, { ...secondBunFailure, path: bunFailure.path }] },
      { artifacts: [bunArtifact], failures: [{ ...bunFailure, target: bunArtifact.target }] },
      { artifacts: [bunArtifact], failures: [{ ...bunFailure, path: bunArtifact.path }] },
    ];

    for (const value of cases) {
      expect(() => decodeMatrixFailed({ _tag: "MatrixFailed", ...(value as object) })).toThrow();
      assertConstructorRejects(value);
    }
  });

  it("keeps root cell failure decoding provider-neutral over all system targets", () => {
    expect(decodeCellFailure(bunFailure)).toMatchObject(bunFailure);
    expect(decodeCellFailure(denoFailure)).toMatchObject(denoFailure);
    for (const target of ["linux-aarch64-musl", "windows-aarch64", "linux-x64-musl"] as const) {
      expect(decodeCellFailure({ ...bunFailure, target })).toMatchObject({ provider: "bun", target });
    }
    expect(() => decodeCellFailure({ ...bunFailure, target: "browser" })).toThrow();
    expect(() => decodeCellFailure({ ...bunFailure, path: "relative" })).toThrow();
  });
});

describe("standalone matrix typed-result capture", () => {
  const failure = new OutputMissing({ path: "/dist/app" });

  it("captures exactly one typed failure as a Result failure", async () => {
    const exit = await Effect.runPromise(Effect.exit(captureCellResult(Effect.fail(failure))));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(Result.isFailure(exit.value)).toBe(true);
      if (Result.isFailure(exit.value)) expect(exit.value.failure).toBe(failure);
    }
  });

  it("preserves pure defects and interruptions outside the Result", async () => {
    const defect = { message: "defect" };
    const dieExit = await Effect.runPromise(Effect.exit(captureCellResult(Effect.die(defect))));
    const interruptExit = await Effect.runPromise(Effect.exit(captureCellResult(Effect.interrupt)));
    expect(Exit.hasDies(dieExit)).toBe(true);
    expect(Exit.isFailure(dieExit) && dieExit.cause.reasons[0]).toMatchObject({ _tag: "Die", defect });
    expect(Exit.hasInterrupts(interruptExit)).toBe(true);
  });

  it("re-fails the exact original mixed Fail plus Die or Interrupt cause", async () => {
    const mixedDie = Cause.combine(Cause.fail(failure), Cause.die("mixed-defect"));
    const mixedInterrupt = Cause.combine(Cause.fail(failure), Cause.interrupt(123));
    const dieExit = await Effect.runPromise(
      Effect.exit(captureCellResult(Effect.failCause(mixedDie))),
    );
    const interruptExit = await Effect.runPromise(
      Effect.exit(captureCellResult(Effect.failCause(mixedInterrupt))),
    );
    expect(Exit.isFailure(dieExit) && dieExit.cause).toBe(mixedDie);
    expect(Exit.hasFails(dieExit) && Exit.hasDies(dieExit)).toBe(true);
    expect(Exit.isFailure(interruptExit) && interruptExit.cause).toBe(mixedInterrupt);
    expect(Exit.hasFails(interruptExit) && Exit.hasInterrupts(interruptExit)).toBe(true);
  });

  it("turns empty and multiple typed-failure causes into defects", async () => {
    const multiple = Cause.combine(Cause.fail(failure), Cause.fail(new OutputMissing({ path: "/dist/other" })));
    const emptyExit = await Effect.runPromise(Effect.exit(captureCellResult(Effect.failCause(Cause.empty))));
    const multipleExit = await Effect.runPromise(Effect.exit(captureCellResult(Effect.failCause(multiple))));
    expect(Exit.hasDies(emptyExit)).toBe(true);
    expect(Exit.hasFails(emptyExit)).toBe(false);
    expect(Exit.hasDies(multipleExit)).toBe(true);
    expect(Exit.hasFails(multipleExit)).toBe(false);
  });
});

describe("standalone matrix provider projections", () => {
  it("narrows cell, artifact, and nested tool-bearing failures without changing the root envelope", () => {
    type BunCell = CellFailureFor<"bun", BunTarget>;
    type DenoCell = CellFailureFor<"deno", DenoTarget>;
    type BunFailed = MatrixFailedFor<"bun", BunTarget, BunStages>;
    type DenoFailed = MatrixFailedFor<"deno", DenoTarget, DenoStages>;
    type BunMatrixError = MatrixErrorFor<"bun", BunTarget, BunStages>;
    type DenoMatrixError = MatrixErrorFor<"deno", DenoTarget, DenoStages>;

    expectTypeOf<BunCell["provider"]>().toEqualTypeOf<"bun">();
    expectTypeOf<BunCell["target"]>().toEqualTypeOf<BunTarget>();
    expectTypeOf<Extract<BunCell["error"], { readonly _tag: "ToolFailed" }>["tool"]>()
      .toEqualTypeOf<"bun">();
    expectTypeOf<Extract<BunCell["error"], { readonly _tag: "TargetUnsupported" }>["tool"]>()
      .toEqualTypeOf<"bun">();
    expectTypeOf<Extract<BunCell["error"], { readonly _tag: "OutputInvalid" }>>()
      .toEqualTypeOf<OutputInvalid>();
    expectTypeOf<BunFailed["artifacts"][number]["provider"]>().toEqualTypeOf<"bun">();
    expectTypeOf<BunFailed["artifacts"][number]["stages"][0]["tool"]["name"]>().toEqualTypeOf<"bun">();
    expectTypeOf<BunFailed["artifacts"][number]["target"]>().toEqualTypeOf<BunTarget>();

    expectTypeOf<DenoCell["provider"]>().toEqualTypeOf<"deno">();
    expectTypeOf<DenoCell["target"]>().toEqualTypeOf<DenoTarget>();
    expectTypeOf<Extract<DenoCell["error"], { readonly _tag: "ToolFailed" }>["tool"]>()
      .toEqualTypeOf<"deno">();
    expectTypeOf<DenoFailed["artifacts"][number]["provider"]>().toEqualTypeOf<"deno">();
    expectTypeOf<DenoFailed["artifacts"][number]["target"]>().toEqualTypeOf<DenoTarget>();

    expectTypeOf<BunMatrixError>().toMatchTypeOf<typeof MatrixError.Type>();
    expectTypeOf<DenoMatrixError>().toMatchTypeOf<typeof MatrixError.Type>();
    expectTypeOf<BunFailed["artifacts"][number]>().toMatchTypeOf<ExecutableArtifact>();
    expectTypeOf<DenoFailed["artifacts"][number]>().toMatchTypeOf<ExecutableArtifact>();
    expectTypeOf<BunCell["error"]>().toMatchTypeOf<BuildError>();
    expectTypeOf<DenoCell["error"]>().toMatchTypeOf<BuildError>();
  });

  it("keeps matrix input provider-homogeneous and targets readonly non-empty", () => {
    type BunInput = CompileExecutableMatrixInput<BunTarget, FixtureOptions>;
    type DenoInput = CompileExecutableMatrixInput<DenoTarget, FixtureOptions>;
    expectTypeOf<BunInput["targets"]>().toEqualTypeOf<readonly [BunTarget, ...BunTarget[]]>();
    expectTypeOf<DenoInput["targets"]>().toEqualTypeOf<readonly [DenoTarget, ...DenoTarget[]]>();

    const bunInput: BunInput = {
      entrypoint: "main.ts",
      outdir: "dist",
      name: "app",
      targets: ["linux-x64-musl"],
      options: { marker: "one shared options object" },
    };
    void bunInput;
    const denoInput: DenoInput = {
      entrypoint: "main.ts",
      outdir: "dist",
      name: "app",
      targets: ["windows-aarch64"],
    };
    void denoInput;
    // @ts-expect-error Deno's matrix target tuple excludes musl.
    const invalidDeno: DenoInput = { ...denoInput, targets: ["linux-x64-musl"] };
    void invalidDeno;
    // @ts-expect-error Bun's matrix target tuple excludes Windows ARM64.
    const invalidBun: BunInput = { ...bunInput, targets: ["windows-aarch64"] };
    void invalidBun;
    // @ts-expect-error A matrix target tuple is non-empty.
    const emptyBun: BunInput = { ...bunInput, targets: [] };
    void emptyBun;
  });
});
