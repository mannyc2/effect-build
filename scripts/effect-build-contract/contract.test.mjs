import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ModuleKind, transpileModule } from "typescript";
import { renderCompatibilityModule, renderProjections } from "./projections.mjs";

import {
  buildCompatibilityPolicies,
  buildContract,
  readInputs,
  validateCompatibility,
  validateContract,
  validateImplementationCoordinates,
  validatePublicApiProjection,
} from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);
const contract = validateContract(buildContract(inputs), inputs);

const projectedPublicApi = () => ({
  schema: "effect-build/public-surface@3",
  packages: Object.fromEntries(
    Object.entries(contract.publicApiProjection.packages).map(([packageName, surface]) => [
      packageName,
      {
        namespaces: surface.rootNamespaces,
        subpaths: Object.fromEntries(
          Object.entries(surface.subpaths).map(([subpath, subpathSurface]) => {
            if (Array.isArray(subpathSurface)) return [subpath, { runtime: [], declarations: [] }];
            return [subpath, {
              runtime: [...subpathSurface.operationNamespaces, ...subpathSurface.supportExports.runtime],
              declarations: [...subpathSurface.operationNamespaces, ...subpathSurface.supportExports.declarations],
            }];
          }),
        ),
      },
    ]),
  ),
});

test("accounts for every research operation and non-operation finding", () => {
  assert.equal(contract.providerOperationRegister.count, 67);
  assert.deepEqual(contract.providerOperationRegister.dispositionCounts, {
    mandatory: 5,
    "positive-proof-gated": 22,
    "conditional-private": 27,
    rejected: 11,
    superseded: 2,
  });
  assert.equal(contract.nonOperationRegister.count, 46);
  assert.deepEqual(contract.nonOperationRegister.dispositionCounts, {
    mandatory: 26,
    "conditional-private": 16,
    rejected: 4,
  });
  assert.deepEqual(contract.privateImplementationRegister.capabilities, [
    {
      id: "PRIVATE-APPLE-NOTARY-SUBMISSION",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotarySubmission",
      path: "packages/effect-build-apple/src/internal/NotarySubmission.ts",
      exports: ["makeSubmissionEngine"],
      visibility: "private",
    },
    {
      id: "PRIVATE-APPLE-NOTARY-JOURNAL-CODEC",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotaryJournalCodec",
      path: "packages/effect-build-apple/src/internal/NotaryJournalCodec.ts",
      exports: [
        "notaryJournalCodecId",
        "encodeNotaryJournalValue",
        "decodeNotaryJournalValue",
        "submissionReferenceFromSubmission",
      ],
      visibility: "private",
    },
    {
      id: "PRIVATE-APPLE-NOTARY-REJECTION-FIXTURE",
      atomIds: [],
      package: "effect-build-apple",
      module: "internal/NotaryRejectionFixture",
      path: "packages/effect-build-apple/src/internal/NotaryRejectionFixture.ts",
      exports: ["Submitter", "submitOnce", "layer"],
      visibility: "private",
    },
    {
      id: "PRIVATE-NODE-SEA-MODES",
      atomIds: ["S05.1", "S06.1", "S07.1"],
      package: "effect-build-node-sea",
      module: "internal/AssembleModes",
      path: "packages/effect-build-node-sea/src/internal/AssembleModes.ts",
      exports: ["assembleDirect"],
      visibility: "private",
    },
  ]);
});

test("keeps exact admitted and rejected fixtures distinct from operation acceptance", () => {
  assert.deepEqual(
    contract.exactToolEvidenceRegister.tools.map((
      { name, version, expectation },
    ) => [name, version, expectation ?? "admitted"]),
    [
      ["bun", "1.3.14", "admitted"],
      ["bun", "1.4.2", "admitted"],
      ["deno", "2.9.5", "admitted"],
      ["deno", "2.9.6", "rejected"],
      ["esbuild", "0.28.2", "admitted"],
      ["node", "26.7.0", "admitted"],
      ["uv", "0.12.0", "admitted"],
      ["nfpm", "2.47.0", "admitted"],
      ["syft", "1.50.0", "admitted"],
    ],
  );
  assert.doesNotThrow(() => validateCompatibility(contract));
  const inconsistent = structuredClone(contract);
  delete inconsistent.exactToolEvidenceRegister.tools.find((entry) => entry.version === "2.9.6").expectation;
  assert.throws(() => validateCompatibility(inconsistent), /admission expectation/u);
});

const samplePolicy = () => ({
  id: "test-command",
  provider: "bun",
  lane: "Command",
  visibility: "public",
  operationIds: ["CAN-BUN-008"],
  accepts: [{ major: 1, minor: 3, fromPatch: 14, beforePatch: null }],
});

