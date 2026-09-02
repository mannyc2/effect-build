#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { buildContract, readInputs, renderJson, validateContract } from "../effect-build-contract/model.mjs";
import {
  anonymousNpmBoundary,
  candidateFromZip,
  createCollectorGitHubBoundary,
  extractFlatZip,
} from "./collect-release-readiness.mjs";
import {
  assertFinalPublicVerificationAllowed,
  parseFinalPublicDispatch,
  validateFinalPublicState,
} from "./final-public-verification.mjs";
import {
  artifactCoordinate,
  canonicalJson,
  derivePublicPackageNames,
  sha256Digest,
  sha512Integrity,
} from "./protocol.mjs";
import { finalizeAfterTerminalObservation } from "./terminal-observation.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const safeEnvironment = (names) => Object.fromEntries(
  names.flatMap((name) => typeof process.env[name] === "string" ? [[name, process.env[name]]] : []),
);

const coordinateArtifact = async ({ contract, github, reference, definition, sourceSha }) => {
  const release = contract.releaseCertification;
  const authority = release.githubAuthority;
  exactKeys(reference, release.finalPublicVerification.referenceShapes[definition.kind], `${definition.kind} reference`);
  const coordinate = artifactCoordinate(release, reference.coordinate, definition.workflow);
  if (coordinate.sourceSha !== sourceSha || reference.artifactName !== definition.artifactName) {
    throw new Error(`${definition.kind} coordinate is not bound to the final source and artifact name`);
  }
  const runEndpoint = `repos/${authority.repository}/actions/runs/${coordinate.runId}/attempts/${coordinate.runAttempt}`;
  const run = await github.readJson(runEndpoint);
  if (
    run?.id !== Number(coordinate.runId)
    || run?.run_attempt !== Number(coordinate.runAttempt)
    || run?.path !== definition.workflowPath
    || run?.head_sha !== sourceSha
    || run?.head_branch !== authority.branchPolicy.name
    || run?.event !== definition.event
    || run?.status !== "completed"
    || run?.conclusion !== "success"
    || run?.repository?.id !== Number(authority.repositoryId)
    || run?.head_repository?.id !== Number(authority.repositoryId)
  ) throw new Error(`${definition.kind} workflow run identity changed`);
  const artifactEndpoint = `repos/${authority.repository}/actions/artifacts/${coordinate.artifactId}`;
  const metadata = await github.readJson(artifactEndpoint);
  if (
    metadata?.id !== Number(coordinate.artifactId)
    || metadata?.name !== definition.artifactName
    || metadata?.digest !== coordinate.artifactDigest
    || metadata?.expired !== false
    || metadata?.workflow_run?.id !== Number(coordinate.runId)
    || metadata?.workflow_run?.head_sha !== sourceSha
    || metadata?.workflow_run?.head_branch !== authority.branchPolicy.name
    || metadata?.workflow_run?.repository_id !== Number(authority.repositoryId)
    || metadata?.workflow_run?.head_repository_id !== Number(authority.repositoryId)
  ) throw new Error(`${definition.kind} artifact metadata changed`);
  const zipBytes = await github.readArtifactZip(
    `${artifactEndpoint}/zip`,
    contract.releaseCertification.readiness.zipExtraction.maximumArchiveBytes,
  );
  if (sha256Digest(zipBytes) !== coordinate.artifactDigest) {
    throw new Error(`${definition.kind} downloaded artifact bytes changed`);
  }
  return zipBytes;
};

const currentMain = async ({ contract, github, sourceSha }) => {
  const authority = contract.releaseCertification.githubAuthority;
  const response = await github.readJson(
    `repos/${authority.repository}/git/ref/heads/${authority.branchPolicy.name}`,
  );
  if (
    response?.ref !== `refs/heads/${authority.branchPolicy.name}`
    || response?.object?.type !== "commit"
    || response?.object?.sha !== sourceSha
  ) throw new Error("authenticated current main differs from final source");
};

