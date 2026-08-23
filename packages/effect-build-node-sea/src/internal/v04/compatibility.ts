import type { AbsolutePath } from "effect-build/Artifact";
import type { ContentIdentity } from "effect-build/Author/Tool";

export const nodeSeaVersion = "26.7.0" as const;
export const nodeSeaTarget = "linux-x64-gnu" as const;

export interface OperationCoordinate {
  readonly providerPackage: "effect-build-node-sea";
  readonly lane: "selected-command";
  readonly operation: "assemble-direct";
}

export interface HostCoordinate {
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly distribution: "ubuntu-24.04" | "not-applicable" | "unknown";
}

export type CapabilityId = "build-sea" | "lief";

export type CapabilityObservation =
  | { readonly _tag: "Present"; readonly id: CapabilityId; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly id: CapabilityId; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly id: CapabilityId; readonly reason: string };

export interface ParticipantEvidence {
  readonly role: "builder" | "base";
  readonly path: AbsolutePath;
  readonly version: string;
  readonly revision: string;
  readonly host: HostCoordinate;
  readonly content: ContentIdentity;
}

export interface ContractObservation {
  readonly id: "effect-build-core";
  readonly kind: "provider-core-peer";
  readonly inputsKey: string;
  readonly state: "Compatible" | "Incompatible" | "Indeterminate";
  readonly reason: string;
}

export interface SelectedEvidence {
  readonly builder: ParticipantEvidence;
  readonly base: ParticipantEvidence;
  readonly capabilities: readonly [CapabilityObservation, CapabilityObservation];
  readonly coreContract: ContractObservation;
}

export type EvaluationPhase = "layer-acquisition" | "operation-preflight" | "launch-reauthentication";

interface CompatibilityFields {
  readonly operation: OperationCoordinate;
  readonly owner: "effect-build-node-sea";
  readonly phase: EvaluationPhase;
  readonly reason: string;
}

export interface NodeSeaToolNotFound extends CompatibilityFields {
  readonly _tag: "NodeSeaToolNotFound";
  readonly command: string;
}

export interface NodeSeaProbeFailed extends CompatibilityFields {
  readonly _tag: "NodeSeaProbeFailed";
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
  readonly capability: CapabilityId;
}

export interface CapabilityIndeterminate extends CompatibilityFields {
  readonly _tag: "CapabilityIndeterminate";
  readonly capability: CapabilityId;
}

export interface RelationUnsatisfied extends CompatibilityFields {
  readonly _tag: "RelationUnsatisfied";
  readonly relation: "node-builder-base";
}

export interface RelationIndeterminate extends CompatibilityFields {
  readonly _tag: "RelationIndeterminate";
  readonly relation: "node-builder-base";
}

export interface ContractIncompatible extends CompatibilityFields {
  readonly _tag: "ContractIncompatible";
  readonly contract: "effect-build-core";
  readonly kind: "provider-core-peer";
}

export interface ContractIndeterminate extends CompatibilityFields {
  readonly _tag: "ContractIndeterminate";
  readonly contract: "effect-build-core";
  readonly kind: "provider-core-peer";
}

export interface SupportUnknown extends CompatibilityFields {
  readonly _tag: "SupportUnknown";
  readonly overrideAvailable: true;
  readonly admissionKey: string;
}

export interface SelectedCommandChanged extends CompatibilityFields {
  readonly _tag: "SelectedCommandChanged";
  readonly selectedRole: "builder" | "base";
  readonly acquired: ContentIdentity;
  readonly launch: ContentIdentity;
}

export interface SelectedCommandIndeterminate extends CompatibilityFields {
  readonly _tag: "SelectedCommandIndeterminate";
  readonly selectedRole: "builder" | "base";
}

export type LayerRefusal = NodeSeaToolNotFound | NodeSeaProbeFailed | IdentityIncomplete;

export type PreflightRefusal =
  | KnownDenyHole
  | CapabilityMissing
  | CapabilityIndeterminate
  | RelationUnsatisfied
  | RelationIndeterminate
  | ContractIncompatible
  | ContractIndeterminate
  | SupportUnknown;

export type LaunchRefusal = SelectedCommandChanged | SelectedCommandIndeterminate;

export type Admission =
  | { readonly _tag: "ReviewedAdmission"; readonly admissionKey: string }
  | {
    readonly _tag: "UntestedOverride";
    readonly admissionKey: string;
    readonly warningCode: "EFFECT_BUILD_UNTESTED_VERSION";
  };

export const operation: OperationCoordinate = Object.freeze({
  providerPackage: "effect-build-node-sea",
  lane: "selected-command",
  operation: "assemble-direct",
});

const fields = (phase: EvaluationPhase, reason: string): CompatibilityFields => ({
  operation,
  owner: "effect-build-node-sea",
  phase,
  reason,
});

export const nodeSeaToolNotFound = (command: string): NodeSeaToolNotFound => ({
  _tag: "NodeSeaToolNotFound",
  command,
  ...fields("layer-acquisition", "selected-command-not-found"),
});

export const nodeSeaProbeFailed = (reason: string): NodeSeaProbeFailed => ({
  _tag: "NodeSeaProbeFailed",
  ...fields("layer-acquisition", reason),
});

export const identityIncomplete = (reason: string): IdentityIncomplete => ({
  _tag: "IdentityIncomplete",
  ...fields("layer-acquisition", reason),
});

