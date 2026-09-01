import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error The release auditor is an intentionally unprotected Node script module.
import * as releaseAuthority from "../../scripts/release/audit-release-authority.mjs";

const {
  assertCanonicalPackageRepositoryManifest,
  authenticateGeneratedContract,
  releaseAuthorityPolicyFromContract,
} = releaseAuthority;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const command = resolve(root, "scripts/release/audit-release-authority.mjs");
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const policy = releaseAuthorityPolicyFromContract(contract);
const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const packageNames = policy.packageNames as ReadonlyArray<string>;
const firstPackage = packageNames[0]!;
const lastPackage = packageNames.at(-1)!;
const privatePackage = contract.publicApiProjection.privatePackages[0] as string;

interface AuditCheck {
  readonly id: string;
  readonly status: "match" | "mismatch" | "unobserved";
}

interface AuditOutput {
  readonly checks: ReadonlyArray<AuditCheck>;
  readonly decision: "blocked" | "supported";
  readonly issues: ReadonlyArray<{ readonly category: string; readonly code: string; readonly subject: string }>;
  readonly identity: string;
  readonly schema: string;
  readonly sourceSha: string;
  readonly summary: { readonly match: number; readonly mismatch: number; readonly unobserved: number };
}

const trust = Object.fromEntries(packageNames.map((name) => [
  name,
  {
    status: 200,
    body: [{
      id: `opaque-${name}`,
      type: "github",
      claims: {
        repository: policy.repository,
        workflow_ref: { file: policy.workflow },
        environment: policy.environment,
      },
      permissions: [...policy.rawAllowedActionProjection],
    }],
  },
]));

const packages = Object.fromEntries(packageNames.map((name) => [
  name,
  {
    repository: {
      type: "git",
      url: policy.repositoryUrl,
      directory: `packages/${name}`,
    },
  },
]));

const supportedObservation = () => ({
  schema: "effect-build/release-authority-observation@2",
  sourceSha,
  identity: policy.auditIdentity,
  observedAt: "2026-08-30T12:00:00.000Z",
  ignoredCredential: "ROOT-CANARY-CREDENTIAL",
  npm: {
    client: { status: 200, body: { node: policy.npmClient.node, npm: policy.npmClient.npm } },
    authentication: { status: 200, body: { username: "npm-observer", token: "AUTH-CANARY" } },
    trust: structuredClone(trust),
  },
  github: {
    repository: {
      secrets: {
        status: 200,
        body: { total_count: 1, secrets: [{ name: "APPLE_CERT", value: "REPO-SECRET-CANARY" }] },
      },
      variables: {
        status: 200,
        body: { total_count: 1, variables: [{ name: "RELEASE_CHANNEL", value: "REPO-VARIABLE-CANARY" }] },
      },
    },
    environment: {
      details: {
        status: 200,
        body: {
          name: policy.environment,
          deployment_branch_policy: {
            custom_branch_policies: policy.branchPolicy.deploymentBranchPolicy.customBranchPolicies,
            protected_branches: policy.branchPolicy.deploymentBranchPolicy.protectedBranches,
          },
          protection_rules: [
            {
              type: "required_reviewers",
              prevent_self_review: policy.reviewer.preventSelfReview,
              reviewers: [{
                type: policy.reviewer.type,
                reviewer: { login: policy.reviewer.login, id: policy.reviewer.id },
              }],
            },
            { type: "branch_policy" },
          ],
        },
      },
      branchPolicies: {
        status: 200,
        body: {
          total_count: 1,
          branch_policies: [{ id: 58439007, name: policy.branchPolicy.name, type: policy.branchPolicy.type }],
        },
      },
      secrets: { status: 200, body: { total_count: 0, secrets: [] } },
      variables: { status: 200, body: { total_count: 0, variables: [] } },
    },
    oidc: {
      status: 200,
      body: {
        ...policy.oidcSubjectPolicy,
      },
    },
  },
  packages: structuredClone(packages),
});

const runAudit = (input: unknown) => {
  const result = spawnSync(process.execPath, [command, "--input", "-"], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(input),
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
    output: JSON.parse(result.stdout) as AuditOutput,
  };
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [
        key,
        canonicalize(entry),
      ]),
    );
  }
  return value;
};

