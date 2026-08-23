import { Cause, Effect, FileSystem, Option, Result, Schema } from "effect";

export interface SelectedNodeExecutableObservation {
  readonly format: "elf";
  readonly os: "linux";
  readonly architecture: "x64";
  readonly abi: "gnu";
}

export class SelectedNodeExecutableInvalid extends Schema.TaggedError<SelectedNodeExecutableInvalid>()(
  "SelectedNodeExecutableInvalid",
  { reason: Schema.String },
) {}

type SelectedNodeExecutableInvalidReason =
  | "elf-offset-overflow"
  | "invalid ELF interpreter range"
  | "invalid ELF64 program headers"
  | "invalid-elf-interpreter"
  | "multiple ELF interpreters"
  | "open-failed"
  | "read-failed"
  | "selected executable does not use the GNU ELF interpreter"
  | "selected executable has no ELF interpreter"
  | "selected executable is not ELF"
  | "selected executable is not ELF x86-64"
  | "selected executable is not ELF64 little-endian version 1"
  | "selected executable is too large"
  | "truncated-elf-range";

const invalid = (reason: SelectedNodeExecutableInvalidReason): SelectedNodeExecutableInvalid =>
  new SelectedNodeExecutableInvalid({ reason });

const checkedAdd = (left: number, right: number): Result.Result<number, SelectedNodeExecutableInvalid> => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) {
    return Result.fail(invalid("elf-offset-overflow"));
  }
  const value = left + right;
  return Number.isSafeInteger(value) ? Result.succeed(value) : Result.fail(invalid("elf-offset-overflow"));
};

const checkedMultiply = (left: number, right: number): Result.Result<number, SelectedNodeExecutableInvalid> => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) {
    return Result.fail(invalid("elf-offset-overflow"));
  }
  const value = left * right;
  return Number.isSafeInteger(value) ? Result.succeed(value) : Result.fail(invalid("elf-offset-overflow"));
};

const checkedRange = (
  size: number,
  offset: number,
  length: number,
): Result.Result<void, SelectedNodeExecutableInvalid> => {
  const end = checkedAdd(offset, length);
  if (Result.isFailure(end)) return Result.fail(end.failure);
  return end.success > size ? Result.fail(invalid("truncated-elf-range")) : Result.succeed(undefined);
};

const uint16 = (bytes: Uint8Array, offset: number): number => bytes[offset]! | bytes[offset + 1]! << 8;

const uint32 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16 | bytes[offset + 3]! << 24) >>> 0;

const uint64 = (bytes: Uint8Array, offset: number): Result.Result<number, SelectedNodeExecutableInvalid> => {
  const low = uint32(bytes, offset);
  const high = uint32(bytes, offset + 4);
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? Result.succeed(value) : Result.fail(invalid("elf-offset-overflow"));
};

const mapFailureCause = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  reason: "open-failed" | "read-failed",
): Effect.Effect<A, SelectedNodeExecutableInvalid, R> =>
  Effect.catchCause(operation, (cause) => Effect.failCause(Cause.map(cause, () => invalid(reason))));

const readExactly = (
  file: FileSystem.File,
  size: number,
  offset: number,
  length: number,
): Effect.Effect<Uint8Array, SelectedNodeExecutableInvalid> =>
  Effect.fromResult(checkedRange(size, offset, length)).pipe(
    Effect.andThen(() =>
      mapFailureCause(file.seek(offset, "start").pipe(Effect.andThen(() => file.readAlloc(length))), "read-failed")
    ),
    Effect.flatMap(Option.match({
      onNone: () => Effect.fail(invalid("truncated-elf-range")),
      onSome: (bytes) =>
        bytes.byteLength === length ? Effect.succeed(bytes) : Effect.fail(invalid("truncated-elf-range")),
    })),
  );

const decodeGnuInterpreter = (bytes: Uint8Array): Effect.Effect<string, SelectedNodeExecutableInvalid> =>
  Effect.try({
    try: () => {
      if (bytes.byteLength < 2 || bytes[bytes.byteLength - 1] !== 0 || bytes.indexOf(0) !== bytes.byteLength - 1) {
        throw invalid("invalid-elf-interpreter");
      }
      const interpreter = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, -1));
      if (!/^\/.*\/ld-linux[^/]*\.so(?:\.\d+)*$/.test(interpreter)) {
        throw invalid("selected executable does not use the GNU ELF interpreter");
      }
      return interpreter;
    },
    catch: (error) => error instanceof SelectedNodeExecutableInvalid ? error : invalid("invalid-elf-interpreter"),
  });

export const inspectSelectedNodeExecutable = (
  fileSystem: FileSystem.FileSystem,
  path: string,
  byteSize: bigint,
): Effect.Effect<SelectedNodeExecutableObservation, SelectedNodeExecutableInvalid> =>
  Effect.scoped(
    Effect.gen(function*() {
      if (byteSize < 0n || byteSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        return yield* invalid("selected executable is too large");
      }
      const size = Number(byteSize);
      const file = yield* mapFailureCause(fileSystem.open(path, { flag: "r" }), "open-failed");
      const header = yield* readExactly(file, size, 0, 64);
      if (header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) {
        return yield* invalid("selected executable is not ELF");
      }
      if (header[4] !== 2 || header[5] !== 1 || header[6] !== 1) {
        return yield* invalid("selected executable is not ELF64 little-endian version 1");
      }
      if (uint16(header, 18) !== 62) return yield* invalid("selected executable is not ELF x86-64");
      const programHeaderOffset = yield* Effect.fromResult(uint64(header, 32));
      const programHeaderEntrySize = uint16(header, 54);
      const programHeaderCount = uint16(header, 56);
      if (programHeaderEntrySize !== 56 || programHeaderCount === 0 || programHeaderCount > 4096) {
        return yield* invalid("invalid ELF64 program headers");
      }
      const programHeadersLength = yield* Effect.fromResult(
        checkedMultiply(programHeaderEntrySize, programHeaderCount),
      );
      const programHeaders = yield* readExactly(file, size, programHeaderOffset, programHeadersLength);
      let interpreterRange: { readonly offset: number; readonly length: number } | undefined;
      for (let index = 0; index < programHeaderCount; index++) {
        const entry = yield* Effect.fromResult(checkedMultiply(index, programHeaderEntrySize));
        if (uint32(programHeaders, entry) !== 3) continue;
        if (interpreterRange !== undefined) return yield* invalid("multiple ELF interpreters");
        const offset = yield* Effect.fromResult(uint64(programHeaders, entry + 8));
        const length = yield* Effect.fromResult(uint64(programHeaders, entry + 32));
        if (length === 0 || length > 4096) return yield* invalid("invalid ELF interpreter range");
        interpreterRange = { offset, length };
      }
      if (interpreterRange === undefined) return yield* invalid("selected executable has no ELF interpreter");
      const interpreterBytes = yield* readExactly(file, size, interpreterRange.offset, interpreterRange.length);
      yield* decodeGnuInterpreter(interpreterBytes);
      return Object.freeze({
        format: "elf" as const,
        os: "linux" as const,
        architecture: "x64" as const,
        abi: "gnu" as const,
      });
    }),
  );
