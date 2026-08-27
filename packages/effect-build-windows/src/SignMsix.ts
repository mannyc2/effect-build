import { Context, Crypto, Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import { PublishFailed, ToolFailed } from "effect-build/BuildError";
import type { ArtifactVerificationFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";

const HttpsUrl = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (/\s/.test(value) || value.includes("?") || value.includes("#")) {
        return "URL contains whitespace, a query, or a fragment";
      }
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:"
            && parsed.hostname.length > 0
            && parsed.username === ""
            && parsed.password === ""
          ? undefined
          : "URL is not a credential-free absolute HTTPS authority";
      } catch {
        return "URL cannot be parsed as an absolute HTTPS URL";
      }
    },
    { expected: "a parsed credential-free absolute HTTPS URL with no query, fragment, or whitespace" },
  ),
);

/** Closed SHA-1 certificate thumbprint used for exact certificate-store selection. */
export const CertificateThumbprint = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{40}$/i, { expected: "a 40-character SHA-1 certificate thumbprint" }),
);
export type CertificateThumbprint = typeof CertificateThumbprint.Type;

/** Unsigned MSIX source, final destination, and the required RFC 3161 authority. */
export class SignMsixInput extends Schema.Class<SignMsixInput>(
  "effect-build-windows/SignMsixInput",
)({
  source: Artifact.FinalizedFile,
  outfile: Schema.NonEmptyString,
  timestampUrl: HttpsUrl,
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  description: Schema.optionalKey(Schema.NonEmptyString),
  descriptionUrl: Schema.optionalKey(HttpsUrl),
}) {}

/** Signing input failed the durable public schema at the operation boundary. */
export class SignMsixInputRejected extends Schema.TaggedError<SignMsixInputRejected>()(
  "SignMsixInputRejected",
  { reason: Schema.NonEmptyString },
) {
  override get message(): string {
    return `SignTool input rejected: ${this.reason}`;
  }
}

/** Native SignTool certificate-store coordinates; the thumbprint is exact. */
export class CertificateStoreOptions extends Schema.Class<CertificateStoreOptions>(
  "effect-build-windows/CertificateStoreOptions",
)({
  thumbprint: CertificateThumbprint,
  storeName: Schema.optionalKey(Schema.NonEmptyString),
  machineStore: Schema.optionalKey(Schema.Boolean),
}) {}

export interface PfxOptions {
  readonly file: string;
  /** Omit only for an intentionally passwordless local PFX. */
  readonly password?: Redacted.Redacted<string>;
}

/** Public, schema-checkable projection of the fixed signing policy. */
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
  readonly redact: (text: string) => string;
}

interface CredentialService {
  readonly arguments: Effect.Effect<CredentialArguments>;
}

/** Process-local signing identity. No signing operation returns this service. */
export class SigningCredential extends Context.Service<SigningCredential, CredentialService>()(
  "effect-build-windows/SignMsix/SigningCredential",
) {}

const redactValues = (values: readonly string[]) => (text: string): string =>
  values.reduce(
    (redacted, value) => value.length === 0 ? redacted : redacted.split(value).join("<redacted>"),
    text,
  );

/** Process-local PFX backend. Secret material is held in `Redacted` and scrubbed from failures. */
export const pfxCredentialLayer = (options: PfxOptions): Layer.Layer<SigningCredential> =>
  Layer.succeed(SigningCredential, {
    arguments: Effect.sync(() => {
      if (options.password === undefined) {
        return { args: ["/f", options.file], redact: redactValues([options.file]) };
      }
      const password = Redacted.value(options.password);
      return {
        args: ["/f", options.file, "/p", password],
        redact: redactValues([options.file, password]),
      };
    }),
  });

/** Exact Windows certificate-store backend selected by SHA-1 thumbprint. */
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
      redact: redactValues([
        options.thumbprint,
        ...(options.storeName === undefined ? [] : [options.storeName]),
      ]),
    }),
  });

