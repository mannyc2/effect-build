#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";
import { candidateFromZip } from "./collect-release-readiness.mjs";
import { createGitHubReadOnlyBoundary } from "./github-read-only-boundary.mjs";
import {
  artifactCoordinate,
  canonicalJson,
  sha256Digest,
} from "./protocol.mjs";
import {
  validateGithubArtifactEvidence,
  validateReadinessAggregate,
} from "./readiness-protocol.mjs";
import { extractStrictFlatZip } from "./zip-protocol.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");

const isRecord = (value) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactKeys = (value, expected, label) => {
  if (
    !isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} is not one full lowercase Git SHA`);
  }
  return value;
};

const positiveDecimal = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} is not one canonical positive decimal string`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} exceeds the safe integer range`);
  return { number, value };
};

const canonicalDigest = (value, contract, label) => {
  const pattern = contract?.releaseCertification?.githubArtifactDigest?.canonicalPattern;
  if (typeof value !== "string" || typeof pattern !== "string" || !new RegExp(pattern, "u").test(value)) {
    throw new Error(`${label} is not canonical sha256:<64 lowercase hex>`);
  }
  return value;
};

const canonicalTimestamp = (value, label) => {
  const text = value instanceof Date ? value.toISOString() : value;
  if (
    typeof text !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text)
  ) throw new Error(`${label} is not a canonical UTC timestamp`);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${label} is not a real canonical UTC timestamp`);
  }
  return { milliseconds, value: text };
};

const githubTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is absent`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} is invalid`);
  return { milliseconds, value: new Date(milliseconds).toISOString() };
};

