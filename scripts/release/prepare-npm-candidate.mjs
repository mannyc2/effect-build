import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const [candidateArgument, sourceSha] = process.argv.slice(2);

if (candidateArgument === undefined || !/^[0-9a-f]{40}$/u.test(sourceSha ?? "")) {
  throw new Error("usage: prepare-npm-candidate.mjs <new-candidate-directory> <40-character-source-sha>");
}

const candidateDirectory = resolve(candidateArgument);
mkdirSync(candidateDirectory);

const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8"));
const contract = readJson("tooling/effect-build-contract.json");
const surface = readJson("tooling/public-api.json");
const registry = contract.npmRegistryBoundary;
const names = [...registry.publicationAdmission.packages].sort();
const reservedOnly = [...registry.reservation.packages].sort();
const placeholders = [...registry.bootstrap.placeholderAtHandoffPackages].sort();
const expectedLatest = [...registry.publicationAdmission.target.expectedLatestBeforePublication]
  .sort((left, right) => left.name.localeCompare(right.name));
const projected = Object.keys(surface.packages).sort();
const contractPublic = Object.keys(contract.publicApiProjection.packages).sort();
const contractPrivate = [...contract.publicApiProjection.privatePackages].sort();
const modules = (packages) => Object.entries(packages)
  .sort(([left], [right]) => left.localeCompare(right))
  .flatMap(([name, entry]) => [
    name,
    ...Object.keys(entry.subpaths).sort().map((subpath) => name + "/" + subpath.slice(2)),
  ]);
const expectedModules = modules(contract.publicApiProjection.packages);
const projectedModules = modules(surface.packages);

if (
  contract.schema !== "effect-build/combined-contract@1"
  || JSON.stringify(names) !== JSON.stringify(contractPublic)
  || JSON.stringify(names) !== JSON.stringify(projected)
  || JSON.stringify(reservedOnly) !== JSON.stringify(contractPrivate)
  || JSON.stringify(expectedLatest.map(({ name }) => name)) !== JSON.stringify(names)
  || JSON.stringify(expectedModules) !== JSON.stringify(projectedModules)
  || expectedModules.length !== 42
  || registry.purpose !== "repository-package-distribution-only"
  || registry.productReleaseOwnership !== "unchanged-ts-release-boundary"
  || registry.candidateHandoff.producer !== "unprivileged-verified-pack-job"
  || registry.candidateHandoff.consumer !== "protected-npm-distribution-job"
  || JSON.stringify(registry.candidateHandoff.identity) !== JSON.stringify(["logicalName", "digest"])
  || registry.candidateHandoff.content !== "immutable-package-tarball-bytes"
  || registry.candidateHandoff.repositoryCodeInOidcJob !== "forbidden"
  || registry.publicationAdmission.source !== "publicApiProjection.packages"
  || registry.publicationAdmission.command !== "npm-publish"
  || registry.publicationAdmission.tag !== "latest"
  || registry.publicationAdmission.postPublishProof !== "downloaded-tarball-integrity"
  || registry.publicationAdmission.existingVersionPolicy !== "exact-bytes-and-latest-or-stop"
  || registry.publicationAdmission.priorLatestPolicy !== "exact-contract-ledger-or-target-on-resume"
  || registry.publicationAdmission.registryObservation !== "isolated-cache-prefer-online"
  || registry.publicationAdmission.lifecycleScripts !== "disabled"
  || registry.publicationAdmission.target.presenceAtHandoff !== "absent-for-all-admitted-packages"
  || registry.reservation.source !== "publicApiProjection.privatePackages"
  || registry.reservation.policy !== "placeholder-version-and-tags-remain-unchanged"
  || registry.bootstrap.architectureEvidence !== false
  || registry.trustedPublisher.repository !== "mannyc2/effect-build"
  || registry.trustedPublisher.workflow !== "release.yml"
  || registry.trustedPublisher.environment !== "npm"
  || registry.trustedPublisher.permission !== "publish"
  || process.version !== "v" + registry.client.node
) {
  throw new Error("npm registry boundary does not match the combined contract");
}
if (
  names.length !== 11
  || names[0] !== "effect-build"
  || names.includes("effect-build-rolldown")
  || JSON.stringify(reservedOnly) !== JSON.stringify(["effect-build-rolldown"])
  || placeholders.length !== 7
) {
  throw new Error("refusing non-canonical npm admission or reservation surface");
}

const bunEvidence = contract.exactToolEvidenceRegister.tools.find(({ name }) => name === "bun");
const observedBun = spawnSync("bun", ["--version"], { cwd: repositoryRoot, encoding: "utf8" });
if (observedBun.status !== 0 || observedBun.stdout.trim() !== bunEvidence?.version || bunEvidence.version !== "1.3.14") {
  throw new Error(`candidate packing requires contract Bun 1.3.14; observed ${observedBun.stdout.trim() || "missing"}`);
}

const version = readJson("packages/effect-build/package.json").version;
if (version !== registry.publicationAdmission.target.version || version === registry.bootstrap.placeholderVersion) {
  throw new Error(`workspace version ${version} does not match contract release target`);
}

const packages = names.map((name) => {
  const packageDirectory = resolve(repositoryRoot, "packages", name);
  const packageJson = readJson(`packages/${name}/package.json`);
  if (packageJson.name !== name || packageJson.version !== version) {
    throw new Error(`package directory identity or lockstep version mismatch for ${name}`);
  }
  const packed = spawnSync(
    "bun",
    ["pm", "pack", "--destination", candidateDirectory, "--cwd", packageDirectory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (packed.status !== 0) {
    throw new Error(`packing ${name} failed:\n${packed.stderr || packed.stdout}`);
  }
  const file = packed.stdout.trimEnd().split("\n").findLast((line) => line.trim().endsWith(".tgz"))?.trim();
  if (file === undefined) throw new Error(`packing ${name} produced no tarball`);
  const filename = basename(file);
  if (filename !== `${name}-${version}.tgz`) {
    throw new Error(`packing ${name} produced unexpected filename ${filename}`);
  }
  const bytes = readFileSync(resolve(candidateDirectory, filename));
  const entry = {
    name,
    file: filename,
    integrity: "sha512-" + createHash("sha512").update(bytes).digest("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
  process.stdout.write(`prepublish-sri ${name}@${version} ${entry.integrity}\n`);
  return entry;
});

writeFileSync(resolve(candidateDirectory, "release-candidate.json"), JSON.stringify({
  schema: "effect-build/npm-release-candidate@1",
  sourceSha,
  version,
  publicModuleCount: 42,
  packer: { name: "bun", version: bunEvidence.version },
  registry,
  packages,
}, null, 2) + "\n");
