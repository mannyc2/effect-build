import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  derivePublicModules,
  derivePublicPackageNames,
  extractEmbeddedPackageManifest,
  sha256Digest,
  validateEmbeddedPackageManifest,
  validateReleaseCandidate,
} from "./protocol.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const [candidateArgument, sourceSha] = process.argv.slice(2);

if (candidateArgument === undefined || !/^[0-9a-f]{40}$/u.test(sourceSha ?? "")) {
  throw new Error("usage: prepare-npm-candidate.mjs <new-candidate-directory> <40-character-source-sha>");
}

const candidateDirectory = resolve(candidateArgument);
mkdirSync(candidateDirectory);

const contractBytes = readFileSync(resolve(repositoryRoot, "tooling/effect-build-contract.json"));
const contract = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contractBytes));
const policy = contract.releaseCertification;
const registry = contract.npmRegistryBoundary;
const names = derivePublicPackageNames(contract);
const publicModules = derivePublicModules(contract);
const reservedOnly = [...registry.reservation.packages].sort();
const placeholders = [...registry.bootstrap.placeholderAtHandoffPackages].sort();
const expectedDistTags = [...registry.publicationAdmission.target.expectedDistTagsBeforePublication]
  .sort((left, right) => left.name.localeCompare(right.name));

if (
  policy.candidate.protocol !== "effect-build/npm-release-candidate@2"
  || policy.candidate.packageAdmission !== "releaseCertification.publicAdmission"
  || policy.candidate.repositoryCodeInProtectedConsumer !== "forbidden"
  || policy.publicAdmission.packageCount !== 11
  || policy.publicAdmission.moduleCount !== 42
  || JSON.stringify(expectedDistTags.map(({ name }) => name)) !== JSON.stringify(names)
  || names.includes("effect-build-rolldown")
  || JSON.stringify(reservedOnly) !== JSON.stringify(["effect-build-rolldown"])
  || placeholders.length !== 7
  || registry.candidateHandoff.repositoryCodeInOidcJob !== "forbidden"
) {
  throw new Error("candidate preparation does not match the generated release-certification policy");
}

const observeVersion = (command, args) => {
  const observed = spawnSync(command, args, { cwd: repositoryRoot, encoding: "utf8", shell: false });
  return observed.status === 0 ? observed.stdout.trim() : "";
};

const bunEvidence = contract.exactToolEvidenceRegister.tools.find(({ name }) => name === "bun");
const observedBun = spawnSync("bun", ["--version"], { cwd: repositoryRoot, encoding: "utf8", shell: false });
if (observedBun.status !== 0 || observedBun.stdout.trim() !== bunEvidence?.version || bunEvidence.version !== "1.3.14") {
  throw new Error(`candidate packing requires contract Bun 1.3.14; observed ${observedBun.stdout.trim() || "missing"}`);
}
const observedNpm = observeVersion("npm", ["--version"]);
if (
  process.version !== `v${policy.npmOidcCertification.client.node}`
  || observedNpm !== policy.npmOidcCertification.client.npm
) {
  throw new Error(
    `candidate preparation requires Node ${policy.npmOidcCertification.client.node} and npm ${policy.npmOidcCertification.client.npm}`,
  );
}

const version = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/effect-build/package.json"), "utf8")).version;
if (version !== registry.publicationAdmission.target.version || version === registry.bootstrap.placeholderVersion) {
  throw new Error(`workspace version ${version} does not match contract release target`);
}

const packageBytes = new Map();
const packageManifests = new Map();
const packages = names.map((name) => {
  const packageDirectory = resolve(repositoryRoot, "packages", name);
  const sourceManifest = JSON.parse(readFileSync(resolve(packageDirectory, "package.json"), "utf8"));
  validateEmbeddedPackageManifest(sourceManifest, { contract, name, version });
  const packed = spawnSync(
    "bun",
    ["pm", "pack", "--destination", candidateDirectory, "--cwd", packageDirectory],
    { cwd: repositoryRoot, encoding: "utf8", shell: false },
  );
  if (packed.status !== 0) throw new Error(`packing ${name} failed:\n${packed.stderr || packed.stdout}`);
  const file = packed.stdout.trimEnd().split("\n").findLast((line) => line.trim().endsWith(".tgz"))?.trim();
  if (file === undefined) throw new Error(`packing ${name} produced no tarball`);
  const filename = basename(file);
  if (filename !== `${name}-${version}.tgz`) {
    throw new Error(`packing ${name} produced unexpected filename ${filename}`);
  }
  const tarball = readFileSync(resolve(candidateDirectory, filename));
  const embedded = extractEmbeddedPackageManifest(
    resolve(candidateDirectory, filename),
    contract.releaseCertification.candidate.tarballInspection,
  );
  validateEmbeddedPackageManifest(embedded.manifest, { contract, name, version });
  packageBytes.set(name, tarball);
  packageManifests.set(name, embedded);
  const entry = {
    name,
    file: filename,
    bytes: tarball.byteLength,
    sha256: sha256Digest(tarball),
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    manifestDigest: sha256Digest(embedded.bytes),
  };
  process.stdout.write(`prepublish-sri ${name}@${version} ${entry.integrity}\n`);
  return entry;
});

const candidate = {
  schema: policy.candidate.protocol,
  sourceSha,
  version,
  contract: {
    schema: contract.schema,
    digest: sha256Digest(contractBytes),
  },
  toolchain: {
    bun: { name: "bun", version: bunEvidence.version },
    node: { name: "node", version: policy.npmOidcCertification.client.node },
    npm: { name: "npm", version: policy.npmOidcCertification.client.npm },
  },
  publicModules,
  packages,
};
const manifestPath = resolve(candidateDirectory, policy.candidate.manifest);
writeFileSync(manifestPath, canonicalJson(candidate));
const persisted = JSON.parse(readFileSync(manifestPath, "utf8"));
validateReleaseCandidate({
  candidate: persisted,
  contract,
  contractBytes,
  expectedSourceSha: sourceSha,
  files: readdirSync(candidateDirectory),
  packageBytes,
  packageManifests,
});