export const selectedCommandIndeterminate = (
  selectedRole: "builder" | "base",
  reason: string,
): SelectedCommandIndeterminate => ({
  _tag: "SelectedCommandIndeterminate",
  selectedRole,
  ...fields("launch-reauthentication", reason),
});

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort((left, right) => left.localeCompare(right, "en"));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const admissionKeyFor = (evidence: SelectedEvidence): string =>
  `admission:${
    canonicalJson({
      schema: "effect-build/r3-probe-cache@1",
      provider: operation.providerPackage,
      operation: operation.operation,
      lane: operation.lane,
      host: evidence.builder.host,
      target: nodeSeaTarget,
      capabilitySchemaRevision: "capabilities-r3-v1",
      policyRevision: "policy-r3-v1",
      participants: [evidence.builder, evidence.base].map((participant) => ({
        role: participant.role,
        kind: participant.role === "builder" ? "selected-executable" : "target-runtime",
        name: "node",
        version: participant.version,
        revision: participant.revision,
        channel: participant.role === "builder" ? "selected-command" : "selected-base",
        content: participant.content,
      })),
      capabilities: evidence.capabilities,
      relations: [{
        id: "node-builder-base",
        inputsKey:
          `builder:node@${evidence.builder.version}+${evidence.builder.revision}|base:node@${evidence.base.version}+${evidence.base.revision}`,
        state: "Satisfied",
      }],
      contracts: [evidence.coreContract],
    })
  }`;

/** Frozen empty until exact executable receipts contribute authenticated keys. */
const reviewedAdmissionKeys: readonly string[] = [];

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.bytes === right.bytes
  && left.digest.algorithm === right.digest.algorithm
  && left.digest.value === right.digest.value;

const hostIsAdmitted = (host: HostCoordinate): boolean =>
  host.os === "linux" && host.architecture === "x64" && host.distribution === "ubuntu-24.04";

export const evaluatePreflight = (input: {
  readonly evidence: SelectedEvidence;
  readonly allowUntestedVersion: boolean;
}): { readonly _tag: "Admitted"; readonly admission: Admission } | {
  readonly _tag: "Refused";
  readonly refusal: PreflightRefusal;
} => {
  const { allowUntestedVersion, evidence } = input;
  const operationFields = (reason: string) => fields("operation-preflight", reason);
  if (!hostIsAdmitted(evidence.builder.host) || !hostIsAdmitted(evidence.base.host)) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "KnownDenyHole",
        holeId: "provider-host:not-linux-x64-gnu-on-ubuntu-24.04",
        ...operationFields("provider-host-is-not-the-frozen-linux-x64-gnu-coordinate"),
      },
    };
  }
  if (evidence.builder.version !== nodeSeaVersion || evidence.base.version !== nodeSeaVersion) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "KnownDenyHole",
        holeId: "node-version:not-26.7.0",
        ...operationFields("only-node-26.7.0-is-in-the-frozen-direct-assembly-coordinate"),
      },
    };
  }
  for (const capability of evidence.capabilities) {
    if (capability._tag === "Missing") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "CapabilityMissing",
          capability: capability.id,
          ...operationFields(capability.reason),
        },
      };
    }
    if (capability._tag === "Indeterminate") {
      return {
        _tag: "Refused",
        refusal: {
          _tag: "CapabilityIndeterminate",
          capability: capability.id,
          ...operationFields(capability.reason),
        },
      };
    }
  }
  if (evidence.builder.revision.length === 0 || evidence.base.revision.length === 0) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "RelationIndeterminate",
        relation: "node-builder-base",
        ...operationFields("builder-or-base-identity-is-incomplete"),
      },
    };
  }
  if (!sameContent(evidence.builder.content, evidence.base.content)) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "RelationUnsatisfied",
        relation: "node-builder-base",
        ...operationFields("builder-and-base-content-identities-differ"),
      },
    };
  }
  if (evidence.coreContract.state === "Incompatible") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "ContractIncompatible",
        contract: evidence.coreContract.id,
        kind: evidence.coreContract.kind,
        ...operationFields(evidence.coreContract.reason),
      },
    };
  }
  if (evidence.coreContract.state === "Indeterminate") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "ContractIndeterminate",
        contract: evidence.coreContract.id,
        kind: evidence.coreContract.kind,
        ...operationFields(evidence.coreContract.reason),
      },
    };
  }
  const admissionKey = admissionKeyFor(evidence);
  if (reviewedAdmissionKeys.includes(admissionKey)) {
    return { _tag: "Admitted", admission: { _tag: "ReviewedAdmission", admissionKey } };
  }
  if (allowUntestedVersion) {
    return {
      _tag: "Admitted",
      admission: { _tag: "UntestedOverride", admissionKey, warningCode: "EFFECT_BUILD_UNTESTED_VERSION" },
    };
  }
  return {
    _tag: "Refused",
    refusal: {
      _tag: "SupportUnknown",
      overrideAvailable: true,
      admissionKey,
      ...operationFields("frozen-coordinate-has-no-reviewed-admission-key"),
    },
  };
};

export const evaluateLaunch = (
  evidence: SelectedEvidence,
  selectedRole: "builder" | "base",
  launch: ContentIdentity,
): { readonly _tag: "Authenticated" } | { readonly _tag: "Refused"; readonly refusal: LaunchRefusal } => {
  const acquired = evidence[selectedRole].content;
  if (!sameContent(acquired, launch)) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "SelectedCommandChanged",
        selectedRole,
        acquired,
        launch,
        ...fields("launch-reauthentication", `${selectedRole}-content-changed`),
      },
    };
  }
  return { _tag: "Authenticated" };
};
