import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { ToolFailed } from "effect-build/BuildError";
import type { PublishFailed, ToolNotFound } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  capturePlatformServices,
  describe,
  resolveAppleTool,
  scrub,
  scrubToolFailure,
  verifyFileArtifact,
} from "./internal.js";
import {
  captureBundle,
  captureBundlePath,
  identityEquals,
  makeBundleRemovable,
  materializeBundle,
} from "./internal/BundleIdentity.js";
import {
  AppleToolFact,
  Architecture,
  BundleInspectionFailed,
  FileArtifactIdentityMismatch,
  hasDeveloperIdApplicationSignature,
  hasDeveloperIdDiskImageSignature,
  hasDeveloperIdInstallerSignature,
  ProductKind,
  ProductStateInvalid,
  Sha256,
} from "./Model.js";
import type {
  AppleToolOptions,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
} from "./Model.js";

export { FileArtifactIdentityMismatch as ArtifactIdentityMismatch } from "./Model.js";

/** Apple accepts UDIF images, signed flat installers, and ZIP archives, not raw `.app` directories. */
export const SubmissionKind = Schema.Literals(["dmg", "pkg", "zip"] as const);
export type SubmissionKind = typeof SubmissionKind.Type;

/** Canonical lowercase Apple submission UUID. */
export const SubmissionId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    { expected: "a lowercase UUID submission identifier" },
  ),
);
export type SubmissionId = typeof SubmissionId.Type;

/** Submission exists but has not reached an Apple terminal state. */
export class Pending extends Schema.TaggedClass<Pending>()("Pending", {
  providerStatus: Schema.NonEmptyString,
}) {}

/** Apple accepted the exact submitted bytes. */
export class Accepted extends Schema.TaggedClass<Accepted>()("Accepted", {
  providerStatus: Schema.Literal("Accepted"),
}) {}

/** Apple reached a negative terminal state (`Invalid` or `Rejected`). */
export class Rejected extends Schema.TaggedClass<Rejected>()("Rejected", {
  providerStatus: Schema.NonEmptyString,
  summary: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export const Status = Schema.Union([Pending, Accepted, Rejected]);
export type Status = typeof Status.Type;

export interface SubmitDiskImageInput {
  readonly kind: "dmg";
  readonly artifact: DeveloperIdDiskImage;
}

export interface SubmitInstallerPackageInput {
  readonly kind: "pkg";
  readonly artifact: DeveloperIdInstallerPackage;
}

/** Closed public file-submission family; app ZIP transports are created only by `submitApp`. */
export type SubmitInput = SubmitDiskImageInput | SubmitInstallerPackageInput;

interface PreparedSubmissionInput {
  readonly kind: SubmissionKind;
  readonly artifact: Artifact.FileArtifact;
  readonly architecture: Architecture;
}

/** Signed `.app` bundle to package into, verify from, and submit as an Apple ZIP transport. */
export interface SubmitAppInput {
  readonly bundle: DeveloperIdApplicationBundle;
}

/** Exact local product identity to which an accepted Apple ticket may be stapled. */
export class StapleTarget extends Schema.Class<StapleTarget>(
  "effect-build-apple/StapleTarget",
)({
  kind: ProductKind,
  identityKind: Schema.Literals(["file-bytes", "bundle-manifest"] as const),
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  bundleName: Schema.optionalKey(Schema.NonEmptyString),
}) {}

/** Durable identity required to resume on a fresh runner. */
export class SubmissionReference extends Schema.Class<SubmissionReference>(
  "effect-build-apple/SubmissionReference",
)({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  submissionTool: AppleToolFact,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(AppleToolFact),
}) {}

/** Credential-free provider-native result suitable for the release journal. */
export class Submission extends Schema.Class<Submission>("effect-build-apple/Submission")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
  submissionTool: AppleToolFact,
  tool: AppleToolFact,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(AppleToolFact),
}) {}

/** Credential-free status observation correlated to the recorded submission ID. */
export class Observation extends Schema.Class<Observation>("effect-build-apple/Observation")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
  name: Schema.optionalKey(Schema.NonEmptyString),
  createdDate: Schema.optionalKey(Schema.NonEmptyString),
  submissionTool: AppleToolFact,
  tool: AppleToolFact,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(AppleToolFact),
}) {}

