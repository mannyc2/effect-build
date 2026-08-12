import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readTooling } from "./read-tooling.mjs";

const execFileAsync = promisify(execFile);

export const selectedToolNames = (argv) => {
  if (argv.length === 0) return ["bun", "deno", "denort"];
  if (argv.length !== 2 || argv[0] !== "--only" || !["bun", "deno"].includes(argv[1])) {
    throw new Error("usage: provision-tool-assets.mjs [--only bun|deno]");
  }
  return [argv[1]];
};

export const validateArchiveEntries = (stdout, tool) => {
  const entries = stdout.split("\n").filter((line) => line.length > 0);
  if (entries.length === 0) throw new Error(`empty archive for ${tool}`);
  for (const entry of entries) {
    const normalized = normalize(entry);
    if (
      entry.includes("\\")
      || isAbsolute(entry)
      || normalized === ".."
      || normalized.startsWith(`..${sep}`)
      || normalized.split(sep).includes("..")
    ) throw new Error(`unsafe archive entry for ${tool}: ${entry}`);
  }
  return entries;
};

export const provisionToolAssets = async (argv = process.argv.slice(2), {
  environment = process.env,
  loadTooling = readTooling,
  fetchAsset = fetch,
  execute = execFileAsync,
  makeDirectory = (path) => mkdir(path, { recursive: true }),
  writeAsset = writeFile,
  readAsset = readFile,
  makeExecutable = (path) => chmod(path, 0o755),
  output = console.log,
  temporaryRoot = tmpdir(),
  processId = process.pid,
} = {}) => {
  const requested = selectedToolNames(argv);
  const requestedRoot = environment.EFFECT_BUILD_TOOL_DIR;
  const root = resolve(requestedRoot ?? join(temporaryRoot, `effect-build-tools-${processId}`));
  await makeDirectory(root);

  const { pins } = await loadTooling();
  const results = new Map();
  for (const key of requested) {
    const pin = pins.tools.find((candidate) => candidate.tool === key);
    if (pin === undefined) throw new Error(`missing ${key} pin`);
    const directory = join(root, `${key}-${pin.version}`);
    const archive = join(directory, basename(new URL(pin.url).pathname));
    await makeDirectory(directory);
    const response = await fetchAsset(pin.url);
    if (!response.ok) throw new Error(`download failed for ${key}: ${response.status}`);
    await writeAsset(archive, new Uint8Array(await response.arrayBuffer()));
    const digest = createHash("sha256").update(await readAsset(archive)).digest("hex");
    if (digest !== pin.sha256) throw new Error(`checksum mismatch for ${key}`);
    const listing = await execute("unzip", ["-Z1", archive]);
    const entries = validateArchiveEntries(listing.stdout, key);
    if (!entries.includes(pin.member)) throw new Error(`archive member missing for ${key}: ${pin.member}`);
    await execute("unzip", ["-q", "-o", archive, "-d", directory]);
    const executable = resolve(directory, pin.member);
    const contained = relative(directory, executable);
    if (contained.startsWith(`..${sep}`) || isAbsolute(contained)) throw new Error(`unsafe archive member for ${key}`);
    await makeExecutable(executable);
    results.set(key, executable);
  }

  for (const key of requested) {
    const value = results.get(key);
    if (value === undefined) throw new Error(`missing ${key} pin`);
    output(`${key}=${value}`);
  }
  return results;
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await provisionToolAssets();
}
