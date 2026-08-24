import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalBytes,
  capability,
  contract,
  coordinate,
  decodeCanonical,
  readArtifactZip,
  requireEntries,
} from "./common.mjs";

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (records) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of records) {
    const filename = Buffer.from(name);
    const contents = Buffer.from(value);
    const crc = crc32(contents);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    locals.push(local, contents);
    const directory = Buffer.alloc(46 + filename.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE((3 << 8) | 20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(contents.length, 20);
    directory.writeUInt32LE(contents.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    filename.copy(directory, 46);
    central.push(directory);
    offset += local.length + contents.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
};

test("canonical controls reject unknown fields, numbers, and noncanonical bytes", () => {
  const fields = ["protocol", "value"];
  const value = { protocol: "example@1", value: "1" };
  assert.deepEqual(decodeCanonical(canonicalBytes(value), fields), value);
  assert.throws(() => canonicalBytes({ value: 1 }), /forbids numbers/u);
  assert.throws(() => decodeCanonical(canonicalBytes({ ...value, extra: "x" }), fields), /field mismatch/u);
  assert.throws(() => decodeCanonical(Buffer.from('{"value":"1","protocol":"example@1"}\n'), fields), /canonically/u);
});

test("artifact ZIP validation admits only exact regular top-level entries", () => {
  const entries = readArtifactZip(zip([["payload.bin", "payload"], ["offer.json", "{}\n"]]));
  requireEntries(entries, ["offer.json", "payload.bin"]);
  assert.equal(entries.get("payload.bin").toString(), "payload");
  assert.throws(() => readArtifactZip(zip([["nested/payload.bin", "payload"]])), /unsafe/u);
  assert.throws(() => requireEntries(entries, ["payload.bin"]), /layout mismatch/u);
  const corrupt = zip([["payload.bin", "payload"]]);
  corrupt[30 + Buffer.byteLength("payload.bin")] ^= 1;
  assert.throws(() => readArtifactZip(corrupt), /CRC mismatch/u);
});

test("the private finalizer names all 108 frozen coordinates without collision", () => {
  assert.equal(capability.publicExport, "none-in-v0.5");
  const axes = contract.requiredCompatibilityEvidencePoints.coordinateRules.nodeMainExecutable.axes;
  const names = axes.producerGroup.flatMap((producerGroup) =>
    axes.mainFormat.flatMap((format) =>
      axes.constructionHost.flatMap((constructionHost) =>
        axes.target.map((target) => coordinate({ producerGroup, format, constructionHost, target }))
      )
    )
  );
  assert.equal(names.length, 108);
  assert.equal(new Set(names).size, 108);
});
