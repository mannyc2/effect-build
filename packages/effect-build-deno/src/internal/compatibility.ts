import type { AbsolutePath } from "effect-build/Artifact";
import type { ContentIdentity } from "effect-build/Author/Tool";

export type SupportedTarget =
  | "macos-x64"
  | "macos-aarch64"
  | "linux-x64-gnu"
  | "linux-aarch64-gnu"
  | "windows-x64"
  | "windows-aarch64";

export interface OperationCoordinate {
  readonly providerPackage: "effect-build-deno";
  readonly lane: "selected-command";
  readonly operation: "compile-executable";
}

export interface HostCoordinate {
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly distribution: "ubuntu-24.04" | "not-applicable" | "unknown";
}

export type CapabilityObservation =
  | { readonly _tag: "Present"; readonly id: "compile"; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly id: "compile"; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly id: "compile"; readonly reason: string };

export interface ContractObservation {
  readonly id: "effect-build-core";
  readonly kind: "provider-core-peer";
  readonly inputsKey: string;
  readonly state: "Compatible" | "Incompatible" | "Indeterminate";
  readonly reason: string;
}

export interface DenortOverride {
  readonly path: AbsolutePath;
  readonly content: ContentIdentity;
}

/**
 * The exact denort input Deno will consume for one compile target. A cache
 * archive and a DENORT_BIN override are deliberately distinct: the former is
 * the stable-release archive selected by Deno itself, while the latter is the
 * raw development override Deno reads before it consults the cache.
 */
export interface DenortRuntime {
  readonly source: "download-cache" | "environment-override";
  readonly path: AbsolutePath;
  readonly content: ContentIdentity;
  readonly target: SupportedTarget;
  readonly nativeTarget: string;
}

/**
 * Command environment frozen from the observed Deno configuration. This does
 * not replace caller environment; it pins only the input that Deno would
 * otherwise re-resolve after the preflight.
 */
