import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Redacted, Schema } from "effect";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export const Credential = Schema.Union([
  Schema.TaggedStruct("Keychain", {
    profile: Schema.String,
    keychain: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("ApiKey", {
    keyFile: Schema.String,
    keyId: Schema.String,
    issuer: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("AppleId", {
    appleId: Schema.String,
    teamId: Schema.String,
    password: Schema.Redacted(Schema.String, { disallowJsonEncode: true }),
  }),
]);
export type Credential = typeof Credential.Type;

const Common = {
  credential: Credential,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optionalKey(Schema.Boolean),
  extraArgs: Schema.optionalKey(Schema.Array(Schema.String)),
};

export const SubmitInput = Schema.Struct({ ...Common, path: Schema.String });
export type SubmitInput = typeof SubmitInput.Type;
export const LookupInput = Schema.Struct({ ...Common, id: Schema.String });
export type LookupInput = typeof LookupInput.Type;
export const WaitInput = Schema.Struct({ ...LookupInput.fields, timeout: Schema.optionalKey(Schema.String) });
export type WaitInput = typeof WaitInput.Type;

export const Submission = Schema.Struct({
  id: Schema.String,
  message: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});
export type Submission = typeof Submission.Type;

/** Native status is returned unchanged; the caller chooses its release policy. */
export const Status = Schema.Struct({
  ...Submission.fields,
  status: Schema.String,
  name: Schema.optionalKey(Schema.String),
  createdDate: Schema.optionalKey(Schema.String),
});
export type Status = typeof Status.Type;

const credentials = (
  credential: Credential,
): { readonly args: ReadonlyArray<string>; readonly redact: ReadonlyArray<Redacted.Redacted<string>> } => {
  switch (credential._tag) {
    case "Keychain":
      return {
        args: [
          "--keychain-profile",
          credential.profile,
          ...(credential.keychain === undefined ? [] : ["--keychain", credential.keychain]),
        ],
        redact: [],
      };
    case "ApiKey":
      return {
        args: [
          "--key",
          credential.keyFile,
          "--key-id",
          credential.keyId,
          ...(credential.issuer === undefined ? [] : ["--issuer", credential.issuer]),
        ],
        redact: [],
      };
    case "AppleId":
      // notarytool supports native password flags, not altool's environment references.
      return {
        args: [
          "--apple-id",
          credential.appleId,
          "--team-id",
          credential.teamId,
          "--password",
          Redacted.value(credential.password),
        ],
        redact: [credential.password],
      };
  }
};

export interface Options {
  /** Explicit native notarytool path. Otherwise xcrun is resolved once. */
  readonly executable?: string | undefined;
}

export class Notarytool extends Context.Service<Notarytool>()("effect-build-apple/Notarytool", {
  make: Effect.fn("Notarytool.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make(options.executable === undefined ? "xcrun" : "notarytool", options);
    const prefix = options.executable === undefined ? ["notarytool"] : [];
    const json = Effect.fnUntraced(
      function*(input: SubmitInput | LookupInput, args: ReadonlyArray<string>, outputFormat: boolean = true) {
        const credential = credentials(input.credential);
        const output = yield* tool.run(
          ChildProcess.make(tool.executable, [
            ...prefix,
            ...args,
            ...(input.extraArgs ?? []),
            ...credential.args,
            ...(outputFormat ? ["--output-format", "json"] : []),
          ], { cwd: input.cwd, env: input.env, extendEnv: input.extendEnv, stdin: "ignore" }),
          tool.text({ maxBytes: 1024 * 1024 }),
          {
            redact: credential.redact,
          },
        );
        return output;
      },
    );
    return {
      /** Uploads once and returns the native submission ID/status without waiting. */
      submit: Effect.fn("Notarytool.submit")(function*(input: SubmitInput) {
        return yield* tool.decode(Schema.fromJsonString(Submission))(yield* json(input, ["submit", input.path]));
      }),
      wait: Effect.fn("Notarytool.wait")(function*(input: WaitInput) {
        return yield* tool.decode(Schema.fromJsonString(Status))(
          yield* json(input, [
            "wait",
            input.id,
            ...(input.timeout === undefined ? [] : ["--timeout", input.timeout]),
          ]),
        );
      }),
      info: Effect.fn("Notarytool.info")(function*(input: LookupInput) {
        return yield* tool.decode(Schema.fromJsonString(Status))(yield* json(input, ["info", input.id]));
      }),
      /** Keeps the native JSON log structure, including every issue. */
      log: Effect.fn("Notarytool.log")(function*(input: LookupInput) {
        return yield* tool.decode(Schema.fromJsonString(Schema.Json))(yield* json(input, ["log", input.id], false));
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
