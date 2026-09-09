import { Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "./Artifact.js";
import * as Target from "./Target.js";

/** Native executable facts established from complete metadata and declared payload bounds. */
export interface Facts {
  readonly format: Target.Format;
  readonly os: Target.Os;
  readonly arch: Target.Arch;
  /** ELF only; undefined when there is no PT_INTERP (static binaries). */
  readonly abi?: Target.Abi;
}

const Reason = Schema.Literals([
  "truncated-header",
  "invalid-header",
  "unsupported-interpreter",
  "header-too-large",
  "unsupported-machine",
  "ambiguous-fat-binary",
  "not-a-native-executable",
] as const);

export class ParseError extends Schema.TaggedError<ParseError>()("ExecutableParseError", { reason: Reason }) {
  override get message(): string {
    return this.reason;
  }
}

export class InspectError extends Schema.TaggedError<InspectError>()("ExecutableInspectError", {
  path: Schema.String,
  reason: Schema.Literals([...Reason.literals, "not-found", "unreadable"] as const),
}) {
  override get message(): string {
    return `${this.reason}: ${this.path}`;
  }
}

export class TargetMismatch extends Schema.TaggedError<TargetMismatch>()("ExecutableTargetMismatch", {
  path: Schema.String,
  expected: Target.Target,
  observed: Schema.String,
}) {
  override get message(): string {
    return `${this.path}: expected ${this.expected}, header says ${this.observed}`;
  }
}

const fail = (reason: typeof Reason.Type): never => {
  throw new ParseError({ reason });
};

const u16 = (b: Uint8Array, o: number, le = true): number => {
  if (o < 0 || o + 2 > b.byteLength) fail("truncated-header");
  return le ? b[o]! | b[o + 1]! << 8 : b[o]! << 8 | b[o + 1]!;
};
const u32 = (b: Uint8Array, o: number, le = true): number => {
  if (o < 0 || o + 4 > b.byteLength) fail("truncated-header");
  return le
    ? (b[o]! | b[o + 1]! << 8 | b[o + 2]! << 16 | b[o + 3]! << 24) >>> 0
    : (b[o]! << 24 | b[o + 1]! << 16 | b[o + 2]! << 8 | b[o + 3]!) >>> 0;
};
const u64 = (b: Uint8Array, o: number, le = true): number => {
  const low = u32(b, le ? o : o + 4, le);
  const high = u32(b, le ? o + 4 : o, le);
  const v = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(v)) fail("invalid-header");
  return v;
};

/** Only metadata ranges are read; payload ranges are checked against the file size. */
interface Range { readonly offset: number; readonly length: number; }
type Inspection = Generator<Range, Facts, Uint8Array>;
const bounds = (offset: number, length: number, size: number): void => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) fail("invalid-header");
  if (offset > size || length > size - offset) fail("truncated-header");
};
function* read(offset: number, length: number, size: number): Generator<Range, Uint8Array, Uint8Array> {
  bounds(offset, length, size);
  if (length > 16 * 1024 * 1024) fail("header-too-large");
  return yield { offset, length };
}

function* elf(size: number): Inspection {
  const b = yield* read(0, 64, size);
  if (b[4] !== 2 || (b[5] !== 1 && b[5] !== 2) || b[6] !== 1) fail("invalid-header");
  const le = b[5] === 1;
  if (![2, 3].includes(u16(b, 16, le)) || u32(b, 20, le) !== 1 || u16(b, 52, le) !== 64) fail("invalid-header");
  const machine = u16(b, 18, le);
  const arch = machine === 62 ? "x64" : machine === 183 ? "arm64" : undefined;
  if (arch === undefined) fail("unsupported-machine");
  const phoff = u64(b, 32, le), phentsize = u16(b, 54, le), phnum = u16(b, 56, le);
  if (phoff < 64 || phnum === 0 || phnum > 4096 || phentsize !== 56) fail("invalid-header");
  const table = yield* read(phoff, phentsize * phnum, size);
  let abi: Target.Abi | undefined;
  let hasInterpreter = false, hasLoad = false;
  for (let i = 0; i < phnum; i++) {
    const e = i * phentsize, type = u32(table, e, le);
    const off = u64(table, e + 8, le), len = u64(table, e + 32, le);
    bounds(off, len, size);
    if (type === 1) {
      if (u64(table, e + 40, le) < len) fail("invalid-header");
      hasLoad ||= len > 0;
    }
    if (type !== 3) continue;
    if (hasInterpreter || len < 2 || len > 4096) fail("invalid-header");
    hasInterpreter = true;
    const data = yield* read(off, len, size);
    if (data[len - 1] !== 0 || data.subarray(0, len - 1).includes(0)) fail("invalid-header");
    const interpreter = new TextDecoder().decode(data.subarray(0, len - 1));
    abi = /^\/(?:[^/]+\/)*ld-musl-[^/]+\.so\.1$/u.test(interpreter) ? "musl"
      : /^\/(?:[^/]+\/)*ld-linux[^/]*\.so\.[0-9]+$/u.test(interpreter) ? "gnu" : undefined;
    if (abi === undefined) fail("unsupported-interpreter");
  }
  if (!hasLoad) fail("invalid-header");
  return { format: "elf", os: "linux", arch: arch!, ...(abi === undefined ? {} : { abi }) };
}

