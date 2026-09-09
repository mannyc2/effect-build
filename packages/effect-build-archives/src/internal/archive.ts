import { Crypto, Effect, FileSystem, Path, Stream } from "effect";
import { Artifact } from "effect-build";
import { Deflate, Gzip } from "fflate/browser";
import { FormatLimit } from "../FormatLimit.js";
import { InputInvalid } from "../InputInvalid.js";

export type EntryKind = "file" | "directory" | "symlink";
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
export type Contents = Stream.Stream<Uint8Array, Artifact.ArtifactError, Fs>;
export type Write = (chunk: Uint8Array) => Effect.Effect<void, Artifact.ArtifactError>;

/** Inputs stay on disk: `contents` streams exactly `bytes` bytes when the encoder reaches the entry. */
export interface Entry {
  readonly path: string;
  readonly kind: EntryKind;
  readonly mode: number;
  readonly bytes: number;
  readonly contents: Contents;
  readonly linkTarget?: string | undefined;
}

/** Payloads are read and compressed in pieces of this size, so output depends only on the input bytes. */
export const chunkSize = 64 * 1024;
/** ZIP32 field widths; ZIP64 records are never written. */
export const zip32 = { entries: 0xffff, bytes: 0xffffffff, nameBytes: 0xffff } as const;
/** The ustar size field holds eleven octal digits; PAX size records are not written. */
export const ustar = { bytes: 0o77777777777 } as const;

const encoder = new TextEncoder();
const paxLongSymlinkPlaceholder = "././@LongSymLink";

const bytes = (...values: readonly number[]): Uint8Array => Uint8Array.from(values);

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const uint16 = (value: number): Uint8Array => bytes(value, value >>> 8);

const uint32 = (value: number): Uint8Array => bytes(value, value >>> 8, value >>> 16, value >>> 24);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) === 0 ? value >>> 1 : 0xedb88320 ^ (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

/** Incremental CRC-32: start from 0xffffffff, feed chunks, finish with `(crc ^ 0xffffffff) >>> 0`. */
export const crc32 = (crc: number, input: Uint8Array): number => {
  let value = crc;
  for (const byte of input) value = (value >>> 8) ^ (crcTable[(value ^ byte) & 0xff] ?? 0);
  return value;
};

const utf8Order = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

export const sortEntries = (entries: readonly Entry[]): readonly Entry[] =>
  [...entries].sort((a, b) => utf8Order(a.path, b.path));

const zipMode = (entry: Entry): number => {
  switch (entry.kind) {
    case "directory":
      return 0o040000 | entry.mode;
    case "symlink":
      return 0o120000 | entry.mode;
    case "file":
      return 0o100000 | entry.mode;
  }
};

const zipName = (entry: Entry): string => entry.kind === "directory" && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path;
const linkBytes = (entry: Entry): Uint8Array => encoder.encode(entry.linkTarget ?? "");
/** A symlink's ZIP payload is its target; other kinds carry their own byte count. */
const payloadBytes = (entry: Entry): number => entry.kind === "symlink" ? linkBytes(entry).byteLength : entry.bytes;

/** A stream that delivered a different byte count than its record cannot be encoded consistently. */
const lengthMismatch = (path: string) =>
  new Artifact.ArtifactError({ path, reason: "changed", detail: "entry stream did not match its recorded size" });

/** Format limits knowable before any payload is read; sizes learned while compressing are checked as they appear. */
export const zipLimit = (entries: readonly Entry[]): FormatLimit | undefined => {
  if (entries.length > zip32.entries) return new FormatLimit({ format: "zip", limit: "entries", maximum: zip32.entries });
  for (const entry of entries) {
    if (encoder.encode(zipName(entry)).byteLength > zip32.nameBytes) {
      return new FormatLimit({ format: "zip", limit: "name-bytes", maximum: zip32.nameBytes, path: entry.path });
    }
    if (payloadBytes(entry) > zip32.bytes) return new FormatLimit({ format: "zip", limit: "entry-bytes", maximum: zip32.bytes, path: entry.path });
  }
  return undefined;
};

export const tarLimit = (entries: readonly Entry[]): FormatLimit | undefined => {
  const oversized = entries.find((entry) => entry.kind === "file" && entry.bytes > ustar.bytes);
  return oversized === undefined ? undefined : new FormatLimit({ format: "tar", limit: "entry-bytes", maximum: ustar.bytes, path: oversized.path });
};

/** Deflate one payload straight to `write`, learning its CRC and sizes as the bytes pass through. */
const deflateTo = (contents: Contents, write: Write) =>
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
    yield* contents.pipe(Stream.runForEach((chunk) => {
      crc = crc32(crc, chunk);
      size += chunk.byteLength;
      deflate.push(chunk);
      return flush();
    }));
    deflate.push(new Uint8Array(0), true);
    yield* flush();
    return { crc: (crc ^ 0xffffffff) >>> 0, size, compressedSize };
  });

