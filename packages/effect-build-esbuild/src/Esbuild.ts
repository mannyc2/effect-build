import { Crypto, Effect, FileSystem, Path, Schema, type Scope } from "effect";
import { Artifact, Commit } from "effect-build";
import * as esbuild from "esbuild";
import metadata from "../package.json" with { type: "json" };

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("EsbuildInputInvalid", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}
/** The peer range: the consumer's own esbuild runs in process; nothing is selected from PATH. */
export const supported = metadata.peerDependencies.esbuild;
/** The version the workspace installs for tests. */
export const tested = metadata.devDependencies.esbuild;

const messages = (cause: unknown, key: "errors" | "warnings"): readonly esbuild.Message[] => {
  const value: unknown = typeof cause === "object" && cause !== null ? Reflect.get(cause, key) : undefined;
  return Array.isArray(value) ? value as readonly esbuild.Message[] : [];
};

/** Diagnostics retain the arrays and original exception supplied by esbuild. */
export class EsbuildFailed extends Schema.TaggedError<EsbuildFailed>()("EsbuildFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  get errors(): readonly esbuild.Message[] { return messages(this.cause, "errors"); }
  get warnings(): readonly esbuild.Message[] { return messages(this.cause, "warnings"); }
  override get message(): string {
    return `esbuild ${this.operation} failed${this.errors[0] === undefined ? "" : `: ${this.errors[0].text}`}`;
  }
}

const invoke = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, EsbuildFailed> =>
  Effect.tryPromise({ try: run, catch: (cause) => new EsbuildFailed({ operation, cause }) });

/** esbuild.build has no cancellation handle; interruption stops awaiting its native result. */
export const build = <const Input extends esbuild.BuildOptions>(
  input: Input,
): Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed> =>
  invoke("build", () => esbuild.build(input as esbuild.BuildOptions) as Promise<esbuild.BuildResult<Input>>);

export interface Context<Input extends esbuild.BuildOptions = esbuild.BuildOptions> {
  readonly rebuild: Effect.Effect<esbuild.BuildResult<Input>, EsbuildFailed>;
  readonly watch: (options?: esbuild.WatchOptions) => Effect.Effect<void, EsbuildFailed>;
  readonly serve: (options?: esbuild.ServeOptions) => Effect.Effect<esbuild.ServeResult, EsbuildFailed>;
  readonly cancel: Effect.Effect<void, EsbuildFailed>;
}

export const context = <const Input extends esbuild.BuildOptions>(
  input: Input,
): Effect.Effect<Context<Input>, EsbuildFailed, Scope.Scope> => Effect.acquireRelease(
  invoke("context", () => esbuild.context(input as esbuild.BuildOptions) as Promise<esbuild.BuildContext<Input>>),
  (native) => Effect.promise(() => native.cancel()).pipe(Effect.ensuring(Effect.promise(() => native.dispose()))),
).pipe(
  Effect.map((native) => ({
    rebuild: invoke("rebuild", () => native.rebuild()),
    watch: (options) => invoke("watch", () => native.watch(options)),
    serve: (options) => invoke("serve", () => native.serve(options)),
    cancel: invoke("cancel", () => native.cancel()),
  } satisfies Context<Input>)),
);

export type DirectoryOptions = Omit<esbuild.BuildOptions, "outdir" | "outfile" | "write"> & Commit.ProducerOptions & {
  readonly outdir: string;
  readonly outfile?: never;
  readonly write?: never;
};

export const buildToDirectory = Effect.fn("Esbuild.buildToDirectory")((input: DirectoryOptions): Effect.Effect<
  Artifact.Directory,
  InputInvalid | EsbuildFailed | Artifact.ArtifactError | Commit.CommitError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> => Effect.gen(function*() {
  if (typeof input.outdir !== "string" || input.outdir.length === 0 || input.outfile !== undefined || input.write !== undefined) {
    return yield* new InputInvalid({ reason: "buildToDirectory requires outdir and does not accept outfile or write" });
  }
  const p = yield* Path.Path;
  // esbuild rejects unknown options, so the commit choices leave before the native call.
  const { outdir, atomic, onExists, prefix, ...options } = input;
  const destination = p.resolve(input.absWorkingDir ?? "", outdir);
  const produce = (out: string) => Effect.scoped(Effect.gen(function*() {
    // A scoped rebuild cancels writing before failed or interrupted staging is removed.
    const builder = yield* context({ ...options, outdir: out, write: true });
    yield* builder.rebuild;
    return yield* Artifact.directory(out, { name: "esbuild", version: esbuild.version });
  }));
  return yield* Commit.output(destination, produce, { atomic, onExists, prefix }, "sibling");
}));

export const transform = (input: string | Uint8Array, options?: esbuild.TransformOptions): Effect.Effect<
  esbuild.TransformResult,
  EsbuildFailed
> => invoke("transform", () => esbuild.transform(input, options));

export const analyzeMetafile = (input: esbuild.Metafile | string, options?: esbuild.AnalyzeMetafileOptions): Effect.Effect<
  string,
  EsbuildFailed
> => invoke("analyzeMetafile", () => esbuild.analyzeMetafile(input, options));
