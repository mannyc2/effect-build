import { Cause, Config, Crypto, Effect, FileSystem, Option, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type { Bundle, BundleFile, Executable, Tool } from "./Artifact.js";
import { PublishFailed, ToolFailed, ToolNotFound } from "./BuildError.js";
import * as Target from "./Target.js";

export interface Output {
  readonly text: string;
  readonly truncated: boolean;
}

export interface Completion {
  readonly exitCode: number;
  readonly stdout: Output;
  readonly stderr: Output;
}

const outputLimit = 1024 * 1024;

const collectOutput = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<Output, unknown> =>
  Stream.runFold(
    stream,
    () => ({ chunks: [] as Uint8Array[], bytes: 0, truncated: false }),
    (state, chunk) => {
      const remaining = outputLimit - state.bytes;
      if (remaining <= 0) return { ...state, truncated: true };
      const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
      return {
        chunks: [...state.chunks, retained],
        bytes: state.bytes + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

/** Maps failures without disturbing interruption or defects. */
const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface RunOptions {
  readonly tool: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
}

/**
 * Spawns the tool and gathers bounded stdout/stderr and the exit code.
 * Interruption closes the scope and terminates the child process.
 */
export const run = (
  options: RunOptions,
): Effect.Effect<Completion, ToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  mapFailureCause(
    Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* ChildProcess.make(options.executable, options.args, {
          shell: false,
          forceKillAfter: "2 seconds",
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        });
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [collectOutput(handle.stdout), collectOutput(handle.stderr), handle.exitCode] as const,
          { concurrency: "unbounded" },
        );
        return { exitCode: Number(exitCode), stdout, stderr };
      }),
    ),
    (error) => new ToolFailed({ tool: options.tool, exitCode: -1, stdout: "", stderr: describe(error) }),
  );

/** Like {@link run}, but a non-zero exit code fails with `ToolFailed`. */
export const runOrFail = (
  options: RunOptions,
): Effect.Effect<Completion, ToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.flatMap(run(options), (completion) =>
    completion.exitCode === 0
      ? Effect.succeed(completion)
      : Effect.fail(
        new ToolFailed({
          tool: options.tool,
          exitCode: completion.exitCode,
          stdout: completion.stdout.text,
          stderr: completion.stderr.text,
        }),
      ));

export interface ResolveOptions {
  readonly name: string;
  /** Explicit executable path; wins over the PATH search when present. */
  readonly executable?: string | undefined;
}

const usableCandidate = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  candidate: string,
): Effect.Effect<string | undefined> =>
  Effect.gen(function*() {
    const canonical = yield* Effect.option(fileSystem.realPath(candidate));
    if (Option.isNone(canonical)) return undefined;
    const information = yield* Effect.option(fileSystem.stat(canonical.value));
    if (Option.isNone(information) || information.value.type !== "File") return undefined;
    if (path.sep !== "\\" && (Number(information.value.mode) & 0o111) === 0) return undefined;
    return path.normalize(canonical.value);
  });

/**
 * Resolves the tool executable exactly once: an explicit path wins, otherwise
 * one deterministic PATH walk. Never installs, retries, or substitutes.
 */
export const resolveExecutable = (
  options: ResolveOptions,
): Effect.Effect<string, ToolNotFound, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (options.executable !== undefined) {
      const explicit = options.executable;
      const resolved = yield* usableCandidate(fileSystem, path, explicit);
      if (resolved === undefined) {
        return yield* Effect.fail(new ToolNotFound({ tool: options.name, command: explicit }));
      }
      return resolved;
    }
    const environment = yield* Config.string("PATH").pipe(Effect.orElseSucceed(() => ""));
    const names = path.sep === "\\" ? [options.name, `${options.name}.exe`] : [options.name];
    for (const entry of environment.split(path.sep === "\\" ? ";" : ":")) {
      if (entry.length === 0 || !path.isAbsolute(entry)) continue;
      for (const name of names) {
        const resolved = yield* usableCandidate(fileSystem, path, path.join(entry, name));
        if (resolved !== undefined) return resolved;
      }
    }
    return yield* Effect.fail(new ToolNotFound({ tool: options.name, command: options.name }));
  });

export interface ProbeOptions extends RunOptions {
  /** Extracts the version from probe stdout; defaults to the trimmed first line. */
  readonly parse?: ((stdout: string) => string | undefined) | undefined;
}

const firstLine = (text: string): string | undefined => text.trim().split("\n")[0]?.trim();