test("normalizes windows and derives policy keys without fixture or rationale coupling", () => {
  const original = buildCompatibilityPolicies([samplePolicy()])[0];
  assert.equal(original.range, ">=1.3.14 <1.4.0");
  assert.equal(buildCompatibilityPolicies([{ ...samplePolicy(), rationale: "new explanation" }])[0].key, original.key);
  const narrowed = samplePolicy();
  narrowed.accepts = [
    { major: 1, minor: 3, fromPatch: 17, beforePatch: null },
    { major: 1, minor: 3, fromPatch: 14, beforePatch: 16 },
  ];
  const actual = buildCompatibilityPolicies([narrowed])[0];
  assert.equal(actual.range, ">=1.3.14 <1.3.16 || >=1.3.17 <1.4.0");
  assert.notEqual(actual.key, original.key);
});

test("rejects invalid windows and duplicated decisions at generation time", () => {
  for (
    const mutate of [
      (p) => p.accepts.push({ ...p.accepts[0] }),
      (p) => p.accepts[0].fromPatch = -1,
      (p) => p.accepts[0].beforePatch = 14,
      (p) => p.accepts[0].major = 1.5,
      (p) => p.accepts[0].minor = Number.MAX_SAFE_INTEGER,
      (p) => delete p.accepts[0].minor,
      (p) => p.accepts = [],
      (p) => p.operationIds = [],
      (p) => p.operationIds.push("CAN-NODE-001"),
    ]
  ) {
    const invalid = samplePolicy();
    mutate(invalid);
    assert.throws(() => buildCompatibilityPolicies([invalid]));
  }
  assert.throws(() => buildCompatibilityPolicies([samplePolicy(), { ...samplePolicy(), id: "other" }]), /bindings/u);
});

test("rejects unbound and visibility-mismatched operations", () => {
  const missing = structuredClone(contract);
  const policy = missing.commandCompatibilityRegister.policies.find((entry) => entry.id === "esbuild-command-public");
  policy.operationIds = policy.operationIds.filter((id) => id !== "CAN-ESB-016");
  missing.commandCompatibilityRegister.policies = buildCompatibilityPolicies(
    missing.commandCompatibilityRegister.policies,
  );
  assert.throws(() => validateCompatibility(missing), /missing command compatibility binding/u);
  const leaked = structuredClone(contract);
  leaked.commandCompatibilityRegister.policies.find((entry) => entry.id === "esbuild-command-private").visibility =
    "public";
  leaked.commandCompatibilityRegister.policies = buildCompatibilityPolicies(
    leaked.commandCompatibilityRegister.policies,
  );
  assert.throws(() => validateCompatibility(leaked), /visibility/u);
});

test("cannot orphan a provider module or swap runtime operation semantics", () => {
  const removed = structuredClone(contract);
  removed.commandCompatibilityRegister.policies = removed.commandCompatibilityRegister.policies.filter((entry) =>
    entry.provider !== "esbuild"
  );
  removed.commandCompatibilityRegister.count = removed.commandCompatibilityRegister.policies.length;
  assert.throws(() => validateCompatibility(removed), /missing command compatibility binding/u);
  const swapped = structuredClone(contract);
  const publicPolicy = swapped.commandCompatibilityRegister.policies.find((entry) =>
    entry.id === "esbuild-command-public"
  );
  publicPolicy.operations.serve = publicPolicy.operations.buildStdout;
  delete publicPolicy.operations.buildStdout;
  assert.throws(() => validateCompatibility(swapped), /projections are stale/u);
});