const publicIdentity = async ({ contract, github, sourceSha, tagReference, releaseReference, observedAt }) => {
  const policy = contract.releaseCertification.finalPublicVerification;
  const authority = contract.releaseCertification.githubAuthority;
  const tag = exactKeys(tagReference, policy.referenceShapes.tag, "final tag dispatch reference");
  const releaseInput = exactKeys(releaseReference, policy.referenceShapes.release, "final Release dispatch reference");
  if (!/^[1-9][0-9]*$/u.test(releaseInput.releaseId)) throw new Error("final Release id is not canonical");
  const tagResponse = await github.readJson(
    `repos/${authority.repository}/git/ref/tags/${encodeURIComponent(policy.tag)}`,
  );
  const releaseResponse = await github.readJson(
    `repos/${authority.repository}/releases/${releaseInput.releaseId}`,
  );
  if (
    tagResponse?.ref !== `refs/tags/${policy.tag}`
    || tagResponse?.object?.type !== "commit"
    || tagResponse?.object?.sha !== sourceSha
    || releaseResponse?.id !== Number(releaseInput.releaseId)
    || releaseResponse?.tag_name !== policy.tag
    || releaseResponse?.target_commitish !== authority.branchPolicy.name
    || releaseResponse?.draft !== false
    || releaseResponse?.prerelease !== false
    || releaseResponse?.immutable !== true
    || releaseInput.immutable !== true
  ) throw new Error("authenticated lightweight tag or public Release changed");
  const observedTag = {
    repository: authority.repository,
    name: policy.tag,
    targetSha: sourceSha,
    objectType: "commit",
    form: policy.tagPolicy.form,
  };
  if (!isDeepStrictEqual(tag, observedTag)) throw new Error("tag dispatch reference differs from GitHub");
  const observedRelease = {
    repository: authority.repository,
    releaseId: releaseInput.releaseId,
    tagName: policy.tag,
    targetSha: sourceSha,
    draft: false,
    prerelease: false,
    immutable: releaseResponse.immutable,
    observedAt,
  };
  return { assets: releaseResponse.assets, release: observedRelease, tag: observedTag };
};

const collectReleaseAssets = async ({ contract, github, candidate, releaseAssets }) => {
  const policy = contract.releaseCertification.finalPublicVerification;
  const expectedNames = [
    ...candidate.manifest.packages.map(({ file }) => file),
    contract.releaseCertification.candidate.manifest,
  ];
  if (!Array.isArray(releaseAssets) || releaseAssets.length !== expectedNames.length) {
    throw new Error("public Release does not contain exactly twelve assets");
  }
  const byName = new Map();
  for (const asset of releaseAssets) {
    if (!isRecord(asset) || typeof asset.name !== "string" || byName.has(asset.name)) {
      throw new Error("public Release assets are missing, duplicated, or malformed");
    }
    byName.set(asset.name, asset);
  }
  if (JSON.stringify([...byName.keys()].sort()) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error("public Release asset names differ from the candidate ledger");
  }
  const observations = [];
  const downloaded = new Map();
  for (const name of expectedNames) {
    const asset = byName.get(name);
    const assetId = `${asset?.id ?? ""}`;
    const packageEntry = candidate.manifest.packages.find((entry) => entry.file === name);
    const expectedBytes = packageEntry?.bytes ?? candidate.manifestBytes.byteLength;
    const expectedDigest = packageEntry?.sha256 ?? sha256Digest(candidate.manifestBytes);
    const apiUrl = `https://api.github.com/repos/${policy.repository}/releases/assets/${assetId}`;
    const browserDownloadUrl = `https://github.com/${policy.repository}/releases/download/${policy.tag}/${encodeURIComponent(name)}`;
    if (
      !/^[1-9][0-9]*$/u.test(assetId)
      || asset?.url !== apiUrl
      || asset?.browser_download_url !== browserDownloadUrl
      || typeof asset?.size !== "number"
      || !Number.isSafeInteger(asset.size)
      || asset.size !== expectedBytes
      || asset.digest !== expectedDigest
    ) throw new Error(`public Release API identity changed for ${name}`);
    const value = await github.readReleaseAsset(
      `repos/${policy.repository}/releases/assets/${assetId}`,
      expectedBytes,
    );
    if (value.byteLength !== expectedBytes || sha256Digest(value) !== expectedDigest) {
      throw new Error(`public Release bytes changed for ${name}`);
    }
    downloaded.set(name, value);
    observations.push({
      name,
      assetId,
      bytes: value.byteLength,
      digest: sha256Digest(value),
      apiUrl,
      browserDownloadUrl,
    });
  }
  return { bytes: downloaded, observations };
};

