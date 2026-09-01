import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleFromJSON, bundleToJSON } from "@sigstore/bundle";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { toSignedEntity, toTrustMaterial, Verifier } from "@sigstore/verify";

import { canonicalJson, sha256Digest } from "./protocol.mjs";

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

const canonicalBase64 = (value, label) => {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) throw new Error(`${label} is not canonical base64`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error(`${label} is not canonical base64`);
  return decoded;
};

const canonicalTimestamp = (value, label) => {
  if (typeof value !== "string") throw new Error(`${label} is not a timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} is not one canonical UTC timestamp`);
  }
  return milliseconds;
};

const positiveDecimal = (value, label) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} is not a canonical positive decimal string`);
  }
  return value;
};

const fullSha = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} is not one full lowercase source SHA`);
  }
  return value;
};

const canonicalDigest = (value, contract, label) => {
  const pattern = contract.releaseCertification?.githubArtifactDigest?.canonicalPattern;
  if (typeof value !== "string" || typeof pattern !== "string" || !new RegExp(pattern, "u").test(value)) {
    throw new Error(`${label} is not a canonical SHA-256 digest`);
  }
  return value;
};

const decodeCanonicalJson = (bytes, label) => {
  let text;
  let value;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not UTF-8 JSON`);
  }
  if (text !== canonicalJson(value)) throw new Error(`${label} is not canonical JSON`);
  return value;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const derLength = (length) => {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error("Sigstore OID value length is invalid");
  if (length < 0x80) return Buffer.from([length]);
  const octets = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) octets.unshift(value % 256);
  return Buffer.from([0x80 | octets.length, ...octets]);
};

const derUtf8String = (value) => {
  const payload = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([0x0c]), derLength(payload.byteLength), payload]);
};

const oidText = (value) => Array.isArray(value?.oid?.id) ? value.oid.id.join(".") : undefined;

const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
const vendoredTrustedRootPath = resolve(repositoryRoot, "tooling/sigstore/trusted_root.json");
const networkGuardPath = resolve(repositoryRoot, "scripts/release/deny-network.cjs");

const signerProjection = (signer) => ({
  identity: {
    extensions: { issuer: signer?.identity?.extensions?.issuer },
    oids: Array.isArray(signer?.identity?.oids)
      ? signer.identity.oids.map((entry) => ({
        oid: { id: entry?.oid?.id },
        valueBase64: entry?.value instanceof Uint8Array ? Buffer.from(entry.value).toString("base64") : undefined,
      }))
      : undefined,
    subjectAlternativeName: signer?.identity?.subjectAlternativeName,
  },
});

const signerFromProjection = (value) => ({
  identity: {
    extensions: { issuer: value?.identity?.extensions?.issuer },
    oids: Array.isArray(value?.identity?.oids)
      ? value.identity.oids.map((entry) => ({
        oid: { id: entry?.oid?.id },
        value: canonicalBase64(entry?.valueBase64, "isolated Sigstore signer OID"),
      }))
      : undefined,
    subjectAlternativeName: value?.identity?.subjectAlternativeName,
  },
});

const trustedRootPolicy = (verifier) => {
  const value = exactKeys(
    verifier?.trustedRoot,
    ["path", "artifactFile", "mediaType", "bytes", "digest", "tuf", "verification"],
    "Sigstore trusted-root policy",
  );
  const tuf = exactKeys(
    value.tuf,
    ["mirror", "target", "targetsMetadataVersion", "targetLength", "targetSha256", "acquisition"],
    "Sigstore trusted-root TUF source",
  );
  if (
    value.path !== "tooling/sigstore/trusted_root.json"
    || value.artifactFile !== "sigstore-trusted-root.json"
    || value.mediaType !== "application/vnd.dev.sigstore.trustedroot+json;version=0.1"
    || value.bytes !== 6787
    || value.digest !== "sha256:6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66"
    || value.verification !== "offline-direct-verifier-no-tuf-network-or-cache-fallback"
    || tuf.mirror !== "https://tuf-repo-cdn.sigstore.dev"
    || tuf.target !== "trusted_root.json"
    || tuf.targetsMetadataVersion !== 14
    || tuf.targetLength !== value.bytes
    || tuf.targetSha256 !== value.digest
    || tuf.acquisition?.verification
      !== "retained-seed-root-rotation-signatures-expiry-versions-descriptors-and-target-bytes-replay"
  ) throw new Error("Sigstore trusted-root policy is not one exact authenticated TUF target");
  return value;
};

export const validateTrustedRootBytes = ({ trustedRootBytes, verifier }) => {
  const policy = trustedRootPolicy(verifier);
  if (
    !(trustedRootBytes instanceof Uint8Array)
    || trustedRootBytes.byteLength !== policy.bytes
    || sha256Digest(trustedRootBytes) !== policy.digest
  ) throw new Error("vendored Sigstore trusted-root bytes differ from the contract pin");
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(trustedRootBytes));
  } catch {
    throw new Error("vendored Sigstore trusted-root target is not UTF-8 JSON");
  }
  exactKeys(
    decoded,
    ["mediaType", "tlogs", "certificateAuthorities", "ctlogs", "timestampAuthorities"],
    "vendored Sigstore trusted-root target",
  );
  if (
    decoded.mediaType !== policy.mediaType
    || !Array.isArray(decoded.tlogs)
    || decoded.tlogs.length === 0
    || !Array.isArray(decoded.certificateAuthorities)
    || decoded.certificateAuthorities.length === 0
    || !Array.isArray(decoded.ctlogs)
    || decoded.ctlogs.length === 0
    || !Array.isArray(decoded.timestampAuthorities)
    || decoded.timestampAuthorities.length === 0
  ) throw new Error("vendored Sigstore trusted-root target has no complete verification authority set");
  const trustedRoot = TrustedRoot.fromJSON(decoded);
  if (TrustedRoot.toJSON(trustedRoot).mediaType !== policy.mediaType) {
    throw new Error("vendored Sigstore trusted-root target did not decode exactly");
  }
  return trustedRoot;
};

export const validateVerifierRuntime = ({ runtime, observedVersion = process.version }) => {
  const value = exactKeys(runtime, ["executable", "version"], "offline Sigstore verifier runtime");
  if (value.executable !== "node" || value.version !== "24.14.1" || observedVersion !== `v${value.version}`) {
    throw new Error("offline Sigstore verifier runtime differs from the contract pin");
  }
  return value;
};

export const verifySigstoreBundleOffline = ({ bundle, options, trustedRoot }) => {
  const value = exactKeys(
    options,
    ["certificateIssuer", "certificateIdentityURI", "ctLogThreshold", "tlogThreshold"],
    "offline Sigstore verifier options",
  );
  if (
    typeof value.certificateIssuer !== "string"
    || typeof value.certificateIdentityURI !== "string"
    || !value.certificateIdentityURI.startsWith("^")
    || !value.certificateIdentityURI.endsWith("$")
    || value.ctLogThreshold !== 1
    || value.tlogThreshold !== 1
  ) throw new Error("offline Sigstore verifier options are not exact and anchored");
  const verifier = new Verifier(toTrustMaterial(trustedRoot), {
    ctlogThreshold: value.ctLogThreshold,
    tlogThreshold: value.tlogThreshold,
  });
  return verifier.verify(toSignedEntity(bundleFromJSON(bundle)), {
    extensions: { issuer: value.certificateIssuer },
    subjectAlternativeName: value.certificateIdentityURI,
  });
};

export const verifySigstoreBundleIsolated = async (
  bundle,
  options,
  { contract, environment = process.env, spawn = spawnSync, trustedRootBytes } = {},
) => {
  const { verifier } = authenticationPolicy(contract);
  const exactTrustedRootBytes = trustedRootBytes ?? readFileSync(vendoredTrustedRootPath);
  validateTrustedRootBytes({
    trustedRootBytes: exactTrustedRootBytes,
    verifier,
  });
  const networkGuardBytes = readFileSync(networkGuardPath);
  if (
    networkGuardBytes.byteLength !== verifier.networkGuard?.bytes
    || sha256Digest(networkGuardBytes) !== verifier.networkGuard?.digest
    || resolve(repositoryRoot, verifier.networkGuard?.path ?? "") !== networkGuardPath
  ) throw new Error("Sigstore network-denial preload differs from the contract pin");
  const isolatedRoot = mkdtempSync(resolve(tmpdir(), "effect-build-sigstore-"));
  try {
    const result = spawn(verifier.runtime.executable, [
      "--permission",
      `--allow-fs-read=${repositoryRoot}`,
      `--require=${networkGuardPath}`,
      modulePath,
      "--verify-child",
    ], {
      cwd: isolatedRoot,
      encoding: "utf8",
      env: {
        HOME: isolatedRoot,
        LANG: environment.LANG ?? "C.UTF-8",
        PATH: environment.PATH ?? "",
        TMPDIR: isolatedRoot,
        __CF_USER_TEXT_ENCODING: "0x0:0x0",
      },
      input: canonicalJson({
        bundle,
        options,
        trustedRootBase64: Buffer.from(exactTrustedRootBytes).toString("base64"),
      }),
      maxBuffer: 1024 * 1024,
      shell: false,
      timeout: 120_000,
      windowsHide: true,
    });
    if (result.error !== undefined || result.status !== 0 || typeof result.stdout !== "string") {
      const failureStage = typeof result.stderr === "string"
        ? /^effect-build-sigstore-child:(environment|input|contract|runtime|trusted-root|verification|projection)\s*$/u
          .exec(result.stderr)?.[1]
        : undefined;
      const reason = result.error?.code === "ENOENT"
        ? "runtime unavailable"
        : result.error?.code === "ETIMEDOUT"
        ? "whole-operation deadline exceeded"
        : failureStage !== undefined
        ? `child rejected verification at ${failureStage}`
        : "child rejected verification";
      throw new Error(`isolated Sigstore verifier failed: ${reason}`);
    }
    let projection;
    try {
      projection = JSON.parse(result.stdout);
    } catch {
      throw new Error("isolated Sigstore verifier returned invalid signer identity");
    }
    return signerFromProjection(projection);
  } finally {
    rmSync(isolatedRoot, { force: true, recursive: true });
  }
};

export const validateVerifiedSignerIdentity = ({ signer, verifier, identity, producerSourceSha }) => {
  const observed = signer?.identity;
  if (
    observed?.subjectAlternativeName !== identity.certificateIdentityURI
    || observed?.extensions?.issuer !== identity.certificateIssuer
    || !Array.isArray(observed?.oids)
  ) throw new Error("Sigstore verified signer SAN, issuer, or OID set is absent");
  const required = [
    [verifier.certificateOids.buildSignerUri, identity.certificateIdentityURI],
    [verifier.certificateOids.sourceRepositoryUri, `https://github.com/${identity.repository}`],
    [verifier.certificateOids.sourceRepositoryDigest, producerSourceSha],
  ];
  for (const [oid, expected] of required) {
    const matches = observed.oids.filter((entry) => oidText(entry) === oid);
    if (
      matches.length !== 1
      || !(matches[0].value instanceof Uint8Array)
      || !Buffer.from(matches[0].value).equals(derUtf8String(expected))
    ) throw new Error(`Sigstore verified signer OID ${oid} is missing, duplicated, or changed`);
  }
  return signer;
};

