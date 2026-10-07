import { Effect, FileSystem, Option, Schema } from "effect";
import { Hex } from "effect/encoding";

export class ExecutableError extends Schema.TaggedError<ExecutableError>()("ExecutableError", {
  path: Schema.String,
  magic: Schema.String,
}) {
  override get message(): string {
    return `${this.path} is not a native executable (magic ${this.magic})`;
  }
}

const nativeMagics = new Set([
  "7f454c46",
  "feedface",
  "cefaedfe",
  "feedfacf",
  "cffaedfe",
  "cafebabe",
  "bebafeca",
  "cafebabf",
  "bfbafeca",
]);

/**
 * Checks only four native-header bytes; this does not establish the target or executable validity.
 * As an `Atomic.file` check it reads the staged file and reports the destination path.
 */
export const checkNative = Effect.fn("Executable.checkNative")(
  function*(path: string, reportedPath: string = path) {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* fs.open(path);
    const bytes = yield* file.readAlloc(4);
    const magic = Hex.encode(Option.getOrElse(bytes, () => new Uint8Array()));
    if (magic.length !== 8 || (!nativeMagics.has(magic) && !magic.startsWith("4d5a"))) {
      return yield* ExecutableError.make({ path: reportedPath, magic });
    }
  },
  Effect.scoped,
);
