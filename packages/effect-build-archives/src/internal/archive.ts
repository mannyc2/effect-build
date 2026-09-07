export type EntryKind = "file" | "directory" | "symlink";

export interface Entry {
  readonly path: string;
  readonly kind: EntryKind;
  readonly mode: number;
  readonly contents: Uint8Array;
  readonly linkTarget?: string;
}

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

export const crc32 = (input: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of input) value = (value >>> 8) ^ (crcTable[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffffffff) >>> 0;
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

const zipContents = (entry: Entry): Uint8Array =>
  entry.kind === "symlink" ? encoder.encode(entry.linkTarget ?? "") : entry.contents;

export const encodeZip = (unsorted: readonly Entry[]): Uint8Array => {
  const entries = sortEntries(unsorted);
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(
      entry.kind === "directory" && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path,
    );
    const contents = zipContents(entry);
    if (name.byteLength > 0xffff) throw new RangeError(`ZIP entry name is too long: ${entry.path}`);
    if (contents.byteLength > 0xffffffff) throw new RangeError(`ZIP entry is larger than ZIP32 permits: ${entry.path}`);
    const digest = crc32(contents);
    const header = concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0x0021),
      uint32(digest),
      uint32(contents.byteLength),
      uint32(contents.byteLength),
      uint16(name.byteLength),
      uint16(0),
      name,
    ]);
    local.push(header, contents);
    central.push(
      concat([
        uint32(0x02014b50),
        uint16(0x0314),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0x0021),
        uint32(digest),
        uint32(contents.byteLength),
        uint32(contents.byteLength),
        uint16(name.byteLength),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32((zipMode(entry) << 16) >>> 0),
        uint32(offset),
        name,
      ]),
    );
    offset += header.byteLength + contents.byteLength;
  }
  if (entries.length > 0xffff) throw new RangeError("ZIP32 permits at most 65535 entries");
  const centralBytes = concat(central);
  if (offset > 0xffffffff || centralBytes.byteLength > 0xffffffff) {
    throw new RangeError("archive is larger than ZIP32 permits");
  }
  const end = concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralBytes.byteLength),
    uint32(offset),
    uint16(0),
  ]);
  return concat([...local, centralBytes, end]);
};

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
  if (encoder.encode(path).byteLength <= 100) return { name: path, prefix: "" };
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (encoder.encode(prefix).byteLength <= 155 && encoder.encode(name).byteLength <= 100) return { name, prefix };
  }
  throw new RangeError(`path does not fit the portable ustar name fields: ${path}`);
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
  const size = options.size ?? (entry.kind === "file" ? entry.contents.byteLength : 0);
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

const appendTarEntry = (
  chunks: Uint8Array[],
  header: Uint8Array,
  contents: Uint8Array,
): void => {
  chunks.push(header);
  if (contents.byteLength === 0) return;
  chunks.push(contents);
  const padding = (512 - (contents.byteLength % 512)) % 512;
  if (padding > 0) chunks.push(new Uint8Array(padding));
};

export const encodeTar = (unsorted: readonly Entry[]): Uint8Array => {
  const chunks: Uint8Array[] = [];
  for (const [index, entry] of sortEntries(unsorted).entries()) {
    const contents = entry.kind === "file" ? entry.contents : new Uint8Array();
    let headerPath = entry.path;
    let headerLink = entry.linkTarget;
    const records: Uint8Array[] = [];
    try {
      tarPath(entry.path);
    } catch {
      records.push(paxRecord("path", entry.path));
      headerPath = `PaxEntries/${index.toString().padStart(12, "0")}`;
    }
    if (entry.kind === "symlink" && encoder.encode(entry.linkTarget ?? "").byteLength > 100) {
      records.push(paxRecord("linkpath", entry.linkTarget ?? ""));
      headerLink = paxLongSymlinkPlaceholder;
    }
    if (records.length > 0) {
      const pax = concat(records);
      const paxEntry: Entry = {
        path: `PaxHeaders/${index.toString().padStart(12, "0")}`,
        kind: "file",
        mode: 0o644,
        contents: pax,
      };
      appendTarEntry(chunks, tarHeader(paxEntry, { type: "x", size: pax.byteLength }), pax);
    }
    appendTarEntry(chunks, tarHeader(entry, { path: headerPath, linkTarget: headerLink ?? "" }), contents);
  }
  chunks.push(new Uint8Array(1024));
  return concat(chunks);
};

