import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Redacted, Schema, Sink } from "effect";
import { ChildProcess } from "effect/process";
import * as Tool from "effect-build/Tool";

export const Credential = Schema.Union([
  Schema.TaggedStruct("Pfx", {
    file: Schema.String,
    password: Schema.optionalKey(Schema.Redacted(Schema.String, { disallowJsonEncode: true })),
  }),
  Schema.TaggedStruct("Store", {
    thumbprint: Schema.String,
    name: Schema.optionalKey(Schema.String),
    machine: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.TaggedStruct("TrustedSigning", {
    library: Schema.String,
    metadata: Schema.String,
    /** Secrets consumed by the native signing library, such as Azure identity credentials. */
    env: Schema.optionalKey(Schema.Record(Schema.String, Schema.Redacted(Schema.String, { disallowJsonEncode: true }))),
  }),
]);
export type Credential = typeof Credential.Type;

const Common = {
  path: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
};
export const SignInput = Schema.Struct({
  ...Common,
  credential: Credential,
  timestampUrl: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});
export type SignInput = typeof SignInput.Type;
export const VerifyInput = Schema.Struct(Common);
export type VerifyInput = typeof VerifyInput.Type;

const credentials = (credential: Credential): {
  readonly args: ReadonlyArray<string>;
  readonly redact: ReadonlyArray<Redacted.Redacted<string>>;
  readonly env?: Record<string, string> | undefined;
} => {
  switch (credential._tag) {
    case "Pfx":
      return {
        args: ["/f", credential.file, ...(credential.password === undefined ? [] : ["/p", Redacted.value(credential.password)])],
        redact: credential.password === undefined ? [] : [credential.password],
      };
    case "Store":
      return {
        args: [
          ...(credential.machine === true ? ["/sm"] : []),
          ...(credential.name === undefined ? [] : ["/s", credential.name]), "/sha1", credential.thumbprint,
        ],
        redact: [],
      };
    case "TrustedSigning":
      return {
        args: ["/dlib", credential.library, "/dmdf", credential.metadata],
        redact: Object.values(credential.env ?? {}),
        env: credential.env === undefined ? undefined : Object.fromEntries(
          Object.entries(credential.env).map(([name, value]) => [name, Redacted.value(value)]),
        ),
      };
  }
};

export interface Options {
  readonly executable?: string | undefined;
}

export class SignTool extends Context.Service<SignTool>()("effect-build-windows/SignTool", {
  make: Effect.fn("SignTool.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("signtool", options);
    const path = yield* Path.Path;
    return {
      /** Signs a native file in place. Timestamping and verification are caller choices. */
      sign: Effect.fn("SignTool.sign")(function*(input: SignInput) {
        const credential = credentials(input.credential);
        const destination = path.resolve(input.cwd ?? ".", input.path);
        yield* tool.run(ChildProcess.make(tool.executable, [
          "sign", ...(input.extraArgs ?? []), "/fd", "SHA256",
          ...(input.timestampUrl === undefined ? [] : ["/tr", input.timestampUrl, "/td", "SHA256"]),
          ...(input.description === undefined ? [] : ["/d", input.description]),
          ...credential.args, destination,
        ], {
          cwd: input.cwd,
          env: credential.env === undefined ? input.env : { ...input.env, ...credential.env },
          extendEnv: credential.env === undefined ? input.extendEnv : (input.extendEnv ?? true),
          stdin: "ignore",
        }), Sink.drain, {
          redact: credential.redact,
        });
        return destination;
      }),
      verify: Effect.fn("SignTool.verify")(function*(input: VerifyInput) {
        yield* tool.run(ChildProcess.make(tool.executable, [
          "verify", ...(input.extraArgs ?? []), "/pa", "/all", path.resolve(input.cwd ?? ".", input.path),
        ], { cwd: input.cwd, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" }), Sink.drain);
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
