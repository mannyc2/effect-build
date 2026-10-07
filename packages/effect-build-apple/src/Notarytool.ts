import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Redacted, Schema } from "effect";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export type Credential =
  | {
    readonly _tag: "Keychain";
    readonly profile: string;
    readonly keychain?: string | undefined;
  }
  | {
    readonly _tag: "ApiKey";
    readonly keyFile: string;
    readonly keyId: string;
    readonly issuer?: string | undefined;
  }
  | {
    readonly _tag: "AppleId";
    readonly appleId: string;
    readonly teamId: string;
    readonly password: Redacted.Redacted<string>;
  };

interface Common {
  readonly credential: Credential;
  readonly cwd?: string | undefined;
  /** `Redacted` values are revealed only into the command and removed from failure diagnostics. */
  readonly env?: Environment.Variables | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
}

export interface SubmitInput extends Common {
  readonly path: string;
}
export interface LookupInput extends Common {
  readonly id: string;
}
export interface WaitInput extends LookupInput {
  readonly timeout?: string | undefined;
}

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
  readonly mapCommand?: Tool.Options["mapCommand"];
}

export class Notarytool extends Context.Service<Notarytool>()("effect-build-apple/Notarytool", {
  make: Effect.fn("Notarytool.make")(function*(options: Options = {}) {
    // Errors name notarytool even when it runs through xcrun.
    const xcrun = options.executable === undefined ? yield* Tool.make("xcrun", options) : undefined;
    const tool = yield* Tool.make("notarytool", { ...options, executable: xcrun?.executable ?? options.executable });
    const prefix = xcrun === undefined ? [] : ["notarytool"];
    // `owned` follows the caller's extraArgs and credentials, so they cannot override it.
    const notarytool = (
      input: SubmitInput | LookupInput,
      args: ReadonlyArray<string>,
      owned: ReadonlyArray<string>,
    ) => {
      const credential = credentials(input.credential);
      const { env, redact } = Environment.reveal(input.env);
      return tool.run(
        ChildProcess.make(tool.executable, [
          ...prefix,
          ...args,
          ...(input.extraArgs ?? []),
          ...credential.args,
          ...owned,
        ], { cwd: input.cwd, env, extendEnv: input.extendEnv, stdin: "ignore" }),
        tool.text({ maxBytes: 1024 * 1024 }),
        { redact: [...credential.redact, ...redact] },
      );
    };
    const report = (input: SubmitInput | LookupInput, args: ReadonlyArray<string>) =>
      notarytool(input, args, ["--output-format", "json"]);
    return {
      /** Uploads once and returns the native submission ID/status without waiting. */
      submit: Effect.fn("Notarytool.submit")(function*(input: SubmitInput) {
        return yield* tool.decode(Schema.fromJsonString(Submission))(yield* report(input, ["submit", input.path]));
      }),
      wait: Effect.fn("Notarytool.wait")(function*(input: WaitInput) {
        return yield* tool.decode(Schema.fromJsonString(Status))(
          yield* report(input, [
            "wait",
            input.id,
            ...(input.timeout === undefined ? [] : ["--timeout", input.timeout]),
          ]),
        );
      }),
      info: Effect.fn("Notarytool.info")(function*(input: LookupInput) {
        return yield* tool.decode(Schema.fromJsonString(Status))(yield* report(input, ["info", input.id]));
      }),
      /** Keeps the native JSON log structure, including every issue. The log is JSON without a format flag. */
      log: Effect.fn("Notarytool.log")(function*(input: LookupInput) {
        return yield* tool.decode(Schema.fromJsonString(Schema.Json))(yield* notarytool(input, ["log", input.id], []));
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
