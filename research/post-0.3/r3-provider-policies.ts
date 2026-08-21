import {
  type CompatibilityInput,
  type CompatibilityLane,
  type ContractObservation,
  type ImplementationParticipant,
  type ImplementationParticipantKind,
  makeAdmissionKey,
  type OperationCompatibilityPolicy,
  type ProviderImplementationIdentity,
  type RelationObservation,
} from "./r3-compatibility.js";

const digest = (hex: string): `sha256:${string}` => `sha256:${hex.repeat(64)}`;

export const participant = (
  role: string,
  kind: ImplementationParticipantKind,
  name: string,
  version: string,
  hex: string,
  overrides: Partial<ImplementationParticipant> = {},
): ImplementationParticipant => ({
  role,
  kind,
  name,
  version,
  revision: `${name}-${version}-revision`,
  channel: "stable",
  content: { algorithm: "sha256", value: digest(hex), bytes: "4096" },
  ...overrides,
});

const identity = (
  providerPackage: string,
  lane: CompatibilityLane,
  participants: readonly [ImplementationParticipant, ...ImplementationParticipant[]],
): ProviderImplementationIdentity => ({ providerPackage, lane, participants });

const peer = (id = "effect-build-core"): ContractObservation => ({
  id,
  kind: "provider-core-peer",
  inputsKey: "effect-build@0.4.0|adapter-peer:>=0.4.0 <1.0.0",
  state: { _tag: "Compatible", evidence: "packed strict-peer install" },
});

const profile = (id: string): ContractObservation => ({
  id,
  kind: "portable-profile",
  inputsKey: `${id}@1|provider-offer@1`,
  state: { _tag: "Compatible", evidence: "exact profile handshake" },
});

const relation = (id: string, inputsKey: string): RelationObservation => ({
  id,
  inputsKey,
  state: { _tag: "Satisfied", evidence: `${id} exact participants agree` },
});

const coordinateHoles = (
  operation: string,
  lane: CompatibilityLane,
): OperationCompatibilityPolicy["denyHoles"] => [{
  id: "operation-hole",
  reason: `the ${operation} policy cannot admit a different operation`,
  matches: (input) => input.request.operation !== operation,
}, {
  id: "lane-hole",
  reason: `the ${operation} policy does not exist on a different lane`,
  matches: (input) => input.request.lane !== lane,
}, {
  id: "host-hole",
  reason: "Windows arm64 is not an admitted build host",
  matches: (input) => input.request.host.os === "windows" && input.request.host.architecture === "arm64",
}, {
  id: "target-hole",
  reason: "the exact target/mode coordinate is denied",
  matches: (input) => input.request.target === "known-denied-target",
}];

const basePolicy = (
  operation: OperationCompatibilityPolicy["operation"],
  requiredParticipantRoles: OperationCompatibilityPolicy["requiredParticipantRoles"],
  overrides: Partial<OperationCompatibilityPolicy>,
): OperationCompatibilityPolicy => ({
  operation,
  policyRevision: "policy-r3-v1",
  capabilitySchemaRevision: "capabilities-r3-v1",
  requiredParticipantRoles,
  requiredCapabilities: [],
  requiredRelations: [],
  requiredContracts: [{ id: "effect-build-core", kind: "provider-core-peer" }],
  denyHoles: coordinateHoles(operation.operation, operation.lane),
  reviewedAdmissions: [],
  observedEvidenceCoordinates: [],
  ...overrides,
});

const host = {
  os: "linux",
  architecture: "x64",
  runtime: "node",
  runtimeVersion: "24.14.1",
} as const;

export const nodeSeaPolicy = basePolicy(
  { providerPackage: "effect-build-node-sea", lane: "selected-command", operation: "assemble-direct" },
  ["builder", "base"],
  {
    requiredCapabilities: ["build-sea", "lief"],
    requiredRelations: ["node-builder-base"],
    requiredContracts: [
      { id: "effect-build-core", kind: "provider-core-peer" },
      { id: "node-main-executable", kind: "portable-profile" },
    ],
    selectedCommandRole: "builder",
    observedEvidenceCoordinates: ["node-26.7.0-linux-x64-direct-observed"],
  },
);

export const nodeSeaInput: CompatibilityInput = {
  request: { operation: "assemble-direct", lane: "selected-command", host, target: "linux-x64" },
  selected: identity("effect-build-node-sea", "selected-command", [
    participant("builder", "selected-executable", "node", "26.7.0", "1"),
    participant("base", "target-runtime", "node", "26.7.0", "2"),
  ]),
  capabilities: [
    { id: "build-sea", state: { _tag: "Present", evidence: "node --build-sea probe" } },
    { id: "lief", state: { _tag: "Present", evidence: "direct build completed without --without-lief" } },
  ],
  relations: [relation("node-builder-base", "builder:node@26.7.0|base:node@26.7.0")],
  contracts: [peer(), profile("node-main-executable")],
  selectedAtLaunch: identity("effect-build-node-sea", "selected-command", [
    participant("builder", "selected-executable", "node", "26.7.0", "1"),
    participant("base", "target-runtime", "node", "26.7.0", "2"),
  ]),
  allowUntestedVersion: false,
};

export const denoPolicy = basePolicy(
  { providerPackage: "effect-build-deno", lane: "selected-command", operation: "compile-executable" },
  ["deno", "denort"],
  {
    requiredCapabilities: ["compile"],
    requiredRelations: ["deno-denort"],
    selectedCommandRole: "deno",
    observedEvidenceCoordinates: [
      "v0.3-deno-2.9.3-selected-compile-run-31877736423",
      "deno-2.9.5-selected-compile-observed-unadmitted",
    ],
  },
);

