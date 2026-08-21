/**
 * R3 research model. This is deliberately provider-owned policy expressed as
 * ordinary data/functions, not a production export or a public matcher DSL.
 */

export type CompatibilityLane = "host-api" | "installed-library-api" | "selected-command";

export type EvaluationPhase =
  | "layer-acquisition"
  | "operation-preflight"
  | "launch-reauthentication";

export interface CompatibilityOperation {
  readonly providerPackage: string;
  readonly lane: CompatibilityLane;
  readonly operation: string;
}

export interface HostCoordinate {
  readonly os: "linux" | "macos" | "windows";
  readonly architecture: "x64" | "arm64";
  readonly runtime: string;
  readonly runtimeVersion: string;
}

export interface CompatibilityRequest {
  readonly operation: string;
  readonly lane: CompatibilityLane;
  readonly host: HostCoordinate;
  readonly target: string;
}

export interface ContentIdentity {
  readonly algorithm: "sha256";
  readonly value: `sha256:${string}`;
  /** Decimal string so cache/receipt JSON never truncates a bigint. */
  readonly bytes: string;
}

export type ImplementationParticipantKind =
  | "host-runtime"
  | "javascript-package"
  | "declarations"
  | "native-binary"
  | "selected-executable"
  | "target-runtime"
  | "profile";

export interface ImplementationParticipant {
  readonly role: string;
  readonly kind: ImplementationParticipantKind;
  readonly name: string;
  readonly version: string;
  readonly revision: string;
  readonly channel: string;
  readonly content: ContentIdentity;
}

export interface ProviderImplementationIdentity {
  readonly providerPackage: string;
  readonly lane: CompatibilityLane;
  readonly participants: readonly [ImplementationParticipant, ...ImplementationParticipant[]];
}

export type CapabilityState =
  | { readonly _tag: "Present"; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly reason: string }
  | {
    readonly _tag: "Indeterminate";
    readonly reason: "timeout" | "probe-failed" | "ambiguous";
    readonly detail: string;
  };

export interface CapabilityObservation {
  readonly id: string;
  readonly state: CapabilityState;
}

export type RelationState =
  | { readonly _tag: "Satisfied"; readonly evidence: string }
  | { readonly _tag: "Unsatisfied"; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly reason: string };

export interface RelationObservation {
  readonly id: string;
  /** Canonical identity of every participant/value consumed by the check. */
  readonly inputsKey: string;
  readonly state: RelationState;
}

export type ContractKind = "provider-core-peer" | "portable-profile";

export type ContractState =
  | { readonly _tag: "Compatible"; readonly evidence: string }
  | { readonly _tag: "Incompatible"; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly reason: string };

export interface ContractObservation {
  readonly id: string;
  readonly kind: ContractKind;
  readonly inputsKey: string;
  readonly state: ContractState;
}

export interface CompatibilityInput {
  readonly request: CompatibilityRequest;
  readonly selected: ProviderImplementationIdentity;
  readonly capabilities: readonly CapabilityObservation[];
  readonly relations: readonly RelationObservation[];
  readonly contracts: readonly ContractObservation[];
  /** Required only for replaceable selected-command policies. */
  readonly selectedAtLaunch?: ProviderImplementationIdentity;
  readonly allowUntestedVersion: boolean;
}

export interface DenyHole {
  readonly id: string;
  readonly reason: string;
  readonly matches: (input: CompatibilityInput) => boolean;
}

export interface OperationCompatibilityPolicy {
  readonly operation: CompatibilityOperation;
  readonly policyRevision: string;
  readonly capabilitySchemaRevision: string;
  readonly requiredParticipantRoles: readonly [string, ...string[]];
  readonly requiredCapabilities: readonly string[];
  readonly requiredRelations: readonly string[];
  readonly requiredContracts: readonly Readonly<{
    id: string;
    kind: ContractKind;
  }>[];
  readonly denyHoles: readonly DenyHole[];
  /** Exact, reviewed keys. Probe receipts do not populate this list. */
  readonly reviewedAdmissions: readonly string[];
  /** Evidence coordinates are intentionally diagnostic only. */
  readonly observedEvidenceCoordinates: readonly string[];
  readonly selectedCommandRole?: string;
}

interface RefusalBase {
  readonly operation: CompatibilityOperation;
  readonly owner: string;
  readonly phase: EvaluationPhase;
  readonly reason: string;
}

export interface IdentityIncompleteFailure extends RefusalBase {
  readonly _tag: "IdentityIncomplete";
}

