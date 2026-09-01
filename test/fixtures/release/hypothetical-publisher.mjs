import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  canonicalJson,
  extractEmbeddedPackageManifest,
  validateReleaseCandidate,
} from "../../../scripts/release/protocol.mjs";
import {
  canonicalDigest,
  commitTarget,
  exactProvenance,
  packageNames,
  placeholderNames,
  placeholderVersion,
  readState,
  reservedOnlyName,
  sourceSha,
  targetVersion,
  writeState,
} from "./release-state.mjs";

const stop = (message) => {
  throw new Error(message);
};

const newerThanTarget = (version) => {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/u.exec(value);
    if (match === null) stop(`fake registry has a non-semver version: ${value}`);
    return match.slice(1).map(Number);
  };
  const left = parse(version);
  const right = parse(targetVersion);
  return left.some((value, index) => value !== right[index] && left.slice(0, index).every((entry, prior) =>
    entry === right[prior]
  ) && value > right[index]);
};

const validateCandidate = (state) => {
  const contractBytes = readFileSync(state.candidate.contractPath);
  const contract = JSON.parse(contractBytes);
  const directory = dirname(state.candidate.packages[packageNames[0]].file);
  const manifestBytes = readFileSync(resolve(directory, contract.releaseCertification.candidate.manifest));
  const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  const candidate = JSON.parse(manifestText);
  if (manifestText !== canonicalJson(candidate)) stop("hypothetical candidate manifest is not canonical JSON");
  const packageBytes = new Map();
  const packageManifests = new Map();
  for (const name of packageNames) {
    const path = state.candidate.packages[name].file;
    packageBytes.set(name, readFileSync(path));
    packageManifests.set(
      name,
      extractEmbeddedPackageManifest(path, contract.releaseCertification.candidate.tarballInspection),
    );
  }
  validateReleaseCandidate({
    candidate,
    contract,
    contractBytes,
    expectedSourceSha: sourceSha,
    files: [contract.releaseCertification.candidate.manifest, ...candidate.packages.map(({ file }) => file)],
    packageBytes,
    packageManifests,
  });
  return contract;
};

const exactTarget = (state, name) => {
  const observed = state.registry.packages[name].versions[targetVersion];
  const candidate = state.candidate.packages[name];
  if (observed === undefined) stop(`${name}@${targetVersion} is absent`);
  const fault = state.faults.postPublish?.name === name ? state.faults.postPublish.mode : undefined;
  const observedBytes = fault === "size" ? observed.bytes + 1 : observed.bytes;
  const observedIntegrity = fault === "integrity" ? "sha512-mismatch" : observed.integrity;
  const observedSha256 = fault === "bytes" ? "0".repeat(64) : observed.sha256;
  if (
    observedBytes !== candidate.bytes
    || observedIntegrity !== candidate.integrity
    || observedSha256 !== candidate.sha256
    || !isDeepStrictEqual(observed.provenance, exactProvenance())
    || state.registry.packages[name].tags.latest !== targetVersion
  ) stop(`${name}@${targetVersion} does not equal the certified candidate bytes, latest tag, and provenance`);
};

const assertReservations = (state) => {
  for (const name of placeholderNames) {
    const entry = state.registry.packages[name];
    const versions = Object.keys(entry.versions).sort();
    const publicTarget = packageNames.includes(name) && Object.hasOwn(entry.versions, targetVersion);
    const expectedVersions = publicTarget ? [placeholderVersion, targetVersion].sort() : [placeholderVersion];
    const expectedLatest = publicTarget ? targetVersion : placeholderVersion;
    if (
      !isDeepStrictEqual(versions, expectedVersions)
      || entry.tags.reserved !== placeholderVersion
      || entry.tags.latest !== expectedLatest
    ) stop(`${name} placeholder or reservation state drifted`);
  }
  const reserved = state.registry.packages[reservedOnlyName];
  if (
    !isDeepStrictEqual(Object.keys(reserved.versions), [placeholderVersion])
    || reserved.tags.latest !== placeholderVersion
    || reserved.tags.reserved !== placeholderVersion
  ) stop("reservation-only Rolldown state drifted");
};

export const runHypotheticalPublisher = (statePath, { forbiddenEnvironment } = {}) => {
  const state = readState(statePath);
  if (forbiddenEnvironment !== undefined) stop(`forbidden hypothetical environment: ${forbiddenEnvironment}`);
  if (
    state.dispatch.candidateDigest !== state.artifacts.candidate.digest
    || canonicalDigest(readFileSync(state.artifacts.candidate.path)) !== state.artifacts.candidate.digest
    || state.dispatch.readinessDigest !== state.artifacts.readiness.digest
  ) stop("adopted hypothetical evidence coordinate changed");
  const contract = validateCandidate(state);
  if (state.api.mainSha !== sourceSha) stop("main advanced before the first hypothetical mutation");
  if (state.faults.view !== undefined) stop("hypothetical registry observation was inconclusive");
  const expectedLatest = new Map(
    contract.npmRegistryBoundary.publicationAdmission.target.expectedLatestBeforePublication
      .map(({ name, version }) => [name, version]),
  );
  let sawMissing = false;
  const missing = [];
  for (const name of packageNames) {
    const versions = Object.keys(state.registry.packages[name].versions).sort();
    if (versions.some(newerThanTarget)) stop(`${name} has a version newer than ${targetVersion}`);
    if (versions.includes(targetVersion)) {
      if (sawMissing) stop("existing hypothetical publication is not one canonical prefix");
      exactTarget(state, name);
    } else {
      sawMissing = true;
      if (state.registry.packages[name].tags.latest !== expectedLatest.get(name)) {
        stop(`${name} prior latest drifted before the hypothetical mutation`);
      }
      missing.push(name);
    }
  }
  assertReservations(state);
  for (const name of missing) {
    if (state.api.mainSha !== sourceSha) stop("main advanced before the next hypothetical mutation");
    assertReservations(state);
    const fault = state.faults.publish?.name === name ? state.faults.publish.mode : undefined;
    if (fault === "before-commit") {
      state.mutations.push({ committed: false, name, provenance: false });
      writeState(statePath, state);
      stop(`hypothetical publish outcome is unknown for ${name}`);
    }
    if (fault === "after-tag") {
      commitTarget(state, name, null);
      state.mutations.push({ committed: true, name, provenance: false });
      writeState(statePath, state);
      stop(`hypothetical publish outcome is unknown for ${name}`);
    }
    commitTarget(state, name);
    state.mutations.push({ committed: true, name, provenance: true });
    writeState(statePath, state);
    if (fault === "after-commit") stop(`hypothetical publish outcome is unknown for ${name}`);
    exactTarget(state, name);
  }
  for (const name of packageNames) exactTarget(state, name);
  assertReservations(state);
  writeState(statePath, state);
  return { status: "converged" };
};
