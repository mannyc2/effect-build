import { Buffer } from "node:buffer";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { bundleToJSON } from "@sigstore/bundle";
import { PublicKeyDetails, TransparencyLogEntry } from "@sigstore/protobuf-specs";
import { CreateEntryRequest } from "@sigstore/protobuf-specs/rekor/v2";

import { parseBunLockfilePackageRecords } from "./install-frozen-release-dependencies.mjs";
import { canonicalJson, sha256Digest } from "./protocol.mjs";
import {
  assertReadinessArtifactAllowed,
  validateExternalReceiptForProducer,
} from "./readiness-protocol.mjs";
import {
  validateProducerIdentityPolicy,
  validateSigstoreBundleTransport,
} from "./sigstore-dsse-verifier.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require = createRequire(import.meta.url);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameJson = (left, right) => isDeepStrictEqual(left, right);

const expectedSignerActivation = (state) => ({
  statusSource: "releaseCertification.readiness.externalEvidenceAuthentication.status",
  producerIdentitySource: "releaseCertification.readiness.externalEvidenceAuthentication.producerIdentities",
  topology: "observe-sign-upload-three-job-hard-cut",
  workflowPermissions: {},
  observerJob: "observe",
  signerJob: "sign",
  uploadJob: "upload",
  permissions: {
    observer: state === "supported" ? { contents: "read" } : {},
    signer: state === "supported" ? { "id-token": "write" } : {},
    upload: {},
  },
  observerCredentialedThirdPartyActions: "forbidden",
  signerThirdPartyActions: "forbidden",
  handoff: {
    observerToSigner: ["observed-at", "receipt-base64"],
    signerToUpload: ["bundle-base64", "reference-base64"],
    transport: "canonical-bounded-nonsecret-job-outputs-only",
    artifactName: "fixed-role-and-validated-source-sha",
    maximumReferenceBytes: 4096,
    maximumBundleBytes: 32768,
  },
  hostedBootstrap: {
    status: state === "supported" ? "qualified" : "unqualified-stop",
    observer: "exact-node-24.14.1-and-audited-observer-source-closure-with-no-third-party-actions",
    signer: "exact-node-24.14.1-and-audited-signer-source-closure-with-no-third-party-actions",
  },
  atomicity:
    "both-hosted-bootstraps-signer-job-permission-and-all-contract-pinned-producer-identities-activate-together",
});

const exactKeys = (value, expected, label) => {
  if (
    !isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const regularBytes = (path, label) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not one regular file`);
  return readFileSync(path);
};

const exactHttpsOrigin = (value, label) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not one exact HTTPS origin`);
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.port !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) throw new Error(`${label} is not one exact HTTPS origin`);
  return url.origin;
};