export const probeVersion = (
  options: ProbeOptions,
): Effect.Effect<string, ToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.flatMap(runOrFail(options), (completion) => {
    const version = (options.parse ?? firstLine)(completion.stdout.text);
    return version === undefined || version.length === 0
      ? Effect.fail(
        new ToolFailed({
          tool: options.tool,
          exitCode: completion.exitCode,
          stdout: completion.stdout.text,
          stderr: "version probe produced no parsable version",
        }),
      )
      : Effect.succeed(version);
  });

export interface TestedRange {
  readonly minimum: string;
  readonly before: string;
}

const numeric = (version: string): readonly number[] =>
  version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);

const compareVersions = (left: string, right: string): number => {
  const a = numeric(left);
  const b = numeric(right);
  for (let index = 0; index < 3; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
};

/** Logs one warning when the probed version is outside the CI-tested range; never refuses. */
export const warnIfUntested = (
  options: { readonly tool: string; readonly version: string; readonly tested: TestedRange },
): Effect.Effect<void> =>
  compareVersions(options.version, options.tested.minimum) >= 0
    && compareVersions(options.version, options.tested.before) < 0
    ? Effect.void
    : Effect.logWarning(
      `effect-build: ${options.tool} ${options.version} is outside the tested range `
        + `>=${options.tested.minimum} <${options.tested.before}; proceeding anyway`,
    );

const machOMagics: readonly (readonly number[])[] = [
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xbe, 0xba, 0xfe, 0xca],
  [0xca, 0xfe, 0xba, 0xbf],
  [0xbf, 0xba, 0xfe, 0xca],
];

const sniffFormat = (bytes: Uint8Array): Target.NativeFormat | undefined => {
  if (bytes.byteLength < 4) return undefined;
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return "elf";
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return "pe";
  return machOMagics.some((magic) => magic.every((byte, index) => byte === bytes[index])) ? "mach-o" : undefined;
};

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export interface PublishOptions<E, R> {
  readonly tool: Tool;
  readonly outfile: string;
  readonly cwd?: string | undefined;
  readonly target: Target.Target;
  /** Record a SHA-256 digest on the artifact. */
  readonly hash: boolean;
  /** Writes the executable at the private staged path. */
  readonly produce: (stagedPath: string) => Effect.Effect<void, E, R>;
}

/**
 * Stages in a private same-parent temp directory, lets `produce` write the
 * executable, sanity-checks the native magic against the target, and commits
 * with one atomic rename. Windows targets gain a missing `.exe` suffix.
 */
export const publishExecutable = <E, R>(
  options: PublishOptions<E, R>,
): Effect.Effect<
  Executable,
  PublishFailed | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | R
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const suffix = Target.info(options.target).executableSuffix;
      const requested = path.normalize(path.resolve(options.cwd ?? "", options.outfile));
      const destination = suffix !== "" && !requested.toLowerCase().endsWith(suffix)
        ? `${requested}${suffix}`
        : requested;
      const parent = path.dirname(destination);
      const failWith = (reason: string) => new PublishFailed({ destination, reason });
      yield* mapFailureCause(
        fileSystem.makeDirectory(parent, { recursive: true }),
        (error) => failWith(`make-directory: ${describe(error)}`),
      );
      const staging = yield* mapFailureCause(
        fileSystem.makeTempDirectoryScoped({ directory: parent, prefix: ".effect-build-" }),
        (error) => failWith(`make-staging: ${describe(error)}`),
      );
      const staged = path.join(staging, path.basename(destination));
      yield* options.produce(staged);
      const information = yield* fileSystem.stat(staged).pipe(
        Effect.mapError((error) =>
          error.reason._tag === "NotFound"
            ? failWith("the tool did not produce an output file at the staged path")
            : failWith(`stat: ${describe(error)}`)
        ),
      );
      if (information.type !== "File") {
        return yield* Effect.fail(failWith("the staged output is not a regular file"));
      }
      if (path.sep !== "\\" && (Number(information.mode) & 0o111) === 0) {
        return yield* Effect.fail(failWith("the staged output is not executable"));
      }
      const bytes = Number(information.size);
      let sha256: string | undefined;
      let magic: Uint8Array;
      if (options.hash) {
        const contents = yield* fileSystem.readFile(staged).pipe(
          Effect.mapError((error) => failWith(`read: ${describe(error)}`)),
        );
        magic = contents.subarray(0, 4);
        const digest = yield* crypto.digest("SHA-256", contents).pipe(
          Effect.mapError(() => failWith("sha-256 digest unavailable")),
        );
        sha256 = hex(new Uint8Array(digest));
      } else {
        magic = yield* Effect.scoped(
          Effect.gen(function*() {
            const file = yield* fileSystem.open(staged);
            const chunk = yield* file.readAlloc(FileSystem.Size(4));
            return Option.getOrElse(chunk, () => new Uint8Array());
          }),
        ).pipe(Effect.mapError((error) => failWith(`read: ${describe(error)}`)));
      }
      const format = sniffFormat(magic);
      const expected = Target.info(options.target).nativeFormat;
      if (format !== expected) {
        return yield* Effect.fail(
          failWith(`native format mismatch: expected ${expected}, found ${format ?? "unknown"}`),
        );
      }
      yield* mapFailureCause(
        fileSystem.rename(staged, destination),
        (error) => failWith(`rename: ${describe(error)}`),
      );
      return {
        _tag: "Executable" as const,
        path: destination,
        bytes,
        target: options.target,
        tool: options.tool,
        ...(sha256 === undefined ? {} : { sha256 }),
      };
    }),
  );

