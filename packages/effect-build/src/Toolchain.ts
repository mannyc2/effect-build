import { Cause, Config, Crypto, Effect, FileSystem, Option, Path, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type { Bundle, BundleEntry, Executable, FileArtifact, FinalizedFile, Tool } from "./Artifact.js";
import { ArtifactVerificationFailed, PublishFailed, ToolFailed, ToolNotFound } from "./BuildError.js";
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

/** Exact unbounded process bytes for protocols whose stdout is data, not diagnostics. */
export interface BinaryCompletion {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
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

const collectAllBytes = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<Uint8Array, unknown> =>
  Stream.runFold(
    stream,
    () => ({ chunks: [] as Uint8Array[], bytes: 0 }),
    (state, chunk) => {
      state.chunks.push(chunk);
      state.bytes += chunk.byteLength;
      return state;
    },
  ).pipe(
    Effect.map((state) => {
      const output = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return output;
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
        // Drain both pipes before observing the cached exit status. In rc108 a
        // fast child's `exitCode` may resolve before its pipe streams deliver
        // their final chunks; racing all three loses otherwise-successful
        // probe diagnostics. Concurrent pipe draining also prevents either
        // bounded collector from back-pressuring the other stream.
        const [stdout, stderr] = yield* Effect.all(
          [collectOutput(handle.stdout), collectOutput(handle.stderr)] as const,
          { concurrency: "unbounded" },
        );
        const exitCode = yield* handle.exitCode;
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

/**
 * Spawns one tool and drains stdout/stderr as exact, unbounded bytes. Use only
 * when stdout is a finite protocol payload whose truncation would be unsound.
 */
export const runBytes = (
  options: RunOptions,
): Effect.Effect<BinaryCompletion, ToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  mapFailureCause(
    Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* ChildProcess.make(options.executable, options.args, {
          shell: false,
          forceKillAfter: "2 seconds",
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        });
        const [stdout, stderr] = yield* Effect.all(
          [collectAllBytes(handle.stdout), collectAllBytes(handle.stderr)] as const,
          { concurrency: "unbounded" },
        );
        const exitCode = yield* handle.exitCode;
        return { exitCode: Number(exitCode), stdout, stderr };
      }),
    ),
    (error) => new ToolFailed({ tool: options.tool, exitCode: -1, stdout: "", stderr: describe(error) }),
  );

/** Exact-byte counterpart to {@link runOrFail}. */
export const runBytesOrFail = (
  options: RunOptions,
): Effect.Effect<BinaryCompletion, ToolFailed, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.flatMap(runBytes(options), (completion) =>
    completion.exitCode === 0
      ? Effect.succeed(completion)
      : Effect.fail(
        new ToolFailed({
          tool: options.tool,
          exitCode: completion.exitCode,
          stdout: new TextDecoder().decode(completion.stdout),
          stderr: new TextDecoder().decode(completion.stderr),
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

interface VerifiedBundleEntry {
  readonly entry: BundleEntry;
  readonly relative: string;
  readonly folded: string;
  readonly contents?: Uint8Array;
}

/** Make owned temporary directories removable without following their links. */
const removePrivateTree = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): Effect.Effect<void> => {
  const prepare = Effect.gen(function*() {
    const directories = [root];
    while (directories.length > 0) {
      const directory = directories.shift();
      if (directory === undefined) continue;
      yield* fileSystem.chmod(directory, 0o700);
      for (const child of yield* fileSystem.readDirectory(directory)) {
        const entry = path.join(directory, child);
        if (Option.isSome(yield* Effect.option(fileSystem.readLink(entry)))) continue;
        const information = yield* fileSystem.stat(entry);
        if (information.type === "Directory") directories.push(entry);
      }
    }
  });
  return prepare.pipe(
    Effect.ignore,
    Effect.andThen(fileSystem.remove(root, { recursive: true, force: true }).pipe(Effect.ignore)),
  );
};

/** Rebuild one already-validated manifest from held bytes, never source paths. */
const writeVerifiedBundleTree = <E>(
  root: string,
  entries: readonly VerifiedBundleEntry[],
  fail: (reason: string) => E,
): Effect.Effect<void, E, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = entries
      .filter(({ entry }) => entry._tag === "Directory")
      .sort((left, right) =>
        left.relative.split("/").length - right.relative.split("/").length
        || left.relative.localeCompare(right.relative)
      );
    for (const item of directories) {
      const destination = path.join(root, ...item.relative.split("/"));
      yield* fileSystem.makeDirectory(destination).pipe(
        Effect.mapError((error) => fail(`create directory ${item.relative}: ${describe(error)}`)),
      );
    }
    for (const item of entries.filter(({ entry }) => entry._tag === "File")) {
      const destination = path.join(root, ...item.relative.split("/"));
      yield* fileSystem.writeFile(destination, item.contents ?? new Uint8Array()).pipe(
        Effect.mapError((error) => fail(`write file ${item.relative}: ${describe(error)}`)),
      );
      yield* fileSystem.chmod(destination, item.entry._tag === "File" ? item.entry.mode : 0o644).pipe(
        Effect.mapError((error) => fail(`set file mode ${item.relative}: ${describe(error)}`)),
      );
    }
    const pendingLinks = entries.filter(({ entry }) => entry._tag === "SymbolicLink");
    while (pendingLinks.length > 0) {
      let progressed = false;
      for (let index = pendingLinks.length - 1; index >= 0; index--) {
        const item = pendingLinks[index]!;
        if (item.entry._tag !== "SymbolicLink") continue;
        const destination = path.join(root, ...item.relative.split("/"));
        const target = path.resolve(path.dirname(destination), item.entry.target);
        if (Option.isNone(yield* Effect.option(fileSystem.stat(target)))) continue;
        yield* fileSystem.symlink(item.entry.target, destination).pipe(
          Effect.mapError((error) => fail(`write symbolic link ${item.relative}: ${describe(error)}`)),
        );
        pendingLinks.splice(index, 1);
        progressed = true;
      }
      if (!progressed) {
        const item = pendingLinks[0]!;
        return yield* Effect.fail(
          fail(
            `symbolic link is broken or cyclic: ${item.relative} -> ${
              item.entry._tag === "SymbolicLink" ? item.entry.target : ""
            }`,
          ),
        );
      }
    }
    const canonicalRoot = yield* fileSystem.realPath(root).pipe(
      Effect.mapError((error) => fail(`resolve reconstructed root: ${describe(error)}`)),
    );
    for (const item of entries.filter(({ entry }) => entry._tag === "SymbolicLink")) {
      const destination = path.join(root, ...item.relative.split("/"));
      const canonicalTarget = yield* fileSystem.realPath(destination).pipe(
        Effect.mapError((error) =>
          fail(
            `symbolic link is broken or cyclic: ${item.relative} -> ${
              item.entry._tag === "SymbolicLink" ? item.entry.target : ""
            }: ${describe(error)}`,
          )
        ),
      );
      const relativeTarget = path.relative(canonicalRoot, canonicalTarget);
      if (
        path.isAbsolute(relativeTarget)
        || relativeTarget === ".."
        || relativeTarget.startsWith(`..${path.sep}`)
      ) {
        return yield* Effect.fail(fail(`symbolic link resolves outside the reconstructed root: ${item.relative}`));
      }
    }
    for (const item of [...directories].reverse()) {
      const destination = path.join(root, ...item.relative.split("/"));
      yield* fileSystem.chmod(destination, item.entry._tag === "Directory" ? item.entry.mode : 0o755).pipe(
        Effect.mapError((error) => fail(`set directory mode ${item.relative}: ${describe(error)}`)),
      );
    }
    yield* fileSystem.chmod(root, 0o755).pipe(
      Effect.mapError((error) => fail(`normalize root mode: ${describe(error)}`)),
    );
    if (path.sep !== "\\") {
      const rootMode = Number(
        (yield* fileSystem.stat(root).pipe(
          Effect.mapError((error) => fail(`verify root mode: ${describe(error)}`)),
        )).mode,
      ) & 0o7777;
      if (rootMode !== 0o755) {
        return yield* Effect.fail(fail(`root mode mismatch: expected 0755, observed 0${rootMode.toString(8)}`));
      }
      for (const item of entries) {
        if (item.entry._tag === "SymbolicLink") continue;
        const destination = path.join(root, ...item.relative.split("/"));
        const observed = Number(
          (yield* fileSystem.stat(destination).pipe(
            Effect.mapError((error) => fail(`verify mode ${item.relative}: ${describe(error)}`)),
          )).mode,
        ) & 0o7777;
        if (observed !== item.entry.mode) {
          return yield* Effect.fail(
            fail(
              `mode mismatch ${item.relative}: expected 0${item.entry.mode.toString(8)}, observed 0${
                observed.toString(8)
              }`,
            ),
          );
        }
      }
    }
  });

export interface PublishOptions<E, R> {
  readonly tool: Tool;
  readonly outfile: string;
  readonly cwd?: string | undefined;
  readonly target: Target.Target;
  /** Writes the executable at the private staged path. */
  readonly produce: (stagedPath: string) => Effect.Effect<void, E, R>;
}

export interface PublishFileOptions<E, R, ValidationError = never, ValidationServices = never> {
  readonly tool: Tool;
  readonly outfile: string;
  readonly cwd?: string | undefined;
  /** Writes one regular file at the private staged path. */
  readonly produce: (stagedPath: string) => Effect.Effect<void, E, R>;
  /** Validates the exact held bytes that will be copied into the atomic commit. */
  readonly validate?:
    | (
      (contents: Uint8Array) => Effect.Effect<void, ValidationError, ValidationServices>
    )
    | undefined;
}

/**
 * Stages one tool-produced regular file beside its destination, observes its
 * final size/digest once, and commits it with one atomic rename. Publication
 * assumes one release-machine writer for the destination.
 *
 * The commit itself is uninterruptible, but a pending interruption is
 * reasserted immediately afterwards. The destination can therefore contain the
 * complete committed file even when the caller receives interruption instead
 * of the returned artifact; higher layers must observe/adopt that exact output
 * or rebuild deliberately rather than retrying a mutation blindly.
 */
export const publishFile = <E, R, ValidationError = never, ValidationServices = never>(
  options: PublishFileOptions<E, R, ValidationError, ValidationServices>,
): Effect.Effect<
  FileArtifact,
  PublishFailed | E | ValidationError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | R | ValidationServices
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const destination = path.normalize(path.resolve(options.cwd ?? "", options.outfile));
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
      if (Option.isSome(yield* Effect.option(fileSystem.readLink(staged)))) {
        return yield* Effect.fail(failWith("the staged output is a symbolic link, not a regular file"));
      }
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
      const contents = yield* fileSystem.readFile(staged).pipe(
        Effect.mapError((error) => failWith(`read: ${describe(error)}`)),
      );
      const bytes = contents.byteLength;
      if (Number(information.size) !== bytes) {
        return yield* Effect.fail(
          failWith(`staged file changed while captured: stat=${information.size}, read=${bytes}`),
        );
      }
      // A validator observes an exact defensive copy. It cannot mutate the
      // held buffer whose digest and committed bytes are derived below.
      if (options.validate !== undefined) yield* options.validate(Uint8Array.from(contents));
      const digest = yield* crypto.digest("SHA-256", contents).pipe(
        Effect.mapError(() => failWith("sha-256 digest unavailable")),
      );
      const sha256 = hex(new Uint8Array(digest));
      const verified = yield* mapFailureCause(
        fileSystem.makeTempFile({ directory: staging, prefix: ".effect-build-verified-" }),
        (error) => failWith(`make verified file: ${describe(error)}`),
      );
      yield* fileSystem.writeFile(verified, contents).pipe(
        Effect.mapError((error) => failWith(`write verified file: ${describe(error)}`)),
      );
      yield* fileSystem.chmod(verified, Number(information.mode) & 0o7777).pipe(
        Effect.mapError((error) => failWith(`set verified file mode: ${describe(error)}`)),
      );
      const artifact: FileArtifact = {
        _tag: "File" as const,
        path: destination,
        bytes,
        tool: options.tool,
        sha256,
      };
      return yield* Effect.uninterruptible(
        Effect.gen(function*() {
          yield* mapFailureCause(
            fileSystem.rename(verified, destination),
            (error) => failWith(`rename: ${describe(error)}`),
          );
          return artifact;
        }),
      );
    }),
  );