export const collectFinalNpmState = async ({ contract, npm, candidate }) => {
  const policy = contract.releaseCertification.finalPublicVerification;
  const names = derivePublicPackageNames(contract);
  const candidateEntries = new Map(candidate.manifest.packages.map((entry) => [entry.name, entry]));
  if (candidateEntries.size !== names.length) throw new Error("candidate npm byte ledger changed");
  const packageBytes = new Map();
  const packages = [];
  const provenance = [];
  const provenanceBundles = new Map();
  for (const name of names) {
    const expected = candidateEntries.get(name);
    if (!isRecord(expected)) throw new Error(`candidate npm byte ledger is absent for ${name}`);
    const packument = await npm.readJson(`${policy.registry}/${encodeURIComponent(name)}`);
    const manifest = packument?.versions?.[policy.version];
    const file = `${name}-${policy.version}.tgz`;
    const tarballUrl = `${policy.registry}/${name}/-/${file}`;
    if (
      packument?.["dist-tags"]?.latest !== policy.version
      || manifest?.name !== name
      || manifest?.version !== policy.version
      || manifest?.dist?.tarball !== tarballUrl
      || manifest?.dist?.integrity !== expected?.integrity
    ) throw new Error(`anonymous npm metadata changed for ${name}`);
    const tarball = await npm.readTarball(tarballUrl, expected.bytes);
    if (
      tarball.byteLength !== expected.bytes
      || sha256Digest(tarball) !== expected.sha256
      || sha512Integrity(tarball) !== expected.integrity
    ) throw new Error(`anonymous npm bytes changed for ${name}`);
    packageBytes.set(name, tarball);
    packages.push({
      name,
      version: policy.version,
      latest: packument["dist-tags"].latest,
      bytes: tarball.byteLength,
      sha256: sha256Digest(tarball),
      integrity: manifest.dist.integrity,
      tarballUrl,
    });
    const attestationUrl = `${policy.registry}`
      + `/-/npm/v1/attestations/${encodeURIComponent(name)}@${policy.version}`;
    const response = await npm.readJson(attestationUrl);
    const matches = Array.isArray(response?.attestations)
      ? response.attestations.filter((entry) => entry?.predicateType === policy.implementation.provenance.predicateType)
      : [];
    if (matches.length !== 1 || !isRecord(matches[0].bundle)) {
      throw new Error(`npm provenance is absent or ambiguous for ${name}`);
    }
    const bundle = matches[0].bundle;
    provenanceBundles.set(name, bundle);
    provenance.push({
      name,
      attestationUrl,
      bundleDigest: sha256Digest(canonicalJson(bundle)),
      subjectDigest: `sha512:${Buffer.from(manifest.dist.integrity.slice("sha512-".length), "base64").toString("hex")}`,
      workflow: contract.releaseCertification.candidate.workflow,
      sourceSha: "",
    });
  }
  const reservationPolicy = policy.implementation.reservation;
  const ledger = reservationPolicy.ledger;
  const packument = await npm.readJson(`${policy.registry}/${encodeURIComponent(reservationPolicy.package)}`);
  const versions = Object.keys(packument?.versions ?? {}).sort();
  const manifest = packument?.versions?.[ledger.version];
  const tarballUrl = `${policy.registry}/${reservationPolicy.package}/-/${reservationPolicy.package}-${ledger.version}.tgz`;
  if (
    JSON.stringify(versions) !== JSON.stringify([ledger.version])
    || packument?.["dist-tags"]?.latest !== ledger.bootstrapTags.latest
    || packument?.["dist-tags"]?.reserved !== ledger.bootstrapTags.reserved
    || manifest?.dist?.tarball !== tarballUrl
    || manifest?.dist?.integrity !== ledger.integrity
  ) throw new Error("Rolldown reservation metadata changed");
  const reservationBytes = await npm.readTarball(tarballUrl, ledger.bytes);
  if (
    reservationBytes.byteLength !== ledger.bytes
    || sha256Digest(reservationBytes) !== `sha256:${ledger.sha256}`
    || sha512Integrity(reservationBytes) !== ledger.integrity
  ) throw new Error("Rolldown reservation bytes changed");
  const reservation = {
    name: reservationPolicy.package,
    version: ledger.version,
    versions,
    latest: packument["dist-tags"].latest,
    reserved: packument["dist-tags"].reserved,
    bytes: reservationBytes.byteLength,
    sha256: sha256Digest(reservationBytes),
    integrity: manifest.dist.integrity,
  };
  return { packageBytes, packages, provenance, provenanceBundles, reservation, reservationBytes };
};

