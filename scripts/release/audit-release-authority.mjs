#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  readInputs,
  renderJson,
  validateContract,
} from "../effect-build-contract/model.mjs";

const inputSchema = "effect-build/release-authority-observation@2";
const outputSchema = "effect-build/release-authority-audit@2";
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
  if (
    packageNames.length === 0
    || !exactStringArray(admittedPackages)
    || JSON.stringify(admittedPackages) !== JSON.stringify([...admittedPackages].sort())
    || !sameStrings(packageNames, admittedPackages)
    || publicAdmission.packageCount !== packageNames.length
    || !exactStringArray(projection.privatePackages)
    || packageNames.some((name) => projection.privatePackages.includes(name))
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
    npmClient: Object.freeze({ ...certificationClient }),
    oidcSubjectPolicy: Object.freeze({ ...oidcSubjectPolicy }),
    packageNames: Object.freeze(packageNames),
    rawAllowedActionProjection: Object.freeze([...rawAllowedActionProjection]),
    auditIdentity: npmAuthorityReceipt.identity,
    registry: registryUrl.href.replace(/\/$/u, ""),
    repository: trustedPublisher.repository,
    repositoryUrl: `git+https://github.com/${trustedPublisher.repository}.git`,
    reviewer: Object.freeze({ ...reviewer }),
    semanticPermission: trustedPublisher.permission,
    workflow: trustedPublisher.workflow,
  });
};

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

const runReadOnly = (policy, authority, command, args) => spawnSync(command, args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: commandEnvironment(policy, authority),
  input: "",
  maxBuffer: 1024 * 1024,
  shell: false,
  timeout: 5_000,
  windowsHide: true,
});

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

const collectGithub = (policy, endpoint, projection) => {
  const args = ["api", endpoint, "--hostname", "github.com"];
  args.push("--jq", projection);
  const result = runReadOnly(policy, "github", "gh", args);
  const status = commandResponseStatus(result);
  const body = parseCommandJson(result);
  return status === 200 && body !== undefined ? { body, status } : { status: status === 200 ? 598 : status };
};

const collectGithubInventory = (policy, endpoint, collection) => {
  const projection = `{total_count,${collection}:[.${collection}[]|{name}]}`;
  const result = runReadOnly(policy, "github", "gh", [
    "api",
    endpoint,
    "--hostname",
    "github.com",
    "--paginate",
    "--jq",
    projection,
  ]);
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

const collectNpmAuthentication = (policy) => {
  const result = runReadOnly(policy, "npm", "npm", ["whoami", "--json", "--registry", policy.registry]);
  const status = commandResponseStatus(result);
  const body = parseCommandJson(result);
  const username = typeof body === "string" ? body : isObject(body) ? body.username : undefined;
  return status === 200 && typeof username === "string" && username.length > 0
    ? { body: { username }, status }
    : { status: status === 200 ? 598 : status };
};

const collectNpmClient = (policy) => {
  const result = runReadOnly(policy, "npm", "npm", ["--version"]);
  const status = commandResponseStatus(result);
  const version = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return status === 200 && /^\d+\.\d+\.\d+$/u.test(version)
    ? { body: { node: process.versions.node, npm: version }, status }
    : { status: status === 200 ? 598 : status };
};

const collectNpmTrust = (policy, name) => {
  const result = runReadOnly(policy, "npm", "npm", ["trust", "list", name, "--json", "--registry", policy.registry]);
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

const collectPackageRepositories = async (policy) => {
  const packages = {};
  for (const name of policy.packageNames) {
    const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "packages", name, "package.json"), "utf8"));
    packages[name] = { repository: assertCanonicalPackageRepositoryManifest(manifest, policy, name) };
  }
  return packages;
};

const collectObservation = async (policy, sourceSha) => {
  const client = collectNpmClient(policy);
  const observedClient = responseBody(client);
  const clientMatches = observedClient?.node === policy.npmClient.node
    && observedClient?.npm === policy.npmClient.npm;
  const authentication = clientMatches
    ? collectNpmAuthentication(policy)
    : { status: 598 };
  const trust = {};
  for (const name of policy.packageNames) {
    trust[name] = authentication.status === 200 ? collectNpmTrust(policy, name) : { status: authentication.status };
  }
  const repositoryEndpoint = `repos/${policy.repository}`;
  const environmentEndpoint = `${repositoryEndpoint}/environments/${policy.environment}`;
  return {
    github: {
      environment: {
        branchPolicies: collectGithub(
          policy,
          `${environmentEndpoint}/deployment-branch-policies`,
          "{total_count,branch_policies:[.branch_policies[]|{name,type}]}",
        ),
        details: collectGithub(
          policy,
          environmentEndpoint,
          "{name,deployment_branch_policy,protection_rules:[.protection_rules[]|if .type==\"required_reviewers\" then {type,prevent_self_review,reviewers:[.reviewers[]|{type,reviewer:{login:.reviewer.login,id:.reviewer.id}}]} else {type} end]}",
        ),
        secrets: collectGithubInventory(
          policy,
          `${environmentEndpoint}/secrets?per_page=100`,
          "secrets",
        ),
        variables: collectGithubInventory(
          policy,
          `${environmentEndpoint}/variables?per_page=100`,
          "variables",
        ),
      },
      oidc: collectGithub(
        policy,
        `${repositoryEndpoint}/actions/oidc/customization/sub`,
        "{use_default,use_immutable_subject,sub_claim_prefix}",
      ),
      repository: {
        secrets: collectGithubInventory(
          policy,
          `${repositoryEndpoint}/actions/secrets?per_page=100`,
          "secrets",
        ),
        variables: collectGithubInventory(
          policy,
          `${repositoryEndpoint}/actions/variables?per_page=100`,
          "variables",
        ),
      },
    },
    npm: { authentication, client, trust },
    identity: policy.auditIdentity,
    observedAt: new Date().toISOString(),
    packages: await collectPackageRepositories(policy),
    schema: inputSchema,
    sourceSha,
  };
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
  const authenticated = authenticationState === "observed"
    && isObject(authenticationBody)
    && typeof authenticationBody.username === "string"
    && authenticationBody.username.length > 0;
  if (authenticated) {
    addCheck("npm.authentication", "match");
  } else {
    addCheck(
      "npm.authentication",
      "unobserved",
      authenticationState === "e401" ? "npm-authentication-e401" : "npm-authentication-unobserved",
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
      ? await collectObservation(policy, collectionSourceSha)
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