const authenticationPolicy = (contract) => {
  const release = contract?.releaseCertification;
  const authentication = release?.readiness?.externalEvidenceAuthentication;
  const verifier = authentication?.verifier;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(release)
    || !isRecord(authentication)
    || !isRecord(verifier)
    || verifier.status !== "implemented"
    || verifier.module !== "scripts/release/sigstore-dsse-verifier.mjs"
    || verifier.client?.package !== "@sigstore/verify"
    || verifier.client?.version !== "3.1.1"
    || verifier.bundleClient?.package !== "@sigstore/bundle"
    || verifier.bundleClient?.version !== "4.0.0"
    || verifier.protobufClient?.package !== "@sigstore/protobuf-specs"
    || verifier.protobufClient?.version !== "0.5.2"
    || verifier.runtime?.executable !== "node"
    || verifier.runtime?.version !== "24.14.1"
    || verifier.networkGuard?.path !== "scripts/release/deny-network.cjs"
    || verifier.networkGuard?.bytes !== 4379
    || verifier.networkGuard?.digest !== "sha256:acb4f347c8abb4dbc98d138b487b7cf316a3ccbbbf3a2da2108e68e9b343de77"
    || verifier.networkGuard?.strategy
      !== "preload-standard-node-network-api-denial-plus-audited-direct-verifier-closure"
    || verifier.network !== "forbidden-by-preload-guard-and-audited-direct-verifier-closure"
    || authentication.requiredEnvelope !== "sigstore-bundle-v0.3-dsse"
    || !Array.isArray(authentication.producerIdentities)
    || !Array.isArray(authentication.producerIdentityFields)
    || !isRecord(authentication.sourceBinding)
  ) throw new Error("combined contract has no implemented Sigstore DSSE verifier policy");
  return { authentication, release, verifier };
};