/**
 * Stages in a private same-parent temp directory, lets `produce` write the
 * executable, sanity-checks the native magic against the target, and commits
 * with one atomic rename. Publication assumes one release-machine writer for
 * the destination. Windows targets gain a missing `.exe` suffix.
 *
 * The commit itself is uninterruptible, but a pending interruption is
 * reasserted immediately afterwards. The destination can therefore contain the
 * complete committed executable even when the caller receives interruption;
 * higher layers must observe/adopt or deliberately rebuild it.
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
      if (Option.isSome(yield* Effect.option(fileSystem.readLink(staged)))) {
        return yield* Effect.fail(failWith("the staged output is a symbolic link, not a regular executable"));
      }
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
      const contents = yield* fileSystem.readFile(staged).pipe(
        Effect.mapError((error) => failWith(`read: ${describe(error)}`)),
      );
      const bytes = contents.byteLength;
      if (Number(information.size) !== bytes) {
        return yield* Effect.fail(
          failWith(`staged executable changed while captured: stat=${information.size}, read=${bytes}`),
        );
      }
      const magic = contents.subarray(0, 4);
      const digest = yield* crypto.digest("SHA-256", contents).pipe(
        Effect.mapError(() => failWith("sha-256 digest unavailable")),
      );
      const sha256 = hex(new Uint8Array(digest));
      const format = sniffFormat(magic);
      const expected = Target.info(options.target).nativeFormat;
      if (format !== expected) {
        return yield* Effect.fail(
          failWith(`native format mismatch: expected ${expected}, found ${format ?? "unknown"}`),
        );
      }
      const verified = yield* mapFailureCause(
        fileSystem.makeTempFile({ directory: staging, prefix: ".effect-build-verified-" }),
        (error) => failWith(`make verified executable: ${describe(error)}`),
      );
      yield* fileSystem.writeFile(verified, contents).pipe(
        Effect.mapError((error) => failWith(`write verified executable: ${describe(error)}`)),
      );
      yield* fileSystem.chmod(verified, Number(information.mode) & 0o7777).pipe(
        Effect.mapError((error) => failWith(`set verified executable mode: ${describe(error)}`)),
      );
      const artifact: Executable = {
        _tag: "Executable" as const,
        path: destination,
        bytes,
        target: options.target,
        tool: options.tool,
        sha256,
      };
      return yield* Effect.uninterruptible(
        Effect.gen(function*() {
          yield* mapFailureCause(
            fileSystem.rename(verified, destination),
            (error) => failWith(`rename: ${describe(error)}`),
          );
          return artifact;
        }),
      );
    }),
  );

export interface PublishBundleOptions<E, R> {
  readonly tool: Tool;
  readonly outdir: string;
  readonly cwd?: string | undefined;
  /** Writes the bundle files into the private staged directory. */
  readonly produce: (stagedDirectory: string) => Effect.Effect<void, E, R>;
}

