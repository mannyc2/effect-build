#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";

const inputSchema = "effect-build/release-authority-observation@4";
const outputSchema = "effect-build/release-authority-audit@4";
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = resolve(repositoryRoot, "tooling/effect-build-contract.json");
// This is npm's authenticated settings/raw-response projection, not the
// contract's semantic trustedPublisher.permission (`publish`). If npm omits
// this projection, the audit records it as unobserved.
const maximumInventoryEntries = 1_000;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expected) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

const exactStringArray = (value) => Array.isArray(value)
  && value.every((entry) => typeof entry === "string")
  && new Set(value).size === value.length;

const sameStrings = (left, right) => exactStringArray(left)
  && exactStringArray(right)
  && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const exactClient = (value) => hasExactKeys(value, ["node", "npm"])
  && /^\d+\.\d+\.\d+$/u.test(value.node)
  && /^\d+\.\d+\.\d+$/u.test(value.npm);

export const authenticateGeneratedContract = async (contract, root = repositoryRoot) => {
  const inputs = await readInputs(root);
  const generated = validateContract(buildContract(inputs), inputs);
  if (renderJson(contract) !== renderJson(generated)) {
    throw new Error("release authority contract is not the exact generated contract");
  }
  assertPinnedNpmAuthorityObservationClient({ contract: generated, root });
  return generated;
};

const loadAuthenticatedContract = async () => {
  const source = await readFile(contractPath, "utf8");
  const parsed = JSON.parse(source);
  const contract = await authenticateGeneratedContract(parsed);
  if (source !== renderJson(contract)) {
    throw new Error("release authority contract bytes are noncanonical");
  }
  return contract;
};