export const validateProducerIdentityPolicy = ({ authentication, identity, role, verifier }) => {
  const value = exactKeys(
    identity,
    authentication.producerIdentityFields,
    `Sigstore ${role} producer identity`,
  );
  const bindingPolicy = authentication.sourceBinding;
  if (
    value.role !== role
    || value.certificateIssuer !== verifier.certificateIssuer
    || value.certificateIdentityURI !== `https://github.com/${value.workflow}`
    || !value.workflow.startsWith(`${value.repository}/.github/workflows/`)
    || value.ref !== "refs/heads/main"
    || !value.workflow.endsWith(`@${value.ref}`)
  ) throw new Error(`Sigstore ${role} producer identity is not exact`);
  if (value.sourceBinding?.kind === bindingPolicy.releaseSourceKind) {
    exactKeys(value.sourceBinding, bindingPolicy.releaseSourceFields, `Sigstore ${role} release source binding`);
  } else if (value.sourceBinding?.kind === bindingPolicy.exactSourceKind) {
    exactKeys(value.sourceBinding, bindingPolicy.exactSourceFields, `Sigstore ${role} exact source binding`);
    fullSha(value.sourceBinding.sourceSha, `Sigstore ${role} exact producer source SHA`);
  } else {
    throw new Error(`Sigstore ${role} has no contract-pinned producer source binding`);
  }
  return value;
};

