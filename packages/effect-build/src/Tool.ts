import { Config, Context, Crypto, Effect, FileSystem, Layer, Path, Schema, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Range, satisfies as semverSatisfies } from "semver";
import type * as Artifact from "./Artifact.js";
import { file } from "./Artifact.js";

/** Anything handed to a tool or the filesystem: NUL cannot cross the exec boundary, and empty text names nothing. */
export const argumentIssue = (value: string): string | undefined =>
  value.length === 0 ? "is empty" : value.includes("\0") ? "contains NUL" : undefined;

/** An external executable we resolved once and will keep using. */
export interface Resolved {
  readonly name: string;
  readonly path: string;
  readonly version: string;
  readonly bytes: number;
  readonly sha256: string;
}

export class NotFound extends Schema.TaggedError<NotFound>()("ToolNotFound", {
  tool: Schema.String,
  searched: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `${this.tool} not found (searched: ${this.searched.join(", ") || "PATH"})`;
  }
}

export class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ToolProbeFailed", {
  tool: Schema.String,
  path: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} at ${this.path} could not be inspected: ${this.detail}`;
  }
}

export class VersionUnsupported extends Schema.TaggedError<VersionUnsupported>()("ToolVersionUnsupported", {
  tool: Schema.String,
  version: Schema.String,
  supported: Schema.String,
  operation: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.tool} ${this.version} is not supported${this.operation === undefined ? "" : ` by ${this.operation}`} (${this.reason ?? this.supported})`;
  }
}

export class Failed extends Schema.TaggedError<Failed>()("ToolFailed", {
  tool: Schema.String,
  args: Schema.Array(Schema.String),
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  stdoutTruncated: Schema.Boolean,
  stderrTruncated: Schema.Boolean,
}) {
  override get message(): string {
    return `${this.tool} ${this.args.join(" ")} exited ${this.exitCode}\n${this.stderr}`;
  }
}

export class SpawnFailed extends Schema.TaggedError<SpawnFailed>()("ToolSpawnFailed", {
  tool: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.tool} could not be started: ${this.detail}`;
  }
}

/** An operation rejected its input. `operation` names it the way its span does, such as `Bun.compile`. */
export class InputInvalid extends Schema.TaggedError<InputInvalid>()("InputInvalid", {
  operation: Schema.String,
  reason: Schema.String,
  /** The offending shipping path, when one entry is at fault. */
  path: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.operation}: ${this.reason}${this.path === undefined ? "" : `: ${this.path}`}`;
  }
}