export const releaseAuthorityPolicyFromContract = (contract) => {
  if (!isObject(contract) || contract.schema !== "effect-build/combined-contract@1") {
    throw new Error("unsupported combined contract");
  }
  const projection = contract.publicApiProjection;
  const registry = contract.npmRegistryBoundary;
  const release = contract.releaseCertification;
  const admission = isObject(registry) ? registry.publicationAdmission : undefined;
  const trustedPublisher = isObject(registry) ? registry.trustedPublisher : undefined;
  const publicAdmission = isObject(release) ? release.publicAdmission : undefined;
  const oidcCertification = isObject(release) ? release.npmOidcCertification : undefined;
  const fakeRegistry = isObject(release) ? release.fakeRegistry : undefined;
  const githubAuthority = isObject(release) ? release.githubAuthority : undefined;
  const npmAuthorityObservation = isObject(release) ? release.npmAuthorityObservation : undefined;
  const readiness = isObject(release) ? release.readiness : undefined;
  const npmAuthorityReceipt = isObject(readiness) && isObject(readiness.externalReceipts)
    ? readiness.externalReceipts.npmAuthority
    : undefined;
  if (
    !isObject(projection)
    || projection.authority !== "derived-projection-only"
    || !isObject(projection.packages)
    || !isObject(registry)
    || !isObject(admission)
    || admission.source !== "publicApiProjection.packages"
    || !isObject(trustedPublisher)
    || !hasExactKeys(trustedPublisher, ["environment", "permission", "repository", "workflow"])
    || trustedPublisher.permission !== "publish"
    || !isObject(release)
    || !isObject(publicAdmission)
    || publicAdmission.packageSource !== "publicApiProjection.packages"
    || !isObject(oidcCertification)
    || !isObject(fakeRegistry)
    || !isObject(githubAuthority)
    || !isObject(npmAuthorityObservation)
    || !isObject(npmAuthorityReceipt)
  ) {
    throw new Error("malformed release authority contract");
  }

  const packageNames = Object.keys(projection.packages).sort();
  const admittedPackages = admission.packages;
  const reservationPackages = registry.reservation?.packages;
  if (
    packageNames.length === 0
    || !exactStringArray(admittedPackages)
    || JSON.stringify(admittedPackages) !== JSON.stringify([...admittedPackages].sort())
    || !sameStrings(packageNames, admittedPackages)
    || publicAdmission.packageCount !== packageNames.length
    || !exactStringArray(projection.privatePackages)
    || packageNames.some((name) => projection.privatePackages.includes(name))
    || !exactStringArray(reservationPackages)
    || !sameStrings(reservationPackages, projection.privatePackages)
  ) {
    throw new Error("release authority public projection drift");
  }

  const forbiddenEnvironmentNames = oidcCertification.forbiddenEnvironmentNames;
  const exactProtectedBody = fakeRegistry.exactProtectedBody;
  const exactProtectedBodyCertification = fakeRegistry.exactProtectedBodyCertification;
  const hypotheticalStateMachine = fakeRegistry.hypotheticalStateMachine;
  const forbiddenCase = Array.isArray(hypotheticalStateMachine?.cases)
    ? hypotheticalStateMachine.cases.find((entry) =>
      isObject(entry) && entry.id === "forbidden-protected-environment"
    )
    : undefined;
  if (
    !exactStringArray(forbiddenEnvironmentNames)
    || forbiddenEnvironmentNames.length === 0
    || forbiddenEnvironmentNames.some((name) => !/^[A-Z][A-Z0-9_]*$/u.test(name))
    || !isObject(exactProtectedBody)
    || exactProtectedBody.status !== "two-purpose-hard-cut"
    || exactProtectedBody.realBlockedMutationCount !== 0
    || exactProtectedBody.realGateSource
      !== "releaseCertification.readiness.externalEvidenceAuthentication"
    || exactProtectedBody.fakeGateSource
      !== "releaseCertification.fakeRegistry.exactProtectedBodyCertification.certificationPurpose"
    || !isObject(exactProtectedBodyCertification)
    || exactProtectedBodyCertification.implementationStatus !== "implemented"
    || exactProtectedBodyCertification.status !== readiness.externalEvidenceAuthentication.status
    || exactProtectedBodyCertification.gateSource
      !== "releaseCertification.readiness.externalEvidenceAuthentication"
    || !isObject(hypotheticalStateMachine)
    || hypotheticalStateMachine.status
      !== "reference-oracle-only-not-certification"
    || !isObject(forbiddenCase)
    || !sameStrings(forbiddenEnvironmentNames, forbiddenCase.variants)
  ) {
    throw new Error("release authority forbidden-name policy drift");
  }

  const registryClient = registry.client;
  const certificationClient = oidcCertification.client;
  if (
    !exactClient(registryClient)
    || !exactClient(certificationClient)
    || registryClient.node !== certificationClient.node
    || registryClient.npm !== certificationClient.npm
  ) {
    throw new Error("release authority npm client drift");
  }
  if (
    typeof registry.registry !== "string"
    || typeof trustedPublisher.repository !== "string"
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(trustedPublisher.repository)
    || typeof trustedPublisher.workflow !== "string"
    || !/^[A-Za-z0-9_.-]+\.ya?ml$/u.test(trustedPublisher.workflow)
    || typeof trustedPublisher.environment !== "string"
    || !/^[A-Za-z0-9_.-]+$/u.test(trustedPublisher.environment)
  ) {
    throw new Error("malformed release authority identity");
  }
  const branchPolicy = githubAuthority.branchPolicy;
  const reviewer = githubAuthority.reviewer;
  const oidcSubjectPolicy = githubAuthority.oidcSubjectPolicy;
  const rawAllowedActionProjection = npmAuthorityObservation.rawAllowedActionProjection;
  const authorityClient = npmAuthorityObservation.client;
  const legacyTokenAuthority = npmAuthorityObservation.legacyTokenAuthority;
  const publishingAccess = npmAuthorityObservation.publishingAccess;
  if (
    githubAuthority.identitySource !== "npmRegistryBoundary.trustedPublisher"
    || githubAuthority.repository !== trustedPublisher.repository
    || githubAuthority.workflow !== trustedPublisher.workflow
    || githubAuthority.environment !== trustedPublisher.environment
    || githubAuthority.expectedEnvironmentSubject
      !== `repo:${trustedPublisher.repository}:environment:${trustedPublisher.environment}`
    || !isObject(branchPolicy)
    || typeof branchPolicy.name !== "string"
    || branchPolicy.name.length === 0
    || branchPolicy.type !== "branch"
    || !isObject(branchPolicy.deploymentBranchPolicy)
    || typeof branchPolicy.deploymentBranchPolicy.customBranchPolicies !== "boolean"
    || typeof branchPolicy.deploymentBranchPolicy.protectedBranches !== "boolean"
    || !exactStringArray(branchPolicy.exactProtectionRuleTypes)
    || !isObject(reviewer)
    || !Number.isSafeInteger(reviewer.id)
    || reviewer.id <= 0
    || typeof reviewer.login !== "string"
    || reviewer.login.length === 0
    || typeof reviewer.type !== "string"
    || typeof reviewer.preventSelfReview !== "boolean"
    || !isObject(oidcSubjectPolicy)
    || typeof oidcSubjectPolicy.use_default !== "boolean"
    || typeof oidcSubjectPolicy.use_immutable_subject !== "boolean"
    || typeof oidcSubjectPolicy.sub_claim_prefix !== "string"
    || oidcSubjectPolicy.sub_claim_prefix.length === 0
    || !exactStringArray(rawAllowedActionProjection)
    || rawAllowedActionProjection.length === 0
    || !isObject(authorityClient)
    || authorityClient.node !== "24.14.1"
    || authorityClient.npm !== "11.19.1"
    || authorityClient.package !== "npm"
    || authorityClient.installationPackage !== "npm-authority-client"
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(authorityClient.integrity)
    || !/^sha256:[0-9a-f]{64}$/u.test(authorityClient.manifestDigest)
    || authorityClient.minimumSupportedTrustVersion !== "11.15.0"
    || authorityClient.purpose !== "authenticated-authority-observation-only"
    || authorityClient.publishCertificationClientSource !== "releaseCertification.npmOidcCertification.client"
    || authorityClient.status !== "pinned-source-audited-observation-credential-unprovisioned"
    || !hasExactKeys(authorityClient.sourceClosure, [
      "algorithm",
      "scope",
      "entrySource",
      "fileCount",
      "directoryCount",
      "bytes",
      "digest",
    ])
    || authorityClient.sourceClosure.algorithm
      !== "sha256-canonical-json-entry-type-path-bytes-file-sha256-v1"
    || authorityClient.sourceClosure.scope
      !== "entire-realpath-package-tree-no-links-or-nonregular-entries"
    || authorityClient.sourceClosure.entrySource !== "bin/npm-cli.js"
    || !Number.isSafeInteger(authorityClient.sourceClosure.fileCount)
    || authorityClient.sourceClosure.fileCount <= 0
    || !Number.isSafeInteger(authorityClient.sourceClosure.directoryCount)
    || authorityClient.sourceClosure.directoryCount <= 0
    || !Number.isSafeInteger(authorityClient.sourceClosure.bytes)
    || authorityClient.sourceClosure.bytes <= 0
    || !/^sha256:[0-9a-f]{64}$/u.test(authorityClient.sourceClosure.digest)
    || !Array.isArray(authorityClient.auditedSources)
    || authorityClient.auditedSources.length === 0
    || authorityClient.auditedSources.some(({ path, digest }) =>
      typeof path !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(digest)
    )
    || !isObject(legacyTokenAuthority)
    || legacyTokenAuthority.checkId !== "npm.legacyTokenAuthority"
    || !sameStrings(legacyTokenAuthority.command, ["token", "list", "--json"])
    || legacyTokenAuthority.registrySource !== "npmRegistryBoundary.registry"
    || legacyTokenAuthority.authenticatedAccount !== "mannyc1"
    || legacyTokenAuthority.authorityPackageSource
      !== "publicApiProjection.packages-plus-npmRegistryBoundary.reservation.packages"
    || !sameStrings(legacyTokenAuthority.maintainerCommand, ["view", "<package>", "maintainers", "--json"])
    || legacyTokenAuthority.maintainerTarget !== "exact-sole-maintainer-equals-authenticated-account"
    || legacyTokenAuthority.target !== "zero-active-npm-access-tokens-after-legacy-token-remediation"
    || legacyTokenAuthority.unknownTokenTypeOrScope !== "blocking"
    || !sameStrings(legacyTokenAuthority.sanitizedProjectionFields, [
      "activeTokenCount",
      "activeLegacyWriteCapableTokenCount",
      "unknownTokenCount",
      "metadataDigest",
    ])
    || legacyTokenAuthority.retainedCredentialMetadata !== "none"
    || !isObject(legacyTokenAuthority.observationCredential)
    || legacyTokenAuthority.observationCredential.currentStatus !== "unprovisioned-stop"
    || !hasExactKeys(legacyTokenAuthority.observationCredential.supportedProof, [
      "authority",
      "accountEntitlement",
      "operations",
      "persistence",
      "destruction",
    ])
    || legacyTokenAuthority.observationCredential.supportedProof.authority
      !== "ephemeral-non-token-session-for-mannyc1"
    || legacyTokenAuthority.observationCredential.supportedProof.accountEntitlement
      !== "write-permission-required-by-npm-trust-api"
    || legacyTokenAuthority.observationCredential.supportedProof.operations
      !== "read-only-observation-only"
    || legacyTokenAuthority.observationCredential.supportedProof.persistence !== "none"
    || legacyTokenAuthority.observationCredential.supportedProof.destruction
      !== "completed-before-sigstore-oidc-signing"
    || !isObject(publishingAccess)
    || publishingAccess.checkIdPrefix !== "npm.publishingAccess."
    || publishingAccess.packageSource
      !== "publicApiProjection.packages-plus-npmRegistryBoundary.reservation.packages"
    || publishingAccess.target !== "require-two-factor-authentication-and-disallow-tokens"
    || !isObject(publishingAccess.observationMechanism)
    || publishingAccess.observationMechanism.status !== "unprovisioned-stop"
    || publishingAccess.observationMechanism.authority
      !== "authenticated-npm-account-with-write-permission-and-two-factor-authentication"
    || publishingAccess.observationMechanism.interface
      !== "supported-authenticated-npm-web-or-registry-observation-required"
    || publishingAccess.observationMechanism.endpoint !== "unqualified-and-forbidden-to-invent"
    || npmAuthorityObservation.semantics
      !== "authenticated-npm-settings-raw-projection-not-trustedPublisher.permission"
    || npmAuthorityReceipt.role !== "npm-authority"
    || npmAuthorityReceipt.identity
      !== `npm-github-authority:${trustedPublisher.repository}:environment:${trustedPublisher.environment}`
  ) {
    throw new Error("malformed generated GitHub/npm authority policy");
  }
  const registryUrl = new URL(registry.registry);
  if (
    registryUrl.protocol !== "https:"
    || registryUrl.username !== ""
    || registryUrl.password !== ""
    || registryUrl.pathname !== "/"
    || registryUrl.search !== ""
    || registryUrl.hash !== ""
  ) {
    throw new Error("malformed release authority registry");
  }

  return Object.freeze({
    branchPolicy: Object.freeze({
      ...branchPolicy,
      deploymentBranchPolicy: Object.freeze({ ...branchPolicy.deploymentBranchPolicy }),
      exactProtectionRuleTypes: Object.freeze([...branchPolicy.exactProtectionRuleTypes]),
    }),
    environment: trustedPublisher.environment,
    expectedEnvironmentSubject: githubAuthority.expectedEnvironmentSubject,
    forbiddenEnvironmentNames: Object.freeze([...forbiddenEnvironmentNames]),
    npmClient: Object.freeze({ node: authorityClient.node, npm: authorityClient.npm }),
    npmAuthorityClient: Object.freeze(structuredClone(authorityClient)),
    legacyTokenAuthority: Object.freeze(structuredClone(legacyTokenAuthority)),
    oidcSubjectPolicy: Object.freeze({ ...oidcSubjectPolicy }),
    packageNames: Object.freeze(packageNames),
    authorityPackageNames: Object.freeze([...packageNames, ...reservationPackages].sort()),
    rawAllowedActionProjection: Object.freeze([...rawAllowedActionProjection]),
    publishingAccess: Object.freeze(structuredClone(publishingAccess)),
    auditIdentity: npmAuthorityReceipt.identity,
    registry: registryUrl.href.replace(/\/$/u, ""),
    repository: trustedPublisher.repository,
    repositoryUrl: `git+https://github.com/${trustedPublisher.repository}.git`,
    reviewer: Object.freeze({ ...reviewer }),
    semanticPermission: trustedPublisher.permission,
    workflow: trustedPublisher.workflow,
  });
};

