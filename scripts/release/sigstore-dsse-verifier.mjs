import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleFromJSON } from "@sigstore/bundle";
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
const isolatedChildEnvironmentNames = ["HOME", "LANG", "PATH", "TMPDIR", "__CF_USER_TEXT_ENCODING"];
// Node 24.14.1's bundled libuv 1.51.0 copies these required Windows variables
// from the parent when they are absent from an explicit child environment. They
// are OS identity/runtime metadata, not npm, GitHub, proxy, or signing authority.
// https://github.com/nodejs/node/blob/v24.14.1/deps/uv/src/win/process.c#L50-L62
const libuvWindowsRequiredEnvironmentNames = [
  "HOMEDRIVE",
  "HOMEPATH",
  "LOGONSERVER",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
];

export const validateIsolatedChildEnvironment = (environment, platform = process.platform) => {
  const windows = platform === "win32";
  const allowed = new Set([
    ...isolatedChildEnvironmentNames,
    ...(windows ? libuvWindowsRequiredEnvironmentNames : []),
  ].map((name) => windows ? name.toUpperCase() : name));
  const observed = Object.keys(environment).map((name) => windows ? name.toUpperCase() : name);
  if (
    new Set(observed).size !== observed.length
    || isolatedChildEnvironmentNames.some((name) => !observed.includes(windows ? name.toUpperCase() : name))
    || observed.some((name) => !allowed.has(name))
  ) throw new Error("isolated Sigstore child received a non-allowlisted environment name");
  return environment;
};

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
    ["path", "mediaType", "bytes", "digest", "tuf", "verification"],
    "Sigstore trusted-root policy",
  );
  const tuf = exactKeys(
    value.tuf,
    ["mirror", "target", "targetsMetadataVersion", "targetLength", "targetSha256", "acquisition"],
    "Sigstore trusted-root TUF source",
  );
  if (
    value.path !== "tooling/sigstore/trusted_root.json"
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
  const { verifier } = provenancePolicy(contract);
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

const provenancePolicy = (contract) => {
  const release = contract?.releaseCertification;
  const verifier = release?.provenanceVerification;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(release)
    || !isRecord(verifier)
    || verifier.purpose !== "npm-publication-provenance-verification-only"
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
  ) throw new Error("combined contract has no implemented npm provenance verifier policy");
  return { release, verifier };
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === modulePath && process.argv[2] === "--verify-child") {
  let failureStage = "environment";
  try {
    validateIsolatedChildEnvironment(process.env);
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
    const { verifier } = provenancePolicy(contract);
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