export interface Completion {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export interface Output {
  readonly stream: "stdout" | "stderr";
  readonly chunk: Uint8Array;
}

/** Every option accepts `undefined`, so callers can forward their own optional inputs directly. */
export interface EnvironmentOptions {
  /** Merged into the inherited environment unless `extendEnv` is false. */
  readonly env?: Record<string, string> | undefined;
  /** False submits only env (or an empty map) to the platform spawner; native APIs may add required variables. */
  readonly extendEnv?: boolean | undefined;
  /** Submit the tool's directory on PATH and a scoped temporary home; env overrides these defaults. Native-required variables may remain. */
  readonly scrubEnv?: boolean | undefined;
}

export interface RunOptions extends EnvironmentOptions {
  readonly cwd?: string | undefined;
  /** Bytes retained per stream. Default 8 MiB. */
  readonly outputLimit?: number | undefined;
  /** Retain stdout as data; null removes the diagnostic limit. */
  readonly stdoutLimit?: number | null | undefined;
  /** Receive every chunk as it arrives, including bytes beyond the retention limit. */
  readonly onOutput?: ((output: Output) => Effect.Effect<void>) | undefined;
  /** Remove these values from failed-process diagnostics. Successful bytes and onOutput remain raw data. */
  readonly redact?: readonly string[] | undefined;
}

export interface LocateOptions {
  readonly name: string;
  /** Path to use instead of searching PATH. */
  readonly executable?: string | undefined;
}

export interface ResolveOptions extends LocateOptions, EnvironmentOptions {
  /** Arguments that print the version. Default `["--version"]`. */
  readonly versionArgs?: readonly string[] | undefined;
  /** Extract the version from probe output. Default: first token of stdout. */
  readonly parseVersion?: ((completion: Completion, path: string) => VersionResult) | undefined;
}

export type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;
export interface Probe { readonly completion: Completion; readonly path: string }
/** An extractor may inspect native binary resources through FileSystem, as SignTool requires. */
export type VersionResult = string | undefined | Effect.Effect<string | undefined, ProbeFailed, FileSystem.FileSystem | Path.Path>;

/** Extract group 1 from stdout, then stderr. Stateful patterns are reset on every attempt. */
export const versionPattern = (pattern: RegExp) => (probe: Probe): string | undefined => {
  const expression = new RegExp(pattern.source, pattern.flags);
  for (const bytes of [probe.completion.stdout, probe.completion.stderr]) {
    expression.lastIndex = 0;
    const version = expression.exec(text(bytes))?.[1];
    if (version !== undefined) return version;
  }
  return undefined;
};

export interface Constraint {
  /** Versions inside this npm semver range are rejected. */
  readonly range: string;
  readonly reason: string;
}

export interface Service { readonly tool: Resolved }
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
/** Documented host inputs, not an exhaustive closure or a sandbox policy. */
export interface Requirements {
  readonly env: readonly string[];
  readonly network: boolean;
  readonly services: readonly string[];
  readonly detail?: string | undefined;
}
export type LayerError = NotFound | ProbeFailed | VersionUnsupported | Artifact.ArtifactError;
interface BaseSpec {
  readonly name: string;
  readonly versionArgs?: readonly string[] | undefined;
  readonly version: {
    readonly parse?: ((probe: Probe) => VersionResult) | undefined;
    readonly supported: string;
    readonly tested: readonly string[];
  };
  readonly constraints?: Readonly<Record<string, readonly Constraint[]>> | undefined;
  readonly requirements?: Requirements | undefined;
}
type Extend<Extra, Options> = (tool: Resolved, options: LayerOptions & Options) => Effect.Effect<Extra, LayerError, Env>;
/** A service with extra fields must declare how resolution constructs them. */
export type Spec<Extra = {}, Options = {}> = BaseSpec & (keyof Extra extends never
  ? { readonly extend?: Extend<Extra, Options> | undefined }
  : { readonly extend: Extend<Extra, Options> });
type LayerArguments<Options> = {} extends Options
  ? [options?: LayerOptions & Options]
  : [options: LayerOptions & Options];
export interface Provider<Self, Extra = {}, Options = {}> {
  readonly name: string;
  readonly layer: (...args: LayerArguments<Options>) => Layer.Layer<Self, LayerError, Env>;
  readonly supported: string;
  readonly tested: readonly string[];
  readonly constraints: Readonly<Record<string, readonly Constraint[]>>;
  readonly requirements: Requirements;
  readonly resolved: Effect.Effect<Resolved, never, Self>;
  readonly testLayer: (service: Service & Extra) => Layer.Layer<Self>;
}

/** Keep the named service at the provider edge; share resolution, policy, and test construction. */
export const provider = <Self, Extra = {}, Options = {}>(
  service: Context.Service<Self, Service & Extra>,
  spec: Spec<Extra, Options>,
): Provider<Self, Extra, Options> => ({
  name: spec.name,
  supported: spec.version.supported,
  tested: spec.version.tested,
  constraints: spec.constraints ?? {},
  requirements: spec.requirements ?? { env: [], network: false, services: [] },
  resolved: Effect.map(service, ({ tool }) => tool),
  testLayer: (value) => Layer.succeed(service, value),
  layer: (...args) => {
    // The optional tuple branch permits omission only when Options has no required fields.
    const options = args[0] ?? {} as LayerOptions & Options;
    return Layer.effect(service, Effect.gen(function*() {
      const tool = yield* resolve({ name: spec.name, executable: options.executable, versionArgs: spec.versionArgs,
        parseVersion: spec.version.parse === undefined ? undefined : (completion, path) => spec.version.parse!({ completion, path }),
      }).pipe(requireVersion(options.version ?? spec.version.supported));
      const extra = spec.extend === undefined ? undefined : yield* spec.extend(tool, options);
      return Object.assign({}, extra, { tool });
    }));
  },
});

const collect = (stream: Stream.Stream<Uint8Array, unknown>, limit: number) =>
  Stream.runFold(stream, () => ({ chunks: [] as Uint8Array[], size: 0, truncated: false }), (acc, chunk) => {
    const room = Math.max(0, limit - acc.size);
    const kept = chunk.byteLength <= room ? chunk : chunk.subarray(0, room);
    if (kept.byteLength > 0) acc.chunks.push(kept);
    acc.size += kept.byteLength;
    acc.truncated ||= kept.byteLength < chunk.byteLength;
    return acc;
  }).pipe(
    Effect.map(({ chunks, size, truncated }) => {
      const out = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return { bytes: out, truncated };
    }),
  );

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Replace each secret with `<redacted>`, longer secrets first so an overlapping value cannot expose a suffix. */
export const redact = (secrets: readonly string[]): ((text: string) => string) => {
  const ordered = [...new Set(secrets)].filter((value) => value.length > 0).sort((a, b) => b.length - a.length);
  return (text) => ordered.reduce((scrubbed, secret) => scrubbed.replaceAll(secret, "<redacted>"), text);
};

/** Scoped environment for both one-shot runs and caller-scoped watch processes. Explicit env always wins. */
export const environment = Effect.fn("Tool.environment")(function*(tool: Resolved, options: EnvironmentOptions = {}) {
  if (options.scrubEnv !== true) {
    return { env: options.env ?? (options.extendEnv === false ? {} : undefined), extendEnv: options.extendEnv ?? true };
  }
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-env-" }).pipe(
    Effect.mapError((error) => new SpawnFailed({ tool: tool.name, detail: String(error) })),
  );
  return { env: { PATH: p.dirname(tool.path), HOME: temporary, TMPDIR: temporary, TEMP: temporary, TMP: temporary, USERPROFILE: temporary, ...options.env }, extendEnv: false };
});