const projectNpmAuthoritySourceClosure = (packageRoot) => {
  const entries = [];
  let bytes = 0;
  let directoryCount = 0;
  let fileCount = 0;
  const visit = (directory, prefix = "") => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const child of children) {
      const path = prefix === "" ? child.name : `${prefix}/${child.name}`;
      const absolute = resolve(directory, child.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`npm authority observation client source closure contains a link: ${path}`);
      if (stat.isDirectory()) {
        directoryCount += 1;
        entries.push(["directory", path]);
        visit(absolute, path);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`npm authority observation client source closure contains a nonregular entry: ${path}`);
      }
      const source = readFileSync(absolute);
      bytes += source.byteLength;
      fileCount += 1;
      entries.push(["file", path, source.byteLength, createHash("sha256").update(source).digest("hex")]);
    }
  };
  visit(packageRoot);
  return Object.freeze({
    algorithm: "sha256-canonical-json-entry-type-path-bytes-file-sha256-v1",
    scope: "entire-realpath-package-tree-no-links-or-nonregular-entries",
    entrySource: "bin/npm-cli.js",
    fileCount,
    directoryCount,
    bytes,
    digest: `sha256:${createHash("sha256").update(`${JSON.stringify(entries)}\n`).digest("hex")}`,
  });
};

const resolvePinnedNpmAuthorityObservationClient = ({ contract, root = repositoryRoot }) => {
  const policy = releaseAuthorityPolicyFromContract(contract);
  const client = policy.npmAuthorityClient;
  const nodeModulesPath = resolve(root, "node_modules");
  const packageAliasPath = resolve(nodeModulesPath, client.installationPackage);
  const nodeModulesRoot = realpathSync(nodeModulesPath);
  const packageRoot = realpathSync(packageAliasPath);
  const packageRelative = relative(nodeModulesRoot, packageRoot);
  if (packageRelative === "" || packageRelative.startsWith("..")) {
    throw new Error("npm authority observation client package escapes node_modules");
  }
  const packageManifestPath = realpathSync(resolve(packageRoot, "package.json"));
  const packageManifestStat = lstatSync(packageManifestPath);
  const packageManifestBytes = readFileSync(packageManifestPath);
  const packageManifest = JSON.parse(packageManifestBytes);
  if (
    !packageManifestStat.isFile()
    || packageManifestStat.isSymbolicLink()
    || dirname(packageManifestPath) !== packageRoot
    || packageManifest.name !== client.package
    || packageManifest.version !== client.npm
    || `sha256:${createHash("sha256").update(packageManifestBytes).digest("hex")}` !== client.manifestDigest
  ) throw new Error("npm authority observation client manifest changed");
  if (JSON.stringify(projectNpmAuthoritySourceClosure(packageRoot)) !== JSON.stringify(client.sourceClosure)) {
    throw new Error("npm authority observation client source closure changed");
  }
  for (const source of client.auditedSources) {
    const sourcePath = realpathSync(resolve(packageRoot, source.path));
    const sourceStat = lstatSync(sourcePath);
    const sourceRelative = relative(packageRoot, sourcePath);
    const sourceDigest = `sha256:${createHash("sha256").update(readFileSync(sourcePath)).digest("hex")}`;
    if (
      !sourceStat.isFile()
      || sourceStat.isSymbolicLink()
      || sourceRelative.startsWith("..")
      || resolve(packageRoot, sourceRelative) !== sourcePath
      || sourceDigest !== source.digest
    ) throw new Error("npm authority observation client source changed");
  }
  const entryPath = realpathSync(resolve(packageRoot, client.sourceClosure.entrySource));
  const entrySource = client.auditedSources.find(({ path }) => path === client.sourceClosure.entrySource);
  if (entrySource === undefined || relative(packageRoot, entryPath).startsWith("..")) {
    throw new Error("npm authority observation client entry source changed");
  }
  return Object.freeze({
    client,
    entryDigest: entrySource.digest,
    entryPath,
    nodeModulesPath,
    nodeModulesRoot,
    packageAliasPath,
    packageRoot,
  });
};

