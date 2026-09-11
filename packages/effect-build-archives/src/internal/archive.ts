import { Option, Stream } from "effect";
import { Deflate, Gzip } from "fflate/browser";
import { EntrySizeMismatch } from "../EntrySizeMismatch.js";
import { FormatLimit } from "../FormatLimit.js";

export type EntryKind = "file" | "directory" | "symlink";
/** Inputs stay on disk: `contents` streams exactly `bytes` bytes when the encoder reaches the entry. */
export interface FileEntry<E = never, R = never> {
  readonly kind: "file";
  readonly path: string;
  readonly mode: number;
  readonly bytes: number;
  readonly contents: Stream.Stream<Uint8Array, E, R>;
}
export interface DirectoryEntry {
  readonly kind: "directory";
  readonly path: string;
  readonly mode: number;
}
export interface SymlinkEntry {
  readonly kind: "symlink";
  readonly path: string;
  readonly mode: number;
  readonly target: string;
}
export type Entry<E = never, R = never> = FileEntry<E, R> | DirectoryEntry | SymlinkEntry;
type AnyEntry = Entry<unknown, unknown>;
type Bytes<E, R> = Stream.Stream<Uint8Array, E, R>;
export type EncodeError = FormatLimit | EntrySizeMismatch;

/** Payloads are compressed in pieces of this size, so output depends only on the input bytes. */
export const chunkSize = 64 * 1024;
/** ZIP32 field widths; ZIP64 records are never written. */
export const zip32 = { entries: 0xffff, bytes: 0xffffffff, nameBytes: 0xffff } as const;
/** The ustar size field holds eleven octal digits; PAX size records are not written. */
export const ustar = { bytes: 0o77777777777 } as const;

const encoder = new TextEncoder();

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

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

/** Entries ordered by the UTF-8 bytes of their paths, each path encoded once. */
export const sortEntries = <A extends { readonly path: string }>(entries: readonly A[]): readonly A[] =>
  entries
    .map((entry) => ({ entry, key: encoder.encode(entry.path) }))
    .sort((a, b) => compareBytes(a.key, b.key))
    .map(({ entry }) => entry);

/** A stream that delivered a different byte count than its record cannot be encoded consistently. */
const sized = (expected: number, path: string) => <E, R>(input: Bytes<E, R>): Bytes<E | EntrySizeMismatch, R> =>
  Stream.suspend((): Bytes<E | EntrySizeMismatch, R> => {
    let actual = 0;
    return input.pipe(
      Stream.map((chunk) => {
        actual += chunk.byteLength;
        return chunk;
      }),
      Stream.concat(
        Stream.suspend((): Bytes<EntrySizeMismatch, never> =>
          actual === expected ? Stream.empty : Stream.fail(new EntrySizeMismatch({ path, expected, actual }))
        ),
      ),
    );
  });

/** Bytes held back until a full piece is available; one per run, so it is mutated in place. */
interface Buffered {
  readonly pieces: Uint8Array[];
  length: number;
}

/** Re-cut a byte stream into `chunkSize` pieces (the last one shorter), so what follows sees the same boundaries for the same bytes. */
const rechunk = <E, R>(input: Bytes<E, R>): Bytes<E, R> =>
  input.pipe(Stream.mapAccum(
    (): Buffered => ({ pieces: [], length: 0 }),
    (state, chunk) => {
      state.pieces.push(chunk);
      state.length += chunk.byteLength;
      if (state.length < chunkSize) return [state, []] as const;
      const joined = concat(state.pieces.splice(0));
      const pieces: Uint8Array[] = [];
      let offset = 0;
      for (; offset + chunkSize <= joined.byteLength; offset += chunkSize) {
        pieces.push(joined.subarray(offset, offset + chunkSize));
      }
      const rest = joined.subarray(offset);
      if (rest.byteLength > 0) state.pieces.push(rest);
      state.length = rest.byteLength;
      return [state, pieces] as const;
    },
    { onHalt: (state) => state.length === 0 ? [] : [concat(state.pieces)] },
  ));

