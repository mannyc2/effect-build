import { Config, Crypto, Effect, FileSystem, Path, Schema, Scope, Stream } from "effect";
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
}) {
  override get message(): string {
    return `${this.tool} ${this.version} is not supported (${this.supported})`;
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
export interface RunOptions {
  readonly cwd?: string | undefined;
  /** Merged into the inherited environment unless `extendEnv` is false. */
  readonly env?: Record<string, string> | undefined;
  readonly extendEnv?: boolean | undefined;
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

export interface ResolveOptions extends LocateOptions {
  /** Arguments that print the version. Default `["--version"]`. */
  readonly versionArgs?: readonly string[] | undefined;
  /** Extract the version from probe output. Default: first token of stdout. */
  readonly parseVersion?: ((completion: Completion) => string | undefined) | undefined;
}

type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

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

/** Run a resolved tool; failures retain both diagnostic streams and truncation flags. */
export const run = Effect.fn("Tool.run")(function*(
  tool: Resolved,
  args: readonly string[],
  options: RunOptions = {},
): Effect.fn.Return<Completion, Failed | SpawnFailed, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const scrub = redact(options.redact ?? []);
  const spawnFailed = (error: unknown) => new SpawnFailed({ tool: scrub(tool.name), detail: scrub(String(error)) });
  const limit = options.outputLimit ?? 8 * 1024 * 1024;
  const stdoutLimit = options.stdoutLimit === null ? Infinity : options.stdoutLimit ?? limit;
  if (!Number.isSafeInteger(limit) || limit < 0 || (stdoutLimit !== Infinity && (!Number.isSafeInteger(stdoutLimit) || stdoutLimit < 0))) {
    return yield* new SpawnFailed({ tool: tool.name, detail: "output limits must be non-negative safe integers (or null for uncapped stdout)" });
  }
  const handle = yield* ChildProcess.make(tool.path, [...args], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: options.env, extendEnv: options.extendEnv ?? true }),
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
    const path = yield* Config.string("PATH").pipe(Config.orElse(() => Config.string("Path")), Effect.orElseSucceed(() => ""));
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
  const completion = yield* run(provisional, options.versionArgs ?? ["--version"]).pipe(
    Effect.mapError((e) => probeFailed(e instanceof SpawnFailed ? e.detail : e.message)),
  );
  const version = (options.parseVersion ?? firstToken)(completion);
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

export const producer = (tool: Resolved): Artifact.Producer => ({
  name: tool.name,
  version: tool.version,
  path: tool.path,
  sha256: tool.sha256,
});
