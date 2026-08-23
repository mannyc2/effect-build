import { Context as EffectContext, type Crypto, Effect, type FileSystem, Layer, type Path } from "effect";
import * as esbuild from "esbuild";
import {
  type Admission,
  evaluateAdmission,
  type IdentityIncomplete,
  type InstalledEvidence,
  type InvalidOptions,
  invalidOptions,
  operationCoordinate,
  type PreflightRefusal,
  type ProviderBuildFailure,
  providerBuildFailure,
  type ToolProbeFailed,
} from "./internal/compatibility.js";
import { observeInstalled } from "./internal/installed.js";

export interface LayerOptions {
  readonly allowUntestedVersion?: boolean;
}

/** Native esbuild options with the frozen in-memory refinement; `write` must be the literal `false`. */
export type Options = esbuild.BuildOptions & { readonly write: false };

export type BuildInput = Options;

/** The native in-memory result; output-file hashes stay esbuild-opaque values. */
export type Artifact<Input extends Options = Options> = esbuild.BuildResult<Input>;

export type BuildError =
  | InvalidOptions<"build">
  | ProviderBuildFailure<"build">
  | PreflightRefusal;

interface Service {
  readonly build: <const Input extends Options>(
    input: Input,
  ) => Effect.Effect<esbuild.BuildResult<Input>, BuildError>;
}

export class Esbuild extends EffectContext.Service<Esbuild, Service>()("effect-build-esbuild/Build/Esbuild") {}

const operation = operationCoordinate("build-memory");

const hasExplicitWriteFalse = (input: unknown): boolean =>
  typeof input === "object" && input !== null && !Array.isArray(input)
  && (input as { readonly write?: unknown }).write === false;

const admit = (
  evidence: InstalledEvidence,
  allowUntestedVersion: boolean,
): Effect.Effect<Admission, PreflightRefusal> => {
  const outcome = evaluateAdmission({ operation, evidence, allowUntestedVersion });
  if (outcome._tag === "Refused") return Effect.fail(outcome.refusal);
  if (outcome.admission._tag === "UntestedOverride") {
    return Effect.logWarning(
      `${outcome.admission.warningCode}: effect-build-esbuild build-memory proceeds on unreviewed coordinates`,
    ).pipe(Effect.as(outcome.admission));
  }
  return Effect.succeed(outcome.admission);
};

const makeService = (options?: LayerOptions): Effect.Effect<
  Service,
  IdentityIncomplete | ToolProbeFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const allowUntestedVersion = options?.allowUntestedVersion === true;
    const evidence = yield* observeInstalled(operation, import.meta.url);
    const build: Service["build"] = <const Input extends Options>(input: Input) =>
      Effect.gen(function*() {
        if (!hasExplicitWriteFalse(input)) return yield* Effect.fail(invalidOptions("build"));
        yield* admit(evidence, allowUntestedVersion);
        return yield* Effect.tryPromise({
          try: () => esbuild.build(input as Options) as Promise<esbuild.BuildResult<Input>>,
          catch: (error) => providerBuildFailure("build", error),
        });
      });
    return { build };
  });

export const build = <const Input extends Options>(
  input: Input,
): Effect.Effect<esbuild.BuildResult<Input>, BuildError, Esbuild> => Esbuild.use((service) => service.build(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Esbuild,
  IdentityIncomplete | ToolProbeFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.effect(Esbuild, makeService(options));
