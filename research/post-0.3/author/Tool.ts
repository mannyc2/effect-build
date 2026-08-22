import type { Effect } from "effect";
import type { ChildProcess } from "effect/unstable/process";

/** Proposed public contract: effect-build/Author/Tool. Research-only here. */
/** Canonical, non-negative, unbounded base-10 byte count. */
export type DecimalBytes = string & { readonly _effectBuildScalar: "DecimalBytes" };

/** Exactly 64 lowercase hexadecimal characters; the algorithm is not repeated in the value. */
export type Sha256Value = string & { readonly _effectBuildScalar: "Sha256Value" };

export interface Digest {
  readonly algorithm: "sha256";
  readonly value: Sha256Value;
}

export interface ContentIdentity {
  readonly digest: Digest;
  readonly bytes: DecimalBytes;
}

export const decimalBytes = (value: string): DecimalBytes => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError("byte count must be canonical unsigned decimal");
  return value as DecimalBytes;
};

export const sha256Digest = (value: string): Digest => {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("sha256 value must be 64 lowercase hexadecimal characters");
  return { algorithm: "sha256", value: value as Sha256Value };
};

export interface ParticipantIdentity {
  readonly role: string;
  readonly name: string;
  readonly version: string;
  readonly revision: string;
  readonly channel: string;
  readonly content: ContentIdentity;
}

export type CapabilityObservation =
  | { readonly _tag: "Present"; readonly id: string; readonly evidence: string }
  | { readonly _tag: "Missing"; readonly id: string; readonly reason: string }
  | { readonly _tag: "Indeterminate"; readonly id: string; readonly reason: string };

export interface Observation<Name extends string> {
  readonly name: Name;
  readonly participants: readonly [ParticipantIdentity, ...ParticipantIdentity[]];
  readonly capabilities: readonly CapabilityObservation[];
}

export type Admission =
  | { readonly _tag: "ReviewedAdmission"; readonly admissionKey: string }
  | {
    readonly _tag: "UntestedOverride";
    readonly admissionKey: string;
    readonly warningCode: "EFFECT_BUILD_UNTESTED_VERSION";
  };

export interface Definition<
  Name extends string,
  Request,
  Refusal,
  Requirements = never,
> {
  readonly observation: Observation<Name>;
  /** Provider-owned finite code; core supplies no matcher or relation DSL. */
  readonly evaluate: (request: Request) => Effect.Effect<Admission, Refusal, Requirements>;
  /** Must close over the observed executable; never re-runs PATH selection. */
  readonly command: (
    argv: readonly string[],
    options?: ChildProcess.CommandOptions,
  ) => ChildProcess.Command;
}

export const define = <Name extends string, Request, Refusal, Requirements = never>(
  definition: Definition<Name, Request, Refusal, Requirements>,
): Definition<Name, Request, Refusal, Requirements> => Object.freeze(definition);
