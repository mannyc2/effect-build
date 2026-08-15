import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageVersion = "0.3.0";
const effectPeer = ">=4.0.0-beta.104 <4.1.0-0";
const packageNames = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
];
const filenames = packageNames.map((name) => `${name}-${packageVersion}.tgz`);
const exactManifestKeys = ["version", "source", "packages"];
const exactPackageKeys = [
  "filename",
  "name",
  "version",
  "bytes",
  "sha256",
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];

const exactKeys = (value, expected) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);

const expectedDependencies = (name) => name === "effect-build"
  ? {}
  : name === "effect-build-esbuild"
  ? { "effect-build": `^${packageVersion}`, esbuild: "0.28.2" }
  : { "effect-build": `^${packageVersion}` };

const expectedSubpaths = (name) => name === "effect-build" ? [".", "./Integration", "./Provider"] : ["."];

export const parseArguments = (argv) => {
  if (
    argv.length !== 4
    || argv[0] !== "--directory"
    || !isAbsolute(argv[1])
    || argv[2] !== "--source"
    || !/^[0-9a-f]{40}$/.test(argv[3])
  ) {
    throw new Error("usage: verify-candidate.mjs --directory <absolute-path> --source <40-lowercase-hex-sha>");
  }
  return { directory: resolve(argv[1]), source: argv[3] };
};

const inspectTarball = async (tarball) => {
  const [{ stdout: entriesOutput }, { stdout: manifestOutput }] = await Promise.all([
    execFileAsync("tar", ["-tzf", tarball], { maxBuffer: 8 * 1024 * 1024 }),
    execFileAsync("tar", ["-xOf", tarball, "package/package.json"], { maxBuffer: 8 * 1024 * 1024 }),
  ]);
  return {
    entries: entriesOutput.trim().split("\n").filter(Boolean),
    manifest: JSON.parse(manifestOutput),
  };
};

const verifyPackedManifest = (name, packed, entries) => {
  if (packed === null || typeof packed !== "object" || Array.isArray(packed)) {
    throw new Error(`${name} packed manifest is not an object`);
  }
  if (packed.name !== name || packed.version !== packageVersion) {
    throw new Error(`${name} packed identity does not match`);
  }
  if (JSON.stringify(packed.dependencies ?? {}) !== JSON.stringify(expectedDependencies(name))) {
    throw new Error(`${name} packed dependencies do not match`);
  }
  if (JSON.stringify(packed.peerDependencies ?? {}) !== JSON.stringify({ effect: effectPeer })) {
    throw new Error(`${name} packed Effect peer does not match`);
  }
  if (packed.optionalDependencies !== undefined) {
    throw new Error(`${name} unexpectedly has optional dependencies`);
  }
  for (const section of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const [dependency, value] of Object.entries(packed[section] ?? {})) {
      if (
        typeof value !== "string"
        || /^(?:workspace:|catalog:|file:|link:|portal:|\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/.test(value)
      ) {
        throw new Error(`${name} contains non-registry ${section}.${dependency}`);
      }
    }
  }
  if (
    packed.exports === null
    || typeof packed.exports !== "object"
    || Array.isArray(packed.exports)
    || JSON.stringify(Object.keys(packed.exports)) !== JSON.stringify(expectedSubpaths(name))
  ) {
    throw new Error(`${name} packed exports do not match`);
  }
  for (const [subpath, target] of Object.entries(packed.exports)) {
    if (target === null || typeof target !== "object" || Array.isArray(target)) {
      throw new Error(`${name} export ${subpath} is malformed`);
    }
    for (const field of ["types", "import"]) {
      const path = target[field];
      if (
        typeof path !== "string"
        || !path.startsWith("./dist/")
        || path.includes("/src/")
        || !entries.includes(`package/${path.slice(2)}`)
      ) {
        throw new Error(`${name} export ${subpath}.${field} is not a packed dist file`);
      }
    }
  }
};

export const verifyCandidate = async ({ directory, source }, dependencies = {}) => {
  if (!isAbsolute(directory) || !/^[0-9a-f]{40}$/.test(source)) {
    throw new Error("candidate verification requires an absolute directory and exact lowercase source SHA");
  }
  const listDirectory = dependencies.listDirectory ?? readdir;
  const read = dependencies.readFile ?? readFile;
  const fileStat = dependencies.stat ?? stat;
  const inspect = dependencies.inspectTarball ?? inspectTarball;
  const actualInventory = [...await listDirectory(directory)].sort();
  const expectedInventory = [...filenames, "manifest.json"].sort();
  if (JSON.stringify(actualInventory) !== JSON.stringify(expectedInventory)) {
    throw new Error("candidate inventory must contain exactly five tarballs and manifest.json");
  }
  const manifest = JSON.parse(await read(join(directory, "manifest.json"), "utf8"));
  if (!exactKeys(manifest, exactManifestKeys) || manifest.version !== 1 || manifest.source !== source) {
    throw new Error("candidate manifest schema or source does not match");
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== packageNames.length) {
    throw new Error("candidate manifest must contain exactly five package records");
  }
  for (const [index, name] of packageNames.entries()) {
    const record = manifest.packages[index];
    const filename = filenames[index];
    if (
      !exactKeys(record, exactPackageKeys)
      || record.filename !== filename
      || record.name !== name
      || record.version !== packageVersion
      || typeof record.bytes !== "number"
      || !Number.isSafeInteger(record.bytes)
      || record.bytes <= 0
      || !/^[0-9a-f]{64}$/.test(record.sha256)
      || JSON.stringify(record.dependencies) !== JSON.stringify(expectedDependencies(name))
      || JSON.stringify(record.peerDependencies) !== JSON.stringify({ effect: effectPeer })
      || JSON.stringify(record.optionalDependencies) !== JSON.stringify({})
    ) {
      throw new Error(`${name} candidate manifest record does not match`);
    }
    const tarball = join(directory, filename);
    const metadata = await fileStat(tarball);
    if (!metadata.isFile() || metadata.size !== record.bytes) {
      throw new Error(`${name} candidate size does not match`);
    }
    const contents = await read(tarball);
    if (createHash("sha256").update(contents).digest("hex") !== record.sha256) {
      throw new Error(`${name} candidate SHA-256 does not match`);
    }
    const { manifest: packed, entries } = await inspect(tarball);
    verifyPackedManifest(name, packed, entries);
  }
  return { source, packages: packageNames.length };
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyCandidate(parseArguments(process.argv.slice(2))).then(
    ({ source, packages }) => console.log(`candidate verified: ${packages} packages at ${source}`),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
