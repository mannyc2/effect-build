import { Crypto, Effect, FileSystem, Path, Stream } from "effect";
import { Artifact } from "effect-build";
import { Deflate } from "fflate/browser";
import { InputInvalid } from "../InputInvalid.js";

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
/** Payloads stay on disk: `contents` streams exactly `bytes` bytes when the encoder reaches the entry. */
export interface Entry {
  readonly path: string;
  readonly mode: number;
  readonly bytes: number;
  readonly contents: Stream.Stream<Uint8Array, Artifact.ArtifactError, Fs>;
}
export type Write = (chunk: Uint8Array) => Effect.Effect<void, Artifact.ArtifactError>;

/** ZIP32 field widths; wheels never use ZIP64. */
export const zip32 = { entries: 0xffff, bytes: 0xffffffff, nameBytes: 0xffff } as const;
const encoder = new TextEncoder();
const bytes = (...values: readonly number[]): Uint8Array => Uint8Array.from(values);
const uint16 = (value: number): Uint8Array => bytes(value, value >>> 8);
const uint32 = (value: number): Uint8Array => bytes(value, value >>> 8, value >>> 16, value >>> 24);
const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) === 0 ? value >>> 1 : 0xedb88320 ^ (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();
const crc32 = (crc: number, input: Uint8Array): number => {
  let value = crc;
  for (const byte of input) value = (value >>> 8) ^ (crcTable[(value ^ byte) & 0xff] ?? 0);
  return value;
};

export const utf8Order = (left: string, right: string): number => {
  const a = encoder.encode(left), b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.byteLength, b.byteLength); index++) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

/** Reject what ZIP32 cannot hold before any payload is read. */
export const zipLimit = (entries: readonly Entry[]): InputInvalid | undefined => {
  if (entries.length > zip32.entries) return new InputInvalid({ reason: `ZIP32 wheels hold at most ${zip32.entries} entries including metadata` });
  for (const entry of entries) {
    if (encoder.encode(entry.path).byteLength > zip32.nameBytes) return new InputInvalid({ reason: `ZIP32 entry names are at most ${zip32.nameBytes} bytes: ${entry.path}` });
    if (entry.bytes > zip32.bytes) return new InputInvalid({ reason: `ZIP32 entries are at most ${zip32.bytes} bytes: ${entry.path}` });
  }
  return undefined;
};

/** Deflate one payload straight to `write`, learning its CRC and sizes as the bytes pass through. */
const deflateTo = (entry: Entry, write: Write) =>
  Effect.gen(function*() {
    const pending: Uint8Array[] = [];
    const deflate = new Deflate({ level: 6 }, (chunk) => {
      pending.push(chunk);
    });
    let crc = 0xffffffff, size = 0, compressedSize = 0;
    const flush = () => {
      if (pending.length === 0) return Effect.void;
      const output = concat(pending.splice(0));
      compressedSize += output.byteLength;
      return write(output);
    };
    yield* entry.contents.pipe(Stream.runForEach((chunk) => {
      crc = crc32(crc, chunk);
      size += chunk.byteLength;
      deflate.push(chunk);
      return flush();
    }));
    deflate.push(new Uint8Array(0), true);
    yield* flush();
    if (size !== entry.bytes) {
      return yield* new Artifact.ArtifactError({ path: entry.path, reason: "changed", detail: "entry stream did not match its recorded size" });
    }
    return { crc: (crc ^ 0xffffffff) >>> 0, size, compressedSize };
  });

/**
 * ZIP32 with fixed DEFLATE level and zero timestamps. Each entry's CRC and sizes follow its
 * data in a descriptor (flag bit 3), so no payload is buffered to fill in its header.
 */
export const encodeZip = (unsorted: readonly Entry[], write: Write): Effect.Effect<void, Artifact.ArtifactError | InputInvalid, Fs> =>
  Effect.gen(function*() {
    const limit = zipLimit(unsorted);
    if (limit !== undefined) return yield* limit;
    const entries = [...unsorted].sort((a, b) => utf8Order(a.path, b.path));
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
      const name = encoder.encode(entry.path);
      const local = offset;
      const header = concat([
        uint32(0x04034b50), uint16(20), uint16(0x0808), uint16(8), uint16(0), uint16(0x0021),
        uint32(0), uint32(0), uint32(0), uint16(name.byteLength), uint16(0), name,
      ]);
      yield* write(header);
      const { crc, size, compressedSize } = yield* deflateTo(entry, write);
      offset += header.byteLength + compressedSize;
      if (compressedSize > zip32.bytes || offset > zip32.bytes) return yield* new InputInvalid({ reason: `ZIP32 wheels are at most ${zip32.bytes} bytes: ${entry.path}` });
      yield* write(concat([uint32(0x08074b50), uint32(crc), uint32(compressedSize), uint32(size)]));
      offset += 16;
      central.push(concat([
        uint32(0x02014b50), uint16(0x0314), uint16(20), uint16(0x0808), uint16(8), uint16(0), uint16(0x0021),
        uint32(crc), uint32(compressedSize), uint32(size), uint16(name.byteLength),
        uint16(0), uint16(0), uint16(0), uint16(0), uint32(((0o100000 | entry.mode) << 16) >>> 0), uint32(local), name,
      ]));
    }
    const directorySize = central.reduce((total, record) => total + record.byteLength, 0);
    if (offset > zip32.bytes || directorySize > zip32.bytes) return yield* new InputInvalid({ reason: `ZIP32 wheels are at most ${zip32.bytes} bytes` });
    for (const record of central) yield* write(record);
    yield* write(concat([
      uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
      uint32(directorySize), uint32(offset), uint16(0),
    ]));
  });