export const finalConsumerBoundary = Object.freeze({
  run: (contract, runtime) => {
    const policy = contract.releaseCertification.finalPublicVerification;
    const command = runtime === "node" ? process.execPath : "bun";
    const result = spawnSync(
      command,
      ["scripts/test-built-consumer.mjs", "--registry-version", policy.version, "--runtime", runtime, "--json"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: safeEnvironment([
          "PATH",
          "TMPDIR",
          "LANG",
          "LC_ALL",
          "TZ",
        ]),
        input: "",
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
        timeout: 15 * 60_000,
        windowsHide: true,
      },
    );
    if (result.status !== 0 || result.stdout.trim().length === 0 || result.stderr !== "") {
      throw new Error(`${runtime} final registry consumer failed closed`);
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(`${runtime} final registry consumer emitted non-JSON output`);
    }
  },
});

const artifactFilesForReadiness = ({ contract, definition, payload }) => {
  const release = contract.releaseCertification;
  const expectedFiles = definition.role === "fake-registry"
    ? release.fakeRegistry.exactProtectedBodyCertification.orderedFiles
    : definition.role === "npm-oidc-certification"
    ? release.npmOidcCertification.evidence.orderedFiles
    : undefined;
  return extractFlatZip({
    zipBytes: payload,
    expectedFiles,
    label: `final readiness ${definition.role}`,
    policy: release.readiness.zipExtraction,
  });
};

const collectAllowedFinalPublicVerification = async ({
  contract,
  contractBytes,
  sourceSha,
  candidate: candidateReference,
  readiness: readinessReference,
  tag: tagReference,
  release: releaseReference,
  github,
  npm,
  consumer,
}) => {
  assertFinalPublicVerificationAllowed(contract);
  const release = contract.releaseCertification;
  const policy = release.finalPublicVerification;
  const provenanceTrustedRootBytes = readFileSync(resolve(
    repositoryRoot,
    release.provenanceVerification.trustedRoot.path,
  ));
  await currentMain({ contract, github, sourceSha });
  const candidateZip = await coordinateArtifact({
    contract,
    github,
    reference: candidateReference,
    sourceSha,
    definition: {
      artifactName: release.candidate.artifactName.replace("<sourceSha>", sourceSha),
      event: release.candidate.event,
      kind: "candidate",
      workflow: release.candidate.workflow,
      workflowPath: release.candidate.workflowPath,
    },
  });
  const candidate = candidateFromZip({ zipBytes: candidateZip, contract, contractBytes, sourceSha });
  const readinessZip = await coordinateArtifact({
    contract,
    github,
    reference: readinessReference,
    sourceSha,
    definition: {
      artifactName: release.readiness.artifactName,
      event: release.readiness.event,
      kind: "readiness",
      workflow: release.readiness.workflow,
      workflowPath: release.readiness.workflowPath,
    },
  });
  const readinessFiles = extractFlatZip({
    zipBytes: readinessZip,
    expectedFiles: release.readiness.orderedFiles,
    label: "final release-readiness artifact",
    policy: release.readiness.zipExtraction,
  });
  const firstObservedAt = new Date().toISOString();
  const firstPublicIdentity = await publicIdentity({
    contract,
    github,
    sourceSha,
    tagReference,
    releaseReference,
    observedAt: firstObservedAt,
  });
  const releaseAssets = await collectReleaseAssets({
    contract,
    github,
    candidate,
    releaseAssets: firstPublicIdentity.assets,
  });
  const npmState = await collectFinalNpmState({ contract, npm, candidate });
  npmState.provenance.forEach((entry) => entry.sourceSha = sourceSha);
  const node = consumer.run(contract, "node");
  const bun = consumer.run(contract, "bun");
  const consumerSmoke = {
    schema: policy.implementation.consumerSmoke.protocol,
    version: policy.version,
    node,
    bun,
    publicModules: policy.implementation.consumerSmoke.moduleCount === undefined
      ? node.publicModules
      : node.publicModules,
    pipelines: policy.implementation.consumerSmoke.representativePipelines,
    passed: node.passed === true && bun.passed === true,
  };

  // The final receipt is emitted only after a fresh second observation of every
  // mutable public boundary; exact bytes and metadata must remain unchanged.
  await currentMain({ contract, github, sourceSha });
  const observedAt = new Date().toISOString();
  const secondIdentity = await publicIdentity({
    contract,
    github,
    sourceSha,
    tagReference,
    releaseReference,
    observedAt,
  });
  const secondAssets = await collectReleaseAssets({
    contract,
    github,
    candidate,
    releaseAssets: secondIdentity.assets,
  });
  const secondNpmState = await collectFinalNpmState({ contract, npm, candidate });
  secondNpmState.provenance.forEach((entry) => entry.sourceSha = sourceSha);
  if (
    !isDeepStrictEqual(releaseAssets.observations, secondAssets.observations)
    || !isDeepStrictEqual([...releaseAssets.bytes], [...secondAssets.bytes])
    || !isDeepStrictEqual(npmState.packages, secondNpmState.packages)
    || !isDeepStrictEqual([...npmState.packageBytes], [...secondNpmState.packageBytes])
    || !isDeepStrictEqual(npmState.provenance, secondNpmState.provenance)
    || !isDeepStrictEqual([...npmState.provenanceBundles], [...secondNpmState.provenanceBundles])
    || !isDeepStrictEqual(npmState.reservation, secondNpmState.reservation)
    || !npmState.reservationBytes.equals(secondNpmState.reservationBytes)
  ) throw new Error("public npm or GitHub Release state changed during final verification");

  return await finalizeAfterTerminalObservation({
    validate: async () => await validateFinalPublicState({
      contract,
      contractBytes,
      sourceSha,
      observedAt,
      validationTime: observedAt,
      candidate: {
        reference: candidateReference,
        manifestBytes: candidate.manifestBytes,
        files: candidate.files,
        packageBytes: candidate.packageBytes,
        packageManifests: candidate.packageManifests,
      },
      readiness: {
        reference: readinessReference,
        manifestBytes: readinessFiles.get(release.readiness.manifest),
        bundleBytes: readinessFiles.get(release.readiness.evidenceBundle),
        files: release.readiness.orderedFiles,
      },
      readinessArtifactExtractor: (arguments_) => artifactFilesForReadiness(arguments_),
      tag: secondIdentity.tag,
      release: secondIdentity.release,
      npmPackages: secondNpmState.packages,
      npmPackageBytes: secondNpmState.packageBytes,
      releaseAssets: secondAssets.observations,
      releaseAssetBytes: secondAssets.bytes,
      provenance: secondNpmState.provenance,
      provenanceBundles: secondNpmState.provenanceBundles,
      provenanceTrustedRootBytes,
      consumerSmoke,
      reservation: secondNpmState.reservation,
      reservationBytes: secondNpmState.reservationBytes,
    }),
    observe: async () => await currentMain({ contract, github, sourceSha }),
  });
};

