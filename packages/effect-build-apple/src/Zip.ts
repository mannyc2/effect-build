import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

export interface CreateInput {
  readonly app: Artifact.TreeArtifact<"app-bundle">;
  /** Destination ending in `.zip`, resolved against the current working directory. */
  readonly outfile: string;
}

export interface LayerOptions {
  readonly dittoPath?: string;
}

export type CreateResult = Artifact.MutationResult<Artifact.FileArtifact<"zip">>;
export type CreateError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.AppleInputInvalid
  | Artifact.ArtifactChanged
  | Artifact.ArtifactPublishFailed
  | Artifact.ArtifactError
  | Artifact.LifecycleError
  | Artifact.ToolError;

interface Service {
  readonly create: (input: CreateInput) => Effect.Effect<CreateResult, CreateError>;
}

export class Creator extends Context.Service<Creator, Service>()("effect-build-apple/Zip/Creator") {}

const operation = "zip.create";

const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const validateInput = (
  input: CreateInput,
): Effect.Effect<void, Artifact.UnsupportedArtifactKind | Artifact.AppleInputInvalid> => {
  if (!Artifact.isTreeArtifact(input.app) || !Artifact.isKind(input.app, "app-bundle")) {
    return Effect.fail(
      new Artifact.UnsupportedArtifactKind({
        operation,
        expected: ["app-bundle tree"],
        actual: actualKind(input.app),
      }),
    );
  }
  if (!input.outfile.endsWith(".zip")) {
    return Effect.fail(
      new Artifact.AppleInputInvalid({ operation, field: "outfile", reason: "must end in .zip" }),
    );
  }
  return Effect.void;
};

const fsFailure = (destination: string, action: string, error: unknown): Artifact.ArtifactPublishFailed =>
  new Artifact.ArtifactPublishFailed({
    destination,
    reason: `${action}: ${error instanceof Error ? error.message : String(error)}`,
  });

const makeService = (
  options: LayerOptions = {},
): Effect.Effect<
  Service,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const create = Effect.fn("effect-build-apple/Zip.create")(function*(input: CreateInput) {
      yield* validateInput(input);
      return yield* Lifecycle.publishConstructedFile({
        operation,
        inputs: [input.app],
        destination: input.outfile,
        kind: "zip",
        copyTool: ditto,
        produce: ({ inputs: snapshots, stagedPath }) =>
          Effect.scoped(
            Effect.gen(function*() {
              const app = snapshots[0]!;
              const created = yield* Tool.runOrFail({
                tool: ditto,
                args: ["-c", "-k", "--keepParent", app.path, stagedPath],
              });
              const extractionRoot = yield* fileSystem.makeTempDirectoryScoped({
                prefix: ".effect-build-apple-zip-verify-",
              }).pipe(
                Effect.mapError((error) => fsFailure(stagedPath, "create ZIP verification directory", error)),
              );
              const extracted = yield* Tool.runOrFail({
                tool: ditto,
                args: ["-x", "-k", stagedPath, extractionRoot],
              });
              const extractedApp = yield* Artifact.observeTree(
                "app-bundle",
                path.join(extractionRoot, path.basename(app.path)),
              );
              if (extractedApp.identity.digest.value !== app.identity.digest.value) {
                return yield* Effect.fail(
                  new Artifact.ArtifactChanged({
                    path: extractedApp.path,
                    expected: app.identity.digest.value,
                    observed: extractedApp.identity.digest.value,
                  }),
                );
              }
              return [created, extracted];
            }),
          ),
      });
    });

    return { create: (input) => create(input).pipe(Effect.provide(services)) };
  });

export const create = (input: CreateInput): Effect.Effect<CreateResult, CreateError, Creator> =>
  Creator.use((service) => service.create(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Creator,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Creator, makeService(options));