const decodeCanonicalJson = (bytes, label) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error(`${label} is empty or not bytes`);
  }
  let text;
  let value;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not canonical UTF-8 JSON`);
  }
  if (text !== canonicalJson(value)) throw new Error(`${label} is not canonical JSON`);
  return value;
};

const readinessPolicy = (contract) => {
  const release = contract?.releaseCertification;
  const policy = release?.readiness;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(release)
    || !isRecord(policy)
    || !Array.isArray(policy.evidenceRoles)
    || !isRecord(policy.referenceShapes)
  ) throw new Error("terminal references require the canonical release-readiness contract");
  return { policy, release };
};

const findRole = (policy, role) => {
  const matches = policy.evidenceRoles.filter((entry) => entry?.role === role);
  if (matches.length !== 1) throw new Error(`terminal reference role is unavailable: ${role}`);
  return matches[0];
};

const definitionForKind = (contract, kind) => {
  const { policy, release } = readinessPolicy(contract);
  if (kind === "candidate") {
    return {
      artifactName: release.candidate.artifactName,
      event: release.candidate.event,
      kind,
      maximumAgeSeconds: policy.candidate.maximumAgeSeconds,
      maximumValiditySeconds: policy.candidate.maximumValiditySeconds,
      protocol: release.candidate.protocol,
      type: "candidate",
      workflow: release.candidate.workflow,
      workflowPath: release.candidate.workflowPath,
    };
  }
  if (kind === "readiness") {
    const freshness = release.finalPublicVerification?.freshness;
    if (!Number.isSafeInteger(freshness?.maximumObservationAgeSeconds)) {
      throw new Error("final-public readiness freshness is unavailable");
    }
    return {
      artifactName: policy.artifactName,
      event: policy.event,
      kind,
      maximumAgeSeconds: freshness.maximumObservationAgeSeconds,
      maximumValiditySeconds: freshness.maximumObservationAgeSeconds,
      protocol: policy.protocol,
      type: "readiness",
      workflow: policy.workflow,
      workflowPath: policy.workflowPath,
    };
  }
  const role = findRole(policy, kind);
  return { ...role, kind };
};

const validateDefinition = (definition) => {
  if (
    !isRecord(definition)
    || typeof definition.workflow !== "string"
    || typeof definition.workflowPath !== "string"
    || !["push", "workflow_dispatch"].includes(definition.event)
    || !Number.isSafeInteger(definition.maximumAgeSeconds)
    || definition.maximumAgeSeconds <= 0
    || !Number.isSafeInteger(definition.maximumValiditySeconds)
    || definition.maximumValiditySeconds < definition.maximumAgeSeconds
  ) throw new Error("terminal reference kind has no exact workflow or freshness policy");
  if (
    definition.type !== "githubRun"
    && (typeof definition.artifactName !== "string" || definition.artifactName.length === 0)
  ) throw new Error("terminal artifact reference has no exact artifact name");
  return definition;
};

const expectedArtifactName = (definition, sourceSha) => definition.kind === "candidate"
  ? definition.artifactName.replace("<sourceSha>", sourceSha)
  : definition.artifactName;

const currentMain = async ({ github, contract, sourceSha }) => {
  const authority = contract.releaseCertification.githubAuthority;
  const branch = authority.branchPolicy.name;
  const main = await github.readJson(`repos/${authority.repository}/git/ref/heads/${branch}`);
  if (
    !isRecord(main)
    || main.ref !== `refs/heads/${branch}`
    || main.object?.type !== "commit"
    || main.object?.sha !== sourceSha
  ) throw new Error("authenticated current main differs from terminal reference source");
  return main;
};

const terminalRun = async ({ github, contract, definition, sourceSha, runId, runAttempt }) => {
  const release = contract.releaseCertification;
  const authority = release.githubAuthority;
  const run = await github.readJson(
    `repos/${authority.repository}/actions/runs/${runId.value}/attempts/${runAttempt.value}`,
  );
  if (
    !isRecord(run)
    || run.id !== runId.number
    || run.run_attempt !== runAttempt.number
    || run.path !== definition.workflowPath
    || run.head_sha !== sourceSha
    || run.head_branch !== authority.branchPolicy.name
    || run.event !== definition.event
    || run.status !== release.readiness.githubAuthentication.runStatus
    || run.conclusion !== release.readiness.githubAuthentication.runConclusion
    || run.repository?.id !== Number(authority.repositoryId)
    || run.repository?.full_name !== authority.repository
    || run.head_repository?.id !== Number(authority.repositoryId)
    || run.head_repository?.full_name !== authority.repository
  ) throw new Error("GitHub run is not the exact terminal successful workflow attempt");
  const createdAt = githubTimestamp(run.created_at, "GitHub run created_at");
  const updatedAt = githubTimestamp(run.updated_at, "GitHub run updated_at");
  if (createdAt.milliseconds > updatedAt.milliseconds) {
    throw new Error("GitHub run timestamps are out of order");
  }
  return { createdAt, run, updatedAt };
};

const artifactMetadataAndBytes = async ({
  github,
  contract,
  definition,
  sourceSha,
  runId,
  artifactId,
  artifactDigest,
}) => {
  const release = contract.releaseCertification;
  const authority = release.githubAuthority;
  const artifactName = expectedArtifactName(definition, sourceSha);
  const endpoint = `repos/${authority.repository}/actions/artifacts/${artifactId.value}`;
  const artifact = await github.readJson(endpoint);
  if (
    !isRecord(artifact)
    || artifact.id !== artifactId.number
    || artifact.name !== artifactName
    || artifact.digest !== artifactDigest
    || artifact.expired !== release.readiness.githubAuthentication.artifactExpired
    || artifact.archive_download_url
      !== `${authority.readOnlyTransport.apiOrigin}/repos/${authority.repository}/actions/artifacts/${artifactId.value}/zip`
    || artifact.workflow_run?.id !== runId.number
    || artifact.workflow_run?.head_sha !== sourceSha
    || artifact.workflow_run?.head_branch !== authority.branchPolicy.name
    || artifact.workflow_run?.repository_id !== Number(authority.repositoryId)
    || artifact.workflow_run?.head_repository_id !== Number(authority.repositoryId)
  ) throw new Error("GitHub artifact metadata is not the exact retained workflow artifact");
  const createdAt = githubTimestamp(artifact.created_at, "GitHub artifact created_at");
  const expiresAt = githubTimestamp(artifact.expires_at, "GitHub artifact expires_at");
  if (createdAt.milliseconds >= expiresAt.milliseconds) {
    throw new Error("GitHub artifact timestamps are out of order");
  }
  const bytes = await github.readArtifactZip(
    `${endpoint}/zip`,
    release.readiness.zipExtraction.maximumArchiveBytes,
  );
  if (!(bytes instanceof Uint8Array) || sha256Digest(bytes) !== artifactDigest) {
    throw new Error("downloaded GitHub artifact ZIP digest changed");
  }
  return { artifact, artifactName, bytes: Buffer.from(bytes), createdAt, expiresAt };
};

const artifactFiles = ({ contract, definition, bytes }) => {
  const release = contract.releaseCertification;
  const expectedFiles = definition.kind === "readiness"
    ? release.readiness.orderedFiles
    : definition.kind === "fake-registry"
    ? release.fakeRegistry.exactProtectedBodyCertification.orderedFiles
    : definition.kind === "npm-oidc-certification"
    ? release.npmOidcCertification.evidence.orderedFiles
    : undefined;
  if (expectedFiles === undefined) throw new Error(`no exact artifact file set exists for ${definition.kind}`);
  return extractStrictFlatZip({
    zipBytes: bytes,
    expectedFiles,
    label: `${definition.kind} terminal artifact`,
    policy: release.readiness.zipExtraction,
  });
};

const receiptEvidenceObservedAt = ({ contract, definition, files }) => {
  const release = contract.releaseCertification;
  if (definition.kind === "fake-registry") {
    const policy = release.fakeRegistry.exactProtectedBodyCertification;
    const receipt = exactKeys(
      decodeCanonicalJson(files.get(policy.orderedFiles[0]), "fake-registry retained receipt"),
      policy.receiptFields,
      "fake-registry retained receipt",
    );
    if (
      receipt.schema !== definition.protocol
      || receipt.sourceSha === undefined
      || receipt.workflow !== definition.workflow
      || receipt.terminal !== definition.terminal
    ) throw new Error("fake-registry retained receipt identity changed");
    canonicalTimestamp(receipt.observedAt, "fake-registry retained receipt observedAt");
    return { candidateCoordinate: receipt.candidate, receipt, value: receipt.observedAt };
  }
  if (definition.kind === "npm-oidc-certification") {
    const policy = release.npmOidcCertification.evidence;
    const claims = exactKeys(
      decodeCanonicalJson(files.get(policy.orderedFiles[0]), "npm OIDC claims retained receipt"),
      policy.receiptSchemas.githubOidcClaims,
      "npm OIDC claims retained receipt",
    );
    const npm = exactKeys(
      decodeCanonicalJson(files.get(policy.orderedFiles[1]), "npm OIDC exchange retained receipt"),
      policy.receiptSchemas.npmOidcExchangeAccepted,
      "npm OIDC exchange retained receipt",
    );
    if (
      claims.schema !== policy.protocols.githubOidcClaims
      || npm.schema !== policy.protocols.npmOidcExchangeAccepted
      || claims.sourceSha !== npm.sourceSha
    ) throw new Error("npm OIDC retained receipt identity changed");
    canonicalTimestamp(npm.observedAt, "npm OIDC exchange retained receipt observedAt");
    return { candidateCoordinate: claims.candidate, claims, npm, value: npm.observedAt };
  }
  throw new Error(`no retained evidence receipt exists for ${definition.kind}`);
};

const expiration = ({ observedAt, maximumValiditySeconds, artifactExpiresAt }) => {
  const bounded = Math.min(
    observedAt.milliseconds + maximumValiditySeconds * 1_000,
    artifactExpiresAt?.milliseconds ?? Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(bounded) || bounded <= observedAt.milliseconds) {
    throw new Error("terminal reference has no positive retained validity window");
  }
  return new Date(bounded).toISOString();
};

const runObservationBytes = ({ contract, definition, sourceSha, runId, runAttempt, run }) => {
  const values = {
    schema: definition.protocol,
    workflow: definition.workflow,
    sourceSha,
    runId: runId.value,
    runAttempt: runAttempt.value,
    event: run.run.event,
    headBranch: run.run.head_branch,
    status: run.run.status,
    conclusion: run.run.conclusion,
    createdAt: run.createdAt.value,
    updatedAt: run.updatedAt.value,
  };
  return Buffer.from(canonicalJson(Object.fromEntries(
    contract.releaseCertification.readiness.githubRunObservation.fields
      .map((field) => [field, values[field]]),
  )));
};

const artifactExtractor = ({ contract, definition, payload }) => artifactFiles({
  contract,
  definition: { ...definition, kind: definition.role },
  bytes: payload,
});

export const buildTerminalReference = async ({
  contract,
  contractBytes,
  kind,
  sourceSha: sourceShaInput,
  runId: runIdInput,
  runAttempt: runAttemptInput,
  artifactId: artifactIdInput,
  artifactDigest: artifactDigestInput,
  github,
  now = () => new Date(),
  candidateExtractor = candidateFromZip,
  artifactEvidenceValidator = validateGithubArtifactEvidence,
  readinessValidator = validateReadinessAggregate,
}) => {
  const definition = validateDefinition(definitionForKind(contract, kind));
  const sourceSha = fullSha(sourceShaInput, "terminal reference source SHA");
  const runId = positiveDecimal(runIdInput, "terminal reference run ID");
  const runAttempt = positiveDecimal(runAttemptInput, "terminal reference run attempt");
  const isRun = definition.type === "githubRun";
  if (
    github === null
    || typeof github !== "object"
    || typeof github.readJson !== "function"
    || (!isRun && typeof github.readArtifactZip !== "function")
  ) throw new Error("terminal reference GitHub read-only boundary is incomplete");
  if (!(contractBytes instanceof Uint8Array) || contractBytes.byteLength === 0) {
    throw new Error("terminal reference contract bytes are absent");
  }
  if (isRun && (artifactIdInput !== undefined || artifactDigestInput !== undefined)) {
    throw new Error("GitHub run references forbid artifact coordinates");
  }
  const artifactId = isRun ? undefined : positiveDecimal(artifactIdInput, "terminal reference artifact ID");
  const artifactDigest = isRun
    ? undefined
    : canonicalDigest(artifactDigestInput, contract, "terminal reference artifact digest");

  await currentMain({ github, contract, sourceSha });
  const run = await terminalRun({ github, contract, definition, sourceSha, runId, runAttempt });
  const artifact = isRun
    ? undefined
    : await artifactMetadataAndBytes({
      github,
      contract,
      definition,
      sourceSha,
      runId,
      artifactId,
      artifactDigest,
    });

  let files;
  let evidence;
  let candidate;
  if (definition.kind === "candidate") {
    candidate = candidateExtractor({
      zipBytes: artifact.bytes,
      contract,
      contractBytes,
      sourceSha,
    });
    if (!(candidate?.manifestBytes instanceof Uint8Array) || candidate.manifestBytes.byteLength === 0) {
      throw new Error("candidate artifact has no exact canonical manifest bytes");
    }
  } else if (!isRun) {
    files = artifactFiles({ contract, definition, bytes: artifact.bytes });
    if (definition.kind === "readiness") {
      const manifest = exactKeys(
        decodeCanonicalJson(files.get(contract.releaseCertification.readiness.manifest), "readiness manifest"),
        [
          "schema",
          "sourceSha",
          "observedAt",
          "contract",
          "toolchain",
          "directObservation",
          "candidate",
          "evidence",
          "bundle",
        ],
        "readiness manifest",
      );
      if (manifest.schema !== definition.protocol || manifest.sourceSha !== sourceSha) {
        throw new Error("readiness manifest identity changed");
      }
    } else {
      evidence = receiptEvidenceObservedAt({ contract, definition, files });
      if (definition.kind === "fake-registry" && evidence.receipt.sourceSha !== sourceSha) {
        throw new Error("fake-registry retained receipt source changed");
      }
      if (
        definition.kind === "npm-oidc-certification"
        && (evidence.claims.sourceSha !== sourceSha || evidence.npm.sourceSha !== sourceSha)
      ) throw new Error("npm OIDC retained receipt source changed");
    }
  }

  await currentMain({ github, contract, sourceSha });
  const observedAt = canonicalTimestamp(now(), "terminal reference observation time");
  const artifactCreatedAt = artifact?.createdAt.milliseconds ?? Number.NEGATIVE_INFINITY;
  if (
    observedAt.milliseconds < Math.max(run.updatedAt.milliseconds, artifactCreatedAt)
    || observedAt.milliseconds - run.updatedAt.milliseconds > definition.maximumAgeSeconds * 1_000
    || (artifact !== undefined && observedAt.milliseconds >= artifact.expiresAt.milliseconds)
  ) throw new Error("terminal reference observation is before completion, stale, or after artifact expiry");
  if (evidence !== undefined) {
    const evidenceAt = canonicalTimestamp(evidence.value, `${definition.kind} evidence observation time`);
    if (
      evidenceAt.milliseconds > observedAt.milliseconds
      || observedAt.milliseconds - evidenceAt.milliseconds > definition.maximumAgeSeconds * 1_000
    ) throw new Error(`${definition.kind} retained receipt is future or stale`);
  }
  const expiresAt = expiration({
    observedAt,
    maximumValiditySeconds: definition.maximumValiditySeconds,
    artifactExpiresAt: artifact?.expiresAt,
  });

  if (definition.kind === "candidate") {
    const reference = {
      protocol: definition.protocol,
      coordinate: artifactCoordinate(contract.releaseCertification, {
        workflow: definition.workflow,
        sourceSha,
        runId: runId.value,
        runAttempt: runAttempt.value,
        artifactId: artifactId.value,
        artifactDigest,
      }, definition.workflow),
      artifactName: artifact.artifactName,
      manifestDigest: sha256Digest(candidate.manifestBytes),
      observedAt: observedAt.value,
      expiresAt,
      bytes: `${candidate.manifestBytes.byteLength}`,
    };
    return exactKeys(reference, contract.releaseCertification.readiness.referenceShapes.candidate, "candidate reference");
  }

  if (definition.kind === "readiness") {
    const policy = contract.releaseCertification.readiness;
    const manifestBytes = files.get(policy.manifest);
    await readinessValidator({
      contract,
      contractBytes,
      expectedSourceSha: sourceSha,
      validationTime: observedAt.value,
      files: policy.orderedFiles,
      manifestBytes,
      bundleBytes: files.get(policy.evidenceBundle),
      artifactExtractor,
    });
    const reference = {
      protocol: definition.protocol,
      coordinate: artifactCoordinate(contract.releaseCertification, {
        workflow: definition.workflow,
        sourceSha,
        runId: runId.value,
        runAttempt: runAttempt.value,
        artifactId: artifactId.value,
        artifactDigest,
      }, definition.workflow),
      artifactName: artifact.artifactName,
      manifestDigest: sha256Digest(manifestBytes),
      observedAt: observedAt.value,
      expiresAt,
      bytes: `${manifestBytes.byteLength}`,
    };
    return exactKeys(
      reference,
      contract.releaseCertification.finalPublicVerification.referenceShapes.readiness,
      "readiness reference",
    );
  }

  if (isRun) {
    const observationBytes = runObservationBytes({
      contract,
      definition,
      sourceSha,
      runId,
      runAttempt,
      run,
    });
    const reference = {
      role: definition.role,
      type: definition.type,
      protocol: definition.protocol,
      workflow: definition.workflow,
      sourceSha,
      runId: runId.value,
      runAttempt: runAttempt.value,
      terminal: definition.terminal,
      observedAt: observedAt.value,
      expiresAt,
      bytes: `${observationBytes.byteLength}`,
      digest: sha256Digest(observationBytes),
    };
    return exactKeys(reference, contract.releaseCertification.readiness.referenceShapes.githubRun, "GitHub run reference");
  }

  const coordinate = artifactCoordinate(contract.releaseCertification, {
    workflow: definition.workflow,
    sourceSha,
    runId: runId.value,
    runAttempt: runAttempt.value,
    artifactId: artifactId.value,
    artifactDigest,
  }, definition.workflow);
  const reference = {
    role: definition.role,
    type: definition.type,
    protocol: definition.protocol,
    coordinate,
    artifactName: artifact.artifactName,
    terminal: definition.terminal,
    evidenceObservedAt: evidence.value,
    observedAt: observedAt.value,
    expiresAt,
    bytes: `${artifact.bytes.byteLength}`,
  };
  artifactEvidenceValidator({
    contract,
    definition,
    reference: { ...reference, aggregateObservedAt: observedAt.value },
    sourceSha,
    candidateCoordinate: artifactCoordinate(
      contract.releaseCertification,
      evidence.candidateCoordinate,
      contract.releaseCertification.candidate.workflow,
    ),
    candidateManifestDigest: evidence.receipt?.candidateManifestDigest ?? `sha256:${"0".repeat(64)}`,
    contractDigest: sha256Digest(contractBytes),
    files,
  });
  return exactKeys(
    reference,
    contract.releaseCertification.readiness.referenceShapes.githubArtifact,
    "GitHub artifact reference",
  );
};

const parseArguments = (args) => {
  const allowed = new Set([
    "--kind",
    "--source-sha",
    "--run-id",
    "--run-attempt",
    "--artifact-id",
    "--artifact-digest",
  ]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowed.has(name) || values.has(name) || value === undefined || value.startsWith("--")) {
      throw new Error("terminal reference CLI arguments are missing, duplicated, or unknown");
    }
    values.set(name, value);
  }
  const kind = values.get("--kind");
  if (![
    "candidate",
    "readiness",
    "exact-main-ci",
    "fake-registry",
    "npm-oidc-certification",
  ].includes(kind)) throw new Error("terminal reference kind is unknown");
  const artifact = kind !== "exact-main-ci";
  if (
    values.size !== (artifact ? 6 : 4)
    || (artifact && (!values.has("--artifact-id") || !values.has("--artifact-digest")))
    || (!artifact && (values.has("--artifact-id") || values.has("--artifact-digest")))
  ) throw new Error("terminal reference CLI coordinate is incomplete or inapplicable");
  return {
    kind,
    sourceSha: values.get("--source-sha"),
    runId: values.get("--run-id"),
    runAttempt: values.get("--run-attempt"),
    artifactId: values.get("--artifact-id"),
    artifactDigest: values.get("--artifact-digest"),
  };
};

export const loadExactGeneratedContract = async () => {
  const source = readFileSync(contractPath);
  const inputs = await readInputs(repositoryRoot);
  const generated = validateContract(buildContract(inputs), inputs);
  if (!source.equals(Buffer.from(renderJson(generated)))) {
    throw new Error("terminal reference contract is not the exact generated contract");
  }
  return { contract: generated, contractBytes: source };
};

const main = async () => {
  const input = parseArguments(process.argv.slice(2));
  const { contract, contractBytes } = await loadExactGeneratedContract();
  const token = process.env.ACTIONS_READ_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  for (const name of [
    "ACTIONS_READ_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
    "ACTIONS_ID_TOKEN_REQUEST_URL",
  ]) delete process.env[name];
  const github = createGitHubReadOnlyBoundary({
    repository: contract.releaseCertification.githubAuthority.repository,
    token,
    transport: contract.releaseCertification.githubAuthority.readOnlyTransport,
  });
  const reference = await buildTerminalReference({
    ...input,
    contract,
    contractBytes,
    github,
  });
  process.stdout.write(canonicalJson(reference));
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write("terminal reference construction failed closed\n");
    process.exitCode = 1;
  });
}