export const validateSigstoreBundleTransport = ({ contract, bundleBytes }) => {
  const { verifier } = authenticationPolicy(contract);
  if (!(bundleBytes instanceof Uint8Array) || bundleBytes.byteLength === 0) {
    throw new Error("Sigstore DSSE bundle is empty");
  }
  if (bundleBytes.byteLength > verifier.maximumBundleBytes) throw new Error("Sigstore DSSE bundle is too large");
  const bundle = exactKeys(
    decodeCanonicalJson(bundleBytes, "Sigstore DSSE bundle"),
    verifier.bundleFields,
    "Sigstore DSSE bundle",
  );
  const envelope = exactKeys(bundle.dsseEnvelope, verifier.envelopeFields, "Sigstore DSSE envelope");
  if (
    bundle.mediaType !== verifier.bundleMediaType
    || envelope.payloadType !== verifier.payloadType
    || !Array.isArray(envelope.signatures)
    || envelope.signatures.length !== verifier.envelopeSignatureCount
  ) throw new Error("Sigstore DSSE media type, payload type, or signature cardinality changed");
  exactKeys(envelope.signatures[0], verifier.signatureFields, "Sigstore DSSE signature");
  canonicalBase64(envelope.signatures[0].sig, "Sigstore DSSE signature bytes");
  exactKeys(bundle.verificationMaterial, verifier.verificationMaterialFields, "Sigstore verification material");
  exactKeys(
    bundle.verificationMaterial.timestampVerificationData,
    verifier.timestampVerificationDataFields,
    "Sigstore timestamp verification material",
  );
  if (
    !Array.isArray(bundle.verificationMaterial.tlogEntries)
    || bundle.verificationMaterial.tlogEntries.length < verifier.minimumTlogEntries
  ) throw new Error("Sigstore DSSE bundle has no transparency-log entry");
  try {
    const normalizedBundle = bundleToJSON(bundleFromJSON(bundle));
    if (canonicalJson(normalizedBundle) !== canonicalJson(bundle)) {
      throw new Error("noncanonical Sigstore bundle shape");
    }
  } catch {
    throw new Error("Sigstore DSSE bundle is not one canonical v0.3 bundle");
  }
  return bundle;
};

