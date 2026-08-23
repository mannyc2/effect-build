import { Cause, Effect, FileSystem, Path, Scope } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleInputInvalid,
  type Artifact,
  ArtifactChanged,
  type ArtifactError,
  ArtifactPublishFailed,
  type ArtifactServices,
  type FileArtifact,
  type FileArtifactKind,
  type MutationResult,
  observeFile,
  observeTree,
  reference,
  revalidate,
  sameIdentity,
  type ToolError,
  type ToolInvocation,
  type TreeArtifact,
  type TreeArtifactKind,
} from "../Artifact.js";
import * as Tool from "./Tool.js";

export type LifecycleError =
  | ArtifactError
  | AppleInputInvalid
  | ArtifactPublishFailed
  | ToolError;

export type LifecycleServices = ArtifactServices | ChildProcessSpawner.ChildProcessSpawner;

export interface CopiedArtifact<A extends Artifact = Artifact> {
  readonly artifact: A;
  readonly tools: readonly ToolInvocation[];
}

export interface CopyAuthenticatedOptions<A extends Artifact> {
  readonly input: A;
  readonly copyTool: Tool.SelectedTool;
  readonly directory?: string | undefined;
}

export interface ConstructContext {
  readonly stagedPath: string;
  readonly inputs: readonly Artifact[];
}

export interface MutationContext<A extends Artifact> {
  readonly staged: A;
  readonly supportingInputs: readonly Artifact[];
}

export interface ConstructedOptions<K extends ArtifactKindForStorage, E, R> {
  readonly operation: string;
  readonly inputs: readonly Artifact[];
  readonly destination: string;
  readonly kind: K;
  readonly copyTool: Tool.SelectedTool;
  readonly produce: (context: ConstructContext) => Effect.Effect<readonly ToolInvocation[], E, R>;
}

export interface MutationOptions<A extends Artifact, E, R> {
  readonly operation: string;
  readonly input: A;
  readonly supportingInputs?: readonly Artifact[] | undefined;
  readonly destination: string;
  readonly copyTool: Tool.SelectedTool;
  readonly mutate: (context: MutationContext<A>) => Effect.Effect<readonly ToolInvocation[], E, R>;
}

export type ArtifactKindForStorage = FileArtifactKind | TreeArtifactKind;

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);
const mapPublishFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  destination: string,
  action: string,
): Effect.Effect<A, ArtifactPublishFailed, R> =>
  Effect.catchCause(
    effect,
    (cause) =>
      Effect.failCause(
        Cause.map(
          cause,
          (error) => new ArtifactPublishFailed({ destination, reason: `${action}: ${describe(error)}` }),
        ),
      ),
  );

const destination = (
  requested: string,
): Effect.Effect<string, ArtifactPublishFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = path.normalize(path.resolve(requested));
    const parent = path.dirname(absolute);
    yield* mapPublishFailure(fileSystem.makeDirectory(parent, { recursive: true }), absolute, "make parent");
    const canonicalParent = yield* mapPublishFailure(fileSystem.realPath(parent), absolute, "resolve parent");
    const resolved = path.join(path.normalize(canonicalParent), path.basename(absolute));
    if (yield* mapPublishFailure(fileSystem.exists(resolved), resolved, "inspect destination")) {
      return yield* new ArtifactPublishFailed({ destination: resolved, reason: "destination already exists" });
    }
    return resolved;
  });

const observeLike = <A extends Artifact>(
  input: A,
  path: string,
): Effect.Effect<A, ArtifactError | AppleInputInvalid, ArtifactServices> =>
  (input._tag === "FileArtifact"
    ? observeFile(input.kind, path)
    : observeTree(input.kind, path)) as Effect.Effect<A, ArtifactError | AppleInputInvalid, ArtifactServices>;

const copyTo = <A extends Artifact>(
  input: A,
  target: string,
  copyTool: Tool.SelectedTool,
): Effect.Effect<CopiedArtifact<A>, LifecycleError, LifecycleServices> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    if (yield* mapPublishFailure(fileSystem.exists(target), target, "inspect copy destination")) {
      return yield* new ArtifactPublishFailed({ destination: target, reason: "copy destination already exists" });
    }
    yield* revalidate(input);
    const invocation = yield* Tool.runOrFail({
      tool: copyTool,
      args: ["--rsrc", "--extattr", "--acl", input.path, target],
    });
    const copied = yield* observeLike(input, target);
    if (!sameIdentity(input, copied)) {
      return yield* new ArtifactChanged({
        path: input.path,
        expected: JSON.stringify(input.identity),
        observed: JSON.stringify(copied.identity),
      });
    }
    yield* revalidate(input);
    return { artifact: copied, tools: [invocation] };
  });

export const copyAuthenticatedScoped = <A extends Artifact>(
  options: CopyAuthenticatedOptions<A>,
): Effect.Effect<CopiedArtifact<A>, LifecycleError, LifecycleServices | Scope.Scope> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staging = yield* fileSystem.makeTempDirectoryScoped({
      ...(options.directory === undefined ? {} : { directory: options.directory }),
      prefix: ".effect-build-apple-copy-",
    }).pipe(Effect.mapError((error) =>
      new ArtifactPublishFailed({ destination: options.directory ?? "<temporary>", reason: describe(error) })
    ));
    return yield* copyTo(options.input, path.join(staging, path.basename(options.input.path)), options.copyTool);
  });

