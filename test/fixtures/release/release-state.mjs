import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

export const sourceSha = process.env.EFFECT_BUILD_FIXTURE_SOURCE_SHA
  ?? "1111111111111111111111111111111111111111";
export const workflowRef = "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main";
export const packageNames = [
  "effect-build",
  "effect-build-apple",
  "effect-build-archives",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-nfpm",
  "effect-build-node-sea",
  "effect-build-python",
  "effect-build-sbom",
  "effect-build-windows",
];
export const placeholderNames = [
  "effect-build-apple",
  "effect-build-archives",
  "effect-build-nfpm",
  "effect-build-python",
  "effect-build-rolldown",
  "effect-build-sbom",
  "effect-build-windows",
];
export const establishedNames = packageNames.filter((name) => !placeholderNames.includes(name));
export const reservedOnlyName = "effect-build-rolldown";
export const targetVersion = "0.6.0";
export const placeholderVersion = "0.0.0-reserved.0";
export const registryUrl = "https://registry.npmjs.org";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const sha512Integrity = (bytes) =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
export const canonicalDigest = (bytes) => `sha256:${sha256(bytes)}`;

export const fakeRegistryScenarioMatrix = [
  { caseId: "all-absent-full-convergence", scenario: "full-convergence" },
  { caseId: "partial-exact-publication", scenario: "partial-prefix" },
  { caseId: "exact-bytes-latest-wrong", scenario: "exact-target-wrong-latest" },
  { caseId: "target-version-conflicting-bytes", scenario: "conflicting-target-bytes" },
  { caseId: "existing-provenance-invalid", scenario: "missing-provenance", variant: "missing" },
  { caseId: "existing-provenance-invalid", scenario: "unverifiable-provenance", variant: "unverifiable" },
  { caseId: "existing-provenance-invalid", scenario: "foreign-provenance", variant: "wrong-workflow" },
  { caseId: "existing-provenance-invalid", scenario: "wrong-sha-provenance", variant: "wrong-source-sha" },
  { caseId: "existing-provenance-invalid", scenario: "wrong-source-oid", variant: "wrong-source-oid" },
  { caseId: "existing-provenance-invalid", scenario: "duplicate-source-oid", variant: "duplicate-source-oid" },
  { caseId: "prior-latest-drift-before-first-mutation", scenario: "prior-latest-drift" },
  { caseId: "newer-version-present", scenario: "newer-version" },
  { caseId: "inconclusive-non-404-registry-read", scenario: "inconclusive-read" },
  { caseId: "failure-before-registry-commitment", scenario: "response-loss-before-commit" },
  { caseId: "response-loss-after-registry-commitment", scenario: "response-loss-after-commit" },
  {
    caseId: "response-loss-after-bytes-and-tag-before-valid-provenance",
    scenario: "response-loss-after-tag",
  },
  {
    caseId: "placeholder-or-reservation-tag-drift",
    scenario: "placeholder-latest-drift",
    variant: "placeholder-latest",
  },
  {
    caseId: "placeholder-or-reservation-tag-drift",
    scenario: "placeholder-reserved-drift",
    variant: "placeholder-reserved",
  },
  {
    caseId: "placeholder-or-reservation-tag-drift",
    scenario: "reservation-latest-drift",
    variant: "reservation-only-latest",
  },
  {
    caseId: "placeholder-or-reservation-tag-drift",
    scenario: "reservation-reserved-drift",
    variant: "reservation-only-reserved",
  },
  { caseId: "rolldown-non-placeholder-version", scenario: "rolldown-version-drift" },
  { caseId: "embedded-publish-config-invalid", scenario: "publish-config-missing", variant: "missing" },
  { caseId: "embedded-publish-config-invalid", scenario: "publish-config-extra", variant: "additional" },
  {
    caseId: "embedded-publish-config-invalid",
    scenario: "publish-config-noncanonical",
    variant: "non-canonical",
  },
  { caseId: "embedded-publish-config-invalid", scenario: "publish-config-auth", variant: "registry-scoped-auth" },
  { caseId: "forbidden-protected-environment", environment: "NPM_ID_TOKEN", scenario: "full-convergence", variant: "NPM_ID_TOKEN" },
  { caseId: "forbidden-protected-environment", environment: "NPM_TOKEN", scenario: "full-convergence", variant: "NPM_TOKEN" },
  { caseId: "forbidden-protected-environment", environment: "NODE_AUTH_TOKEN", scenario: "full-convergence", variant: "NODE_AUTH_TOKEN" },
  { caseId: "forbidden-protected-environment", environment: "SIGSTORE_ID_TOKEN", scenario: "full-convergence", variant: "SIGSTORE_ID_TOKEN" },
  { caseId: "post-publish-candidate-mismatch", scenario: "post-publish-bytes-mismatch", variant: "bytes" },
  { caseId: "post-publish-candidate-mismatch", scenario: "post-publish-integrity-mismatch", variant: "integrity" },
  { caseId: "post-publish-candidate-mismatch", scenario: "post-publish-size-mismatch", variant: "size" },
  { caseId: "main-advances-before-first-mutation", scenario: "main-advanced" },
  { caseId: "registry-drift-after-first-mutation", scenario: "mid-run-unprocessed-package-drift" },
  { caseId: "main-advances-after-first-mutation", scenario: "mid-run-main-advanced" },
  { caseId: "authority-drift-after-first-mutation", scenario: "mid-run-authority-drift" },
  { caseId: "adopted-evidence-digest-mismatch", scenario: "candidate-digest-mismatch", variant: "candidate-zip" },
  { caseId: "adopted-evidence-digest-mismatch", scenario: "candidate-manifest-mismatch", variant: "candidate-manifest" },
  { caseId: "adopted-evidence-digest-mismatch", scenario: "candidate-tarball-mismatch", variant: "candidate-tarball" },
  { caseId: "adopted-evidence-digest-mismatch", scenario: "readiness-digest-mismatch", variant: "readiness" },
];

