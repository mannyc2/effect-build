#!/usr/bin/env bun
import { appendFile, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const argv = process.argv.slice(2);
const log = process.env.FAKE_UV_BUILD_LOG;
if (log !== undefined) await appendFile(log, `${JSON.stringify({ argv, cwd: process.cwd() })}\n`);
const stdout = (text) => new Promise((resolve) => process.stdout.write(text, resolve));

if (argv[0] === "--version") {
  await stdout("uv 0.12.0 (fake)\n");
  process.exit(0);
}

if (process.env.FAKE_UV_BUILD_MODE === "fail") {
  process.stderr.write("fake uv build failure\n");
  process.exit(41);
}

if (argv[0] === "lock" && argv.includes("--check")) process.exit(0);

if (argv[0] !== "build") process.exit(42);
const outdirIndex = argv.indexOf("--out-dir");
const outdir = argv[outdirIndex + 1];
const source = argv.at(-1);
if (outdirIndex === -1 || outdir === undefined || source === undefined) process.exit(43);
await mkdir(outdir, { recursive: true });
const pyproject = await readFile(join(source, "pyproject.toml"), "utf8");
const name = /name\s*=\s*"([^"]+)"/.exec(pyproject)?.[1]?.replaceAll("-", "_") ?? basename(source).replaceAll("-", "_");
const wheel = join(outdir, `${name}-1.0.0-py3-none-any.whl`);
if (process.env.FAKE_UV_BUILD_MODE === "symlink-wheel") await symlink(join(source, "pyproject.toml"), wheel);
else await writeFile(wheel, `wheel:${name}\n`);
if (process.env.FAKE_UV_BUILD_MODE !== "missing-sdist") {
  await writeFile(join(outdir, `${name}-1.0.0.tar.gz`), `sdist:${name}\n`);
}
if (process.env.FAKE_UV_BUILD_MODE === "extra") await writeFile(join(outdir, "unexpected.txt"), "extra\n");
