import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readTooling } from "./read-tooling.mjs";

const execFileAsync = promisify(execFile);
const requestedRoot = process.env.EFFECT_BUILD_TOOL_DIR;
const root = resolve(requestedRoot ?? join(tmpdir(), `effect-build-tools-${process.pid}`));
await mkdir(root, { recursive: true });

const { pins } = await readTooling();
const results = new Map();
for (const pin of pins.tools) {
  const key = pin.tool;
  const directory = join(root, `${key}-${pin.version}`);
  const archive = join(directory, basename(new URL(pin.url).pathname));
  await mkdir(directory, { recursive: true });
  const response = await fetch(pin.url);
  if (!response.ok) throw new Error(`download failed for ${key}: ${response.status}`);
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (digest !== pin.sha256) throw new Error(`checksum mismatch for ${key}`);
  await execFileAsync("unzip", ["-q", "-o", archive, "-d", directory]);
  const executable = resolve(directory, pin.member);
  if (!executable.startsWith(`${directory}/`)) throw new Error(`unsafe archive member for ${key}`);
  await chmod(executable, 0o755);
  results.set(key, executable);
}

for (const key of ["bun", "deno", "denort"]) {
  const value = results.get(key);
  if (value === undefined) throw new Error(`missing ${key} pin`);
  console.log(`${key}=${value}`);
}