interface Codec {
  push(chunk: Uint8Array, final?: boolean): void;
}
interface Compressing {
  readonly codec: Codec;
  readonly pending: Uint8Array[];
}
const drain = (pending: Uint8Array[]): Uint8Array[] => pending.length === 0 ? [] : [concat(pending.splice(0))];

/** Push `chunkSize` pieces through a codec created for each run, so the stream is safe to run more than once. */
const compress = (make: (ondata: (chunk: Uint8Array) => void) => Codec) => <E, R>(input: Bytes<E, R>): Bytes<E, R> =>
  rechunk(input).pipe(Stream.mapAccum(
    (): Compressing => {
      const pending: Uint8Array[] = [];
      return {
        codec: make((chunk) => {
          pending.push(chunk);
        }),
        pending,
      };
    },
    (state, chunk) => {
      state.codec.push(chunk);
      return [state, drain(state.pending)] as const;
    },
    {
      onHalt: (state) => {
        state.codec.push(new Uint8Array(0), true);
        return drain(state.pending);
      },
    },
  ));

const deflate = compress((ondata) => new Deflate({ level: 6 }, ondata));
/** Fixed compression level and zero mtime keep gzip output reproducible for the same input bytes. */
const gzip = compress((ondata) => new Gzip({ level: 6, mtime: 0 }, ondata));

// ZIP

/** Local file header, central directory record, data descriptor, and end of central directory. */
const zipSignature = { local: 0x04034b50, central: 0x02014b50, descriptor: 0x08074b50, end: 0x06054b50 } as const;
/** Spec 2.0 introduced DEFLATE and data descriptors. */
const zipVersion = 20;
/** Made by a Unix host (3) at spec 2.0, so external attributes carry a POSIX mode. */
const zipMadeBy = (3 << 8) | zipVersion;
/** Bit 3: CRC and sizes follow the data in a descriptor. Bit 11: names are UTF-8. */
const zipFlags = (1 << 3) | (1 << 11);
const deflateMethod = 8;
/** MS-DOS time 00:00:00 and date 1980-01-01, the earliest timestamp the format can hold. */
const dosTime = 0;
const dosDate = (1 << 5) | 1;
const descriptorBytes = 16;

interface Sizes {
  readonly crc: number;
  readonly size: number;
  readonly compressedSize: number;
}
/** The local header carries zeros; the descriptor and central record carry the real values. */
const unknownSizes: Sizes = { crc: 0, size: 0, compressedSize: 0 };

/** The field run both headers share: flags, method, timestamp, sizes, name length, and an empty extra field. */
const zipFields = (name: Uint8Array, sizes: Sizes): Uint8Array =>
  concat([
    uint16(zipFlags),
    uint16(deflateMethod),
    uint16(dosTime),
    uint16(dosDate),
    uint32(sizes.crc),
    uint32(sizes.compressedSize),
    uint32(sizes.size),
    uint16(name.byteLength),
    uint16(0),
  ]);

const localHeader = (name: Uint8Array): Uint8Array =>
  concat([uint32(zipSignature.local), uint16(zipVersion), zipFields(name, unknownSizes), name]);

const centralRecord = (name: Uint8Array, sizes: Sizes, mode: number, localOffset: number): Uint8Array =>
  concat([
    uint32(zipSignature.central),
    uint16(zipMadeBy),
    uint16(zipVersion),
    zipFields(name, sizes),
    uint16(0), // comment length
    uint16(0), // disk number
    uint16(0), // internal attributes
    uint32((mode << 16) >>> 0),
    uint32(localOffset),
    name,
  ]);

const dataDescriptor = (sizes: Sizes): Uint8Array =>
  concat([uint32(zipSignature.descriptor), uint32(sizes.crc), uint32(sizes.compressedSize), uint32(sizes.size)]);