export const collectFinalPublicVerification = (arguments_) => {
  assertFinalPublicVerificationAllowed(arguments_?.contract);
  return collectAllowedFinalPublicVerification(arguments_);
};

const loadContract = async () => {
  const source = readFileSync(contractPath, "utf8");
  const inputs = await readInputs(repositoryRoot);
  const generated = validateContract(buildContract(inputs), inputs);
  if (source !== renderJson(generated)) throw new Error("final public contract is not the exact generated contract");
  return { contract: generated, contractBytes: Buffer.from(source) };
};

const outputDirectory = (args) => {
  if (args.length !== 2 || args[0] !== "--output") throw new Error("usage: collect-final-public-verification --output <empty-directory>");
  return resolve(args[1]);
};

const main = async () => {
  const output = outputDirectory(process.argv.slice(2));
  const { contract, contractBytes } = await loadContract();
  assertFinalPublicVerificationAllowed(contract);
  const dispatch = parseFinalPublicDispatch(contract, process.env);
  const github = createCollectorGitHubBoundary(contract);
  delete process.env.GITHUB_TOKEN;
  if (readdirSync(output).length !== 0) throw new Error("final public output directory must be empty");
  const result = await collectFinalPublicVerification({
    contract,
    contractBytes,
    ...dispatch,
    github,
    npm: anonymousNpmBoundary,
    consumer: finalConsumerBoundary,
  });
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const policy = contract.releaseCertification.finalPublicVerification;
  writeFileSync(resolve(output, policy.receipt.orderedFiles[0]), result.receiptBytes, { mode: 0o600 });
  if (typeof process.env.GITHUB_OUTPUT === "string") {
    writeFileSync(process.env.GITHUB_OUTPUT, [
      `artifact-name=${policy.receipt.artifactName}`,
      `retention-days=${policy.receipt.retentionDays}`,
      `repository-id=${contract.releaseCertification.githubAuthority.repositoryId}`,
      `workflow=${policy.workflow}`,
      `workflow-path=${policy.workflowPath}`,
      "",
    ].join("\n"), { flag: "a" });
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("final public verification collection failed closed\n");
    process.exitCode = 1;
  });
}
