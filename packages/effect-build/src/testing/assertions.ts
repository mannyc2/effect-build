import { Effect, Exit, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "../Artifact.js";

export class ReproducibilityFailure extends Schema.TaggedError<ReproducibilityFailure>()("ReproducibilityFailure", {
  first: Schema.String,
  second: Schema.String,
}) {
  override get message(): string {
    return `output hashes differ: ${this.first} and ${this.second}`;
  }
}

export class StagingLeaked extends Schema.TaggedError<StagingLeaked>()("StagingLeaked", {
  directory: Schema.String,
  entries: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `staging remains in ${this.directory}: ${this.entries.join(", ")}`;
  }
}

/** Produce into separate scoped destinations and compare the resulting content identities. */
export const expectReproducible = <A extends Artifact.Artifact, E, R>(
  produce: (outfile: string) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const first = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-repro-first-" });
    const second = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-repro-second-" });
    const a = yield* produce(path.join(first, "output"));
    const b = yield* produce(path.join(second, "output"));
    if (a.sha256 !== b.sha256) return yield* new ReproducibilityFailure({ first: a.sha256, second: b.sha256 });
    return a;
  });

/** Check after success, failure or interruption; preserve the original cause when no staging leaked. */
export const expectNoStagingLeft = (directory: string) => <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const result = yield* Effect.exit(restore(self));
      const entries = (yield* fs.readDirectory(directory)).filter((entry) => entry.startsWith(".effect-build-"));
      if (entries.length > 0) return yield* new StagingLeaked({ directory, entries });
      return yield* Exit.isSuccess(result) ? Effect.succeed(result.value) : Effect.failCause(result.cause);
    })
  );