const deflateStored = (input: Uint8Array): Uint8Array => {
  const chunks: Uint8Array[] = [];
  if (input.byteLength === 0) return bytes(1, 0, 0, 0xff, 0xff);
  for (let offset = 0; offset < input.byteLength;) {
    const length = Math.min(0xffff, input.byteLength - offset);
    const final = offset + length === input.byteLength;
    chunks.push(
      bytes(final ? 1 : 0, length, length >>> 8, (~length) & 0xff, ((~length) >>> 8) & 0xff),
      input.subarray(offset, offset + length),
    );
    offset += length;
  }
  return concat(chunks);
};

export const encodeTarGzip = (entries: readonly Entry[]): Uint8Array => {
  const tar = encodeTar(entries);
  return concat([
    bytes(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff),
    deflateStored(tar),
    uint32(crc32(tar)),
    uint32(tar.byteLength),
  ]);
};

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
    const key = decoder.decode(record.subarray(0, equals));
    const value = decoder.decode(record.subarray(equals + 1));
    result[key] = value;
    offset += length;
  }
  return result;
};

/** Strictly decodes the ustar/PAX subset emitted by `git archive --format=tar`. */
export const decodeGitTar = (input: Uint8Array): readonly Entry[] => {
  const entries: Entry[] = [];
  let offset = 0;
  let globalPax: Readonly<Record<string, string>> = {};
  let pax: Readonly<Record<string, string>> = {};
  let longPath: string | undefined;
  let longLink: string | undefined;
  while (offset + 512 <= input.byteLength) {
    const header = input.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const expected = parseOctal(field(header, 148, 8));
    const checksumHeader = header.slice();
    checksumHeader.fill(0x20, 148, 156);
    const actual = checksumHeader.reduce((total, byte) => total + byte, 0);
    if (expected !== actual) throw new RangeError(`invalid tar header checksum at byte ${offset}`);
    const prefix = field(header, 345, 155);
    const headerPath = field(header, 0, 100);
    const rawPath = prefix === "" ? headerPath : `${prefix}/${headerPath}`;
    const size = parseOctal(field(header, 124, 12));
    const type = field(header, 156, 1) || "0";
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > input.byteLength) throw new RangeError(`truncated tar entry: ${rawPath}`);
    const contents = input.slice(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (type === "g") {
      globalPax = { ...globalPax, ...parsePax(contents) };
      continue;
    }
    if (type === "x") {
      pax = parsePax(contents);
      continue;
    }
    if (type === "L") {
      longPath = beforeNul(decoder.decode(contents));
      continue;
    }
    if (type === "K") {
      longLink = beforeNul(decoder.decode(contents));
      continue;
    }
    const path = pax.path ?? globalPax.path ?? longPath ?? rawPath;
    const linkTarget = pax.linkpath ?? globalPax.linkpath ?? longLink ?? field(header, 157, 100);
    const rawMode = parseOctal(field(header, 100, 8));
    pax = {};
    longPath = undefined;
    longLink = undefined;
    if (type === "0" || type === "\0") {
      entries.push({ path, kind: "file", mode: (rawMode & 0o111) === 0 ? 0o644 : 0o755, contents });
    } else if (type === "2") {
      entries.push({ path, kind: "symlink", mode: 0o777, contents: new Uint8Array(), linkTarget });
    } else if (type === "5") {
      entries.push({ path: path.replace(/\/$/, ""), kind: "directory", mode: 0o755, contents: new Uint8Array() });
    } else {
      throw new RangeError(`unsupported tar entry type ${JSON.stringify(type)} at ${path}`);
    }
  }
  return entries;
};