const fakeBoundarySource = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const tool = path.basename(process.argv[1]);
const authorityConfig = tool === "npm"
  ? process.env.NPM_CONFIG_USERCONFIG
  : tool === "gh"
  ? process.env.GH_CONFIG_DIR
  : undefined;
const authoritySuffix = tool === "npm" ? ".npmrc" : ".gh";
const statePath = typeof authorityConfig === "string" && authorityConfig.endsWith(authoritySuffix)
  ? authorityConfig.slice(0, -authoritySuffix.length)
  : undefined;
const scenario = statePath === undefined ? undefined : path.basename(statePath, ".jsonl");
const registry = ${JSON.stringify(policy.registry)};
const npmVersion = ${JSON.stringify(policy.npmClient.npm)};
const packageNames = ${JSON.stringify(packageNames)};
const forbiddenEnvironmentNames = ${JSON.stringify(policy.forbiddenEnvironmentNames)};
const repository = ${JSON.stringify(policy.repository)};
const workflow = ${JSON.stringify(policy.workflow)};
const environment = ${JSON.stringify(policy.environment)};
const repositoryEndpoint = "repos/" + repository;
const environmentEndpoint = repositoryEndpoint + "/environments/" + environment;
const inventoryProjection = (collection) =>
  "{total_count," + collection + ":[." + collection + "[]|{name}]}";
const ghQueries = {
  [environmentEndpoint + "/deployment-branch-policies"]:
    "{total_count,branch_policies:[.branch_policies[]|{name,type}]}",
  [environmentEndpoint]:
    '{name,deployment_branch_policy,protection_rules:[.protection_rules[]|if .type=="required_reviewers" then {type,prevent_self_review,reviewers:[.reviewers[]|{type,reviewer:{login:.reviewer.login,id:.reviewer.id}}]} else {type} end]}',
  [environmentEndpoint + "/secrets?per_page=100"]: inventoryProjection("secrets"),
  [environmentEndpoint + "/variables?per_page=100"]: inventoryProjection("variables"),
  [repositoryEndpoint + "/actions/oidc/customization/sub"]:
    "{use_default,use_immutable_subject,sub_claim_prefix}",
  [repositoryEndpoint + "/actions/secrets?per_page=100"]: inventoryProjection("secrets"),
  [repositoryEndpoint + "/actions/variables?per_page=100"]: inventoryProjection("variables"),
};

const fail = () => {
  process.stderr.write("fake boundary rejected non-allowlisted argv\n");
  process.exit(97);
};
const output = (value) => process.stdout.write(JSON.stringify(value) + "\n");

if (
  !statePath
  || !["supported", "e401", "multipage"].includes(scenario)
  || forbiddenEnvironmentNames.some((name) => process.env[name] !== undefined)
  || process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN !== undefined
  || process.env.ACTIONS_ID_TOKEN_REQUEST_URL !== undefined
  || process.env.UNRELATED_RELEASE_SECRET !== undefined
  || process.env.HOME !== undefined
) fail();
if (tool === "npm") {
  if (
    process.env.GH_TOKEN !== undefined
    || process.env.GITHUB_TOKEN !== undefined
    || process.env.GH_HOST !== undefined
    || process.env.GH_CONFIG_DIR !== undefined
    || process.env.NPM_CONFIG_USERCONFIG !== statePath + ".npmrc"
  ) fail();
} else if (tool === "gh") {
  if (
    process.env.GH_TOKEN !== "GH-TOKEN-CANARY"
    || process.env.GITHUB_TOKEN !== "GITHUB-TOKEN-CANARY"
    || process.env.GH_CONFIG_DIR !== statePath + ".gh"
    || process.env.NPM_CONFIG_USERCONFIG !== undefined
    || process.env.npm_config_userconfig !== undefined
    || process.env.NPM_CONFIG_GLOBALCONFIG !== undefined
    || process.env.npm_config_globalconfig !== undefined
    || Object.keys(process.env).some((name) => name.startsWith("npm_config_"))
  ) fail();
} else fail();
fs.appendFileSync(statePath, JSON.stringify({ tool, args }) + "\n");

