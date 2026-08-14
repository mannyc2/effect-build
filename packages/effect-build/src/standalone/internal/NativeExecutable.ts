export interface NativeExecutableObservation {
  readonly format: "elf" | "macho" | "pe";
  readonly os: "linux" | "macos" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly abi?: "gnu" | "musl";
}

interface NativeExecutableChunk {
  readonly offset: number;
  readonly bytes: Uint8Array;
}

export class NativeExecutableRangeRequired extends Error {
  readonly offset: number;
  readonly length: number;

  constructor(offset: number, length: number) {
    super(`native executable range required: ${offset}+${length}`);
    this.offset = offset;
    this.length = length;
  }
}

interface NativeExecutableBytes {
  readonly size: number;
  readonly chunks: readonly NativeExecutableChunk[];
}

const need = (source: NativeExecutableBytes, offset: number, length: number): Uint8Array => {
  const end = offset + length;
  if (
    !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || !Number.isSafeInteger(end)
    || offset < 0 || length < 0
  ) {
    throw new Error("invalid-header-range");
  }
  if (end > source.size) throw new Error("truncated-header");
  for (const chunk of source.chunks) {
    const chunkEnd = chunk.offset + chunk.bytes.byteLength;
    if (offset >= chunk.offset && end <= chunkEnd) {
      return chunk.bytes.subarray(offset - chunk.offset, end - chunk.offset);
    }
  }
  throw new NativeExecutableRangeRequired(offset, length);
};

const u16 = (source: NativeExecutableBytes, offset: number, little = true): number => {
  const bytes = need(source, offset, 2);
  return little ? bytes[0]! | bytes[1]! << 8 : bytes[0]! << 8 | bytes[1]!;
};

const u32 = (source: NativeExecutableBytes, offset: number, little = true): number => {
  const bytes = need(source, offset, 4);
  return little
    ? (bytes[0]! | bytes[1]! << 8 | bytes[2]! << 16 | bytes[3]! << 24) >>> 0
    : (bytes[0]! << 24 | bytes[1]! << 16 | bytes[2]! << 8 | bytes[3]!) >>> 0;
};

const u64 = (source: NativeExecutableBytes, offset: number, little = true): number => {
  const low = u32(source, little ? offset : offset + 4, little);
  const high = u32(source, little ? offset + 4 : offset, little);
  const value = high * 0x1_0000_0000 + low;
  if (!Number.isSafeInteger(value)) throw new Error("header-offset-overflow");
  return value;
};

const terminatedText = (bytes: Uint8Array): string => {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end < 0 ? bytes : bytes.slice(0, end));
};

const inspectElf = (source: NativeExecutableBytes): NativeExecutableObservation => {
  const header = need(source, 0, 64);
  const elfClass = header[4];
  const data = header[5];
  if ((elfClass !== 1 && elfClass !== 2) || (data !== 1 && data !== 2)) throw new Error("invalid-elf-header");
  const little = data === 1;
  const machine = u16(source, 18, little);
  const architecture = machine === 62 ? "x64" : machine === 183 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  const phoff = elfClass === 2 ? u64(source, 32, little) : u32(source, 28, little);
  const phentsize = u16(source, elfClass === 2 ? 54 : 42, little);
  const phnum = u16(source, elfClass === 2 ? 56 : 44, little);
  const expectedEntrySize = elfClass === 2 ? 56 : 32;
  if (phnum === 0 || phnum > 4096 || phentsize !== expectedEntrySize) {
    throw new Error("invalid-program-headers");
  }
  need(source, phoff, phentsize * phnum);
  let interpreter: string | undefined;
  for (let index = 0; index < phnum; index++) {
    const entry = phoff + index * phentsize;
    if (u32(source, entry, little) !== 3) continue;
    const offset = elfClass === 2 ? u64(source, entry + 8, little) : u32(source, entry + 4, little);
    const length = elfClass === 2 ? u64(source, entry + 32, little) : u32(source, entry + 16, little);
    if (length === 0 || length > 4096) throw new Error("invalid-interpreter");
    interpreter = terminatedText(need(source, offset, length));
  }
  const abi = interpreter?.includes("musl") === true
    ? "musl"
    : interpreter?.includes("ld-linux") === true
    ? "gnu"
    : undefined;
  return { format: "elf", os: "linux", architecture, ...(abi === undefined ? {} : { abi }) };
};

const inspectMacho = (source: NativeExecutableBytes): NativeExecutableObservation => {
  need(source, 0, 8);
  const magic = u32(source, 0, false);
  const fatMagic = 0xcafebabe;
  const fatCigam = 0xbebafeca;
  if (magic === fatMagic || magic === fatCigam) {
    const little = magic === fatCigam;
    const count = u32(source, 4, little);
    if (count === 0 || count > 4096) throw new Error("invalid-fat-header");
    need(source, 8, count * 20);
    const architectures = new Set<"x64" | "aarch64">();
    for (let index = 0; index < count; index++) {
      const cpu = u32(source, 8 + index * 20, little);
      if (cpu === 0x01000007) architectures.add("x64");
      if (cpu === 0x0100000c) architectures.add("aarch64");
    }
    if (architectures.size !== 1) throw new Error("ambiguous-fat-architecture");
    return { format: "macho", os: "macos", architecture: [...architectures][0]! };
  }
  const cpu = u32(source, 4, true);
  const architecture = cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { format: "macho", os: "macos", architecture };
};

const inspectPe = (source: NativeExecutableBytes): NativeExecutableObservation => {
  need(source, 0, 64);
  const offset = u32(source, 60, true);
  const signature = need(source, offset, 6);
  if (signature[0] !== 0x50 || signature[1] !== 0x45 || signature[2] !== 0 || signature[3] !== 0) {
    throw new Error("invalid-pe-signature");
  }
  const machine = u16(source, offset + 4, true);
  const architecture = machine === 0x8664 ? "x64" : machine === 0xaa64 ? "aarch64" : undefined;
  if (architecture === undefined) throw new Error("unsupported-machine");
  return { format: "pe", os: "windows", architecture };
};

export const inspectNativeExecutableChunks = (
  size: number,
  chunks: readonly NativeExecutableChunk[],
): NativeExecutableObservation => {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("invalid-byte-count");
  for (const chunk of chunks) {
    if (
      !Number.isSafeInteger(chunk.offset) || chunk.offset < 0
      || !Number.isSafeInteger(chunk.offset + chunk.bytes.byteLength)
      || chunk.offset + chunk.bytes.byteLength > size
    ) throw new Error("invalid-header-range");
  }
  const source = { size, chunks };
  const magic = need(source, 0, 4);
  if (magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46) {
    return inspectElf(source);
  }
  if (magic[0] === 0x4d && magic[1] === 0x5a) return inspectPe(source);
  if (
    magic[0] === 0xcf && magic[1] === 0xfa || magic[0] === 0xce && magic[1] === 0xfa
    || magic[0] === 0xca && magic[1] === 0xfe || magic[0] === 0xbe && magic[1] === 0xba
  ) return inspectMacho(source);
  throw new Error("invalid-native-magic");
};

export const inspectNativeExecutable = (bytes: Uint8Array): NativeExecutableObservation =>
  inspectNativeExecutableChunks(bytes.byteLength, [{ offset: 0, bytes }]);
