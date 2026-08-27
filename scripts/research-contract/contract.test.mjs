import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildContract, readInputs, validateContract } from "./model.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputs = await readInputs(repositoryRoot);

test("accounts for the complete research authority without claiming external certification", () => {
  const contract = buildContract(inputs);
  assert.doesNotThrow(() => validateContract(contract, inputs));
  assert.deepEqual(contract.operationRegister.dispositionCounts, {
    mandatory: 5,
    "positive-proof-gated": 22,
    "conditional-gate": 27,
    rejected: 11,
    "superseded-direct-sea": 2,
  });
  assert.equal(contract.operationRegister.count, 67);
  assert.equal(Object.keys(inputs.policy.operationProgressOverrides).length, 67);
  assert.ok(contract.operationRegister.operations.every((entry) =>
    !entry.implementation.status.includes("unassessed")
    && !entry.test.status.includes("unassessed")
    && !entry.evidence.status.includes("unassessed")
  ));
  assert.equal(contract.nonOperationRegister.count, 46);
  assert.equal(Object.keys(inputs.policy.nonOperationProgressOverrides).length, 46);
  assert.ok(contract.nonOperationRegister.entries.every((entry) =>
    !entry.implementation.status.includes("unassessed")
    && !entry.test.status.includes("unassessed")
    && !entry.evidence.status.includes("unassessed")
  ));
  assert.ok(Object.values(contract.supplemental).flat().every((entry) =>
    !entry.implementation.status.includes("unassessed")
    && !entry.test.status.includes("unassessed")
    && !entry.evidence.status.includes("unassessed")
  ));
  assert.equal(contract.targetPublicSurface.status, "hard-cut-implemented-required-public-conditional-package-private");
  assert.equal(contract.certification.currentClaim, "local-hard-cut-implementation-and-test-evidence-only");
  assert.equal(contract.certification.externalEvidenceEarnedByThisContract, false);
});

test("records negative proof for rejected and superseded operations", () => {
  const contract = buildContract(inputs);
  const rejected = contract.operationRegister.operations.find((entry) => entry.operationId === "CAN-ESB-006");
  const superseded = contract.operationRegister.operations.find((entry) => entry.operationId === "CAN-NODE-003");
  assert.match(rejected.test.status, /negative/u);
  assert.match(superseded.test.status, /negative/u);
  assert.deepEqual(rejected.evidence.gates, []);
  assert.deepEqual(superseded.evidence.gates, []);
});

test("rejects missing operation progress accounting", () => {
  const missing = structuredClone(inputs);
  delete missing.policy.operationProgressOverrides["CAN-BUN-001"];
  assert.throws(
    () => validateContract(buildContract(missing), missing),
    /explicitly account for every R1 operation/u,
  );
});

test("applies explicit progress to accepted, deferred, and rejected non-operation atoms", () => {
  const contract = buildContract(inputs);
  assert.match(
    contract.nonOperationRegister.entries.find((entry) => entry.atomId === "B02.1").implementation.status,
    /implemented/u,
  );
  assert.match(
    contract.nonOperationRegister.entries.find((entry) => entry.atomId === "S05.1").evidence.status,
    /named-gate-open/u,
  );
  assert.match(
    contract.nonOperationRegister.entries.find((entry) => entry.atomId === "S05.1").implementation.status,
    /implemented-package-private/u,
  );
  assert.match(
    contract.nonOperationRegister.entries.find((entry) => entry.atomId === "R03.1").test.status,
    /negative/u,
  );
});

test("rejects missing or unknown non-operation progress accounting", () => {
  const missing = structuredClone(inputs);
  delete missing.policy.nonOperationProgressOverrides["B02.1"];
  assert.throws(
    () => validateContract(buildContract(missing), missing),
    /explicitly account for every registered atom/u,
  );

  const unknown = structuredClone(inputs);
  unknown.policy.nonOperationProgressOverrides["UNKNOWN"] = unknown.policy.nonOperationProgressOverrides["B02.1"];
  assert.throws(() => validateContract(buildContract(unknown), unknown), /unknown non-operation progress override/u);
});

test("rejects an omitted research row", () => {
  const contract = structuredClone(buildContract(inputs));
  contract.operationRegister.operations.pop();
  assert.throws(() => validateContract(contract, inputs), /all 67 R1 operations/u);
});

