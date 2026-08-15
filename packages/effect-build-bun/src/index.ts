import { Context, type Effect, type Layer } from "effect";
import * as Provider from "effect-build/Provider";
import { definition, type Options, Stages, targetEntries } from "./Adapter.js";

export type { Options } from "./Adapter.js";

type TargetType = (typeof targetEntries)[number][0];
type StageType = typeof Stages.Type;

export class Compiler extends Context.Service<
  Compiler,
  Provider.CompilerService<"bun", Options, TargetType, StageType>
>()("effect-build-bun/Compiler") {}

const implementation = Provider.define({
  name: "bun",
  service: Compiler,
  ...definition,
});

export const Target = implementation.Target;
export type Target = typeof Target.Type;
export type Artifact = typeof implementation.Artifact.Type;
export type CompileExecutableInput = Provider.CompileExecutableInput<
  Options,
  Target
>;
export type CompileExecutableMatrixInput = Provider.CompileExecutableMatrixInput<Target, Options>;
export type MatrixError = typeof implementation.MatrixError.Type;
export type LayerOptions = Provider.LayerOptions;

export const compileExecutable: (
  input: CompileExecutableInput,
) => Effect.Effect<Artifact, Provider.BuildError, Compiler> = implementation.compileExecutable;

export const compileExecutableMatrix: (
  input: CompileExecutableMatrixInput,
) => Effect.Effect<readonly Artifact[], MatrixError, Compiler> = implementation.compileExecutableMatrix;

export const layer: (
  options?: LayerOptions,
) => Layer.Layer<
  Compiler,
  Provider.ToolNotFound | Provider.ToolProbeFailed,
  Provider.ProviderLayerRequirements
> = implementation.layer;
