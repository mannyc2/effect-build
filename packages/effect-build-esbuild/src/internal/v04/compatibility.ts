import type * as esbuild from "esbuild";

export type OperationName = "build-memory" | "context-memory";

export interface OperationCoordinate {
  readonly providerPackage: "effect-build-esbuild";
  readonly lane: "installed-library-api";
  readonly operation: OperationName;
}

export type ParticipantRole =
  | "javascript-package"
  | "declarations"
  | "platform-package"
  | "native-binary"
  | "host-runtime";

export interface ParticipantContent {
  readonly algorithm: "sha256";
  readonly value: string;
  readonly bytes: string;
}

export interface Participant {
  readonly role: ParticipantRole;
  readonly kind: string;
  readonly name: string;
  readonly version: string;
  readonly revision: string;
  readonly channel: string;
  readonly content: ParticipantContent;
}

export interface ProviderIdentity {
  readonly providerPackage: "effect-build-esbuild";
  readonly lane: "installed-library-api";
  readonly participants: readonly Participant[];
}

export interface HostCoordinate {
  readonly os: string;
  readonly architecture: string;
  readonly runtime: string;
  readonly runtimeVersion: string;
}

export type CapabilityObservation =
  | { readonly _tag: "Present"; readonly id: string; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly id: string; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly id: string; readonly reason: string };

export interface RelationObservation {
  readonly id: string;
  readonly inputsKey: string;
  readonly state: "Satisfied" | "Unsatisfied" | "Indeterminate";
  readonly reason: string;
}

export interface ContractObservation {
  readonly id: string;
  readonly kind: "provider-core-peer";
  readonly inputsKey: string;
  readonly state: "Compatible" | "Incompatible" | "Indeterminate";
  readonly reason: string;
}

export interface InstalledEvidence {
  readonly identity: ProviderIdentity;
  readonly host: HostCoordinate;
  readonly capabilities: readonly CapabilityObservation[];
  readonly relations: readonly RelationObservation[];
  readonly contracts: readonly ContractObservation[];
}

export type EvaluationPhase = "layer-acquisition" | "operation-preflight";

interface CompatibilityFields {
  readonly operation: OperationCoordinate;
  readonly owner: "effect-build-esbuild";
  readonly phase: EvaluationPhase;
  readonly reason: string;
}

export interface ToolProbeFailed extends CompatibilityFields {
  readonly _tag: "ToolProbeFailed";
  readonly tool: "esbuild";
}

export interface IdentityIncomplete extends CompatibilityFields {
  readonly _tag: "IdentityIncomplete";
}

export interface KnownDenyHole extends CompatibilityFields {
  readonly _tag: "KnownDenyHole";
  readonly holeId: string;
}

export interface CapabilityMissing extends CompatibilityFields {
  readonly _tag: "CapabilityMissing";
  readonly capability: string;
}

export interface CapabilityIndeterminate extends CompatibilityFields {
  readonly _tag: "CapabilityIndeterminate";
  readonly capability: string;
}

export interface RelationUnsatisfied extends CompatibilityFields {
  readonly _tag: "RelationUnsatisfied";
  readonly relation: string;
}

export interface RelationIndeterminate extends CompatibilityFields {
  readonly _tag: "RelationIndeterminate";
  readonly relation: string;
}

export interface ContractIncompatible extends CompatibilityFields {
  readonly _tag: "ContractIncompatible";
  readonly contract: string;
  readonly kind: "provider-core-peer";
}

export interface ContractIndeterminate extends CompatibilityFields {
  readonly _tag: "ContractIndeterminate";
  readonly contract: string;
  readonly kind: "provider-core-peer";
}

export interface SupportUnknown extends CompatibilityFields {
  readonly _tag: "SupportUnknown";
  readonly overrideAvailable: true;
  readonly admissionKey: string;
}

export type LayerRefusal = ToolProbeFailed | IdentityIncomplete;

export type PreflightRefusal =
  | KnownDenyHole
  | CapabilityMissing
  | CapabilityIndeterminate
  | RelationUnsatisfied
  | RelationIndeterminate
  | ContractIncompatible
  | ContractIndeterminate
  | SupportUnknown;

export interface InvalidOptions<Operation extends string> {
  readonly _tag: "InvalidOptions";
  readonly operation: Operation;
  readonly reason: "write-must-be-explicitly-false";
}

export interface ProviderBuildFailure<Operation extends string> {
  readonly _tag: "ProviderBuildFailure";
  readonly operation: Operation;
  readonly providerError: unknown;
  readonly errors: readonly esbuild.Message[];
  readonly warnings: readonly esbuild.Message[];
}

