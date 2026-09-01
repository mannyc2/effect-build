import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import type * as Tool from "effect-build/Author/Tool";
import * as Tree from "effect-build/Author/Tree";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleOperationInvalid,
  AppleToolChanged,
  AppleToolFailed,
  AppleToolUnavailable,
  capturePlatformServices,
  selectAppleTool,
} from "./internal.js";
import {
  type CredentialArguments,
  type JsonObject,
  makeSubmissionEngine,
  nonEmpty,
  normalizeStatus,
  parseObject,
  requireSubmissionId,
  scrub,
  type SubmissionModel,
} from "./internal/NotarySubmission.js";
import {
  Architecture,
  hasDeveloperIdApplicationSignature,
  hasDeveloperIdDiskImageSignature,
  hasDeveloperIdInstallerSignature,
  ProductKind,
  ProductStateInvalid,
} from "./Model.js";
import type {
  AppleToolOptions,
  DeveloperIdApplicationBundle,
  DeveloperIdDiskImage,
  DeveloperIdInstallerPackage,
} from "./Model.js";

export { AppleOperationInvalid, AppleToolChanged, AppleToolFailed, AppleToolUnavailable } from "./internal.js";

export const SubmissionKind = Schema.Literals(["dmg", "pkg", "zip"] as const);
export type SubmissionKind = typeof SubmissionKind.Type;

export const SubmissionId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    { expected: "a lowercase UUID submission identifier" },
  ),
);
export type SubmissionId = typeof SubmissionId.Type;

export class Pending extends Schema.TaggedClass<Pending>()("Pending", { providerStatus: Schema.NonEmptyString }) {}
export class Accepted
  extends Schema.TaggedClass<Accepted>()("Accepted", { providerStatus: Schema.Literal("Accepted") })
{}
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

export type SubmitInput = SubmitDiskImageInput | SubmitInstallerPackageInput;

export interface SubmitAppInput {
  readonly bundle: DeveloperIdApplicationBundle;
}

const NotarytoolObservation = Schema.declare<Tool.Observation<"notarytool">>(
  (value): value is Tool.Observation<"notarytool"> =>
    Artifact.isProvenance(value) && "name" in value && value.name === "notarytool",
  { title: "NotarytoolObservation" },
);
const DittoObservation = Schema.declare<Tool.Observation<"ditto">>(
  (value): value is Tool.Observation<"ditto"> =>
    Artifact.isProvenance(value) && "name" in value && value.name === "ditto",
  { title: "DittoObservation" },
);

export class StapleTarget extends Schema.Class<StapleTarget>("effect-build-apple/StapleTarget")({
  kind: ProductKind,
  identityKind: Schema.Literals(["file-bytes", "tree-manifest"] as const),
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  bundleName: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export class SubmissionReference extends Schema.Class<SubmissionReference>(
  "effect-build-apple/SubmissionReference",
)({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  submissionTool: NotarytoolObservation,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(DittoObservation),
}) {}

export class Submission extends Schema.Class<Submission>("effect-build-apple/Submission")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
  submissionTool: NotarytoolObservation,
  tool: NotarytoolObservation,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(DittoObservation),
}) {}

export class Observation extends Schema.Class<Observation>("effect-build-apple/Observation")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
  name: Schema.optionalKey(Schema.NonEmptyString),
  createdDate: Schema.optionalKey(Schema.NonEmptyString),
  submissionTool: NotarytoolObservation,
  tool: NotarytoolObservation,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(DittoObservation),
}) {}

export class LogIssue extends Schema.Class<LogIssue>("effect-build-apple/LogIssue")({
  severity: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  path: Schema.optionalKey(Schema.NonEmptyString),
  code: Schema.optionalKey(Schema.String),
  docUrl: Schema.optionalKey(Schema.NonEmptyString),
}) {}

export class Log extends Schema.Class<Log>("effect-build-apple/Log")({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  status: Status,
  statusSummary: Schema.optionalKey(Schema.NonEmptyString),
  statusCode: Schema.optionalKey(Schema.Number),
  archiveFilename: Schema.optionalKey(Schema.NonEmptyString),
  issues: Schema.Array(LogIssue),
  submissionTool: NotarytoolObservation,
  tool: NotarytoolObservation,
  stapleTarget: Schema.optionalKey(StapleTarget),
  transportTool: Schema.optionalKey(DittoObservation),
}) {}

export type Result = Submission | Observation | Log;