const endOfCentralDirectory = (count: number, centralSize: number, centralOffset: number): Uint8Array =>
  concat([
    uint32(zipSignature.end),
    uint16(0),
    uint16(0),
    uint16(count),
    uint16(count),
    uint32(centralSize),
    uint32(centralOffset),
    uint16(0),
  ]);

const zipMode = (entry: AnyEntry): number => {
  switch (entry.kind) {
    case "directory":
      return 0o040000 | entry.mode;
    case "symlink":
      return 0o120000 | entry.mode;
    case "file":
      return 0o100000 | entry.mode;
  }
};

const zipName = (entry: AnyEntry): string =>
  entry.kind === "directory" && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path;

/** A symlink's ZIP payload is its target; a directory has none. */
const zipPayload = <E, R>(entry: Entry<E, R>): { readonly bytes: number; readonly contents: Bytes<E, R> } => {
  switch (entry.kind) {
    case "file":
      return { bytes: entry.bytes, contents: entry.contents };
    case "symlink": {
      const target = encoder.encode(entry.target);
      return { bytes: target.byteLength, contents: Stream.make(target) };
    }
    case "directory":
      return { bytes: 0, contents: Stream.empty };
  }
};

/** Format limits knowable before any payload is read; sizes learned while compressing are checked as they appear. */
export const zipLimit = (entries: readonly AnyEntry[]): FormatLimit | undefined => {
  if (entries.length > zip32.entries) {
    return new FormatLimit({ format: "zip", limit: "entries", maximum: zip32.entries });
  }
  for (const entry of entries) {
    if (encoder.encode(zipName(entry)).byteLength > zip32.nameBytes) {
      return new FormatLimit({ format: "zip", limit: "name-bytes", maximum: zip32.nameBytes, path: entry.path });
    }
    if (zipPayload(entry).bytes > zip32.bytes) {
      return new FormatLimit({ format: "zip", limit: "entry-bytes", maximum: zip32.bytes, path: entry.path });
    }
  }
  return undefined;
};

export const tarLimit = (entries: readonly AnyEntry[]): FormatLimit | undefined => {
  const oversized = entries.find((entry) => entry.kind === "file" && entry.bytes > ustar.bytes);
  return oversized === undefined
    ? undefined
    : new FormatLimit({ format: "tar", limit: "entry-bytes", maximum: ustar.bytes, path: oversized.path });
};

interface ZipState {
  offset: number;
  readonly central: Uint8Array[];
}

/** Header, measured and deflated payload, then the descriptor; the central record is kept for the end. */
const zipEntry = <E, R>(entry: Entry<E, R>, archive: ZipState): Bytes<E | EncodeError, R> =>
  Stream.suspend((): Bytes<E | EncodeError, R> => {
    const name = encoder.encode(zipName(entry));
    const localOffset = archive.offset;
    const header = localHeader(name);
    const payload = zipPayload(entry);
    let crc = 0xffffffff, compressedSize = 0;
    const data = payload.contents.pipe(
      sized(payload.bytes, entry.path),
      Stream.map((chunk) => {
        crc = crc32(crc, chunk);
        return chunk;
      }),
      deflate,
      Stream.map((chunk) => {
        compressedSize += chunk.byteLength;
        return chunk;
      }),
    );
    const trailer = Stream.suspend((): Bytes<FormatLimit, never> => {
      // Layout is local header, compressed bytes, descriptor; only the completed entry advances the archive.
      // The next local offset and the central directory offset are uint32 fields, so the entry's end must fit.
      const end = localOffset + header.byteLength + compressedSize + descriptorBytes;
      if (compressedSize > zip32.bytes) {
        return Stream.fail(
          new FormatLimit({ format: "zip", limit: "entry-bytes", maximum: zip32.bytes, path: entry.path }),
        );
      }
      if (end > zip32.bytes) {
        return Stream.fail(
          new FormatLimit({ format: "zip", limit: "archive-bytes", maximum: zip32.bytes, path: entry.path }),
        );
      }
      const sizes: Sizes = { crc: (crc ^ 0xffffffff) >>> 0, size: payload.bytes, compressedSize };
      archive.offset = end;
      archive.central.push(centralRecord(name, sizes, zipMode(entry), localOffset));
      return Stream.make(dataDescriptor(sizes));
    });
    return Stream.make(header).pipe(Stream.concat(data), Stream.concat(trailer));
  });

