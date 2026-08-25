import { Effect, FileSystem, Path, Schema } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import type * as Executable from "effect-build/Author/Executable";
import type { SystemTarget } from "effect-build/SystemTarget";
import { describe as describeTarget } from "effect-build/SystemTarget";

export class NativeExecutableInspectionFailed extends Schema.TaggedError<NativeExecutableInspectionFailed>()(
  "NativeExecutableInspectionFailed",
  { path: Schema.String, reason: Schema.String },
) {}

interface NativeObservation {
  readonly nativeFormat: "elf" | "mach-o" | "pe";
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly abi?: "gnu" | "musl";
}

const u16 = (bytes: Uint8Array, offset: number, little = true): number => {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("truncated-header");
  return little ? bytes[offset]! | bytes[offset + 1]! << 8 : bytes[offset]! << 8 | bytes[offset + 1]!;
};

const u32 = (bytes: Uint8Array, offset: number, little = true): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("truncated-header");
  return little
    ? (bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16 | bytes[offset + 3]! << 24) >>> 0
    : (bytes[offset]! << 24 | bytes[offset + 1]! << 16 | bytes[offset + 2]! << 8 | bytes[offset + 3]!) >>> 0;
};

const u64 = (bytes: Uint8Array, offset: number, little = true): number => {
  const low = u32(bytes, little ? offset : offset + 4, little);
  const high = u32(bytes, little ? offset + 4 : offset, little);
  const value = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(value)) throw new Error("header-offset-overflow");
  return value;
};

const elf = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 64) throw new Error("truncated-header");
  const elfClass = bytes[4];
  const encoding = bytes[5];
  if ((elfClass !== 1 && elfClass !== 2) || (encoding !== 1 && encoding !== 2)) throw new Error("invalid-elf-header");
  const little = encoding === 1;
  const machine = u16(bytes, 18, little);
  const architecture = machine === 62 ? "x64" : machine === 183 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  const programOffset = elfClass === 2 ? u64(bytes, 32, little) : u32(bytes, 28, little);
  const entrySize = u16(bytes, elfClass === 2 ? 54 : 42, little);
  const entryCount = u16(bytes, elfClass === 2 ? 56 : 44, little);
  const expectedEntrySize = elfClass === 2 ? 56 : 32;
  if (entryCount === 0 || entryCount > 4096 || entrySize !== expectedEntrySize) {
    throw new Error("invalid-program-headers");
  }
  if (programOffset + entrySize * entryCount > bytes.byteLength) throw new Error("truncated-header");
  let interpreter: string | undefined;
  for (let index = 0; index < entryCount; index++) {
    const entry = programOffset + index * entrySize;
    if (u32(bytes, entry, little) !== 3) continue;
    if (interpreter !== undefined) throw new Error("multiple-elf-interpreters");
    const offset = elfClass === 2 ? u64(bytes, entry + 8, little) : u32(bytes, entry + 4, little);
    const length = elfClass === 2 ? u64(bytes, entry + 32, little) : u32(bytes, entry + 16, little);
    if (length === 0 || length > 4096 || offset + length > bytes.byteLength) throw new Error("invalid-interpreter");
    const value = bytes.subarray(offset, offset + length);
    const terminator = value.indexOf(0);
    interpreter = new TextDecoder().decode(terminator < 0 ? value : value.subarray(0, terminator));
  }
  const abi = interpreter?.includes("musl") === true
    ? "musl"
    : interpreter?.includes("ld-linux") === true
    ? "gnu"
    : undefined;
  return { nativeFormat: "elf", os: "linux", architecture, ...(abi === undefined ? {} : { abi }) };
};