/** Typed issue projection from Apple's notarization log. */
export class LogIssue extends Schema.Class<LogIssue>("effect-build-apple/LogIssue")({
  severity: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  path: Schema.optionalKey(Schema.NonEmptyString),
  code: Schema.optionalKey(Schema.String),
  docUrl: Schema.optionalKey(Schema.NonEmptyString),
}) {}

/** Credential-free notarization log correlated to the same durable reference. */
export class Log extends Schema.Class<Log>("effect-build-apple/Log")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  status: Status,
  statusSummary: Schema.optionalKey(Schema.NonEmptyString),
  statusCode: Schema.optionalKey(Schema.Number),
  archiveFilename: Schema.optionalKey(Schema.NonEmptyString),
  issues: Schema.Array(LogIssue),
  submissionTool: AppleToolFact,
  tool: AppleToolFact,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(AppleToolFact),
}) {}

/** Any provider result carrying the exact submission identity and a notarization status. */
export type Result = Submission | Observation | Log;

/** Durable proof that Apple accepted one exact submitted file identity. */
export class AcceptedReference extends Schema.Class<AcceptedReference>(
  "effect-build-apple/AcceptedReference",
)({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  providerStatus: Schema.Literal("Accepted"),
  submissionTool: AppleToolFact,
  tool: AppleToolFact,
  stapleTarget: StapleTarget,
  transportTool: Schema.optionalKey(AppleToolFact),
}) {}

/** A pending or rejected result cannot authorize stapling. */
export class ResultNotAccepted extends Schema.TaggedError<ResultNotAccepted>()(
  "NotaryResultNotAccepted",
  {
    submissionId: SubmissionId,
    providerStatus: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `Apple notarization ${this.submissionId} is ${this.providerStatus}, not Accepted`;
  }
}

/** Accepted generic ZIP submissions do not prove a staplable product identity. */
export class ResultHasNoStapleTarget extends Schema.TaggedError<ResultHasNoStapleTarget>()(
  "NotaryResultHasNoStapleTarget",
  { submissionId: SubmissionId },
) {
  override get message(): string {
    return `Apple notarization ${this.submissionId} has no verified stapling target`;
  }
}

/** Narrow a provider result into the only evidence type accepted by the stapling boundary. */
export const acceptedReference = (
  result: Result,
): Effect.Effect<AcceptedReference, ResultNotAccepted | ResultHasNoStapleTarget> => {
  if (result.status._tag !== "Accepted") {
    return Effect.fail(
      new ResultNotAccepted({
        submissionId: result.submissionId,
        providerStatus: result.status.providerStatus,
      }),
    );
  }
  if (result.stapleTarget === undefined) {
    return Effect.fail(new ResultHasNoStapleTarget({ submissionId: result.submissionId }));
  }
  return Effect.succeed(
    new AcceptedReference({
      submissionId: result.submissionId,
      kind: result.kind,
      architecture: result.architecture,
      artifactBytes: result.artifactBytes,
      artifactSha256: result.artifactSha256,
      providerStatus: "Accepted",
      submissionTool: result.submissionTool,
      tool: result.tool,
      stapleTarget: result.stapleTarget,
      ...(result.transportTool === undefined ? {} : { transportTool: result.transportTool }),
    }),
  );
};

/** The command may have committed remotely but no submission ID was recovered. Never blind-retry. */
export class SubmissionOutcomeUnknown extends Schema.TaggedError<SubmissionOutcomeUnknown>()(
  "SubmissionOutcomeUnknown",
  {
    artifactSha256: Sha256,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `Apple submission outcome is unknown for ${this.artifactSha256}: ${this.reason}`;
  }
}

/** Local private snapshot preparation failed before any Apple submission was dispatched. */
export class SubmissionPreparationFailed extends Schema.TaggedError<SubmissionPreparationFailed>()(
  "SubmissionPreparationFailed",
  {
    path: Schema.NonEmptyString,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `could not prepare notarization input ${this.path}: ${this.reason}`;
  }
}

/** Apple returned JSON that cannot be interpreted as the requested operation. */
export class ResponseInvalid extends Schema.TaggedError<ResponseInvalid>()(
  "NotaryResponseInvalid",
  {
    operation: Schema.Literals(["submit", "info", "log"] as const),
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `invalid notarytool ${this.operation} response: ${this.reason}`;
  }
}

