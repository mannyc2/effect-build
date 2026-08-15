import { Context, type Effect, type Layer, type Scope } from "effect";
import type { JavaScriptBundle } from "effect-build";
import * as Provider from "effect-build/Provider";
import { definition, type Options } from "./Adapter.js";
import {
  type BunBundleError,
  type BunBundleStage,
  type JavaScriptBundleInput,
  makeService,
  type Service,
} from "./Bundle.js";

export type { Options } from "./Adapter.js";
export {
  BunBundleFailed,
  BunBundleInvalid,
  BunBundleMaterializationFailed,
  BunBundleMaterializationOperation,
  BunBundleSpawnFailed,
  BunBundleVersionMismatch,
  InvalidBundleInput,
} from "./Bundle.js";
export type { BunBundleError, BunBundleStage, JavaScriptBundleInput, Service } from "./Bundle.js";

export class Compiler extends Context.Service<
  Compiler,
  Service
>()("effect-build-bun/Compiler") {}

const implementation = Provider.define({
  name: "bun",
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

export const withJavaScriptBundle = <A, E, R>(
  input: JavaScriptBundleInput,
  use: (main: JavaScriptBundle.Artifact<readonly [BunBundleStage]>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, BunBundleError | E, Compiler | Exclude<R, Scope.Scope>> =>
  Compiler.use((service) => service.withJavaScriptBundle(input, use));

export const layer: (
  options?: LayerOptions,
) => Layer.Layer<
  Compiler,
  Provider.ToolNotFound | Provider.ToolProbeFailed,
  Provider.ProviderLayerRequirements
> = implementation.layer;
