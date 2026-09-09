/** Structurally complete native images for inspection/packaging; they do not contain runnable programs. */
export const elf = (interpreter?: string, machine = 62): Uint8Array => {
  const encoded = interpreter === undefined ? undefined : new TextEncoder().encode(`${interpreter}\0`);
  const count = encoded === undefined ? 1 : 2, payload = 64 + count * 56;
  const bytes = new Uint8Array(payload + (encoded?.byteLength ?? 1));
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  const view = new DataView(bytes.buffer);
  view.setUint16(16, 2, true);
  view.setUint16(18, machine, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(52, 64, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, count, true);
  view.setUint32(64, 1, true);
  view.setBigUint64(96, BigInt(bytes.length), true);
  view.setBigUint64(104, BigInt(bytes.length), true);
  if (encoded !== undefined) {
    view.setUint32(120, 3, true);
    view.setBigUint64(128, BigInt(payload), true);
    view.setBigUint64(152, BigInt(encoded.length), true);
    bytes.set(encoded, payload);
  }
  return bytes;
};

export const thinMacho = (cpu = 0x0100000c): Uint8Array => {
  const bytes = new Uint8Array(105);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, cpu, true);
  view.setUint32(12, 2, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 72, true);
  view.setUint32(32, 0x19, true);
  view.setUint32(36, 72, true);
  view.setBigUint64(64, BigInt(bytes.length), true);
  view.setBigUint64(80, BigInt(bytes.length), true);
  return bytes;
};

export const fatMacho = (cpus: readonly number[]): Uint8Array => {
  const start = 8 + cpus.length * 20, sliceSize = thinMacho().length;
  const bytes = new Uint8Array(start + cpus.length * sliceSize);
  bytes.set([0xca, 0xfe, 0xba, 0xbe]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, cpus.length, false);
  cpus.forEach((cpu, i) => {
    const entry = 8 + i * 20, offset = start + i * sliceSize;
    view.setUint32(entry, cpu, false);
    view.setUint32(entry + 8, offset, false);
    view.setUint32(entry + 12, sliceSize, false);
    bytes.set(thinMacho(cpu), offset);
  });
  return bytes;
};

export const pe = (machine = 0x8664): Uint8Array => {
  const bytes = new Uint8Array(512 + 512), optional = 88, section = optional + 112;
  bytes.set([0x4d, 0x5a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(60, 64, true);
  bytes.set([0x50, 0x45], 64);
  view.setUint16(68, machine, true);
  view.setUint16(70, 1, true);
  view.setUint16(84, 112, true);
  view.setUint16(86, 2, true);
  view.setUint16(optional, 0x20b, true);
  view.setUint32(optional + 56, 8192, true);
  view.setUint32(optional + 60, 512, true);
  view.setUint32(section + 16, 512, true);
  view.setUint32(section + 20, 512, true);
  return bytes;
};
