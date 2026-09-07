import { Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "./Artifact.js";
export class CommitError extends Schema.TaggedError<CommitError>()("CommitError", {
  destination: Schema.String,
  reason: Schema.Literals(["exists", "rename-failed", "staging-failed", "remove-failed", "staged-path-mismatch"] as const),
  detail: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.reason}: ${this.destination}${this.detail === undefined ? "" : ` (${this.detail})`}`;
  }
}

export interface Options {
  /**
   * What to do when `outfile` already exists. `replace` (default) renames over
   * it, which is atomic for files on every supported OS. For directories the
   * old tree is removed first, then the new one renamed in.
   */
  readonly onExists?: "replace" | "fail";
  /** Prefix for the staging directory created next to `outfile`. */
  readonly prefix?: string;
}

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
      yield* fs.makeDirectory(parent, { recursive: true }).pipe(
        Effect.mapError((e) => new CommitError({ destination, reason: "staging-failed", detail: String(e) })),
      );
      const staging = yield* fs.makeTempDirectoryScoped({ directory: parent, prefix: options.prefix ?? ".effect-build-" }).pipe(
        Effect.mapError((e) => new CommitError({ destination, reason: "staging-failed", detail: String(e) })),
      );
      const staged = p.join(staging, p.basename(destination));
      const artifact = yield* produce(staged);
      if (artifact.path !== staged) {
        return yield* new CommitError({ destination, reason: "staged-path-mismatch", detail: artifact.path });
      }
      // exists follows symlinks; a dangling link still occupies the destination.
      const exists = yield* fs.readLink(destination).pipe(Effect.map(() => true), Effect.catch(() => fs.exists(destination)), Effect.orElseSucceed(() => false));
      if (exists && options.onExists === "fail") {
        return yield* new CommitError({ destination, reason: "exists" });
      }
      yield* Effect.uninterruptible(
        Effect.gen(function*() {
          if (exists && artifact.kind === "directory") {
            yield* fs.remove(destination, { recursive: true }).pipe(
              Effect.mapError((e) => new CommitError({ destination, reason: "remove-failed", detail: String(e) })),
            );
          }
          yield* fs.rename(staged, destination).pipe(
            Effect.mapError((e) => new CommitError({ destination, reason: "rename-failed", detail: String(e) })),
          );
        }),
      );
      return { ...artifact, path: destination };
    }),
  );