if (tool === "npm") {
  if (JSON.stringify(args) === JSON.stringify(["--version"])) {
    process.stdout.write(npmVersion + "\n");
    process.exit(0);
  }
  if (JSON.stringify(args) === JSON.stringify(["whoami", "--json", "--registry", registry])) {
    if (scenario === "e401") {
      process.stderr.write("npm error code E401\nE401-RAW-RESPONSE-CANARY\n");
      process.exit(1);
    }
    output({ username: "mannyc1", token: "NPM-AUTH-CREDENTIAL-CANARY" });
    process.exit(0);
  }
  if (
    args.length === 6
    && args[0] === "trust"
    && args[1] === "list"
    && packageNames.includes(args[2])
    && args[3] === "--json"
    && args[4] === "--registry"
    && args[5] === registry
    && scenario !== "e401"
  ) {
    output({
      id: "TRUST-ID-CANARY-" + args[2],
      type: "github",
      file: workflow,
      repository,
      environment,
      raw: "NPM-TRUST-RAW-RESPONSE-CANARY",
    });
    process.exit(0);
  }
  fail();
}

if (tool !== "gh" || args[0] !== "api") fail();
const endpoint = args[1];
if (!(endpoint in ghQueries)) fail();
const paginated = endpoint.endsWith("?per_page=100");
const expectedArgs = paginated
  ? ["api", endpoint, "--hostname", "github.com", "--paginate", "--jq", ghQueries[endpoint]]
  : ["api", endpoint, "--hostname", "github.com", "--jq", ghQueries[endpoint]];
if (JSON.stringify(args) !== JSON.stringify(expectedArgs)) fail();
if (process.env.GH_HOST !== "github.example.invalid") fail();

