import { Context, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import { ChildProcessSpawner } from "effect/unstable/process";
import { make as makeRuntime, SignToolChanged, SignToolFailed, SignToolUnavailable } from "./internal/Runtime.js";

export { SignToolChanged, SignToolFailed, SignToolUnavailable } from "./internal/Runtime.js";

const HttpsUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    if (/\s/u.test(value) || value.includes("?") || value.includes("#")) {
      return "URL contains whitespace, a query, or a fragment";
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.hostname.length > 0 && parsed.username === ""
          && parsed.password === ""
        ? undefined
        : "URL is not a credential-free absolute HTTPS authority";
    } catch {
      return "URL cannot be parsed as an absolute HTTPS URL";
    }
  }),
);

const TimestampUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    if (/\s/u.test(value) || value.includes("?") || value.includes("#")) {
      return "URL contains whitespace, a query, or a fragment";
    }
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:")
          && parsed.hostname.length > 0 && parsed.username === "" && parsed.password === ""
        ? undefined
        : "URL is not a credential-free absolute HTTP(S) timestamp authority";
    } catch {
      return "URL cannot be parsed as an absolute HTTP(S) timestamp URL";
    }
  }),
);

export const CertificateThumbprint = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{40}$/i, { expected: "a 40-character SHA-1 certificate thumbprint" }),
);
export type CertificateThumbprint = typeof CertificateThumbprint.Type;

export class SignMsixInput extends Schema.Class<SignMsixInput>("effect-build-windows/SignMsixInput")({
  source: Artifact.HashedFileSchema,
  outfile: Schema.NonEmptyString,
  timestampUrl: TimestampUrl,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  description: Schema.optionalKey(Schema.NonEmptyString),
  descriptionUrl: Schema.optionalKey(HttpsUrl),
}) {}

export class SignMsixInputRejected extends Schema.TaggedError<SignMsixInputRejected>()(
  "SignMsixInputRejected",
  { reason: Schema.NonEmptyString },
) {}

export class MsixStagingFailed extends Schema.TaggedError<MsixStagingFailed>()(
  "MsixStagingFailed",
  { path: Schema.String, reason: Schema.String },
) {}

export class CertificateStoreOptions extends Schema.Class<CertificateStoreOptions>(
  "effect-build-windows/CertificateStoreOptions",
)({
  thumbprint: CertificateThumbprint,
  storeName: Schema.optionalKey(Schema.NonEmptyString),
  machineStore: Schema.optionalKey(Schema.Boolean),
}) {}

export interface PfxOptions {
  readonly file: string;
  readonly password?: Redacted.Redacted<string>;
}

export class AuthenticodePolicy extends Schema.Class<AuthenticodePolicy>(
  "effect-build-windows/AuthenticodePolicy",
)({
  fileDigest: Schema.Literal("SHA256"),
  timestampProtocol: Schema.Literal("RFC3161"),
  timestampDigest: Schema.Literal("SHA256"),
  verificationPolicy: Schema.Literal("Authenticode"),
}) {}

export const policy = new AuthenticodePolicy({
  fileDigest: "SHA256",
  timestampProtocol: "RFC3161",
  timestampDigest: "SHA256",
  verificationPolicy: "Authenticode",
});

interface CredentialArguments {
  readonly args: readonly string[];
  readonly sensitiveValues: readonly string[];
}

interface CredentialService {
  readonly arguments: Effect.Effect<CredentialArguments>;
}

export class SigningCredential extends Context.Service<SigningCredential, CredentialService>()(
  "effect-build-windows/SignMsix/SigningCredential",
) {}

export const pfxCredentialLayer = (options: PfxOptions): Layer.Layer<SigningCredential> =>
  Layer.succeed(SigningCredential, {
    arguments: Effect.sync(() => {
      if (options.password === undefined) {
        return { args: ["/f", options.file], sensitiveValues: [options.file] };
      }
      const password = Redacted.value(options.password);
      return {
        args: ["/f", options.file, "/p", password],
        sensitiveValues: [options.file, password],
      };
    }),
  });

export const certificateStoreCredentialLayer = (
  options: CertificateStoreOptions,
): Layer.Layer<SigningCredential> =>
  Layer.succeed(SigningCredential, {
    arguments: Effect.succeed({
      args: [
        ...(options.machineStore === true ? ["/sm"] : []),
        ...(options.storeName === undefined ? [] : ["/s", options.storeName]),
        "/sha1",
        options.thumbprint,
      ],
      sensitiveValues: [options.thumbprint, ...(options.storeName === undefined ? [] : [options.storeName])],
    }),
  });

export interface LayerOptions {
  readonly executable?: string;
  readonly version?: string;
}

export type SignMsixError =
  | SignMsixInputRejected
  | MsixStagingFailed
  | SignToolChanged
  | SignToolFailed
  | File.FileVerificationFailed
  | File.PublicationFailure;

interface Service {
  readonly signMsix: (input: SignMsixInput) => Effect.Effect<Artifact.HashedFile, SignMsixError>;
}

export class Signer extends Context.Service<Signer, Service>()("effect-build-windows/SignMsix/Signer") {}

const signArgv = (
  input: SignMsixInput,
  credential: CredentialArguments,
  stagedPath: string,
): readonly string[] => [
  "sign",
  "/fd",
  "SHA256",
  "/tr",
  input.timestampUrl,
  "/td",
  "SHA256",
  ...(input.description === undefined ? [] : ["/d", input.description]),
  ...(input.descriptionUrl === undefined ? [] : ["/du", input.descriptionUrl]),
  ...credential.args,
  stagedPath,
];

const verifyArgv = (stagedPath: string): readonly string[] => ["verify", "/pa", "/all", "/v", "/tw", stagedPath];

type LayerError = SignToolUnavailable | SignToolFailed;

const makeService = (
  options?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | SigningCredential
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const credentialService = yield* SigningCredential;
    const runtime = yield* makeRuntime(options);
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const signMsix = Effect.fn("effect-build-windows.signMsix")(function*(candidate: SignMsixInput) {
      const input = yield* Schema.decodeUnknownEffect(SignMsixInput, { onExcessProperty: "error" })(candidate).pipe(
        Effect.mapError(() =>
          new SignMsixInputRejected({ reason: "input does not satisfy the closed SignMsixInput schema" })
        ),
      );
      if (!input.source.path.toLowerCase().endsWith(".msix") || !input.outfile.toLowerCase().endsWith(".msix")) {
        return yield* new SignMsixInputRejected({ reason: "source and output must both use the .msix extension" });
      }
      return yield* File.withVerifiedBytes(input.source, (unsigned) =>
        File.publish(
          {
            destination: input.outfile,
            ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
            observation: "hashed",
            provenance: runtime.tool,
          },
          (stagedPath) =>
            Effect.gen(function*() {
              yield* fileSystem.writeFile(stagedPath, unsigned).pipe(
                Effect.mapError((error) => new MsixStagingFailed({ path: stagedPath, reason: String(error) })),
              );
              const credential = yield* credentialService.arguments;
              yield* runtime.run(signArgv(input, credential, stagedPath), {
                ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
                redact: credential.sensitiveValues,
              });
              yield* runtime.run(verifyArgv(stagedPath), input.cwd === undefined ? undefined : { cwd: input.cwd });
            }),
        ));
    });

    return { signMsix: (input) => signMsix(input).pipe(Effect.provide(services)) };
  });

export const signMsix = (
  input: SignMsixInput,
): Effect.Effect<Artifact.HashedFile, SignMsixError, Signer> => Signer.use((service) => service.signMsix(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Signer,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | SigningCredential
> => Layer.effect(Signer, makeService(options));