export class AcceptedReference extends Schema.Class<AcceptedReference>(
  "effect-build-apple/AcceptedReference",
)({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  architecture: Architecture,
  artifactBytes: Artifact.DecimalBytesSchema,
  artifactDigest: Artifact.DigestSchema,
  providerStatus: Schema.Literal("Accepted"),
  submissionTool: NotarytoolObservation,
  tool: NotarytoolObservation,
  stapleTarget: StapleTarget,
  transportTool: Schema.optionalKey(DittoObservation),
}) {}

export class ResultNotAccepted extends Schema.TaggedError<ResultNotAccepted>()("NotaryResultNotAccepted", {
  submissionId: SubmissionId,
  providerStatus: Schema.NonEmptyString,
}) {
  override get message(): string {
    return `Apple notarization ${this.submissionId} is ${this.providerStatus}, not Accepted`;
  }
}

export class ResultHasNoStapleTarget extends Schema.TaggedError<ResultHasNoStapleTarget>()(
  "NotaryResultHasNoStapleTarget",
  { submissionId: SubmissionId },
) {}

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
      artifactDigest: result.artifactDigest,
      providerStatus: "Accepted",
      submissionTool: result.submissionTool,
      tool: result.tool,
      stapleTarget: result.stapleTarget,
      ...(result.transportTool === undefined ? {} : { transportTool: result.transportTool }),
    }),
  );
};

export class SubmissionOutcomeUnknown extends Schema.TaggedError<SubmissionOutcomeUnknown>()(
  "SubmissionOutcomeUnknown",
  { artifactDigest: Schema.String, reason: Schema.NonEmptyString },
) {
  override get message(): string {
    return `Apple submission outcome is unknown for ${this.artifactDigest}: ${this.reason}`;
  }
}

export class SubmissionPreparationFailed extends Schema.TaggedError<SubmissionPreparationFailed>()(
  "SubmissionPreparationFailed",
  { path: Schema.NonEmptyString, reason: Schema.NonEmptyString },
) {}

export class ResponseInvalid extends Schema.TaggedError<ResponseInvalid>()("NotaryResponseInvalid", {
  operation: Schema.Literals(["submit", "info", "log"] as const),
  reason: Schema.NonEmptyString,
}) {}

export class CorrelationFailed extends Schema.TaggedError<CorrelationFailed>()("NotaryCorrelationFailed", {
  operation: Schema.Literals(["info", "log"] as const),
  expectedSubmissionId: Schema.NonEmptyString,
  observedSubmissionId: Schema.NonEmptyString,
}) {}

interface CredentialService {
  readonly arguments: Effect.Effect<CredentialArguments>;
}

export class Credential extends Context.Service<Credential, CredentialService>()(
  "effect-build-apple/Notary/Credential",
) {}

export interface KeychainProfileOptions {
  readonly profile: string;
  readonly keychain?: string | undefined;
}

export const keychainProfileCredentialLayer = (options: KeychainProfileOptions): Layer.Layer<Credential> =>
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

export const apiKeyCredentialLayer = (options: ApiKeyOptions): Layer.Layer<Credential> =>
  Layer.succeed(Credential, {
    arguments: Effect.succeed({
      args: ["--key", options.keyFile, "--key-id", options.keyId, "--issuer", options.issuer],
      sensitiveValues: [options.keyFile, options.keyId, options.issuer],
    }),
  });

export interface LayerOptions {
  readonly notarytool: AppleToolOptions;
  readonly ditto: AppleToolOptions;
  readonly codesign: AppleToolOptions;
  readonly pkgutil: AppleToolOptions;
}

export type SubmitError =
  | AppleOperationInvalid
  | AppleToolChanged
  | AppleToolFailed
  | File.FileVerificationFailed
  | SubmissionPreparationFailed
  | SubmissionOutcomeUnknown
  | ProductStateInvalid;
export type SubmitAppError = SubmitError | Tree.TreeVerificationFailed;
export type ObserveError = AppleToolChanged | AppleToolFailed | ResponseInvalid | CorrelationFailed;

interface Service {
  readonly submit: (input: SubmitInput) => Effect.Effect<Submission, SubmitError>;
  readonly submitApp: (input: SubmitAppInput) => Effect.Effect<Submission, SubmitAppError>;
  readonly info: (reference: SubmissionReference) => Effect.Effect<Observation, ObserveError>;
  readonly log: (reference: SubmissionReference) => Effect.Effect<Log, ObserveError>;
}

export class Client extends Context.Service<Client, Service>()("effect-build-apple/Notary/Client") {}