export const sigstoreSignerPolicyFromContract = (contract) => {
  const authentication = contract?.releaseCertification?.readiness?.externalEvidenceAuthentication;
  const signer = authentication?.signer;
  const dependency = signer?.dependency;
  const activation = signer?.activation;
  const oidc = signer?.oidc;
  const request = oidc?.request;
  const transport = signer?.transport;
  if (
    contract?.schema !== "effect-build/combined-contract@1"
    || !isRecord(authentication)
    || !isRecord(signer)
    || signer.status !== "implemented-inert-until-supported-activation"
    || signer.module !== "scripts/release/sigstore-dsse-signer.mjs"
    || signer.runtime?.executable !== "node"
    || signer.runtime.version !== "24.14.1"
    || !isRecord(dependency)
    || dependency.package !== "@sigstore/sign"
    || !/^\d+\.\d+\.\d+$/u.test(dependency.version)
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(dependency.integrity)
    || !/^sha256:[0-9a-f]{64}$/u.test(dependency.manifestDigest)
    || typeof dependency.entrySource !== "string"
    || !Array.isArray(dependency.executedSources)
    || dependency.executedSources.length === 0
    || new Set(dependency.executedSources.map(({ path }) => path)).size !== dependency.executedSources.length
    || dependency.executedSources.some(({ path, digest }) =>
      typeof path !== "string" || !path.startsWith("dist/") || !/^sha256:[0-9a-f]{64}$/u.test(digest)
    )
    || !dependency.executedSources.some(({ path }) => path === dependency.entrySource)
    || !Array.isArray(dependency.executedDependencyClosure)
    || dependency.executedDependencyClosure.length === 0
    || dependency.executedDependencyClosure.some((entry) =>
      !isRecord(entry)
      || typeof entry.package !== "string"
      || !/^\d+\.\d+\.\d+$/u.test(entry.version)
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)
    )
    || !isRecord(activation)
    || !["blocked", "supported"].includes(authentication.status)
    || !sameJson(activation, expectedSignerActivation(authentication.status))
    || !isRecord(oidc)
    || typeof oidc.audience !== "string"
    || !/^[A-Za-z0-9:._/-]+$/u.test(oidc.audience)
    || !isRecord(request)
    || request.method !== "GET"
    || request.initialQuery !== "api-version=2.0"
    || request.audienceName !== "audience"
    || request.redirects !== 0
    || request.retries !== 0
    || request.successStatus !== 200
    || request.responseContentType !== "application/json"
    || request.responseContentEncoding !== "forbidden"
    || !Number.isSafeInteger(request.maximumRequestTokenBytes)
    || request.maximumRequestTokenBytes <= 0
    || !Number.isSafeInteger(request.maximumRequestUrlBytes)
    || request.maximumRequestUrlBytes <= 0
    || !Number.isSafeInteger(request.maximumResponseBytes)
    || request.maximumResponseBytes <= 0
    || !Number.isSafeInteger(request.requestInactivityTimeoutMilliseconds)
    || request.requestInactivityTimeoutMilliseconds <= 0
    || !Number.isSafeInteger(request.sequenceTotalTimeoutMilliseconds)
    || request.sequenceTotalTimeoutMilliseconds < request.requestInactivityTimeoutMilliseconds
    || !isRecord(transport)
    || transport.tlsRootPolicy !== "node-bundled-root-certificates-only"
    || transport.minimumTlsVersion !== "TLSv1.2"
    || transport.agent !== "disabled"
    || transport.redirects !== 0
    || transport.retries !== 0
    || transport.responseContentType !== "application/json"
    || transport.responseContentEncoding !== "forbidden"
    || transport.duplicateResponseHeaders !== "forbidden"
    || transport.responseFraming !== "exactly-one-content-length-or-chunked-transfer-encoding"
    || transport.partialResponses !== "forbidden"
    || !Number.isSafeInteger(transport.maximumJsonDepth)
    || transport.maximumJsonDepth <= 0
    || transport.maximumJsonDepth > 256
    || !Number.isSafeInteger(transport.requestInactivityTimeoutMilliseconds)
    || transport.requestInactivityTimeoutMilliseconds <= 0
    || !Number.isSafeInteger(transport.sequenceTotalTimeoutMilliseconds)
    || transport.sequenceTotalTimeoutMilliseconds < transport.requestInactivityTimeoutMilliseconds
  ) throw new Error("Sigstore signing contract is not exact");
  for (const [label, endpoint, successStatus] of [
    ["Fulcio", transport.fulcio, 200],
    ["Rekor", transport.rekor, 201],
  ]) {
    if (
      !isRecord(endpoint)
      || endpoint.method !== "POST"
      || endpoint.successStatus !== successStatus
      || typeof endpoint.path !== "string"
      || !/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/u.test(endpoint.path)
      || !Number.isSafeInteger(endpoint.maximumRequestBytes)
      || endpoint.maximumRequestBytes <= 0
      || !Number.isSafeInteger(endpoint.maximumResponseBytes)
      || endpoint.maximumResponseBytes <= 0
    ) throw new Error(`${label} signing transport is not exact`);
    exactHttpsOrigin(endpoint.origin, `${label} signing transport origin`);
  }
  if (transport.rekor.publicKeyDetails !== "PKIX_ECDSA_P256_SHA_256") {
    throw new Error("Rekor signing key policy is not exact");
  }
  return signer;
};

const resolveSigningPackage = ({ contract, root }) => {
  const signer = sigstoreSignerPolicyFromContract(contract);
  const dependency = signer.dependency;
  const lockRecords = parseBunLockfilePackageRecords(readFileSync(resolve(root, "bun.lock"), "utf8"));
  for (const entry of dependency.executedDependencyClosure) {
    const records = lockRecords.filter(([name]) => name === entry.package);
    if (
      records.length !== 1
      || records[0][1][0] !== `${entry.package}@${entry.version}`
      || records[0][1].at(-1) !== entry.integrity
    ) throw new Error("Sigstore signing dependency lock authority changed");
  }

  const manifestPath = realpathSync(require.resolve(`${dependency.package}/package.json`));
  const packageRoot = dirname(manifestPath);
  const manifestBytes = regularBytes(manifestPath, "Sigstore signing package manifest");
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.name !== dependency.package
    || manifest.version !== dependency.version
    || sha256Digest(manifestBytes) !== dependency.manifestDigest
  ) throw new Error("Sigstore signing package manifest changed");

  for (const { path, digest } of dependency.executedSources) {
    const sourcePath = realpathSync(resolve(packageRoot, path));
    const sourceRelative = relative(packageRoot, sourcePath);
    if (sourceRelative.startsWith("..") || resolve(packageRoot, sourceRelative) !== sourcePath) {
      throw new Error(`Sigstore signing source escapes its package: ${path}`);
    }
    if (sha256Digest(regularBytes(sourcePath, `Sigstore signing source ${path}`)) !== digest) {
      throw new Error(`Sigstore signing source changed: ${path}`);
    }
  }
  return { dependency, entryPath: realpathSync(resolve(packageRoot, dependency.entrySource)) };
};