const generatedContract = JSON.parse(readFileSync(new URL("../../../tooling/effect-build-contract.json", import.meta.url)));
export const hypotheticalFakeRegistryEvidenceLedger =
  generatedContract.releaseCertification.fakeRegistry.exactProtectedBodyCertification.exactMutationLedger;
const expectedPublicDistTags = new Map(
  generatedContract.npmRegistryBoundary.publicationAdmission.target.expectedDistTagsBeforePublication
    .map(({ name, tags }) => [name, tags]),
);

export const oidcRejectionScenarioMatrix = [
  { id: "wrong-alg", scenario: "oidc-wrong-alg" },
  { id: "header-directed-key", scenario: "oidc-header-directed-key" },
  { id: "missing-kid", scenario: "oidc-missing-kid" },
  { id: "duplicate-kid", scenario: "oidc-duplicate-kid" },
  { id: "bad-signature", scenario: "oidc-bad-signature" },
  { id: "stale-times", scenario: "oidc-stale-times" },
  { id: "future-times", scenario: "oidc-future-times" },
  { id: "wrong-issuer", scenario: "oidc-wrong-issuer" },
  { id: "wrong-audience", scenario: "oidc-wrong-audience" },
  { id: "wrong-subject", scenario: "oidc-wrong-subject" },
  { id: "wrong-repository-id", scenario: "oidc-wrong-repository-id" },
  { id: "wrong-workflow", scenario: "oidc-wrong-workflow" },
  { id: "wrong-source-sha", scenario: "oidc-wrong-source-sha" },
  { id: "wrong-run-attempt", scenario: "oidc-wrong-run-attempt" },
  { id: "repository-policy-drift", scenario: "oidc-policy-drift" },
];

export const readState = (path) => JSON.parse(readFileSync(path, "utf8"));

export const writeState = (path, state) => {
  const temporary = `${path}.new`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, path);
};