/**
 * Stages in a private same-parent temp directory, records an exact
 * symlink-aware manifest, rebuilds it from held bytes, and commits the whole
 * verified directory with one rename. Under the release machine's single
 * writer invariant, an existing destination is rejected rather than overlaid.
 * The rename is uninterruptible, but a pending interruption is reasserted after
 * the complete tree commits, so higher layers must observe/adopt or deliberately
 * rebuild an output found at the destination.
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
        fileSystem.makeDirectory(path.dirname(outdir), { recursive: true }),
        (error) => failWith(`make-directory: ${describe(error)}`),
      );
      const existingLink = yield* Effect.option(fileSystem.readLink(outdir));
      const existingEntry = Option.isSome(existingLink)
        ? true
        : yield* mapFailureCause(fileSystem.exists(outdir), (error) =>
          failWith(`inspect destination: ${describe(error)}`));
      if (existingEntry) {
        return yield* Effect.fail(failWith("destination already exists; exact bundles never overlay"));
      }
      const staging = yield* Effect.acquireRelease(
        mapFailureCause(
          fileSystem.makeTempDirectory({ directory: path.dirname(outdir), prefix: ".effect-build-bundle-" }),
          (error) =>
            failWith(`make-staging: ${describe(error)}`),
        ),
        (directory) => removePrivateTree(fileSystem, path, directory),
      );
      yield* options.produce(staging);
      const manifest: BundleEntry[] = [];
      const captured: VerifiedBundleEntry[] = [];
      const directories = [""];
      const seen = new Set<string>();
      while (directories.length > 0) {
        const directory = directories.shift() ?? "";
        const children = yield* mapFailureCause(
          fileSystem.readDirectory(path.join(staging, directory)),
          (error) => failWith(`read-staging: ${describe(error)}`),
        );
        for (const child of [...children].sort()) {
          const entry = directory.length === 0 ? child : path.join(directory, child);
          const portable = entry.split(path.sep).join("/");
          const folded = portable.normalize("NFC").toLowerCase();
          if (seen.has(folded)) {
            return yield* Effect.fail(
              failWith(`duplicate, case-colliding, or Unicode-colliding bundle entry: ${portable}`),
            );
          }
          seen.add(folded);
          const staged = path.join(staging, entry);
          const destination = path.join(outdir, entry);
          const link = yield* Effect.option(fileSystem.readLink(staged));
          if (Option.isSome(link)) {
            const target = link.value;
            const resolvedTarget = path.normalize(path.resolve(path.dirname(staged), target));
            const relativeTarget = path.relative(staging, resolvedTarget);
            if (
              path.isAbsolute(target)
              || relativeTarget === ".."
              || relativeTarget.startsWith(`..${path.sep}`)
            ) {
              return yield* Effect.fail(failWith(`symbolic link escapes the bundle: ${entry} -> ${target}`));
            }
            if (Option.isNone(yield* Effect.option(fileSystem.stat(resolvedTarget)))) {
              return yield* Effect.fail(failWith(`symbolic link target is absent: ${entry} -> ${target}`));
            }
            const bundleEntry: BundleEntry = { _tag: "SymbolicLink", path: destination, target };
            manifest.push(bundleEntry);
            captured.push({ entry: bundleEntry, relative: portable, folded });
            continue;
          }
          const information = yield* mapFailureCause(
            fileSystem.stat(staged),
            (error) => failWith(`stat: ${describe(error)}`),
          );
          if (information.type === "Directory") {
            const bundleEntry: BundleEntry = {
              _tag: "Directory",
              path: destination,
              mode: Number(information.mode) & 0o7777,
            };
            manifest.push(bundleEntry);
            captured.push({ entry: bundleEntry, relative: portable, folded });
            directories.push(entry);
            continue;
          }
          if (information.type !== "File") {
            return yield* Effect.fail(failWith(`unsupported bundle entry type ${information.type}: ${entry}`));
          }
          const contents = yield* fileSystem.readFile(staged).pipe(
            Effect.mapError((error) => failWith(`read: ${describe(error)}`)),
          );
          if (Number(information.size) !== contents.byteLength) {
            return yield* Effect.fail(
              failWith(
                `bundle file changed while captured: ${entry} stat=${information.size}, read=${contents.byteLength}`,
              ),
            );
          }
          const digest = yield* crypto.digest("SHA-256", contents).pipe(
            Effect.mapError(() => failWith("sha-256 digest unavailable")),
          );
          const bundleEntry: BundleEntry = {
            _tag: "File",
            path: destination,
            bytes: contents.byteLength,
            mode: Number(information.mode) & 0o7777,
            sha256: hex(new Uint8Array(digest)),
          };
          manifest.push(bundleEntry);
          captured.push({ entry: bundleEntry, relative: portable, folded, contents });
        }
      }
      if (manifest.length === 0) {
        return yield* Effect.fail(failWith("the tool did not produce any entries in the staged directory"));
      }
      const verified = yield* mapFailureCause(
        fileSystem.makeTempDirectory({ directory: staging, prefix: ".effect-build-verified-" }),
        (error) => failWith(`create verified bundle: ${describe(error)}`),
      );
      yield* writeVerifiedBundleTree(verified, captured, (reason) => failWith(`rebuild verified bundle: ${reason}`));
      const artifact: Bundle = {
        _tag: "Bundle" as const,
        outdir,
        entries: manifest.sort((left, right) => left.path.localeCompare(right.path)),
        tool: options.tool,
      };
      return yield* Effect.uninterruptible(
        Effect.gen(function*() {
          yield* mapFailureCause(
            fileSystem.rename(verified, outdir),
            (error) => failWith(`rename: ${describe(error)}`),
          );
          return artifact;
        }),
      );
    }),
  );

/**
 * Reads one finalized file once and verifies that the exact bytes match its
 * recorded regular-file type, length, and SHA-256. Consumers must operate on
 * the returned bytes, never reopen the caller-controlled path after this
 * boundary. The release-machine single-writer law excludes a concurrent path
 * replacement during this admission; the portable Effect filesystem has no
 * no-follow file-handle primitive.
 */