const machoArch = (cpu: number): Target.Arch | undefined => cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "arm64" : undefined;
function* thinMacho(base: number, size: number): Inspection {
  const b = yield* read(base, 32, base + size);
  const magic = u32(b, 0, false);
  if (magic !== 0xfeedfacf && magic !== 0xcffaedfe) fail("invalid-header");
  const le = magic === 0xcffaedfe;
  const arch = machoArch(u32(b, 4, le));
  if (arch === undefined) fail("unsupported-machine");
  if (u32(b, 12, le) !== 2) fail("invalid-header"); // MH_EXECUTE
  const count = u32(b, 16, le), length = u32(b, 20, le);
  if (count === 0 || count > 65536 || count * 8 > length) fail("invalid-header");
  const commands = yield* read(base + 32, length, base + size);
  let offset = 0, hasSegment = false;
  for (let i = 0; i < count; i++) {
    const command = u32(commands, offset, le), commandSize = u32(commands, offset + 4, le);
    if (commandSize < 8 || commandSize % 8 !== 0 || commandSize > commands.length - offset) fail("invalid-header");
    if (command === 0x19) { // LC_SEGMENT_64
      if (commandSize < 72 || commandSize !== 72 + u32(commands, offset + 64, le) * 80) fail("invalid-header");
      const fileOffset = u64(commands, offset + 40, le), fileSize = u64(commands, offset + 48, le);
      bounds(fileOffset, fileSize, size);
      if (u64(commands, offset + 32, le) < fileSize) fail("invalid-header");
      hasSegment ||= fileSize > 0;
    }
    offset += commandSize;
  }
  if (offset !== length || !hasSegment) fail("invalid-header");
  return { format: "mach-o", os: "darwin", arch: arch! };
}
function* macho(size: number, magic: number): Inspection {
  if (magic === 0xfeedfacf || magic === 0xcffaedfe) return yield* thinMacho(0, size);
  if (magic === 0xcafebabf || magic === 0xbfbafeca) fail("invalid-header");
  const le = magic === 0xbebafeca;
  const b = yield* read(0, 8, size), count = u32(b, 4, le);
  if (count === 0 || count > 64) fail("invalid-header");
  const table = yield* read(8, count * 20, size);
  const architectures = new Set<Target.Arch>();
  for (let i = 0; i < count; i++) {
    const entry = i * 20, arch = machoArch(u32(table, entry, le));
    if (arch === undefined) fail("unsupported-machine");
    architectures.add(arch!);
  }
  if (architectures.size !== 1) fail("ambiguous-fat-binary");
  let result: Facts | undefined;
  for (let i = 0; i < count; i++) {
    const entry = i * 20, offset = u32(table, entry + 8, le), length = u32(table, entry + 12, le);
    if (offset < 8 + count * 20) fail("invalid-header");
    bounds(offset, length, size);
    result = yield* thinMacho(offset, length);
    if (result.arch !== machoArch(u32(table, entry, le))) fail("invalid-header");
  }
  return result!;
}
function* pe(size: number): Inspection {
  const dos = yield* read(0, 64, size), offset = u32(dos, 60);
  if (offset < 64) fail("invalid-header");
  const coff = yield* read(offset, 24, size);
  if (u32(coff, 0) !== 0x4550) fail("invalid-header");
  const machine = u16(coff, 4), arch = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "arm64" : undefined;
  if (arch === undefined) fail("unsupported-machine");
  const count = u16(coff, 6), optionalSize = u16(coff, 20), characteristics = u16(coff, 22);
  if (count === 0 || count > 4096 || optionalSize < 112 || !(characteristics & 2) || (characteristics & 0x2000)) fail("invalid-header");
  const optional = yield* read(offset + 24, optionalSize, size);
  if (u16(optional, 0) !== 0x20b || 112 + u32(optional, 108) * 8 > optionalSize) fail("invalid-header");
  const sectionOffset = offset + 24 + optionalSize, headersSize = u32(optional, 60);
  if (headersSize < sectionOffset + count * 40 || headersSize > size || u32(optional, 56) === 0) fail("invalid-header");
  const sections = yield* read(sectionOffset, count * 40, size);
  let hasSection = false;
  for (let i = 0; i < count; i++) {
    const entry = i * 40, length = u32(sections, entry + 16), offset = u32(sections, entry + 20);
    if (length > 0 && offset < headersSize) fail("invalid-header");
    bounds(offset, length, size);
    hasSection ||= length > 0;
  }
  if (!hasSection) fail("invalid-header");
  return { format: "pe", os: "windows", arch: arch! };
}
function* inspectRanges(size: number): Inspection {
  const b = yield* read(0, 4, size);
  if (u32(b, 0) === 0x464c457f) return yield* elf(size);
  if (b[0] === 0x4d && b[1] === 0x5a) return yield* pe(size);
  const magic = u32(b, 0, false);
  if ([0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) return yield* macho(size, magic);
  return fail("not-a-native-executable");
}

/** Validate native structure and declared payload bounds, without attempting to load or execute the program. */
export const parse = (bytes: Uint8Array): Effect.Effect<Facts, ParseError> =>
  Effect.try({
    try: () => {
      const parser = inspectRanges(bytes.byteLength);
      let step = parser.next();
      while (!step.done) step = parser.next(bytes.subarray(step.value.offset, step.value.offset + step.value.length));
      return step.value;
    },
    catch: (e) => e instanceof ParseError ? e : new ParseError({ reason: "invalid-header" }),
  });

/** Read metadata only (each region at most 16 MiB); file payloads are never buffered. */
export const inspect = (path: string): Effect.Effect<Facts, InspectError, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(path);
    const unreadable = () => new InspectError({ path: absolute, reason: "unreadable" as const });
    const handle = yield* fs.open(absolute).pipe(Effect.mapError(unreadable));
    const info = yield* handle.stat.pipe(Effect.mapError(unreadable));
    if (info.type !== "File" || info.size > BigInt(Number.MAX_SAFE_INTEGER)) return yield* unreadable();
    const parser = inspectRanges(Number(info.size));
    const advance = (bytes?: Uint8Array) => Effect.try({
      try: () => bytes === undefined ? parser.next() : parser.next(bytes),
      catch: (e) => new InspectError({ path: absolute, reason: e instanceof ParseError ? e.reason : "invalid-header" }),
    });
    let step = yield* advance();
    while (!step.done) {
      const { offset, length } = step.value;
      yield* handle.seek(offset, "start");
      const bytes = new Uint8Array(length);
      let read = 0;
      while (read < length) {
        const count = Number(yield* handle.read(bytes.subarray(read)).pipe(Effect.mapError(unreadable)));
        if (count === 0) return yield* new InspectError({ path: absolute, reason: "truncated-header" });
        read += count;
      }
      step = yield* advance(bytes);
    }
    return step.value;
  }));