const initialVersion = (name, placeholderPackages) => {
  if (placeholderNames.includes(name)) {
    return {
      [placeholderVersion]: {
        ...placeholderPackages[name],
        provenance: null,
      },
    };
  }
  return {
    ...(expectedPublicDistTags.get(name)?.reserved === placeholderVersion ? {
      [placeholderVersion]: {
        bytes: 1,
        file: null,
        integrity: `sha512-${Buffer.from(`reserved-${name}`).toString("base64")}`,
        provenance: null,
        sha256: sha256(Buffer.from(`reserved-${name}`)),
      },
    } : {}),
    "0.3.0": {
      bytes: 1,
      file: null,
      integrity: `sha512-${Buffer.from(`prior-${name}`).toString("base64")}`,
      provenance: null,
      sha256: sha256(Buffer.from(`prior-${name}`)),
    },
  };
};

const initialTags = (name) => structuredClone(
  expectedPublicDistTags.get(name) ?? { latest: placeholderVersion, reserved: placeholderVersion },
);

export const exactProvenance = () => ({
  predicateType: "https://slsa.dev/provenance/v1",
  sourceSha,
  verified: true,
  workflowRef,
});

export const commitTarget = (state, name, provenance = exactProvenance()) => {
  const candidate = state.candidate.packages[name];
  if (candidate === undefined) throw new Error(`missing candidate fixture for ${name}`);
  state.registry.packages[name].versions[targetVersion] = {
    ...candidate,
    provenance,
  };
  state.registry.packages[name].tags.latest = targetVersion;
};

export const createReleaseState = ({
  candidate,
  contractPath,
  placeholderPackages,
  readiness,
  scenario,
  statePath,
}) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "effect-build-fake-oidc";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const headerValue = { alg: "RS256", kid, typ: "JWT" };
  const claimsValue = {
    aud: "npm:registry.npmjs.org",
    environment: "npm",
    event_name: "workflow_dispatch",
    exp: now + 300,
    iat: now,
    iss: "https://token.actions.githubusercontent.com",
    nbf: now - 5,
    ref: "refs/heads/main",
    ref_type: "branch",
    repository: "mannyc2/effect-build",
    repository_id: "1331906770",
    repository_owner: "mannyc2",
    repository_owner_id: "126291407",
    repository_visibility: "public",
    run_attempt: "1",
    run_id: "8001",
    runner_environment: "github-hosted",
    sha: sourceSha,
    sub: "repo:mannyc2@126291407/effect-build@1331906770:environment:npm",
    workflow_ref: workflowRef,
    workflow_sha: sourceSha,
  };
  let duplicateKid = false;
  let badSignature = false;
  switch (scenario) {
    case "oidc-wrong-alg":
      headerValue.alg = "ES256";
      break;
    case "oidc-header-directed-key":
      headerValue.jku = "https://attacker.invalid/jwks";
      break;
    case "oidc-missing-kid":
      delete headerValue.kid;
      break;
    case "oidc-duplicate-kid":
      duplicateKid = true;
      break;
    case "oidc-bad-signature":
      badSignature = true;
      break;
    case "oidc-stale-times":
      claimsValue.iat = now - 1_200;
      claimsValue.nbf = now - 1_200;
      claimsValue.exp = now - 600;
      break;
    case "oidc-future-times":
      claimsValue.iat = now + 120;
      claimsValue.nbf = now + 120;
      claimsValue.exp = now + 420;
      break;
    case "oidc-wrong-issuer":
      claimsValue.iss = "https://issuer.invalid";
      break;
    case "oidc-wrong-audience":
      claimsValue.aud = "https://registry.npmjs.org";
      break;
    case "oidc-wrong-subject":
      claimsValue.sub = "repo:foreign/repository:environment:npm";
      break;
    case "oidc-wrong-repository-id":
      claimsValue.repository_id = "1";
      break;
    case "oidc-wrong-workflow":
      claimsValue.workflow_ref = "mannyc2/effect-build/.github/workflows/foreign.yml@refs/heads/main";
      break;
    case "oidc-wrong-source-sha":
      claimsValue.sha = "2222222222222222222222222222222222222222";
      break;
    case "oidc-wrong-run-attempt":
      claimsValue.run_attempt = "2";
      break;
  }
  const header = encode(headerValue);
  const claims = encode(claimsValue);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), privateKey).toString("base64url");
  const jwk = publicKey.export({ format: "jwk" });
  const state = {
    api: {
      environment: {
        deployment_branch_policy: {
          custom_branch_policies: true,
          protected_branches: false,
        },
        name: "npm",
        protection_rules: [
          {
            prevent_self_review: false,
            reviewers: [{ reviewer: { id: 126291407, login: "mannyc2" }, type: "User" }],
            type: "required_reviewers",
          },
          { type: "branch_policy" },
        ],
      },
      mainSha: sourceSha,
      oidc: {
        sub_claim_prefix: "repo:mannyc2@126291407/effect-build@1331906770",
        use_default: true,
        use_immutable_subject: true,
      },
      oidcProvider: {
        discovery: {
          id_token_signing_alg_values_supported: ["RS256"],
          issuer: "https://token.actions.githubusercontent.com",
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        },
        jwks: {
          keys: duplicateKid
            ? [{ ...jwk, alg: "RS256", kid, use: "sig" }, { ...jwk, alg: "RS256", kid, use: "sig" }]
            : [{ ...jwk, alg: "RS256", kid, use: "sig" }],
        },
        token: `${header}.${claims}.${badSignature ? `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}` : signature}`,
      },
      policies: {
        branch_policies: [{ name: "main", type: "branch" }],
        total_count: 1,
      },
    },
    artifacts: {
      candidate,
      readiness,
    },
    candidate: {
      contractPath,
      packages: candidate.packages,
    },
    dispatch: {
      candidateDigest: candidate.digest,
      readinessDigest: readiness.digest,
    },
    faults: {},
    invocations: [],
    mutations: [],
    observations: { environmentReads: 0, mainReads: 0 },
    registry: {
      packages: Object.fromEntries(
        [...packageNames, reservedOnlyName].map((name) => [name, {
          tags: initialTags(name),
          versions: initialVersion(name, placeholderPackages),
        }]),
      ),
    },
    scenario,
    schema: "effect-build/fake-release-boundary@1",
    sourceSha,
  };

  applyScenario(state, scenario);
  writeState(statePath, state);
  return state;
};