export interface RuntimeBinding {
  readonly denort: DenortRuntime;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

export interface SelectedEvidence {
  readonly path: AbsolutePath;
  readonly version: string;
  readonly revision: string;
  readonly host: HostCoordinate;
  readonly content: ContentIdentity;
  readonly capability: CapabilityObservation;
  readonly coreContract: ContractObservation;
  readonly denoDir?: AbsolutePath;
  readonly denortOverride?: DenortOverride;
}

export type EvaluationPhase = "layer-acquisition" | "operation-preflight" | "launch-reauthentication";

interface CompatibilityFields {
  readonly operation: OperationCoordinate;
  readonly owner: "effect-build-deno";
  readonly phase: EvaluationPhase;
  readonly reason: string;
}

export interface ToolNotFound extends CompatibilityFields {
  readonly _tag: "ToolNotFound";
  readonly tool: "deno";
  readonly command: string;
}

export interface ToolProbeFailed extends CompatibilityFields {
  readonly _tag: "ToolProbeFailed";
  readonly tool: "deno";
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

export interface SelectedCommandChanged extends CompatibilityFields {
  readonly _tag: "SelectedCommandChanged";
  readonly selectedRole: "deno";
  readonly acquired: ContentIdentity;
  readonly launch: ContentIdentity;
}

export interface SelectedCommandIndeterminate extends CompatibilityFields {
  readonly _tag: "SelectedCommandIndeterminate";
  readonly selectedRole: "deno";
}

export type LayerRefusal = ToolNotFound | ToolProbeFailed | IdentityIncomplete;

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

export interface Diagnostic {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
  readonly truncated: boolean;
}

export interface InvalidDriverOptions {
  readonly _tag: "InvalidDriverOptions";
  readonly tool: "deno";
  readonly reason: string;
}

export interface ToolFailed {
  readonly _tag: "ToolFailed";
  readonly tool: "deno";
  readonly exitCode: number;
  readonly diagnostics: readonly [Diagnostic, Diagnostic];
}

export interface TargetUnsupported {
  readonly _tag: "TargetUnsupported";
  readonly tool: "deno";
  readonly requested: string;
  readonly available: readonly SupportedTarget[];
}

export const operation: OperationCoordinate = Object.freeze({
  providerPackage: "effect-build-deno",
  lane: "selected-command",
  operation: "compile-executable",
});

const fields = (phase: EvaluationPhase, reason: string): CompatibilityFields => ({
  operation,
  owner: "effect-build-deno",
  phase,
  reason,
});

export const toolNotFound = (command: string): ToolNotFound => ({
  _tag: "ToolNotFound",
  tool: "deno",
  command,
  ...fields("layer-acquisition", "selected-command-not-found"),
});

export const toolProbeFailed = (reason: string): ToolProbeFailed => ({
  _tag: "ToolProbeFailed",
  tool: "deno",
  ...fields("layer-acquisition", reason),
});

export const identityIncomplete = (reason: string): IdentityIncomplete => ({
  _tag: "IdentityIncomplete",
  ...fields("layer-acquisition", reason),
});

export const invalidDriverOptions = (reason: string): InvalidDriverOptions => ({
  _tag: "InvalidDriverOptions",
  tool: "deno",
  reason,
});

export const toolFailed = (
  exitCode: number,
  stdout: Omit<Diagnostic, "channel">,
  stderr: Omit<Diagnostic, "channel">,
): ToolFailed => ({
  _tag: "ToolFailed",
  tool: "deno",
  exitCode,
  diagnostics: [
    { channel: "stdout", ...stdout },
    { channel: "stderr", ...stderr },
  ],
});

export const targetUnsupported = (requested: string, available: readonly SupportedTarget[]): TargetUnsupported => ({
  _tag: "TargetUnsupported",
  tool: "deno",
  requested,
  available,
});

export const selectedCommandIndeterminate = (reason: string): SelectedCommandIndeterminate => ({
  _tag: "SelectedCommandIndeterminate",
  selectedRole: "deno",
  ...fields("launch-reauthentication", reason),
});

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort((left, right) => left.localeCompare(right, "en"));
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
  }
  return JSON.stringify(value);
};

export const nativeTargetFor = (target: SupportedTarget): string => {
  switch (target) {
    case "macos-x64":
      return "x86_64-apple-darwin";
    case "macos-aarch64":
      return "aarch64-apple-darwin";
    case "linux-x64-gnu":
      return "x86_64-unknown-linux-gnu";
    case "linux-aarch64-gnu":
      return "aarch64-unknown-linux-gnu";
    case "windows-x64":
      return "x86_64-pc-windows-msvc";
    case "windows-aarch64":
      return "aarch64-pc-windows-msvc";
  }
};

const relationFor = (
  evidence: SelectedEvidence,
  target: SupportedTarget,
  runtime: DenortRuntime,
): {
  readonly state: "Satisfied" | "Unsatisfied" | "Indeterminate";
  readonly inputsKey: string;
  readonly reason: string;
} => {
  const targetRuntime = nativeTargetFor(target);
  if (runtime.target !== target || runtime.nativeTarget !== targetRuntime) {
    return {
      state: "Unsatisfied",
      inputsKey: "deno:" + evidence.content.digest.value + "|denort:" + runtime.content.digest.value
        + "|target:" + targetRuntime,
      reason: "bound-denort-target-does-not-match-requested-target",
    };
  }
  return {
    state: "Satisfied",
    inputsKey: "deno:" + evidence.content.digest.value + "|denort:" + runtime.content.digest.value
      + "|target:" + targetRuntime + "|source:" + runtime.source,
    reason: "selected-deno-runtime-is-content-bound-for-the-requested-target",
  };
};

