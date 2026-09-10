import { Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "./Artifact.js";
import { readLink } from "./internal/fileSystem.js";
export class CommitError extends Schema.TaggedError<CommitError>()("CommitError", {
  destination: Schema.String,
  reason: Schema.Literals(["exists", "inspect-failed", "rename-failed", "staging-failed", "remove-failed", "rollback-failed", "directory-no-replace-unsupported", "staged-path-mismatch"] as const),
  detail: Schema.optionalKey(Schema.String),
  /** Previous output after failed rollback, or its remaining portion after failed cleanup. */
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
  /** `sibling` stages a directory at the final depth, preserving relative imports and maps;
   * `produce` receives an existing 0755 directory. `nested` (default) preserves the final
   * basename for executable and Apple tools; `produce` receives a path that does not exist yet. */
  readonly staging?: "sibling" | "nested" | undefined;
}

/** What every producing operation accepts and forwards to `output`. Staging depth is the producer's own decision. */
export interface ProducerOptions extends Omit<Options, "staging"> {
  /** `false` writes at the destination itself, with no staging or rename; a sibling-staged producer
   * starts from an empty destination. Default: stage and commit atomically. */
  readonly atomic?: boolean | undefined;
}

// exists follows symlinks; a dangling link still occupies the destination.
const occupied = (destination: string): Effect.Effect<boolean, CommitError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const link = yield* readLink(destination);
    return link !== undefined || (yield* fs.exists(destination));
  }).pipe(
    Effect.catch((error) => error.reason._tag === "NotFound"
      ? Effect.succeed(false)
      : Effect.fail(new CommitError({ destination, reason: "inspect-failed", detail: String(error) }))),
  );

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
      // mkdtemp creates 0700; a sibling-staged root becomes the committed directory, so give it a fresh directory's mode.
      if (options.staging === "sibling") yield* fs.chmod(staging, 0o755).pipe(Effect.mapError((e) => fail("staging-failed", e)));
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
            // Before the first move, and after a successful rollback, backup is empty.
            // Failure to remove it must not replace the rename failure or claim old output lives there.
            const failAfterEmptyCleanup = (error: unknown) => fs.remove(backup, { recursive: true }).pipe(
              Effect.match({
                onFailure: (cleanup) => fail("rename-failed", `${String(error)}; empty backup cleanup (${backup}): ${String(cleanup)}`),
                onSuccess: () => fail("rename-failed", error),
              }),
              Effect.flatMap(Effect.fail),
            );
            yield* fs.rename(destination, previous).pipe(Effect.catch(failAfterEmptyCleanup));
            yield* fs.rename(staged, destination).pipe(Effect.catch((e) => Effect.gen(function*() {
              yield* fs.rename(previous, destination).pipe(
                Effect.mapError((rollback) => fail("rollback-failed", `${String(e)}; rollback: ${String(rollback)}`, previous)),
              );
              return yield* failAfterEmptyCleanup(e);
            })));
            // The replacement is installed and backup still owns the previous output.
            return yield* fs.remove(backup, { recursive: true }).pipe(Effect.catch((error) =>
              // Recursive removal may already have consumed some or all of the old tree.
              occupied(previous).pipe(
                Effect.match({
                  onSuccess: (retained) => fail("remove-failed", `${String(error)}; cleanup: ${backup}`, retained ? previous : undefined),
                  onFailure: (inspection) => fail("remove-failed", `${String(error)}; cleanup: ${backup}; remaining output could not be inspected: ${String(inspection)}`),
                }),
                Effect.flatMap(Effect.fail),
              )
            ));
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
 * files stage nested, directories holding relative imports stage sibling. Direct
 * sibling output starts from an empty destination.
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
      // A sibling-staged producer fills a directory it owns; start it empty so an earlier build's files cannot enter the record.
      if (staging === "sibling") {
        yield* fs.remove(destination, { recursive: true, force: true }).pipe(
          Effect.mapError((e) => new CommitError({ destination, reason: "remove-failed", detail: String(e) })),
        );
      }
      return yield* produce(destination);
    })
    : atomic(outfile, produce, { onExists: options.onExists, prefix: options.prefix, staging });
