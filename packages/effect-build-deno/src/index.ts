import { Context, type Effect, type Layer } from "effect";
import * as Provider from "effect-build/Provider";
import { definition, type Options, Stages, targetEntries } from "./Adapter.js";

export type { Options, Permissions, PermissionValue } from "./Adapter.js";

type TargetType = (typeof targetEntries)[number][0];
type StageType = typeof Stages.Type;
type Service = Provider.CompilerService<"deno", Options, TargetType, StageType>;

export class Compiler extends Context.Service<
  Compiler,
  Service
>()("effect-build-deno/Compiler") {}

const makeService = (
  context: Provider.CommandServiceContext<"deno", Options, TargetType, StageType>,
): Service =>
  Object.freeze({
    compileExecutable: context.compileExecutable,
    compileExecutableMatrix: context.compileExecutableMatrix,
  });

const implementation = Provider.define({
  name: "deno",
  service: Compiler,
  makeService,
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
