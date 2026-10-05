import { sha256 as incrementalSha256 } from "@noble/hashes/sha2.js";
import { Effect, FileSystem, Schema } from "effect";
import { Hex } from "effect/encoding";
import { dual } from "effect/Function";

export class Read extends Schema.TaggedError<Read>()("Read", { cause: Schema.Defect() }) {}

export class Mismatch extends Schema.TaggedError<Mismatch>()("Mismatch", {
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class DigestError extends Schema.TaggedError<DigestError>()("DigestError", {
  path: Schema.String,
  reason: Schema.Union([Read, Mismatch]),
}) {
  override get message(): string {
    switch (this.reason._tag) {
      case "Read":
        return `Reading ${this.path} for SHA-256 failed`;
      case "Mismatch":
        return `SHA-256 mismatch for ${this.path}: expected ${this.reason.expected}, found ${this.reason.actual}`;
    }
  }
}

/** Reads bounded chunks on each execution. Use Effect.cached to choose a memoized lifetime. */
export const sha256 = Effect.fn("Digest.sha256")(
  function*(path: string) {
    const fs = yield* FileSystem.FileSystem;
    const hash = incrementalSha256.create();
    const buffer = new Uint8Array(64 * 1024);
    const handle = yield* fs.open(path);
    let length = yield* handle.read(buffer);
    while (length !== 0) {
      hash.update(buffer.subarray(0, length));
      length = yield* handle.read(buffer);
    }
    return Hex.encode(hash.digest());
  },
  Effect.scoped,
  (effect, path) => effect.pipe(Effect.mapError((cause) => DigestError.make({ path, reason: Read.make({ cause }) }))),
);

/** Reads current bytes rather than trusting a digest memoized by the caller. */
export const verifySha256: {
  (expected: string): (path: string) => Effect.Effect<void, DigestError, FileSystem.FileSystem>;
  (path: string, expected: string): Effect.Effect<void, DigestError, FileSystem.FileSystem>;
} = dual(
  2,
  Effect.fn("Digest.verifySha256")(function*(path: string, expected: string) {
    const actual = yield* sha256(path);
    if (actual !== expected) {
      return yield* DigestError.make({ path, reason: Mismatch.make({ expected, actual }) });
    }
  }),
);