export const readVerifiedFile = (
  artifact: FinalizedFile,
): Effect.Effect<Uint8Array, ArtifactVerificationFailed, FileSystem.FileSystem | Crypto.Crypto> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const fail = (reason: string) => new ArtifactVerificationFailed({ path: artifact.path, reason });
    const admitRegularFile = (phase: string) =>
      Effect.gen(function*() {
        if (Option.isSome(yield* Effect.option(fileSystem.readLink(artifact.path)))) {
          return yield* Effect.fail(fail(`${phase}: finalized path is a symbolic link`));
        }
        const information = yield* fileSystem.stat(artifact.path).pipe(
          Effect.mapError((error) => fail(`${phase} stat: ${describe(error)}`)),
        );
        if (information.type !== "File") {
          return yield* Effect.fail(fail(`${phase}: finalized path is ${information.type}, not a regular file`));
        }
        if (Number(information.size) !== artifact.bytes) {
          return yield* Effect.fail(
            fail(`${phase} length mismatch: expected ${artifact.bytes}, observed ${information.size}`),
          );
        }
      });
    if (!/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      return yield* Effect.fail(fail("recorded SHA-256 is not canonical lowercase hex"));
    }
    yield* admitRegularFile("before read");
    const contents = yield* fileSystem.readFile(artifact.path).pipe(
      Effect.mapError((error) => fail(`read: ${describe(error)}`)),
    );
    yield* admitRegularFile("after read");
    if (contents.byteLength !== artifact.bytes) {
      return yield* Effect.fail(
        fail(`read length mismatch: expected ${artifact.bytes}, observed ${contents.byteLength}`),
      );
    }
    const digest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => fail("sha-256 digest unavailable")),
    );
    const observed = hex(new Uint8Array(digest));
    if (observed !== artifact.sha256) {
      return yield* Effect.fail(
        fail(`SHA-256 mismatch: expected ${artifact.sha256}, observed ${observed}`),
      );
    }
    return contents;
  });