export const assertPinnedNpmAuthorityObservationClient = ({ contract, root = repositoryRoot }) =>
  resolvePinnedNpmAuthorityObservationClient({ contract, root }).client;

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const serialize = (value) => JSON.stringify(canonicalize(value), null, 2) + "\n";

const responseState = (response) => {
  if (!isObject(response) || !Number.isInteger(response.status)) return "unobserved";
  if (response.status === 401) return "e401";
  if (response.status !== 200) return "unobserved";
  return "observed";
};

const responseBody = (response) => isObject(response) ? response.body : undefined;

const copyDefinedEnvironment = (names) => Object.fromEntries(
  names.flatMap((name) => typeof process.env[name] === "string" ? [[name, process.env[name]]] : []),
);

const safeProcessEnvironment = () => copyDefinedEnvironment([
  "PATH",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
]);

const githubConfigDirectory = () => process.env.GH_CONFIG_DIR
  ?? (typeof process.env.XDG_CONFIG_HOME === "string" ? join(process.env.XDG_CONFIG_HOME, "gh") : undefined)
  ?? (typeof process.env.HOME === "string" ? join(process.env.HOME, ".config", "gh") : undefined);

const npmUserConfig = () => process.env.NPM_CONFIG_USERCONFIG
  ?? process.env.npm_config_userconfig
  ?? (typeof process.env.HOME === "string" ? join(process.env.HOME, ".npmrc") : undefined);

const commandEnvironment = (policy, authority) => {
  const authorityEnvironment = authority === "github"
    ? {
      ...copyDefinedEnvironment(["GH_TOKEN", "GITHUB_TOKEN", "GH_HOST"]),
      ...(githubConfigDirectory() === undefined ? {} : { GH_CONFIG_DIR: githubConfigDirectory() }),
    }
    : authority === "npm"
    ? {
      ...(npmUserConfig() === undefined ? {} : { NPM_CONFIG_USERCONFIG: npmUserConfig() }),
      npm_config_loglevel: "silent",
      npm_config_logs_max: "0",
      npm_config_progress: "false",
      npm_config_update_notifier: "false",
    }
    : {};
  const environment = {
    ...safeProcessEnvironment(),
    ...authorityEnvironment,
    CI: "true",
  };
  for (const name of policy.forbiddenEnvironmentNames) delete environment[name];
  return environment;
};

const runReadOnly = (policy, authority, command, args, spawn = spawnSync) => spawn(command, args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: commandEnvironment(policy, authority),
  input: "",
  maxBuffer: 1024 * 1024,
  shell: false,
  timeout: 5_000,
  windowsHide: true,
});

const npmAuthorityInvocation = (runtime, args) => {
  if (
    realpathSync(runtime.nodeModulesPath) !== runtime.nodeModulesRoot
    || realpathSync(runtime.packageAliasPath) !== runtime.packageRoot
    || JSON.stringify(projectNpmAuthoritySourceClosure(runtime.packageRoot))
      !== JSON.stringify(runtime.client.sourceClosure)
  ) throw new Error("npm authority observation client source closure changed immediately before launch");
  const entryPath = realpathSync(runtime.entryPath);
  const entryStat = lstatSync(entryPath);
  const entryDigest = `sha256:${createHash("sha256").update(readFileSync(entryPath)).digest("hex")}`;
  if (
    entryPath !== runtime.entryPath
    || !entryStat.isFile()
    || entryStat.isSymbolicLink()
    || relative(runtime.packageRoot, entryPath).startsWith("..")
    || entryDigest !== runtime.entryDigest
  ) throw new Error("npm authority observation client entry changed immediately before launch");
  return Object.freeze({ command: process.execPath, args: [entryPath, ...args] });
};

const runNpmAuthorityReadOnly = (policy, runtime, args, spawn = spawnSync) => {
  const invocation = npmAuthorityInvocation(runtime, args);
  return runReadOnly(policy, "npm", invocation.command, invocation.args, spawn);
};

const commandResponseStatus = (result) => {
  const diagnostics = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/\bE401\b|\b401 Unauthorized\b/iu.test(diagnostics)) return 401;
  return result.status === 0 ? 200 : 599;
};

const parseCommandJson = (result) => {
  if (result.status !== 0 || typeof result.stdout !== "string" || result.stdout.trim() === "") return undefined;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
};

const collectGithub = (policy, endpoint, projection, spawn = spawnSync) => {
  const args = ["api", endpoint, "--hostname", "github.com"];
  args.push("--jq", projection);
  const result = runReadOnly(policy, "github", "gh", args, spawn);
  const status = commandResponseStatus(result);
  const body = parseCommandJson(result);
  return status === 200 && body !== undefined ? { body, status } : { status: status === 200 ? 598 : status };
};

const collectGithubInventory = (policy, endpoint, collection, spawn = spawnSync) => {
  const projection = `{total_count,${collection}:[.${collection}[]|{name}]}`;
  const result = runReadOnly(policy, "github", "gh", [
    "api",
    endpoint,
    "--hostname",
    "github.com",
    "--paginate",
    "--jq",
    projection,
  ], spawn);
  const status = commandResponseStatus(result);
  if (status !== 200 || typeof result.stdout !== "string" || result.stdout.trim() === "") return { status };
  try {
    const pages = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    const counts = [...new Set(pages.map((page) => isObject(page) ? page.total_count : undefined))];
    const entries = pages.flatMap((page) => isObject(page) && Array.isArray(page[collection]) ? page[collection] : [null]);
    if (
      counts.length !== 1
      || !Number.isInteger(counts[0])
      || counts[0] < 0
      || counts[0] > maximumInventoryEntries
      || entries.some((entry) => !isObject(entry) || typeof entry.name !== "string")
    ) return { status: 598 };
    return { body: { [collection]: entries, total_count: counts[0] }, status };
  } catch {
    return { status: 598 };
  }
};