for (const field of ["implementation", "test", "evidence"]) {
  test(`rejects a research row without ${field} accounting`, () => {
    const contract = structuredClone(buildContract(inputs));
    delete contract.operationRegister.operations[0][field];
    assert.throws(() => validateContract(contract, inputs), new RegExp(field, "u"));
  });
}

test("rejects a public export without a semantic owner", () => {
  const contract = structuredClone(buildContract(inputs));
  contract.currentPublicSurfaceOwnership.exports[0].semanticOwner = null;
  assert.throws(() => validateContract(contract, inputs), /semanticOwner/u);
});

test("rejects stale inherited semantic-owner surface", () => {
  const stale = structuredClone(inputs);
  stale.policy.publicSurfaceOwners["effect-build-bun"].subpaths["./Bundle"] = "legacy/bundle";
  assert.throws(() => validateContract(buildContract(stale), stale), /exact current surface/u);
});

test("rejects an omitted supplemental authority", () => {
  const contract = structuredClone(buildContract(inputs));
  contract.supplemental.apple.pop();
  assert.throws(() => validateContract(contract, inputs), /supplemental apple coverage/u);
});

test("projects every live provider operation into truthful Api or Command ownership", () => {
  const contract = buildContract(inputs);
  const projected = contract.targetPublicSurface.providerLanes.flatMap((provider) =>
    provider.lanes.flatMap((lane) => lane.modules.flatMap((module) => module.operations))
  );
  assert.equal(projected.length, 54);
  assert.equal(new Set(projected.map((entry) => entry.operationId)).size, 54);
  assert.ok(projected.every((entry) => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(entry.implementationExport)));
  assert.ok(projected.every((entry) => entry.export === null || entry.export === entry.implementationExport));
  const byOperation = Object.fromEntries(projected.map((entry) => [entry.operationId, entry.implementationExport]));
  assert.equal(byOperation["CAN-ROL-001"], "make");
  assert.equal(byOperation["CAN-ROL-002"], "generateScoped");
  assert.equal(byOperation["CAN-ROL-003"], "writeScoped");
  const node = contract.targetPublicSurface.providerLanes.find((entry) => entry.package === "effect-build-node-sea");
  assert.deepEqual(node.lanes.map((lane) => lane.lane), ["Command"]);
  const deno = contract.targetPublicSurface.providerLanes.find((entry) => entry.package === "effect-build-deno");
  assert.equal(deno.lanes.find((lane) => lane.lane === "Api").requirement, "gate-dependent");
  const rolldown = contract.targetPublicSurface.providerLanes.find((entry) => entry.package === "effect-build-rolldown");
  assert.equal(rolldown.requirement, "gate-dependent");
});

test("rejects missing or unknown live-operation implementation exports", () => {
  const missing = structuredClone(inputs);
  delete missing.policy.targetImplementationExportOverrides["CAN-ROL-008"];
  assert.throws(
    () => validateContract(buildContract(missing), missing),
    /missing target implementation export|implementation export policy must cover every live R1 operation/u,
  );

  const unknown = structuredClone(inputs);
  unknown.policy.targetImplementationExportOverrides["CAN-ESB-006"] = "buildToStdout";
  assert.throws(
    () => validateContract(buildContract(unknown), unknown),
    /implementation export policy must cover every live R1 operation/u,
  );
});