/**
 * ZIP32 with fixed DEFLATE level and zero timestamps. Each entry's CRC and sizes follow its
 * data in a descriptor (flag bit 3), so no payload is buffered to fill in its header.
 */
export const encodeZip = (unsorted: readonly Entry[], write: Write): Effect.Effect<void, Artifact.ArtifactError | FormatLimit, Fs> =>
  Effect.gen(function*() {
    const limit = zipLimit(unsorted);
    if (limit !== undefined) return yield* limit;
    const entries = sortEntries(unsorted);
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
      const name = encoder.encode(zipName(entry));
      const local = offset;
      const header = concat([
        uint32(0x04034b50),
        uint16(20),
        uint16(0x0808),
        uint16(8),
        uint16(0),
        uint16(0x0021),
        uint32(0),
        uint32(0),
        uint32(0),
        uint16(name.byteLength),
        uint16(0),
        name,
      ]);
      yield* write(header);
      const { crc, size, compressedSize } = yield* deflateTo(entry.kind === "symlink" ? Stream.make(linkBytes(entry)) : entry.contents, write);
      if (size !== payloadBytes(entry)) return yield* lengthMismatch(entry.path);
      offset += header.byteLength + compressedSize;
      if (compressedSize > zip32.bytes) return yield* new FormatLimit({ format: "zip", limit: "entry-bytes", maximum: zip32.bytes, path: entry.path });
      if (offset > zip32.bytes) return yield* new FormatLimit({ format: "zip", limit: "archive-bytes", maximum: zip32.bytes, path: entry.path });
      yield* write(concat([uint32(0x08074b50), uint32(crc), uint32(compressedSize), uint32(size)]));
      offset += 16;
      central.push(
        concat([
          uint32(0x02014b50),
          uint16(0x0314),
          uint16(20),
          uint16(0x0808),
          uint16(8),
          uint16(0),
          uint16(0x0021),
          uint32(crc),
          uint32(compressedSize),
          uint32(size),
          uint16(name.byteLength),
          uint16(0),
          uint16(0),
          uint16(0),
          uint16(0),
          uint32((zipMode(entry) << 16) >>> 0),
          uint32(local),
          name,
        ]),
      );
    }
    const centralSize = central.reduce((total, record) => total + record.byteLength, 0);
    if (offset > zip32.bytes || centralSize > zip32.bytes) return yield* new FormatLimit({ format: "zip", limit: "archive-bytes", maximum: zip32.bytes });
    for (const record of central) yield* write(record);
    yield* write(concat([
      uint32(0x06054b50),
      uint16(0),
      uint16(0),
      uint16(entries.length),
      uint16(entries.length),
      uint32(centralSize),
      uint32(offset),
      uint16(0),
    ]));
  });

const writeAscii = (target: Uint8Array, offset: number, length: number, value: string): void => {
  const encoded = encoder.encode(value);
  if (encoded.byteLength > length) throw new RangeError(`tar field is too long: ${value}`);
  target.set(encoded, offset);
};