const projectTrustRecord = (record) => {
  if (!isObject(record)) return null;
  const claims = isObject(record.claims) ? record.claims : {};
  const workflowReference = isObject(claims.workflow_ref) ? claims.workflow_ref : {};
  return {
    environment: record.environment ?? claims.environment,
    file: record.file ?? workflowReference.file,
    ...(Array.isArray(record.permissions) && record.permissions.every((permission) => typeof permission === "string")
      ? { permissions: [...record.permissions] }
      : {}),
    repository: record.repository ?? claims.repository,
    type: record.type,
  };
};

const collectNpmAuthentication = (policy, runtime, spawn = spawnSync) => {
  const result = runNpmAuthorityReadOnly(policy, runtime, ["whoami", "--json", "--registry", policy.registry], spawn);
  const status = commandResponseStatus(result);
  const body = parseCommandJson(result);
  const username = typeof body === "string" ? body : isObject(body) ? body.username : undefined;
  return status === 200 && typeof username === "string" && username.length > 0
    ? { body: { username }, status }
    : { status: status === 200 ? 598 : status };
};

const emptyTokenInventoryDigest = `sha256:${createHash("sha256").update("[]\n").digest("hex")}`;

const collectNpmLegacyTokenAuthority = (policy, runtime, spawn = spawnSync) => {
  const invocation = npmAuthorityInvocation(
    runtime,
    [...policy.legacyTokenAuthority.command, "--registry", policy.registry],
  );
  const result = spawn(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    env: commandEnvironment(policy, "npm"),
    input: Buffer.alloc(0),
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 5_000,
    windowsHide: true,
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
  try {
    const diagnostics = stderr.toString("utf8");
    if (/\bE401\b|\b401 Unauthorized\b/iu.test(diagnostics)) return { status: 401 };
    if (result.status !== 0 || stdout.byteLength === 0) return { status: 599 };
    const inventory = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(stdout));
    if (!Array.isArray(inventory) || inventory.length !== 0) return { status: 598 };
    return {
      body: {
        activeTokenCount: 0,
        activeLegacyWriteCapableTokenCount: 0,
        unknownTokenCount: 0,
        metadataDigest: emptyTokenInventoryDigest,
      },
      status: 200,
    };
  } catch {
    return { status: 598 };
  } finally {
    stdout.fill(0);
    stderr.fill(0);
    result.stdout = Buffer.alloc(0);
    result.stderr = Buffer.alloc(0);
  }
};

const collectNpmMaintainers = (policy, runtime, name, spawn = spawnSync) => {
  const args = policy.legacyTokenAuthority.maintainerCommand.map((entry) =>
    entry === "<package>" ? name : entry
  );
  const result = runNpmAuthorityReadOnly(policy, runtime, [...args, "--registry", policy.registry], spawn);
  const status = commandResponseStatus(result);
  const body = parseCommandJson(result);
  const entries = Array.isArray(body) ? body : isObject(body) ? [body] : undefined;
  if (
    status !== 200
    || !Array.isArray(entries)
    || entries.length === 0
    || entries.some((entry) => !isObject(entry) || typeof entry.name !== "string" || entry.name.length === 0)
  ) return { status: status === 200 ? 598 : status };
  const names = entries.map(({ name: maintainer }) => maintainer);
  if (new Set(names).size !== names.length) return { status: 598 };
  return { body: { names }, status };
};

const collectNpmClient = (policy, runtime, spawn = spawnSync) => {
  const result = runNpmAuthorityReadOnly(policy, runtime, ["--version"], spawn);
  const status = commandResponseStatus(result);
  const version = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return status === 200 && /^\d+\.\d+\.\d+$/u.test(version)
    ? { body: { node: process.versions.node, npm: version }, status }
    : { status: status === 200 ? 598 : status };
};

const collectNpmTrust = (policy, runtime, name, spawn = spawnSync) => {
  const result = runNpmAuthorityReadOnly(
    policy,
    runtime,
    ["trust", "list", name, "--json", "--registry", policy.registry],
    spawn,
  );
  const status = commandResponseStatus(result);
  if (status !== 200) return { status };
  if (typeof result.stdout !== "string" || result.stdout.trim() === "") return { body: [], status };
  const body = parseCommandJson(result);
  if (body === undefined) return { status: 598 };
  const records = (Array.isArray(body) ? body : [body]).map(projectTrustRecord);
  return records.every((record) => record !== null) ? { body: records, status } : { status: 598 };
};

const exactPackageRepository = (repository, policy, name) => hasExactKeys(repository, ["directory", "type", "url"])
  && repository.type === "git"
  && repository.url === policy.repositoryUrl
  && repository.directory === `packages/${name}`;

export const assertCanonicalPackageRepositoryManifest = (manifest, policy, name) => {
  if (!isObject(manifest) || manifest.name !== name || !exactPackageRepository(manifest.repository, policy, name)) {
    throw new Error(`noncanonical package repository manifest: ${name}`);
  }
  return manifest.repository;
};

const collectPackageRepositories = async (policy, root = repositoryRoot) => {
  const packages = {};
  for (const name of policy.packageNames) {
    const manifest = JSON.parse(await readFile(resolve(root, "packages", name, "package.json"), "utf8"));
    packages[name] = { repository: assertCanonicalPackageRepositoryManifest(manifest, policy, name) };
  }
  return packages;
};

const collectObservation = async (
  policy,
  sourceSha,
  { npmRuntime, root = repositoryRoot, spawn = spawnSync, observedAt = new Date().toISOString() },
) => {
  const client = collectNpmClient(policy, npmRuntime, spawn);
  const observedClient = responseBody(client);
  const clientMatches = observedClient?.node === policy.npmClient.node
    && observedClient?.npm === policy.npmClient.npm;
  const authentication = clientMatches
    ? collectNpmAuthentication(policy, npmRuntime, spawn)
    : { status: 598 };
  const legacyTokenAuthority = authentication.status === 200
    ? collectNpmLegacyTokenAuthority(policy, npmRuntime, spawn)
    : { status: authentication.status };
  const maintainers = {};
  for (const name of policy.authorityPackageNames) {
    maintainers[name] = authentication.status === 200
      ? collectNpmMaintainers(policy, npmRuntime, name, spawn)
      : { status: authentication.status };
  }
  const trust = {};
  for (const name of policy.packageNames) {
    trust[name] = authentication.status === 200
      ? collectNpmTrust(policy, npmRuntime, name, spawn)
      : { status: authentication.status };
  }
  const publishingAccess = Object.fromEntries(
    policy.authorityPackageNames.map((name) => [name, { status: 598 }]),
  );
  const repositoryEndpoint = `repos/${policy.repository}`;
  const environmentEndpoint = `${repositoryEndpoint}/environments/${policy.environment}`;
  return {
    github: {
      environment: {
        branchPolicies: collectGithub(
          policy,
          `${environmentEndpoint}/deployment-branch-policies`,
          "{total_count,branch_policies:[.branch_policies[]|{name,type}]}",
          spawn,
        ),
        details: collectGithub(
          policy,
          environmentEndpoint,
          "{name,deployment_branch_policy,protection_rules:[.protection_rules[]|if .type==\"required_reviewers\" then {type,prevent_self_review,reviewers:[.reviewers[]|{type,reviewer:{login:.reviewer.login,id:.reviewer.id}}]} else {type} end]}",
          spawn,
        ),
        secrets: collectGithubInventory(
          policy,
          `${environmentEndpoint}/secrets?per_page=100`,
          "secrets",
          spawn,
        ),
        variables: collectGithubInventory(
          policy,
          `${environmentEndpoint}/variables?per_page=100`,
          "variables",
          spawn,
        ),
      },
      oidc: collectGithub(
        policy,
        `${repositoryEndpoint}/actions/oidc/customization/sub`,
        "{use_default,use_immutable_subject,sub_claim_prefix}",
        spawn,
      ),
      repository: {
        secrets: collectGithubInventory(
          policy,
          `${repositoryEndpoint}/actions/secrets?per_page=100`,
          "secrets",
          spawn,
        ),
        variables: collectGithubInventory(
          policy,
          `${repositoryEndpoint}/actions/variables?per_page=100`,
          "variables",
          spawn,
        ),
      },
    },
    npm: {
      authentication,
      client,
      legacyTokenAuthority,
      maintainers,
      observationCredential: { status: 598 },
      publishingAccess,
      trust,
    },
    identity: policy.auditIdentity,
    observedAt,
    packages: await collectPackageRepositories(policy, root),
    schema: inputSchema,
    sourceSha,
  };
};