export interface ProviderContextFailure<Operation extends string> {
  readonly _tag: "ProviderContextFailure";
  readonly operation: Operation;
  readonly providerError: unknown;
}

export type Admission =
  | { readonly _tag: "ReviewedAdmission"; readonly admissionKey: string }
  | {
    readonly _tag: "UntestedOverride";
    readonly admissionKey: string;
    readonly warningCode: "EFFECT_BUILD_UNTESTED_VERSION";
  };

export const untestedVersionWarningCode = "EFFECT_BUILD_UNTESTED_VERSION";

export const operationCoordinate = (operation: OperationName): OperationCoordinate => ({
  providerPackage: "effect-build-esbuild",
  lane: "installed-library-api",
  operation,
});

const compatibilityFields = (
  operation: OperationCoordinate,
  phase: EvaluationPhase,
  reason: string,
): CompatibilityFields => ({ operation, owner: "effect-build-esbuild", phase, reason });

export const toolProbeFailed = (operation: OperationCoordinate, reason: string): ToolProbeFailed => ({
  _tag: "ToolProbeFailed",
  tool: "esbuild",
  ...compatibilityFields(operation, "layer-acquisition", reason),
});

export const identityIncomplete = (operation: OperationCoordinate, reason: string): IdentityIncomplete => ({
  _tag: "IdentityIncomplete",
  ...compatibilityFields(operation, "layer-acquisition", reason),
});

export const invalidOptions = <Operation extends string>(operation: Operation): InvalidOptions<Operation> => ({
  _tag: "InvalidOptions",
  operation,
  reason: "write-must-be-explicitly-false",
});

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const messageArray = (value: unknown, key: "errors" | "warnings"): readonly esbuild.Message[] => {
  if (!isRecord(value)) return [];
  const messages = value[key];
  return Array.isArray(messages) ? messages as readonly esbuild.Message[] : [];
};

export const hasProviderMessageArrays = (value: unknown): boolean =>
  isRecord(value) && (Array.isArray(value.errors) || Array.isArray(value.warnings));

export const providerBuildFailure = <Operation extends string>(
  operation: Operation,
  providerError: unknown,
): ProviderBuildFailure<Operation> => ({
  _tag: "ProviderBuildFailure",
  operation,
  providerError,
  errors: messageArray(providerError, "errors"),
  warnings: messageArray(providerError, "warnings"),
});

export const providerContextFailure = <Operation extends string>(
  operation: Operation,
  providerError: unknown,
): ProviderContextFailure<Operation> => ({
  _tag: "ProviderContextFailure",
  operation,
  providerError,
});

interface OperationPolicy {
  readonly requiredCapabilities: readonly string[];
}

const policyRevision = "policy-r3-v1";
const capabilitySchemaRevision = "capabilities-r3-v1";
const requiredParticipantRoles: readonly ParticipantRole[] = [
  "javascript-package",
  "declarations",
  "platform-package",
  "native-binary",
  "host-runtime",
];
const requiredRelations = ["esbuild-package-api-native"] as const;
const requiredContracts = [{ id: "effect-build-core", kind: "provider-core-peer" }] as const;
/** Frozen empty until exact executable receipts contribute authenticated keys; observed coordinates never self-admit. */
const reviewedAdmissionKeys: readonly string[] = [];

const operationPolicies: Readonly<Record<OperationName, OperationPolicy>> = {
  "build-memory": { requiredCapabilities: ["build"] },
  "context-memory": { requiredCapabilities: ["context", "cancel", "dispose"] },
};

const sha256Pattern = /^sha256:[0-9a-f]{64}$/;
const decimalPattern = /^(0|[1-9][0-9]*)$/;

const nonEmpty = (value: string): boolean => typeof value === "string" && value.length > 0;

export const identityFailureReason = (identity: ProviderIdentity): string | undefined => {
  if (identity.providerPackage !== "effect-build-esbuild") return "provider-package-mismatch";
  if (identity.lane !== "installed-library-api") return "lane-mismatch";
  const roles = identity.participants.map((participant) => participant.role);
  if (new Set(roles).size !== roles.length) return "duplicate-participant-role";
  for (const role of requiredParticipantRoles) {
    if (!roles.includes(role)) return `missing-participant:${role}`;
  }
  for (const participant of identity.participants) {
    if (
      !nonEmpty(participant.role)
      || !nonEmpty(participant.kind)
      || !nonEmpty(participant.name)
      || !nonEmpty(participant.version)
      || !nonEmpty(participant.revision)
      || !nonEmpty(participant.channel)
    ) return `incomplete-participant:${participant.role}`;
    if (participant.content.algorithm !== "sha256") return `invalid-content-algorithm:${participant.role}`;
    if (!sha256Pattern.test(participant.content.value)) return `invalid-content-digest:${participant.role}`;
    if (!decimalPattern.test(participant.content.bytes)) return `invalid-content-bytes:${participant.role}`;
  }
  return undefined;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right, "en"));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const byLocale = (left: string, right: string): number => left.localeCompare(right, "en");