const raw = "GH-RAW-RESPONSE-CANARY";
if (endpoint.endsWith("deployment-branch-policies")) {
  output({
    total_count: 1,
    branch_policies: [{
      name: ${JSON.stringify(policy.branchPolicy.name)},
      type: ${JSON.stringify(policy.branchPolicy.type)},
    }],
    raw,
  });
} else if (endpoint === environmentEndpoint) {
  output({
    name: environment,
    deployment_branch_policy: {
      custom_branch_policies: ${JSON.stringify(policy.branchPolicy.deploymentBranchPolicy.customBranchPolicies)},
      protected_branches: ${JSON.stringify(policy.branchPolicy.deploymentBranchPolicy.protectedBranches)},
    },
    protection_rules: [
      {
        type: "required_reviewers",
        prevent_self_review: ${JSON.stringify(policy.reviewer.preventSelfReview)},
        reviewers: [{
          type: ${JSON.stringify(policy.reviewer.type)},
          reviewer: {
            login: ${JSON.stringify(policy.reviewer.login)},
            id: ${JSON.stringify(policy.reviewer.id)},
          },
        }],
      },
      { type: "branch_policy" },
    ],
    raw,
  });
} else if (endpoint === environmentEndpoint + "/secrets?per_page=100") {
  output({ total_count: 1, secrets: [{ name: "APPLE_CERT", value: "GH-ENV-SECRET-VALUE-CANARY" }], raw });
} else if (endpoint === environmentEndpoint + "/variables?per_page=100") {
  output({ total_count: 1, variables: [{ name: "RELEASE_CHANNEL", value: "GH-ENV-VARIABLE-VALUE-CANARY" }], raw });
} else if (endpoint.endsWith("actions/oidc/customization/sub")) {
  output({
    ...${JSON.stringify(policy.oidcSubjectPolicy)},
    raw,
  });
} else if (endpoint.endsWith("actions/secrets?per_page=100")) {
  if (scenario === "multipage") {
    output({
      total_count: 2,
      secrets: [{ name: "APPLE_CERT", value: "GH-REPOSITORY-SECRET-VALUE-CANARY" }],
      raw,
    });
    output({
      total_count: 2,
      secrets: [{ name: "NODE_AUTH_TOKEN", value: "GH-SECOND-PAGE-SECRET-VALUE-CANARY" }],
      raw,
    });
  } else {
    output({
      total_count: 1,
      secrets: [{
        name: scenario === "e401" ? "NPM_TOKEN" : "APPLE_CERT",
        value: "GH-REPOSITORY-SECRET-VALUE-CANARY",
      }],
      raw,
    });
  }
} else if (endpoint.endsWith("actions/variables?per_page=100")) {
  output({
    total_count: 1,
    variables: [{ name: "RELEASE_CHANNEL", value: "GH-REPOSITORY-VARIABLE-VALUE-CANARY" }],
    raw,
  });
} else {
  fail();
}
`;

const githubCall = (endpoint: string, projection: string, paginated = false) => [
  "api",
  endpoint,
  "--hostname",
  "github.com",
  ...(paginated ? ["--paginate"] : []),
  "--jq",
  projection,
];
const inventoryJq = (collection: string) => `{total_count,${collection}:[.${collection}[]|{name}]}`;
const repositoryEndpoint = `repos/${policy.repository}`;
const environmentEndpoint = `${repositoryEndpoint}/environments/${policy.environment}`;
const githubCalls = [
  githubCall(
    `${environmentEndpoint}/deployment-branch-policies`,
    "{total_count,branch_policies:[.branch_policies[]|{name,type}]}",
  ),
  githubCall(
    environmentEndpoint,
    '{name,deployment_branch_policy,protection_rules:[.protection_rules[]|if .type=="required_reviewers" then {type,prevent_self_review,reviewers:[.reviewers[]|{type,reviewer:{login:.reviewer.login,id:.reviewer.id}}]} else {type} end]}',
  ),
  githubCall(
    `${environmentEndpoint}/secrets?per_page=100`,
    inventoryJq("secrets"),
    true,
  ),
  githubCall(
    `${environmentEndpoint}/variables?per_page=100`,
    inventoryJq("variables"),
    true,
  ),
  githubCall(
    `${repositoryEndpoint}/actions/oidc/customization/sub`,
    "{use_default,use_immutable_subject,sub_claim_prefix}",
  ),
  githubCall(`${repositoryEndpoint}/actions/secrets?per_page=100`, inventoryJq("secrets"), true),
  githubCall(`${repositoryEndpoint}/actions/variables?per_page=100`, inventoryJq("variables"), true),
];

const readInvocations = async (path: string) =>
  (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { readonly args: ReadonlyArray<string>; readonly tool: string });

describe("release authority audit", () => {
  it("derives one exact repository authority policy from the generated combined contract", () => {
    expect(policy.packageNames).toEqual(Object.keys(contract.publicApiProjection.packages).sort());
    expect(policy.packageNames).toHaveLength(contract.releaseCertification.publicAdmission.packageCount);
    expect(policy.repository).toBe(contract.npmRegistryBoundary.trustedPublisher.repository);
    expect(policy.workflow).toBe(contract.npmRegistryBoundary.trustedPublisher.workflow);
    expect(policy.environment).toBe(contract.npmRegistryBoundary.trustedPublisher.environment);
    expect(policy.registry).toBe(contract.npmRegistryBoundary.registry);
    expect(policy.npmClient).toEqual(contract.releaseCertification.npmOidcCertification.client);
    expect(policy.forbiddenEnvironmentNames).toEqual(
      contract.releaseCertification.npmOidcCertification.forbiddenEnvironmentNames,
    );
    expect(policy.branchPolicy).toEqual(contract.releaseCertification.githubAuthority.branchPolicy);
    expect(policy.reviewer).toEqual(contract.releaseCertification.githubAuthority.reviewer);
    expect(policy.oidcSubjectPolicy).toEqual(contract.releaseCertification.githubAuthority.oidcSubjectPolicy);
    expect(policy.expectedEnvironmentSubject).toBe(
      contract.releaseCertification.githubAuthority.expectedEnvironmentSubject,
    );
    expect(policy.rawAllowedActionProjection).toEqual(
      contract.releaseCertification.npmAuthorityObservation.rawAllowedActionProjection,
    );
    expect(policy.semanticPermission).toBe("publish");
    expect(policy.auditIdentity).toBe(
      contract.releaseCertification.readiness.externalReceipts.npmAuthority.identity,
    );
  });

  it("fails closed on public projection, forbidden-name, npm-client, and semantic-permission contract drift", () => {
    const mutations: ReadonlyArray<(value: typeof contract) => void> = [
      (value) => value.publicApiProjection.packages[privatePackage] = {},
      (value) => value.releaseCertification.npmOidcCertification.forbiddenEnvironmentNames.pop(),
      (value) => value.npmRegistryBoundary.client.npm = "11.99.0",
      (value) => Reflect.deleteProperty(value.npmRegistryBoundary.trustedPublisher, "permission"),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(contract);
      mutate(changed);
      expect(() => releaseAuthorityPolicyFromContract(changed)).toThrow();
    }
  });

  it("rejects a coordinated contract rewrite even when its copied authority fields remain self-consistent", async () => {
    const changed = structuredClone(contract);
    const peerPackage = "effect-build-peer-authority";
    changed.publicApiProjection.packages[peerPackage] = structuredClone(
      changed.publicApiProjection.packages[firstPackage],
    );
    changed.npmRegistryBoundary.publicationAdmission.packages.push(peerPackage);
    changed.npmRegistryBoundary.publicationAdmission.packages.sort();
    changed.releaseCertification.publicAdmission.packageCount += 1;
    changed.npmRegistryBoundary.registry = "https://registry.example.invalid";

    expect(() => releaseAuthorityPolicyFromContract(changed)).not.toThrow();
    await expect(authenticateGeneratedContract(changed, root)).rejects.toThrow(/exact generated contract/u);

    const governanceMutations: ReadonlyArray<(value: typeof contract) => void> = [
      (value) => value.releaseCertification.githubAuthority.branchPolicy.name = "peer-main",
      (value) => value.releaseCertification.githubAuthority.reviewer.id += 1,
      (value) => value.releaseCertification.githubAuthority.oidcSubjectPolicy.use_default = false,
      (value) => value.releaseCertification.npmAuthorityObservation.rawAllowedActionProjection = ["publish"],
    ];
    for (const mutate of governanceMutations) {
      const governanceChanged = structuredClone(contract);
      mutate(governanceChanged);
      await expect(authenticateGeneratedContract(governanceChanged, root)).rejects.toThrow(/exact generated contract/u);
    }
  });

  it("requires every admitted package repository manifest to have one canonical repository identity", async () => {
    for (const name of packageNames) {
      const manifest = JSON.parse(await readFile(resolve(root, "packages", name, "package.json"), "utf8"));
      expect(assertCanonicalPackageRepositoryManifest(manifest, policy, name)).toEqual(packages[name]!.repository);
    }
    const name = packageNames[0]!;
    const canonical = {
      name,
      repository: packages[name]!.repository,
    };
    for (
      const hostile of [
        { ...canonical, name: privatePackage },
        { ...canonical, repository: { ...canonical.repository, branch: "main" } },
        { ...canonical, repository: { ...canonical.repository, directory: `packages/${privatePackage}` } },
        { ...canonical, repository: { ...canonical.repository, url: "CANARY-RAW-REPOSITORY" } },
      ]
    ) {
      expect(() => assertCanonicalPackageRepositoryManifest(hostile, policy, name)).toThrow(/noncanonical/u);
    }
  });

  it("supports only the exact eleven-package npm and GitHub authority snapshot", () => {
    const result = runAudit(supportedObservation());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.output).toEqual({
      checks: expect.any(Array),
      decision: "supported",
      identity: policy.auditIdentity,
      issues: [],
      observedAt: "2026-08-30T12:00:00.000Z",
      schema: "effect-build/release-authority-audit@2",
      sourceSha,
      summary: { match: 44, mismatch: 0, unobserved: 0 },
    });
    expect(result.output.checks).toHaveLength(44);
    expect(
      result.output.checks.filter(({ id }) => packageNames.some((name) => id === `npm.trust.${name}`)),
    ).toHaveLength(11);
    expect(result.output.checks.filter(({ id }) => id.startsWith("npm.allowedAction."))).toHaveLength(11);
    expect(result.stdout).toBe(JSON.stringify(canonicalize(result.output), null, 2) + "\n");
    for (const canary of ["ROOT-CANARY", "AUTH-CANARY", "REPO-SECRET-CANARY", "REPO-VARIABLE-CANARY"]) {
      expect(result.stdout).not.toContain(canary);
    }
  });

  it("classifies E401 trust and permission state as unobserved rather than mismatch", () => {
    const observation = supportedObservation();
    observation.npm.authentication = { status: 401, body: { username: "npm-observer", token: "E401-CANARY" } };
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.decision).toBe("blocked");
    expect(result.output.summary).toEqual({ match: 21, mismatch: 0, unobserved: 23 });
    expect(result.output.issues).toContainEqual({
      category: "unobserved",
      code: "npm-authentication-e401",
      subject: "npm.authentication",
    });
    expect(result.output.checks.filter(({ status }) => status === "unobserved")).toHaveLength(23);
    expect(result.stdout).not.toContain("E401-CANARY");
  });

  it("rejects collection by any npm client other than the exact contract client", () => {
    const observation = supportedObservation();
    observation.npm.client.body.npm = "11.19.0";
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.checks).toContainEqual({ id: "npm.client", status: "mismatch" });
    expect(result.output.issues).toContainEqual({
      category: "mismatch",
      code: "npm-client-mismatch",
      subject: "npm.client",
    });
    expect(result.stdout).not.toContain("11.19.0");
  });

  it("reports observed authority drift as mismatch without echoing observed values", () => {
    const observation = supportedObservation();
    observation.npm.trust[firstPackage]!.body[0]!.claims.repository = "CANARY-WRONG-REPOSITORY";
    observation.github.repository.secrets.body.secrets.push({
      name: "NPM_TOKEN",
      value: "CANARY-NPM-TOKEN-VALUE",
    });
    observation.github.repository.secrets.body.total_count = 2;
    observation.github.environment.branchPolicies.body.branch_policies[0]!.name = "CANARY-WRONG-BRANCH";
    observation.github.oidc.body.sub_claim_prefix = "CANARY-WRONG-OIDC-SUBJECT";
    observation.packages[firstPackage]!.repository.url = "CANARY-WRONG-PACKAGE-URL";
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.summary.unobserved).toBe(0);
    expect(result.output.summary.mismatch).toBe(5);
    expect(result.output.issues.map(({ code }) => code)).toEqual([
      "forbidden-name-present",
      "environment-branch-policy-mismatch",
      "oidc-policy-mismatch",
      "npm-trust-mismatch",
      "package-repository-mismatch",
    ]);
    for (
      const canary of [
        "CANARY-WRONG-REPOSITORY",
        "CANARY-NPM-TOKEN-VALUE",
        "CANARY-WRONG-BRANCH",
        "CANARY-WRONG-OIDC-SUBJECT",
        "CANARY-WRONG-PACKAGE-URL",
      ]
    ) {
      expect(result.stdout).not.toContain(canary);
    }
  });

  it("fails closed when one admitted package response is absent", () => {
    const observation = supportedObservation();
    delete observation.npm.trust[lastPackage];
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.checks).toContainEqual({
      id: `npm.trust.${lastPackage}`,
      status: "unobserved",
    });
    expect(result.output.issues).toContainEqual({
      category: "unobserved",
      code: "npm-trust-unobserved",
      subject: lastPackage,
    });
  });

  it("does not infer npm's raw allowed action when npm omits that projection", () => {
    const observation = supportedObservation();
    Reflect.deleteProperty(observation.npm.trust[firstPackage]!.body[0]!, "permissions");
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.checks).toContainEqual({
      id: `npm.allowedAction.${firstPackage}`,
      status: "unobserved",
    });
    expect(result.output.checks).toContainEqual({
      id: `npm.trust.${firstPackage}`,
      status: "match",
    });
    expect(result.output.issues).toContainEqual({
      category: "unobserved",
      code: "npm-allowed-action-unobserved",
      subject: firstPackage,
    });
  });

  it("keeps npm's raw allowed-action projection distinct from semantic publish authority", () => {
    const observation = supportedObservation();
    observation.npm.trust[firstPackage]!.body[0]!.permissions = ["CANARY-RAW-PUBLISH-ACTION"];
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.checks).toContainEqual({
      id: `npm.allowedAction.${firstPackage}`,
      status: "mismatch",
    });
    expect(result.output.issues).toContainEqual({
      category: "mismatch",
      code: "npm-allowed-action-mismatch",
      subject: firstPackage,
    });
    expect(result.stdout).not.toContain("CANARY-RAW-PUBLISH-ACTION");
  });

  it("does not infer an inventory absence from an incomplete paginated projection", () => {
    const observation = supportedObservation();
    observation.github.repository.variables.body.total_count = 2;
    const result = runAudit(observation);

    expect(result.status).toBe(2);
    expect(result.output.checks).toContainEqual({
      id: "github.repository.variables",
      status: "unobserved",
    });
    expect(result.output.issues).toContainEqual({
      category: "unobserved",
      code: "github-inventory-unobserved",
      subject: "github.repository.variables",
    });
  });

  it("collects through exact stateful read-only boundaries without retaining raw responses", async () => {
    const boundaryDirectory = await mkdtemp(join(tmpdir(), "effect-build-release-authority-"));
    const npmPath = join(boundaryDirectory, "npm");
    const githubPath = join(boundaryDirectory, "gh");
    const supportedState = join(boundaryDirectory, "supported.jsonl");
    const e401State = join(boundaryDirectory, "e401.jsonl");
    const multipageState = join(boundaryDirectory, "multipage.jsonl");
    const execute = (statePath: string) =>
      spawnSync(
        process.execPath,
        [command, "--collect", "--source-sha", sourceSha],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            ...Object.fromEntries(policy.forbiddenEnvironmentNames.map((name: string) => [name, `${name}-CANARY`])),
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: "ACTIONS-TOKEN-CANARY",
            ACTIONS_ID_TOKEN_REQUEST_URL: "ACTIONS-URL-CANARY",
            GH_CONFIG_DIR: `${statePath}.gh`,
            GH_HOST: "github.example.invalid",
            GH_TOKEN: "GH-TOKEN-CANARY",
            GITHUB_TOKEN: "GITHUB-TOKEN-CANARY",
            NPM_CONFIG_GLOBALCONFIG: "NPM-GLOBALCONFIG-CANARY",
            NPM_CONFIG_USERCONFIG: `${statePath}.npmrc`,
            PATH: [boundaryDirectory, process.env.PATH ?? ""].join(delimiter),
            UNRELATED_RELEASE_SECRET: "UNRELATED-CANARY",
            npm_config_globalconfig: "npm-globalconfig-canary",
          },
        },
      );
    const whoami = ["whoami", "--json", "--registry", policy.registry];
    const npmVersion = ["--version"];
    const expectedGithub = githubCalls.map((args) => ({ args, tool: "gh" }));
    const canaries = [
      "NPM-AUTH-CREDENTIAL-CANARY",
      "NPM-TRUST-RAW-RESPONSE-CANARY",
      "TRUST-ID-CANARY",
      "GH-RAW-RESPONSE-CANARY",
      "GH-ENV-SECRET-VALUE-CANARY",
      "GH-ENV-VARIABLE-VALUE-CANARY",
      "GH-REPOSITORY-SECRET-VALUE-CANARY",
      "GH-REPOSITORY-VARIABLE-VALUE-CANARY",
      "GH-SECOND-PAGE-SECRET-VALUE-CANARY",
      "E401-RAW-RESPONSE-CANARY",
      "ACTIONS-TOKEN-CANARY",
      "ACTIONS-URL-CANARY",
      "GH-TOKEN-CANARY",
      "GITHUB-TOKEN-CANARY",
      "NPM-GLOBALCONFIG-CANARY",
      "UNRELATED-CANARY",
    ];

    try {
      await Promise.all([
        writeFile(npmPath, fakeBoundarySource, "utf8"),
        writeFile(githubPath, fakeBoundarySource, "utf8"),
      ]);
      await Promise.all([chmod(npmPath, 0o755), chmod(githubPath, 0o755)]);

      const supported = execute(supportedState);
      const supportedOutput = JSON.parse(supported.stdout) as AuditOutput;
      expect(supported.status).toBe(2);
      expect(supported.stderr).toBe("");
      expect(supportedOutput.decision).toBe("blocked");
      expect(supportedOutput.summary).toEqual({ match: 33, mismatch: 0, unobserved: 11 });
      expect(supportedOutput.issues).toContainEqual({
        category: "unobserved",
        code: "npm-allowed-action-unobserved",
        subject: firstPackage,
      });
      expect(await readInvocations(supportedState)).toEqual([
        { args: npmVersion, tool: "npm" },
        { args: whoami, tool: "npm" },
        ...packageNames.map((name) => ({
          args: ["trust", "list", name, "--json", "--registry", policy.registry],
          tool: "npm",
        })),
        ...expectedGithub,
      ]);

      const e401 = execute(e401State);
      const e401Output = JSON.parse(e401.stdout) as AuditOutput;
      expect(e401.status).toBe(2);
      expect(e401.stderr).toBe("");
      expect(e401Output.decision).toBe("blocked");
      expect(e401Output.summary).toEqual({ match: 20, mismatch: 1, unobserved: 23 });
      expect(e401Output.issues).toContainEqual({
        category: "mismatch",
        code: "forbidden-name-present",
        subject: "github.repository.secrets:NPM_TOKEN",
      });
      expect(e401Output.issues).toContainEqual({
        category: "unobserved",
        code: "npm-authentication-e401",
        subject: "npm.authentication",
      });
      expect(await readInvocations(e401State)).toEqual([
        { args: npmVersion, tool: "npm" },
        { args: whoami, tool: "npm" },
        ...expectedGithub,
      ]);

      const multipage = execute(multipageState);
      const multipageOutput = JSON.parse(multipage.stdout) as AuditOutput;
      expect(multipage.status).toBe(2);
      expect(multipage.stderr).toBe("");
      expect(multipageOutput.decision).toBe("blocked");
      expect(multipageOutput.summary).toEqual({ match: 32, mismatch: 1, unobserved: 11 });
      expect(multipageOutput.issues).toContainEqual({
        category: "mismatch",
        code: "forbidden-name-present",
        subject: "github.repository.secrets:NODE_AUTH_TOKEN",
      });
      expect(await readInvocations(multipageState)).toEqual([
        { args: npmVersion, tool: "npm" },
        { args: whoami, tool: "npm" },
        ...packageNames.map((name) => ({
          args: ["trust", "list", name, "--json", "--registry", policy.registry],
          tool: "npm",
        })),
        ...expectedGithub,
      ]);

      for (const canary of canaries) {
        expect(supported.stdout).not.toContain(canary);
        expect(e401.stdout).not.toContain(canary);
        expect(multipage.stdout).not.toContain(canary);
      }
    } finally {
      await rm(boundaryDirectory, { force: true, recursive: true });
    }
  }, 30_000);

  it("limits collection to projected read-only commands and performs no writes", async () => {
    const source = await readFile(command, "utf8");

    expect(source).toContain("spawnSync(command, args, {");
    expect(source).toContain("shell: false");
    expect(source).toContain('npm_config_logs_max: "0"');
    expect(source).toContain('resolve(repositoryRoot, "tooling/effect-build-contract.json")');
    expect(source).toContain("releaseAuthorityPolicyFromContract(contract)");
    expect(source).toContain('["trust", "list", name, "--json"');
    expect(source).toContain('["api", endpoint, "--hostname", "github.com"]');
    expect(source).toContain('"--paginate",\n    "--jq"');
    expect(source).toContain("body.total_count !== names.length");
    expect(source).toContain('"--jq"');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(/\b(?:writeFile|appendFile|unlink|rename|mkdir|rm)\w*\s*\(/u);
    for (
      const mutation of [
        '["publish"',
        '["login"',
        '["token"',
        '["trust", "revoke"',
        '["trust", "github"',
        '["trust", "gitlab"',
        '["trust", "circleci"',
      ]
    ) {
      expect(source).not.toContain(mutation);
    }
    expect(source).not.toContain("--method");
    for (
      const duplicatedAuthority of [
        '"mannyc2/effect-build"',
        '"release.yml"',
        '"https://registry.npmjs.org"',
        '"11.11.0"',
        '"NPM_ID_TOKEN"',
        '"NPM_TOKEN"',
        '"NODE_AUTH_TOKEN"',
        '"SIGSTORE_ID_TOKEN"',
      ]
    ) {
      expect(source).not.toContain(duplicatedAuthority);
    }
  });
});