export const collectReleaseAuthorityObservation = async ({
  contract,
  sourceSha,
  root = repositoryRoot,
  spawn = spawnSync,
  observedAt = new Date().toISOString(),
}) => {
  const authenticated = await authenticateGeneratedContract(contract, root);
  const policy = releaseAuthorityPolicyFromContract(authenticated);
  const npmRuntime = resolvePinnedNpmAuthorityObservationClient({ contract: authenticated, root });
  return collectObservation(policy, sourceSha, { npmRuntime, observedAt, root, spawn });
};

const exactReviewer = (reviewer, policy) => isObject(reviewer)
  && reviewer.type === policy.reviewer.type
  && isObject(reviewer.reviewer)
  && reviewer.reviewer.id === policy.reviewer.id
  && reviewer.reviewer.login === policy.reviewer.login;

const exactTrustRecord = (record, policy) => {
  if (!isObject(record) || record.type !== "github") return false;
  const projections = [];
  if (isObject(record.claims)) {
    projections.push({
      environment: record.claims.environment,
      repository: record.claims.repository,
      workflow: isObject(record.claims.workflow_ref) ? record.claims.workflow_ref.file : undefined,
    });
  }
  if ("repository" in record || "file" in record || "environment" in record) {
    projections.push({
      environment: record.environment,
      repository: record.repository,
      workflow: record.file,
    });
  }
  return projections.length > 0 && projections.every((projection) =>
    projection.repository === policy.repository
    && projection.workflow === policy.workflow
    && projection.environment === policy.environment
  );
};

