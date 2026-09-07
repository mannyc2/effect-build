export interface Entry {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly mode: number;
}

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
const crc32 = (input: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of input) value = (value >>> 8) ^ (crcTable[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffffffff) >>> 0;
};

export const utf8Order = (left: string, right: string): number => {
  const a = encoder.encode(left), b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.byteLength, b.byteLength); index++) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

/** Copied from archives: stored ZIP entries keep wheel bytes independent of compression libraries. */
export const encodeZip = (unsorted: readonly Entry[]): Uint8Array => {
  const entries = [...unsorted].sort((a, b) => utf8Order(a.path, b.path));
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path), contents = entry.contents;
    if (name.byteLength > 0xffff || contents.byteLength > 0xffffffff) throw new RangeError(`ZIP32 limit exceeded: ${entry.path}`);
    const digest = crc32(contents);
    const header = concat([
      uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0x0021),
      uint32(digest), uint32(contents.byteLength), uint32(contents.byteLength), uint16(name.byteLength), uint16(0), name,
    ]);
    local.push(header, contents);
    central.push(concat([
      uint32(0x02014b50), uint16(0x0314), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0x0021),
      uint32(digest), uint32(contents.byteLength), uint32(contents.byteLength), uint16(name.byteLength),
      uint16(0), uint16(0), uint16(0), uint16(0), uint32(((0o100000 | entry.mode) << 16) >>> 0), uint32(offset), name,
    ]));
    offset += header.byteLength + contents.byteLength;
  }
  const directory = concat(central);
  if (entries.length > 0xffff || offset > 0xffffffff || directory.byteLength > 0xffffffff) throw new RangeError("ZIP32 archive limit exceeded");
  return concat([...local, directory, concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(directory.byteLength), uint32(offset), uint16(0),
  ])]);
};
