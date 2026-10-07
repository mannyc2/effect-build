import type { Config } from "effect";
import { Config as C, Context, Effect, Layer, Path, Redacted, Sink } from "effect";
import * as Environment from "effect-build/Environment";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

export type Credential =
  | {
    readonly _tag: "Pfx";
    readonly file: string;
    readonly password?: Redacted.Redacted<string> | undefined;
  }
  | {
    readonly _tag: "Store";
    readonly thumbprint: string;
    readonly name?: string | undefined;
    readonly machine?: boolean | undefined;
  }
  | {
    readonly _tag: "TrustedSigning";
    readonly library: string;
    readonly metadata: string;
    /** Secrets consumed by the native signing library, such as Azure identity credentials. */
    readonly env?: Readonly<Record<string, Redacted.Redacted<string>>> | undefined;
  };

interface Common {
  readonly path: string;
  readonly cwd?: string | undefined;
  /** `Redacted` values are revealed only into the command and removed from failure diagnostics. */
  readonly env?: Environment.Variables | undefined;
  readonly extendEnv?: boolean | undefined;
  readonly extraArgs?: ReadonlyArray<string> | undefined;
}
export interface SignInput extends Common {
  readonly credential: Credential;
  readonly timestampUrl?: string | undefined;
  readonly description?: string | undefined;
}
export type VerifyInput = Common;

const credentials = (credential: Credential): {
  readonly args: ReadonlyArray<string>;
  readonly redact: ReadonlyArray<Redacted.Redacted<string>>;
  readonly env?: Record<string, string> | undefined;
} => {
  switch (credential._tag) {
    case "Pfx":
      return {
        args: [
          "/f",
          credential.file,
          ...(credential.password === undefined ? [] : ["/p", Redacted.value(credential.password)]),
        ],
        redact: credential.password === undefined ? [] : [credential.password],
      };
    case "Store":
      return {
        args: [
          ...(credential.machine === true ? ["/sm"] : []),
          ...(credential.name === undefined ? [] : ["/s", credential.name]),
          "/sha1",
          credential.thumbprint,
        ],
        redact: [],
      };
    case "TrustedSigning": {
      const { env, redact } = Environment.reveal(credential.env);
      return { args: ["/dlib", credential.library, "/dmdf", credential.metadata], redact, env };
    }
  }
};

export interface Options {
  readonly executable?: string | undefined;
  readonly mapCommand?: Tool.Options["mapCommand"];
}

export class SignTool extends Context.Service<SignTool>()("effect-build-windows/SignTool", {
  make: Effect.fn("SignTool.make")(function*(options: Options = {}) {
    const tool = yield* Tool.make("signtool", options);
    const path = yield* Path.Path;
    return {
      /** Signs a native file in place. Timestamping and verification are caller choices. */
      sign: Effect.fn("SignTool.sign")(function*(input: SignInput) {
        const credential = credentials(input.credential);
        const { env, redact } = Environment.reveal(input.env);
        const destination = path.resolve(input.cwd ?? ".", input.path);
        yield* tool.run(
          ChildProcess.make(tool.executable, [
            "sign",
            ...(input.extraArgs ?? []),
            "/fd",
            "SHA256",
            ...(input.timestampUrl === undefined ? [] : ["/tr", input.timestampUrl, "/td", "SHA256"]),
            ...(input.description === undefined ? [] : ["/d", input.description]),
            ...credential.args,
            destination,
          ], {
            cwd: input.cwd,
            // Credential variables join the caller's choice: the inherited environment unless `env` replaces it.
            env: credential.env === undefined ? env : { ...env, ...credential.env },
            extendEnv: credential.env !== undefined && env === undefined ? true : input.extendEnv,
            stdin: "ignore",
          }),
          Sink.drain,
          { redact: [...credential.redact, ...redact] },
        );
        return destination;
      }),
      verify: Effect.fn("SignTool.verify")(function*(input: VerifyInput) {
        const { env, redact } = Environment.reveal(input.env);
        yield* tool.run(
          ChildProcess.make(tool.executable, [
            "verify",
            ...(input.extraArgs ?? []),
            "/pa",
            "/all",
            path.resolve(input.cwd ?? ".", input.path),
          ], { cwd: input.cwd, env, extendEnv: input.extendEnv, stdin: "ignore" }),
          Sink.drain,
          { redact },
        );
      }),
    };
  }),
}) {
  static readonly layer = (options?: Options) => Layer.effect(this, this.make(options));
  static readonly layerConfig = (options: Config.Wrap<Options>) =>
    Layer.effect(this, Effect.flatMap(C.unwrap(options), (values) => this.make(values)));
}
