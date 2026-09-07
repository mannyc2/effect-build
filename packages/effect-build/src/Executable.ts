import { Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "./Artifact.js";
import * as Target from "./Target.js";

/** What the first few kilobytes of a native executable say about it. */
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
  "unsupported-machine",
  "ambiguous-fat-binary",
  "not-a-native-executable",
] as const);

export class ParseError extends Schema.TaggedError<ParseError>()("ExecutableParseError", { reason: Reason }) {}

export class InspectError extends Schema.TaggedError<InspectError>()("ExecutableInspectError", {
  path: Schema.String,
  reason: Schema.Literals([...Reason.literals, "not-found", "unreadable"] as const),
}) {}

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

const elf = (b: Uint8Array): Facts => {
  if (b.byteLength < 64) fail("truncated-header");
  const cls = b[4], enc = b[5];
  if ((cls !== 1 && cls !== 2) || (enc !== 1 && enc !== 2)) fail("invalid-header");
  const le = enc === 1;
  const machine = u16(b, 18, le);
  const arch: Target.Arch | undefined = machine === 62 ? "x64" : machine === 183 ? "arm64" : undefined;
  if (arch === undefined) fail("unsupported-machine");
  const phoff = cls === 2 ? u64(b, 32, le) : u32(b, 28, le);
  const phentsize = u16(b, cls === 2 ? 54 : 42, le);
  const phnum = u16(b, cls === 2 ? 56 : 44, le);
  if (phnum === 0 || phnum > 4096 || phentsize !== (cls === 2 ? 56 : 32)) fail("invalid-header");
  let interp: string | undefined;
  for (let i = 0; i < phnum; i++) {
    const e = phoff + i * phentsize;
    if (e + phentsize > b.byteLength) break; // header region beyond what we read; interp absent is fine
    if (u32(b, e, le) !== 3) continue; // PT_INTERP
    const off = cls === 2 ? u64(b, e + 8, le) : u32(b, e + 4, le);
    const len = cls === 2 ? u64(b, e + 32, le) : u32(b, e + 16, le);
    if (len === 0 || len > 4096 || off + len > b.byteLength) break;
    const s = b.subarray(off, off + len);
    const nul = s.indexOf(0);
    interp = new TextDecoder().decode(nul < 0 ? s : s.subarray(0, nul));
    break;
  }
  const abi: Target.Abi | undefined = interp?.includes("musl") ? "musl" : interp?.includes("ld-linux") ? "gnu" : undefined;
  return { format: "elf", os: "linux", arch: arch!, ...(abi === undefined ? {} : { abi }) };
};

const machoArch = (cpu: number): Target.Arch | undefined => cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "arm64" : undefined;

const macho = (b: Uint8Array): Facts => {
  if (b.byteLength < 8) fail("truncated-header");
  const magic = u32(b, 0, false);
  if (magic === 0xcafebabe || magic === 0xbebafeca) {
    // fat binary: accept only if all slices agree on one supported arch
    const le = magic === 0xbebafeca;
    const count = u32(b, 4, le);
    if (count === 0 || count > 64) fail("invalid-header");
    const archs = new Set<Target.Arch>();
    for (let i = 0; i < count; i++) {
      const a = machoArch(u32(b, 8 + i * 20, le));
      if (a !== undefined) archs.add(a);
    }
    if (archs.size !== 1) fail("ambiguous-fat-binary");
    return { format: "mach-o", os: "darwin", arch: [...archs][0]! };
  }
  if (magic === 0xcafebabf || magic === 0xbfbafeca) fail("invalid-header"); // fat64
  const arch = machoArch(u32(b, 4, true));
  if (arch === undefined) fail("unsupported-machine");
  return { format: "mach-o", os: "darwin", arch: arch! };
};

const pe = (b: Uint8Array): Facts => {
  if (b.byteLength < 64) fail("truncated-header");
  const off = u32(b, 60, true);
  if (off + 6 > b.byteLength || b[off] !== 0x50 || b[off + 1] !== 0x45 || b[off + 2] !== 0 || b[off + 3] !== 0) {
    fail("invalid-header");
  }
  const machine = u16(b, off + 4, true);
  const arch: Target.Arch | undefined = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "arm64" : undefined;
  if (arch === undefined) fail("unsupported-machine");
  return { format: "pe", os: "windows", arch: arch! };
};

const parseSync = (b: Uint8Array): Facts => {
  if (b.byteLength < 4) fail("truncated-header");
  if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return elf(b);
  if (b[0] === 0x4d && b[1] === 0x5a) return pe(b);
  const m = u32(b, 0, false);
  if (m === 0xfeedfacf || m === 0xcffaedfe || m === 0xcafebabe || m === 0xbebafeca || m === 0xcafebabf || m === 0xbfbafeca) {
    return macho(b);
  }
  return fail("not-a-native-executable");
};

export const parse = (bytes: Uint8Array): Effect.Effect<Facts, ParseError> =>
  Effect.try({
    try: () => parseSync(bytes),
    catch: (e) => e instanceof ParseError ? e : new ParseError({ reason: "not-a-native-executable" }),
  });

export const inspect = (path: string): Effect.Effect<Facts, InspectError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(path);
    const bytes = yield* fs.readFile(absolute).pipe(
      Effect.mapError(() => new InspectError({ path: absolute, reason: "unreadable" })),
    );
    return yield* parse(bytes).pipe(Effect.mapError((e) => new InspectError({ path: absolute, reason: e.reason })));
  });

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
