export type CompatibilityLane = "api" | "command";

export interface CompatibilityOperation {
  readonly providerPackage: string;
  readonly lane: CompatibilityLane;
  readonly operation: string;
}

export interface ToolCompatibilityObservation {
  readonly key: string;
  readonly version: string;
  readonly capabilities: readonly string[];
}

export interface ExactVersionMatcher {
  readonly _tag: "ExactVersions";
  readonly versions: readonly [string, ...string[]];
}

export interface SemVerRangeMatcher {
  readonly _tag: "SemVerRange";
  readonly range: string;
  readonly matches: (version: string) => boolean;
}

export interface VersionPredicateMatcher {
  readonly _tag: "Predicate";
  readonly id: string;
  readonly description: string;
  readonly matches: (observation: ToolCompatibilityObservation) => boolean;
}

export type VersionMatcher = ExactVersionMatcher | SemVerRangeMatcher | VersionPredicateMatcher;

export interface KnownIncompatibility {
  readonly matcher: VersionMatcher;
  readonly reason: string;
}

export interface EqualVersionRelation {
  readonly _tag: "EqualVersion";
  readonly left: string;
  readonly right: string;
  readonly reason: string;
}

export interface RelationPredicate {
  readonly _tag: "Predicate";
  readonly id: string;
  readonly description: string;
  readonly matches: (observations: Readonly<Record<string, ToolCompatibilityObservation>>) => boolean;
}

export type CompatibilityRelation = EqualVersionRelation | RelationPredicate;

export interface OperationCompatibilityPolicy {
  readonly operation: CompatibilityOperation;
  readonly tested: VersionMatcher;
  readonly supportedByProviderPolicy: VersionMatcher;
  readonly knownIncompatibilities: readonly KnownIncompatibility[];
  readonly requiredCapabilities: readonly string[];
  readonly relations: readonly CompatibilityRelation[];
}

export interface CompatibilityInput {
  readonly selected: ToolCompatibilityObservation;
  readonly related: Readonly<Record<string, ToolCompatibilityObservation>>;
  readonly allowUntestedVersion: boolean;
}

export interface TestedCompatibility {
  readonly _tag: "Tested";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
}

export interface ProviderPolicyCompatibility {
  readonly _tag: "ProviderPolicySupported";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
}

export interface UntestedVersionWarning {
  readonly code: "EFFECT_BUILD_UNTESTED_VERSION";
  readonly providerPackage: string;
  readonly lane: CompatibilityLane;
  readonly operation: string;
  readonly observedVersion: string;
  readonly testedPolicy: string;
  readonly providerPolicy: string;
}

export interface UntestedOverrideCompatibility {
  readonly _tag: "UntestedOverride";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
  readonly warning: UntestedVersionWarning;
}

export type CompatibilitySuccess =
  | TestedCompatibility
  | ProviderPolicyCompatibility
  | UntestedOverrideCompatibility;

export interface KnownIncompatibilityFailure {
  readonly _tag: "KnownIncompatibility";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
  readonly reason: string;
}

export interface MissingCapabilityFailure {
  readonly _tag: "MissingCapability";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
  readonly missing: readonly [string, ...string[]];
}

export interface RelationUnsatisfiedFailure {
  readonly _tag: "RelationUnsatisfied";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
  readonly relation: CompatibilityRelation;
}

export interface VersionUntestedFailure {
  readonly _tag: "VersionUntested";
  readonly operation: CompatibilityOperation;
  readonly selected: ToolCompatibilityObservation;
  readonly overrideAvailable: true;
  readonly testedPolicy: string;
  readonly providerPolicy: string;
}

export type CompatibilityFailure =
  | KnownIncompatibilityFailure
  | MissingCapabilityFailure
  | RelationUnsatisfiedFailure
  | VersionUntestedFailure;

export type CompatibilityDecision =
  | { readonly _tag: "Compatible"; readonly value: CompatibilitySuccess }
  | { readonly _tag: "Incompatible"; readonly error: CompatibilityFailure };

export const exactVersions = (
  first: string,
  ...rest: readonly string[]
): ExactVersionMatcher => ({
  _tag: "ExactVersions",
  versions: [first, ...rest],
});

