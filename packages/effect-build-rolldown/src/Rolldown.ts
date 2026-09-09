import { Crypto, Effect, FileSystem, Path, type Scope } from "effect";
import { Artifact, Commit } from "effect-build";
import * as rolldown from "rolldown";
import { transform as nativeTransform, type TransformOptions, type TransformResult, type TsconfigCache } from "rolldown/utils";
import metadata from "../package.json" with { type: "json" };
import { Failed, InputInvalid } from "./Error.js";

export { Failed, InputInvalid } from "./Error.js";
export type { TransformOptions, TransformResult, TsconfigCache } from "rolldown/utils";
export { watch, type WatchEvent } from "./Watch.js";

/** Tests exercise the pinned npm dependency; Rolldown is not selected from PATH. */
export const tested = metadata.dependencies.rolldown;
const invoke = <A>(operation: string, run: () => Promise<A>): Effect.Effect<A, Failed> =>
  Effect.tryPromise({ try: run, catch: (cause) => new Failed({ operation, cause }) });

/** Native build options retain their write behavior; use write: false for memory output. */
export function build(options: rolldown.BuildOptions): Effect.Effect<rolldown.RolldownOutput, Failed>;
export function build(options: rolldown.BuildOptions[]): Effect.Effect<rolldown.RolldownOutput[], Failed>;
export function build(options: rolldown.BuildOptions | rolldown.BuildOptions[]): Effect.Effect<rolldown.RolldownOutput | rolldown.RolldownOutput[], Failed> {
  return invoke<rolldown.RolldownOutput | rolldown.RolldownOutput[]>("build", () =>
    Array.isArray(options) ? rolldown.build(options) : rolldown.build(options));
}

export interface Build {
  readonly generate: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, Failed>;
  readonly write: (output?: rolldown.OutputOptions) => Effect.Effect<rolldown.RolldownOutput, Failed>;
}

export const make = (input: rolldown.InputOptions): Effect.Effect<Build, Failed, Scope.Scope> => Effect.gen(function*() {
  let closing = false;
  const active = new Set<Promise<unknown>>();
  const native = yield* Effect.acquireRelease(
    invoke("make", () => rolldown.rolldown(input)),
    (native) => Effect.promise(async () => {
      closing = true;
      // Native close does not wait for active generate/write calls to finish.
      await Promise.allSettled(active);
      await native.close();
    }),
  );
  const run = <A>(operation: string, body: () => Promise<A>) => invoke(operation, () => {
    if (closing) throw new Error("the scoped Rolldown build is closing");
    const result = body();
    active.add(result);
    void result.then(() => active.delete(result), () => active.delete(result));
    return result;
  });
  return {
    generate: (output) => run("generate", () => native.generate(output)),
    write: (output) => run("write", () => native.write(output)),
  } satisfies Build;
});

export type DirectoryOptions = rolldown.InputOptions & Commit.ProducerOptions & {
  readonly outdir: string;
  readonly output?: Omit<rolldown.OutputOptions, "dir" | "file"> & { readonly dir?: never; readonly file?: never } | undefined;
};
export const buildToDirectory = Effect.fn("Rolldown.buildToDirectory")((input: DirectoryOptions): Effect.Effect<
  Artifact.Directory,
  Failed | InputInvalid | Artifact.ArtifactError | Commit.CommitError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> => Effect.gen(function*() {
  if (input.outdir.length === 0 || input.output?.dir !== undefined || input.output?.file !== undefined) {
    return yield* new InputInvalid({ reason: "buildToDirectory requires outdir and does not accept output.dir or output.file" });
  }
  const p = yield* Path.Path;
  // Rolldown validates its input keys, so the commit choices leave before the native call.
  const { outdir, output, atomic, onExists, prefix, ...options } = input;
  const destination = p.resolve(options.cwd ?? "", outdir);
  const produce = (out: string) => Effect.gen(function*() {
    yield* Effect.scoped(Effect.flatMap(make(options), (builder) => builder.write({ ...output, dir: out })));
    // closeBundle hooks finish before the directory's final bytes are recorded.
    return yield* Artifact.directory(out, { name: "rolldown", version: rolldown.VERSION });
  });
  return yield* Commit.output(destination, produce, { atomic, onExists, prefix }, "sibling");
}));

export const transform = (
  filename: string,
  sourceText: string,
  options?: TransformOptions | null,
  cache?: TsconfigCache | null,
): Effect.Effect<TransformResult, Failed> => invoke("transform", () => nativeTransform(filename, sourceText, options, cache));
