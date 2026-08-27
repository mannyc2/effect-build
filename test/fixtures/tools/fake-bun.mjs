#!/usr/bin/env node
import { writeSync } from "node:fs";
import { appendFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const argv = process.argv.slice(2);

if (argv[0] === "--version") {
  writeSync(1, `${process.env.FAKE_BUN_VERSION ?? "1.3.14"}\n`);
  process.exit(0);
}

const log = process.env.FAKE_BUN_LOG;
if (log !== undefined) {
  await appendFile(log, `${JSON.stringify({ argv, cwd: process.cwd(), marker: process.env.FAKE_PROJECT_MARKER })}\n`);
}

if (process.env.FAKE_BUN_MODE === "fail") {
  writeSync(1, "fake stdout diagnostic");
  writeSync(2, "fake stderr diagnostic");
  process.exit(17);
}

if (process.env.FAKE_BUN_MODE === "delay") {
  if (process.env.FAKE_BUN_STARTED !== undefined) await writeFile(process.env.FAKE_BUN_STARTED, "started\n");
  await new Promise(() => {
    setInterval(() => {}, 1_000);
  });
}

if (process.env.FAKE_BUN_MODE === "missing") process.exit(0);

const outdirArgument = argv.find((value) => value.startsWith("--outdir="));
if (argv[0] === "build" && !argv.includes("--compile") && outdirArgument !== undefined) {
  const outdir = outdirArgument.slice("--outdir=".length);
  const entrypoints = argv.slice(1).filter((value) => !value.startsWith("--"));
  if (entrypoints.length === 0) process.exit(23);
  const sourcemap = argv.find((value) => value.startsWith("--sourcemap="))?.slice("--sourcemap=".length);
  for (const entrypoint of entrypoints) {
    const base = entrypoint.split("/").at(-1).replace(/\.(ts|tsx|jsx|mjs|cjs|js)$/, "");
    await writeFile(join(outdir, `${base}.js`), `// bundled ${base}\nexport {};\n`);
    if (sourcemap === "linked" || sourcemap === "external") await writeFile(join(outdir, `${base}.js.map`), "{}\n");
  }
  if (argv.includes("--splitting")) {
    await mkdir(join(outdir, "chunks"), { recursive: true });
    await writeFile(join(outdir, "chunks", "chunk-fake.js"), "export const shared = 1;\n");
  }
  process.exit(0);
}

const outfileArgument = argv.find((value) => value.startsWith("--outfile="));
if (outfileArgument === undefined) process.exit(22);
let outfile = outfileArgument.slice("--outfile=".length);
const hostTarget = process.platform === "darwin"
  ? (process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64")
  : process.platform === "win32"
  ? "bun-windows-x64"
  : process.arch === "arm64"
  ? "bun-linux-arm64"
  : "bun-linux-x64";
const target = argv.find((value) => value.startsWith("--target="))?.slice("--target=".length) ?? hostTarget;
if (target === "bun-windows-x64" && !outfile.toLowerCase().endsWith(".exe")) outfile += ".exe";

const invalid = process.env.FAKE_BUN_MODE === "invalid";
let bytes;
if (invalid) {
  bytes = new TextEncoder().encode("not a native executable");
} else if (target.startsWith("bun-darwin")) {
  bytes = new Uint8Array(8);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  const cpu = target.endsWith("arm64") ? 0x0100000c : 0x01000007;
  new DataView(bytes.buffer).setUint32(4, cpu, true);
} else if (target === "bun-windows-x64") {
  bytes = new Uint8Array(70);
  bytes.set([0x4d, 0x5a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(60, 64, true);
  bytes.set([0x50, 0x45, 0, 0], 64);
  view.setUint16(68, 0x8664, true);
} else {
  const interpreter = new TextEncoder().encode(
    target === "bun-linux-x64-musl" ? "/lib/ld-musl-x86_64.so.1\0" : "/lib64/ld-linux-x86-64.so.2\0",
  );
  bytes = new Uint8Array(120 + interpreter.byteLength);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(18, target === "bun-linux-arm64" ? 183 : 62, true);
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