export interface KnownDenyHoleFailure extends RefusalBase {
  readonly _tag: "KnownDenyHole";
  readonly holeId: string;
}

export interface CapabilityMissingFailure extends RefusalBase {
  readonly _tag: "CapabilityMissing";
  readonly capability: string;
}

export interface CapabilityIndeterminateFailure extends RefusalBase {
  readonly _tag: "CapabilityIndeterminate";
  readonly capability: string;
}

export interface RelationUnsatisfiedFailure extends RefusalBase {
  readonly _tag: "RelationUnsatisfied";
  readonly relation: string;
}

export interface RelationIndeterminateFailure extends RefusalBase {
  readonly _tag: "RelationIndeterminate";
  readonly relation: string;
}

export interface ContractIncompatibleFailure extends RefusalBase {
  readonly _tag: "ContractIncompatible";
  readonly contract: string;
  readonly kind: ContractKind;
}

export interface ContractIndeterminateFailure extends RefusalBase {
  readonly _tag: "ContractIndeterminate";
  readonly contract: string;
  readonly kind: ContractKind;
}

export interface SupportUnknownFailure extends RefusalBase {
  readonly _tag: "SupportUnknown";
  readonly overrideAvailable: true;
  readonly admissionKey: string;
}

export interface SelectedCommandChangedFailure extends RefusalBase {
  readonly _tag: "SelectedCommandChanged";
  readonly selectedRole: string;
  readonly acquired: ContentIdentity;
  readonly launch: ContentIdentity;
}

export interface SelectedCommandIndeterminateFailure extends RefusalBase {
  readonly _tag: "SelectedCommandIndeterminate";
  readonly selectedRole: string;
}

export type CompatibilityFailure =
  | IdentityIncompleteFailure
  | KnownDenyHoleFailure
  | CapabilityMissingFailure
  | CapabilityIndeterminateFailure
  | RelationUnsatisfiedFailure
  | RelationIndeterminateFailure
  | ContractIncompatibleFailure
  | ContractIndeterminateFailure
  | SupportUnknownFailure
  | SelectedCommandChangedFailure
  | SelectedCommandIndeterminateFailure;

export interface ReviewedAdmissionCompatibility {
  readonly _tag: "ReviewedAdmission";
  readonly operation: CompatibilityOperation;
  readonly identity: ProviderImplementationIdentity;
  readonly admissionKey: string;
  readonly cacheKey: string;
  readonly observedEvidenceCoordinates: readonly string[];
}

export interface UntestedVersionWarning {
  readonly code: "EFFECT_BUILD_UNTESTED_VERSION";
  readonly providerPackage: string;
  readonly lane: CompatibilityLane;
  readonly operation: string;
  readonly admissionKey: string;
  readonly cacheKey: string;
}

export interface UntestedOverrideCompatibility {
  readonly _tag: "UntestedOverride";
  readonly operation: CompatibilityOperation;
  readonly identity: ProviderImplementationIdentity;
  readonly admissionKey: string;
  readonly cacheKey: string;
  readonly warning: UntestedVersionWarning;
}

export type CompatibilitySuccess = ReviewedAdmissionCompatibility | UntestedOverrideCompatibility;

export type CompatibilityDecision =
  | { readonly _tag: "Compatible"; readonly value: CompatibilitySuccess }
  | { readonly _tag: "Incompatible"; readonly error: CompatibilityFailure };

const refusal = <Failure extends CompatibilityFailure>(
  value: Omit<Failure, "operation" | "owner">,
  policy: OperationCompatibilityPolicy,
): CompatibilityDecision => ({
  _tag: "Incompatible",
  error: {
    ...value,
    operation: policy.operation,
    owner: policy.operation.providerPackage,
  } as Failure,
});

const sorted = <A>(values: readonly A[], key: (value: A) => string): readonly A[] =>
  [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
};

const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value));

const canonicalIdentity = (identity: ProviderImplementationIdentity): unknown => ({
  providerPackage: identity.providerPackage,
  lane: identity.lane,
  participants: sorted(identity.participants, (participant) => participant.role),
});

/**
 * Cache authority includes every R3 input that can change a probe decision.
 * It is a canonical string on purpose: hashing this string is a storage concern.
 */