/** Apple returned a different job identity than the one requested on this runner. */
export class CorrelationFailed extends Schema.TaggedError<CorrelationFailed>()(
  "NotaryCorrelationFailed",
  {
    operation: Schema.Literals(["info", "log"] as const),
    expectedSubmissionId: Schema.NonEmptyString,
    observedSubmissionId: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `notarytool ${this.operation} returned ${this.observedSubmissionId}; expected ${this.expectedSubmissionId}`;
  }
}

interface CredentialArguments {
  readonly args: readonly string[];
  readonly sensitiveValues: readonly string[];
}

interface CredentialService {
  readonly arguments: Effect.Effect<CredentialArguments>;
}

/** Process-local Apple notary credential coordinates. No operation returns this service. */
export class Credential extends Context.Service<Credential, CredentialService>()(
  "effect-build-apple/Notary/Credential",
) {}

export interface KeychainProfileOptions {
  readonly profile: string;
  readonly keychain?: string | undefined;
}

/** A pre-created notarytool keychain profile; secret values remain in the keychain. */
export const keychainProfileCredentialLayer = (
  options: KeychainProfileOptions,
): Layer.Layer<Credential> =>
  Layer.succeed(Credential, {
    arguments: Effect.succeed({
      args: [
        "--keychain-profile",
        options.profile,
        ...(options.keychain === undefined ? [] : ["--keychain", options.keychain]),
      ],
      sensitiveValues: [options.profile, ...(options.keychain === undefined ? [] : [options.keychain])],
    }),
  });

export interface ApiKeyOptions {
  readonly keyFile: string;
  readonly keyId: string;
  readonly issuer: string;
}

/** App Store Connect API-key coordinates; private key bytes never enter this API. */
export const apiKeyCredentialLayer = (options: ApiKeyOptions): Layer.Layer<Credential> =>
  Layer.succeed(Credential, {
    arguments: Effect.succeed({
      args: ["--key", options.keyFile, "--key-id", options.keyId, "--issuer", options.issuer],
      sensitiveValues: [options.keyFile, options.keyId, options.issuer],
    }),
  });

export interface LayerOptions {
  readonly xcrun: AppleToolOptions;
  readonly ditto: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type SubmitError =
  | FileArtifactIdentityMismatch
  | SubmissionPreparationFailed
  | SubmissionOutcomeUnknown
  | ProductStateInvalid
  | ToolFailed;
export type SubmitAppError = SubmitError | ToolFailed | PublishFailed | BundleInspectionFailed;
export type ObserveError = ToolFailed | ResponseInvalid | CorrelationFailed;

interface Service {
  readonly submit: (input: SubmitInput) => Effect.Effect<Submission, SubmitError>;
  readonly submitApp: (input: SubmitAppInput) => Effect.Effect<Submission, SubmitAppError>;
  readonly info: (reference: SubmissionReference) => Effect.Effect<Observation, ObserveError>;
  readonly log: (reference: SubmissionReference) => Effect.Effect<Log, ObserveError>;
}

export class Client extends Context.Service<Client, Service>()(
  "effect-build-apple/Notary/Client",
) {}

type JsonObject = Record<string, unknown>;

const parseObject = (
  operation: "submit" | "info" | "log",
  text: string,
): Effect.Effect<JsonObject, ResponseInvalid> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("expected one JSON object");
      }
      return parsed as JsonObject;
    },
    catch: (error) =>
      new ResponseInvalid({
        operation,
        reason: error instanceof Error ? error.message : String(error),
      }),
  });

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const requireText = (
  operation: "submit" | "info" | "log",
  object: JsonObject,
  key: string,
): Effect.Effect<string, ResponseInvalid> => {
  const value = nonEmpty(object[key]);
  return value === undefined
    ? Effect.fail(new ResponseInvalid({ operation, reason: `missing non-empty ${key}` }))
    : Effect.succeed(value);
};

