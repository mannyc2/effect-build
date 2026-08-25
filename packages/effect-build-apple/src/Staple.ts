import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as NotaryBinding from "./internal/NotaryBinding.js";
import * as Tool from "./internal/Tool.js";
import * as Notary from "./Notary.js";

export type StapleArtifact =
  | Artifact.TreeArtifact<"app-bundle">
  | Artifact.FileArtifact<"disk-image" | "installer-package">;

export interface StapleInput<A extends StapleArtifact = StapleArtifact> {
  readonly input: A;
  readonly destination: string;
  readonly notarization: Notary.AcceptedSubmissionObservation;
}

export interface LayerOptions {
  /** Exact stapler executable path, normally obtained from `xcrun --no-cache --find stapler`. */
  readonly staplerPath: string;
  readonly dittoPath?: string;
}

export interface StapleResult<A extends StapleArtifact = StapleArtifact> extends Artifact.MutationResult<A> {
  /** Exact authenticated Accepted observation that authorized this staple operation. */
  readonly notarization: Notary.AcceptedSubmissionObservation;
}
export type StapleError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.ArtifactError
  | Notary.NotaryBindingInvalid
  | Artifact.LifecycleError
  | Artifact.ToolError;

interface Service {
  readonly staple: <A extends StapleArtifact>(input: StapleInput<A>) => Effect.Effect<StapleResult<A>, StapleError>;
}

export class Stapler extends Context.Service<Stapler, Service>()("effect-build-apple/Staple/Stapler") {}

const operation = "staple";
const supported = ["app-bundle", "disk-image", "installer-package"] as const;

const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const validate = (
  input: StapleInput,
): Effect.Effect<void, Artifact.UnsupportedArtifactKind | Notary.NotaryBindingInvalid> =>
  Effect.gen(function*() {
    if (!supported.includes(actualKind(input.input) as typeof supported[number])) {
      return yield* new Artifact.UnsupportedArtifactKind({
        operation,
        actual: actualKind(input.input),
        expected: [...supported],
      });
    }
    if (!NotaryBinding.isObservation(input.notarization) || input.notarization.status !== "Accepted") {
      return yield* new Notary.NotaryBindingInvalid({
        reason: "stapling requires an authenticated Accepted Notary observation",
      });
    }
    const subject = Artifact.reference(input.input);
    if (
      input.notarization.subject.kind !== subject.kind
      || input.notarization.subject.digest.algorithm !== subject.digest.algorithm
      || input.notarization.subject.digest.value !== subject.digest.value
    ) {
      return yield* new Notary.NotaryBindingInvalid({
        reason: "Accepted Notary observation is bound to a different artifact",
      });
    }
  });

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  Artifact.ToolError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const stapler = yield* Tool.select({ name: "stapler", path: options.staplerPath });
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const runStaple = <A extends StapleArtifact>(
      input: StapleInput<A>,
    ): Effect.Effect<StapleResult<A>, StapleError> =>
      Effect.gen(function*() {
        yield* validate(input);
        const mutate = ({ staged }: Lifecycle.MutationContext<A>) =>
          Effect.gen(function*() {
            const stapled = yield* Tool.runOrFail({ tool: stapler, args: ["staple", staged.path] });
            const validated = yield* Tool.runOrFail({ tool: stapler, args: ["validate", staged.path] });
            return [stapled, validated];
          });
        const published = yield* input.input._tag === "FileArtifact"
          ? Lifecycle.publishFileMutation({
            operation,
            input: input.input,
            destination: input.destination,
            copyTool: ditto,
            mutate: mutate as (context: Lifecycle.MutationContext<Artifact.FileArtifact>) => ReturnType<typeof mutate>,
          }) as Effect.Effect<Artifact.MutationResult<A>, StapleError>
          : Lifecycle.publishTreeMutation({
            operation,
            input: input.input,
            destination: input.destination,
            copyTool: ditto,
            mutate: mutate as (context: Lifecycle.MutationContext<Artifact.TreeArtifact>) => ReturnType<typeof mutate>,
          }) as Effect.Effect<Artifact.MutationResult<A>, StapleError>;
        return Object.freeze({ ...published, notarization: input.notarization });
      }).pipe(Effect.provide(services));

    return { staple: runStaple };
  });

export const staple = <A extends StapleArtifact>(
  input: StapleInput<A>,
): Effect.Effect<StapleResult<A>, StapleError, Stapler> => Stapler.use((service) => service.staple(input));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Stapler,
  Artifact.ToolError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Stapler, makeService(options));