const octal = (value: number, width: number): string => {
  const encoded = Math.trunc(value).toString(8);
  if (encoded.length > width - 1) throw new RangeError(`tar numeric field is too large: ${value}`);
  return `${encoded.padStart(width - 1, "0")}\0`;
};

const tarPath = (path: string): { readonly name: string; readonly prefix: string } => {
  // USTAR has no charset declaration; non-ASCII names need the UTF-8 PAX path record.
  if (/\P{ASCII}/u.test(path)) throw new RangeError("non-ASCII tar paths require PAX");
  if (encoder.encode(path).byteLength <= 100) return { name: path, prefix: "" };
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (encoder.encode(prefix).byteLength <= 155 && encoder.encode(name).byteLength <= 100) return { name, prefix };
  }
  throw new RangeError(`path does not fit the portable ustar name fields: ${path}`);
};

const fitsUstar = (path: string): boolean => {
  try {
    tarPath(path);
    return true;
  } catch {
    return false;
  }
};

interface TarHeaderOptions {
  readonly path?: string;
  readonly linkTarget?: string;
  readonly type?: "0" | "2" | "5" | "x";
  readonly size?: number;
}

const tarHeader = (entry: Entry, options: TarHeaderOptions = {}): Uint8Array => {
  const output = new Uint8Array(512);
  const path = tarPath(options.path ?? entry.path);
  const size = options.size ?? (entry.kind === "file" ? entry.bytes : 0);
  const type = options.type ?? (entry.kind === "directory" ? "5" : entry.kind === "symlink" ? "2" : "0");
  writeAscii(output, 0, 100, path.name);
  writeAscii(output, 100, 8, octal(entry.mode, 8));
  writeAscii(output, 108, 8, octal(0, 8));
  writeAscii(output, 116, 8, octal(0, 8));
  writeAscii(output, 124, 12, octal(size, 12));
  writeAscii(output, 136, 12, octal(0, 12));
  output.fill(0x20, 148, 156);
  writeAscii(output, 156, 1, type);
  if (type === "2") writeAscii(output, 157, 100, options.linkTarget ?? entry.linkTarget ?? "");
  writeAscii(output, 257, 6, "ustar\0");
  writeAscii(output, 263, 2, "00");
  writeAscii(output, 345, 155, path.prefix);
  const checksum = output.reduce((total, byte) => total + byte, 0);
  writeAscii(output, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return output;
};

const paxRecord = (key: string, value: string): Uint8Array => {
  const body = encoder.encode(`${key}=${value}\n`);
  let length = body.byteLength + 2;
  while (true) {
    const next = String(length).length + 1 + body.byteLength;
    if (next === length) return concat([encoder.encode(`${length} `), body]);
    length = next;
  }
};

const padding = (size: number): Uint8Array => new Uint8Array((512 - (size % 512)) % 512);

/** ustar with PAX records for long or non-ASCII names; file payloads stream through untouched. */
export const encodeTar = (unsorted: readonly Entry[], write: Write): Effect.Effect<void, Artifact.ArtifactError | FormatLimit, Fs> =>
  Effect.gen(function*() {
    const limit = tarLimit(unsorted);
    if (limit !== undefined) return yield* limit;
    for (const [index, entry] of sortEntries(unsorted).entries()) {
      let headerPath = entry.path;
      let headerLink = entry.linkTarget;
      const records: Uint8Array[] = [];
      if (!fitsUstar(entry.path)) {
        records.push(paxRecord("path", entry.path));
        headerPath = `PaxEntries/${index.toString().padStart(12, "0")}`;
      }
      if (entry.kind === "symlink" && (linkBytes(entry).byteLength > 100 || /\P{ASCII}/u.test(entry.linkTarget ?? ""))) {
        records.push(paxRecord("linkpath", entry.linkTarget ?? ""));
        headerLink = paxLongSymlinkPlaceholder;
      }
      if (records.length > 0) {
        const pax = concat(records);
        const paxEntry: Entry = { path: `PaxHeaders/${index.toString().padStart(12, "0")}`, kind: "file", mode: 0o644, bytes: pax.byteLength, contents: Stream.empty };
        yield* write(concat([tarHeader(paxEntry, { type: "x", size: pax.byteLength }), pax, padding(pax.byteLength)]));
      }
      yield* write(tarHeader(entry, { path: headerPath, linkTarget: headerLink ?? "" }));
      if (entry.kind !== "file") continue;
      let total = 0;
      yield* entry.contents.pipe(Stream.runForEach((chunk) => {
        total += chunk.byteLength;
        return write(chunk);
      }));
      if (total !== entry.bytes) return yield* lengthMismatch(entry.path);
      if (total % 512 !== 0) yield* write(padding(total));
    }
    yield* write(new Uint8Array(1024));
  });

/** Fixed compression level and zero mtime keep gzip output reproducible for the same tar bytes. */
export const encodeTarGzip = (entries: readonly Entry[], write: Write): Effect.Effect<void, Artifact.ArtifactError | FormatLimit, Fs> =>
  Effect.gen(function*() {
    const pending: Uint8Array[] = [];
    const gzip = new Gzip({ level: 6, mtime: 0 }, (chunk) => {
      pending.push(chunk);
    });
    const flush = () => pending.length === 0 ? Effect.void : write(concat(pending.splice(0)));
    yield* encodeTar(entries, (chunk) => {
      for (let offset = 0; offset < chunk.byteLength; offset += chunkSize) gzip.push(chunk.subarray(offset, offset + chunkSize));
      return flush();
    });
    gzip.push(new Uint8Array(0), true);
    yield* flush();
  });

const decoder = new TextDecoder("utf-8", { fatal: true });

const beforeNul = (value: string): string => {
  const index = value.indexOf("\0");
  return index === -1 ? value : value.slice(0, index);
};

const field = (header: Uint8Array, offset: number, length: number): string =>
  beforeNul(decoder.decode(header.subarray(offset, offset + length)));

const parseOctal = (value: string): number => {
  const normalized = value.trim().replace(/^0+/, "");
  if (normalized === "") return 0;
  if (!/^[0-7]+$/.test(normalized)) throw new RangeError(`invalid tar octal field: ${value}`);
  return Number.parseInt(normalized, 8);
};

const parsePax = (contents: Uint8Array): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  let offset = 0;
  while (offset < contents.byteLength) {
    const space = contents.indexOf(0x20, offset);
    if (space === -1) throw new RangeError("invalid PAX record length");
    const encodedLength = decoder.decode(contents.subarray(offset, space));
    if (!/^[1-9][0-9]*$/.test(encodedLength)) throw new RangeError("invalid PAX record length");
    const length = Number.parseInt(encodedLength, 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > contents.byteLength) {
      throw new RangeError("invalid PAX record");
    }
    const end = offset + length;
    if (contents[end - 1] !== 0x0a) throw new RangeError("PAX record does not end in newline");
    const record = contents.subarray(space + 1, end - 1);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) throw new RangeError("PAX record lacks a key/value separator");
    result[decoder.decode(record.subarray(0, equals))] = decoder.decode(record.subarray(equals + 1));
    offset += length;
  }
  return result;
};