test("generated runtime implements stable numeric windows and exact private gates", async () => {
  const policies = contract.commandCompatibilityRegister.policies.filter((entry) => entry.provider === "esbuild");
  const source =
    transpileModule(renderCompatibilityModule(policies), { compilerOptions: { module: ModuleKind.ESNext } }).outputText;
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const policy = runtime.compatibilityByOperation.buildStdout;
  for (
    const [version, accepted] of [
      ["0.28.1", false],
      ["0.28.2", true],
      ["0.28.10", true],
      ["0.28.999", true],
      ["0.29.0", false],
      ["0.28.2-canary", false],
      ["0.28.2+build", false],
      ["0.028.2", false],
      ["0.28", false],
      ["v0.28.2", false],
      ["0.28.2\n", false],
      ["0.28.9007199254740992", false],
    ]
  ) {
    assert.equal(runtime.acceptsRelease(policy, runtime.parseReleaseVersion(version), "unreported"), accepted, version);
  }
  assert.equal(runtime.acceptsRelease(policy, runtime.parseReleaseVersion("0.28.2"), "canary"), false);
  assert.equal(
    runtime.acceptsRelease(runtime.compatibilityByOperation.serve, runtime.parseReleaseVersion("0.28.3"), "release"),
    false,
  );
  const gap = {
    key: "gap",
    range: ">=0.28.2 <0.28.4 || >=0.28.5 <0.29.0",
    accepts: [
      { major: 0, minor: 28, fromPatch: 2, beforePatch: 4 },
      { major: 0, minor: 28, fromPatch: 5, beforePatch: null },
    ],
  };
  for (const [version, expected] of [["0.28.3", true], ["0.28.4", false], ["0.28.5", true]]) {
    assert.equal(runtime.acceptsRelease(gap, runtime.parseReleaseVersion(version), "stable"), expected);
  }
  assert.match(runtime.explainRefusal(policy, "0.29.0", "stable"), /accepted >=0.28.2 <0.29.0/u);
});

test("projects all providers, documentation, and contract from the same policy", () => {
  const outputs = renderProjections(contract);
  assert.equal(outputs.size, 5);
  assert.equal(outputs.get("tooling/effect-build-contract.json"), `${JSON.stringify(contract, null, 2)}\n`);
  const altered = structuredClone(contract);
  altered.commandCompatibilityRegister.policies.find((entry) => entry.id === "esbuild-command-public").accepts[0]
    .fromPatch = 3;
  altered.commandCompatibilityRegister.policies = buildCompatibilityPolicies(
    altered.commandCompatibilityRegister.policies,
  );
  const changed = renderProjections(altered);
  assert.notEqual(
    changed.get("packages/effect-build-esbuild/src/internal/Compatibility.generated.ts"),
    outputs.get("packages/effect-build-esbuild/src/internal/Compatibility.generated.ts"),
  );
  assert.notEqual(changed.get("docs/compiler-compatibility.md"), outputs.get("docs/compiler-compatibility.md"));
  assert.equal(
    changed.get("packages/effect-build-bun/src/internal/Compatibility.generated.ts"),
    outputs.get("packages/effect-build-bun/src/internal/Compatibility.generated.ts"),
  );
});

test("binds every live operation, private support, producer capability, and core capability to source", async () => {
  await validateImplementationCoordinates(contract, repositoryRoot);
});

test("keeps Deno bundle breadth and every live Rolldown operation private", () => {
  const operations = contract.providerOperationRegister.operations;
  const denoPrivate = operations
    .filter((operation) => operation.operationId.startsWith("CAN-DENO-") && operation.accounting.surface === "private")
    .map((operation) => operation.operationId);
  assert.deepEqual(denoPrivate, [
    "CAN-DENO-001",
    "CAN-DENO-002",
    "CAN-DENO-003",
    "CAN-DENO-004",
    "CAN-DENO-005",
    "CAN-DENO-006",
    "CAN-DENO-011",
  ]);
  const rolldown = operations.filter((operation) => operation.provider === "rolldown");
  assert.equal(rolldown.filter((operation) => operation.accounting.surface === "private").length, 19);
  assert.deepEqual(
    rolldown.filter((operation) => operation.disposition === "rejected").map((operation) => operation.operationId),
    ["CAN-ROL-021"],
  );
  assert.deepEqual(contract.publicApiProjection.privatePackages, ["effect-build-rolldown"]);
});

test("accounts for every producer family and distinguishes finalizers from native results", () => {
  assert.deepEqual(contract.producerCapabilityRegister.families, [
    "apple",
    "archives",
    "nfpm",
    "python",
    "sbom",
    "windows",
  ]);
  assert.equal(contract.producerCapabilityRegister.count, 19);
  const nonFinalizing = contract.producerCapabilityRegister.capabilities
    .filter((capability) => !capability.finalization.returnsDurableArtifact)
    .map((capability) => `${capability.module}.${capability.exports.join("+")}`);
  assert.deepEqual(nonFinalizing, [
    "Notary.submit",
    "Notary.submitApp",
    "Notary.info",
    "Notary.log",
    "Assess.assess",
  ]);
});

test("makes public-api a strict projection and rejects private package leaks", () => {
  const publicApi = projectedPublicApi();
  assert.equal(validatePublicApiProjection(contract, publicApi), publicApi);
  publicApi.packages["effect-build-rolldown"] = { namespaces: ["Api"], subpaths: {} };
  assert.throws(
    () => validatePublicApiProjection(contract, publicApi),
    /package set is not the combined-contract projection/u,
  );
});