/**
 * ZIP32 with fixed DEFLATE level and zero timestamps. Each entry's CRC and sizes follow its
 * data in a descriptor (flag bit 3), so no payload is buffered to fill in its header.
 */
export const encodeZip = <E, R>(unsorted: ReadonlyArray<Entry<E, R>>): Bytes<E | EncodeError, R> =>
  Stream.suspend((): Bytes<E | EncodeError, R> => {
    const limit = zipLimit(unsorted);
    if (limit !== undefined) return Stream.fail(limit);
    const entries = sortEntries(unsorted);
    const archive: ZipState = { offset: 0, central: [] };
    return Stream.fromIterable(entries).pipe(
      // Sequential by default, which the offsets need.
      Stream.flatMap((entry) => zipEntry(entry, archive)),
      Stream.concat(Stream.suspend((): Bytes<FormatLimit, never> => {
        const centralSize = archive.central.reduce((total, record) => total + record.byteLength, 0);
        if (archive.offset > zip32.bytes || centralSize > zip32.bytes) {
          return Stream.fail(new FormatLimit({ format: "zip", limit: "archive-bytes", maximum: zip32.bytes }));
        }
        return Stream.fromIterable([
          ...archive.central,
          endOfCentralDirectory(entries.length, centralSize, archive.offset),
        ]);
      })),
    );
  });

// tar

const paxLongSymlinkPlaceholder = "././@LongSymLink";

/** Fields are sized by the pre-flight checks and placeholders, so overflow here is a defect, not a failure. */
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

interface UstarName {
  readonly name: string;
  readonly prefix: string;
}

/** ustar has no charset declaration and 100 + 155 byte name fields; anything else needs a PAX path record. */
const ustarName = (path: string): Option.Option<UstarName> => {
  if (/\P{ASCII}/u.test(path)) return Option.none();
  if (path.length <= 100) return Option.some({ name: path, prefix: "" });
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (prefix.length <= 155 && name.length <= 100) return Option.some({ name, prefix });
  }
  return Option.none();
};

const paxPlaceholder = (kind: "PaxHeaders" | "PaxEntries", index: number): UstarName => ({
  name: `${kind}/${index.toString().padStart(12, "0")}`,
  prefix: "",
});

interface TarFields {
  readonly name: UstarName;
  readonly mode: number;
  readonly size: number;
  readonly type: "0" | "2" | "5" | "x";
  readonly link: string;
}

/** POSIX ustar header fields: byte offset and width within one 512-byte record; the git tar reader uses the same table. */
export const tarField = {
  name: [0, 100],
  mode: [100, 8],
  uid: [108, 8],
  gid: [116, 8],
  size: [124, 12],
  mtime: [136, 12],
  checksum: [148, 8],
  type: [156, 1],
  link: [157, 100],
  magic: [257, 6],
  version: [263, 2],
  prefix: [345, 155],
} as const;