/** Run a resolved tool; failures retain both diagnostic streams and truncation flags. */
export const run = Effect.fn("Tool.run")(function*(
  tool: Resolved,
  args: readonly string[],
  options: RunOptions = {},
): Effect.fn.Return<Completion, Failed | SpawnFailed, ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope> {
  const scrub = redact(options.redact ?? []);
  const spawnFailed = (error: unknown) => new SpawnFailed({ tool: scrub(tool.name), detail: scrub(String(error)) });
  const limit = options.outputLimit ?? 8 * 1024 * 1024;
  const stdoutLimit = options.stdoutLimit === null ? Infinity : options.stdoutLimit ?? limit;
  if (!Number.isSafeInteger(limit) || limit < 0 || (stdoutLimit !== Infinity && (!Number.isSafeInteger(stdoutLimit) || stdoutLimit < 0))) {
    return yield* new SpawnFailed({ tool: tool.name, detail: "output limits must be non-negative safe integers (or null for uncapped stdout)" });
  }
  const handle = yield* ChildProcess.make(tool.path, [...args], {
    cwd: options.cwd,
    ...yield* environment(tool, options),
    shell: false,
  }).pipe(
    // Native spawners can throw synchronously before reporting a typed launch error.
    Effect.catchDefect(Effect.fail),
    Effect.mapError(spawnFailed),
  );
  const observe = (stream: "stdout" | "stderr") => options.onOutput === undefined
    ? handle[stream]
    : handle[stream].pipe(Stream.tap((chunk) => options.onOutput!({ stream, chunk })));
  const { stdout, stderr, exitCode } = yield* Effect.all(
    { stdout: collect(observe("stdout"), stdoutLimit), stderr: collect(observe("stderr"), limit), exitCode: handle.exitCode },
    { concurrency: "unbounded" },
  ).pipe(Effect.mapError(spawnFailed));
  if (exitCode !== 0) {
    return yield* new Failed({ tool: scrub(tool.name), args: args.map(scrub), exitCode,
      stdout: scrub(text(stdout.bytes)), stderr: scrub(text(stderr.bytes)), stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated });
  }
  return { exitCode, stdout: stdout.bytes, stderr: stderr.bytes, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated };
}, Effect.scoped);

const findOnPath = (name: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    // Windows commonly names this key Path; both reads must honor the caller's ConfigProvider.
    const path = yield* Config.String("PATH").pipe(Config.orElse(() => Config.String("Path")), Effect.orElseSucceed(() => ""));
    const names = p.sep === "\\" ? [name, `${name}.exe`, `${name}.cmd`] : [name];
    const searched = path.split(p.sep === "\\" ? ";" : ":").filter((dir) => dir.length > 0);
    for (const dir of searched) {
      for (const n of names) {
        const candidate = p.join(dir, n);
        const info = yield* fs.stat(candidate).pipe(Effect.catch((error) => error.reason._tag === "NotFound"
          ? Effect.succeed(undefined)
          : Effect.fail(new ProbeFailed({ tool: name, path: candidate, detail: String(error) }))));
        if (info?.type === "File" && (p.sep === "\\" || (info.mode & 0o111) !== 0)) return candidate;
      }
    }
    return yield* new NotFound({ tool: name, searched });
  });