export interface LayerOptions {
  /** Explicit SignTool executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

export type SignMsixError = ArtifactVerificationFailed | ToolFailed | PublishFailed | SignMsixInputRejected;

interface Service {
  readonly signMsix: (input: SignMsixInput) => Effect.Effect<Artifact.FileArtifact, SignMsixError>;
}

export class Signer extends Context.Service<Signer, Service>()(
  "effect-build-windows/SignMsix/Signer",
) {}

/** Windows SDK SignTool versions exercised by this integration; others warn once. */
const tested: Toolchain.TestedRange = { minimum: "10.0.19041.0", before: "11.0.0" };

const parseSignToolVersion = (stdout: string): string | undefined =>
  /^Version\s*:?\s*([0-9]+(?:\.[0-9]+){2,3})\s*$/mi.exec(stdout)?.[1];

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const scrubFailure = (error: ToolFailed, redact: (text: string) => string): ToolFailed =>
  new ToolFailed({
    tool: error.tool,
    exitCode: error.exitCode,
    stdout: redact(error.stdout),
    stderr: redact(error.stderr),
  });

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

const verifyArgv = (stagedPath: string): readonly string[] => [
  "verify",
  "/pa",
  "/all",
  "/v",
  "/tw",
  stagedPath,
];

type LayerError = ToolNotFound | ToolFailed;

const makeService = (
  options?: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | SigningCredential
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const credentialService = yield* SigningCredential;
    const credential = yield* credentialService.arguments;
    const executable = yield* Toolchain.resolveExecutable({ name: "signtool", executable: options?.executable });
    const version = yield* Toolchain.probeVersion({
      tool: "signtool",
      executable,
      args: ["/?"],
      parse: parseSignToolVersion,
    });
    yield* Toolchain.warnIfUntested({ tool: "signtool", version, tested });
    const tool: Artifact.Tool = { name: "signtool", version };
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const runScrubbed = (args: readonly string[], cwd: string | undefined) =>
      Toolchain.runOrFail({ tool: "signtool", executable, args, cwd }).pipe(
        Effect.mapError((error) => scrubFailure(error, credential.redact)),
      );

    const signMsix = Effect.fn("effect-build-windows.signMsix")(
      function*(candidate: SignMsixInput) {
        const input = yield* Schema.decodeUnknownEffect(SignMsixInput, { onExcessProperty: "error" })(candidate).pipe(
          Effect.mapError(() =>
            new SignMsixInputRejected({ reason: "input does not satisfy the closed SignMsixInput schema" })
          ),
        );
        if (!input.source.path.toLowerCase().endsWith(".msix") || !input.outfile.toLowerCase().endsWith(".msix")) {
          return yield* Effect.fail(
            new SignMsixInputRejected({ reason: "source and output must both use the .msix extension" }),
          );
        }
        return yield* Toolchain.publishFile({
          tool,
          outfile: input.outfile,
          cwd: input.cwd,
          produce: (stagedPath) =>
            Effect.gen(function*() {
              const unsigned = yield* Toolchain.readVerifiedFile(input.source);
              yield* fileSystem.writeFile(stagedPath, unsigned).pipe(
                Effect.mapError((error) =>
                  new PublishFailed({
                    destination: path.resolve(input.cwd ?? "", input.outfile),
                    reason: `copy unsigned MSIX: ${describe(error)}`,
                  })
                ),
              );
              yield* runScrubbed(signArgv(input, credential, stagedPath), input.cwd);
              yield* runScrubbed(verifyArgv(stagedPath), input.cwd);
            }),
        });
      },
    );

    return { signMsix: (input) => signMsix(input).pipe(Effect.provide(services)) };
  });

export const signMsix = (
  input: SignMsixInput,
): Effect.Effect<Artifact.FileArtifact, SignMsixError, Signer> => Signer.use((service) => service.signMsix(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Signer,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | SigningCredential
> => Layer.effect(Signer, makeService(options));