test("owns current evidence and release identity without the superseded product contract", () => {
  const contract = buildContract(inputs);
  assert.deepEqual(contract.evidenceControl.certificationHosts.map(({ id }) => id), contract.invariants.certificationHosts);
  assert.deepEqual(
    contract.evidenceControl.coordinateRules.packedConsumers.axes.package,
    contract.releaseControl.orderedPackages,
  );
  const nodeRule = contract.evidenceControl.coordinateRules.nodeMainExecutable;
  assert.equal(nodeRule.expectedCartesianCoordinateCount, 180);
  assert.equal(nodeRule.expectedCoordinateCount, 150);
  assert.equal(nodeRule.expectedUnsupportedCoordinateCount, 30);
  assert.equal(nodeRule.explicitUnsupportedCoordinates.length, 30);
  assert.deepEqual(nodeRule.explicitUnsupportedTargets.map(({ target, disposition }) => ({ target, disposition })), [
    { target: "macos-x64", disposition: "rejected" },
  ]);
  assert.ok(nodeRule.explicitUnsupportedCoordinates.every(({ target, disposition }) =>
    target === "macos-x64" && disposition === "rejected"
  ));
  assert.equal(contract.evidenceControl.coordinateRules.compilerTargets.expectedCoordinateCount, 12);
  assert.equal(contract.evidenceControl.coordinateRules.compilerTargets.targetExecutionClaim.startsWith("none-"), true);
  assert.equal(
    contract.evidenceControl.coordinateRules.providerNativeLanes.observationProtocol,
    "effect-build/provider-native-operation-observation@1",
  );
  assert.equal(
    contract.evidenceControl.coordinateRules.providerNativeLanes.receiptProtocol,
    "effect-build/provider-native-evidence-receipt@2",
  );
  assert.equal(
    contract.evidenceControl.directoryGeneration.manifestBytes.sampleSha256,
    "211ead14e221092d32c78fd7c992d27aeb54753a837a89d1ac3b063d0aa28a3a",
  );
  assert.equal(
    contract.evidenceControl.nodeMainExecutable.targetFinalization.capability.publicExport,
    "none-package-private-research-complete",
  );
  assert.equal(contract.releaseControl.candidateSchema, "effect-build/release-candidate@3");
  assert.equal(contract.releaseControl.candidateIdentity.workflowPath, ".github/workflows/candidate.yml");
  assert.equal(contract.releaseControl.candidatePackageRecordFields.length, 10);
  assert.equal(contract.releaseControl.candidatePublicNodeSeaEvidenceFields.length, 14);
  const apple = contract.evidenceControl.appleCertification;
  assert.deepEqual(apple.protocols, {
    request: "effect-build/apple-certification-request@2",
    receipt: "effect-build/apple-certification-receipt@2",
    evidence: "effect-build/apple-certification-evidence@2",
    bundle: "effect-build/apple-certification-bundle@2",
    priorEvidenceManifest: "effect-build/apple-certification-prior-evidence@1",
    index: "effect-build/apple-certification-index@1",
  });
  assert.equal(apple.certificationCells.length, 10);
  assert.equal(apple.appleDistributionCoordinates.length, 14);
  assert.equal(apple.appleCleanHostCoordinates.length, 8);
  assert.equal(apple.certifierAuthority.environment, "apple-certification");
  assert.equal(apple.certifierAuthority.primaryDigestVariable, "EFFECT_BUILD_APPLE_CERTIFIER_SHA256");
  assert.equal(apple.certifierAuthority.cleanHostDigestVariable, "EFFECT_BUILD_APPLE_CLEAN_HOST_CERTIFIER_SHA256");
  assert.notEqual(apple.certifierAuthority.primaryDigestVariable, apple.certifierAuthority.cleanHostDigestVariable);
  assert.ok(apple.externalGates.length > 0);
});

test("rejects invented Node target applicability and preserves all 180 accounted coordinates", () => {
  const omitted = structuredClone(inputs);
  omitted.policy.evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedTargets = [];
  omitted.policy.evidenceControl.coordinateRules.nodeMainExecutable.expectedUnsupportedTargetCount = 0;
  omitted.policy.evidenceControl.coordinateRules.nodeMainExecutable.expectedUnsupportedCoordinateCount = 0;
  omitted.policy.evidenceControl.coordinateRules.nodeMainExecutable.expectedCoordinateCount = 180;
  assert.throws(
    () => validateContract(buildContract(omitted), omitted),
    /Node executable evidence applicability accounting changed/u,
  );

  const invented = structuredClone(inputs);
  invented.policy.evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedTargets[0].target =
    "macos-aarch64";
  assert.throws(
    () => validateContract(buildContract(invented), invented),
    /Node executable evidence applicability accounting changed/u,
  );
});

test("binds the macOS x64 rejection to the current assembler cell and forces re-adjudication on change", () => {
  const contract = buildContract(inputs);
  const rule = contract.evidenceControl.coordinateRules.nodeMainExecutable;
  assert.deepEqual(
    rule.explicitUnsupportedTargets.map(({ assemblerCell, mechanism, classification, revisitTrigger }) => ({
      assemblerCell,
      mechanism,
      classification,
      revisitTrigger,
    })),
    [{
      assemblerCell: contract.evidenceControl.nodeMainExecutable.assemblerCell,
      mechanism: "direct-node-build-sea",
      classification: "upstream-blocked",
      revisitTrigger: "assembler-cell-change",
    }],
  );

  const stale = structuredClone(contract);
  stale.evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedTargets[0].assemblerCell = "node@26.6.0";
  assert.throws(() => validateContract(stale, inputs), /re-adjudicate it on the current assembler/u);
});

