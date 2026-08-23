import type { Effect } from "effect";
import type { ChildProcess } from "effect/unstable/process";
import * as Tool from "../packages/effect-build/src/Author/Tool.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

interface Request {
  readonly target: string;
}

interface Refusal {
  readonly _tag: "Refusal";
}

interface Requirements {
  readonly _tag: "Requirements";
}

export type _DecimalBytes = Assert<
  Same<Tool.DecimalBytes, string & { readonly _effectBuildScalar: "DecimalBytes" }>
>;
export type _Sha256Value = Assert<
  Same<Tool.Sha256Value, string & { readonly _effectBuildScalar: "Sha256Value" }>
>;
export type _Digest = Assert<
  Same<Tool.Digest, { readonly algorithm: "sha256"; readonly value: Tool.Sha256Value }>
>;
export type _ContentIdentity = Assert<
  Same<Tool.ContentIdentity, { readonly digest: Tool.Digest; readonly bytes: Tool.DecimalBytes }>
>;
export type _CapabilityObservation = Assert<
  Same<
    Tool.CapabilityObservation,
    | { readonly _tag: "Present"; readonly id: string; readonly evidence: string }
    | { readonly _tag: "Missing"; readonly id: string; readonly reason: string }
    | { readonly _tag: "Indeterminate"; readonly id: string; readonly reason: string }
  >
>;
export type _Admission = Assert<
  Same<
    Tool.Admission,
    | { readonly _tag: "ReviewedAdmission"; readonly admissionKey: string }
    | {
      readonly _tag: "UntestedOverride";
      readonly admissionKey: string;
      readonly warningCode: "EFFECT_BUILD_UNTESTED_VERSION";
    }
  >
>;

declare const externalDefinition: {
  readonly observation: Tool.Observation<"fixture">;
  readonly evaluate: (request: Request) => Effect.Effect<Tool.Admission, Refusal, Requirements>;
  readonly command: (
    argv: readonly string[],
    options?: ChildProcess.CommandOptions,
  ) => ChildProcess.Command;
};

const accepted = Tool.define(externalDefinition);
export type _DuplicateCoreStructuralAdmission = Assert<
  Same<typeof accepted, Tool.Definition<"fixture", Request, Refusal, Requirements>>
>;
export type _DefinitionCommand = Assert<
  Same<ReturnType<Tool.Definition<"fixture", Request, Refusal, Requirements>["command"]>, ChildProcess.Command>
>;

declare const plainString: string;
// @ts-expect-error!
const _notDecimalBytes: Tool.DecimalBytes = plainString;
void _notDecimalBytes;

// @ts-expect-error!
const _notSha256Value: Tool.Sha256Value = plainString;
void _notSha256Value;