const tarHeader = (fields: TarFields): Uint8Array => {
  const output = new Uint8Array(512);
  writeAscii(output, ...tarField.name, fields.name.name);
  writeAscii(output, ...tarField.mode, octal(fields.mode, tarField.mode[1]));
  writeAscii(output, ...tarField.uid, octal(0, tarField.uid[1]));
  writeAscii(output, ...tarField.gid, octal(0, tarField.gid[1]));
  writeAscii(output, ...tarField.size, octal(fields.size, tarField.size[1]));
  writeAscii(output, ...tarField.mtime, octal(0, tarField.mtime[1]));
  writeAscii(output, ...tarField.checksum, " ".repeat(tarField.checksum[1]));
  writeAscii(output, ...tarField.type, fields.type);
  writeAscii(output, ...tarField.link, fields.link);
  writeAscii(output, ...tarField.magic, "ustar\0");
  writeAscii(output, ...tarField.version, "00");
  writeAscii(output, ...tarField.prefix, fields.name.prefix);
  const checksum = output.reduce((total, byte) => total + byte, 0);
  writeAscii(output, ...tarField.checksum, `${checksum.toString(8).padStart(tarField.checksum[1] - 2, "0")}\0 `);
  return output;
};

const paxRecord = (key: string, value: string): Uint8Array => {
  const body = encoder.encode(`${key}=${value}\n`);
  // The length field counts its own decimal digits and the separating space; iterate to the fixed point.
  let length = body.byteLength + 2;
  while (true) {
    const next = String(length).length + 1 + body.byteLength;
    if (next === length) return concat([encoder.encode(`${length} `), body]);
    length = next;
  }
};

const padding = (size: number): Uint8Array => new Uint8Array((512 - (size % 512)) % 512);

/** PAX records for what ustar cannot name, the header, then a file's measured payload and padding. */
const tarEntry = <E, R>(entry: Entry<E, R>, index: number): Bytes<E | EntrySizeMismatch, R> =>
  Stream.suspend((): Bytes<E | EntrySizeMismatch, R> => {
    const records: Uint8Array[] = [];
    const name = Option.match(ustarName(entry.path), {
      onSome: (name) => name,
      onNone: () => {
        records.push(paxRecord("path", entry.path));
        return paxPlaceholder("PaxEntries", index);
      },
    });
    let link = "";
    if (entry.kind === "symlink") {
      const fits = encoder.encode(entry.target).byteLength <= 100 && !/\P{ASCII}/u.test(entry.target);
      if (!fits) records.push(paxRecord("linkpath", entry.target));
      link = fits ? entry.target : paxLongSymlinkPlaceholder;
    }
    const blocks: Uint8Array[] = [];
    if (records.length > 0) {
      const pax = concat(records);
      blocks.push(
        tarHeader({
          name: paxPlaceholder("PaxHeaders", index),
          mode: 0o644,
          size: pax.byteLength,
          type: "x",
          link: "",
        }),
        pax,
        padding(pax.byteLength),
      );
    }
    const size = entry.kind === "file" ? entry.bytes : 0;
    const type = entry.kind === "directory" ? "5" : entry.kind === "symlink" ? "2" : "0";
    blocks.push(tarHeader({ name, mode: entry.mode, size, type, link }));
    const header = Stream.make(concat(blocks));
    if (entry.kind !== "file") return header;
    return header.pipe(
      Stream.concat(entry.contents.pipe(sized(entry.bytes, entry.path))),
      Stream.concat(entry.bytes % 512 === 0 ? Stream.empty : Stream.make(padding(entry.bytes))),
    );
  });

/** ustar with PAX records for long or non-ASCII names; file payloads pass through untouched. */
export const encodeTar = <E, R>(unsorted: ReadonlyArray<Entry<E, R>>): Bytes<E | EncodeError, R> =>
  Stream.suspend((): Bytes<E | EncodeError, R> => {
    const limit = tarLimit(unsorted);
    if (limit !== undefined) return Stream.fail(limit);
    return Stream.fromIterable(sortEntries(unsorted).entries()).pipe(
      Stream.flatMap(([index, entry]) => tarEntry(entry, index)),
      Stream.concat(Stream.make(new Uint8Array(1024))),
    );
  });

export const encodeTarGzip = <E, R>(entries: ReadonlyArray<Entry<E, R>>): Bytes<E | EncodeError, R> =>
  encodeTar(entries).pipe(gzip);