/** Find the executable without probing it: an explicit path, or the first runnable PATH match, with symlinks resolved. */
export const locate = Effect.fn("Tool.locate")(function*(
  options: LocateOptions,
): Effect.fn.Return<string, NotFound | ProbeFailed, FileSystem.FileSystem | Path.Path> {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  let executable: string;
  if (options.executable === undefined) {
    executable = yield* findOnPath(options.name);
  } else {
    executable = p.resolve(options.executable);
    yield* fs.stat(executable).pipe(Effect.mapError((error) => error.reason._tag === "NotFound"
      ? new NotFound({ tool: options.name, searched: [executable] })
      : new ProbeFailed({ tool: options.name, path: executable, detail: String(error) })));
  }
  return yield* fs.realPath(executable).pipe(Effect.mapError((error) => new ProbeFailed({ tool: options.name, path: executable, detail: String(error) })));
});

const firstToken = (completion: Completion): string | undefined => text(completion.stdout).trim().split(/\s+/u)[0];

/** Locate, hash, and probe once per layer; later runs use the recorded path without rechecking bytes. */
export const resolve = Effect.fn("Tool.resolve")(function*(options: ResolveOptions): Effect.fn.Return<Resolved, NotFound | ProbeFailed, Env> {
  const path = yield* locate(options);
  const probeFailed = (detail: string) => new ProbeFailed({ tool: options.name, path, detail });
  // Compilers can be hundreds of megabytes; hash them in bounded chunks.
  const identity = yield* file(path, { name: options.name, version: "unprobed" }).pipe(Effect.mapError((e) => probeFailed(e.message)));
  const provisional: Resolved = { name: options.name, path, version: "", bytes: identity.bytes, sha256: identity.sha256 };
  const completion = yield* run(provisional, options.versionArgs ?? ["--version"], options).pipe(
    Effect.mapError((e) => probeFailed(e instanceof SpawnFailed ? e.detail : e.message)),
  );
  const result = (options.parseVersion ?? firstToken)(completion, path);
  const version = Effect.isEffect(result) ? yield* result : result;
  if (version === undefined || version.length === 0) return yield* probeFailed("could not read version");
  return { ...provisional, version };
});

type Version = readonly [number, number, number];

/** Canonical `x.y.z` only. Prereleases, canaries, and decorated strings are rejected. */
export const parseVersion = (text: string): Version | undefined => {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(text);
  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** npm semver ranges, including caret, tilde, wildcard and hyphen ranges. Invalid ranges never match. */
export const satisfies = (range: string): ((version: string) => boolean) => {
  let parsed: Range;
  try {
    parsed = new Range(range);
  } catch {
    return () => false;
  }
  return (version) => semverSatisfies(version, parsed);
};

/** Apply an explicit version policy; rejection occurs in the Effect error channel. */
export const requireVersion = (accept: string | ((version: string) => boolean)) =>
<E, R>(self: Effect.Effect<Resolved, E, R>): Effect.Effect<Resolved, E | VersionUnsupported, R> => {
  const test = typeof accept === "string" ? satisfies(accept) : accept;
  const supported = typeof accept === "string" ? accept : "custom predicate";
  return self.pipe(
    Effect.filterOrFail(
      (tool) => test(tool.version),
      (tool) => new VersionUnsupported({ tool: tool.name, version: tool.version, supported }),
    ),
  );
};

/** Reject a declared operation-specific range using its metadata as the error explanation. */
export const check = (tool: Resolved, operation: string, constraint: Constraint): Effect.Effect<void, VersionUnsupported> =>
  satisfies(constraint.range)(tool.version)
    ? Effect.fail(new VersionUnsupported({ tool: tool.name, version: tool.version, supported: constraint.range, operation, reason: constraint.reason }))
    : Effect.void;

export const producedBy = (tool: Resolved): Artifact.Producer => ({
  name: tool.name,
  version: tool.version,
  path: tool.path,
  sha256: tool.sha256,
});
