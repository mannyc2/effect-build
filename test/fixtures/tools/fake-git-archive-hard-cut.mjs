#!/usr/bin/env bun
import { appendFile, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);
const log = process.env.FAKE_GIT_ARCHIVE_LOG;
if (log !== undefined) await appendFile(log, `${JSON.stringify({ argv, cwd: process.cwd() })}\n`);
const stdout = (text) => new Promise((resolve) => process.stdout.write(text, resolve));

if (argv[0] === "--version") {
  await stdout("git version 2.51.0\n");
  process.exit(0);
}

if (process.env.FAKE_GIT_ARCHIVE_MODE === "fail") {
  process.stderr.write("fake git archive failure\n");
  process.exit(31);
}

if (argv[0] === "cat-file" && argv[1] === "-t") {
  await stdout(`${process.env.FAKE_GIT_ARCHIVE_TYPE ?? "tree"}\n`);
  process.exit(0);
}

if (argv[0] === "ls-tree") {
  await stdout(`160000 commit ${"2".repeat(40)}\tvendor/submodule\0`);
  await stdout(`100644 blob ${"3".repeat(40)}\tREADME.md\0`);
  process.exit(0);
}

const encode = new TextEncoder();

const octal = (value, width) => `${value.toString(8).padStart(width - 1, "0")}\0`;

const header = ({ path, mode, type = "0", contents = new Uint8Array(), link = "" }) => {
  const output = new Uint8Array(512);
  output.set(encode.encode(path), 0);
  output.set(encode.encode(octal(mode, 8)), 100);
  output.set(encode.encode(octal(0, 8)), 108);
  output.set(encode.encode(octal(0, 8)), 116);
  output.set(encode.encode(octal(type === "0" ? contents.byteLength : 0, 12)), 124);
  output.set(encode.encode(octal(1_700_000_000, 12)), 136);
  output.fill(0x20, 148, 156);
  output.set(encode.encode(type), 156);
  output.set(encode.encode(link), 157);
  output.set(encode.encode("ustar\0"), 257);
  output.set(encode.encode("00"), 263);
  const checksum = output.reduce((total, byte) => total + byte, 0);
  output.set(encode.encode(`${checksum.toString(8).padStart(6, "0")}\0 `), 148);
  return output;
};

const archive = (entries) => {
  const chunks = [];
  let length = 1024;
  for (const entry of entries) {
    const contents = entry.contents ?? new Uint8Array();
    const padding = entry.type === undefined || entry.type === "0" ? (512 - (contents.byteLength % 512)) % 512 : 0;
    const item = [header({ ...entry, contents }), ...(contents.byteLength === 0 ? [] : [contents]), new Uint8Array(padding)];
    chunks.push(...item);
    length += item.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

if (argv[0] === "archive") {
  const prefix = argv.find((argument) => argument.startsWith("--prefix="))?.slice("--prefix=".length);
  const output = argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length);
  if (prefix === undefined || output === undefined || !prefix.endsWith("/")) process.exit(32);
  const lfs = "version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef\nsize 42\n";
  const entries = [
    { path: prefix, mode: 0o755, type: "5" },
    { path: `${prefix}.gitattributes`, mode: 0o644, contents: encode.encode("secret.txt export-ignore\n") },
    { path: `${prefix}README.md`, mode: 0o644, contents: encode.encode("source fixture\n") },
    { path: `${prefix}bin`, mode: 0o755, type: "5" },
    { path: `${prefix}bin/tool`, mode: 0o755, contents: encode.encode("#!/bin/sh\n") },
    { path: `${prefix}README.link`, mode: 0o777, type: "2", link: "README.md" },
    { path: `${prefix}asset.lfs`, mode: 0o644, contents: encode.encode(lfs) },
    { path: `${prefix}dist`, mode: 0o755, type: "5" },
    { path: `${prefix}dist/generated.js`, mode: 0o644, contents: encode.encode("generated\n") },
    { path: `${prefix}.git`, mode: 0o755, type: "5" },
    { path: `${prefix}.git/config`, mode: 0o644, contents: encode.encode("forbidden\n") },
    { path: `${prefix}vendor`, mode: 0o755, type: "5" },
    { path: `${prefix}vendor/submodule`, mode: 0o755, type: "5" },
    { path: `${prefix}vendor/submodule/inside`, mode: 0o644, contents: encode.encode("forbidden\n") },
  ];
  await writeFile(output, archive(entries));
  process.exit(0);
}

process.stderr.write(`unsupported fake git invocation: ${JSON.stringify(argv)}\n`);
process.exit(33);