const admissionKeyFor = (evidence: SelectedEvidence, target: SupportedTarget, runtime: DenortRuntime): string => {
  const relation = relationFor(evidence, target, runtime);
  return "admission:" + canonicalJson({
    schema: "effect-build/r3-probe-cache@1",
    contentIdentity: {
      participants: [
        {
          role: "deno",
          name: "deno",
          version: evidence.version,
          revision: evidence.revision,
          channel: "selected-command",
          content: evidence.content,
        },
        {
          role: "denort",
          name: "denort",
          version: evidence.version,
          revision: evidence.revision,
          channel: runtime.source,
          content: runtime.content,
        },
      ],
    },
    provider: operation.providerPackage,
    operation: operation.operation,
    lane: operation.lane,
    requestedOperation: operation.operation,
    requestedLane: operation.lane,
    host: evidence.host,
    target,
    capabilitySchemaRevision: "capabilities-r3-v1",
    policyRevision: "policy-r3-v1",
    capabilities: [evidence.capability],
    relationInputs: [{ id: "deno-denort", inputsKey: relation.inputsKey, state: relation.state }],
    profileAndPeerInputs: [evidence.coreContract],
  });
};

/** Frozen empty until exact executable receipts contribute authenticated keys. */
const reviewedAdmissionKeys: readonly string[] = [];

export const evaluatePreflight = (input: {
  readonly evidence: SelectedEvidence;
  readonly runtime: DenortRuntime;
  readonly target: SupportedTarget;
  readonly allowUntestedVersion: boolean;
}): { readonly _tag: "Admitted"; readonly admission: Admission } | {
  readonly _tag: "Refused";
  readonly refusal: PreflightRefusal;
} => {
  const { allowUntestedVersion, evidence, runtime, target } = input;
  const operationFields = (reason: string) => fields("operation-preflight", reason);
  if (
    evidence.host.os !== "linux"
    || evidence.host.architecture !== "x64"
    || evidence.host.distribution !== "ubuntu-24.04"
  ) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "KnownDenyHole",
        holeId: "provider-host:" + evidence.host.distribution + "-" + evidence.host.os + "-"
          + evidence.host.architecture,
        ...operationFields("provider-host-is-not-the-frozen-ubuntu-24.04-linux-x64-coordinate"),
      },
    };
  }
  if (evidence.capability._tag === "Missing") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "CapabilityMissing",
        capability: "compile",
        ...operationFields(evidence.capability.reason),
      },
    };
  }
  if (evidence.capability._tag === "Indeterminate") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "CapabilityIndeterminate",
        capability: "compile",
        ...operationFields(evidence.capability.reason),
      },
    };
  }
  const relation = relationFor(evidence, target, runtime);
  if (relation.state === "Unsatisfied") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "RelationUnsatisfied",
        relation: "deno-denort",
        ...operationFields(relation.reason),
      },
    };
  }
  if (relation.state === "Indeterminate") {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "RelationIndeterminate",
        relation: "deno-denort",
        ...operationFields(relation.reason),
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
  const admissionKey = admissionKeyFor(evidence, target, runtime);
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
      ...operationFields(
        evidence.version === "2.9.3"
          ? "frozen-coordinate-has-no-reviewed-admission-key"
          : "selected-deno-version-has-no-reviewed-admission-key",
      ),
    },
  };
};

export const evaluateLaunch = (
  evidence: SelectedEvidence,
  launch: ContentIdentity,
): { readonly _tag: "Authenticated" } | { readonly _tag: "Refused"; readonly refusal: LaunchRefusal } => {
  if (
    evidence.content.bytes !== launch.bytes
    || evidence.content.digest.algorithm !== launch.digest.algorithm
    || evidence.content.digest.value !== launch.digest.value
  ) {
    return {
      _tag: "Refused",
      refusal: {
        _tag: "SelectedCommandChanged",
        selectedRole: "deno",
        acquired: evidence.content,
        launch,
        ...fields("launch-reauthentication", "selected-command-content-changed"),
      },
    };
  }
  return { _tag: "Authenticated" };
};
