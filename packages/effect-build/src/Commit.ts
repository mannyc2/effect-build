import { Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "./Artifact.js";
export class CommitError extends Schema.TaggedError<CommitError>()("CommitError", {
  destination: Schema.String,
  reason: Schema.Literals(["exists", "rename-failed", "staging-failed", "remove-failed", "rollback-failed", "directory-no-replace-unsupported", "staged-path-mismatch"] as const),
  detail: Schema.optionalKey(Schema.String),
  /** Previous output retained here when automatic recovery or cleanup fails. */
  recoveryPath: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.reason}: ${this.destination}${this.detail === undefined ? "" : ` (${this.detail})`}`;
  }
}

export interface Options {
  /**
   * What to do when `outfile` already exists. `replace` (default) renames over
   * it, which is atomic for files on every supported OS. Directory replacement
   * retains a backup until the rename succeeds; it has a brief visibility gap.
   * `fail` uses exclusive hard-link creation for files. Directories fail explicitly
   * because the platform-neutral filesystem has no exclusive directory rename.
   */
  readonly onExists?: "replace" | "fail" | undefined;
  /** Prefix for the staging directory created next to `outfile`. */
  readonly prefix?: string | undefined;
  /** `sibling` stages a directory at the final depth, preserving relative imports and maps.
   * `nested` (default) preserves the final basename for executable and Apple tools. */
  readonly staging?: "sibling" | "nested" | undefined;
}

/** What every producing operation accepts and forwards to `output`. Staging depth is the producer's own decision. */
export interface ProducerOptions extends Omit<Options, "staging"> {
  /** `false` writes at the destination itself, with no staging or rename. Default: stage and commit atomically. */
  readonly atomic?: boolean | undefined;
}

// exists follows symlinks; a dangling link still occupies the destination.
const occupied = (destination: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readLink(destination).pipe(Effect.map(() => true), Effect.catch(() => fs.exists(destination)), Effect.orElseSucceed(() => false)));

/**
 * Sibling staging keeps failed builds from leaving truncated output.
 * Checks inside produce finish before the rename; return its staged artifact.
 */
export const atomic = <A extends Artifact.Artifact, E, R>(
  outfile: string,
  produce: (staged: string) => Effect.Effect<A, E, R>,
  options: Options = {},
): Effect.Effect<A, E | CommitError, R | FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const destination = p.resolve(outfile);
      const parent = p.dirname(destination);
      const fail = (reason: CommitError["reason"], detail: unknown, recoveryPath?: string) =>
        new CommitError({ destination, reason, detail: String(detail), ...(recoveryPath === undefined ? {} : { recoveryPath }) });
      yield* fs.makeDirectory(parent, { recursive: true }).pipe(Effect.mapError((e) => fail("staging-failed", e)));
      const staging = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ directory: parent, prefix: options.prefix ?? ".effect-build-" }).pipe(Effect.mapError((e) => fail("staging-failed", e))),
        // Sibling staging itself moves on success. Missing staging is successful cleanup.
        (path) => fs.remove(path, { recursive: true, force: true }).pipe(Effect.orDie),
      );
      const staged = options.staging === "sibling" ? staging : p.join(staging, p.basename(destination));
      const artifact = yield* produce(staged);
      if (artifact.path !== staged) return yield* fail("staged-path-mismatch", artifact.path);
      const exists = yield* occupied(destination);
      yield* Effect.uninterruptible(
        Effect.gen(function*() {
          if (options.onExists === "fail") {
            if (artifact.kind === "directory") return yield* new CommitError({ destination, reason: "directory-no-replace-unsupported" });
            // link refuses an occupied destination in one OS operation, including dangling links.
            return yield* fs.link(staged, destination).pipe(
              Effect.mapError((e) => fail(e.reason._tag === "AlreadyExists" ? "exists" : "rename-failed", e)),
            );
          }
          if (exists && artifact.kind === "directory") {
            // This backup deliberately has no scoped deletion: a failed rollback must retain it.
            const backup = yield* fs.makeTempDirectory({ directory: parent, prefix: ".effect-build-recovery-" }).pipe(
              Effect.mapError((e) => fail("staging-failed", e)),
            );
            const previous = p.join(backup, p.basename(destination));
            const cleanup = fs.remove(backup, { recursive: true }).pipe(Effect.mapError((e) => fail("remove-failed", e, previous)));
            yield* fs.rename(destination, previous).pipe(Effect.catch((e) => cleanup.pipe(Effect.andThen(Effect.fail(fail("rename-failed", e))))));
            yield* fs.rename(staged, destination).pipe(Effect.catch((e) => Effect.gen(function*() {
              yield* fs.rename(previous, destination).pipe(
                Effect.mapError((rollback) => fail("rollback-failed", `${String(e)}; rollback: ${String(rollback)}`, previous)),
              );
              yield* cleanup;
              return yield* fail("rename-failed", e);
            })));
            return yield* cleanup;
          }
          yield* fs.rename(staged, destination).pipe(Effect.mapError((e) => fail("rename-failed", e)));
        }),
      );
      return { ...artifact, path: destination };
    }),
  );

/**
 * What every producer does with its options: stage and commit through `atomic`,
 * or with `atomic: false` create the destination's parent and let `produce` write
 * the final path directly. The producer chooses `staging` from what it writes:
 * files stage nested, directories holding relative imports stage sibling.
 */
export const output = <A extends Artifact.Artifact, E, R>(
  outfile: string,
  produce: (path: string) => Effect.Effect<A, E, R>,
  options: ProducerOptions = {},
  staging?: Options["staging"],
): Effect.Effect<A, E | CommitError, R | FileSystem.FileSystem | Path.Path> =>
  options.atomic === false
    ? Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const destination = p.resolve(outfile);
      // Direct output has no exclusive operation: the check precedes production, and a concurrent writer can still win.
      if (options.onExists === "fail" && (yield* occupied(destination))) return yield* new CommitError({ destination, reason: "exists" });
      yield* fs.makeDirectory(p.dirname(destination), { recursive: true }).pipe(
        Effect.mapError((e) => new CommitError({ destination, reason: "staging-failed", detail: String(e) })),
      );
      return yield* produce(destination);
    })
    : atomic(outfile, produce, { onExists: options.onExists, prefix: options.prefix, staging });