export const auditReleaseAuthority = (observation, policy) => {
  if (
    !isObject(observation)
    || observation.schema !== inputSchema
    || observation.identity !== policy.auditIdentity
    || typeof observation.sourceSha !== "string"
    || !/^[0-9a-f]{40}$/u.test(observation.sourceSha)
    || typeof observation.observedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(observation.observedAt)
    || Number.isNaN(Date.parse(observation.observedAt))
  ) {
    throw new Error("invalid release-authority observation");
  }

  const checks = [];
  const issues = [];
  const addCheck = (id, status, code, subject = id) => {
    checks.push({ id, status });
    if (status !== "match") issues.push({ category: status, code, subject });
  };

  const github = isObject(observation.github) ? observation.github : {};
  const repository = isObject(github.repository) ? github.repository : {};
  const environment = isObject(github.environment) ? github.environment : {};
  const inventoryChecks = [
    ["github.repository.secrets", repository.secrets, "secrets"],
    ["github.repository.variables", repository.variables, "variables"],
    ["github.environment.secrets", environment.secrets, "secrets"],
    ["github.environment.variables", environment.variables, "variables"],
  ];

  for (const [id, response, collection] of inventoryChecks) {
    const state = responseState(response);
    const body = responseBody(response);
    const entries = isObject(body) ? body[collection] : undefined;
    const names = Array.isArray(entries) && entries.every((entry) => isObject(entry) && typeof entry.name === "string")
      ? entries.map(({ name }) => name)
      : undefined;
    if (
      state !== "observed"
      || !Array.isArray(names)
      || !Number.isInteger(body?.total_count)
      || body.total_count < 0
      || body.total_count > maximumInventoryEntries
      || body.total_count !== names.length
      || new Set(names).size !== names.length
    ) {
      addCheck(id, "unobserved", state === "e401" ? "github-inventory-e401" : "github-inventory-unobserved");
      continue;
    }
    const forbiddenNames = new Set(policy.forbiddenEnvironmentNames);
    const present = names.filter((name) => forbiddenNames.has(name)).sort();
    if (present.length === 0) {
      addCheck(id, "match");
    } else {
      checks.push({ id, status: "mismatch" });
      for (const name of present) {
        issues.push({ category: "mismatch", code: "forbidden-name-present", subject: `${id}:${name}` });
      }
    }
  }

  const environmentDetailsState = responseState(environment.details);
  const environmentDetails = responseBody(environment.details);
  if (environmentDetailsState !== "observed" || !isObject(environmentDetails)) {
    addCheck(
      "github.environment.policy",
      "unobserved",
      environmentDetailsState === "e401" ? "environment-policy-e401" : "environment-policy-unobserved",
    );
  } else {
    const rules = environmentDetails.protection_rules;
    const reviewerRules = Array.isArray(rules)
      ? rules.filter((rule) => isObject(rule) && rule.type === "required_reviewers")
      : [];
    const ruleTypes = Array.isArray(rules)
      ? rules.map((rule) => isObject(rule) ? rule.type : undefined).sort()
      : [];
    const reviewerRule = reviewerRules[0];
    const deployment = environmentDetails.deployment_branch_policy;
    const matches = environmentDetails.name === policy.environment
      && JSON.stringify(ruleTypes) === JSON.stringify([...policy.branchPolicy.exactProtectionRuleTypes].sort())
      && reviewerRules.length === 1
      && isObject(reviewerRule)
      && reviewerRule.prevent_self_review === policy.reviewer.preventSelfReview
      && Array.isArray(reviewerRule.reviewers)
      && reviewerRule.reviewers.length === 1
      && exactReviewer(reviewerRule.reviewers[0], policy)
      && isObject(deployment)
      && deployment.custom_branch_policies === policy.branchPolicy.deploymentBranchPolicy.customBranchPolicies
      && deployment.protected_branches === policy.branchPolicy.deploymentBranchPolicy.protectedBranches;
    addCheck(
      "github.environment.policy",
      matches ? "match" : "mismatch",
      "environment-policy-mismatch",
    );
  }

  const branchPolicyState = responseState(environment.branchPolicies);
  const branchPolicyBody = responseBody(environment.branchPolicies);
  if (branchPolicyState !== "observed" || !isObject(branchPolicyBody)) {
    addCheck(
      "github.environment.branchPolicies",
      "unobserved",
      branchPolicyState === "e401" ? "environment-branch-policy-e401" : "environment-branch-policy-unobserved",
    );
  } else {
    const policies = branchPolicyBody.branch_policies;
    const matches = branchPolicyBody.total_count === 1
      && Array.isArray(policies)
      && policies.length === 1
      && isObject(policies[0])
      && policies[0].name === policy.branchPolicy.name
      && policies[0].type === policy.branchPolicy.type;
    addCheck(
      "github.environment.branchPolicies",
      matches ? "match" : "mismatch",
      "environment-branch-policy-mismatch",
    );
  }

  const oidcState = responseState(github.oidc);
  const oidc = responseBody(github.oidc);
  if (oidcState !== "observed" || !isObject(oidc)) {
    addCheck(
      "github.oidc",
      "unobserved",
      oidcState === "e401" ? "oidc-policy-e401" : "oidc-policy-unobserved",
    );
  } else {
    const matches = oidc.use_default === policy.oidcSubjectPolicy.use_default
      && oidc.use_immutable_subject === policy.oidcSubjectPolicy.use_immutable_subject
      && oidc.sub_claim_prefix === policy.oidcSubjectPolicy.sub_claim_prefix;
    addCheck("github.oidc", matches ? "match" : "mismatch", "oidc-policy-mismatch");
  }

  const npm = isObject(observation.npm) ? observation.npm : {};
  const npmClientState = responseState(npm.client);
  const npmClient = responseBody(npm.client);
  if (
    npmClientState !== "observed"
    || !isObject(npmClient)
    || typeof npmClient.node !== "string"
    || typeof npmClient.npm !== "string"
  ) {
    addCheck("npm.client", "unobserved", npmClientState === "e401" ? "npm-client-e401" : "npm-client-unobserved");
  } else {
    addCheck(
      "npm.client",
      npmClient.node === policy.npmClient.node && npmClient.npm === policy.npmClient.npm ? "match" : "mismatch",
      "npm-client-mismatch",
    );
  }

  const authenticationState = responseState(npm.authentication);
  const authenticationBody = responseBody(npm.authentication);
  const observedAuthentication = authenticationState === "observed"
    && isObject(authenticationBody)
    && typeof authenticationBody.username === "string"
    && authenticationBody.username.length > 0;
  const authenticated = observedAuthentication
    && authenticationBody.username === policy.legacyTokenAuthority.authenticatedAccount;
  if (authenticated) {
    addCheck("npm.authentication", "match");
  } else if (observedAuthentication) {
    addCheck("npm.authentication", "mismatch", "npm-authentication-mismatch");
  } else {
    addCheck(
      "npm.authentication",
      "unobserved",
      authenticationState === "e401" ? "npm-authentication-e401" : "npm-authentication-unobserved",
    );
  }

  const legacyTokenState = responseState(npm.legacyTokenAuthority);
  const legacyTokenBody = responseBody(npm.legacyTokenAuthority);
  const credentialState = responseState(npm.observationCredential);
  const credentialBody = responseBody(npm.observationCredential);
  const maintainers = isObject(npm.maintainers) ? npm.maintainers : undefined;
  const maintainerProjectionExact = isObject(maintainers)
    && sameStrings(Object.keys(maintainers), policy.authorityPackageNames);
  const maintainerResponsesObserved = maintainerProjectionExact
    && policy.authorityPackageNames.every((name) => responseState(maintainers[name]) === "observed");
  const maintainerShapesExact = maintainerResponsesObserved
    && policy.authorityPackageNames.every((name) => {
      const body = responseBody(maintainers[name]);
      return hasExactKeys(body, ["names"])
        && exactStringArray(body.names)
        && body.names.length > 0;
    });
  const maintainersMatch = maintainerShapesExact
    && policy.authorityPackageNames.every((name) =>
      sameStrings(responseBody(maintainers[name]).names, [policy.legacyTokenAuthority.authenticatedAccount])
    );
  const legacyTokenShape = hasExactKeys(legacyTokenBody, policy.legacyTokenAuthority.sanitizedProjectionFields)
    && Number.isSafeInteger(legacyTokenBody.activeTokenCount)
    && legacyTokenBody.activeTokenCount >= 0
    && Number.isSafeInteger(legacyTokenBody.activeLegacyWriteCapableTokenCount)
    && legacyTokenBody.activeLegacyWriteCapableTokenCount >= 0
    && Number.isSafeInteger(legacyTokenBody.unknownTokenCount)
    && legacyTokenBody.unknownTokenCount >= 0
    && /^sha256:[0-9a-f]{64}$/u.test(legacyTokenBody.metadataDigest);
  const credentialProof = policy.legacyTokenAuthority.observationCredential.supportedProof;
  if (
    !authenticated
    || legacyTokenState !== "observed"
    || credentialState !== "observed"
    || !maintainerProjectionExact
    || !maintainerResponsesObserved
  ) {
    addCheck(
      policy.legacyTokenAuthority.checkId,
      "unobserved",
      legacyTokenState === "e401" ? "npm-legacy-token-authority-e401" : "npm-legacy-token-authority-unobserved",
    );
  } else if (
    !legacyTokenShape
    || !hasExactKeys(credentialBody, Object.keys(credentialProof))
    || !maintainerShapesExact
  ) {
    addCheck(
      policy.legacyTokenAuthority.checkId,
      "unobserved",
      "npm-legacy-token-authority-unobserved",
    );
  } else {
    const matches = legacyTokenBody.activeTokenCount === 0
      && legacyTokenBody.activeLegacyWriteCapableTokenCount === 0
      && legacyTokenBody.unknownTokenCount === 0
      && legacyTokenBody.metadataDigest === emptyTokenInventoryDigest
      && maintainersMatch
      && JSON.stringify(canonicalize(credentialBody)) === JSON.stringify(canonicalize(credentialProof));
    addCheck(
      policy.legacyTokenAuthority.checkId,
      matches ? "match" : "mismatch",
      "npm-legacy-token-authority-mismatch",
    );
  }

  const publishingAccessProjection = isObject(npm.publishingAccess) ? npm.publishingAccess : undefined;
  const publishingAccessProjectionExact = isObject(publishingAccessProjection)
    && sameStrings(Object.keys(publishingAccessProjection), policy.authorityPackageNames);
  for (const name of policy.authorityPackageNames) {
    const response = publishingAccessProjectionExact ? publishingAccessProjection[name] : undefined;
    const state = responseState(response);
    const body = responseBody(response);
    if (!authenticated || !publishingAccessProjectionExact || state !== "observed") {
      addCheck(
        `${policy.publishingAccess.checkIdPrefix}${name}`,
        "unobserved",
        "npm-publishing-access-unobserved",
        name,
      );
      continue;
    }
    const matches = hasExactKeys(body, ["policy"])
      && body.policy === policy.publishingAccess.target;
    addCheck(
      `${policy.publishingAccess.checkIdPrefix}${name}`,
      matches ? "match" : "mismatch",
      "npm-publishing-access-mismatch",
      name,
    );
  }

  const hasTrustProjection = isObject(npm.trust);
  const trust = hasTrustProjection ? npm.trust : {};
  addCheck(
    "npm.trust.projection",
    !hasTrustProjection
      ? "unobserved"
      : sameStrings(Object.keys(trust), policy.packageNames) ? "match" : "mismatch",
    !hasTrustProjection ? "npm-trust-projection-unobserved" : "npm-trust-projection-mismatch",
  );
  for (const name of policy.packageNames) {
    if (!authenticated) {
      addCheck(`npm.trust.${name}`, "unobserved", "npm-trust-unobserved", name);
      continue;
    }
    const response = trust[name];
    const state = responseState(response);
    if (state !== "observed") {
      addCheck(
        `npm.trust.${name}`,
        "unobserved",
        state === "e401" ? "npm-trust-e401" : "npm-trust-unobserved",
        name,
      );
      continue;
    }
    const body = responseBody(response);
    const records = Array.isArray(body) ? body : isObject(body) ? [body] : [];
    addCheck(
      `npm.trust.${name}`,
      records.length === 1 && exactTrustRecord(records[0], policy) ? "match" : "mismatch",
      "npm-trust-mismatch",
      name,
    );
  }

  for (const name of policy.packageNames) {
    if (!authenticated) {
      addCheck(`npm.allowedAction.${name}`, "unobserved", "npm-allowed-action-unobserved", name);
      continue;
    }
    const response = trust[name];
    const state = responseState(response);
    if (state !== "observed") {
      addCheck(
        `npm.allowedAction.${name}`,
        "unobserved",
        state === "e401" ? "npm-allowed-action-e401" : "npm-allowed-action-unobserved",
        name,
      );
      continue;
    }
    const body = responseBody(response);
    const records = Array.isArray(body) ? body : isObject(body) ? [body] : [];
    const permissions = records.length === 1 && isObject(records[0]) ? records[0].permissions : undefined;
    if (permissions === undefined) {
      addCheck(`npm.allowedAction.${name}`, "unobserved", "npm-allowed-action-unobserved", name);
      continue;
    }
    addCheck(
      `npm.allowedAction.${name}`,
      Array.isArray(permissions)
        && JSON.stringify(permissions) === JSON.stringify(policy.rawAllowedActionProjection)
        ? "match"
        : "mismatch",
      "npm-allowed-action-mismatch",
      name,
    );
  }

  const hasPackageProjection = isObject(observation.packages);
  const packages = hasPackageProjection ? observation.packages : {};
  addCheck(
    "packages.projection",
    !hasPackageProjection
      ? "unobserved"
      : sameStrings(Object.keys(packages), policy.packageNames) ? "match" : "mismatch",
    !hasPackageProjection ? "package-projection-unobserved" : "package-projection-mismatch",
  );
  for (const name of policy.packageNames) {
    const manifest = packages[name];
    if (!isObject(manifest)) {
      addCheck(`packages.${name}.repository`, "unobserved", "package-repository-unobserved", name);
      continue;
    }
    const packageRepository = manifest.repository;
    const matches = exactPackageRepository(packageRepository, policy, name);
    addCheck(
      `packages.${name}.repository`,
      matches ? "match" : "mismatch",
      "package-repository-mismatch",
      name,
    );
  }

  const summary = checks.reduce(
    (counts, check) => ({ ...counts, [check.status]: counts[check.status] + 1 }),
    { match: 0, mismatch: 0, unobserved: 0 },
  );
  return {
    checks,
    decision: summary.mismatch === 0 && summary.unobserved === 0 ? "supported" : "blocked",
    issues,
    identity: policy.auditIdentity,
    observedAt: observation.observedAt,
    schema: outputSchema,
    sourceSha: observation.sourceSha,
    summary,
  };
};

