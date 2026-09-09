import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Tool } from "effect-build";

export class Apple extends Context.Service<Apple, { readonly tool: Tool.Resolved }>()("effect-build-apple/Apple") {}
export class InputInvalid extends Schema.TaggedError<InputInvalid>()("AppleInputInvalid", { reason: Schema.String }) {
  override get message(): string {
    return this.reason;
  }
}
export interface LayerOptions {
  readonly executable?: string | undefined;
  readonly version?: string | ((version: string) => boolean) | undefined;
}
export type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;
/** xcrun 70 is the command-line-tools baseline whose native commands are used here. */
export const supported = ">=70.0.0 <71.0.0";
/** Version checked locally; credentialed operations remain experimental. */
export const tested = "70.0.0";
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Apple, Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported, Env
> => Layer.effect(Apple, Tool.resolve({
  name: "xcrun",
  executable: options.executable,
  versionArgs: ["--version"],
  parseVersion: ({ stdout }) => {
    const major = /^xcrun version (0|[1-9]\d*)\.?\s*$/u.exec(new TextDecoder().decode(stdout).trim())?.[1];
    return major === undefined ? undefined : `${major}.0.0`;
  },
}).pipe(Tool.requireVersion(options.version ?? supported), Effect.map((tool) => ({ tool }))));
