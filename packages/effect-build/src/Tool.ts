import { Config, Crypto, Effect, FileSystem, Path, Schema, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type * as Artifact from "./Artifact.js";
import { sha256 } from "./Artifact.js";

/** An external executable we resolved once and will keep using. */
export interface Resolved {
  readonly name: string;
  readonly path: string;
  readonly version: string;
  readonly bytes: number;
  readonly sha256: string;
}

export class NotFound extends Schema.TaggedError<NotFound>()("ToolNotFound", {
  name: Schema.String,
  searched: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `${this.name} not found (searched: ${this.searched.join(", ") || "PATH"})`;
  }
}

export class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ToolProbeFailed", {
  name: Schema.String,
  path: Schema.String,
  detail: Schema.String,
}) {}

export class VersionUnsupported extends Schema.TaggedError<VersionUnsupported>()("ToolVersionUnsupported", {
  name: Schema.String,
  version: Schema.String,
  supported: Schema.String,
}) {
  override get message(): string {
    return `${this.name} ${this.version} is not supported (${this.supported})`;
  }
}

export class Failed extends Schema.TaggedError<Failed>()("ToolFailed", {
  name: Schema.String,
  args: Schema.Array(Schema.String),
  exitCode: Schema.Number,
  stderr: Schema.String,
}) {
  override get message(): string {
    return `${this.name} ${this.args.join(" ")} exited ${this.exitCode}\n${this.stderr}`;
  }
}

export class SpawnFailed extends Schema.TaggedError<SpawnFailed>()("ToolSpawnFailed", {
  name: Schema.String,
  detail: Schema.String,
}) {}

export interface Completion {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly extendEnv?: boolean;
  /** Bytes retained per stream. Default 8 MiB. */
  readonly outputLimit?: number;
}

export interface ResolveOptions {
  readonly name: string;
  /** Absolute path to use instead of searching PATH. */
  readonly executable?: string;
  /** Arguments that print the version. Default `["--version"]`. */
  readonly versionArgs?: readonly string[];
  /** Extract the version from the probe output. Default: first token of stdout. */
  readonly parseVersion?: (completion: Completion) => string | undefined;
}

type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;

const collect = (stream: Stream.Stream<Uint8Array, unknown>, limit: number) =>
  Stream.runFold(stream, () => ({ chunks: [] as Uint8Array[], size: 0 }), (acc, chunk) => {
    const room = Math.max(0, limit - acc.size);
    const kept = chunk.byteLength <= room ? chunk : chunk.subarray(0, room);
    return { chunks: kept.byteLength === 0 ? acc.chunks : [...acc.chunks, kept], size: acc.size + kept.byteLength };
  }).pipe(
    Effect.map(({ chunks, size }) => {
      const out = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return out;
    }),
  );

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Run a resolved tool with argv. Non-zero exit is `Failed`; the stderr is in the error. */
export const run = Effect.fn("Tool.run")(function*(
  tool: Resolved,
  args: readonly string[],
  options: RunOptions = {},
): Effect.fn.Return<Completion, Failed | SpawnFailed, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const limit = options.outputLimit ?? 8 * 1024 * 1024;
  const handle = yield* ChildProcess.make(tool.path, [...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env, extendEnv: options.extendEnv ?? true }),
    shell: false,
  }).pipe(
    // Native spawners can throw synchronously before reporting a typed launch error.
    Effect.catchDefect(Effect.fail),
    Effect.mapError((e) => new SpawnFailed({ name: tool.name, detail: String(e) })),
  );
  const { stdout, stderr, exitCode } = yield* Effect.all(
    { stdout: collect(handle.stdout, limit), stderr: collect(handle.stderr, limit), exitCode: handle.exitCode },
    { concurrency: "unbounded" },
  ).pipe(Effect.mapError((e) => new SpawnFailed({ name: tool.name, detail: String(e) })));
  if (exitCode !== 0) {
    return yield* new Failed({ name: tool.name, args: [...args], exitCode, stderr: text(stderr) });
  }
  return { exitCode, stdout, stderr };
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
        const info = yield* fs.stat(candidate).pipe(Effect.option);
        if (info._tag === "Some" && info.value.type !== "Directory") return candidate;
      }
    }
    return yield* new NotFound({ name, searched });
  });