export const applyScenario = (state, scenario) => {
  if (oidcRejectionScenarioMatrix.some((entry) => entry.scenario === scenario)) {
    if (scenario === "oidc-policy-drift") state.api.oidc.use_immutable_subject = false;
    return;
  }
  switch (scenario) {
    case "full-convergence":
    case "publish-config-missing":
    case "publish-config-extra":
    case "publish-config-noncanonical":
    case "publish-config-auth":
    case "candidate-manifest-mismatch":
    case "candidate-tarball-mismatch":
    case "private-manifest":
    case "duplicate-nonmanifest":
    case "symlink-leaf":
    case "readiness-stale":
    case "readiness-future":
    case "readiness-excess-validity":
      return;
    case "preexisting-registry-auth":
      state.faults.npmConfigAuth = true;
      return;
    case "dry-run-marker-missing":
      state.faults.dryRunMarker = "missing";
      return;
    case "dry-run-marker-duplicate":
      state.faults.dryRunMarker = "duplicate";
      return;
    case "partial-prefix":
      for (const name of packageNames.slice(0, 3)) commitTarget(state, name);
      return;
    case "exact-target-wrong-latest":
      commitTarget(state, packageNames[0]);
      state.registry.packages[packageNames[0]].tags.latest = "0.3.0";
      return;
    case "conflicting-target-bytes":
      commitTarget(state, packageNames[0]);
      state.registry.packages[packageNames[0]].versions[targetVersion].integrity =
        `sha512-${Buffer.from("conflicting bytes").toString("base64")}`;
      return;
    case "missing-provenance":
      commitTarget(state, packageNames[0], null);
      return;
    case "unverifiable-provenance":
      commitTarget(state, packageNames[0], { ...exactProvenance(), verified: false });
      return;
    case "foreign-provenance":
      commitTarget(state, packageNames[0], {
        ...exactProvenance(),
        workflowRef: "foreign/repository/.github/workflows/release.yml@refs/heads/main",
      });
      return;
    case "wrong-sha-provenance":
      commitTarget(state, packageNames[0], {
        ...exactProvenance(),
        sourceSha: "2222222222222222222222222222222222222222",
      });
      return;
    case "wrong-source-oid":
      commitTarget(state, packageNames[0], { ...exactProvenance(), signerOid: "wrong" });
      return;
    case "duplicate-source-oid":
      commitTarget(state, packageNames[0], { ...exactProvenance(), signerOid: "duplicate" });
      return;
    case "prior-latest-drift":
      state.registry.packages[packageNames[0]].tags.latest = "0.5.0";
      return;
    case "mid-run-unprocessed-package-drift":
      state.faults.driftDuringPrefixAfterFirstCommit = packageNames[5];
      return;
    case "mid-run-main-advanced":
      state.faults.advanceMainAfterFirstCommit = true;
      return;
    case "mid-run-authority-drift":
      state.faults.authorityDriftAfterFirstCommit = true;
      return;
    case "newer-version":
      state.registry.packages[packageNames[0]].versions["0.7.0"] = {
        bytes: 1,
        file: null,
        integrity: `sha512-${Buffer.from("newer").toString("base64")}`,
        provenance: null,
        sha256: sha256(Buffer.from("newer")),
      };
      return;
    case "inconclusive-read":
      state.faults.view = { field: "dist-tags", name: packageNames[0] };
      return;
    case "response-loss-before-commit":
      state.faults.publish = { mode: "before-commit", name: packageNames[0] };
      return;
    case "response-loss-after-commit":
      state.faults.publish = { mode: "after-commit", name: packageNames[0] };
      return;
    case "response-loss-after-tag":
      state.faults.publish = { mode: "after-tag", name: packageNames[0] };
      return;
    case "placeholder-latest-drift":
      state.registry.packages["effect-build-apple"].tags.latest = targetVersion;
      return;
    case "placeholder-reserved-drift":
      state.registry.packages["effect-build-apple"].tags.reserved = targetVersion;
      return;
    case "placeholder-extra-version":
      state.registry.packages["effect-build-apple"].versions["0.0.1"] = {
        bytes: 1,
        file: null,
        integrity: `sha512-${Buffer.from("rogue-placeholder-version").toString("base64")}`,
        provenance: null,
        sha256: sha256(Buffer.from("rogue-placeholder-version")),
      };
      return;
    case "reservation-latest-drift":
      state.registry.packages[reservedOnlyName].tags.latest = targetVersion;
      return;
    case "reservation-reserved-drift":
      state.registry.packages[reservedOnlyName].tags.reserved = targetVersion;
      return;
    case "rolldown-version-drift":
      state.registry.packages[reservedOnlyName].versions[targetVersion] = {
        bytes: 1,
        file: null,
        integrity: `sha512-${Buffer.from("rolldown-drift").toString("base64")}`,
        provenance: null,
        sha256: sha256(Buffer.from("rolldown-drift")),
      };
      return;
    case "main-advanced":
      state.api.mainSha = "2222222222222222222222222222222222222222";
      return;
    case "candidate-digest-mismatch":
      state.dispatch.candidateDigest = `sha256:${"0".repeat(64)}`;
      return;
    case "readiness-digest-mismatch":
      state.dispatch.readinessDigest = `sha256:${"f".repeat(64)}`;
      return;
    case "post-publish-bytes-mismatch":
      state.faults.postPublish = { mode: "bytes", name: packageNames[0] };
      return;
    case "post-publish-integrity-mismatch":
      state.faults.postPublish = { mode: "integrity", name: packageNames[0] };
      return;
    case "post-publish-size-mismatch":
      state.faults.postPublish = { mode: "size", name: packageNames[0] };
      return;
    default:
      throw new Error(`unknown fake release scenario: ${scenario}`);
  }
};

export const clearPublishFault = (statePath) => {
  const state = readState(statePath);
  delete state.faults.publish;
  writeState(statePath, state);
};
