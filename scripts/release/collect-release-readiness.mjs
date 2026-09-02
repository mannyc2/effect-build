#!/usr/bin/env node

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";
import {
  artifactCoordinate,
  canonicalJson,
  derivePublicPackageNames,
  extractEmbeddedPackageManifest,
  sha256Digest,
  validateReleaseCandidate,
} from "./protocol.mjs";
import { createGitHubReadOnlyBoundary } from "./github-read-only-boundary.mjs";
import { createAnonymousNpmBoundary } from "./npm-read-only-boundary.mjs";
import { assertReadinessArtifactAllowed, buildReadinessAggregate } from "./readiness-protocol.mjs";
import { finalizeAfterTerminalObservation } from "./terminal-observation.mjs";
import { extractStrictFlatZip } from "./zip-protocol.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const canonicalTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is not a timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} is not a canonical UTC timestamp`);
  }
  return milliseconds;
};

const githubTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is absent`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} is invalid`);
  return { milliseconds, value: new Date(milliseconds).toISOString() };
};

const parseJson = (source, label) => {
  if (typeof source !== "string" || source.length === 0) throw new Error(`${label} is absent`);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not JSON`);
  }
};

export const parseDispatchEnvironment = (contract, environment) => {
  assertReadinessArtifactAllowed(contract);
  const policy = contract?.releaseCertification?.readiness;
  if (!isRecord(policy) || !isRecord(policy.dispatch) || !Array.isArray(policy.evidenceRoles)) {
    throw new Error("readiness dispatch policy is unavailable");
  }
  const sourceSha = environment[policy.dispatch.sourceInput.toUpperCase()];
  if (typeof sourceSha !== "string" || !/^[0-9a-f]{40}$/u.test(sourceSha)) {
    throw new Error("readiness source SHA is not exact");
  }
  const candidate = parseJson(
    environment[policy.dispatch.candidateInput.toUpperCase()],
    policy.dispatch.candidateInput,
  );
  const evidence = [];
  for (let index = 0; index < policy.evidenceRoles.length; index += 1) {
    const definition = policy.evidenceRoles[index];
    const dispatch = policy.dispatch.evidenceInputs[index];
    if (dispatch?.role !== definition.role) throw new Error("readiness dispatch role order changed");
    const input = environment[dispatch.input.toUpperCase()];
    evidence.push(parseJson(input, dispatch.input));
  }
  return { candidate, evidence, sourceSha };
};

export const createCollectorGitHubBoundary = (contract, token = process.env.GITHUB_TOKEN) =>
  createGitHubReadOnlyBoundary({
    repository: contract?.releaseCertification?.githubAuthority?.repository,
    token,
    transport: contract?.releaseCertification?.githubAuthority?.readOnlyTransport,
  });

export const anonymousNpmBoundary = createAnonymousNpmBoundary({
  registry: "https://registry.npmjs.org",
});

export const extractFlatZip = ({ zipBytes, expectedFiles, label, policy }) =>
  extractStrictFlatZip({ zipBytes, expectedFiles, label, policy });

export const candidateFromZip = ({ zipBytes, contract, contractBytes, sourceSha }) => {
  const directory = mkdtempSync(join(tmpdir(), "effect-build-readiness-candidate-"));
  try {
    const targetVersion = contract.npmRegistryBoundary.publicationAdmission.target.version;
    const listing = [
      contract.releaseCertification.candidate.manifest,
      ...derivePublicPackageNames(contract).map((name) => `${name}-${targetVersion}.tgz`),
    ];
    const files = extractFlatZip({
      zipBytes,
      expectedFiles: listing,
      label: "candidate artifact",
      policy: contract.releaseCertification.readiness.zipExtraction,
    });
    const manifestBytes = files.get(contract.releaseCertification.candidate.manifest);
    const candidate = parseJson(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes), "candidate manifest");
    if (canonicalJson(candidate) !== new TextDecoder().decode(manifestBytes)) {
      throw new Error("candidate manifest bytes are not canonical JSON");
    }
    const packageBytes = new Map();
    const packageManifests = new Map();
    for (const name of derivePublicPackageNames(contract)) {
      const filename = `${name}-${candidate.version}.tgz`;
      const tarballPath = resolve(directory, filename);
      const tarballBytes = files.get(filename);
      writeFileSync(tarballPath, tarballBytes, { mode: 0o600 });
      packageBytes.set(name, tarballBytes);
      packageManifests.set(
        name,
        extractEmbeddedPackageManifest(tarballPath, contract.releaseCertification.candidate.tarballInspection),
      );
    }
    validateReleaseCandidate({
      candidate,
      contract,
      contractBytes,
      expectedSourceSha: sourceSha,
      files: listing,
      packageBytes,
      packageManifests,
    });
    return { files: listing, manifest: candidate, manifestBytes, packageBytes, packageManifests };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

const candidateManifestFromZip = (arguments_) => candidateFromZip(arguments_).manifestBytes;

const exactRun = async ({ github, contract, definition, identity, sourceSha, observedAt }) => {
  const policy = contract.releaseCertification.readiness;
  const authority = contract.releaseCertification.githubAuthority;
  const branch = authority.branchPolicy.name;
  const run = await github.readJson(
    `repos/${contract.releaseCertification.githubAuthority.repository}/actions/runs/${identity.runId}/attempts/${identity.runAttempt}`,
  );
  if (
    !isRecord(run)
    || run.id !== Number(identity.runId)
    || run.run_attempt !== Number(identity.runAttempt)
    || run.path !== definition.workflowPath
    || run.head_sha !== sourceSha
    || run.head_branch !== branch
    || run.event !== definition.event
    || run.status !== policy.githubAuthentication.runStatus
    || run.conclusion !== policy.githubAuthentication.runConclusion
    || run.repository?.id !== Number(authority.repositoryId)
    || run.head_repository?.id !== Number(authority.repositoryId)
  ) throw new Error(`GitHub run metadata changed for ${definition.role ?? "candidate"}`);
  const createdAt = githubTimestamp(run.created_at, "GitHub run created_at");
  const updatedAt = githubTimestamp(run.updated_at, "GitHub run updated_at");
  const observed = canonicalTimestamp(observedAt, "readiness observedAt");
  if (
    createdAt.milliseconds > updatedAt.milliseconds
    || updatedAt.milliseconds > observed + policy.clockSkewSeconds * 1_000
    || observed - updatedAt.milliseconds > definition.maximumAgeSeconds * 1_000
  ) throw new Error(`GitHub run is future or stale for ${definition.role ?? "candidate"}`);
  return { run, createdAt: createdAt.value, updatedAt: updatedAt.value };
};

const artifactBytes = async ({ github, contract, definition, reference, sourceSha, observedAt }) => {
  const release = contract.releaseCertification;
  const coordinate = artifactCoordinate(release, reference.coordinate, definition.workflow);
  const run = await exactRun({ github, contract, definition, identity: coordinate, sourceSha, observedAt });
  const endpoint = `repos/${release.githubAuthority.repository}/actions/artifacts/${coordinate.artifactId}`;
  const artifact = await github.readJson(endpoint);
  const createdAt = githubTimestamp(artifact?.created_at, "GitHub artifact created_at");
  const expiresAt = githubTimestamp(artifact?.expires_at, "GitHub artifact expires_at");
  if (
    !isRecord(artifact)
    || artifact.id !== Number(coordinate.artifactId)
    || artifact.name !== reference.artifactName
    || artifact.digest !== coordinate.artifactDigest
    || artifact.expired !== release.readiness.githubAuthentication.artifactExpired
    || artifact.workflow_run?.id !== Number(coordinate.runId)
    || artifact.workflow_run?.head_sha !== sourceSha
    || artifact.workflow_run?.head_branch !== release.githubAuthority.branchPolicy.name
    || artifact.workflow_run?.repository_id !== Number(release.githubAuthority.repositoryId)
    || artifact.workflow_run?.head_repository_id !== Number(release.githubAuthority.repositoryId)
    || createdAt.milliseconds > canonicalTimestamp(observedAt, "readiness observedAt")
    || canonicalTimestamp(observedAt, "readiness observedAt") - createdAt.milliseconds
      > definition.maximumAgeSeconds * 1_000
    || canonicalTimestamp(reference.observedAt, `${definition.role ?? "candidate"}.observedAt`)
      < Math.max(createdAt.milliseconds, Date.parse(run.updatedAt))
    || canonicalTimestamp(reference.expiresAt, `${definition.role ?? "candidate"}.expiresAt`)
      > expiresAt.milliseconds
  ) throw new Error(`GitHub artifact metadata changed for ${definition.role ?? "candidate"}`);
  const bytes = await github.readArtifactZip(
    `${endpoint}/zip`,
    release.readiness.zipExtraction.maximumArchiveBytes,
  );
  if (sha256Digest(bytes) !== coordinate.artifactDigest) {
    throw new Error(`downloaded GitHub artifact bytes changed for ${definition.role ?? "candidate"}`);
  }
  return bytes;
};

const runObservationBytes = ({ contract, definition, reference, run }) => {
  const values = {
    schema: definition.protocol,
    workflow: definition.workflow,
    sourceSha: reference.sourceSha,
    runId: reference.runId,
    runAttempt: reference.runAttempt,
    event: run.run.event,
    headBranch: run.run.head_branch,
    status: run.run.status,
    conclusion: run.run.conclusion,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
  return Buffer.from(canonicalJson(Object.fromEntries(
    contract.releaseCertification.readiness.githubRunObservation.fields.map((field) => [field, values[field]]),
  )));
};

const currentMain = async ({ github, contract, sourceSha }) => {
  const authority = contract.releaseCertification.githubAuthority;
  const value = await github.readJson(`repos/${authority.repository}/git/ref/heads/${authority.branchPolicy.name}`);
  if (
    value?.ref !== `refs/heads/${authority.branchPolicy.name}`
    || value?.object?.type !== "commit"
    || value?.object?.sha !== sourceSha
  ) throw new Error("authenticated GitHub current main differs from readiness source");
  return sourceSha;
};

const normalizedRepository = (value) => {
  const repository = typeof value === "string" ? { type: "git", url: value } : value;
  return {
    type: repository?.type,
    url: repository?.url,
  };
};

export const collectDirectObservation = async ({
  contract,
  sourceSha,
  observedAt,
  github,
  npm,
  workflowBytes,
}) => {
  const release = contract.releaseCertification;
  const policy = release.readiness.directObservation;
  const authority = release.githubAuthority;
  const registry = contract.npmRegistryBoundary;
  const repository = await github.readJson(`repos/${authority.repository}`);
  const environmentResponse = await github.readJson(
    `repos/${authority.repository}/environments/${encodeURIComponent(authority.environment)}`,
  );
  const oidcSubjectPolicy = await github.readJson(`repos/${authority.repository}/actions/oidc/customization/sub`);
  const branchPolicies = await github.readJson(
    `repos/${authority.repository}/environments/${encodeURIComponent(authority.environment)}`
      + "/deployment-branch-policies?per_page=100&page=1",
  );
  const workflowResponse = await github.readJson(
    `repos/${authority.repository}/contents/${release.readiness.workflowPath}?ref=${sourceSha}`,
  );
  const remoteWorkflowBytes = workflowResponse?.encoding === "base64" && typeof workflowResponse?.content === "string"
    ? Buffer.from(workflowResponse.content.replaceAll("\n", ""), "base64")
    : undefined;
  if (
    repository?.full_name !== authority.repository
    || `${repository?.id}` !== authority.repositoryId
    || `${repository?.owner?.id}` !== authority.repositoryOwnerId
    || repository?.visibility !== authority.repositoryVisibility
    || environmentResponse?.name !== authority.environment
    || !Array.isArray(environmentResponse?.protection_rules)
    || branchPolicies?.total_count !== 1
    || !Array.isArray(branchPolicies?.branch_policies)
    || branchPolicies.branch_policies.length !== 1
    || branchPolicies.branch_policies[0]?.name !== authority.branchPolicy.name
    || branchPolicies.branch_policies[0]?.type !== authority.branchPolicy.type
    || workflowResponse?.path !== release.readiness.workflowPath
    || workflowResponse?.type !== "file"
    || !(remoteWorkflowBytes instanceof Buffer)
    || !remoteWorkflowBytes.equals(workflowBytes)
  ) throw new Error("authenticated GitHub repository, environment, or workflow bytes changed");
  const requiredReviewers = environmentResponse.protection_rules.filter(({ type }) => type === "required_reviewers");
  const branchRules = environmentResponse.protection_rules.filter(({ type }) => type === "branch_policy");
  const observedProtectionRuleTypes = environmentResponse.protection_rules.map(({ type }) => type).sort();
  const observedReviewer = requiredReviewers[0]?.reviewers?.[0];
  if (
    requiredReviewers.length !== 1
    || branchRules.length !== 1
    || JSON.stringify(observedProtectionRuleTypes)
      !== JSON.stringify([...authority.branchPolicy.exactProtectionRuleTypes].sort())
    || requiredReviewers[0]?.reviewers?.length !== 1
    || observedReviewer?.type !== authority.reviewer.type
    || observedReviewer?.reviewer?.id !== authority.reviewer.id
    || observedReviewer?.reviewer?.login !== authority.reviewer.login
    || requiredReviewers[0]?.prevent_self_review !== authority.reviewer.preventSelfReview
  ) throw new Error("authenticated GitHub environment protection rules changed");
  const packageNames = [
    ...derivePublicPackageNames(contract),
    ...[...registry.reservation.packages].sort(),
  ];
  const expectedDistTags = new Map(
    registry.publicationAdmission.target.expectedDistTagsBeforePublication.map((entry) => [entry.name, entry.tags]),
  );
  const placeholderLedger = new Map(registry.bootstrap.placeholderLedger.map((entry) => [entry.name, entry]));
  const packages = [];
  for (const name of packageNames) {
    const packumentUrl = `${registry.registry}/${encodeURIComponent(name)}`;
    const packument = await npm.readJson(packumentUrl);
    const versions = Object.keys(packument?.versions ?? {}).sort();
    const distTags = Object.fromEntries(Object.entries(packument?.["dist-tags"] ?? {}).sort(([left], [right]) =>
      left.localeCompare(right)
    ));
    const latest = expectedDistTags.get(name)?.latest ?? placeholderLedger.get(name)?.bootstrapTags.latest;
    const versionManifest = packument?.versions?.[latest];
    const entry = {
      name,
      versions,
      distTags,
      repository: normalizedRepository(versionManifest?.repository ?? packument?.repository),
      placeholder: null,
    };
    const ledger = placeholderLedger.get(name);
    if (ledger !== undefined) {
      const tarballUrl = `${registry.registry}/${name}/-/${name}-${ledger.version}.tgz`;
      if (versionManifest?.dist?.tarball !== tarballUrl || versionManifest?.dist?.integrity !== ledger.integrity) {
        throw new Error(`anonymous npm placeholder metadata changed for ${name}`);
      }
      const downloaded = await npm.readTarball(tarballUrl, ledger.bytes);
      entry.placeholder = {
        version: ledger.version,
        bytes: downloaded.byteLength,
        sha256: sha256Digest(downloaded),
        integrity: versionManifest.dist.integrity,
        tarballUrl,
      };
    }
    packages.push(entry);
  }
  const observation = {
    schema: policy.protocol,
    sourceSha,
    observedAt,
    github: {
      repository: authority.repository,
      repositoryId: authority.repositoryId,
      repositoryOwnerId: authority.repositoryOwnerId,
      visibility: authority.repositoryVisibility,
      environment: {
        name: authority.environment,
        protectionRuleTypes: observedProtectionRuleTypes,
        reviewer: {
          id: authority.reviewer.id,
          login: authority.reviewer.login,
          type: authority.reviewer.type,
        },
        preventSelfReview: authority.reviewer.preventSelfReview,
      },
      deploymentBranchPolicy: {
        customBranchPolicies: environmentResponse.deployment_branch_policy?.custom_branch_policies,
        protectedBranches: environmentResponse.deployment_branch_policy?.protected_branches,
      },
      deploymentBranchPolicies: [{
        name: branchPolicies.branch_policies[0].name,
        type: branchPolicies.branch_policies[0].type,
      }],
      oidcSubjectPolicy,
      workflowPath: release.readiness.workflowPath,
      workflowDigest: sha256Digest(remoteWorkflowBytes),
      currentMain: await currentMain({ github, contract, sourceSha }),
    },
    npm: {
      registry: registry.registry,
      targetVersion: registry.publicationAdmission.target.version,
      packages,
    },
  };
  return observation;
};

const collectAllowedReadinessAggregate = async ({
  contract,
  contractBytes,
  sourceSha,
  observedAt,
  candidate,
  evidence,
  github,
  npm,
}) => {
  const release = contract.releaseCertification;
  const policy = release.readiness;
  canonicalTimestamp(observedAt, "readiness observedAt");
  await currentMain({ github, contract, sourceSha });
  const workflowBytes = readFileSync(resolve(repositoryRoot, policy.workflowPath));
  const directObservation = await collectDirectObservation({
    contract,
    sourceSha,
    observedAt,
    github,
    npm,
    workflowBytes,
  });

  const candidateDefinition = {
    ...policy.candidate,
    event: release.candidate.event,
    role: "candidate",
    workflow: release.candidate.workflow,
    workflowPath: release.candidate.workflowPath,
  };
  exactKeys(candidate, policy.referenceShapes.candidate, "readiness candidate reference");
  const candidateZip = await artifactBytes({
    github,
    contract,
    definition: candidateDefinition,
    reference: candidate,
    sourceSha,
    observedAt,
  });
  const candidateBytes = candidateManifestFromZip({ zipBytes: candidateZip, contract, contractBytes, sourceSha });

  if (!Array.isArray(evidence) || evidence.length !== policy.evidenceRoles.length) {
    throw new Error("readiness dispatch omitted an evidence role");
  }
  const evidenceBytes = new Map();
  const artifactFiles = new Map();
  const resolvedEvidence = [];
  for (let index = 0; index < policy.evidenceRoles.length; index += 1) {
    const definition = policy.evidenceRoles[index];
    const reference = exactKeys(
      evidence[index],
      policy.referenceShapes[definition.type],
      `readiness ${definition.role} reference`,
    );
    resolvedEvidence.push(reference);
    if (
      reference.role !== definition.role
      || reference.type !== definition.type
      || reference.protocol !== definition.protocol
      || reference.terminal !== definition.terminal
    ) throw new Error(`readiness ${definition.role} reference identity changed`);
    if (definition.type === "githubArtifact") {
      const zipBytes = await artifactBytes({
        github,
        contract,
        definition,
        reference,
        sourceSha,
        observedAt,
      });
      evidenceBytes.set(definition.role, zipBytes);
      const expectedFiles = definition.role === "fake-registry"
        ? release.fakeRegistry.exactProtectedBodyCertification.orderedFiles
        : definition.role === "npm-oidc-certification"
        ? release.npmOidcCertification.evidence.orderedFiles
        : undefined;
      artifactFiles.set(definition.role, extractFlatZip({
        zipBytes,
        expectedFiles,
        label: `readiness ${definition.role}`,
        policy: policy.zipExtraction,
      }));
    } else if (definition.type === "githubRun") {
      if (
        reference.workflow !== definition.workflow
        || reference.sourceSha !== sourceSha
        || !/^[1-9][0-9]*$/u.test(reference.runId)
        || !/^[1-9][0-9]*$/u.test(reference.runAttempt)
      ) throw new Error(`readiness ${definition.role} run coordinate is not exact`);
      const run = await exactRun({
        github,
        contract,
        definition,
        identity: reference,
        sourceSha,
        observedAt,
      });
      evidenceBytes.set(definition.role, runObservationBytes({ contract, definition, reference, run }));
    } else {
      throw new Error(`unsupported readiness evidence role: ${definition.role}`);
    }
  }
  await currentMain({ github, contract, sourceSha });
  return await finalizeAfterTerminalObservation({
    validate: async () => await buildReadinessAggregate({
      contract,
      contractBytes,
      sourceSha,
      observedAt,
      directObservation,
      candidate,
      candidateBytes,
      evidence: resolvedEvidence,
      evidenceBytes,
      artifactFiles,
    }),
    observe: async () => await currentMain({ github, contract, sourceSha }),
  });
};

export const collectReadinessAggregate = (arguments_) => {
  assertReadinessArtifactAllowed(arguments_?.contract);
  return collectAllowedReadinessAggregate(arguments_);
};

const parseArguments = (args) => {
  if (args.length !== 4 || args[0] !== "--observed-at" || args[2] !== "--output") {
    throw new Error("usage: collect-release-readiness --observed-at <timestamp> --output <empty-directory>");
  }
  return { observedAt: args[1], output: resolve(args[3]) };
};

const loadContract = async () => {
  const source = readFileSync(contractPath, "utf8");
  const inputs = await readInputs(repositoryRoot);
  const generated = validateContract(buildContract(inputs), inputs);
  if (source !== renderJson(generated)) throw new Error("readiness contract is not the exact generated contract");
  return { contract: generated, contractBytes: Buffer.from(source) };
};

const main = async () => {
  const { observedAt, output } = parseArguments(process.argv.slice(2));
  const { contract, contractBytes } = await loadContract();
  assertReadinessArtifactAllowed(contract);
  const input = parseDispatchEnvironment(contract, process.env);
  const github = createCollectorGitHubBoundary(contract);
  delete process.env.GITHUB_TOKEN;
  if (readdirSync(output).length !== 0) throw new Error("readiness output directory must be empty");
  const policy = contract.releaseCertification.readiness;
  const aggregate = await collectReadinessAggregate({
    contract,
    contractBytes,
    sourceSha: input.sourceSha,
    observedAt,
    candidate: input.candidate,
    evidence: input.evidence,
    github,
    npm: anonymousNpmBoundary,
  });
  writeFileSync(resolve(output, policy.manifest), aggregate.manifestBytes, { mode: 0o600 });
  writeFileSync(resolve(output, policy.evidenceBundle), aggregate.bundleBytes, { mode: 0o600 });
  if (typeof process.env.GITHUB_OUTPUT === "string") {
    writeFileSync(process.env.GITHUB_OUTPUT, [
      `artifact-name=${policy.artifactName}`,
      `retention-days=${policy.retentionDays}`,
      `repository-id=${contract.releaseCertification.githubAuthority.repositoryId}`,
      `workflow=${policy.workflow}`,
      `workflow-path=${policy.workflowPath}`,
      "",
    ].join("\n"), { flag: "a" });
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("release readiness collection failed closed\n");
    process.exitCode = 1;
  });
}