const submissionModel: SubmissionModel<
  Submission,
  Status,
  StapleTarget,
  ResponseInvalid,
  SubmissionPreparationFailed,
  SubmissionOutcomeUnknown
> = {
  responseInvalid: (fields) => new ResponseInvalid(fields),
  preparationFailed: (fields) => new SubmissionPreparationFailed(fields),
  isPreparationFailed: (value): value is SubmissionPreparationFailed => value instanceof SubmissionPreparationFailed,
  outcomeUnknown: (fields) => new SubmissionOutcomeUnknown(fields),
  accepted: () => new Accepted({ providerStatus: "Accepted" }),
  pending: (providerStatus) => new Pending({ providerStatus }),
  rejected: (providerStatus, summary) =>
    new Rejected({ providerStatus, ...(summary === undefined ? {} : { summary }) }),
  submission: (fields) => new Submission(fields),
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

type LayerError = AppleToolUnavailable | AppleToolFailed;

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Credential
> =>
  Effect.gen(function*() {
    const { path, services } = yield* capturePlatformServices;
    const credentialService = yield* Credential;
    const notarytool = yield* selectAppleTool("notarytool", options.notarytool, "notarization");
    const ditto = yield* selectAppleTool("ditto", options.ditto, "archive-transport");
    const codesign = yield* selectAppleTool("codesign", options.codesign, "signature-verification");
    const pkgutil = yield* selectAppleTool("pkgutil", options.pkgutil, "package-signature-verification");
    const submissionEngine = yield* makeSubmissionEngine({
      notarytool,
      ditto,
      codesign,
      pkgutil,
      credentialArguments: credentialService.arguments,
      model: submissionModel,
    });

    const submit = Effect.fn("effect-build-apple.notarySubmit")(function*(input: SubmitInput) {
      const expectedSuffix = input.kind === "dmg" ? ".dmg" : ".pkg";
      if (!path.basename(input.artifact.path).endsWith(expectedSuffix)) {
        return yield* new ProductStateInvalid({
          operation: `submit ${input.kind} for notarization`,
          path: input.artifact.path,
          expected: `a ${expectedSuffix} product path`,
        });
      }
      if (
        input.kind === "dmg"
          ? !hasDeveloperIdDiskImageSignature(input.artifact)
          : !hasDeveloperIdInstallerSignature(input.artifact)
      ) {
        return yield* new ProductStateInvalid({
          operation: `submit ${input.kind} for notarization`,
          path: input.artifact.path,
          expected: "a native-verified Developer ID product",
        });
      }
      return yield* File.withVerifiedBytes(input.artifact, (bytes) =>
        submissionEngine.submitBytes(
          input.kind,
          input.artifact.architecture,
          path.basename(input.artifact.path),
          bytes,
          input.artifact.digest,
          new StapleTarget({
            kind: input.kind,
            identityKind: "file-bytes",
            artifactBytes: input.artifact.bytes,
            artifactDigest: input.artifact.digest,
          }),
        ));
    });

    const submitApp = Effect.fn("effect-build-apple.notarySubmitApp")(function*(input: SubmitAppInput) {
      if (!hasDeveloperIdApplicationSignature(input.bundle) || !path.basename(input.bundle.root).endsWith(".app")) {
        return yield* new ProductStateInvalid({
          operation: "submit app for notarization",
          path: input.bundle.root,
          expected: "a native-verified Developer ID Application .app bundle",
        });
      }
      return yield* Tree.withVerifiedSnapshot(input.bundle, (snapshot) => {
        const bundleName = path.basename(input.bundle.root);
        return submissionEngine.submitAppSnapshot({
          sourcePath: input.bundle.root,
          snapshotRoot: snapshot,
          identity: {
            architecture: input.bundle.architecture,
            bundleName,
            rootMode: input.bundle.rootMode,
            entries: input.bundle.entries,
            totalBytes: input.bundle.totalBytes,
            manifestDigest: input.bundle.manifestDigest,
          },
          stapleTarget: new StapleTarget({
            kind: "app",
            identityKind: "tree-manifest",
            artifactBytes: input.bundle.totalBytes,
            artifactDigest: input.bundle.manifestDigest,
            bundleName,
          }),
        });
      });
    });

    const info = Effect.fn("effect-build-apple.notaryInfo")(function*(reference: SubmissionReference) {
      const response = yield* submissionEngine.run("info", [reference.submissionId]);
      const object = yield* parseObject(submissionModel.responseInvalid, "info", response.text);
      const submissionId = yield* requireSubmissionId(
        submissionModel.responseInvalid,
        "info",
        object,
        "id",
        response.sensitiveValues,
      );
      if (submissionId !== reference.submissionId) {
        return yield* new CorrelationFailed({
          operation: "info",
          expectedSubmissionId: reference.submissionId,
          observedSubmissionId: submissionId,
        });
      }
      const safeText = (value: unknown) => {
        const text = nonEmpty(value);
        return text === undefined ? undefined : scrub(text, response.sensitiveValues);
      };
      const providerStatus = safeText(object.status);
      if (providerStatus === undefined) {
        return yield* new ResponseInvalid({ operation: "info", reason: "missing status" });
      }
      const message = safeText(object.message);
      const status = yield* normalizeStatus(submissionModel, "info", providerStatus, message);
      const name = safeText(object.name);
      const createdDate = safeText(object.createdDate);
      return new Observation({
        submissionId,
        kind: reference.kind,
        architecture: reference.architecture,
        artifactBytes: reference.artifactBytes,
        artifactDigest: reference.artifactDigest,
        status,
        ...(message === undefined ? {} : { message }),
        ...(name === undefined ? {} : { name }),
        ...(createdDate === undefined ? {} : { createdDate }),
        submissionTool: reference.submissionTool,
        tool: notarytool.observation,
        ...(reference.stapleTarget === undefined ? {} : { stapleTarget: reference.stapleTarget }),
        ...(reference.transportTool === undefined ? {} : { transportTool: reference.transportTool }),
      });
    });

    const log = Effect.fn("effect-build-apple.notaryLog")(function*(reference: SubmissionReference) {
      const response = yield* submissionEngine.run("log", [reference.submissionId]);
      const object = yield* parseObject(submissionModel.responseInvalid, "log", response.text);
      const submissionId = yield* requireSubmissionId(
        submissionModel.responseInvalid,
        "log",
        object,
        "jobId",
        response.sensitiveValues,
      );
      if (submissionId !== reference.submissionId) {
        return yield* new CorrelationFailed({
          operation: "log",
          expectedSubmissionId: reference.submissionId,
          observedSubmissionId: submissionId,
        });
      }
      const safeText = (value: unknown) => {
        const text = nonEmpty(value);
        return text === undefined ? undefined : scrub(text, response.sensitiveValues);
      };
      const providerStatus = safeText(object.status);
      if (providerStatus === undefined) {
        return yield* new ResponseInvalid({ operation: "log", reason: "missing status" });
      }
      const statusSummary = safeText(object.statusSummary);
      const status = yield* normalizeStatus(submissionModel, "log", providerStatus, statusSummary);
      if (object.issues !== undefined && !Array.isArray(object.issues)) {
        return yield* new ResponseInvalid({ operation: "log", reason: "issues must be an array" });
      }
      const issues: LogIssue[] = [];
      for (const [index, value] of (object.issues ?? []).entries()) {
        const parsed = issue(value, response.sensitiveValues);
        if (parsed === undefined) {
          return yield* new ResponseInvalid({ operation: "log", reason: `issues[${index}] is incomplete` });
        }
        issues.push(parsed);
      }
      const statusCode = typeof object.statusCode === "number" ? object.statusCode : undefined;
      const archiveFilename = safeText(object.archiveFilename);
      return new Log({
        submissionId,
        kind: reference.kind,
        architecture: reference.architecture,
        artifactBytes: reference.artifactBytes,
        artifactDigest: reference.artifactDigest,
        status,
        ...(statusSummary === undefined ? {} : { statusSummary }),
        ...(statusCode === undefined ? {} : { statusCode }),
        ...(archiveFilename === undefined ? {} : { archiveFilename }),
        issues,
        submissionTool: reference.submissionTool,
        tool: notarytool.observation,
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

export const submit = (input: SubmitInput): Effect.Effect<Submission, SubmitError, Client> =>
  Client.use((service) => service.submit(input));
export const submitApp = (input: SubmitAppInput): Effect.Effect<Submission, SubmitAppError, Client> =>
  Client.use((service) => service.submitApp(input));
export const info = (reference: SubmissionReference): Effect.Effect<Observation, ObserveError, Client> =>
  Client.use((service) => service.info(reference));
export const log = (reference: SubmissionReference): Effect.Effect<Log, ObserveError, Client> =>
  Client.use((service) => service.log(reference));

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Client,
  LayerError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Credential
> => Layer.effect(Client, makeService(options));