export const denoInput: CompatibilityInput = {
  request: { operation: "compile-executable", lane: "selected-command", host, target: "linux-x64" },
  selected: identity("effect-build-deno", "selected-command", [
    participant("deno", "selected-executable", "deno", "2.9.5", "4"),
    participant("denort", "target-runtime", "denort", "2.9.5", "5"),
  ]),
  capabilities: [{ id: "compile", state: { _tag: "Present", evidence: "compile help/probe" } }],
  relations: [relation("deno-denort", "deno:2.9.5|denort:2.9.5|target:linux-x64")],
  contracts: [peer()],
  selectedAtLaunch: identity("effect-build-deno", "selected-command", [
    participant("deno", "selected-executable", "deno", "2.9.5", "4"),
    participant("denort", "target-runtime", "denort", "2.9.5", "5"),
  ]),
  allowUntestedVersion: false,
};

export const esbuildPolicy = basePolicy(
  { providerPackage: "effect-build-esbuild", lane: "installed-library-api", operation: "context-memory" },
  ["javascript-package", "declarations", "platform-package", "native-binary", "host-runtime"],
  {
    requiredCapabilities: ["context", "cancel", "dispose"],
    requiredRelations: ["esbuild-package-api-native"],
    observedEvidenceCoordinates: ["esbuild-0.28.2-linux-x64-observed"],
  },
);

export const esbuildInput: CompatibilityInput = {
  request: { operation: "context-memory", lane: "installed-library-api", host, target: "node-main" },
  selected: identity("effect-build-esbuild", "installed-library-api", [
    participant("javascript-package", "javascript-package", "esbuild", "0.28.2", "6"),
    participant("declarations", "declarations", "esbuild/index.d.ts", "0.28.2", "7"),
    participant("platform-package", "javascript-package", "@esbuild/linux-x64", "0.28.2", "8"),
    participant("native-binary", "native-binary", "esbuild", "0.28.2", "9"),
    participant("host-runtime", "host-runtime", "node", "24.14.1", "a"),
  ]),
  capabilities: ["context", "cancel", "dispose"].map((id) => ({
    id,
    state: { _tag: "Present" as const, evidence: `${id} runtime probe` },
  })),
  relations: [relation(
    "esbuild-package-api-native",
    "package:0.28.2|declarations:sha256:7|platform:@esbuild/linux-x64@0.28.2|binary:sha256:9",
  )],
  contracts: [peer()],
  allowUntestedVersion: false,
};

export const esbuildBuildPolicy = basePolicy(
  { providerPackage: "effect-build-esbuild", lane: "installed-library-api", operation: "build-memory" },
  ["javascript-package", "declarations", "platform-package", "native-binary", "host-runtime"],
  {
    requiredCapabilities: ["build"],
    requiredRelations: ["esbuild-package-api-native"],
    observedEvidenceCoordinates: ["esbuild-0.28.2-linux-x64-build-memory-observed"],
  },
);

export const esbuildBuildInput: CompatibilityInput = {
  ...esbuildInput,
  request: { ...esbuildInput.request, operation: "build-memory" },
  capabilities: [{ id: "build", state: { _tag: "Present", evidence: "build runtime probe" } }],
};

export const bunPolicy = basePolicy(
  { providerPackage: "effect-build-bun", lane: "selected-command", operation: "compile-executable" },
  ["builder", "target-runtime"],
  {
    requiredCapabilities: ["compile"],
    requiredRelations: ["bun-builder-target"],
    selectedCommandRole: "builder",
    observedEvidenceCoordinates: [
      "v0.3-bun-1.3.9-selected-compile-run-31877736423",
      "bun-1.3.14-linux-x64-compile-observed-unadmitted",
    ],
  },
);

export const bunInput: CompatibilityInput = {
  request: {
    operation: "compile-executable",
    lane: "selected-command",
    host,
    target: "bun-linux-x64",
  },
  selected: identity("effect-build-bun", "selected-command", [
    participant("builder", "selected-executable", "bun", "1.3.14", "b"),
    participant("target-runtime", "target-runtime", "bun-runtime", "1.3.14", "c"),
  ]),
  capabilities: [{ id: "compile", state: { _tag: "Present", evidence: "bun build --compile probe" } }],
  relations: [relation("bun-builder-target", "builder:bun@1.3.14|target:bun-linux-x64@1.3.14")],
  contracts: [peer()],
  selectedAtLaunch: identity("effect-build-bun", "selected-command", [
    participant("builder", "selected-executable", "bun", "1.3.14", "b"),
    participant("target-runtime", "target-runtime", "bun-runtime", "1.3.14", "c"),
  ]),
  allowUntestedVersion: false,
};

export const withReviewedAdmission = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): OperationCompatibilityPolicy => ({
  ...policy,
  reviewedAdmissions: [makeAdmissionKey(policy, input)],
});

export const providerDecisionTables = Object.freeze({
  bunCompileExecutable: { policy: bunPolicy, input: bunInput },
  denoCompileExecutable: { policy: denoPolicy, input: denoInput },
  esbuildBuildMemory: { policy: esbuildBuildPolicy, input: esbuildBuildInput },
  esbuildContextMemory: { policy: esbuildPolicy, input: esbuildInput },
  nodeSeaAssembleDirect: { policy: nodeSeaPolicy, input: nodeSeaInput },
});
