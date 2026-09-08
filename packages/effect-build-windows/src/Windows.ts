import { Context, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Artifact, Commit, Tool } from "effect-build";

export class Windows extends Context.Service<Windows, { readonly tool: Tool.Resolved }>()("effect-build-windows/Windows") {}
export class InputInvalid extends Schema.TaggedError<InputInvalid>()("WindowsInputInvalid", {
  reason: Schema.String,
}) {}
export interface LayerOptions {
  readonly executable?: string;
  /** String ranges select SDK families; predicates receive the complete native version. */
  readonly version?: string | ((version: string) => boolean);
}
type Env = FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner;
/** Windows SDK 26100 is the scripted baseline; real credentialed signing remains experimental. */
export const tested = ">=10.0.26100 <11.0.0";
const versionPattern = /^Version\s*:?\s*((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,3})\s*$/imu;
export const layer = (options: LayerOptions = {}): Layer.Layer<
  Windows, Tool.NotFound | Tool.ProbeFailed | Tool.VersionUnsupported, Env
> => {
  const version = options.version ?? tested;
  const familyMatches = typeof version === "string" ? Tool.satisfies(version) : undefined;
  // Keep the native revision in producedBy; only the range comparison uses its SDK family.
  const accepts = typeof version === "function" ? version : (native: string) => familyMatches!(native.split(".").slice(0, 3).join("."));
  return Layer.effect(Windows, Tool.resolve({
    name: "signtool",
    ...(options.executable === undefined ? {} : { executable: options.executable }),
    versionArgs: ["/?"],
    parseVersion: (completion) => versionPattern.exec(`${new TextDecoder().decode(completion.stdout)}\n${new TextDecoder().decode(completion.stderr)}`)?.[1],
  }).pipe(Tool.requireVersion(accepts), Effect.map((tool) => ({ tool }))));
};

export type Credential = {
  readonly kind: "pfx";
  readonly file: string;
  readonly password?: Redacted.Redacted<string>;
} | {
  readonly kind: "store";
  readonly thumbprint: string;
  readonly storeName?: string;
  readonly machineStore?: boolean;
};
export type SignMsixInput = Credential & {
  readonly artifact: Artifact.File;
  readonly outfile?: string;
  readonly cwd?: string;
  readonly atomic?: boolean;
  readonly timestampUrl: string;
  readonly description?: string;
  readonly descriptionUrl?: string;
};
export interface Signature {
  readonly fileDigest: "SHA256";
  readonly timestampProtocol: "RFC3161";
  readonly timestampDigest: "SHA256";
  readonly timestampUrl: string;
  readonly verification: "Authenticode";
}
export type SignedMsix = Artifact.File & { readonly signature: Signature };
export type SignMsixError = InputInvalid | Artifact.ArtifactError | Tool.Failed | Tool.SpawnFailed | Commit.CommitError;
const textValid = (value: string): boolean => value.length > 0 && !value.includes("\0");
const urlValid = (value: string, httpsOnly: boolean): boolean => {
  if (!textValid(value) || /\s/u.test(value) || value.includes("?") || value.includes("#") || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) && url.hostname.length > 0 && url.username === "" && url.password === "";
};
const scrubFailure = (password: string | undefined) => (error: Tool.Failed | Tool.SpawnFailed) => {
  const scrub = (text: string) => password === undefined || password.length === 0 ? text : text.replaceAll(password, "<redacted>");
  // Tool.Failed includes argv as well as stderr; Redacted cannot protect an unwrapped /p argument.
  return error instanceof Tool.Failed
    ? new Tool.Failed({ name: error.name, args: error.args.map(scrub), exitCode: error.exitCode, stderr: scrub(error.stderr) })
    : new Tool.SpawnFailed({ name: error.name, detail: scrub(error.detail) });
};

export const signMsix = (input: SignMsixInput): Effect.Effect<SignedMsix, SignMsixError, Windows | Env> =>
  Effect.gen(function*() {
    const output = input.outfile ?? input.artifact.path;
    if (![input.artifact.path, output].every((path) => textValid(path) && path.toLowerCase().endsWith(".msix"))) {
      return yield* new InputInvalid({ reason: "artifact and outfile must be non-empty .msix paths without NUL" });
    }
    if (!urlValid(input.timestampUrl, false) || (input.descriptionUrl !== undefined && !urlValid(input.descriptionUrl, true))) {
      return yield* new InputInvalid({ reason: "timestampUrl must be HTTP(S) and descriptionUrl HTTPS, without credentials, whitespace, query, or fragment" });
    }
    if ([input.cwd, input.description].some((value) => value !== undefined && !textValid(value))) {
      return yield* new InputInvalid({ reason: "cwd and description must be non-empty strings without NUL" });
    }
    const p = yield* Path.Path;
    const cwd = p.resolve(input.cwd ?? "");
    const outfile = p.resolve(cwd, output);
    const credential: string[] = [];
    let password: string | undefined;
    if (input.kind === "pfx") {
      if (!textValid(input.file)) return yield* new InputInvalid({ reason: "PFX file must be a non-empty path without NUL" });
      credential.push("/f", p.resolve(cwd, input.file));
      if (input.password !== undefined) {
        password = yield* Effect.try({ try: () => Redacted.value(input.password!), catch: () => new InputInvalid({ reason: "PFX password is unavailable" }) });
        if (password.includes("\0")) return yield* new InputInvalid({ reason: "PFX password must not contain NUL" });
        credential.push("/p", password);
      }
    } else {
      if (!/^[0-9a-f]{40}$/iu.test(input.thumbprint) || (input.storeName !== undefined && !textValid(input.storeName))) {
        return yield* new InputInvalid({ reason: "store credentials require a 40-digit SHA-1 thumbprint and a non-empty store name without NUL" });
      }
      if (input.machineStore === true) credential.push("/sm");
      if (input.storeName !== undefined) credential.push("/s", input.storeName);
      credential.push("/sha1", input.thumbprint);
    }
    const contents = yield* Artifact.readVerified(input.artifact);
    const { tool } = yield* Windows;
    const fs = yield* FileSystem.FileSystem;
    const produce = (out: string) => Effect.gen(function*() {
      const fileError = (error: unknown) => new Artifact.ArtifactError({ path: out, reason: "unreadable", detail: String(error) });
      yield* fs.makeDirectory(p.dirname(out), { recursive: true }).pipe(Effect.mapError(fileError));
      yield* fs.writeFile(out, contents).pipe(Effect.mapError(fileError));
      yield* Tool.run(tool, [
        "sign", "/fd", "SHA256", "/tr", input.timestampUrl, "/td", "SHA256",
        ...(input.description === undefined ? [] : ["/d", input.description]),
        ...(input.descriptionUrl === undefined ? [] : ["/du", input.descriptionUrl]),
        ...credential, out,
      ], { cwd }).pipe(Effect.mapError(scrubFailure(password)));
      yield* Tool.run(tool, ["verify", "/pa", "/all", "/v", "/tw", out], { cwd }).pipe(Effect.mapError(scrubFailure(password)));
      return yield* Artifact.file(out, Tool.producer(tool));
    });
    const artifact = yield* input.atomic === false ? produce(outfile) : Commit.atomic(outfile, produce);
    return { ...artifact, signature: {
      fileDigest: "SHA256", timestampProtocol: "RFC3161", timestampDigest: "SHA256",
      timestampUrl: input.timestampUrl, verification: "Authenticode",
    } };
  });