export const semVerRange = (
  range: string,
  matches: (version: string) => boolean,
): SemVerRangeMatcher => ({ _tag: "SemVerRange", range, matches });

export const versionPredicate = (
  id: string,
  description: string,
  matches: (observation: ToolCompatibilityObservation) => boolean,
): VersionPredicateMatcher => ({ _tag: "Predicate", id, description, matches });

const matcherDescription = (matcher: VersionMatcher): string => {
  switch (matcher._tag) {
    case "ExactVersions":
      return matcher.versions.join(",");
    case "SemVerRange":
      return matcher.range;
    case "Predicate":
      return `${matcher.id}:${matcher.description}`;
  }
};

const matchesVersion = (
  matcher: VersionMatcher,
  observation: ToolCompatibilityObservation,
): boolean => {
  switch (matcher._tag) {
    case "ExactVersions":
      return matcher.versions.includes(observation.version);
    case "SemVerRange":
      return matcher.matches(observation.version);
    case "Predicate":
      return matcher.matches(observation);
  }
};

const relationSatisfied = (
  relation: CompatibilityRelation,
  observations: Readonly<Record<string, ToolCompatibilityObservation>>,
): boolean => {
  switch (relation._tag) {
    case "EqualVersion": {
      const left = observations[relation.left];
      const right = observations[relation.right];
      return left !== undefined && right !== undefined && left.version === right.version;
    }
    case "Predicate":
      return relation.matches(observations);
  }
};

export const evaluateCompatibility = (
  policy: OperationCompatibilityPolicy,
  input: CompatibilityInput,
): CompatibilityDecision => {
  for (const incompatibility of policy.knownIncompatibilities) {
    if (matchesVersion(incompatibility.matcher, input.selected)) {
      return {
        _tag: "Incompatible",
        error: {
          _tag: "KnownIncompatibility",
          operation: policy.operation,
          selected: input.selected,
          reason: incompatibility.reason,
        },
      };
    }
  }

  const observedCapabilities = new Set(input.selected.capabilities);
  const missing = policy.requiredCapabilities.filter((capability) => !observedCapabilities.has(capability));
  if (missing.length > 0) {
    const first = missing[0];
    if (first === undefined) throw new Error("unreachable empty missing capability set");
    return {
      _tag: "Incompatible",
      error: {
        _tag: "MissingCapability",
        operation: policy.operation,
        selected: input.selected,
        missing: [first, ...missing.slice(1)],
      },
    };
  }

  const observations = { ...input.related, [input.selected.key]: input.selected };
  for (const relation of policy.relations) {
    if (!relationSatisfied(relation, observations)) {
      return {
        _tag: "Incompatible",
        error: {
          _tag: "RelationUnsatisfied",
          operation: policy.operation,
          selected: input.selected,
          relation,
        },
      };
    }
  }

  if (matchesVersion(policy.tested, input.selected)) {
    return {
      _tag: "Compatible",
      value: { _tag: "Tested", operation: policy.operation, selected: input.selected },
    };
  }

  if (matchesVersion(policy.supportedByProviderPolicy, input.selected)) {
    return {
      _tag: "Compatible",
      value: {
        _tag: "ProviderPolicySupported",
        operation: policy.operation,
        selected: input.selected,
      },
    };
  }

  const testedPolicy = matcherDescription(policy.tested);
  const providerPolicy = matcherDescription(policy.supportedByProviderPolicy);
  if (!input.allowUntestedVersion) {
    return {
      _tag: "Incompatible",
      error: {
        _tag: "VersionUntested",
        operation: policy.operation,
        selected: input.selected,
        overrideAvailable: true,
        testedPolicy,
        providerPolicy,
      },
    };
  }

  return {
    _tag: "Compatible",
    value: {
      _tag: "UntestedOverride",
      operation: policy.operation,
      selected: input.selected,
      warning: {
        code: "EFFECT_BUILD_UNTESTED_VERSION",
        providerPackage: policy.operation.providerPackage,
        lane: policy.operation.lane,
        operation: policy.operation.operation,
        observedVersion: input.selected.version,
        testedPolicy,
        providerPolicy,
      },
    },
  };
};
