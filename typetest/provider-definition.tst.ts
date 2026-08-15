import { Context, Result, Schema } from "effect";
import type { Effect } from "effect";
import * as Provider from "effect-build/Provider";
import type { MatrixFailed } from "../packages/effect-build/src/standalone/MatrixError.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type SuccessOf<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type ErrorOf<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never;
type ContextOf<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never;

interface Options {
  readonly minify?: boolean;
}

const targetEntries = [
  ["macos-aarch64", "fixture-darwin-arm64"],
  ["linux-x64-gnu", "fixture-linux-x64"],
] as const;

const Stages = Schema.Tuple([
  Schema.Struct({
    operation: Schema.Literal("compile-executable"),
    tool: Schema.Struct({
      name: Schema.Literal("fixture"),
      version: Schema.NonEmptyString,
      path: Schema.optionalKey(Schema.String),
    }),
  }),
]);
type Stages = typeof Stages.Type;
type Target = (typeof targetEntries)[number][0];

class FixtureCompiler extends Context.Service<
  FixtureCompiler,
  Provider.CompilerService<"fixture", Options, Target, Stages>
>()("typetest/provider-definition/FixtureCompiler") {}

const definition: Provider.CommandDefinition<
  FixtureCompiler,
  "fixture",
  typeof targetEntries,
  Stages,
  Options,
  Options
> = {
  name: "fixture",
  service: FixtureCompiler,
  targetEntries,
  Stages,
  defaultTarget: "macos-aarch64",
  validateOptions: (_input: unknown) => Result.succeed({} as Options),
  probeArgv: ["--version"],
  renderArgv: ({ input, nativeTarget, stagedOutfile }) => [
    ...(input.options.minify === true ? ["--minify"] : []),
    ...(nativeTarget === undefined ? [] : [nativeTarget]),
    stagedOutfile,
  ],
  interpretFailure: (completion) => [{ channel: "stderr", ...completion.stderr }],
};

const implementation = Provider.define(definition);

export type _Target = Assert<Same<typeof implementation.Target.Type, Target>>;
export type _Surface = Assert<
  Same<
    keyof typeof implementation,
    "Target" | "Artifact" | "MatrixError" | "compileExecutable" | "compileExecutableMatrix" | "layer"
  >
>;
type Scalar = ReturnType<typeof implementation.compileExecutable>;
type Matrix = ReturnType<typeof implementation.compileExecutableMatrix>;
export type _ScalarSuccess = Assert<
  Same<SuccessOf<Scalar>, Provider.ProviderArtifact<"fixture", Target, Stages>>
>;
export type _ScalarContext = Assert<Same<ContextOf<Scalar>, FixtureCompiler>>;
export type _StageName = Assert<Same<SuccessOf<Scalar>["stages"][0]["tool"]["name"], "fixture">>;
export type _MatrixSuccess = Assert<
  Same<SuccessOf<Matrix>, readonly Provider.ProviderArtifact<"fixture", Target, Stages>[]>
>;
export type _MatrixError = Assert<
  Same<ErrorOf<Matrix>, Provider.ProviderMatrixError<"fixture", Target, Stages>>
>;
type Failed = Extract<ErrorOf<Matrix>, { readonly _tag: "MatrixFailed" }>;
export type _MatrixClassPreserved = Assert<Failed extends MatrixFailed ? true : false>;
export type _MatrixYieldable = Assert<Failed extends Iterable<unknown> ? true : false>;
export type _MatrixPipe = Assert<"pipe" extends keyof Failed ? true : false>;
export type _MatrixJson = Assert<"toJSON" extends keyof Failed ? true : false>;
export type _FailureProvider = Assert<Same<Failed["failures"][number]["provider"], "fixture">>;
export type _FailureTarget = Assert<Same<Failed["failures"][number]["target"], Target>>;
export type _PartialArtifacts = Assert<
  Failed["artifacts"] extends readonly Provider.ProviderArtifact<"fixture", Target, Stages>[] ? true : false
>;

const _optionsResult: ReturnType<
  Provider.CommandDefinition<
    FixtureCompiler,
    "fixture",
    typeof targetEntries,
    Stages,
    Options,
    Options
  >["validateOptions"]
> = Result.succeed({});
void _optionsResult;

// @ts-expect-error!
Provider.define({ ...definition, name: "" });

// @ts-expect-error!
type _NoBespokeValidation = Provider.Validation<Options>;
// @ts-expect-error!
type _NoComposedDefinition = Provider.ComposedDefinition<FixtureCompiler, Options, Options>;

const TwoStages = Schema.Tuple([Stages.elements[0], Stages.elements[0]]);
// @ts-expect-error!
const _invalidStages: Provider.ProviderStages<"fixture"> = {} as typeof TwoStages.Type;
void _invalidStages;

// @ts-expect-error!
implementation.adapter;
// @ts-expect-error!
implementation.process;