test("separates observed macOS x64 crashes from inferred rejections and refuses inference-only rejection", () => {
  const contract = buildContract(inputs);
  const rule = contract.evidenceControl.coordinateRules.nodeMainExecutable;
  const observed = rule.explicitUnsupportedCoordinates.filter(({ observation }) =>
    observation === "observed-sigsegv-on-exact-target-runner"
  );
  const inferred = rule.explicitUnsupportedCoordinates.filter(({ observation }) =>
    observation === "inferred-from-upstream-evidence-not-executed"
  );
  assert.equal(observed.length, 2);
  assert.equal(inferred.length, 28);
  assert.equal(observed.length, rule.explicitUnsupportedTargets[0].observation.observedCoordinateCount);
  assert.equal(inferred.length, rule.explicitUnsupportedTargets[0].observation.inferredCoordinateCount);
  assert.deepEqual(
    observed.map(({ producerGroup, mainFormat, constructionHost }) => ({ producerGroup, mainFormat, constructionHost })),
    [
      { producerGroup: "bun-cli", mainFormat: "commonjs", constructionHost: "linux-x64" },
      { producerGroup: "bun-cli", mainFormat: "commonjs", constructionHost: "linux-arm64" },
    ],
  );
  assert.ok(inferred.some(({ constructionHost }) => constructionHost === "macos-x64"));

  const relabelled = structuredClone(contract);
  relabelled.evidenceControl.coordinateRules.nodeMainExecutable.explicitUnsupportedCoordinates
    .find(({ observation }) => observation === "observed-sigsegv-on-exact-target-runner")
    .observation = "inferred-from-upstream-evidence-not-executed";
  assert.throws(() => validateContract(relabelled, inputs), /observation accounting changed/u);

  const inferenceOnly = structuredClone(contract);
  const inferenceOnlyRule = inferenceOnly.evidenceControl.coordinateRules.nodeMainExecutable;
  for (const coordinate of inferenceOnlyRule.explicitUnsupportedCoordinates) {
    coordinate.observation = "inferred-from-upstream-evidence-not-executed";
  }
  inferenceOnlyRule.explicitUnsupportedTargets[0].observation.observedCoordinates = [];
  inferenceOnlyRule.explicitUnsupportedTargets[0].observation.observedCoordinateCount = 0;
  inferenceOnlyRule.explicitUnsupportedTargets[0].observation.inferredCoordinateCount = 30;
  assert.throws(() => validateContract(inferenceOnly, inputs), /no first-hand observed failure/u);
});

test("rejects weakened current directory-generation authority", () => {
  const changedActivation = structuredClone(inputs);
  changedActivation.policy.evidenceControl.directoryGeneration.activation = "replace-output-directory";
  assert.throws(
    () => validateContract(buildContract(changedActivation), changedActivation),
    /directory-generation authority changed/u,
  );

  const changedPathLaw = structuredClone(inputs);
  changedPathLaw.policy.evidenceControl.directoryGeneration.path.unicodePolicy = "normalize-unicode";
  assert.throws(
    () => validateContract(buildContract(changedPathLaw), changedPathLaw),
    /directory-generation authority changed/u,
  );
});

test("rejects an invented or omitted compiler-target coordinate", () => {
  const invented = structuredClone(inputs);
  invented.policy.evidenceControl.coordinateRules.compilerTargets.coordinates.push({
    compiler: "bun",
    target: "windows-aarch64",
  });
  invented.policy.evidenceControl.coordinateRules.compilerTargets.expectedCoordinateCount += 1;
  assert.throws(() => validateContract(buildContract(invented), invented), /compiler target evidence coordinates changed/u);

  const omitted = structuredClone(inputs);
  omitted.policy.evidenceControl.coordinateRules.compilerTargets.coordinates.pop();
  omitted.policy.evidenceControl.coordinateRules.compilerTargets.expectedCoordinateCount -= 1;
  assert.throws(() => validateContract(buildContract(omitted), omitted), /compiler target evidence coordinates changed/u);
});

test("rejects provider-native receipts that infer evidence without test observations", () => {
  const weakened = structuredClone(inputs);
  weakened.policy.evidenceControl.coordinateRules.providerNativeLanes.observationRule =
    "derive every identifier from the contract after any test passes";
  assert.throws(
    () => validateContract(buildContract(weakened), weakened),
    /provider-native evidence applicability accounting changed/u,
  );
});

