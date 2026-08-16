import { Context, Effect, Layer } from "effect";

export type ProviderLane = "host-api" | "selected-command";
export type CompatibilityStatus = "matrix-tested" | "policy-supported" | "untested-override";

export interface ToolIdentity {
  readonly name: string;
  readonly version: string;
  readonly path?: string;
  readonly digest?: `sha256:${string}`;
}

export interface ExactVersions {
  readonly _tag: "ExactVersions";
  readonly versions: readonly string[];
}

export interface SemverRange {
  readonly _tag: "SemverRange";
  readonly expression: string;
}

export interface VersionPredicate {
  readonly _tag: "Predicate";
  readonly name: string;
  readonly test: (version: string) => boolean;
}

export type VersionPolicy = ExactVersions | SemverRange | VersionPredicate;

export interface KnownIncompatibility {
  readonly policy: VersionPolicy;
  readonly reason: string;
}

export interface EqualVersionRelation {
  readonly _tag: "EqualVersion";
  readonly name: string;
  readonly left: { readonly label: string; readonly version: string };
  readonly right: { readonly label: string; readonly version: string };
}

export interface RelationPredicate {
  readonly _tag: "Predicate";
  readonly name: string;
  readonly detail: string;
  readonly test: () => boolean;
}

export type CompatibilityRelation = EqualVersionRelation | RelationPredicate;

export interface CompatibilityRequest {
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly selected: ToolIdentity;
  readonly matrixTestedVersions: readonly string[];
  readonly supported: VersionPolicy;
  readonly knownIncompatibilities?: readonly KnownIncompatibility[];
  readonly observedCapabilities: ReadonlySet<string>;
  readonly requiredCapabilities: readonly string[];
  readonly relations?: readonly CompatibilityRelation[];
  readonly allowUntestedVersion?: boolean;
}

export interface ToolCompatibilityObservation {
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly selected: ToolIdentity;
  readonly status: CompatibilityStatus;
  readonly matrixTestedVersions: readonly string[];
  readonly supportedPolicy: SerializableVersionPolicy;
  readonly capabilities: readonly string[];
}

export type SerializableVersionPolicy =
  | ExactVersions
  | SemverRange
  | { readonly _tag: "Predicate"; readonly name: string };

export interface ToolVersionUntestedOverride {
  readonly _tag: "ToolVersionUntestedOverride";
  readonly code: "EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE";
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly tool: ToolIdentity;
  readonly supportedPolicy: SerializableVersionPolicy;
  readonly matrixTestedVersions: readonly string[];
  readonly message: string;
}

export interface Compatible {
  readonly _tag: "Compatible";
  readonly observation: ToolCompatibilityObservation;
  readonly warning?: ToolVersionUntestedOverride;
}

export interface KnownIncompatible {
  readonly _tag: "KnownIncompatible";
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly tool: ToolIdentity;
  readonly reason: string;
}

export interface MissingCapability {
  readonly _tag: "MissingCapability";
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly tool: ToolIdentity;
  readonly missing: readonly string[];
}

export interface RelationUnsatisfied {
  readonly _tag: "RelationUnsatisfied";
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly tool: ToolIdentity;
  readonly relation: string;
  readonly detail: string;
}

export interface VersionUnsupported {
  readonly _tag: "VersionUnsupported";
  readonly providerPackage: string;
  readonly lane: ProviderLane;
  readonly operation: string;
  readonly tool: ToolIdentity;
  readonly supportedPolicy: SerializableVersionPolicy;
  readonly matrixTestedVersions: readonly string[];
  readonly overrideAvailable: true;
  readonly remediation: string;
}

export type CompatibilityFailure =
  | KnownIncompatible
  | MissingCapability
  | RelationUnsatisfied
  | VersionUnsupported;

export type CompatibilityDecision = Compatible | CompatibilityFailure;

interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const parseSemver = (input: string): Semver | undefined => {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(input.trim());
  if (match === null) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const compareSemver = (left: Semver, right: Semver): number =>
  left.major !== right.major
    ? left.major - right.major
    : left.minor !== right.minor
    ? left.minor - right.minor
    : left.patch - right.patch;

const comparatorMatches = (version: Semver, comparator: string): boolean => {
  const match = /^(<=|>=|<|>|=|\^|~)?\s*(v?\d+\.\d+\.\d+(?:[-+][^\s]+)?)$/.exec(comparator.trim());
  if (match === null) return false;
  const targetInput = match[2];
  if (targetInput === undefined) return false;
  const target = parseSemver(targetInput);
  if (target === undefined) return false;
  const comparison = compareSemver(version, target);
  switch (match[1] ?? "=") {
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
    case "^": return version.major === target.major && comparison >= 0;
    case "~": return version.major === target.major && version.minor === target.minor && comparison >= 0;
    case "=": return comparison === 0;
  }
};

export const satisfiesSemverRange = (versionInput: string, expression: string): boolean => {
  const version = parseSemver(versionInput);
  if (version === undefined) return false;
  return expression.split("||").some((alternative) => {
    const comparators = alternative.trim().split(/\s+/).filter((value) => value.length > 0);
    return comparators.length > 0 && comparators.every((comparator) => comparatorMatches(version, comparator));
  });
};

export const policyMatches = (policy: VersionPolicy, version: string): boolean => {
  switch (policy._tag) {
    case "ExactVersions": return policy.versions.includes(version);
    case "SemverRange": return satisfiesSemverRange(version, policy.expression);
    case "Predicate": return policy.test(version);
  }
};

export const serializePolicy = (policy: VersionPolicy): SerializableVersionPolicy => {
  switch (policy._tag) {
    case "ExactVersions": return { _tag: "ExactVersions", versions: [...policy.versions] };
    case "SemverRange": return { _tag: "SemverRange", expression: policy.expression };
    case "Predicate": return { _tag: "Predicate", name: policy.name };
  }
};

const relationFailure = (relation: CompatibilityRelation): { readonly relation: string; readonly detail: string } | undefined => {
  switch (relation._tag) {
    case "EqualVersion":
      return relation.left.version === relation.right.version
        ? undefined
        : {
          relation: relation.name,
          detail: `${relation.left.label}=${relation.left.version}; ${relation.right.label}=${relation.right.version}`,
        };
    case "Predicate":
      return relation.test() ? undefined : { relation: relation.name, detail: relation.detail };
  }
};

export const evaluateCompatibility = (request: CompatibilityRequest): CompatibilityDecision => {
  const common = {
    providerPackage: request.providerPackage,
    lane: request.lane,
    operation: request.operation,
    tool: request.selected,
  };
  for (const incompatibility of request.knownIncompatibilities ?? []) {
    if (policyMatches(incompatibility.policy, request.selected.version)) {
      return { _tag: "KnownIncompatible", ...common, reason: incompatibility.reason };
    }
  }
  const missing = request.requiredCapabilities.filter((capability) => !request.observedCapabilities.has(capability));
  if (missing.length > 0) return { _tag: "MissingCapability", ...common, missing };
  for (const relation of request.relations ?? []) {
    const failed = relationFailure(relation);
    if (failed !== undefined) return { _tag: "RelationUnsatisfied", ...common, ...failed };
  }
  const tested = request.matrixTestedVersions.includes(request.selected.version);
  const policySupported = policyMatches(request.supported, request.selected.version);
  if (!tested && !policySupported && request.allowUntestedVersion !== true) {
    return {
      _tag: "VersionUnsupported",
      ...common,
      supportedPolicy: serializePolicy(request.supported),
      matrixTestedVersions: [...request.matrixTestedVersions],
      overrideAvailable: true,
      remediation: `Select a supported ${request.selected.name} version or set allowUntestedVersion: true for this Layer`,
    };
  }
  const status: CompatibilityStatus = tested
    ? "matrix-tested"
    : policySupported
    ? "policy-supported"
    : "untested-override";
  const observation: ToolCompatibilityObservation = {
    providerPackage: request.providerPackage,
    lane: request.lane,
    operation: request.operation,
    selected: request.selected,
    status,
    matrixTestedVersions: [...request.matrixTestedVersions],
    supportedPolicy: serializePolicy(request.supported),
    capabilities: [...request.observedCapabilities].sort(),
  };
  if (status !== "untested-override") return { _tag: "Compatible", observation };
  return {
    _tag: "Compatible",
    observation,
    warning: {
      _tag: "ToolVersionUntestedOverride",
      code: "EFFECT_BUILD_TOOL_VERSION_UNTESTED_OVERRIDE",
      providerPackage: request.providerPackage,
      lane: request.lane,
      operation: request.operation,
      tool: request.selected,
      supportedPolicy: serializePolicy(request.supported),
      matrixTestedVersions: [...request.matrixTestedVersions],
      message: `${request.providerPackage} is running untested ${request.selected.name} ${request.selected.version} for ${request.operation}`,
    },
  };
};

export interface CompatibilityEvaluatorService {
  readonly evaluate: (request: CompatibilityRequest) => CompatibilityDecision;
}

export class CompatibilityEvaluator extends Context.Service<
  CompatibilityEvaluator,
  CompatibilityEvaluatorService
>()("effect-build-research/CompatibilityEvaluator") {}

export interface CompatibilityReporterService {
  readonly warning: (warning: ToolVersionUntestedOverride) => Effect.Effect<void>;
}

export class CompatibilityReporter extends Context.Service<
  CompatibilityReporter,
  CompatibilityReporterService
>()("effect-build-research/CompatibilityReporter") {}

export const evaluatorLayer: Layer.Layer<CompatibilityEvaluator> = Layer.succeed(
  CompatibilityEvaluator,
  { evaluate: evaluateCompatibility },
);

export const reporterLayer = (
  report: (warning: ToolVersionUntestedOverride) => void,
): Layer.Layer<CompatibilityReporter> => Layer.succeed(
  CompatibilityReporter,
  { warning: (warning) => Effect.sync(() => report(warning)) },
);

export const requireCompatibility = (
  request: CompatibilityRequest,
): Effect.Effect<
  ToolCompatibilityObservation,
  CompatibilityFailure,
  CompatibilityEvaluator | CompatibilityReporter
> => CompatibilityEvaluator.use((evaluator) => {
  const decision = evaluator.evaluate(request);
  if (decision._tag !== "Compatible") return Effect.fail(decision);
  if (decision.warning === undefined) return Effect.succeed(decision.observation);
  const warning = decision.warning;
  return CompatibilityReporter.use((reporter) =>
    Effect.as(reporter.warning(warning), decision.observation)
  );
});
