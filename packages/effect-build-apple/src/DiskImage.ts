import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

export interface CreateInput {
  readonly app: Artifact.TreeArtifact<"app-bundle">;
  /** Destination ending in `.dmg`, resolved against the current working directory. */
  readonly outfile: string;
  readonly volumeName: string;
}

export interface LayerOptions {
  readonly dittoPath?: string;
  readonly hdiutilPath?: string;
}

export type CreateResult = Artifact.MutationResult<Artifact.FileArtifact<"disk-image">>;
export type CreateError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.AppleInputInvalid
  | Artifact.ArtifactError
  | Artifact.LifecycleError
  | Artifact.ToolError;

interface Service {
  readonly create: (input: CreateInput) => Effect.Effect<CreateResult, CreateError>;
}

export class Creator extends Context.Service<Creator, Service>()("effect-build-apple/DiskImage/Creator") {}

const operation = "disk-image.create";
const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

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
  if (!input.outfile.endsWith(".dmg")) {
    return Effect.fail(
      new Artifact.AppleInputInvalid({ operation, field: "outfile", reason: "must end in .dmg" }),
    );
  }
  if (input.volumeName.length === 0 || containsControlCharacter(input.volumeName)) {
    return Effect.fail(
      new Artifact.AppleInputInvalid({
        operation,
        field: "volumeName",
        reason: input.volumeName.length === 0 ? "must not be empty" : "contains an unsupported control character",
      }),
    );
  }
  return Effect.void;
};

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
    const hdiutil = yield* Tool.select({ name: "hdiutil", path: options.hdiutilPath ?? "/usr/bin/hdiutil" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const create = Effect.fn("effect-build-apple/DiskImage.create")(function*(input: CreateInput) {
      yield* validateInput(input);
      return yield* Lifecycle.publishConstructedFile({
        operation,
        inputs: [input.app],
        destination: input.outfile,
        kind: "disk-image",
        copyTool: ditto,
        produce: ({ inputs: snapshots, stagedPath }) =>
          Effect.gen(function*() {
            const app = snapshots[0]!;
            const created = yield* Tool.runOrFail({
              tool: hdiutil,
              args: [
                "create",
                "-srcfolder",
                path.dirname(app.path),
                "-volname",
                input.volumeName,
                "-format",
                "UDZO",
                stagedPath,
              ],
            });
            const verified = yield* Tool.runOrFail({ tool: hdiutil, args: ["verify", stagedPath] });
            return [created, verified];
          }),
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
