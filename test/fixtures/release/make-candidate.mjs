import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  createReleaseState,
  packageNames,
  placeholderNames,
  placeholderVersion,
  sha256,
  sha512Integrity,
  sourceSha,
  targetVersion,
} from "./release-state.mjs";
import {
  renderJson,
} from "../../../scripts/effect-build-contract/model.mjs";
import { canonicalJson } from "../../../scripts/release/protocol.mjs";
import { writeGithubArtifactZip } from "./github-artifact-zip.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fixedTime = new Date("2026-08-30T00:00:00.000Z");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result;
};

const metadata = (path) => {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    file: path,
    integrity: sha512Integrity(bytes),
    sha256: sha256(bytes),
  };
};

const candidatePublishConfig = (scenario, name) => {
  if (name !== packageNames[0]) return { access: "public", provenance: true };
  switch (scenario) {
    case "publish-config-missing":
      return undefined;
    case "publish-config-extra":
      return { access: "public", provenance: true, registry: "https://registry.npmjs.org" };
    case "publish-config-noncanonical":
      return { access: "restricted", provenance: true };
    case "publish-config-auth":
      return { "//registry.npmjs.org/:_authToken": "fixture-token", access: "public", provenance: true };
    default:
      return { access: "public", provenance: true };
  }
};