/** Resolve once per layer; later runs use the recorded path without rechecking bytes. */
export const resolve = Effect.fn("Tool.resolve")(function*(options: ResolveOptions): Effect.fn.Return<Resolved, NotFound | ProbeFailed, Env> {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;
  const executable = options.executable === undefined ? yield* findOnPath(options.name) : p.resolve(options.executable);
  if (options.executable !== undefined) {
    yield* fs.stat(executable).pipe(Effect.mapError(() => new NotFound({ name: options.name, searched: [executable] })));
  }
  const real = yield* fs.realPath(executable).pipe(Effect.orElseSucceed(() => executable));
  const contents = yield* fs.readFile(real).pipe(
    Effect.mapError((e) => new ProbeFailed({ name: options.name, path: real, detail: String(e) })),
  );
  const digest = yield* sha256(contents);
  const provisional: Resolved = { name: options.name, path: real, version: "", bytes: contents.byteLength, sha256: digest };
  const completion = yield* run(provisional, options.versionArgs ?? ["--version"]).pipe(
    Effect.mapError((e) => new ProbeFailed({ name: options.name, path: real, detail: e instanceof SpawnFailed ? e.detail : e.message })),
  );
  const version = (options.parseVersion ?? ((c) => text(c.stdout).trim().split(/\s+/u)[0]))(completion);
  if (version === undefined || version.length === 0) {
    return yield* new ProbeFailed({ name: options.name, path: real, detail: "could not read version" });
  }
  return { ...provisional, version };
});

type Version = readonly [number, number, number];

/** Canonical `x.y.z` only. Prereleases, canaries, and decorated strings are rejected. */
export const parseVersion = (text: string): Version | undefined => {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(text);
  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3])];
};

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Ranges use `>= > <= < =`, spaces (and), and `||` (or); malformed ranges throw. */
export const satisfies = (range: string): ((version: string) => boolean) => {
  if (range.split("||").some((alt) => alt.trim().length === 0)) throw new Error(`invalid version range: ${range}`);
  const alternatives = range.split("||").map((alt) =>
    alt.trim().split(/\s+/u).filter((s) => s.length > 0).map((c) => {
      const m = /^(>=|<=|>|<|=)?(.+)$/u.exec(c);
      const v = m === null ? undefined : parseVersion(m[2]!);
      if (v === undefined) throw new Error(`invalid version range: ${range}`);
      return { op: m![1] ?? "=", v };
    })
  );
  return (text) => {
    const v = parseVersion(text);
    if (v === undefined) return false;
    return alternatives.some((cmps) =>
      cmps.every(({ op, v: w }) => {
        const c = compare(v, w);
        return op === ">=" ? c >= 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : op === "<" ? c < 0 : c === 0;
      })
    );
  };
};

/** Providers default to tested versions; callers can widen or pin with this combinator. */
export const requireVersion = (accept: string | ((version: string) => boolean)) =>
<E, R>(self: Effect.Effect<Resolved, E, R>): Effect.Effect<Resolved, E | VersionUnsupported, R> => {
  const test = typeof accept === "string" ? satisfies(accept) : accept;
  const supported = typeof accept === "string" ? accept : "custom predicate";
  return self.pipe(
    Effect.filterOrFail(
      (tool) => test(tool.version),
      (tool) => new VersionUnsupported({ name: tool.name, version: tool.version, supported }),
    ),
  );
};

export const producer = (tool: Resolved): Artifact.Producer => ({
  name: tool.name,
  version: tool.version,
  path: tool.path,
  sha256: tool.sha256,
});