export const assertPinnedSigstoreSigningDependency = ({ contract, root = repositoryRoot }) =>
  resolveSigningPackage({ contract, root }).dependency;

const exactSigningEnvironmentNames = Object.freeze([
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "GITHUB_ACTIONS",
  "GITHUB_EVENT_NAME",
  "GITHUB_JOB",
  "GITHUB_REF",
  "GITHUB_REPOSITORY",
  "GITHUB_SHA",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_WORKFLOW_SHA",
  "LANG",
  "LC_ALL",
  "OUTPUT_DIRECTORY",
  "PATH",
  "SOURCE_SHA",
  "TZ",
]);

const prohibitedSigningEnvironmentNames = Object.freeze([
  "ACTIONS_ALLOW_UNSECURE_COMMANDS",
  "ACTIONS_CACHE_URL",
  "ACTIONS_RESULTS_URL",
  "ACTIONS_RUNTIME_TOKEN",
  "ACTIONS_RUNTIME_URL",
  "ACTIONS_RUNNER_DEBUG",
  "ACTIONS_RUNNER_HOOK_JOB_COMPLETED",
  "ACTIONS_RUNNER_HOOK_JOB_STARTED",
  "ACTIONS_STEP_DEBUG",
  "ALL_PROXY",
  "BASH_ENV",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "ENV",
  "GH_TOKEN",
  "GITHUB_ENV",
  "GITHUB_OUTPUT",
  "GITHUB_PATH",
  "GITHUB_STATE",
  "GITHUB_STEP_SUMMARY",
  "GITHUB_TOKEN",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LD_PRELOAD",
  "NODE_EXTRA_CA_CERTS",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_USE_ENV_PROXY",
  "NPM_CONFIG_GLOBALCONFIG",
  "NPM_CONFIG_USERCONFIG",
  "NO_PROXY",
  "OPENSSL_CONF",
  "SSLKEYLOGFILE",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "npm_config_globalconfig",
  "npm_config_userconfig",
]);

