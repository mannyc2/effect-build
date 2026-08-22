import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open as openFile, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readTooling } from "./read-tooling.mjs";

const execFileAsync = promisify(execFile);
const defaultToolNames = ["bun", "deno", "denort"];
const selectableToolNames = [...defaultToolNames, "node"];

export const selectedToolNames = (argv) => {
  if (argv.length === 0) return defaultToolNames;
  if (argv.length !== 2 || argv[0] !== "--only" || !selectableToolNames.includes(argv[1])) {
    throw new Error("usage: provision-tool-assets.mjs [--only bun|deno|node]");
  }
  return [argv[1]];
};

export const validateArchiveEntries = (stdout, tool) => {
  const entries = String(stdout).split("\n").filter((line) => line.length > 0);
  if (entries.length === 0) throw new Error(`empty archive for ${tool}`);
  if (new Set(entries).size !== entries.length) throw new Error(`duplicate archive entry for ${tool}`);
  for (const entry of entries) {
    const normalized = normalize(entry);
    if (
      entry.includes("\\")
      || entry.includes("\0")
      || isAbsolute(entry)
      || normalized === ".."
      || normalized.startsWith(`..${sep}`)
      || entry.split(sep).includes("..")
      || normalized.split(sep).includes("..")
    ) throw new Error(`unsafe archive entry for ${tool}: ${entry}`);
  }
  return entries;
};

export const validateTarArchive = ({ entriesSource, memberVerboseSource, tool, member }) => {
  const entries = validateArchiveEntries(entriesSource, tool);
  if (!entries.includes(member)) throw new Error(`archive member missing for ${tool}: ${member}`);
  const memberEntries = String(memberVerboseSource).split("\n").filter((line) => line.length > 0);
  if (memberEntries.length !== 1 || !memberEntries[0].startsWith("-")) {
    throw new Error(`tar member is not a regular file for ${tool}: ${member}`);
  }
  return entries;
};

const text = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : String(value);

const waitForExit = (child) => new Promise((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("close", (code, signal) => resolveExit({ code, signal }));
});

export const extractTarMemberAtomically = async ({
  archive,
  destination,
  member,
  processId = process.pid,
  makeExecutable = chmod,
  open = openFile,
  remove = rm,
  renameFile = rename,
  spawnProcess = spawn,
}) => {
  const temporary = `${destination}.part-${processId}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o700);
    const child = spawnProcess("tar", ["-xJOf", archive, "--", member], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.stdout === null || child.stderr === null) throw new Error("tar extraction streams are unavailable");
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 65_536) stderr += text(chunk).slice(0, 65_536 - stderr.length);
    });
    const copy = pipeline(child.stdout, handle.createWriteStream());
    handle = undefined;
    const [status] = await Promise.all([waitForExit(child), copy]);
    if (status.code !== 0) throw new Error(`tar extraction failed for ${member}: ${stderr}`);
    await makeExecutable(temporary, 0o755);
    await renameFile(temporary, destination);
  } finally {
    await handle?.close().catch(() => undefined);
    await remove(temporary, { force: true }).catch(() => undefined);
  }
};

const temporaryPath = (path, processId) => `${path}.part-${processId}`;

const safeArchivePath = ({ directory, pin }) => {
  const url = new URL(pin.url);
  const file = basename(url.pathname);
  if (file.length === 0 || file === "." || file === "..") throw new Error(`unsafe archive URL for ${pin.tool}`);
  if (pin.archiveFormat === "tar.xz") {
    if (
      url.origin !== "https://nodejs.org"
      || url.pathname !== `/dist/v${pin.version}/node-v${pin.version}-linux-x64.tar.xz`
    ) throw new Error(`unsafe Node archive URL for ${pin.tool}`);
  }
  return join(directory, file);
};

export const provisionToolAssets = async (argv = process.argv.slice(2), {
  environment = process.env,
  loadTooling = readTooling,
  fetchAsset = fetch,
  execute = execFileAsync,
  extractTarMember = extractTarMemberAtomically,
  makeDirectory = (path) => mkdir(path, { recursive: true }),
  writeAsset = writeFile,
  readAsset = readFile,
  renameAsset = rename,
  removeAsset = rm,
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
    if (!["zip", "tar.xz"].includes(pin.archiveFormat)) throw new Error(`unsupported archive format for ${key}`);
    const directory = join(root, `${key}-${pin.version}`);
    const archive = safeArchivePath({ directory, pin });
    const partialArchive = temporaryPath(archive, processId);
    await makeDirectory(directory);
    try {
      const response = await fetchAsset(
        pin.url,
        pin.archiveFormat === "tar.xz" ? { redirect: "error", signal: AbortSignal.timeout(60_000) } : undefined,
      );
      if (!response.ok) throw new Error(`download failed for ${key}: ${response.status}`);
      await writeAsset(partialArchive, new Uint8Array(await response.arrayBuffer()), { flag: "wx" });
      const digest = createHash("sha256").update(await readAsset(partialArchive)).digest("hex");
      if (digest !== pin.sha256) throw new Error(`checksum mismatch for ${key}`);
      await renameAsset(partialArchive, archive);
    } catch (error) {
      await removeAsset(partialArchive, { force: true }).catch(() => undefined);
      throw error;
    }

    const executable = resolve(directory, pin.member);
    const contained = relative(directory, executable);
    if (contained.startsWith(`..${sep}`) || isAbsolute(contained)) throw new Error(`unsafe archive member for ${key}`);
    if (pin.archiveFormat === "zip") {
      const listing = await execute("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      const entries = validateArchiveEntries(listing.stdout, key);
      if (!entries.includes(pin.member)) throw new Error(`archive member missing for ${key}: ${pin.member}`);
      await execute("unzip", ["-q", "-o", archive, "-d", directory], { maxBuffer: 1024 * 1024 });
      await makeExecutable(executable);
    } else {
      const listing = await execute("tar", ["-tJf", archive], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      const memberVerbose = await execute("tar", ["-tvJf", archive, "--", pin.member], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      validateTarArchive({
        entriesSource: listing.stdout,
        memberVerboseSource: memberVerbose.stdout,
        tool: key,
        member: pin.member,
      });
      await makeDirectory(dirname(executable));
      await extractTarMember({ archive, destination: executable, member: pin.member, processId });
    }
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