export const makeProbeCacheKey = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): string =>
  canonicalJson({
    schema: "effect-build/r3-probe-cache@1",
    contentIdentity: canonicalIdentity(input.selected),
    provider: policy.operation.providerPackage,
    operation: policy.operation.operation,
    lane: policy.operation.lane,
    requestedOperation: input.request.operation,
    requestedLane: input.request.lane,
    host: input.request.host,
    target: input.request.target,
    capabilitySchemaRevision: policy.capabilitySchemaRevision,
    policyRevision: policy.policyRevision,
    capabilities: sorted(input.capabilities, (item) => item.id),
    relationInputs: sorted(input.relations, (item) => item.id).map((item) => ({
      id: item.id,
      inputsKey: item.inputsKey,
      state: item.state,
    })),
    profileAndPeerInputs: sorted(input.contracts, (item) => `${item.kind}:${item.id}`).map((item) => ({
      id: item.id,
      kind: item.kind,
      inputsKey: item.inputsKey,
      state: item.state,
    })),
  });

export const makeAdmissionKey = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): string => `admission:${makeProbeCacheKey(policy, input)}`;

const identityFailure = (
  policy: OperationCompatibilityPolicy,
  identity: ProviderImplementationIdentity,
): string | undefined => {
  if (identity.providerPackage !== policy.operation.providerPackage) {
    return `identity provider ${identity.providerPackage} does not match ${policy.operation.providerPackage}`;
  }
  if (identity.lane !== policy.operation.lane) {
    return `identity lane ${identity.lane} does not match ${policy.operation.lane}`;
  }
  const roles = identity.participants.map((participant) => participant.role);
  if (new Set(roles).size !== roles.length) return "identity participant roles are not unique";
  for (const role of policy.requiredParticipantRoles) {
    if (!roles.includes(role)) return `identity is missing participant role ${role}`;
  }
  for (const participant of identity.participants) {
    if (
      participant.role.length === 0
      || participant.name.length === 0
      || participant.version.length === 0
      || participant.revision.length === 0
      || participant.channel.length === 0
      || !/^sha256:[0-9a-f]{64}$/.test(participant.content.value)
      || !/^(0|[1-9][0-9]*)$/.test(participant.content.bytes)
    ) return `identity participant ${participant.role || "<empty>"} is incomplete`;
  }
  return undefined;
};

const byId = <A extends { readonly id: string }>(items: readonly A[]): ReadonlyMap<string, A> =>
  new Map(items.map((item) => [item.id, item]));

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.algorithm === right.algorithm && left.value === right.value && left.bytes === right.bytes;

const reauthenticate = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): CompatibilityDecision | undefined => {
  const role = policy.selectedCommandRole;
  if (role === undefined) return undefined;
  const acquired = input.selected.participants.find((participant) => participant.role === role);
  if (acquired === undefined) {
    return refusal<SelectedCommandIndeterminateFailure>({
      _tag: "SelectedCommandIndeterminate",
      phase: "launch-reauthentication",
      reason: `selected command role ${role} was not acquired`,
      selectedRole: role,
    }, policy);
  }
  const launch = input.selectedAtLaunch;
  if (launch === undefined) {
    return refusal<SelectedCommandIndeterminateFailure>({
      _tag: "SelectedCommandIndeterminate",
      phase: "launch-reauthentication",
      reason: `selected command role ${role} was not reobserved immediately before launch`,
      selectedRole: role,
    }, policy);
  }
  const launchIdentityFailure = identityFailure(policy, launch);
  const observed = launch.participants.find((participant) => participant.role === role);
  if (launchIdentityFailure !== undefined || observed === undefined) {
    return refusal<SelectedCommandIndeterminateFailure>({
      _tag: "SelectedCommandIndeterminate",
      phase: "launch-reauthentication",
      reason: launchIdentityFailure ?? `launch identity is missing selected command role ${role}`,
      selectedRole: role,
    }, policy);
  }
  if (!sameContent(acquired.content, observed.content)) {
    return refusal<SelectedCommandChangedFailure>({
      _tag: "SelectedCommandChanged",
      phase: "launch-reauthentication",
      reason: `selected command bytes for role ${role} changed after Layer acquisition`,
      selectedRole: role,
      acquired: acquired.content,
      launch: observed.content,
    }, policy);
  }
  return undefined;
};