export const validateSigstoreSigningEnvironment = ({ contract, identity, sourceSha, environment = process.env }) => {
  const signer = sigstoreSignerPolicyFromContract(contract);
  const forbidden = contract?.releaseCertification?.npmOidcCertification?.forbiddenEnvironmentNames;
  const allowed = new Set(exactSigningEnvironmentNames);
  if (
    !Array.isArray(forbidden)
    || Object.keys(environment).some((name) => !allowed.has(name))
    || forbidden.some((name) => typeof environment[name] === "string")
    || prohibitedSigningEnvironmentNames.some((name) => typeof environment[name] === "string")
  ) throw new Error("Sigstore signing environment contains ambient registry, repository, runtime, or network authority");
  if (
    process.versions.node !== signer.runtime.version
    || environment.GITHUB_ACTIONS !== "true"
    || environment.GITHUB_EVENT_NAME !== "workflow_dispatch"
    || environment.GITHUB_JOB !== signer.activation.signerJob
    || environment.GITHUB_REPOSITORY !== identity.repository
    || environment.GITHUB_REF !== identity.ref
    || environment.GITHUB_SHA !== sourceSha
    || environment.GITHUB_WORKFLOW_REF !== identity.workflow
    || environment.GITHUB_WORKFLOW_SHA !== sourceSha
    || environment.SOURCE_SHA !== sourceSha
    || typeof environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN !== "string"
    || !/^[\x21-\x7e]+$/u.test(environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    || Buffer.byteLength(environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
      > signer.oidc.request.maximumRequestTokenBytes
    || typeof environment.ACTIONS_ID_TOKEN_REQUEST_URL !== "string"
    || Buffer.byteLength(environment.ACTIONS_ID_TOKEN_REQUEST_URL) > signer.oidc.request.maximumRequestUrlBytes
    || !/^[\x21-\x7e]+$/u.test(environment.ACTIONS_ID_TOKEN_REQUEST_URL)
  ) throw new Error("Sigstore signing GitHub workflow or OIDC identity is not exact");
  let requestUrl;
  try {
    requestUrl = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
  } catch {
    throw new Error("Sigstore signing GitHub OIDC request URL is invalid");
  }
  const requestPolicy = signer.oidc.request;
  if (
    requestUrl.protocol !== "https:"
    || requestUrl.username !== ""
    || requestUrl.password !== ""
    || requestUrl.port !== ""
    || requestUrl.hash !== ""
    || !new RegExp(requestPolicy.hostPattern, "u").test(requestUrl.hostname)
    || !new RegExp(requestPolicy.pathPattern, "u").test(requestUrl.pathname)
    || requestUrl.search !== `?${requestPolicy.initialQuery}`
    || requestUrl.searchParams.has(requestPolicy.audienceName)
    || Buffer.byteLength(requestUrl.href) > requestPolicy.maximumRequestUrlBytes
  ) throw new Error("Sigstore signing GitHub OIDC request URL is outside the exact authority");
  return { requestToken: environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN, requestUrl, signer };
};

const genericTransportError = () => new Error("Sigstore exact HTTPS transport failed");

export const parseStrictJsonWithoutDuplicateKeys = (text, maximumDepth) => {
  if (
    typeof text !== "string"
    || !Number.isSafeInteger(maximumDepth)
    || maximumDepth <= 0
    || maximumDepth > 256
  ) throw new Error("strict JSON input is invalid");
  let index = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/u.test(text[index] ?? "")) index += 1;
  };
  const string = () => {
    const start = index;
    if (text[index] !== '"') throw new Error("strict JSON string is invalid");
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      if (character === "\\") {
        index += 1;
        const escaped = text[index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 1, index + 5))) {
            throw new Error("strict JSON Unicode escape is invalid");
          }
          index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)) {
          throw new Error("strict JSON escape is invalid");
        }
        index += 1;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) {
        throw new Error("strict JSON string is invalid");
      }
      index += 1;
    }
    throw new Error("strict JSON string is unterminated");
  };
  const value = (depth) => {
    if (depth > maximumDepth) throw new Error("strict JSON nesting is excessive");
    whitespace();
    const character = text[index];
    if (character === '"') {
      string();
      return;
    }
    if (character === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error("strict JSON contains a duplicate object key");
        keys.add(key);
        whitespace();
        if (text[index] !== ":") throw new Error("strict JSON object is invalid");
        index += 1;
        value(depth + 1);
        whitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new Error("strict JSON object is invalid");
        index += 1;
      }
    }
    if (character === "[") {
      index += 1;
      whitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        value(depth + 1);
        whitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new Error("strict JSON array is invalid");
        index += 1;
      }
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0];
    if (number === undefined) throw new Error("strict JSON value is invalid");
    index += number.length;
  };
  whitespace();
  value(1);
  whitespace();
  if (index !== text.length) throw new Error("strict JSON has trailing input");
  return JSON.parse(text);
};

const exactTerminalResponseHeaders = (response) => {
  if (!Array.isArray(response.rawHeaders) || response.rawHeaders.length % 2 !== 0) return undefined;
  const raw = new Map();
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    const value = response.rawHeaders[index + 1];
    if (
      typeof name !== "string"
      || typeof value !== "string"
      || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)
      || value !== value.trim()
      || /[\r\n]/u.test(value)
    ) return undefined;
    const normalizedName = name.toLowerCase();
    const values = raw.get(normalizedName) ?? [];
    values.push(value);
    raw.set(normalizedName, values);
  }
  if ([...raw.values()].some((values) => values.length !== 1)) return undefined;
  if (!isRecord(response.headersDistinct)) return undefined;
  for (
    const name of [
      "content-type",
      "content-length",
      "content-encoding",
      "content-range",
      "location",
      "transfer-encoding",
    ]
  ) {
    const rawValues = raw.get(name);
    const distinctValues = response.headersDistinct[name];
    if (
      rawValues === undefined
        ? distinctValues !== undefined
        : !Array.isArray(distinctValues)
          || distinctValues.some((value) => typeof value !== "string")
          || JSON.stringify(rawValues) !== JSON.stringify(distinctValues)
    ) return undefined;
  }
  return raw;
};

