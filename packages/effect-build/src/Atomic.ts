import { Context, Effect, FileSystem, Path, Predicate, Schema } from "effect";
import { dual } from "effect/Function";

export class AtomicError extends Schema.TaggedError<AtomicError>()("AtomicError", {
  destination: Schema.String,
  step: Schema.Literals(["stage", "commit", "cleanup"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = Predicate.isError(this.cause) ? `: ${this.cause.message}` : "";
    return `Publishing ${this.destination} failed during ${this.step}${detail}`;
  }
}

/**
 * The filesystem services publication needs, without the rest of the current context. A binding captures this in
 * `make` and provides it to its methods, so a call keeps its caller's Scope and tracing.
 */
export const context: Effect.Effect<
  Context.Context<FileSystem.FileSystem | Path.Path>,
  never,
  FileSystem.FileSystem | Path.Path
> = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return Context.make(FileSystem.FileSystem, fs).pipe(Context.add(Path.Path, path));
});

/** Checks a staged file before commit. `destination` is the final path, for diagnostics. */
export type Check<E, R> = (staged: string, destination: string) => Effect.Effect<void, E, R>;

/** Stages beside the destination, checks only when requested, and returns the final absolute path.
 * Cleanup can fail after publication; it does not roll back a committed file. */
export const file: {
  <E, R, E2 = never, R2 = never>(
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
    options?: { readonly check?: Check<E2, R2> },
  ): (destination: string) => Effect.Effect<string, E | E2 | AtomicError, R | R2 | FileSystem.FileSystem | Path.Path>;
  <E, R, E2 = never, R2 = never>(
    destination: string,
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
    options?: { readonly check?: Check<E2, R2> },
  ): Effect.Effect<string, E | E2 | AtomicError, R | R2 | FileSystem.FileSystem | Path.Path>;
} = dual(
  (args) => Predicate.isString(args[0]),
  Effect.fn("Atomic.file")(function*<E, R, E2 = never, R2 = never>(
    destination: string,
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
    options?: { readonly check?: Check<E2, R2> },
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const final = path.resolve(destination);
    const parent = path.dirname(final);
    const failure = (step: AtomicError["step"]) => (cause: unknown) =>
      AtomicError.make({ destination: final, step, cause });
    yield* fs.makeDirectory(parent, { recursive: true }).pipe(Effect.mapError(failure("stage")));
    return yield* Effect.acquireUseRelease(
      fs.makeTempDirectory({ directory: parent, prefix: ".effect-build-" }).pipe(Effect.mapError(failure("stage"))),
      Effect.fnUntraced(function*(directory) {
        const staged = path.join(directory, path.basename(final));
        yield* produce(staged);
        if (options?.check !== undefined) yield* options.check(staged, final);
        yield* fs.rename(staged, final).pipe(Effect.mapError(failure("commit")));
        return final;
      }),
      (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.mapError(failure("cleanup"))),
    );
  }),
);

/** Commits each staged leaf with its own rename, retaining unrelated destination files.
 * A failed commit can leave earlier files published. Empty directories are not published. */
export const directory: {
  <E, R>(
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
  ): (destination: string) => Effect.Effect<string, E | AtomicError, R | FileSystem.FileSystem | Path.Path>;
  <E, R>(
    destination: string,
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
  ): Effect.Effect<string, E | AtomicError, R | FileSystem.FileSystem | Path.Path>;
} = dual(
  2,
  Effect.fn("Atomic.directory")(function*<E, R>(
    destination: string,
    produce: (staged: string) => Effect.Effect<unknown, E, R>,
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const final = path.resolve(destination);
    const parent = path.dirname(final);
    const failure = (step: AtomicError["step"]) => (cause: unknown) =>
      AtomicError.make({ destination: final, step, cause });
    yield* fs.makeDirectory(parent, { recursive: true }).pipe(Effect.mapError(failure("stage")));
    return yield* Effect.acquireUseRelease(
      fs.makeTempDirectory({ directory: parent, prefix: ".effect-build-" }).pipe(Effect.mapError(failure("stage"))),
      Effect.fnUntraced(function*(staging) {
        yield* produce(staging);
        const entries = yield* fs.readDirectory(staging, { recursive: true }).pipe(Effect.mapError(failure("commit")));
        yield* fs.makeDirectory(final, { recursive: true }).pipe(Effect.mapError(failure("commit")));
        for (const entry of entries.sort((left, right) => left.localeCompare(right))) {
          const source = path.join(staging, entry);
          const link = yield* fs.readLink(source).pipe(
            Effect.as(true),
            Effect.catchIf(
              (error) => Predicate.hasProperty(error.cause, "code") && error.cause.code === "EINVAL",
              () => Effect.succeed(false),
            ),
            Effect.mapError(failure("commit")),
          );
          if (!link) {
            const info = yield* fs.stat(source).pipe(Effect.mapError(failure("commit")));
            if (info.type === "Directory") continue;
          }
          const target = path.join(final, entry);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.mapError(failure("commit")));
          yield* fs.rename(source, target).pipe(Effect.mapError(failure("commit")));
        }
        return final;
      }),
      (staging) => fs.remove(staging, { recursive: true }).pipe(Effect.mapError(failure("cleanup"))),
    );
  }),
);