export const evaluateCompatibility = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): CompatibilityDecision => {
  const invalidIdentity = identityFailure(policy, input.selected);
  if (invalidIdentity !== undefined) {
    return refusal<IdentityIncompleteFailure>({
      _tag: "IdentityIncomplete",
      phase: "layer-acquisition",
      reason: invalidIdentity,
    }, policy);
  }

  for (const hole of policy.denyHoles) {
    if (hole.matches(input)) {
      return refusal<KnownDenyHoleFailure>({
        _tag: "KnownDenyHole",
        phase: "operation-preflight",
        reason: hole.reason,
        holeId: hole.id,
      }, policy);
    }
  }

  const capabilities = byId(input.capabilities);
  for (const id of policy.requiredCapabilities) {
    const observed = capabilities.get(id);
    if (observed === undefined || observed.state._tag === "Missing") {
      return refusal<CapabilityMissingFailure>({
        _tag: "CapabilityMissing",
        phase: "operation-preflight",
        reason: observed?.state._tag === "Missing" ? observed.state.reason : `capability ${id} was not probed`,
        capability: id,
      }, policy);
    }
    if (observed.state._tag === "Indeterminate") {
      return refusal<CapabilityIndeterminateFailure>({
        _tag: "CapabilityIndeterminate",
        phase: "operation-preflight",
        reason: `${observed.state.reason}: ${observed.state.detail}`,
        capability: id,
      }, policy);
    }
  }

  const relations = byId(input.relations);
  for (const id of policy.requiredRelations) {
    const observed = relations.get(id);
    if (observed === undefined || observed.state._tag === "Indeterminate") {
      return refusal<RelationIndeterminateFailure>({
        _tag: "RelationIndeterminate",
        phase: "operation-preflight",
        reason: observed?.state._tag === "Indeterminate"
          ? observed.state.reason
          : `relation ${id} was not evaluated`,
        relation: id,
      }, policy);
    }
    if (observed.state._tag === "Unsatisfied") {
      return refusal<RelationUnsatisfiedFailure>({
        _tag: "RelationUnsatisfied",
        phase: "operation-preflight",
        reason: observed.state.reason,
        relation: id,
      }, policy);
    }
  }

  const contracts = new Map(input.contracts.map((item) => [`${item.kind}:${item.id}`, item]));
  for (const requirement of policy.requiredContracts) {
    const observed = contracts.get(`${requirement.kind}:${requirement.id}`);
    if (observed === undefined || observed.state._tag === "Indeterminate") {
      return refusal<ContractIndeterminateFailure>({
        _tag: "ContractIndeterminate",
        phase: "operation-preflight",
        reason: observed?.state._tag === "Indeterminate"
          ? observed.state.reason
          : `${requirement.kind} ${requirement.id} was not evaluated`,
        contract: requirement.id,
        kind: requirement.kind,
      }, policy);
    }
    if (observed.state._tag === "Incompatible") {
      return refusal<ContractIncompatibleFailure>({
        _tag: "ContractIncompatible",
        phase: "operation-preflight",
        reason: observed.state.reason,
        contract: requirement.id,
        kind: requirement.kind,
      }, policy);
    }
  }

  const cacheKey = makeProbeCacheKey(policy, input);
  const admissionKey = makeAdmissionKey(policy, input);
  const reviewed = policy.reviewedAdmissions.includes(admissionKey);
  if (!reviewed && !input.allowUntestedVersion) {
    return refusal<SupportUnknownFailure>({
      _tag: "SupportUnknown",
      phase: "operation-preflight",
      reason: "the exact identity/operation/lane/host/target coordinate has no reviewed admission",
      overrideAvailable: true,
      admissionKey,
    }, policy);
  }

  const reauthenticationFailure = reauthenticate(policy, input);
  if (reauthenticationFailure !== undefined) return reauthenticationFailure;

  if (reviewed) {
    return {
      _tag: "Compatible",
      value: {
        _tag: "ReviewedAdmission",
        operation: policy.operation,
        identity: input.selected,
        admissionKey,
        cacheKey,
        observedEvidenceCoordinates: [...policy.observedEvidenceCoordinates],
      },
    };
  }

  return {
    _tag: "Compatible",
    value: {
      _tag: "UntestedOverride",
      operation: policy.operation,
      identity: input.selected,
      admissionKey,
      cacheKey,
      warning: {
        code: "EFFECT_BUILD_UNTESTED_VERSION",
        providerPackage: policy.operation.providerPackage,
        lane: policy.operation.lane,
        operation: policy.operation.operation,
        admissionKey,
        cacheKey,
      },
    },
  };
};

export const isAllowUntestedVersionEligible = (decision: CompatibilityDecision): boolean =>
  decision._tag === "Incompatible" && decision.error._tag === "SupportUnknown";

export const compatibilityEvaluationTiming = Object.freeze(
  {
    selectionAndGlobalIdentity: "layer-acquisition",
    coordinateHolesCapabilitiesRelationsPeersAndProfiles: "operation-preflight",
    reviewedAdmissionOrUntestedOverride: "operation-preflight",
    selectedCommandContentReauthentication: "launch-reauthentication",
  } as const,
);