/**
 * Header facts are consistent with a target when os and arch agree and, if
 * the header names an ABI, it agrees too. A static Linux binary (no
 * interpreter) matches both gnu and musl.
 */
export const matches = (facts: Facts, target: Target.Target): boolean => {
  const t = Target.parts(target);
  return facts.os === t.os && facts.arch === t.arch && (facts.abi === undefined || facts.abi === t.abi);
};

const describe = (facts: Facts): string => `${facts.os}-${facts.arch}${facts.abi === undefined ? "" : `-${facts.abi}`}`;

/** Static Linux binaries default to glibc unless the caller specifies musl. */
export const resolveTarget = (
  path: string,
  facts: Facts,
  expected?: Target.Target,
): Effect.Effect<Target.Target, TargetMismatch> => {
  if (expected !== undefined) {
    return matches(facts, expected)
      ? Effect.succeed(expected)
      : Effect.fail(new TargetMismatch({ path, expected, observed: describe(facts) }));
  }
  const candidates = Target.all.filter((t) => matches(facts, t));
  const chosen = candidates.length === 1
    ? candidates[0]
    : candidates.find((t) => Target.parts(t).abi !== "musl");
  return chosen === undefined
    ? Effect.fail(new TargetMismatch({ path, expected: Target.all[0]!, observed: describe(facts) }))
    : Effect.succeed(chosen);
};

/**
 * Combinator: assert an executable artifact is for `target`, re-reading its
 * header. Use after steps that rewrite the binary (signing, stripping) or on
 * executables you didn't build yourself.
 */
export const expectTarget = (target: Target.Target) =>
<E, R>(self: Effect.Effect<Artifact.Executable, E, R>): Effect.Effect<
  Artifact.Executable,
  E | InspectError | TargetMismatch,
  R | FileSystem.FileSystem | Path.Path
> =>
  self.pipe(
    Effect.tap((artifact) =>
      inspect(artifact.path).pipe(
        Effect.flatMap((facts) => resolveTarget(artifact.path, facts, target)),
      )
    ),
  );