const macho = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 8) throw new Error("truncated-header");
  const magic = u32(bytes, 0, false);
  if (magic === 0xcafebabf || magic === 0xbfbafeca) throw new Error("unsupported-fat64");
  if (magic === 0xcafebabe || magic === 0xbebafeca) {
    const little = magic === 0xbebafeca;
    const count = u32(bytes, 4, little);
    const tableEnd = 8 + count * 20;
    if (count === 0 || count > 4096 || tableEnd > bytes.byteLength) throw new Error("invalid-fat-header");
    const slices: Array<{ readonly cpu: number; readonly offset: number; readonly end: number }> = [];
    const architectures = new Set<"x64" | "aarch64">();
    for (let index = 0; index < count; index++) {
      const entry = 8 + index * 20;
      const cpu = u32(bytes, entry, little);
      const offset = u32(bytes, entry + 8, little);
      const size = u32(bytes, entry + 12, little);
      if (size < 8 || offset < tableEnd || offset + size > bytes.byteLength) throw new Error("invalid-fat-slice-range");
      slices.push({ cpu, offset, end: offset + size });
      if (cpu === 0x01000007) architectures.add("x64");
      if (cpu === 0x0100000c) architectures.add("aarch64");
    }
    const ordered = [...slices].sort((left, right) => left.offset - right.offset);
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index]!.offset < ordered[index - 1]!.end) throw new Error("overlapping-fat-slices");
    }
    if (architectures.size !== 1) throw new Error("ambiguous-fat-architecture");
    const architecture = [...architectures][0]!;
    const cpu = architecture === "x64" ? 0x01000007 : 0x0100000c;
    const selected = slices.find((slice) => slice.cpu === cpu)!;
    if (
      bytes[selected.offset] !== 0xcf || bytes[selected.offset + 1] !== 0xfa
      || bytes[selected.offset + 2] !== 0xed || bytes[selected.offset + 3] !== 0xfe
      || u32(bytes, selected.offset + 4, true) !== cpu
    ) throw new Error("invalid-fat-slice");
    return { nativeFormat: "mach-o", os: "macos", architecture };
  }
  const cpu = u32(bytes, 4, true);
  const architecture = cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { nativeFormat: "mach-o", os: "macos", architecture };
};

const pe = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 64) throw new Error("truncated-header");
  const offset = u32(bytes, 60, true);
  if (
    offset + 6 > bytes.byteLength || bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x45
    || bytes[offset + 2] !== 0 || bytes[offset + 3] !== 0
  ) throw new Error("invalid-pe-signature");
  const machine = u16(bytes, offset + 4, true);
  const architecture = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { nativeFormat: "pe", os: "windows", architecture };
};

const parse = (bytes: Uint8Array): NativeObservation => {
  if (bytes.byteLength < 4) throw new Error("truncated-header");
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return elf(bytes);
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return pe(bytes);
  if (
    bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe
    || bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && (bytes[3] === 0xbe || bytes[3] === 0xbf)
    || bytes[0] === 0xbe && bytes[1] === 0xba && bytes[2] === 0xfe && bytes[3] === 0xca
    || bytes[0] === 0xbf && bytes[1] === 0xba && bytes[2] === 0xfe && bytes[3] === 0xca
  ) return macho(bytes);
  throw new Error("invalid-native-magic");
};

const matches = (target: SystemTarget, observed: NativeObservation): boolean => {
  const expected = describeTarget(target);
  return expected.os === observed.os && expected.architecture === observed.architecture
    && (observed.abi === undefined || expected.abi === observed.abi);
};

const targets: readonly SystemTarget[] = [
  "macos-x64",
  "macos-aarch64",
  "linux-x64-gnu",
  "linux-x64-musl",
  "linux-aarch64-gnu",
  "linux-aarch64-musl",
  "windows-x64",
  "windows-aarch64",
];

export const inspect = (
  path: AbsolutePath,
  version: string,
  expected?: SystemTarget,
): Effect.Effect<Executable.Inspection, NativeExecutableInspectionFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const platformPath = yield* Path.Path;
    const information = yield* fileSystem.stat(path).pipe(
      Effect.mapError(() => new NativeExecutableInspectionFailed({ path, reason: "unable-to-stat" })),
    );
    if (information.type !== "File") {
      return yield* new NativeExecutableInspectionFailed({ path, reason: "not-regular-file" });
    }
    if (platformPath.sep !== "\\" && (Number(information.mode) & 0o111) === 0) {
      return yield* new NativeExecutableInspectionFailed({ path, reason: "not-executable" });
    }
    const bytes = yield* fileSystem.readFile(path).pipe(
      Effect.mapError(() => new NativeExecutableInspectionFailed({ path, reason: "unable-to-read" })),
    );
    if (`${bytes.byteLength}` !== `${information.size}`) {
      return yield* new NativeExecutableInspectionFailed({ path, reason: "size-changed-during-read" });
    }
    const observed = yield* Effect.try({
      try: () => parse(bytes),
      catch: (cause) =>
        new NativeExecutableInspectionFailed({
          path,
          reason: cause instanceof Error ? cause.message : "invalid-native-executable",
        }),
    });
    const candidates = expected === undefined
      ? targets.filter((candidate) => matches(candidate, observed))
      : [expected];
    if (candidates.length !== 1 || !matches(candidates[0]!, observed)) {
      return yield* new NativeExecutableInspectionFailed({ path, reason: "native-target-does-not-match-request" });
    }
    return { nativeFormat: observed.nativeFormat, runtime: { name: "deno", version }, target: candidates[0]! };
  });
