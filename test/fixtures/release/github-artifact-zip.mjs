import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

export const githubArtifactZip = (members) => {
  if (
    !Array.isArray(members)
    || members.length === 0
    || members.length > 0xffff
    || new Set(members.map(([name]) => name)).size !== members.length
  ) throw new Error("GitHub artifact ZIP fixture member set is invalid");
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [filename, bytes] of members) {
    const name = Buffer.from(filename);
    const payload = Buffer.from(bytes);
    if (
      filename.length === 0
      || filename.startsWith(".")
      || filename.includes("/")
      || filename.includes("\\")
      || filename.includes("\0")
      || name.byteLength > 0xffff
      || payload.byteLength === 0
      || payload.byteLength > 0xffffffff
    ) throw new Error("GitHub artifact ZIP fixture member is invalid");
    const checksum = crc32(payload);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(name.byteLength, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(checksum, 4);
    descriptor.writeUInt32LE(payload.byteLength, 8);
    descriptor.writeUInt32LE(payload.byteLength, 12);
    localParts.push(local, name, payload, descriptor);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x032d, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0008, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.byteLength, 20);
    central.writeUInt32LE(payload.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(0x81a40020, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.byteLength + name.byteLength + payload.byteLength + descriptor.byteLength;
  }
  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralBytes.byteLength, 12);
  end.writeUInt32LE(localBytes.byteLength, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
};

export const writeGithubArtifactZip = ({ directory, filenames, outputPath }) =>
  writeFileSync(
    outputPath,
    githubArtifactZip(filenames.map((filename) => [filename, readFileSync(resolve(directory, filename))])),
  );
