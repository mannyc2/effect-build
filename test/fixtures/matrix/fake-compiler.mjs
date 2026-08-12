import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  const value = process.argv[index + 1];
  if (flag === undefined || value === undefined || !flag.startsWith("--") || values.has(flag)) {
    throw new Error("invalid matrix fixture arguments");
  }
  values.set(flag, value);
}

const required = (flag) => {
  const value = values.get(flag);
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
};

const outfile = required("--outfile");
const target = required("--target");
const events = required("--events");
const mode = values.get("--mode") ?? "success";
const delay = Number(values.get("--delay") ?? "0");
const sentinels = values.get("--sentinels");
const marker = values.get("--marker");
if (!Number.isSafeInteger(delay) || delay < 0) throw new Error("--delay must be a non-negative safe integer");
if (!["success", "fail", "hang", "missing", "invalid"].includes(mode)) throw new Error(`unknown mode: ${mode}`);

const record = (event) => appendFileSync(events, `${JSON.stringify({ event, target, pid: process.pid, marker })}\n`);
record("start");
if (sentinels !== undefined) {
  mkdirSync(sentinels, { recursive: true });
  writeFileSync(join(sentinels, `${target}.pid`), String(process.pid));
}

let stopping = false;
const stop = (signal) => {
  if (stopping) return;
  record(signal);
  if (mode === "hang") return;
  stopping = true;
  process.exit(0);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

const u16 = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8 & 0xff;
};
const u32 = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8 & 0xff;
  bytes[offset + 2] = value >>> 16 & 0xff;
  bytes[offset + 3] = value >>> 24 & 0xff;
};
const u64 = (bytes, offset, value) => {
  u32(bytes, offset, value);
  u32(bytes, offset + 4, 0);
};

const nativeBytes = () => {
  if (target.startsWith("macos-")) {
    const bytes = new Uint8Array(64);
    bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
    u32(bytes, 4, target === "macos-x64" ? 0x01000007 : 0x0100000c);
    return bytes;
  }
  if (target.startsWith("windows-")) {
    const bytes = new Uint8Array(72);
    bytes.set([0x4d, 0x5a], 0);
    u32(bytes, 60, 64);
    bytes.set([0x50, 0x45, 0x00, 0x00], 64);
    u16(bytes, 68, target === "windows-x64" ? 0x8664 : 0xaa64);
    return bytes;
  }
  if (target.startsWith("linux-")) {
    const interpreter = new TextEncoder().encode(
      target.endsWith("-musl")
        ? target.includes("-x64-") ? "/lib/ld-musl-x86_64.so.1\0" : "/lib/ld-musl-aarch64.so.1\0"
        : target.includes("-x64-") ? "/lib64/ld-linux-x86-64.so.2\0" : "/lib/ld-linux-aarch64.so.1\0",
    );
    const interpreterOffset = 120;
    const bytes = new Uint8Array(interpreterOffset + interpreter.byteLength);
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
    u16(bytes, 18, target.includes("-x64-") ? 62 : 183);
    u64(bytes, 32, 64);
    u16(bytes, 54, 56);
    u16(bytes, 56, 1);
    u32(bytes, 64, 3);
    u64(bytes, 72, interpreterOffset);
    u64(bytes, 96, interpreter.byteLength);
    bytes.set(interpreter, interpreterOffset);
    return bytes;
  }
  throw new Error(`unknown target: ${target}`);
};

const complete = () => {
  if (mode === "hang") {
    setInterval(() => {}, 1_000);
    return;
  }
  if (mode === "fail") {
    record("fail");
    process.stderr.write(`compile failed: ${target}`);
    process.exit(7);
  }
  if (mode === "missing") {
    record("missing");
    process.exit(0);
  }
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, mode === "invalid" ? new Uint8Array([1, 2, 3, 4]) : nativeBytes());
  if (!target.startsWith("windows-")) chmodSync(outfile, 0o755);
  record(mode === "invalid" ? "invalid" : "finish");
};

if (delay === 0) complete();
else setTimeout(complete, delay);