export const requestBoundedJsonNoRedirect = ({
  url,
  method,
  headers = {},
  bodyBytes,
  successStatus,
  maximumRequestBytes,
  maximumResponseBytes,
  maximumJsonDepth,
  minimumTlsVersion,
  requestInactivityTimeoutMilliseconds,
  sequenceTotalTimeoutMilliseconds,
  requestImplementation = httpsRequest,
}) => new Promise((resolveRequest, rejectRequest) => {
  const requestBody = bodyBytes === undefined ? undefined : Buffer.from(bodyBytes);
  if (
    !(url instanceof URL)
    || url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.port !== ""
    || url.hash !== ""
    || !["GET", "POST"].includes(method)
    || !Number.isSafeInteger(successStatus)
    || successStatus < 200
    || successStatus > 299
    || !Number.isSafeInteger(maximumRequestBytes)
    || maximumRequestBytes < 0
    || requestBody?.byteLength > maximumRequestBytes
    || !Number.isSafeInteger(maximumResponseBytes)
    || maximumResponseBytes <= 0
    || !Number.isSafeInteger(maximumJsonDepth)
    || maximumJsonDepth <= 0
    || maximumJsonDepth > 256
    || minimumTlsVersion !== "TLSv1.2"
    || !Number.isSafeInteger(requestInactivityTimeoutMilliseconds)
    || requestInactivityTimeoutMilliseconds <= 0
    || !Number.isSafeInteger(sequenceTotalTimeoutMilliseconds)
    || sequenceTotalTimeoutMilliseconds < requestInactivityTimeoutMilliseconds
  ) {
    rejectRequest(genericTransportError());
    return;
  }
  let settled = false;
  let request;
  const finish = (operation, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(totalTimer);
    operation(value);
  };
  const fail = () => {
    request?.destroy();
    finish(rejectRequest, genericTransportError());
  };
  const totalTimer = setTimeout(fail, sequenceTotalTimeoutMilliseconds);
  const exactHeaders = {
    Accept: "application/json",
    "Accept-Encoding": "identity",
    Connection: "close",
    ...headers,
    ...(requestBody === undefined ? {} : { "Content-Length": `${requestBody.byteLength}` }),
  };
  try {
    request = requestImplementation(url, {
      agent: false,
      ca: rootCertificates,
      headers: exactHeaders,
      hostname: url.hostname,
      joinDuplicateHeaders: false,
      method,
      minVersion: minimumTlsVersion,
      path: `${url.pathname}${url.search}`,
      rejectUnauthorized: true,
      servername: url.hostname,
    }, (response) => {
      const terminalHeaders = exactTerminalResponseHeaders(response);
      const contentTypes = terminalHeaders?.get("content-type");
      const contentLengths = terminalHeaders?.get("content-length");
      const contentEncodings = terminalHeaders?.get("content-encoding");
      const locations = terminalHeaders?.get("location");
      const contentRanges = terminalHeaders?.get("content-range");
      const transferEncodings = terminalHeaders?.get("transfer-encoding");
      const contentLength = Array.isArray(contentLengths) && contentLengths.length === 1
        ? contentLengths[0]
        : undefined;
      if (
        terminalHeaders === undefined
        || response.statusCode !== successStatus
        || !Array.isArray(contentTypes)
        || contentTypes.length !== 1
        || contentTypes[0] !== "application/json"
        || (contentLengths !== undefined && contentLengths.length !== 1)
        || contentEncodings !== undefined
        || locations !== undefined
        || contentRanges !== undefined
        || (contentLength === undefined) === (transferEncodings === undefined)
        || (transferEncodings !== undefined
          && (transferEncodings.length !== 1
            || transferEncodings[0] !== "chunked"
            || contentLength !== undefined))
        || (contentLength !== undefined
          && (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength)
            || Number(contentLength) > maximumResponseBytes))
      ) {
        response.resume?.();
        fail();
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        if (settled) return;
        const value = Buffer.from(chunk);
        bytes += value.byteLength;
        if (bytes > maximumResponseBytes) {
          fail();
          return;
        }
        chunks.push(value);
      });
      response.once("aborted", fail);
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        try {
          if (
            response.complete !== true
            || (contentLength !== undefined && bytes !== Number(contentLength))
          ) throw new Error("partial");
          const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
          finish(resolveRequest, parseStrictJsonWithoutDuplicateKeys(text, maximumJsonDepth));
        } catch {
          fail();
        }
      });
    });
    request.once("error", fail);
    request.setTimeout(requestInactivityTimeoutMilliseconds, fail);
    request.end(requestBody);
  } catch {
    fail();
  }
});