export const admissionKeyFor = (operation: OperationCoordinate, evidence: InstalledEvidence): string => {
  const material = {
    schema: "effect-build/r3-probe-cache@1",
    contentIdentity: {
      providerPackage: evidence.identity.providerPackage,
      lane: evidence.identity.lane,
      participants: [...evidence.identity.participants].sort((left, right) => byLocale(left.role, right.role)),
    },
    provider: operation.providerPackage,
    operation: operation.operation,
    lane: operation.lane,
    requestedOperation: operation.operation,
    requestedLane: operation.lane,
    host: evidence.host,
    target: "in-memory",
    capabilitySchemaRevision,
    policyRevision,
    capabilities: [...evidence.capabilities].sort((left, right) => byLocale(left.id, right.id)),
    relationInputs: [...evidence.relations]
      .sort((left, right) => byLocale(left.id, right.id))
      .map((relation) => ({ id: relation.id, inputsKey: relation.inputsKey, state: relation.state })),
    profileAndPeerInputs: [...evidence.contracts]
      .sort((left, right) => byLocale(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`))
      .map((contract) => ({
        id: contract.id,
        kind: contract.kind,
        inputsKey: contract.inputsKey,
        state: contract.state,
      })),
  };
  return `admission:${canonicalJson(material)}`;
};

export const evaluateAdmission = (input: {
  readonly operation: OperationCoordinate;
  readonly evidence: InstalledEvidence;
  readonly allowUntestedVersion: boolean;
}): { readonly _tag: "Refused"; readonly refusal: PreflightRefusal } | {
  readonly _tag: "Admitted";
  readonly admission: Admission;
} => {
  const { allowUntestedVersion, evidence, operation } = input;
  const fields = (reason: string) => compatibilityFields(operation, "operation-preflight", reason);
  const policy = operationPolicies[operation.operation];
  const capabilities = new Map(evidence.capabilities.map((capability) => [capability.id, capability]));
  for (const id of policy.requiredCapabilities) {
    const observation = capabilities.get(id);
    if (observation === undefined || observation._tag === "Missing") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "CapabilityMissing",
          capability: id,
          ...fields(observation === undefined ? "capability-not-observed" : observation.reason),
        },
      };
    }
    if (observation._tag === "Indeterminate") {
      return {
        _tag: "Refused",
        refusal: { _tag: "CapabilityIndeterminate", capability: id, ...fields(observation.reason) },
      };
    }
  }
  const relations = new Map(evidence.relations.map((relation) => [relation.id, relation]));
  for (const id of requiredRelations) {
    const observation = relations.get(id);
    if (observation === undefined || observation.state === "Indeterminate") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "RelationIndeterminate",
          relation: id,
          ...fields(observation === undefined ? "relation-not-observed" : observation.reason),
        },
      };
    }
    if (observation.state === "Unsatisfied") {
      return { _tag: "Refused", refusal: { _tag: "RelationUnsatisfied", relation: id, ...fields(observation.reason) } };
    }
  }
  const contracts = new Map(evidence.contracts.map((contract) => [`${contract.kind}:${contract.id}`, contract]));
  for (const required of requiredContracts) {
    const observation = contracts.get(`${required.kind}:${required.id}`);
    if (observation === undefined || observation.state === "Indeterminate") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "ContractIndeterminate",
          contract: required.id,
          kind: required.kind,
          ...fields(observation === undefined ? "contract-not-observed" : observation.reason),
        },
      };
    }
    if (observation.state === "Incompatible") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "ContractIncompatible",
          contract: required.id,
          kind: required.kind,
          ...fields(observation.reason),
        },
      };
    }
  }
  const admissionKey = admissionKeyFor(operation, evidence);
  if (reviewedAdmissionKeys.includes(admissionKey)) {
    return { _tag: "Admitted", admission: { _tag: "ReviewedAdmission", admissionKey } };
  }
  if (allowUntestedVersion) {
    return {
      _tag: "Admitted",
      admission: { _tag: "UntestedOverride", admissionKey, warningCode: untestedVersionWarningCode },
    };
  }
  return {
    _tag: "Refused",
    refusal: {
      _tag: "SupportUnknown",
      overrideAvailable: true,
      admissionKey,
      ...fields("no-authenticated-reviewed-admission-key-for-observed-coordinates"),
    },
  };
};
