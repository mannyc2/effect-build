#!/usr/bin/env node
import { appendFile, chmod, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);

if (argv[0] === "--version") {
  const version = process.env.FAKE_DENO_VERSION ?? "2.9.3";
  process.stdout.write(`deno ${version} (stable, release, x86_64-unknown-linux-gnu)\nv8 13.0\ntypescript 5.8\n`);
  process.exit(0);
}

const log = process.env.FAKE_DENO_LOG;
if (log !== undefined) {
  await appendFile(log, JSON.stringify({
    argv,
    cwd: process.cwd(),
    marker: process.env.FAKE_PROJECT_MARKER,
    denoDir: process.env.DENO_DIR,
    denort: process.env.DENORT_BIN,
  }) + "\n");
}

if (process.env.FAKE_DENO_MODE === "fail") {
  process.stdout.write("fake stdout diagnostic");
  process.stderr.write("fake stderr diagnostic");
  process.exit(17);
}

if (process.env.FAKE_DENO_MODE === "delay") {
  if (process.env.FAKE_DENO_STARTED !== undefined) await writeFile(process.env.FAKE_DENO_STARTED, "started\n");
  await new Promise(() => {
    setInterval(() => {}, 1_000);
  });
}

if (process.env.FAKE_DENO_MODE === "missing") process.exit(0);

const outputIndex = argv.indexOf("--output");
if (outputIndex < 0 || argv[outputIndex + 1] === undefined) process.exit(22);
let outfile = argv[outputIndex + 1];
const hostTriple = process.platform === "darwin"
  ? (process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin")
  : process.platform === "win32"
  ? (process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc")
  : process.arch === "arm64"
  ? "aarch64-unknown-linux-gnu"
  : "x86_64-unknown-linux-gnu";
const targetIndex = argv.indexOf("--target");
const target = targetIndex < 0 ? hostTriple : argv[targetIndex + 1];
if (target === "x86_64-pc-windows-msvc" || target === "aarch64-pc-windows-msvc") {
  if (!outfile.toLowerCase().endsWith(".exe")) outfile += ".exe";
}

const invalid = process.env.FAKE_DENO_MODE === "invalid";
let bytes;
if (invalid) {
  bytes = new TextEncoder().encode("not a native executable");
} else if (target === "x86_64-apple-darwin" || target === "aarch64-apple-darwin") {
  bytes = new Uint8Array(8);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  new DataView(bytes.buffer).setUint32(4, target === "aarch64-apple-darwin" ? 0x0100000c : 0x01000007, true);
} else if (target === "x86_64-pc-windows-msvc" || target === "aarch64-pc-windows-msvc") {
  bytes = new Uint8Array(70);
  bytes.set([0x4d, 0x5a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(60, 64, true);
  bytes.set([0x50, 0x45, 0, 0], 64);
  view.setUint16(68, target === "aarch64-pc-windows-msvc" ? 0xaa64 : 0x8664, true);
} else {
  const interpreter = new TextEncoder().encode("/lib64/ld-linux-x86-64.so.2\0");
  bytes = new Uint8Array(120 + interpreter.byteLength);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, target === "aarch64-unknown-linux-gnu" ? 183 : 62, true);
  view.setBigUint64(32, 64n, true);
  view.setUint16(54, 56, true);
  view.setUint16(56, 1, true);
  view.setUint32(64, 3, true);
  view.setBigUint64(72, 120n, true);
  view.setBigUint64(96, BigInt(interpreter.byteLength), true);
  bytes.set(interpreter, 120);
}

await writeFile(outfile, bytes);
await chmod(outfile, invalid ? 0o644 : 0o755);