test("rejects weakened Apple certifier and category-evidence authority", () => {
  const legacyProtocol = structuredClone(inputs);
  legacyProtocol.policy.evidenceControl.appleCertification.protocols.receipt = "effect-build/apple-certification-receipt@1";
  assert.throws(
    () => validateContract(buildContract(legacyProtocol), legacyProtocol),
    /Apple certification authority digest changed/u,
  );

  const incompleteCleanHostSchema = structuredClone(inputs);
  delete incompleteCleanHostSchema.policy.evidenceControl.appleCertification.evidenceSchema.cleanHost.requiredOperations["G-PKG"];
  assert.throws(
    () => validateContract(buildContract(incompleteCleanHostSchema), incompleteCleanHostSchema),
    /Apple certification authority digest changed/u,
  );

  const sharedDigestVariable = structuredClone(inputs);
  sharedDigestVariable.policy.evidenceControl.appleCertification.certifierAuthority.cleanHostDigestVariable =
    "EFFECT_BUILD_APPLE_CERTIFIER_SHA256";
  assert.throws(
    () => validateContract(buildContract(sharedDigestVariable), sharedDigestVariable),
    /Apple certification authority digest changed/u,
  );

  const noopInstaller = structuredClone(inputs);
  noopInstaller.policy.evidenceControl.appleCertification.evidenceSchema.distribution.requiredOperations[
    "notarized-stapled-installer-package"
  ] = ["noop"];
  assert.throws(
    () => validateContract(buildContract(noopInstaller), noopInstaller),
    /Apple certification authority digest changed/u,
  );

  const verdictOnlyA7 = structuredClone(inputs);
  verdictOnlyA7.policy.evidenceControl.appleCertification.evidenceSchema.cell.requiredClaims.A7 = "verdict-only";
  assert.throws(
    () => validateContract(buildContract(verdictOnlyA7), verdictOnlyA7),
    /Apple certification authority digest changed/u,
  );

  const untrustedRoles = structuredClone(inputs);
  untrustedRoles.policy.evidenceControl.appleCertification.evidenceSchema.cleanHost.requiredArtifactRoles = ["anything"];
  assert.throws(
    () => validateContract(buildContract(untrustedRoles), untrustedRoles),
    /Apple certification authority digest changed/u,
  );
});

test("rejects empty or conditional lanes entering the public surface", () => {
  const syntheticDenoApi = structuredClone(inputs);
  syntheticDenoApi.publicApi.packages["effect-build-deno"].namespaces.push("Api");
  syntheticDenoApi.publicApi.packages["effect-build-deno"].subpaths["./Api"] = { runtime: [], declarations: [] };
  syntheticDenoApi.policy.publicSurfaceOwners["effect-build-deno"].rootNamespaces.Api = "synthetic";
  syntheticDenoApi.policy.publicSurfaceOwners["effect-build-deno"].subpaths["./Api"] = "synthetic";
  assert.throws(
    () => validateContract(buildContract(syntheticDenoApi), syntheticDenoApi),
    /all-conditional but entered the public surface/u,
  );

  const promotedRolldown = structuredClone(inputs);
  promotedRolldown.publicApi.packages["effect-build-rolldown"] = { namespaces: [], subpaths: {} };
  promotedRolldown.policy.publicSurfaceOwners["effect-build-rolldown"] = { rootNamespaces: {}, subpaths: {} };
  assert.throws(
    () => validateContract(buildContract(promotedRolldown), promotedRolldown),
    /all-conditional package candidate/u,
  );
});

test("owns the hard-cut provider exports without inheriting old subpaths", () => {
  const contract = buildContract(inputs);
  assert.doesNotThrow(() => validateContract(contract, inputs));
  assert.ok(contract.currentPublicSurfaceOwnership.exports.every((entry) => entry.semanticOwner !== null));
  assert.ok(contract.currentPublicSurfaceOwnership.exports.every((entry) =>
    !["./Build", "./Watch", "./Profile"].includes(entry.subpath)
  ));
  assert.equal(inputs.publicApi.packages["effect-build-deno"].subpaths["./Api"], undefined);
  assert.equal(inputs.publicApi.packages["effect-build-rolldown"], undefined);
  assert.equal(inputs.publicApi.packages["effect-build"].subpaths["./Author/NodeMain"], undefined);
  assert.equal(inputs.publicApi.packages["effect-build"].subpaths["./Profile/BrowserModulePayload"], undefined);
});
