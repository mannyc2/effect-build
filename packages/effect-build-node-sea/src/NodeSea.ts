import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Executable, Tool } from "effect-build";
import { Buffer } from "node:buffer";
import { inject } from "postject";

export class InputInvalid extends Schema.TaggedError<InputInvalid>()("NodeSeaInputInvalid", {
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}
/** postject rejections are not always Error instances; a message getter must still render them. */
const describe = (cause: unknown): string => {
  const message: unknown = typeof cause === "object" && cause !== null ? Reflect.get(cause, "message") : undefined;
  if (typeof message === "string" && message.length > 0) return message;
  try {
    return String(cause);
  } catch {
    return Object.prototype.toString.call(cause);
  }
};
export class Failed extends Schema.TaggedError<Failed>()("NodeSeaFailed", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return `${this.operation} failed: ${describe(this.cause)}`;
  }
}

export class NodeSea extends Context.Service<NodeSea, {
  readonly builder: Tool.Resolved;
  readonly base: Tool.Resolved;
}>()("effect-build-node-sea/NodeSea") {}
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly baseExecutable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
type Env = Fs | ChildProcessSpawner.ChildProcessSpawner;
/** Node 22–26 share the SEA preparation blob and resource injection workflow. */
export const supported = ">=22.0.0 <27.0.0";
/** Exact versions exercised by real-tool CI. */
export const tested = "22.0.0 || 26.7.0";
const resolveNode = (executable: string, version: NonNullable<LayerOptions["version"]>) => Tool.resolve({
  name: "node",
  executable,
  parseVersion: (completion) => new TextDecoder().decode(completion.stdout).trim().replace(/^v/u, ""),
}).pipe(Tool.requireVersion(version));
export const layer = (options: LayerOptions = {}): Layer.Layer<
  NodeSea,
  InputInvalid | Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported,
  Env
> => Layer.effect(NodeSea, Effect.gen(function*() {
  const builder = yield* resolveNode(options.executable ?? process.execPath, options.version ?? supported);
  const base = options.baseExecutable === undefined ? builder : yield* resolveNode(options.baseExecutable, options.version ?? supported);
  // Node's preparation blob must be consumed by the same Node version.
  if (builder.version !== base.version) {
    return yield* new InputInvalid({ reason: `builder ${builder.version} and base ${base.version} must have the same Node version` });
  }
  return { builder, base };
}));

export interface Input extends Commit.ProducerOptions {
  /** One bundled CommonJS script. Its require() can load Node built-ins. */
  readonly main: Artifact.Regular;
  readonly assets?: Readonly<Record<string, Artifact.Regular>> | undefined;
  readonly outfile: string;
  readonly cwd?: string | undefined;
  readonly disableExperimentalSEAWarning?: boolean | undefined;
}
export type AssembleError =
  | InputInvalid | Failed | Tool.NotFound | Tool.ProbeFailed | Tool.Failed | Tool.SpawnFailed
  | Artifact.ArtifactError | Executable.InspectError | Executable.TargetMismatch | Commit.CommitError;
const fileError = (path: string) => (error: unknown) =>
  new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });

export const assemble = Effect.fn("NodeSea.assemble")((input: Input): Effect.Effect<Artifact.Executable, AssembleError, NodeSea | Env> =>
  Effect.scoped(Effect.gen(function*() {
    if (input.outfile.length === 0 || input.outfile.includes("\0")) {
      return yield* new InputInvalid({ reason: "outfile must be a non-empty path without NUL" });
    }
    const { builder, base } = yield* NodeSea;
    // The output is the base with one resource added, so its target is the base's; the host may be running it under emulation.
    const facts = yield* Executable.inspect(base.path);
    const target = yield* Executable.resolveTarget(base.path, facts);
    if (facts.os === "windows" && !input.outfile.toLowerCase().endsWith(".exe")) {
      return yield* new InputInvalid({ reason: "Windows outfile must end in .exe" });
    }
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, input.outfile);
    // Inputs and the blob always live separately, including when atomic output is disabled.
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-sea-" }).pipe(Effect.mapError(fileError(outfile)));
    const main = p.join(temporary, "main.cjs");
    yield* Artifact.copyVerified(input.main, main);
    yield* Tool.run(builder, ["--check", main], { cwd });
    const assets: [string, string][] = [];
    for (const [key, artifact] of Object.entries(input.assets ?? {})) {
      const path = p.join(temporary, `asset-${assets.length}`);
      yield* Artifact.copyVerified(artifact, path);
      assets.push([key, path]);
    }
    const blob = p.join(temporary, "sea.blob");
    const config = p.join(temporary, "sea-config.json");
    yield* fs.writeFileString(config, JSON.stringify({
      main,
      output: blob,
      assets: Object.fromEntries(assets),
      disableExperimentalSEAWarning: input.disableExperimentalSEAWarning ?? false,
      useSnapshot: false,
      useCodeCache: false,
    })).pipe(Effect.mapError(fileError(config)));
    yield* Tool.run(builder, ["--experimental-sea-config", config], { cwd });
    const contents = yield* fs.readFile(blob).pipe(Effect.mapError(fileError(blob)));
    const signing = facts.format === "mach-o" ? yield* Tool.resolve({
      name: "xcrun",
      parseVersion: (completion) => {
        const major = /^xcrun version (\d+)\./u.exec(new TextDecoder().decode(completion.stdout))?.[1];
        return major === undefined ? undefined : `${major}.0.0`;
      },
    }) : undefined;
    const produce = (out: string) => Effect.gen(function*() {
      yield* fs.copyFile(base.path, out).pipe(Effect.mapError(fileError(out)));
      if (signing !== undefined) yield* Tool.run(signing, ["codesign", "--remove-signature", out]);
      // postject cannot cancel: finish its writes before a scope removes temporary output.
      yield* Effect.uninterruptible(Effect.tryPromise({
        try: () => inject(out, "NODE_SEA_BLOB", Buffer.from(contents), {
          sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
          machoSegmentName: "NODE_SEA",
        }),
        catch: (cause) => new Failed({ operation: "inject", cause }),
      }));
      yield* fs.chmod(out, 0o755).pipe(Effect.mapError(fileError(out)));
      if (signing !== undefined) yield* Tool.run(signing, ["codesign", "--sign", "-", out]);
      return yield* Artifact.executable(out, Tool.producer(builder), target);
    });
    return yield* Commit.output(outfile, produce, input);
  })));