const copyInputs = (
  inputs: readonly Artifact[],
  root: string,
  copyTool: Tool.SelectedTool,
): Effect.Effect<
  { readonly artifacts: readonly Artifact[]; readonly tools: readonly ToolInvocation[] },
  LifecycleError,
  LifecycleServices
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const artifacts: Artifact[] = [];
    const tools: ToolInvocation[] = [];
    for (let index = 0; index < inputs.length; index++) {
      const parent = path.join(root, String(index));
      yield* mapPublishFailure(fileSystem.makeDirectory(parent, { recursive: true }), parent, "make input staging");
      const copied = yield* copyTo(inputs[index]!, path.join(parent, path.basename(inputs[index]!.path)), copyTool);
      artifacts.push(copied.artifact);
      tools.push(...copied.tools);
    }
    return { artifacts, tools };
  });

const commit = <A extends Artifact>(
  staged: A,
  target: string,
): Effect.Effect<A, LifecycleError, ArtifactServices> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    if (yield* mapPublishFailure(fileSystem.exists(target), target, "inspect commit destination")) {
      return yield* new ArtifactPublishFailed({ destination: target, reason: "destination appeared before commit" });
    }
    yield* mapPublishFailure(fileSystem.rename(staged.path, target), target, "commit rename");
    const committed = yield* observeLike(staged, target);
    if (!sameIdentity(staged, committed)) {
      return yield* new ArtifactChanged({
        path: target,
        expected: JSON.stringify(staged.identity),
        observed: JSON.stringify(committed.identity),
      });
    }
    return committed;
  });

const publishConstructed = <A extends Artifact, E, R>(
  options: ConstructedOptions<ArtifactKindForStorage, E, R>,
  observe: (path: string) => Effect.Effect<A, ArtifactError | AppleInputInvalid, ArtifactServices>,
): Effect.Effect<MutationResult<A>, LifecycleError | E, LifecycleServices | R> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      for (const input of options.inputs) yield* revalidate(input);
      const target = yield* destination(options.destination);
      const staging = yield* mapPublishFailure(
        fileSystem.makeTempDirectoryScoped({ directory: path.dirname(target), prefix: ".effect-build-apple-" }),
        target,
        "make staging",
      );
      const copied = yield* copyInputs(options.inputs, path.join(staging, "inputs"), options.copyTool);
      const stagedPath = path.join(staging, path.basename(target));
      const producedTools = yield* options.produce({ stagedPath, inputs: copied.artifacts });
      for (const input of options.inputs) yield* revalidate(input);
      const staged = yield* observe(stagedPath);
      const committed = yield* commit(staged, target);
      return {
        artifact: committed,
        provenance: {
          operation: options.operation,
          inputs: options.inputs.map(reference),
          output: reference(committed),
          tools: [...copied.tools, ...producedTools],
        },
      };
    }),
  );

export const publishConstructedFile = <K extends FileArtifactKind, E, R>(
  options: ConstructedOptions<K, E, R>,
): Effect.Effect<MutationResult<FileArtifact<K>>, LifecycleError | E, LifecycleServices | R> =>
  publishConstructed(options, (path) => observeFile(options.kind, path));

export const publishConstructedTree = <K extends TreeArtifactKind, E, R>(
  options: ConstructedOptions<K, E, R>,
): Effect.Effect<MutationResult<TreeArtifact<K>>, LifecycleError | E, LifecycleServices | R> =>
  publishConstructed(options, (path) => observeTree(options.kind, path));

const publishMutation = <A extends Artifact, E, R>(
  options: MutationOptions<A, E, R>,
): Effect.Effect<MutationResult<A>, LifecycleError | E, LifecycleServices | R> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const support = options.supportingInputs ?? [];
      yield* revalidate(options.input);
      for (const input of support) yield* revalidate(input);
      const target = yield* destination(options.destination);
      const staging = yield* mapPublishFailure(
        fileSystem.makeTempDirectoryScoped({ directory: path.dirname(target), prefix: ".effect-build-apple-" }),
        target,
        "make staging",
      );
      const stagedCopy = yield* copyTo(
        options.input,
        path.join(staging, path.basename(target)),
        options.copyTool,
      );
      const copiedSupport = yield* copyInputs(support, path.join(staging, "inputs"), options.copyTool);
      const operationTools = yield* options.mutate({
        staged: stagedCopy.artifact,
        supportingInputs: copiedSupport.artifacts,
      });
      yield* revalidate(options.input);
      for (const input of support) yield* revalidate(input);
      const observed = yield* observeLike(options.input, stagedCopy.artifact.path);
      const committed = yield* commit(observed, target);
      return {
        artifact: committed,
        provenance: {
          operation: options.operation,
          inputs: [options.input, ...support].map(reference),
          output: reference(committed),
          tools: [...stagedCopy.tools, ...copiedSupport.tools, ...operationTools],
        },
      };
    }),
  );

export const publishFileMutation = <K extends FileArtifactKind, E, R>(
  options: MutationOptions<FileArtifact<K>, E, R>,
): Effect.Effect<MutationResult<FileArtifact<K>>, LifecycleError | E, LifecycleServices | R> =>
  publishMutation(options);

export const publishTreeMutation = <K extends TreeArtifactKind, E, R>(
  options: MutationOptions<TreeArtifact<K>, E, R>,
): Effect.Effect<MutationResult<TreeArtifact<K>>, LifecycleError | E, LifecycleServices | R> =>
  publishMutation(options);