export const verifyExternalEvidenceEnvelope = async ({
  contract,
  definition,
  reference,
  bundleBytes,
  validationTime,
  environment = process.env,
  verifyBundle,
}) => {
  const { authentication, release, verifier } = authenticationPolicy(contract);
  const canonicalDefinition = release.readiness?.evidenceRoles?.find(({ role }) => role === reference?.role);
  if (
    !isRecord(canonicalDefinition)
    || canonicalDefinition.type !== "externalObservation"
    || canonicalJson(canonicalDefinition) !== canonicalJson(definition)
  ) throw new Error("Sigstore DSSE evidence role definition is not canonical");
  const referenceValue = exactKeys(
    reference,
    release.readiness.referenceShapes?.externalObservation,
    `Sigstore ${definition.role} reference`,
  );
  if (
    referenceValue.role !== definition.role
    || referenceValue.type !== definition.type
    || referenceValue.protocol !== definition.protocol
    || referenceValue.terminal !== definition.terminal
  ) throw new Error("Sigstore DSSE evidence reference identity changed");
  const forbiddenNames = release.npmOidcCertification?.forbiddenEnvironmentNames;
  if (
    !Array.isArray(forbiddenNames)
    || forbiddenNames.some((name) => typeof environment[name] === "string")
  ) throw new Error("Sigstore DSSE verification environment contains forbidden signing or registry authority");
  const bundle = validateSigstoreBundleTransport({ contract, bundleBytes });
  const envelope = bundle.dsseEnvelope;

  const payload = exactKeys(
    decodeCanonicalJson(canonicalBase64(envelope.payload, "Sigstore DSSE payload"), "Sigstore DSSE payload"),
    verifier.payloadFields,
    "Sigstore DSSE payload",
  );
  const identityMatches = authentication.producerIdentities.filter((identity) => identity?.role === definition?.role);
  if (identityMatches.length !== 1) throw new Error(`no unique contract-pinned producer identity for ${definition?.role}`);
  const identity = validateProducerIdentityPolicy({
    authentication,
    identity: identityMatches[0],
    role: definition.role,
    verifier,
  });
  const bindingPolicy = authentication.sourceBinding;
  const binding = identity.sourceBinding;
  let expectedProducerSourceSha;
  if (binding?.kind === bindingPolicy.releaseSourceKind) {
    exactKeys(binding, bindingPolicy.releaseSourceFields, `Sigstore ${definition.role} release source binding`);
    expectedProducerSourceSha = reference.sourceSha;
  } else if (binding?.kind === bindingPolicy.exactSourceKind) {
    exactKeys(binding, bindingPolicy.exactSourceFields, `Sigstore ${definition.role} exact source binding`);
    expectedProducerSourceSha = fullSha(binding.sourceSha, `Sigstore ${definition.role} exact producer source SHA`);
  } else {
    throw new Error(`Sigstore ${definition.role} has no contract-pinned producer source binding`);
  }
  if (
    expectedProducerSourceSha !== payload.producerSourceSha
    || payload.schema !== verifier.payloadProtocol
    || payload.role !== definition.role
    || payload.producerWorkflow !== identity.workflow
    || payload.releaseSourceSha !== reference.sourceSha
    || payload.receiptProtocol !== definition.protocol
    || payload.observedAt !== reference.observedAt
    || payload.expiresAt !== reference.expiresAt
  ) throw new Error("Sigstore DSSE producer, role, source, receipt, or time binding changed");
  fullSha(payload.producerSourceSha, "Sigstore DSSE producer source SHA");
  fullSha(payload.releaseSourceSha, "Sigstore DSSE release source SHA");
  const receiptBytes = canonicalBase64(payload.receiptBase64, "Sigstore DSSE receipt bytes");
  if (
    receiptBytes.byteLength > verifier.maximumReceiptBytes
    || positiveDecimal(payload.receiptBytes, "Sigstore DSSE receipt byte count") !== `${receiptBytes.byteLength}`
    || canonicalDigest(payload.receiptDigest, contract, "Sigstore DSSE receipt digest") !== sha256Digest(receiptBytes)
    || decodeCanonicalJson(receiptBytes, "Sigstore DSSE receipt") === undefined
  ) throw new Error("Sigstore DSSE receipt byte identity changed");
  if (
    positiveDecimal(reference.bytes, `${definition.role} bundle byte count`) !== `${bundleBytes.byteLength}`
    || canonicalDigest(reference.digest, contract, `${definition.role} bundle digest`) !== sha256Digest(bundleBytes)
  ) throw new Error("Sigstore DSSE bundle byte identity changed");
  const observedAt = canonicalTimestamp(payload.observedAt, "Sigstore DSSE observedAt");
  const expiresAt = canonicalTimestamp(payload.expiresAt, "Sigstore DSSE expiresAt");
  const validationAt = canonicalTimestamp(validationTime, "Sigstore DSSE validation time");
  if (
    !Number.isSafeInteger(definition.maximumAgeSeconds)
    || !Number.isSafeInteger(definition.maximumValiditySeconds)
    || observedAt > validationAt + release.readiness.clockSkewSeconds * 1_000
    || validationAt - observedAt > definition.maximumAgeSeconds * 1_000
    || expiresAt <= validationAt
    || expiresAt <= observedAt
    || expiresAt - observedAt > definition.maximumValiditySeconds * 1_000
  ) throw new Error("Sigstore DSSE evidence is future, stale, expired, or overlong");

  // sigstore's embedded-DSSE overload is verify(bundle, options). Passing an
  // undefined data argument would select the options overload and discard a
  // third argument, silently removing every identity and log constraint.
  const verifierOptions = {
    certificateIssuer: identity.certificateIssuer,
    certificateIdentityURI: `^${escapeRegExp(identity.certificateIdentityURI)}$`,
    ctLogThreshold: verifier.ctLogThreshold,
    tlogThreshold: verifier.tlogThreshold,
  };
  const signer = verifyBundle === undefined
    ? await verifySigstoreBundleIsolated(bundle, verifierOptions, { contract, environment })
    : await verifyBundle(bundle, verifierOptions);
  validateVerifiedSignerIdentity({ signer, verifier, identity, producerSourceSha: payload.producerSourceSha });
  return { bundle, identity, payload, receiptBytes, signer };
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === modulePath && process.argv[2] === "--verify-child") {
  let failureStage = "environment";
  try {
    const allowed = ["HOME", "LANG", "PATH", "TMPDIR", "__CF_USER_TEXT_ENCODING"];
    if (Object.keys(process.env).some((name) => !allowed.includes(name))) {
      throw new Error("isolated Sigstore child received a non-allowlisted environment name");
    }
    failureStage = "input";
    const input = JSON.parse(await new Promise((resolveInput, rejectInput) => {
      const chunks = [];
      process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => resolveInput(Buffer.concat(chunks).toString("utf8")));
      process.stdin.on("error", rejectInput);
    }));
    exactKeys(input, ["bundle", "options", "trustedRootBase64"], "isolated Sigstore child input");
    failureStage = "contract";
    const contract = JSON.parse(readFileSync(contractPath, "utf8"));
    const { verifier } = authenticationPolicy(contract);
    failureStage = "runtime";
    validateVerifierRuntime({ runtime: verifier.runtime });
    failureStage = "trusted-root";
    const trustedRoot = validateTrustedRootBytes({
      trustedRootBytes: canonicalBase64(input.trustedRootBase64, "isolated Sigstore trusted-root bytes"),
      verifier,
    });
    failureStage = "verification";
    const signer = verifySigstoreBundleOffline({ bundle: input.bundle, options: input.options, trustedRoot });
    failureStage = "projection";
    process.stdout.write(canonicalJson(signerProjection(signer)));
  } catch {
    process.stderr.write(`effect-build-sigstore-child:${failureStage}\n`);
    process.exitCode = 1;
  }
}