const requireSubmissionId = (
  operation: "submit" | "info" | "log",
  object: JsonObject,
  key: string,
  sensitiveValues: readonly string[],
): Effect.Effect<SubmissionId, ResponseInvalid> =>
  Effect.flatMap(requireText(operation, object, key), (value) => {
    const canonical = value.toLowerCase();
    if (sensitiveValues.some((sensitive) => sensitive.length > 0 && canonical.includes(sensitive.toLowerCase()))) {
      return Effect.fail(new ResponseInvalid({ operation, reason: `${key} overlaps credential material` }));
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(canonical)
      ? Effect.succeed(canonical as SubmissionId)
      : Effect.fail(new ResponseInvalid({ operation, reason: `${key} is not a submission UUID` }));
  });

const normalizeStatus = (
  operation: "submit" | "info" | "log",
  providerStatus: string,
  summary?: string | undefined,
): Effect.Effect<Status, ResponseInvalid> => {
  const normalized = providerStatus.trim().toLowerCase();
  if (normalized === "accepted") {
    return Effect.succeed(new Accepted({ providerStatus: "Accepted" }));
  }
  if (normalized === "in progress" || normalized === "in-progress" || normalized === "submitted") {
    return Effect.succeed(new Pending({ providerStatus }));
  }
  if (normalized === "invalid" || normalized === "rejected") {
    return Effect.succeed(
      new Rejected({
        providerStatus,
        ...(summary === undefined ? {} : { summary }),
      }),
    );
  }
  return Effect.fail(new ResponseInvalid({ operation, reason: `unknown status ${providerStatus}` }));
};

const issue = (value: unknown, sensitiveValues: readonly string[]): LogIssue | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const object = value as JsonObject;
  const severity = nonEmpty(object.severity);
  const message = nonEmpty(object.message);
  if (severity === undefined || message === undefined) return undefined;
  const path = nonEmpty(object.path);
  const codeValue = object.code;
  const code = typeof codeValue === "string" || typeof codeValue === "number" ? String(codeValue) : undefined;
  const docUrl = nonEmpty(object.docUrl);
  return new LogIssue({
    severity: scrub(severity, sensitiveValues),
    message: scrub(message, sensitiveValues),
    ...(path === undefined ? {} : { path: scrub(path, sensitiveValues) }),
    ...(code === undefined ? {} : { code: scrub(code, sensitiveValues) }),
    ...(docUrl === undefined ? {} : { docUrl: scrub(docUrl, sensitiveValues) }),
  });
};