const invalidOutput = {
  checks: [],
  decision: "invalid-input",
  issues: [{ category: "unobserved", code: "invalid-input", subject: "input" }],
  identity: null,
  observedAt: null,
  schema: outputSchema,
  sourceSha: null,
  summary: { match: 0, mismatch: 0, unobserved: 1 },
};

const main = async () => {
  const [flag, inputPath, sourceFlag, sourceValue, ...rest] = process.argv.slice(2);
  const collect = flag === "--collect"
    && inputPath === "--source-sha"
    && sourceFlag !== undefined
    && sourceValue === undefined
    && rest.length === 0;
  const fromInput = flag === "--input" && inputPath !== undefined && rest.length === 0;
  if (!collect && !fromInput) {
    process.stdout.write(serialize(invalidOutput));
    process.exitCode = 64;
    return;
  }
  try {
    const contract = await loadAuthenticatedContract();
    const policy = releaseAuthorityPolicyFromContract(contract);
    const npmRuntime = resolvePinnedNpmAuthorityObservationClient({ contract });
    let collectionSourceSha;
    if (collect) {
      const observed = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: safeProcessEnvironment(),
        shell: false,
      });
      collectionSourceSha = sourceFlag;
      if (
        !/^[0-9a-f]{40}$/u.test(collectionSourceSha)
        || observed.status !== 0
        || observed.stdout.trim() !== collectionSourceSha
      ) throw new Error("release authority collection source is not the exact checkout");
    }
    const observation = collect
      ? await collectObservation(policy, collectionSourceSha, { npmRuntime })
      : JSON.parse(inputPath === "-" ? await new Response(process.stdin).text() : await readFile(inputPath, "utf8"));
    const output = auditReleaseAuthority(observation, policy);
    process.stdout.write(serialize(output));
    process.exitCode = output.decision === "supported" ? 0 : 2;
  } catch {
    process.stdout.write(serialize(invalidOutput));
    process.exitCode = 64;
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
