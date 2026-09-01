import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appleCertificationPolicy, isRecord } from "./canonical.mjs";
import { authenticateGeneratedAppleContract } from "./cli.mjs";

const blockedTopologyRunner = "ubuntu-24.04";
const blockedStageStepName = "Unreachable while Apple hosted execution is blocked";
const blockedStageBody = "set -euo pipefail\nexit 78\n";
const localAdmissionBody = [
  "set -euo pipefail",
  'test "$GITHUB_RUN_ATTEMPT" = 1',
  'test "$GITHUB_REF" = refs/heads/main',
  '[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]',
  '[[ "$CANDIDATE_RUN_ID" =~ ^[1-9][0-9]*$ ]]',
  '[[ "$CANDIDATE_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]',
  '[[ "$CANDIDATE_ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]]',
  '[[ "$CANDIDATE_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]',
  'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
  'test "$(node --version)" = v24.14.1',
  'env -i PATH="$PATH" LANG="${LANG:-C.UTF-8}" \\',
  "  CONTRACT_PATH=tooling/effect-build-contract.json \\",
  '  REPOSITORY="$REPOSITORY" SOURCE_SHA="$EXPECTED_SHA" \\',
  '  ACTIONS_READ_TOKEN="$ACTIONS_READ_TOKEN" \\',
  "  node scripts/release/assert-current-main.mjs",
].join("\n") + "\n";
const localQualificationBody = [
  "set -euo pipefail",
  "bun run check:contract",
  "bun run build",
  "bun run --cwd packages/effect-build-apple test",
  "bunx vitest run \\",
  "  test/architecture/apple-certification-protocol.test.ts \\",
  "  test/architecture/apple-certification-workflow.test.ts",
].join("\n") + "\n";
const expectedLocalProtocolSteps = [
  {
    uses: "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    with: { ref: "${{ inputs.source_sha }}", "persist-credentials": false },
  },
  {
    uses: "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    with: { "node-version": "24.14.1", "package-manager-cache": false },
  },
  {
    name: "Admit current-main attempt one and immutable input syntax",
    shell: "bash",
    env: {
      ACTIONS_READ_TOKEN: "${{ github.token }}",
      CANDIDATE_ARTIFACT_DIGEST: "${{ inputs.candidate_artifact_digest }}",
      CANDIDATE_ARTIFACT_ID: "${{ inputs.candidate_artifact_id }}",
      CANDIDATE_RUN_ATTEMPT: "${{ inputs.candidate_run_attempt }}",
      CANDIDATE_RUN_ID: "${{ inputs.candidate_run_id }}",
      EXPECTED_SHA: "${{ inputs.source_sha }}",
      REPOSITORY: "${{ github.repository }}",
    },
    run: localAdmissionBody,
  },
  {
    uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    with: { "bun-version": "1.3.14" },
  },
  { run: "node scripts/release/install-frozen-release-dependencies.mjs" },
  {
    name: "Run only synthetic and credential-free Apple qualification",
    shell: "bash",
    run: localQualificationBody,
  },
];
const blockedStageJobName = ({ id, coordinates }) => coordinates.length === 0
  ? "Inert aggregate topology"
  : `Inert ${id} topology: \${{ matrix.coordinate }}`;

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const exactKeys = (value, expected, label) => {
  if (!isRecord(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} has missing or additional fields`);
  }
  return value;
};

const uniqueStrings = (values, label) => {
  if (
    !Array.isArray(values)
    || values.some((value) => typeof value !== "string" || value.length === 0)
    || new Set(values).size !== values.length
  ) throw new Error(`${label} must be unique nonempty strings`);
  return values;
};

const stage = (id, needs, coordinates, consumes, produces) => ({
  id,
  needs,
  coordinates,
  consumes,
  produces,
});

const receiptSchema = (policy, categoryId) => {
  const categories = policy.categories.filter(({ id }) => id === categoryId);
  if (categories.length !== 1) throw new Error(`generated Apple receipt category is not unique: ${categoryId}`);
  const category = categories[0];
  return {
    authority: `releaseCertification.apple.categories[id=${categoryId}]`,
    fields: [...policy.commonReceiptFields, ...category.requiredFields],
    forbiddenFields: [...category.forbiddenFields],
  };
};

const artifactCoordinateHandoff = (contract, authority, extra = {}) => ({
  authority: "releaseCertification.githubArtifactCoordinate",
  fields: [...contract.releaseCertification.githubArtifactCoordinate.orderedFields],
  artifactAuthority: authority,
  ...extra,
});

const deriveHandoffSchemas = (contract, policy) => ({
  "candidate-coordinate": artifactCoordinateHandoff(
    contract,
    "releaseCertification.candidate",
  ),
  "authenticated-prior-evidence-coordinate": artifactCoordinateHandoff(
    contract,
    "releaseCertification.apple.protocols.priorEvidence",
    {
      payloadProtocol: policy.protocols.priorEvidence,
      payloadEntryAuthority: "releaseCertification.apple.encoding.evidenceEntryFields",
      payloadEntryFields: [...policy.encoding.evidenceEntryFields],
      receiptBindingAuthority: "releaseCertification.apple.commonReceiptFields",
      receiptBindingFields: policy.commonReceiptFields.filter((field) => [
        "sourceSha",
        "candidateCoordinate",
        "workflowCoordinate",
        "producerDigest",
        "verifierDigest",
        "evidenceDigest",
      ].includes(field)),
      planAuthority: "plans/045-establish-v060-release-point.md#step-6.3",
      preservation: [
        "mode-preserving-file-envelope",
        "mode-and-relative-symlink-preserving-tree-envelope",
        "canonical-receipt-and-opaque-evidence-bytes",
      ],
      verification: [
        "authenticate-exact-artifact-coordinate-before-download",
        "authenticate-github-artifact-digest-before-envelope-open",
        "verify-evidence-entry-digest-and-receipt-identity-before-use",
      ],
    },
  ),
  "producer-bundle-identity": {
    authority: "releaseCertification.apple.hostedExecution.activationInterfaces.producer",
    fields: Object.keys(policy.hostedExecution.activationInterfaces.producer),
  },
  "verifier-bundle-identity": {
    authority: "releaseCertification.apple.hostedExecution.activationInterfaces.verifier",
    fields: Object.keys(policy.hostedExecution.activationInterfaces.verifier),
  },
  "evidence-entry": {
    authority: "releaseCertification.apple.encoding.evidenceEntryFields",
    fields: [...policy.encoding.evidenceEntryFields],
  },
  "executable-identity": {
    authority: "releaseCertification.apple.receiptSchemas.executableIdentity",
    fields: [...policy.receiptSchemas.executableIdentity],
  },
  "paired-app-manifest": {
    authority: "releaseCertification.apple.receiptSchemas.pairedAppManifest",
    fields: [...policy.receiptSchemas.pairedAppManifest],
  },
  "pair-identity": {
    authority: "releaseCertification.apple.receiptSchemas.pairIdentity",
    fields: [...policy.receiptSchemas.pairIdentity],
  },
  "journal-reference": {
    authority: "releaseCertification.apple.receiptSchemas.journalReference",
    fields: [...policy.receiptSchemas.journalReference],
  },
  "native-receipt": receiptSchema(policy, "N-native"),
  "signed-app-receipt": receiptSchema(policy, "P-signed-app"),
  "notarized-product-receipt": receiptSchema(policy, "P-notarized-product"),
  "clean-host-receipt": receiptSchema(policy, "G-clean-host"),
  "verdict-receipt": receiptSchema(policy, "A-verdict"),
  "aggregate-artifact-coordinate": artifactCoordinateHandoff(
    contract,
    "releaseCertification.apple.artifact",
    {
      artifactFields: Object.keys(policy.artifact),
      orderedFiles: [...policy.artifact.orderedFiles],
    },
  ),
});

const stageHandoffs = {
  admission: {
    consumes: ["candidate-coordinate"],
    produces: [
      "producer-bundle-identity",
      "verifier-bundle-identity",
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
    ],
  },
  native: {
    consumes: [
      "candidate-coordinate",
      "producer-bundle-identity",
      "authenticated-prior-evidence-coordinate",
    ],
    produces: [
      "executable-identity",
      "native-receipt",
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
    ],
  },
  "paired-app": {
    consumes: ["authenticated-prior-evidence-coordinate", "executable-identity", "native-receipt"],
    produces: ["paired-app-manifest", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  "sign-app": {
    consumes: [
      "producer-bundle-identity",
      "authenticated-prior-evidence-coordinate",
      "paired-app-manifest",
    ],
    produces: ["signed-app-receipt", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  "distribution-pairs": {
    consumes: ["authenticated-prior-evidence-coordinate", "signed-app-receipt"],
    produces: ["pair-identity", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  "submit-product": {
    consumes: [
      "producer-bundle-identity",
      "authenticated-prior-evidence-coordinate",
      "signed-app-receipt",
      "pair-identity",
    ],
    produces: ["journal-reference", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  "continue-notary": {
    consumes: [
      "producer-bundle-identity",
      "authenticated-prior-evidence-coordinate",
      "journal-reference",
    ],
    produces: [
      "notarized-product-receipt",
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
    ],
  },
  "clean-host": {
    consumes: [
      "verifier-bundle-identity",
      "authenticated-prior-evidence-coordinate",
      "notarized-product-receipt",
    ],
    produces: [
      "clean-host-receipt",
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
    ],
  },
  verdict: {
    consumes: [
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
      "native-receipt",
      "signed-app-receipt",
      "notarized-product-receipt",
      "clean-host-receipt",
    ],
    produces: ["verdict-receipt", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  "final-verdict": {
    consumes: [
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
      "native-receipt",
      "signed-app-receipt",
      "notarized-product-receipt",
      "clean-host-receipt",
      "verdict-receipt",
    ],
    produces: ["verdict-receipt", "authenticated-prior-evidence-coordinate", "evidence-entry"],
  },
  aggregate: {
    consumes: [
      "authenticated-prior-evidence-coordinate",
      "evidence-entry",
      "native-receipt",
      "signed-app-receipt",
      "notarized-product-receipt",
      "clean-host-receipt",
      "verdict-receipt",
    ],
    produces: ["aggregate-artifact-coordinate"],
  },
};

const withHandoffs = (id, needs, coordinates) => {
  const handoffs = stageHandoffs[id];
  if (handoffs === undefined) throw new Error(`Apple hosted stage has no frozen handoff interface: ${id}`);
  return stage(id, needs, coordinates, [...handoffs.consumes], [...handoffs.produces]);
};

export const deriveAppleWorkflowPlan = (contract) => {
  const { policy } = appleCertificationPolicy(contract);
  const hostedExecution = policy.hostedExecution;
  if (
    hostedExecution?.protocol !== "effect-build/apple-hosted-execution@1"
    || hostedExecution.status !== "blocked"
    || hostedExecution.artifactDisposition !== "forbidden-while-blocked"
    || !Array.isArray(hostedExecution.blockerIds)
    || !Array.isArray(hostedExecution.protectedStageIds)
  ) throw new Error("generated Apple hosted execution policy is not the supported blocked hard cut");
  const coordinates = (category) =>
    policy.coordinateRules.filter((rule) => rule.category === category).map(({ coordinate }) => coordinate);
  const native = coordinates("N-native");
  const signedApps = coordinates("P-signed-app");
  const notarized = coordinates("P-notarized-product");
  const cleanHost = coordinates("G-clean-host");
  const verdicts = coordinates("A-verdict");
  const preliminaryVerdicts = verdicts.slice(0, -1);
  const finalVerdicts = verdicts.slice(-1);
  if (!sameJson(finalVerdicts, ["A9"])) {
    throw new Error("generated Apple terminal verdict coordinate changed");
  }
  const pairedApps = [...new Set(
    policy.coordinateRules.filter(({ category }) => category === "P-signed-app").map(({ provider }) => provider),
  )].map((provider) => `paired-app:${provider}`);
  const distributionPairs = policy.productLineage.products
    .filter((product) => product !== "app")
    .map((product) => `paired-product:${product}`);
  const stages = [
    withHandoffs("admission", [], []),
    withHandoffs("native", ["admission"], native),
    withHandoffs("paired-app", ["native"], pairedApps),
    withHandoffs("sign-app", ["paired-app"], signedApps),
    withHandoffs("distribution-pairs", ["sign-app"], distributionPairs),
    withHandoffs("submit-product", ["sign-app", "distribution-pairs"], notarized),
    withHandoffs("continue-notary", ["submit-product"], notarized),
    withHandoffs("clean-host", ["continue-notary"], cleanHost),
    withHandoffs("verdict", ["native", "sign-app", "continue-notary", "clean-host"], preliminaryVerdicts),
    withHandoffs(
      "final-verdict",
      ["native", "sign-app", "continue-notary", "clean-host", "verdict"],
      finalVerdicts,
    ),
    withHandoffs("aggregate", ["final-verdict"], []),
  ];
  const stageIds = new Set(stages.map(({ id }) => id));
  const handoffSchemas = deriveHandoffSchemas(contract, policy);
  const finalVerdictRule = policy.coordinateRules.find(({ coordinate }) => coordinate === "A9");
  const receiptCoordinates = [...new Set(
    stages.flatMap(({ coordinates }) => coordinates).filter((coordinate) => policy.coordinates.includes(coordinate)),
  )];
  uniqueStrings(stages.map(({ id }) => id), "Apple hosted stage ids");
  uniqueStrings(Object.keys(handoffSchemas), "Apple hosted handoff schema ids");
  for (const [schemaId, schema] of Object.entries(handoffSchemas)) {
    if (typeof schema.authority !== "string" || schema.authority.length === 0) {
      throw new Error(`Apple hosted ${schemaId} handoff has no contract authority`);
    }
    uniqueStrings(schema.fields, `Apple hosted ${schemaId} handoff fields`);
    for (const [field, values] of Object.entries(schema)) {
      if (field !== "fields" && (field.endsWith("Fields") || ["orderedFiles", "preservation", "verification"].includes(field))) {
        uniqueStrings(values, `Apple hosted ${schemaId} ${field}`);
      }
    }
  }
  const byteConsumerStageIds = [
    "native",
    "paired-app",
    "sign-app",
    "distribution-pairs",
    "submit-product",
    "continue-notary",
    "clean-host",
    "verdict",
    "final-verdict",
    "aggregate",
  ];
  const byteProducerStageIds = [
    "admission",
    "native",
    "paired-app",
    "sign-app",
    "distribution-pairs",
    "submit-product",
    "continue-notary",
    "clean-host",
    "verdict",
    "final-verdict",
  ];
  if (
    new Set(hostedExecution.blockerIds).size !== hostedExecution.blockerIds.length
    || new Set(hostedExecution.protectedStageIds).size !== hostedExecution.protectedStageIds.length
    || hostedExecution.protectedStageIds.some((id) => !stageIds.has(id))
    || stages.some(({ consumes, produces }) =>
      [...consumes, ...produces].some((schemaId) => handoffSchemas[schemaId] === undefined)
    )
    || byteConsumerStageIds.some((id) =>
      !stages.find((entry) => entry.id === id)?.consumes.includes("authenticated-prior-evidence-coordinate")
    )
    || byteProducerStageIds.some((id) =>
      !stages.find((entry) => entry.id === id)?.produces.includes("authenticated-prior-evidence-coordinate")
    )
    || !isRecord(finalVerdictRule)
    || !sameJson(finalVerdictRule.dependencies.slice(-preliminaryVerdicts.length), preliminaryVerdicts)
    || !sameJson(policy.counts, { total: 28, N: 2, P: 10, G: 6, A: 10 })
    || !sameJson(receiptCoordinates, policy.coordinates)
  ) throw new Error("generated Apple hosted execution lists are invalid");
  return {
    workflow: policy.workflow,
    workflowPath: policy.workflowPath,
    coordinates: policy.coordinates,
    evidenceDescriptorOrder: policy.evidenceDescriptorOrder,
    handoffSchemas,
    stages: stages.map((entry) => ({
      ...entry,
      protectedEnvironment: hostedExecution.protectedStageIds.includes(entry.id),
    })),
    hostedExecution,
    protectedStageIds: [...hostedExecution.protectedStageIds],
  };
};

const normalizeNeeds = (needs) => needs === undefined ? [] : Array.isArray(needs) ? needs : [needs];

const assertStaticBlockedJob = (job, stagePlan) => {
  const expectedKeys = ["name", "needs", "if", "runs-on", "permissions", "steps"];
  if (stagePlan.coordinates.length !== 0) expectedKeys.push("strategy");
  exactKeys(job, expectedKeys, `blocked Apple ${stagePlan.id} job`);
  if (
    job.name !== blockedStageJobName(stagePlan)
    ||
    job.if !== "${{ false }}"
    || job["runs-on"] !== blockedTopologyRunner
    || !sameJson(job.permissions, {})
    || !sameJson(normalizeNeeds(job.needs), stagePlan.needs)
  ) throw new Error(`blocked Apple ${stagePlan.id} job is not statically unreachable and least-authority`);
  if (
    !Array.isArray(job.steps)
    || job.steps.length !== 1
    || !sameJson(job.steps[0], {
      name: blockedStageStepName,
      shell: "bash",
      run: blockedStageBody,
    })
  ) throw new Error(`blocked Apple ${stagePlan.id} job has an executable body`);
  if (stagePlan.coordinates.length === 0) {
    if (job.strategy !== undefined) throw new Error(`blocked Apple ${stagePlan.id} job has an unexpected matrix`);
    return;
  }
  const strategy = exactKeys(job.strategy, ["fail-fast", "matrix"], `blocked Apple ${stagePlan.id} strategy`);
  const matrix = exactKeys(strategy.matrix, ["coordinate"], `blocked Apple ${stagePlan.id} matrix`);
  if (strategy["fail-fast"] !== false || !sameJson(matrix.coordinate, stagePlan.coordinates)) {
    throw new Error(`blocked Apple ${stagePlan.id} coordinate matrix changed`);
  }
};

const admittedContextExpressions = new Set([
  "false",
  "github.repository",
  "github.token",
  "inputs.candidate_artifact_digest",
  "inputs.candidate_artifact_id",
  "inputs.candidate_run_attempt",
  "inputs.candidate_run_id",
  "inputs.source_sha",
  "matrix.coordinate",
]);
const admittedGitHubTokenPath =
  "workflow.jobs.local-protocol-qualification.steps[2].env.ACTIONS_READ_TOKEN";

const recursivelyRejectAuthority = (value, path = "workflow") => {
  if (typeof value === "string") {
    if (/\$\{\{\s*(?:secrets|vars)\./u.test(value)) {
      throw new Error(`${path} references an unconfigured Apple credential or variable`);
    }
    if (/actions\/(?:upload|download)-artifact@/u.test(value)) {
      throw new Error(`${path} can transfer an Actions artifact while Apple hosting is blocked`);
    }
    for (const match of value.matchAll(/\$\{\{\s*([^{}]+?)\s*\}\}/gu)) {
      const expression = match[1].trim();
      if (!admittedContextExpressions.has(expression)) {
        throw new Error(`${path} references an unadmitted GitHub expression context`);
      }
      if (
        expression === "github.token"
        && (path !== admittedGitHubTokenPath || value !== "${{ github.token }}")
      ) throw new Error(`${path} can expose github.token outside the exact read-only observation input`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => recursivelyRejectAuthority(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "environment") throw new Error(`${path} selects a protected environment while Apple hosting is blocked`);
    if (key === "id-token") throw new Error(`${path} can obtain an OIDC token while Apple hosting is blocked`);
    if (key === "continue-on-error" || key === "outputs") {
      throw new Error(`${path} can weaken the blocked Apple failure boundary`);
    }
    if (
      key === "run"
      && typeof entry === "string"
      && /\b(?:aws|codesign|ditto|hdiutil|installer|notarytool|pkgbuild|pkgutil|productbuild|productsign|security|spctl|stapler|xcrun)\b/iu.test(
        entry,
      )
    ) throw new Error(`${path}.${key} can invoke an Apple or AWS executable while hosting is blocked`);
    recursivelyRejectAuthority(entry, `${path}.${key}`);
  }
};

export const validateBlockedAppleWorkflow = (workflow, contract) => {
  const plan = deriveAppleWorkflowPlan(contract);
  exactKeys(workflow, ["name", "on", "permissions", "concurrency", "jobs"], "blocked Apple workflow");
  if (workflow.name !== "Apple certification external-interface stop") {
    throw new Error("blocked Apple workflow name changed");
  }
  const trigger = exactKeys(workflow.on, ["workflow_dispatch"], "blocked Apple workflow trigger");
  const dispatch = exactKeys(trigger.workflow_dispatch, ["inputs"], "blocked Apple workflow dispatch");
  const expectedInputs = [
    "source_sha",
    "candidate_run_id",
    "candidate_run_attempt",
    "candidate_artifact_id",
    "candidate_artifact_digest",
  ];
  exactKeys(dispatch.inputs, expectedInputs, "blocked Apple workflow inputs");
  for (const input of Object.values(dispatch.inputs)) {
    exactKeys(input, ["description", "required", "type"], "blocked Apple workflow input");
    if (input.required !== true || input.type !== "string" || typeof input.description !== "string") {
      throw new Error("blocked Apple workflow inputs must be required strings without activation defaults");
    }
  }
  if (
    !sameJson(workflow.permissions, { contents: "read" })
    || !sameJson(workflow.concurrency, {
      group: "effect-build-apple-certification-v0.6.0",
      "cancel-in-progress": false,
    })
  ) throw new Error("blocked Apple workflow top-level authority changed");

  const jobs = exactKeys(
    workflow.jobs,
    ["local-protocol-qualification", ...plan.stages.map(({ id }) => id)],
    "blocked Apple workflow jobs",
  );
  const local = jobs["local-protocol-qualification"];
  if (
    !isRecord(local)
    || !sameJson(Object.keys(local).sort(), ["name", "runs-on", "steps", "timeout-minutes"].sort())
    || local.name !== "Qualify repository-owned Apple protocols without credentials"
    || local["runs-on"] !== blockedTopologyRunner
    || local["timeout-minutes"] !== 30
    || local.environment !== undefined
    || !sameJson(local.steps, expectedLocalProtocolSteps)
  ) throw new Error("blocked Apple local protocol qualification changed");

  const admission = jobs.admission;
  const expectedAdmissionSteps = [
    {
      uses: "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      with: { ref: "${{ inputs.source_sha }}", "persist-credentials": false },
    },
    {
      uses: "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      with: { "node-version": "24.14.1", "package-manager-cache": false },
    },
    {
      name: "Enforce the external journal, Apple, executor, and runner STOP",
      run: "node scripts/apple-certification/workflow.mjs --assert-hosted-ready",
    },
  ];
  if (
    !isRecord(admission)
    || !sameJson(Object.keys(admission).sort(), ["name", "needs", "permissions", "runs-on", "steps", "timeout-minutes"].sort())
    || admission.name !== "Stop hosted admission before every protected or certifying action"
    || admission.needs !== "local-protocol-qualification"
    || admission["runs-on"] !== blockedTopologyRunner
    || admission["timeout-minutes"] !== 5
    || !sameJson(admission.permissions, { contents: "read" })
    || !sameJson(admission.steps, expectedAdmissionSteps)
  ) throw new Error("blocked Apple admission STOP changed");

  for (const stagePlan of plan.stages.slice(1)) assertStaticBlockedJob(jobs[stagePlan.id], stagePlan);
  recursivelyRejectAuthority(workflow);
  const serialized = JSON.stringify(workflow);
  if (serialized.includes(plan.hostedExecution.activationInterfaces.aws.prefix) || serialized.includes(
    contract.releaseCertification.apple.artifact.name,
  )) throw new Error("blocked Apple workflow exposes a journal namespace or admissible artifact path");
  return plan;
};

export const assertHostedAppleExecutionReady = (contract) => {
  const { hostedExecution } = deriveAppleWorkflowPlan(contract);
  throw new Error(`external-interface-stop:${hostedExecution.blockerIds.join(",")}`);
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--assert-hosted-ready") {
    process.stderr.write("usage: node scripts/apple-certification/workflow.mjs --assert-hosted-ready\n");
    process.exitCode = 64;
  } else {
    try {
      assertHostedAppleExecutionReady(await authenticateGeneratedAppleContract());
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : "external-interface-stop"}\n`);
      process.exitCode = 78;
    }
  }
}
