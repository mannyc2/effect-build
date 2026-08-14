import { Context, type Effect, type Layer } from "effect";
import * as Provider from "effect-build/Provider";
import { definition, type Options } from "./Adapter.js";

export type { Options } from "./Adapter.js";

export class Compiler extends Context.Service<Compiler, Provider.CompilerService<"node-sea", Options>>()(
  "effect-build-node-sea/Compiler",
) {}

const implementation = Provider.define({ name: "node-sea", service: Compiler, ...definition });

export const Target = implementation.Target;
export type Target = typeof Target.Type;
export type Artifact = Provider.ProviderArtifact<"node-sea", Target>;
export type CompileExecutableInput = Provider.CompileExecutableInput<Options, Target>;
export type CompileExecutableMatrixInput = Provider.CompileExecutableMatrixInput<Target, Options>;
export type MatrixError = Provider.MatrixErrorFor<"node-sea", Target>;
export type LayerOptions = Provider.LayerOptions;

export const compileExecutable: (
  input: CompileExecutableInput,
) => Effect.Effect<Artifact, Provider.BuildError, Compiler> = implementation.compileExecutable;

export const compileExecutableMatrix: (
  input: CompileExecutableMatrixInput,
) => Effect.Effect<readonly Artifact[], MatrixError, Compiler> = implementation.compileExecutableMatrix;

export const layer: (
  options?: LayerOptions,
) => Layer.Layer<Compiler, Provider.ToolNotFound | Provider.ToolProbeFailed, Provider.ProviderLayerRequirements> =
  implementation.layer;