export const decodeStrictJwtSubject = (token, maximumJsonDepth) => {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) {
    throw new Error("Sigstore OIDC identity token is invalid");
  }
  let body;
  try {
    const bytes = Buffer.from(parts[1], "base64url");
    if (bytes.byteLength === 0 || bytes.byteLength > 16_384 || bytes.toString("base64url") !== parts[1]) {
      throw new Error("invalid");
    }
    body = parseStrictJsonWithoutDuplicateKeys(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      maximumJsonDepth,
    );
  } catch {
    throw new Error("Sigstore OIDC identity token is invalid");
  }
  if (!isRecord(body) || typeof body.sub !== "string" || body.sub.length === 0 || body.sub.length > 1_024) {
    throw new Error("Sigstore OIDC identity token is invalid");
  }
  return body.sub;
};

const canonicalPemCertificate = (value) => {
  if (typeof value !== "string" || /\r/u.test(value)) throw new Error("Sigstore certificate response is invalid");
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (
    lines.length < 3
    || lines[0] !== "-----BEGIN CERTIFICATE-----"
    || lines.at(-1) !== "-----END CERTIFICATE-----"
    || lines.slice(1, -1).some((line) => !/^[A-Za-z0-9+/]{1,64}={0,2}$/u.test(line))
  ) throw new Error("Sigstore certificate response is invalid");
  const encoded = lines.slice(1, -1).join("");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== encoded) {
    throw new Error("Sigstore certificate response is invalid");
  }
  return { bytes, pem: `${lines.join("\n")}\n` };
};

class GitHubActionsOidcProvider {
  #authority;

  constructor(authority) {
    this.#authority = { ...authority };
  }

  async getToken() {
    const authority = this.#authority;
    this.#authority = undefined;
    if (authority === undefined) throw new Error("GitHub OIDC request authority was already consumed");
    const url = new URL(authority.requestUrl);
    const requestPolicy = authority.signer.oidc.request;
    url.searchParams.set(requestPolicy.audienceName, authority.signer.oidc.audience);
    if (Buffer.byteLength(url.href) > requestPolicy.maximumRequestUrlBytes) {
      throw new Error("GitHub OIDC request URL is oversized");
    }
    const response = await requestBoundedJsonNoRedirect({
      url,
      method: requestPolicy.method,
      headers: { Authorization: `Bearer ${authority.requestToken}` },
      successStatus: requestPolicy.successStatus,
      maximumRequestBytes: 0,
      maximumResponseBytes: requestPolicy.maximumResponseBytes,
      maximumJsonDepth: authority.signer.transport.maximumJsonDepth,
      minimumTlsVersion: authority.signer.transport.minimumTlsVersion,
      requestInactivityTimeoutMilliseconds: requestPolicy.requestInactivityTimeoutMilliseconds,
      sequenceTotalTimeoutMilliseconds: requestPolicy.sequenceTotalTimeoutMilliseconds,
    });
    const body = exactKeys(response, ["value"], "GitHub OIDC response");
    if (
      typeof body.value !== "string"
      || body.value.length === 0
      || body.value.length > 16_384
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(body.value)
    ) throw new Error("GitHub OIDC response contains no canonical JWT");
    return body.value;
  }
}

export const exactSigstoreEndpointUrl = (endpoint) => {
  const origin = exactHttpsOrigin(endpoint.origin, "Sigstore endpoint origin");
  const url = new URL(endpoint.path, `${origin}/`);
  if (
    url.origin !== origin
    || url.pathname !== endpoint.path
    || url.search !== ""
    || url.hash !== ""
  ) throw new Error("Sigstore endpoint escaped its exact origin or path");
  return url;
};

class ExactFulcioSigner {
  #identityProvider;
  #policy;

  constructor({ identityProvider, policy }) {
    this.#identityProvider = identityProvider;
    this.#policy = policy;
  }