const writeTarball = ({ archivePath, archiveScenario, name, privatePackage = false, publishConfig, version, workRoot }) => {
  const packageRoot = resolve(workRoot, name, "package");
  mkdirSync(packageRoot, { recursive: true });
  const manifestPath = resolve(packageRoot, "package.json");
  writeFileSync(manifestPath, `${JSON.stringify({
    name,
    ...(privatePackage ? { private: true } : {}),
    ...(publishConfig === undefined ? {} : { publishConfig }),
    repository: {
      directory: `packages/${name}`,
      type: "git",
      url: "git+https://github.com/mannyc2/effect-build.git",
    },
    type: "module",
    version,
  }, null, 2)}\n`);
  utimesSync(manifestPath, fixedTime, fixedTime);
  utimesSync(packageRoot, fixedTime, fixedTime);
  if (archiveScenario === "symlink-leaf") {
    symlinkSync("package.json", resolve(packageRoot, "manifest-link"));
  }
  if (archiveScenario === "duplicate-nonmanifest") {
    writeFileSync(resolve(packageRoot, "duplicate.txt"), "duplicate archive member\n");
  }
  run(
    "tar",
    [
      "--format",
      "ustar",
      "-czf",
      archivePath,
      "-C",
      resolve(workRoot, name),
      "package",
      ...(archiveScenario === "duplicate-nonmanifest" ? ["package/duplicate.txt"] : []),
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  return metadata(archivePath);
};

const publicModules = (packages) => Object.entries(packages)
  .sort(([left], [right]) => left.localeCompare(right))
  .flatMap(([name, entry]) => [
    name,
    ...Object.keys(entry.subpaths).sort().map((subpath) => `${name}/${subpath.slice(2)}`),
  ]);

const readinessFrame = (descriptor, payload) => {
  const header = Buffer.from(canonicalJson(descriptor));
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(header.byteLength);
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64BE(BigInt(payload.byteLength));
  return Buffer.concat([headerLength, header, payloadLength, payload]);
};

const makePublisherReadinessFixture = ({
  candidate,
  candidateManifestBytes,
  contract,
  contractPath,
  observedAt,
  registry,
}) => {
  const release = contract.releaseCertification;
  const policy = release.readiness;
  const observedTime = Date.parse(observedAt);
  const evidenceObservedTime = observedTime - 60_000;
  const evidenceObservedAt = new Date(evidenceObservedTime).toISOString();
  const artifactObservedAt = new Date(evidenceObservedTime + 30_000).toISOString();
  const expiration = (freshness, start = evidenceObservedTime) =>
    new Date(start + freshness.maximumValiditySeconds * 1_000).toISOString();
  const candidateCoordinate = {
    workflow: release.candidate.workflow,
    sourceSha,
    runId: String(candidate.runId),
    runAttempt: String(candidate.runAttempt),
    artifactId: String(candidate.artifactId),
    artifactDigest: candidate.digest,
  };
  const candidateReference = {
    protocol: release.candidate.protocol,
    coordinate: candidateCoordinate,
    artifactName: candidate.name,
    manifestDigest: canonicalDigest(candidateManifestBytes),
    observedAt: evidenceObservedAt,
    expiresAt: expiration(policy.candidate),
    bytes: String(candidateManifestBytes.byteLength),
  };
  const evidenceBytes = new Map();
  const evidence = policy.evidenceRoles.map((definition, index) => {
    const payload = Buffer.from(canonicalJson({
      role: definition.role,
      sourceSha,
      fixture: "authenticated-readiness-workflow-output",
    }));
    evidenceBytes.set(definition.role, payload);
    const common = {
      role: definition.role,
      type: definition.type,
      protocol: definition.protocol,
      terminal: definition.terminal,
      observedAt: definition.type === "githubArtifact" ? artifactObservedAt : evidenceObservedAt,
      expiresAt: expiration(definition),
      bytes: String(payload.byteLength),
    };
    if (definition.type === "githubRun") {
      return {
        ...common,
        workflow: definition.workflow,
        sourceSha,
        runId: String(8100 + index),
        runAttempt: "1",
        digest: canonicalDigest(payload),
      };
    }
    if (definition.type === "githubArtifact") {
      return {
        ...common,
        coordinate: {
          workflow: definition.workflow,
          sourceSha,
          runId: String(8200 + index),
          runAttempt: "1",
          artifactId: String(9200 + index),
          artifactDigest: canonicalDigest(payload),
        },
        artifactName: definition.artifactName,
        evidenceObservedAt,
      };
    }
    throw new Error(`unsupported readiness evidence type: ${definition.type}`);
  });
  const referenceDigest = (value) => canonicalDigest(Buffer.from(canonicalJson(value)));
  const descriptors = [
    {
      key: "candidate",
      protocol: candidateReference.protocol,
      bytes: candidateReference.bytes,
      digest: candidateReference.manifestDigest,
      referenceDigest: referenceDigest(candidateReference),
    },
    ...evidence.map((reference) => ({
      key: reference.role,
      protocol: reference.protocol,
      bytes: reference.bytes,
      digest: reference.type === "githubArtifact" ? reference.coordinate.artifactDigest : reference.digest,
      referenceDigest: referenceDigest(reference),
    })),
  ];
  const bundleBytes = Buffer.concat([
    Buffer.from(`${policy.bundleProtocol}\n`),
    readinessFrame(descriptors[0], candidateManifestBytes),
    ...evidence.map((reference, index) =>
      readinessFrame(descriptors[index + 1], evidenceBytes.get(reference.role))
    ),
  ]);
  const expectedDistTags = new Map(
    registry.publicationAdmission.target.expectedDistTagsBeforePublication.map(({ name, tags }) => [name, tags]),
  );
  const namespaceNames = [...packageNames, ...registry.reservation.packages];
  const repository = {
    type: "git",
    url: `git+https://github.com/${release.githubAuthority.repository}.git`,
  };
  const npmPackages = namespaceNames.map((name) => {
    const ledger = registry.bootstrap.placeholderLedger.find((entry) => entry.name === name);
    if (ledger === undefined) {
      const distTags = structuredClone(expectedDistTags.get(name));
      return {
        name,
        versions: [...new Set(Object.values(distTags))].sort(),
        distTags,
        repository,
        placeholder: null,
      };
    }
    return {
      name,
      versions: [ledger.version],
      distTags: structuredClone(expectedDistTags.get(name) ?? ledger.bootstrapTags),
      repository,
      placeholder: {
        version: ledger.version,
        bytes: ledger.bytes,
        sha256: `sha256:${ledger.sha256}`,
        integrity: ledger.integrity,
        tarballUrl: `${registry.registry}/${name}/-/${name}-${ledger.version}.tgz`,
      },
    };
  });
  const authority = release.githubAuthority;
  const directObservation = {
    schema: policy.directObservation.protocol,
    sourceSha,
    observedAt,
    github: {
      repository: authority.repository,
      repositoryId: authority.repositoryId,
      repositoryOwnerId: authority.repositoryOwnerId,
      visibility: authority.repositoryVisibility,
      environment: {
        name: authority.environment,
        protectionRuleTypes: authority.branchPolicy.exactProtectionRuleTypes,
        reviewer: {
          id: authority.reviewer.id,
          login: authority.reviewer.login,
          type: authority.reviewer.type,
        },
        preventSelfReview: authority.reviewer.preventSelfReview,
      },
      deploymentBranchPolicy: authority.branchPolicy.deploymentBranchPolicy,
      deploymentBranchPolicies: [{ name: authority.branchPolicy.name, type: authority.branchPolicy.type }],
      oidcSubjectPolicy: authority.oidcSubjectPolicy,
      workflowPath: policy.workflowPath,
      workflowDigest: `sha256:${"5".repeat(64)}`,
      currentMain: sourceSha,
    },
    npm: {
      registry: registry.registry,
      targetVersion: registry.publicationAdmission.target.version,
      packages: npmPackages,
    },
  };
  const manifest = {
    schema: policy.protocol,
    sourceSha,
    observedAt,
    contract: {
      schema: contract.schema,
      digest: canonicalDigest(readFileSync(contractPath)),
    },
    toolchain: {
      bun: { name: "bun", version: "1.3.14" },
      node: { name: "node", version: release.npmOidcCertification.client.node },
      npm: { name: "npm", version: release.npmOidcCertification.client.npm },
    },
    directObservation,
    candidate: candidateReference,
    evidence,
    bundle: {
      protocol: policy.bundleProtocol,
      framing: policy.bundleFraming,
      bytes: String(bundleBytes.byteLength),
      digest: canonicalDigest(bundleBytes),
    },
  };
  return { bundleBytes, manifestBytes: Buffer.from(canonicalJson(manifest)) };
};

const writeReadinessArtifact = ({ candidate, candidateManifestBytes, contract, contractPath, registry, root, scenario }) => {
  const readinessDirectory = resolve(root, "readiness");
  mkdirSync(readinessDirectory, { recursive: true });
  const aggregateTime = Date.now();
  const observedAt = new Date(aggregateTime).toISOString();
  const aggregate = makePublisherReadinessFixture({
    candidate,
    candidateManifestBytes,
    contract,
    contractPath,
    observedAt,
    registry,
  });
  writeFileSync(resolve(readinessDirectory, "release-readiness.json"), aggregate.manifestBytes);
  writeFileSync(resolve(readinessDirectory, "release-readiness.bin"), aggregate.bundleBytes);
  if (["readiness-stale", "readiness-future", "readiness-excess-validity"].includes(scenario)) {
    const hostile = JSON.parse(aggregate.manifestBytes);
    if (scenario === "readiness-stale") {
      hostile.observedAt = new Date(aggregateTime - 5 * 60 * 60 * 1000).toISOString();
    } else if (scenario === "readiness-future") {
      hostile.observedAt = new Date(aggregateTime + 2 * 60 * 1000).toISOString();
    } else {
      hostile.candidate.expiresAt = new Date(
        aggregateTime - 60_000
          + (contract.releaseCertification.readiness.candidate.maximumValiditySeconds + 1) * 1000,
      ).toISOString();
    }
    writeFileSync(resolve(readinessDirectory, "release-readiness.json"), canonicalJson(hostile));
  }
  const readinessZip = resolve(root, "readiness.zip");
  writeGithubArtifactZip({
    directory: readinessDirectory,
    filenames: contract.releaseCertification.readiness.orderedFiles,
    outputPath: readinessZip,
  });
  const readinessBytes = readFileSync(readinessZip);
  return {
    artifactId: 9002,
    digest: canonicalDigest(readinessBytes),
    name: contract.releaseCertification.readiness.artifactName,
    path: readinessZip,
    runAttempt: 1,
    runId: 7002,
    size: readinessBytes.byteLength,
    workflowPath: contract.releaseCertification.readiness.workflowPath,
  };
};

const makeExactCandidateFixture = ({ root, scenario }) => {
  const candidateDirectory = process.env.EFFECT_BUILD_CERTIFICATION_CANDIDATE_DIRECTORY;
  const candidateZip = process.env.EFFECT_BUILD_CERTIFICATION_CANDIDATE_ZIP;
  const placeholderDirectory = process.env.EFFECT_BUILD_CERTIFICATION_PLACEHOLDER_DIRECTORY;
  const referenceSource = process.env.EFFECT_BUILD_CERTIFICATION_CANDIDATE_REFERENCE_JSON;
  if ([candidateDirectory, candidateZip, placeholderDirectory, referenceSource].every((value) => value === undefined)) {
    return undefined;
  }
  if ([candidateDirectory, candidateZip, placeholderDirectory, referenceSource].some((value) => value === undefined)) {
    throw new Error("exact candidate certification fixture inputs are incomplete");
  }
  const contractSource = resolve(repositoryRoot, "tooling/effect-build-contract.json");
  const contract = JSON.parse(readFileSync(contractSource, "utf8"));
  const reference = JSON.parse(referenceSource);
  const manifestName = contract.releaseCertification.candidate.manifest;
  const sourceManifestPath = resolve(candidateDirectory, manifestName);
  const sourceManifestBytes = readFileSync(sourceManifestPath);
  const manifest = JSON.parse(sourceManifestBytes);
  if (
    manifest.sourceSha !== sourceSha
    || reference.coordinate?.sourceSha !== sourceSha
    || reference.manifestDigest !== canonicalDigest(sourceManifestBytes)
    || canonicalDigest(readFileSync(candidateZip)) !== reference.coordinate?.artifactDigest
    || reference.artifactName !== contract.releaseCertification.candidate.artifactName.replace("<sourceSha>", sourceSha)
    || !Array.isArray(manifest.packages)
    || manifest.packages.map(({ name }) => name).join("\n") !== packageNames.join("\n")
  ) throw new Error("exact candidate certification identity changed");
  const fixtureCandidateDirectory = resolve(root, "candidate");
  const fixturePlaceholderDirectory = resolve(root, "placeholders");
  const workRoot = resolve(root, "derived-candidate");
  mkdirSync(fixtureCandidateDirectory);
  mkdirSync(fixturePlaceholderDirectory);
  mkdirSync(workRoot);
  copyFileSync(sourceManifestPath, resolve(fixtureCandidateDirectory, manifestName));
  for (const entry of manifest.packages) {
    copyFileSync(resolve(candidateDirectory, entry.file), resolve(fixtureCandidateDirectory, entry.file));
  }
  for (const entry of manifest.packages) {
    const path = resolve(fixtureCandidateDirectory, entry.file);
    const observed = metadata(path);
    if (
      observed.bytes !== entry.bytes
      || observed.integrity !== entry.integrity
      || `sha256:${observed.sha256}` !== entry.sha256
    ) throw new Error(`exact candidate package bytes changed: ${entry.name}`);
  }
  const placeholderPackages = Object.fromEntries(
    contract.npmRegistryBoundary.bootstrap.placeholderLedger.map((entry) => {
      const path = resolve(fixturePlaceholderDirectory, `${entry.name}-${entry.version}.tgz`);
      copyFileSync(resolve(placeholderDirectory, `${entry.name}-${entry.version}.tgz`), path);
      const observed = metadata(path);
      if (
        observed.bytes !== entry.bytes
        || observed.integrity !== entry.integrity
        || observed.sha256 !== entry.sha256
      ) throw new Error(`exact placeholder bytes changed: ${entry.name}`);
      return [entry.name, observed];
    }),
  );
  const contractPath = resolve(root, "effect-build-contract.json");
  copyFileSync(contractSource, contractPath);
  const tamperedScenarios = ["private-manifest", "duplicate-nonmanifest", "symlink-leaf"];
  const derivedCandidate = scenario.startsWith("publish-config-")
    || tamperedScenarios.includes(scenario)
    || scenario === "candidate-manifest-mismatch"
    || scenario === "candidate-tarball-mismatch";
  const tamperFirstPackage = (mutate) => {
    const entry = manifest.packages[0];
    const extractRoot = resolve(workRoot, entry.name);
    mkdirSync(extractRoot);
    run("tar", ["-xzf", resolve(fixtureCandidateDirectory, entry.file), "-C", extractRoot]);
    const packageRoot = resolve(extractRoot, "package");
    const embeddedPath = resolve(packageRoot, "package.json");
    const extraMembers = mutate({ embeddedPath, packageRoot }) ?? [];
    utimesSync(embeddedPath, fixedTime, fixedTime);
    utimesSync(packageRoot, fixedTime, fixedTime);
    run("tar", [
      "--format",
      "ustar",
      "-czf",
      resolve(fixtureCandidateDirectory, entry.file),
      "-C",
      extractRoot,
      "package",
      ...extraMembers,
    ], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    const observed = metadata(resolve(fixtureCandidateDirectory, entry.file));
    Object.assign(entry, {
      bytes: observed.bytes,
      integrity: observed.integrity,
      manifestDigest: canonicalDigest(readFileSync(embeddedPath)),
      sha256: `sha256:${observed.sha256}`,
    });
    writeFileSync(resolve(fixtureCandidateDirectory, manifestName), canonicalJson(manifest));
  };
  if (scenario.startsWith("publish-config-")) {
    tamperFirstPackage(({ embeddedPath }) => {
      const embedded = JSON.parse(readFileSync(embeddedPath, "utf8"));
      const publishConfig = candidatePublishConfig(scenario, manifest.packages[0].name);
      if (publishConfig === undefined) delete embedded.publishConfig;
      else embedded.publishConfig = publishConfig;
      writeFileSync(embeddedPath, `${JSON.stringify(embedded, null, 2)}\n`);
    });
  }
  if (scenario === "private-manifest") {
    tamperFirstPackage(({ embeddedPath }) => {
      const embedded = JSON.parse(readFileSync(embeddedPath, "utf8"));
      writeFileSync(embeddedPath, `${JSON.stringify({ name: embedded.name, private: true, ...embedded }, null, 2)}\n`);
    });
  }
  if (scenario === "symlink-leaf") {
    tamperFirstPackage(({ packageRoot }) => {
      symlinkSync("package.json", resolve(packageRoot, "manifest-link"));
    });
  }
  if (scenario === "duplicate-nonmanifest") {
    tamperFirstPackage(({ packageRoot }) => {
      writeFileSync(resolve(packageRoot, "duplicate.txt"), "duplicate archive member\n");
      return ["package/duplicate.txt"];
    });
  }
  const readinessCandidateManifestBytes = readFileSync(resolve(fixtureCandidateDirectory, manifestName));
  if (scenario === "candidate-manifest-mismatch") {
    writeFileSync(
      resolve(fixtureCandidateDirectory, manifestName),
      canonicalJson({ ...manifest, sourceSha: "2222222222222222222222222222222222222222" }),
    );
  }
  if (scenario === "candidate-tarball-mismatch") {
    appendFileSync(resolve(fixtureCandidateDirectory, manifest.packages[0].file), "candidate-tarball-mismatch");
  }
  const fixtureCandidateZip = derivedCandidate ? resolve(root, "candidate.zip") : candidateZip;
  if (derivedCandidate) {
    writeGithubArtifactZip({
      directory: fixtureCandidateDirectory,
      filenames: [manifestName, ...manifest.packages.map(({ file }) => file)],
      outputPath: fixtureCandidateZip,
    });
  }
  const candidateBytes = readFileSync(fixtureCandidateZip);
  const effectiveCandidateDirectory = derivedCandidate ? fixtureCandidateDirectory : candidateDirectory;
  const manifestBytes = readFileSync(resolve(effectiveCandidateDirectory, manifestName));
  const actualPackages = Object.fromEntries(manifest.packages.map((entry) => [
    entry.name,
    metadata(resolve(effectiveCandidateDirectory, entry.file)),
  ]));
  if (!derivedCandidate && canonicalDigest(candidateBytes) !== reference.coordinate.artifactDigest) {
    throw new Error("exact certification scenario did not preserve candidate artifact bytes");
  }
  const candidate = {
    artifactId: Number(reference.coordinate.artifactId),
    digest: canonicalDigest(candidateBytes),
    manifestDigest: canonicalDigest(manifestBytes),
    name: reference.artifactName,
    packages: actualPackages,
    path: fixtureCandidateZip,
    runAttempt: Number(reference.coordinate.runAttempt),
    runId: Number(reference.coordinate.runId),
    size: candidateBytes.byteLength,
    workflowPath: contract.releaseCertification.candidate.workflowPath,
  };
  const readiness = writeReadinessArtifact({
    candidate,
    candidateManifestBytes: readinessCandidateManifestBytes,
    contract,
    contractPath,
    registry: contract.npmRegistryBoundary,
    root,
    scenario,
  });
  const statePath = resolve(root, "state.json");
  createReleaseState({ candidate, contractPath, placeholderPackages, readiness, scenario, statePath });
  rmSync(workRoot, { force: true, recursive: true });
  return { statePath };
};

export const makeReleaseFixture = async ({ root, scenario }) => {
  const exact = makeExactCandidateFixture({ root, scenario });
  if (exact !== undefined) return exact;
  const candidateDirectory = resolve(root, "candidate");
  const placeholderDirectory = resolve(root, "placeholders");
  const workRoot = resolve(root, "package-roots");
  mkdirSync(candidateDirectory);
  mkdirSync(placeholderDirectory);
  mkdirSync(workRoot);

  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "tooling/effect-build-contract.json"), "utf8"));
  const registry = structuredClone(contract.npmRegistryBoundary);
  const placeholderPackages = {};
  for (const name of placeholderNames) {
    const archivePath = resolve(placeholderDirectory, `${name}-${placeholderVersion}.tgz`);
    placeholderPackages[name] = writeTarball({
      archivePath,
      name,
      publishConfig: undefined,
      version: placeholderVersion,
      workRoot,
    });
  }
  registry.bootstrap.placeholderLedger = registry.bootstrap.placeholderLedger.map((entry) => ({
    ...entry,
    bytes: placeholderPackages[entry.name].bytes,
    integrity: placeholderPackages[entry.name].integrity,
    sha256: placeholderPackages[entry.name].sha256,
  }));

  const candidatePackages = {};
  const packageEntries = [];
  for (const name of packageNames) {
    const filename = `${name}-${targetVersion}.tgz`;
    const archivePath = resolve(candidateDirectory, filename);
    const publishConfig = candidatePublishConfig(scenario, name);
    const entry = writeTarball({
      archivePath,
      archiveScenario: name === packageNames[0] && ["duplicate-nonmanifest", "symlink-leaf"].includes(scenario)
        ? scenario
        : undefined,
      name,
      privatePackage: scenario === "private-manifest" && name === packageNames[0],
      publishConfig,
      version: targetVersion,
      workRoot,
    });
    candidatePackages[name] = entry;
    packageEntries.push({
      bytes: entry.bytes,
      file: filename,
      integrity: entry.integrity,
      manifestDigest: canonicalDigest(
        readFileSync(resolve(workRoot, name, "package", "package.json")),
      ),
      name,
      sha256: `sha256:${entry.sha256}`,
    });
  }

  contract.npmRegistryBoundary = registry;
  const contractPath = resolve(root, "effect-build-contract.json");
  writeFileSync(contractPath, renderJson(contract));

  const modules = publicModules(contract.publicApiProjection.packages);
  const candidateManifest = {
    schema: contract.releaseCertification.candidate.protocol,
    sourceSha,
    version: targetVersion,
    contract: {
      digest: canonicalDigest(readFileSync(contractPath)),
      schema: contract.schema,
    },
    toolchain: {
      bun: { name: "bun", version: "1.3.14" },
      node: { name: "node", version: contract.releaseCertification.npmOidcCertification.client.node },
      npm: { name: "npm", version: contract.releaseCertification.npmOidcCertification.client.npm },
    },
    publicModules: modules,
    packages: packageEntries,
  };
  writeFileSync(resolve(candidateDirectory, "release-candidate.json"), canonicalJson(candidateManifest));
  const readinessCandidateManifestBytes = Buffer.from(canonicalJson(candidateManifest));
  if (scenario === "candidate-manifest-mismatch") {
    writeFileSync(
      resolve(candidateDirectory, "release-candidate.json"),
      canonicalJson({ ...candidateManifest, sourceSha: "2222222222222222222222222222222222222222" }),
    );
  }
  if (scenario === "candidate-tarball-mismatch") {
    appendFileSync(resolve(candidateDirectory, packageEntries[0].file), "candidate-tarball-mismatch");
  }

  const candidateZip = resolve(root, "candidate.zip");
  writeGithubArtifactZip({
    directory: candidateDirectory,
    filenames: ["release-candidate.json", ...packageEntries.map(({ file }) => file)],
    outputPath: candidateZip,
  });
  const candidateBytes = readFileSync(candidateZip);
  const candidate = {
    artifactId: 9001,
    digest: canonicalDigest(candidateBytes),
    manifestDigest: canonicalDigest(readFileSync(resolve(candidateDirectory, "release-candidate.json"))),
    name: `npm-release-candidate-${sourceSha}`,
    packages: candidatePackages,
    path: candidateZip,
    runAttempt: 1,
    runId: 7001,
    size: candidateBytes.byteLength,
    workflowPath: ".github/workflows/release.yml",
  };

  const readiness = writeReadinessArtifact({
    candidate,
    candidateManifestBytes: readinessCandidateManifestBytes,
    contract,
    contractPath,
    registry,
    root,
    scenario,
  });

  const statePath = resolve(root, "state.json");
  createReleaseState({
    candidate,
    contractPath,
    placeholderPackages,
    readiness,
    scenario,
    statePath,
  });
  rmSync(workRoot, { force: true, recursive: true });
  return { statePath };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root, scenario = "full-convergence"] = process.argv.slice(2);
  if (root === undefined) throw new Error("usage: make-candidate.mjs <new-root> [scenario]");
  const result = await makeReleaseFixture({ root, scenario });
  process.stdout.write(`${JSON.stringify({ statePath: basename(result.statePath) })}\n`);
}