interface TarHeader {
  readonly rawPath: string;
  readonly size: number;
  readonly type: string;
  readonly mode: number;
  readonly linkField: string;
}

const parseHeader = (header: Uint8Array, offset: number): TarHeader => {
  const expected = parseOctal(field(header, 148, 8));
  const checksumHeader = header.slice();
  checksumHeader.fill(0x20, 148, 156);
  const actual = checksumHeader.reduce((total, byte) => total + byte, 0);
  if (expected !== actual) throw new RangeError(`invalid tar header checksum at byte ${offset}`);
  const prefix = field(header, 345, 155);
  const headerPath = field(header, 0, 100);
  return {
    rawPath: prefix === "" ? headerPath : `${prefix}/${headerPath}`,
    size: parseOctal(field(header, 124, 12)),
    type: field(header, 156, 1) || "0",
    mode: parseOctal(field(header, 100, 8)),
    linkField: field(header, 157, 100),
  };
};

/** A tar entry located by its header; `offset` is where its payload begins in the tar file. */
export interface TarEntry {
  readonly path: string;
  readonly kind: EntryKind;
  readonly mode: number;
  readonly bytes: number;
  readonly offset: number;
  readonly linkTarget?: string | undefined;
}

const malformed = (detail: unknown) =>
  new InputInvalid({ reason: `decode Git archive: ${detail instanceof Error ? detail.message : String(detail)}` });