  async sign(data) {
    let identityToken = await this.#identityProvider.getToken();
    try {
      const subject = decodeStrictJwtSubject(identityToken, this.#policy.transport.maximumJsonDepth);
      const keypair = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const publicKey = keypair.publicKey.export({ format: "pem", type: "spki" }).toString("ascii");
      const proof = cryptoSign("sha256", Buffer.from(subject), keypair.privateKey);
      const request = {
        credentials: { oidcIdentityToken: identityToken },
        publicKeyRequest: {
          publicKey: { algorithm: "ECDSA", content: publicKey },
          proofOfPossession: proof.toString("base64"),
        },
      };
      const transport = this.#policy.transport;
      const endpoint = transport.fulcio;
      const response = await requestBoundedJsonNoRedirect({
        url: exactSigstoreEndpointUrl(endpoint),
        method: endpoint.method,
        headers: { "Content-Type": transport.responseContentType },
        bodyBytes: Buffer.from(canonicalJson(request)),
        successStatus: endpoint.successStatus,
        maximumRequestBytes: endpoint.maximumRequestBytes,
        maximumResponseBytes: endpoint.maximumResponseBytes,
        maximumJsonDepth: transport.maximumJsonDepth,
        minimumTlsVersion: transport.minimumTlsVersion,
        requestInactivityTimeoutMilliseconds: transport.requestInactivityTimeoutMilliseconds,
        sequenceTotalTimeoutMilliseconds: transport.sequenceTotalTimeoutMilliseconds,
      });
      const signed = exactKeys(response, ["signedCertificateEmbeddedSct"], "Fulcio response");
      const embedded = exactKeys(
        signed.signedCertificateEmbeddedSct,
        ["chain"],
        "Fulcio embedded certificate response",
      );
      const chain = exactKeys(embedded.chain, ["certificates"], "Fulcio certificate chain");
      if (!Array.isArray(chain.certificates) || chain.certificates.length === 0) {
        throw new Error("Fulcio certificate chain is empty");
      }
      const certificate = canonicalPemCertificate(chain.certificates[0]).pem;
      return {
        signature: cryptoSign("sha256", data, keypair.privateKey),
        key: { $case: "x509Certificate", certificate },
      };
    } finally {
      identityToken = "";
    }
  }
}

class ExactRekorWitness {
  #policy;

  constructor(policy) {
    this.#policy = policy;
  }

