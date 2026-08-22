import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const releasePackageNames = Object.freeze([
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
]);

export const releaseVersion = "0.3.0";
export const releaseRepository = "mannyc2/effect-build";
export const releaseWorkflow = "release.yml";
export const releaseWorkflowRef = "refs/heads/codex/granular-integration-program";
export const releaseCandidateDirectory = "outputs/effect-build-candidate";
export const qualifiedTsReleaseCommit = "105b6b5cc39757f5284c30b082e7cfd71b9959b2";

const schemaUrl =
  `https://raw.githubusercontent.com/mannyc2/ts-release/${qualifiedTsReleaseCommit}/schema/release-config.schema.json`;
const effectPeer = ">=4.0.0-beta.104 <4.1.0-0";
const manifestKeys = ["version", "source", "packages", "consumers"];
const packageKeys = [
  "filename",
  "name",
  "version",
  "bytes",
  "sha256",
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];
const consumerKeys = ["fixture", "installer", "lockfile", "lockSha256", "treeSha256"];
const consumerFixtures = [
  ...releasePackageNames.map((name) => `npm-${name}`),
  "npm-esbuild-node-sea",
  "npm-bun-node-sea",
  ...releasePackageNames.map((name) => `bun-${name}`),
  "bun-esbuild-node-sea",
  "bun-bun-node-sea",
];

const fail = (reason) => {
  throw new Error(reason);
};

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expected) =>
  isRecord(value) && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const expectedDependencies = (name) =>
  name === "effect-build"
    ? {}
    : name === "effect-build-esbuild"
    ? { "effect-build": `^${releaseVersion}`, esbuild: "0.28.2" }
    : { "effect-build": `^${releaseVersion}` };

const validateSource = (source) => {
  if (typeof source !== "string" || !/^[0-9a-f]{40}$/.test(source)) {
    fail("Release source must be one exact 40-character lowercase hexadecimal SHA.");
  }
};

const validateCandidateDirectory = (directory) => {
  if (directory !== releaseCandidateDirectory) {
    fail(`Candidate directory must be exactly ${releaseCandidateDirectory}.`);
  }
};

const validateManifest = (manifest, source) => {
  if (!hasExactKeys(manifest, manifestKeys) || manifest.version !== 2) {
    fail("Candidate manifest v2 must contain exactly version, source, packages, and consumers keys.");
  }
  if (manifest.source !== source) {
    fail("Candidate manifest source does not match the exact release source.");
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== releasePackageNames.length) {
    fail("Candidate manifest must contain exactly five ordered package records.");
  }
  for (const [index, name] of releasePackageNames.entries()) {
    const record = manifest.packages[index];
    if (
      !hasExactKeys(record, packageKeys)
      || record.name !== name
      || record.filename !== `${name}-${releaseVersion}.tgz`
      || record.version !== releaseVersion
      || !Number.isSafeInteger(record.bytes)
      || record.bytes <= 0
      || typeof record.sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(record.sha256)
      || !same(record.dependencies, expectedDependencies(name))
      || !same(record.peerDependencies, { effect: effectPeer })
      || !same(record.optionalDependencies, {})
    ) {
      fail(`${name} candidate manifest record does not match the exact Plan 032 v2 contract.`);
    }
  }
  if (!Array.isArray(manifest.consumers) || manifest.consumers.length !== consumerFixtures.length) {
    fail("Candidate consumer evidence must contain exactly fourteen ordered records.");
  }
  for (const [index, fixture] of consumerFixtures.entries()) {
    const record = manifest.consumers[index];
    const npm = fixture.startsWith("npm-");
    if (
      !hasExactKeys(record, consumerKeys)
      || record.fixture !== fixture
      || record.installer !== (npm ? "npm@11.11.0" : "bun@1.3.14")
      || record.lockfile !== (npm ? "package-lock.json" : "bun.lock")
      || typeof record.lockSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(record.lockSha256)
      || typeof record.treeSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(record.treeSha256)
    ) {
      fail(`Candidate consumer evidence ${fixture} does not match the exact Plan 032 v2 contract.`);
    }
  }
  return manifest;
};

const deepFreeze = (value) => {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
};

const trustedPublishing = () => ({
  strategy: "trusted-publishing",
  attestation: {
    provider: "github-actions",
    runner: "github-hosted",
    repository: releaseRepository,
    workflow: releaseWorkflow,
    workflowRef: releaseWorkflowRef,
    allowedAction: "npm-publish-direct",
  },
});

export const generateReleaseConfig = ({ manifest, candidateDirectory, source }) => {
  validateSource(source);
  validateCandidateDirectory(candidateDirectory);
  const candidate = validateManifest(manifest, source);
  return deepFreeze({
    $schema: schemaUrl,
    project: {
      name: "effect-build",
      repository: releaseRepository,
      version: releaseVersion,
      tag: `v${releaseVersion}`,
    },
    publish: {
      prepackedNpm: releasePackageNames.map((name, index) => ({
        id: name,
        path: `${candidateDirectory}/${candidate.packages[index].filename}`,
        packageName: name,
        version: releaseVersion,
        sha256: candidate.packages[index].sha256,
        registry: "https://registry.npmjs.org/",
        distTag: "latest",
        access: "public",
        authentication: trustedPublishing(),
        provenance: "automatic",
      })),
      github: {
        repository: releaseRepository,
        tokenEnv: "GITHUB_TOKEN",
        draft: false,
        prerelease: false,
        ids: releasePackageNames.map((name) => `prepacked-npm:${name}`),
      },
    },
  });
};

export const serializeReleaseConfig = (config) => `${JSON.stringify(config, null, 2)}\n`;

export const parseReleaseConfigArguments = (argv) => {
  if (
    argv.length !== 8
    || argv[0] !== "--manifest"
    || !isAbsolute(argv[1])
    || argv[2] !== "--candidate-directory"
    || argv[3] !== releaseCandidateDirectory
    || argv[4] !== "--source"
    || !/^[0-9a-f]{40}$/.test(argv[5])
    || argv[6] !== "--output"
    || !isAbsolute(argv[7])
  ) {
    fail(
      "usage: write-release-config.mjs --manifest <absolute manifest.json> "
        + `--candidate-directory ${releaseCandidateDirectory} --source <40-lowercase-hex-sha> `
        + "--output <absolute config.json>",
    );
  }
  return {
    manifest: resolve(argv[1]),
    candidateDirectory: argv[3],
    source: argv[5],
    output: resolve(argv[7]),
  };
};

export const writeReleaseConfig = async ({ manifest, candidateDirectory, source, output }) => {
  const input = JSON.parse(await readFile(manifest, "utf8"));
  const config = generateReleaseConfig({ manifest: input, candidateDirectory, source });
  await writeFile(output, serializeReleaseConfig(config), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { output, packages: releasePackageNames.length, source };
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writeReleaseConfig(parseReleaseConfigArguments(process.argv.slice(2))).then(
    ({ packages, source }) => console.log(`release config written: ${packages} prepacked packages at ${source}`),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