/** PAX and long-name records are read into memory; `git archive` writes small ones. */
const metadataBytes = 16 * 1024 * 1024;

/** Walk the ustar/PAX headers written by `git archive --format=tar`, recording payload ranges instead of reading them. */
export const readGitTar = (path: string): Effect.Effect<readonly TarEntry[], InputInvalid | Artifact.ArtifactError, FileSystem.FileSystem> =>
  Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const unreadable = (error: unknown) => new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });
    const handle = yield* fs.open(path).pipe(Effect.mapError(unreadable));
    const size = Number((yield* handle.stat.pipe(Effect.mapError(unreadable))).size);
    const read = (at: number, length: number) =>
      Effect.gen(function*() {
        if (length > metadataBytes) return yield* malformed("metadata record exceeds 16 MiB");
        yield* handle.seek(at, "start");
        const buffer = new Uint8Array(length);
        let filled = 0;
        while (filled < length) {
          const count = Number(yield* handle.read(buffer.subarray(filled)).pipe(Effect.mapError(unreadable)));
          if (count === 0) return yield* malformed("truncated tar");
          filled += count;
        }
        return buffer;
      });
    const parse = <A>(parser: () => A) => Effect.try({ try: parser, catch: malformed });
    const entries: TarEntry[] = [];
    let offset = 0;
    let globalPax: Readonly<Record<string, string>> = {};
    let pax: Readonly<Record<string, string>> = {};
    let longPath: string | undefined;
    let longLink: string | undefined;
    while (offset + 512 <= size) {
      const header = yield* read(offset, 512);
      if (header.every((byte) => byte === 0)) break;
      const parsed = yield* parse(() => parseHeader(header, offset));
      const dataStart = offset + 512;
      if (dataStart + parsed.size > size) return yield* malformed(`truncated tar entry: ${parsed.rawPath}`);
      offset = dataStart + Math.ceil(parsed.size / 512) * 512;
      if (parsed.type === "g" || parsed.type === "x" || parsed.type === "L" || parsed.type === "K") {
        const data = yield* read(dataStart, parsed.size);
        if (parsed.type === "g") globalPax = { ...globalPax, ...yield* parse(() => parsePax(data)) };
        else if (parsed.type === "x") pax = yield* parse(() => parsePax(data));
        else if (parsed.type === "L") longPath = beforeNul(decoder.decode(data));
        else longLink = beforeNul(decoder.decode(data));
        continue;
      }
      const entryPath = pax.path ?? globalPax.path ?? longPath ?? parsed.rawPath;
      const linkTarget = pax.linkpath ?? globalPax.linkpath ?? longLink ?? parsed.linkField;
      pax = {};
      longPath = undefined;
      longLink = undefined;
      if (parsed.type === "0" || parsed.type === "\0") {
        entries.push({ path: entryPath, kind: "file", mode: (parsed.mode & 0o111) === 0 ? 0o644 : 0o755, bytes: parsed.size, offset: dataStart });
      } else if (parsed.type === "2") {
        entries.push({ path: entryPath, kind: "symlink", mode: 0o777, bytes: 0, offset: dataStart, linkTarget });
      } else if (parsed.type === "5") {
        entries.push({ path: entryPath.replace(/\/$/, ""), kind: "directory", mode: 0o755, bytes: 0, offset: dataStart });
      } else {
        return yield* malformed(`unsupported tar entry type ${JSON.stringify(parsed.type)} at ${entryPath}`);
      }
    }
    return entries;
  }));