  async testify(content, certificate) {
    if (content?.$case !== "dsseEnvelope" || !isRecord(content.dsseEnvelope)) {
      throw new Error("Rekor witness received no DSSE envelope");
    }
    const endpoint = this.#policy.transport.rekor;
    const certificateBytes = canonicalPemCertificate(certificate).bytes;
    const createEntryRequest = {
      spec: {
        $case: "dsseRequestV002",
        dsseRequestV002: {
          envelope: content.dsseEnvelope,
          verifiers: [{
            keyDetails: PublicKeyDetails[endpoint.publicKeyDetails],
            verifier: {
              $case: "x509Certificate",
              x509Certificate: { rawBytes: certificateBytes },
            },
          }],
        },
      },
    };
    const transport = this.#policy.transport;
    const response = await requestBoundedJsonNoRedirect({
      url: exactSigstoreEndpointUrl(endpoint),
      method: endpoint.method,
      headers: { "Content-Type": transport.responseContentType },
      bodyBytes: Buffer.from(canonicalJson(CreateEntryRequest.toJSON(createEntryRequest))),
      successStatus: endpoint.successStatus,
      maximumRequestBytes: endpoint.maximumRequestBytes,
      maximumResponseBytes: endpoint.maximumResponseBytes,
      maximumJsonDepth: transport.maximumJsonDepth,
      minimumTlsVersion: transport.minimumTlsVersion,
      requestInactivityTimeoutMilliseconds: transport.requestInactivityTimeoutMilliseconds,
      sequenceTotalTimeoutMilliseconds: transport.sequenceTotalTimeoutMilliseconds,
    });
    let entry;
    try {
      entry = TransparencyLogEntry.fromJSON(response);
      if (canonicalJson(TransparencyLogEntry.toJSON(entry)) !== canonicalJson(response)) throw new Error("changed");
    } catch {
      throw new Error("Rekor response is not one canonical transparency-log entry");
    }
    if (entry.logId === undefined || entry.kindVersion === undefined) {
      throw new Error("Rekor response has no log or kind identity");
    }
    return { tlogEntries: [entry] };
  }
}

export const runOpaqueSigstoreSigningOperation = async (operation) => {
  if (typeof operation !== "function") throw new Error("Sigstore signing operation is absent");
  try {
    return await operation();
  } catch {
    throw new Error("Sigstore signing operation failed without credential details");
  }
};

export const signCanonicalSigstoreDsse = async ({
  contract,
  identity,
  payloadBytes,
  sourceSha,
  environment = process.env,
}) => {
  if (!(payloadBytes instanceof Uint8Array) || payloadBytes.byteLength === 0) {
    throw new Error("Sigstore DSSE signing payload is empty");
  }
  let payload;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
    payload = JSON.parse(text);
    if (text !== canonicalJson(payload)) throw new Error("noncanonical");
  } catch {
    throw new Error("Sigstore DSSE signing payload is not canonical UTF-8 JSON");
  }
  const verifier = contract?.releaseCertification?.readiness?.externalEvidenceAuthentication?.verifier;
  if (
    verifier?.runtime?.executable !== "node"
    || verifier.runtime.version !== "24.14.1"
    || verifier.payloadType !== "application/vnd.effect-build.release-evidence+json;version=1"
  ) throw new Error("Sigstore DSSE signing contract is not exact");
  assertReadinessArtifactAllowed(contract);
  exactKeys(payload, verifier.payloadFields, "Sigstore DSSE signing payload");
  const authentication = contract.releaseCertification.readiness.externalEvidenceAuthentication;
  const identityMatches = authentication.producerIdentities.filter((entry) => entry?.role === payload.role);
  if (identityMatches.length !== 1) throw new Error("Sigstore DSSE signer has no unique contract-pinned identity");
  const definition = contract.releaseCertification.readiness.evidenceRoles.find((entry) => entry.role === payload.role);
  const pinnedIdentity = validateProducerIdentityPolicy({
    authentication,
    identity: identityMatches[0],
    role: payload.role,
    verifier,
  });
  const receiptBytes = typeof payload.receiptBase64 === "string" && payload.receiptBase64.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload.receiptBase64)
    ? Buffer.from(payload.receiptBase64, "base64")
    : undefined;
  const observedAt = Date.parse(payload.observedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (
    !isRecord(definition)
    || definition.type !== "externalObservation"
    || canonicalJson(identity) !== canonicalJson(pinnedIdentity)
    || payload.schema !== verifier.payloadProtocol
    || payload.producerWorkflow !== pinnedIdentity.workflow
    || payload.producerSourceSha !== sourceSha
    || payload.releaseSourceSha !== sourceSha
    || payload.receiptProtocol !== definition.protocol
    || !(receiptBytes instanceof Uint8Array)
    || receiptBytes.toString("base64") !== payload.receiptBase64
    || payload.receiptBytes !== `${receiptBytes.byteLength}`
    || receiptBytes.byteLength === 0
    || receiptBytes.byteLength > verifier.maximumReceiptBytes
    || payload.receiptDigest !== sha256Digest(receiptBytes)
    || !Number.isFinite(observedAt)
    || new Date(observedAt).toISOString() !== payload.observedAt
    || !Number.isFinite(expiresAt)
    || new Date(expiresAt).toISOString() !== payload.expiresAt
    || expiresAt <= observedAt
    || expiresAt - observedAt > definition.maximumValiditySeconds * 1_000
  ) throw new Error("Sigstore DSSE signing identity or source binding changed");
  validateExternalReceiptForProducer({
    contract,
    observedAt: payload.observedAt,
    producerSourceSha: payload.producerSourceSha,
    receiptBytes,
    role: payload.role,
    sourceSha: payload.releaseSourceSha,
  });
  const { dependency, entryPath } = resolveSigningPackage({ contract, root: repositoryRoot });
  const oidc = validateSigstoreSigningEnvironment({ contract, environment, identity, sourceSha });
  const identityProvider = new GitHubActionsOidcProvider(oidc);
  oidc.requestToken = "";
  delete environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  delete environment.ACTIONS_ID_TOKEN_REQUEST_URL;
  const imported = await import(pathToFileURL(entryPath).href);
  const DSSEBundleBuilder = imported.DSSEBundleBuilder ?? imported.default?.DSSEBundleBuilder;
  if (typeof DSSEBundleBuilder !== "function" || dependency.entrySource !== "dist/bundler/dsse.js") {
    throw new Error("Sigstore signing DSSE primitive is absent");
  }
  const signerPolicy = sigstoreSignerPolicyFromContract(contract);
  const signer = new ExactFulcioSigner({ identityProvider, policy: signerPolicy });
  const witness = new ExactRekorWitness(signerPolicy);
  const builder = new DSSEBundleBuilder({ signer, witnesses: [witness] });
  const signedBundle = await runOpaqueSigstoreSigningOperation(() =>
    builder.create({ data: Buffer.from(payloadBytes), type: verifier.payloadType })
  );
  const bundle = bundleToJSON(signedBundle);
  const bundleBytes = Buffer.from(canonicalJson(bundle));
  validateSigstoreBundleTransport({ bundleBytes, contract });
  if (
    bundle.dsseEnvelope.payloadType !== verifier.payloadType
    || !Buffer.from(bundle.dsseEnvelope.payload, "base64").equals(Buffer.from(payloadBytes))
  ) throw new Error("Sigstore DSSE bundle changed the canonical payload");
  return bundleBytes;
};