export interface PublishBundleOptions<E, R> {
  readonly tool: Tool;
  readonly outdir: string;
  readonly cwd?: string | undefined;
  /** Record a SHA-256 digest on every artifact file. */
  readonly hash: boolean;
  /** Writes the bundle files into the private staged directory. */
  readonly produce: (stagedDirectory: string) => Effect.Effect<void, E, R>;
}

/**
 * Stages in a private same-parent temp directory, lets `produce` fill it, and
 * commits every produced file into `outdir` with per-file renames — matching
 * the native tools, which overwrite the files they emit and leave the rest of
 * the directory alone.
 */
export const publishBundle = <E, R>(
  options: PublishBundleOptions<E, R>,
): Effect.Effect<
  Bundle,
  PublishFailed | E,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | R
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const outdir = path.normalize(path.resolve(options.cwd ?? "", options.outdir));
      const failWith = (reason: string) => new PublishFailed({ destination: outdir, reason });
      yield* mapFailureCause(
        fileSystem.makeDirectory(outdir, { recursive: true }),
        (error) => failWith(`make-directory: ${describe(error)}`),
      );
      const staging = yield* mapFailureCause(
        fileSystem.makeTempDirectoryScoped({ directory: path.dirname(outdir), prefix: ".effect-build-" }),
        (error) => failWith(`make-staging: ${describe(error)}`),
      );
      yield* options.produce(staging);
      const entries = yield* mapFailureCause(
        fileSystem.readDirectory(staging, { recursive: true }),
        (error) => failWith(`read-staging: ${describe(error)}`),
      );
      const produced: { readonly entry: string; readonly bytes: number }[] = [];
      for (const entry of [...entries].sort()) {
        const information = yield* mapFailureCause(
          fileSystem.stat(path.join(staging, entry)),
          (error) => failWith(`stat: ${describe(error)}`),
        );
        if (information.type === "File") produced.push({ entry, bytes: Number(information.size) });
      }
      if (produced.length === 0) {
        return yield* Effect.fail(failWith("the tool did not produce any files in the staged directory"));
      }
      const files: BundleFile[] = [];
      for (const { bytes, entry } of produced) {
        const staged = path.join(staging, entry);
        const destination = path.join(outdir, entry);
        let sha256: string | undefined;
        if (options.hash) {
          const contents = yield* fileSystem.readFile(staged).pipe(
            Effect.mapError((error) => failWith(`read: ${describe(error)}`)),
          );
          const digest = yield* crypto.digest("SHA-256", contents).pipe(
            Effect.mapError(() => failWith("sha-256 digest unavailable")),
          );
          sha256 = hex(new Uint8Array(digest));
        }
        yield* mapFailureCause(
          fileSystem.makeDirectory(path.dirname(destination), { recursive: true }),
          (error) => failWith(`make-directory: ${describe(error)}`),
        );
        yield* mapFailureCause(
          fileSystem.rename(staged, destination),
          (error) => failWith(`rename: ${describe(error)}`),
        );
        files.push({ path: destination, bytes, ...(sha256 === undefined ? {} : { sha256 }) });
      }
      return { _tag: "Bundle" as const, outdir, files, tool: options.tool };
    }),
  );