/**
 * Reconstructs exactly the files named by a finalized Bundle in a private,
 * scoped directory. Unlisted source-directory bytes are never admitted.
 */
export const materializeVerifiedBundle = (
  bundle: Bundle,
): Effect.Effect<
  string,
  ArtifactVerificationFailed,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.normalize(path.resolve(bundle.outdir));
    const fail = (reason: string) => new ArtifactVerificationFailed({ path: root, reason });
    if (bundle.entries.length === 0) return yield* Effect.fail(fail("bundle manifest is empty"));
    const entries: VerifiedBundleEntry[] = [];
    const seen = new Set<string>();
    for (const entry of bundle.entries) {
      if (
        (entry._tag === "File" || entry._tag === "Directory")
        && (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777)
      ) {
        return yield* Effect.fail(fail(`manifest mode is outside 0..07777: ${entry.path}`));
      }
      const resolved = path.normalize(path.resolve(entry.path));
      const relative = path.relative(root, resolved);
      if (
        relative.length === 0
        || path.isAbsolute(relative)
        || relative === ".."
        || relative.startsWith(`..${path.sep}`)
      ) {
        return yield* Effect.fail(fail(`manifest path escapes the bundle root: ${entry.path}`));
      }
      const portable = relative.split(path.sep).join("/");
      const folded = portable.normalize("NFC").toLowerCase();
      if (seen.has(folded)) {
        return yield* Effect.fail(fail(`duplicate, case-colliding, or Unicode-colliding manifest path: ${portable}`));
      }
      seen.add(folded);
      const contents = entry._tag === "File" ? yield* readVerifiedFile(entry) : undefined;
      entries.push({ entry, relative: portable, folded, ...(contents === undefined ? {} : { contents }) });
    }
    const ordered = [...entries].sort((left, right) => left.folded.localeCompare(right.folded));
    const byFolded = new Map(ordered.map((item) => [item.folded, item] as const));
    for (const item of ordered) {
      const segments = item.relative.split("/");
      for (let depth = 1; depth < segments.length; depth++) {
        const expected = segments.slice(0, depth).join("/");
        const ancestor = byFolded.get(expected.normalize("NFC").toLowerCase());
        if (ancestor === undefined) {
          return yield* Effect.fail(fail(`manifest omits directory ancestor ${expected} for ${item.relative}`));
        }
        if (ancestor.relative !== expected || ancestor.entry._tag !== "Directory") {
          return yield* Effect.fail(
            fail(`manifest ancestor is not the exact directory ${expected} for ${item.relative}`),
          );
        }
      }
    }
    for (const item of ordered) {
      if (item.entry._tag !== "SymbolicLink") continue;
      const resolvedTarget = path.normalize(path.resolve(root, path.dirname(item.relative), item.entry.target));
      const relativeTarget = path.relative(root, resolvedTarget).split(path.sep).join("/");
      if (
        path.isAbsolute(item.entry.target)
        || relativeTarget === ".."
        || relativeTarget.startsWith("../")
      ) {
        return yield* Effect.fail(
          fail(`symbolic link target escapes the bundle: ${item.relative} -> ${item.entry.target}`),
        );
      }
    }
    const snapshot = yield* Effect.acquireRelease(
      fileSystem.makeTempDirectory({ prefix: "effect-build-bundle-snapshot-" }).pipe(
        Effect.mapError((error) => fail(`create private snapshot: ${describe(error)}`)),
      ),
      (directory) => removePrivateTree(fileSystem, path, directory),
    );
    yield* writeVerifiedBundleTree(snapshot, ordered, fail);
    return snapshot;
  });