type LayerError = ToolNotFound | ToolFailed;

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | Credential
> =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const credentialService = yield* Credential;
    const credential = yield* credentialService.arguments;
    const safeText = (value: unknown): string | undefined => {
      const text = nonEmpty(value);
      return text === undefined ? undefined : scrub(text, credential.sensitiveValues);
    };
    const xcrun = yield* resolveAppleTool("xcrun", options.xcrun, ["notarytool", "--version"], "notarytool");
    const ditto = yield* resolveAppleTool("ditto", options.ditto, ["--help"]);
    const codesign = yield* resolveAppleTool("codesign", options.codesign, ["--version"]);
    const pkgutil = yield* resolveAppleTool("pkgutil", options.pkgutil, ["--help"]);
    const tool = new AppleToolFact({ name: "notarytool", version: xcrun.tool.version });
    const transportTool = new AppleToolFact({ name: "ditto", version: ditto.tool.version });
    const run = (operation: "submit" | "info" | "log", args: readonly string[]) =>
      Toolchain.runBytesOrFail({
        tool: "notarytool",
        executable: xcrun.executable,
        args: ["notarytool", operation, ...args, "--output-format", "json", ...credential.args],
      }).pipe(
        Effect.mapError((failure) => scrubToolFailure(failure, credential.sensitiveValues)),
        Effect.flatMap((completion) =>
          Effect.try({
            try: () => new TextDecoder("utf-8", { fatal: true }).decode(completion.stdout),
            catch: (error) =>
              new ResponseInvalid({
                operation,
                reason: `stdout was not valid UTF-8: ${scrub(String(error), credential.sensitiveValues)}`,
              }),
          })
        ),
      );

    const snapshot = Effect.fn("effect-build-apple.snapshotNotaryInput")(function*(input: PreparedSubmissionInput) {
      const verified = yield* verifyFileArtifact("notary submit", input.artifact);
      const staging = yield* fileSystem.makeTempDirectoryScoped({ prefix: ".effect-build-notary-" }).pipe(
        Effect.mapError((error) =>
          new SubmissionPreparationFailed({
            path: verified.source,
            reason: `create private snapshot failed: ${describe(error)}`,
          })
        ),
      );
      const staged = path.join(staging, path.basename(verified.source));
      yield* fileSystem.writeFile(staged, verified.contents).pipe(
        Effect.mapError((error) =>
          new SubmissionPreparationFailed({
            path: verified.source,
            reason: `write private snapshot failed: ${describe(error)}`,
          })
        ),
      );
      return { staged, bytes: verified.bytes, sha256: verified.sha256 } as const;
    });

    const submitPrepared = Effect.fn("effect-build-apple.notarySubmitPrepared")(function*(
      input: PreparedSubmissionInput,
      stapleTarget: StapleTarget | undefined,
      appTransportTool: AppleToolFact | undefined,
    ) {
      return yield* Effect.scoped(
        Effect.gen(function*() {
          const verified = yield* snapshot(input);
          if (input.kind === "dmg") {
            yield* Toolchain.runOrFail({
              tool: "codesign",
              executable: codesign.executable,
              args: ["--verify", "--strict", "--verbose=2", verified.staged],
            });
          } else if (input.kind === "pkg") {
            yield* Toolchain.runOrFail({
              tool: "pkgutil",
              executable: pkgutil.executable,
              args: ["--check-signature", verified.staged],
            });
          }
          const response = yield* run("submit", [verified.staged]).pipe(
            Effect.mapError((failure) =>
              new SubmissionOutcomeUnknown({
                artifactSha256: verified.sha256,
                reason: scrub(failure.message, credential.sensitiveValues),
              })
            ),
          );
          return yield* Effect.gen(function*() {
            const object = yield* parseObject("submit", response);
            const submissionId = yield* requireSubmissionId("submit", object, "id", credential.sensitiveValues);
            const providerStatus = safeText(object.status) ?? "Submitted";
            const message = safeText(object.message);
            const status = yield* normalizeStatus("submit", providerStatus, message);
            return new Submission({
              submissionId,
              kind: input.kind,
              architecture: input.architecture,
              artifactBytes: verified.bytes,
              artifactSha256: verified.sha256,
              status,
              ...(message === undefined ? {} : { message }),
              submissionTool: tool,
              tool,
              ...(stapleTarget === undefined ? {} : { stapleTarget }),
              ...(appTransportTool === undefined ? {} : { transportTool: appTransportTool }),
            });
          }).pipe(
            Effect.mapError((failure) =>
              new SubmissionOutcomeUnknown({
                artifactSha256: verified.sha256,
                reason: scrub(failure.message, credential.sensitiveValues),
              })
            ),
          );
        }),
      );
    });

    const submit = Effect.fn("effect-build-apple.notarySubmit")(function*(input: SubmitInput) {
      const artifactPath = path.resolve(input.artifact.path);
      if (!path.basename(artifactPath).endsWith(input.kind === "dmg" ? ".dmg" : ".pkg")) {
        return yield* new ProductStateInvalid({
          operation: `submit ${input.kind} for notarization`,
          path: artifactPath,
          expected: `a .${input.kind} product path`,
        });
      }
      if (input.kind === "dmg") {
        if (!hasDeveloperIdDiskImageSignature(input.artifact)) {
          return yield* new ProductStateInvalid({
            operation: "submit disk image for notarization",
            path: artifactPath,
            expected: "a native-verified Developer ID disk image",
          });
        }
      } else if (!hasDeveloperIdInstallerSignature(input.artifact)) {
        return yield* new ProductStateInvalid({
          operation: "submit installer package for notarization",
          path: artifactPath,
          expected: "a native-verified Developer ID installer package",
        });
      }
      return yield* submitPrepared(
        { ...input, architecture: input.artifact.architecture },
        new StapleTarget({
          kind: input.kind,
          identityKind: "file-bytes",
          artifactBytes: input.artifact.bytes,
          artifactSha256: input.artifact.sha256 as Sha256,
        }),
        undefined,
      );
    });

    const submitApp = Effect.fn("effect-build-apple.notarySubmitApp")(function*(input: SubmitAppInput) {
      return yield* Effect.scoped(Effect.gen(function*() {
        const sourceAppPath = path.resolve(input.bundle.outdir);
        if (!hasDeveloperIdApplicationSignature(input.bundle)) {
          return yield* new ProductStateInvalid({
            operation: "submit app for notarization",
            path: sourceAppPath,
            expected: "a native-verified Developer ID Application bundle",
          });
        }
        const captured = yield* captureBundle(input.bundle);
        if (!captured.identity.bundleName.endsWith(".app")) {
          return yield* new BundleInspectionFailed({
            path: captured.source,
            reason: "notary app transport requires a .app bundle directory",
          });
        }
        const staging = yield* fileSystem.makeTempDirectoryScoped({ prefix: ".effect-build-notary-app-" }).pipe(
          Effect.mapError((error) =>
            new BundleInspectionFailed({
              path: captured.source,
              reason: `create private app-transport directory failed: ${describe(error)}`,
            })
          ),
        );
        const stagedApp = path.join(staging, captured.identity.bundleName);
        yield* Effect.addFinalizer(() => makeBundleRemovable(captured, stagedApp));
        yield* materializeBundle(captured, stagedApp);
        yield* Toolchain.runOrFail({
          tool: "codesign",
          executable: codesign.executable,
          args: ["--verify", "--deep", "--strict", "--verbose=2", stagedApp],
        });
        const stagedIdentity = (yield* captureBundlePath(stagedApp)).identity;
        if (!identityEquals(captured.identity, stagedIdentity)) {
          return yield* new BundleInspectionFailed({
            path: stagedApp,
            reason: `private app snapshot differs from ${captured.identity.artifactSha256}`,
          });
        }
        const zipName = `${captured.identity.bundleName.slice(0, -4)}.zip`;
        const zipPath = path.join(staging, zipName);
        const transport = yield* Toolchain.publishFile({
          tool: ditto.tool,
          outfile: zipPath,
          produce: (privateZip) =>
            Toolchain.runOrFail({
              tool: "ditto",
              executable: ditto.executable,
              args: ["-c", "-k", "--keepParent", stagedApp, privateZip],
            }),
        });
        const extracted = path.join(staging, "extracted");
        yield* fileSystem.makeDirectory(extracted, { recursive: true }).pipe(
          Effect.mapError((error) =>
            new BundleInspectionFailed({
              path: extracted,
              reason: `create extraction directory failed: ${describe(error)}`,
            })
          ),
        );
        const extractedApp = path.join(extracted, captured.identity.bundleName);
        yield* Effect.addFinalizer(() => makeBundleRemovable(captured, extractedApp));
        yield* Toolchain.runOrFail({
          tool: "ditto",
          executable: ditto.executable,
          args: ["-x", "-k", transport.path, extracted],
        });
        const extractedEntries = (yield* fileSystem.readDirectory(extracted).pipe(
          Effect.mapError((error) =>
            new BundleInspectionFailed({
              path: extracted,
              reason: `read extraction directory failed: ${describe(error)}`,
            })
          ),
        )).sort();
        if (
          extractedEntries.length !== 1
          || extractedEntries[0] !== captured.identity.bundleName
        ) {
          return yield* new BundleInspectionFailed({
            path: extracted,
            reason: `verified ZIP extraction must contain exactly ${captured.identity.bundleName}`,
          });
        }
        const extractedIdentity = (yield* captureBundlePath(extractedApp)).identity;
        if (!identityEquals(captured.identity, extractedIdentity)) {
          return yield* new BundleInspectionFailed({
            path: transport.path,
            reason:
              `ZIP projection mismatch: expected ${captured.identity.artifactSha256}, observed ${extractedIdentity.artifactSha256}`,
          });
        }
        yield* Toolchain.runOrFail({
          tool: "codesign",
          executable: codesign.executable,
          args: [
            "--verify",
            "--deep",
            "--strict",
            "--verbose=2",
            extractedApp,
          ],
        });
        return yield* submitPrepared(
          { kind: "zip", artifact: transport, architecture: input.bundle.architecture },
          new StapleTarget({
            kind: "app",
            identityKind: "bundle-manifest",
            artifactBytes: captured.identity.artifactBytes,
            artifactSha256: captured.identity.artifactSha256,
            bundleName: captured.identity.bundleName,
          }),
          transportTool,
        );
      }));
    });

    const info = Effect.fn("effect-build-apple.notaryInfo")(function*(reference: SubmissionReference) {
      const response = yield* run("info", [reference.submissionId]);
      const object = yield* parseObject("info", response);
      const submissionId = yield* requireSubmissionId("info", object, "id", credential.sensitiveValues);
      if (submissionId !== reference.submissionId) {
        return yield* new CorrelationFailed({
          operation: "info",
          expectedSubmissionId: reference.submissionId,
          observedSubmissionId: submissionId,
        });
      }
      const providerStatus = safeText(object.status);
      if (providerStatus === undefined) {
        return yield* new ResponseInvalid({ operation: "info", reason: "missing non-empty status" });
      }
      const message = safeText(object.message);
      const status = yield* normalizeStatus("info", providerStatus, message);
      const name = safeText(object.name);
      const createdDate = safeText(object.createdDate);
      return new Observation({
        submissionId,
        kind: reference.kind,
        architecture: reference.architecture,
        artifactBytes: reference.artifactBytes,
        artifactSha256: reference.artifactSha256,
        status,
        ...(message === undefined ? {} : { message }),
        ...(name === undefined ? {} : { name }),
        ...(createdDate === undefined ? {} : { createdDate }),
        submissionTool: reference.submissionTool,
        tool,
        ...(reference.stapleTarget === undefined ? {} : { stapleTarget: reference.stapleTarget }),
        ...(reference.transportTool === undefined ? {} : { transportTool: reference.transportTool }),
      });
    });

    const log = Effect.fn("effect-build-apple.notaryLog")(function*(reference: SubmissionReference) {
      const response = yield* run("log", [reference.submissionId]);
      const object = yield* parseObject("log", response);
      const submissionId = yield* requireSubmissionId("log", object, "jobId", credential.sensitiveValues);
      if (submissionId !== reference.submissionId) {
        return yield* new CorrelationFailed({
          operation: "log",
          expectedSubmissionId: reference.submissionId,
          observedSubmissionId: submissionId,
        });
      }
      const providerStatus = safeText(object.status);
      if (providerStatus === undefined) {
        return yield* new ResponseInvalid({ operation: "log", reason: "missing non-empty status" });
      }
      const statusSummary = safeText(object.statusSummary);
      const status = yield* normalizeStatus("log", providerStatus, statusSummary);
      const statusCode = typeof object.statusCode === "number" ? object.statusCode : undefined;
      const archiveFilename = safeText(object.archiveFilename);
      if (object.issues !== undefined && !Array.isArray(object.issues)) {
        return yield* new ResponseInvalid({ operation: "log", reason: "issues must be an array when present" });
      }
      const issues: LogIssue[] = [];
      for (const [index, value] of (object.issues ?? []).entries()) {
        const parsed = issue(value, credential.sensitiveValues);
        if (parsed === undefined) {
          return yield* new ResponseInvalid({
            operation: "log",
            reason: `issues[${index}] was not a complete notarization issue`,
          });
        }
        issues.push(parsed);
      }
      return new Log({
        submissionId,
        kind: reference.kind,
        architecture: reference.architecture,
        artifactBytes: reference.artifactBytes,
        artifactSha256: reference.artifactSha256,
        status,
        ...(statusSummary === undefined ? {} : { statusSummary }),
        ...(statusCode === undefined ? {} : { statusCode }),
        ...(archiveFilename === undefined ? {} : { archiveFilename }),
        issues,
        submissionTool: reference.submissionTool,
        tool,
        ...(reference.stapleTarget === undefined ? {} : { stapleTarget: reference.stapleTarget }),
        ...(reference.transportTool === undefined ? {} : { transportTool: reference.transportTool }),
      });
    });

    return {
      submit: (input) => submit(input).pipe(Effect.provide(services)),
      submitApp: (input) => submitApp(input).pipe(Effect.provide(services)),
      info: (reference) => info(reference).pipe(Effect.provide(services)),
      log: (reference) => log(reference).pipe(Effect.provide(services)),
    };
  });

export const submit = (
  input: SubmitInput,
): Effect.Effect<Submission, SubmitError, Client> => Client.use((service) => service.submit(input));

export const submitApp = (
  input: SubmitAppInput,
): Effect.Effect<Submission, SubmitAppError, Client> => Client.use((service) => service.submitApp(input));

export const info = (
  reference: SubmissionReference,
): Effect.Effect<Observation, ObserveError, Client> => Client.use((service) => service.info(reference));

export const log = (
  reference: SubmissionReference,
): Effect.Effect<Log, ObserveError, Client> => Client.use((service) => service.log(reference));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Client,
  LayerError,
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | Credential
> => Layer.effect(Client, makeService(options));
