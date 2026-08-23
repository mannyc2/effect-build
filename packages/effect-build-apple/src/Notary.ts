import { Cause, Clock, Context, Crypto, Effect, Exit, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as NotaryBinding from "./internal/NotaryBinding.js";
import * as Tool from "./internal/Tool.js";

export type NotarizableArtifact =
  | Artifact.FileArtifact<"mach-o" | "zip" | "disk-image" | "installer-package">
  | Artifact.TreeArtifact<"app-bundle">;

export interface KeychainProfile {
  readonly _tag: "KeychainProfile";
  readonly profile: string;
  readonly keychainPath?: string;
}

export type S3Acceleration = "enabled" | "disabled";
export type SubmissionStatus = "In Progress" | "Accepted" | "Invalid" | "Rejected";

declare const NotaryReceiptTypeId: unique symbol;
declare const SubmissionReferenceTypeId: unique symbol;
declare const SubmissionObservationTypeId: unique symbol;
declare const OperatorReconciliationEvidenceTypeId: unique symbol;

export interface TransportReference {
  readonly kind: "zip" | "disk-image" | "installer-package";
  readonly bytes: number;
  readonly digest: Artifact.Digest;
}

export interface TransportPreparationProvenance extends Artifact.MutationProvenance {
  readonly operation: "notary.prepare-transport";
}

export interface SubmissionReference {
  readonly [SubmissionReferenceTypeId]: typeof SubmissionReferenceTypeId;
  readonly submissionId: string;
  readonly subject: Artifact.ArtifactReference;
  readonly transport: TransportReference;
}

interface ReceiptBase {
  readonly [NotaryReceiptTypeId]: typeof NotaryReceiptTypeId;
  readonly schema: "effect-build-apple/notary-receipt@1";
  readonly attemptId: string;
  readonly startedAtEpochMillis: number;
  readonly receiptPath: string;
  readonly subject: Artifact.ArtifactReference;
  readonly transport: TransportReference;
  readonly preparation: TransportPreparationProvenance;
  readonly notarytool: Artifact.ToolReference;
}

export interface SubmissionAttemptStarted extends ReceiptBase {
  readonly state: "SubmissionAttemptStarted";
}

interface SubmissionBase extends ReceiptBase {
  readonly state: "Submitted";
  readonly submissionId: string;
  /** No-wait submit returns a job id, not a status observation. */
  readonly submittedStatus: "Not Queried";
}

export interface SubmitResponseSubmission extends SubmissionBase {
  readonly source: "submit-response";
  readonly reconciliation?: undefined;
}

export interface OperatorReconciliationRecord {
  readonly authority: string;
  readonly observedAtEpochMillis: number;
}

export interface OperatorReconciledSubmission extends SubmissionBase {
  readonly source: "operator-reconciliation";
  readonly reconciliation: OperatorReconciliationRecord;
}

/** Durable submitted state read from receipt storage. This is data, not query authority. */
export type SubmittedReceipt = SubmitResponseSubmission | OperatorReconciledSubmission;
/** Live-submit or explicitly reconciled authority accepted by `info`, `wait`, and `log`. */
export type Submission = SubmittedReceipt & SubmissionReference;
export type NotaryReceipt = SubmissionAttemptStarted | SubmittedReceipt;

export interface SubmitInput {
  readonly artifact: NotarizableArtifact;
  /** Durable, no-clobber attempt receipt path written before the upload process starts. */
  readonly receiptPath: string;
}

export interface SubmissionObservation extends SubmissionReference {
  readonly [SubmissionObservationTypeId]: typeof SubmissionObservationTypeId;
  readonly status: SubmissionStatus;
  readonly rawJson: string;
  readonly notarytool: Artifact.ToolReference;
}

export type AcceptedSubmissionObservation = SubmissionObservation & { readonly status: "Accepted" };

export interface OperatorReconciliationEvidence {
  readonly [OperatorReconciliationEvidenceTypeId]: typeof OperatorReconciliationEvidenceTypeId;
  readonly _tag: "OperatorReconciliationEvidence";
  readonly receipt: NotaryReceipt;
  readonly submissionId: string;
  readonly authority: string;
  readonly observedAtEpochMillis: number;
}

export interface OperatorReconciliationEvidenceInput {
  readonly receipt: NotaryReceipt;
  readonly submissionId: string;
  /** Human-auditable authority, for example the retained notarytool history export reviewed by the operator. */
  readonly authority: string;
}

export interface ReconcileInput {
  readonly receipt: NotaryReceipt;
  readonly evidence: OperatorReconciliationEvidence;
}

export interface RawJsonObservation {
  readonly rawJson: string;
  readonly notarytool: Artifact.ToolReference;
}

export interface SubmissionLogObservation extends RawJsonObservation {
  readonly submissionId: string;
  readonly subject: Artifact.ArtifactReference;
  readonly transport: TransportReference;
}

export interface WaitOptions {
  /** notarytool duration such as `30s`, `5m`, or `1h`; timeout does not cancel the server job. */
  readonly timeout: string;
}

export interface LayerOptions {
  /** Exact notarytool executable path, normally obtained from `xcrun --no-cache --find notarytool`. */
  readonly notarytoolPath: string;
  readonly dittoPath?: string;
  readonly credentials: KeychainProfile;
  /** Explicit choice; the library never retries with the opposite transport policy. */
  readonly s3Acceleration: S3Acceleration;
}

export class NotaryConfigurationInvalid extends Schema.TaggedError<NotaryConfigurationInvalid>()(
  "NotaryConfigurationInvalid",
  { field: Schema.String, reason: Schema.String },
) {}

export class NotaryReceiptExists extends Schema.TaggedError<NotaryReceiptExists>()("NotaryReceiptExists", {
  receiptPath: Schema.String,
}) {}

export class NotaryReceiptFailed extends Schema.TaggedError<NotaryReceiptFailed>()("NotaryReceiptFailed", {
  receiptPath: Schema.String,
  reason: Schema.String,
}) {}

export class NotaryReceiptInvalid extends Schema.TaggedError<NotaryReceiptInvalid>()("NotaryReceiptInvalid", {
  receiptPath: Schema.String,
  reason: Schema.String,
}) {}

export class SubmissionReceiptCommitFailed extends Schema.TaggedError<SubmissionReceiptCommitFailed>()(
  "SubmissionReceiptCommitFailed",
  { receiptPath: Schema.String, submissionId: Schema.String, reason: Schema.String },
) {}

export class InvalidNotaryResponse extends Schema.TaggedError<InvalidNotaryResponse>()("InvalidNotaryResponse", {
  operation: Schema.String,
  reason: Schema.String,
  rawJson: Schema.String,
}) {}

export class UnknownSubmissionOutcome extends Schema.TaggedError<UnknownSubmissionOutcome>()(
  "UnknownSubmissionOutcome",
  { receiptPath: Schema.String, reason: Schema.String, stdout: Schema.String, stderr: Schema.String },
) {}

export class NotaryBindingInvalid extends Schema.TaggedError<NotaryBindingInvalid>()("NotaryBindingInvalid", {
  reason: Schema.String,
}) {}

export type SubmitError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.ArtifactError
  | Artifact.LifecycleError
  | Artifact.ToolError
  | NotaryReceiptExists
  | NotaryReceiptFailed
  | SubmissionReceiptCommitFailed
  | UnknownSubmissionOutcome;

export type ReadReceiptError = NotaryReceiptFailed | NotaryReceiptInvalid;
export type QueryError =
  | Artifact.ToolError
  | InvalidNotaryResponse
  | NotaryConfigurationInvalid
  | NotaryBindingInvalid
  | ReadReceiptError;
export type ReconcileError = ReadReceiptError | SubmissionReceiptCommitFailed | NotaryBindingInvalid;

interface Service {
  readonly submit: (input: SubmitInput) => Effect.Effect<Submission, SubmitError>;
  readonly info: (submission: Submission) => Effect.Effect<SubmissionObservation, QueryError>;
  readonly wait: (submission: Submission, options: WaitOptions) => Effect.Effect<SubmissionObservation, QueryError>;
  readonly log: (submission: Submission) => Effect.Effect<SubmissionLogObservation, QueryError>;
  readonly history: () => Effect.Effect<RawJsonObservation, QueryError>;
}

export class Notarizer extends Context.Service<Notarizer, Service>()("effect-build-apple/Notary/Notarizer") {}

const receiptSchema = "effect-build-apple/notary-receipt@1" as const;
const preparationOperation = "notary.prepare-transport" as const;
const supported = ["mach-o", "app-bundle", "zip", "disk-image", "installer-package"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const duration = /^[1-9][0-9]*(?:s|m|h)?$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const statuses = new Set<SubmissionStatus>(["In Progress", "Accepted", "Invalid", "Rejected"]);
type AttemptFields = Omit<SubmissionAttemptStarted, typeof NotaryReceiptTypeId>;
type SubmissionFields =
  | Omit<SubmitResponseSubmission, typeof NotaryReceiptTypeId>
  | Omit<OperatorReconciledSubmission, typeof NotaryReceiptTypeId>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalCopy = <A>(value: A): A => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => canonicalCopy(entry))) as A;
  }
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) copy[key] = canonicalCopy(entry);
    }
    return Object.freeze(copy) as A;
  }
  return value;
};

const canonicalJson = (value: unknown): string => `${JSON.stringify(canonicalCopy(value), null, 2)}\n`;
const sameCanonicalValue = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

const mintAttempt = (fields: AttemptFields): SubmissionAttemptStarted =>
  NotaryBinding.registerAttempt(canonicalCopy(fields) as SubmissionAttemptStarted);

const storedSubmission = (fields: SubmissionFields): SubmittedReceipt =>
  NotaryBinding.registerStoredReceipt(canonicalCopy(fields) as SubmittedReceipt);

const liveSubmission = (fields: SubmissionFields): Submission =>
  NotaryBinding.registerLiveSubmission(canonicalCopy(fields) as unknown as Submission);

const reconciledSubmission = (fields: SubmissionFields): Submission =>
  NotaryBinding.registerReconciledSubmission(canonicalCopy(fields) as unknown as Submission);

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const validateArtifact = (artifact: NotarizableArtifact): Effect.Effect<void, Artifact.UnsupportedArtifactKind> =>
  supported.includes(actualKind(artifact) as typeof supported[number])
    ? Effect.void
    : Effect.fail(
      new Artifact.UnsupportedArtifactKind({
        operation: "notary.submit",
        actual: actualKind(artifact),
        expected: [...supported],
      }),
    );

const validateConfiguration = (options: LayerOptions): Effect.Effect<void, NotaryConfigurationInvalid> => {
  if (options.credentials._tag !== "KeychainProfile") {
    return Effect.fail(new NotaryConfigurationInvalid({ field: "credentials", reason: "unsupported authority" }));
  }
  if (options.credentials.profile.trim() === "") {
    return Effect.fail(new NotaryConfigurationInvalid({ field: "credentials.profile", reason: "must not be empty" }));
  }
  if (options.credentials.keychainPath !== undefined && !options.credentials.keychainPath.startsWith("/")) {
    return Effect.fail(
      new NotaryConfigurationInvalid({ field: "credentials.keychainPath", reason: "must be an absolute path" }),
    );
  }
  if (options.s3Acceleration !== "enabled" && options.s3Acceleration !== "disabled") {
    return Effect.fail(
      new NotaryConfigurationInvalid({
        field: "s3Acceleration",
        reason: "must explicitly be enabled or disabled",
      }),
    );
  }
  return Effect.void;
};

const parseJson = (
  operation: string,
  rawJson: string,
): Effect.Effect<Readonly<Record<string, unknown>>, InvalidNotaryResponse> =>
  Effect.try({
    try: () => JSON.parse(rawJson) as unknown,
    catch: (error) => new InvalidNotaryResponse({ operation, reason: describe(error), rawJson }),
  }).pipe(
    Effect.flatMap((parsed) =>
      isRecord(parsed)
        ? Effect.succeed(parsed)
        : Effect.fail(new InvalidNotaryResponse({ operation, reason: "expected a JSON object", rawJson }))
    ),
  );

const parseSubmission = (
  operation: string,
  rawJson: string,
  expectedId?: string,
): Effect.Effect<{ readonly id: string; readonly status: SubmissionStatus }, InvalidNotaryResponse> =>
  Effect.gen(function*() {
    const parsed = yield* parseJson(operation, rawJson);
    const id = parsed.id;
    const status = parsed.status;
    if (typeof id !== "string" || !uuid.test(id.toLowerCase())) {
      return yield* new InvalidNotaryResponse({ operation, reason: "missing valid submission id", rawJson });
    }
    const normalizedId = id.toLowerCase();
    if (expectedId !== undefined && normalizedId !== expectedId.toLowerCase()) {
      return yield* new InvalidNotaryResponse({
        operation,
        reason: "response submission id does not match request",
        rawJson,
      });
    }
    if (typeof status !== "string" || !statuses.has(status as SubmissionStatus)) {
      return yield* new InvalidNotaryResponse({ operation, reason: "unknown or missing notarization status", rawJson });
    }
    return { id: normalizedId, status: status as SubmissionStatus };
  });

const parseSubmitResponse = (
  rawJson: string,
): Effect.Effect<{ readonly id: string }, InvalidNotaryResponse> =>
  Effect.gen(function*() {
    const parsed = yield* parseJson("submit", rawJson);
    const id = parsed.id;
    if (typeof id !== "string" || !uuid.test(id.toLowerCase())) {
      return yield* new InvalidNotaryResponse({
        operation: "submit",
        reason: "missing valid submission id",
        rawJson,
      });
    }
    return { id: id.toLowerCase() };
  });

const receiptJson = (receipt: NotaryReceipt): string => canonicalJson(receipt);

export const submittedReceiptPath = (receiptPath: string, attemptId: string): string =>
  `${receiptPath}.${attemptId.toLowerCase()}.submitted.json`;

const resolveReceiptPath = (
  requested: string,
  options: {
    readonly createParent?: boolean;
    readonly inputs?: readonly Artifact.Artifact[];
  } = {},
): Effect.Effect<string, NotaryReceiptFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = yield* Lifecycle.resolveProspectivePath(requested).pipe(
      Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: requested, reason: error.reason })),
    );
    yield* Lifecycle.rejectTreeOverlap(absolute, options.inputs ?? []).pipe(
      Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: absolute, reason: error.reason })),
    );
    const parent = path.dirname(absolute);
    if (options.createParent === true) {
      yield* fileSystem.makeDirectory(parent, { recursive: true }).pipe(
        Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: absolute, reason: describe(error) })),
      );
      const canonicalParent = path.normalize(
        yield* fileSystem.realPath(parent).pipe(
          Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: absolute, reason: describe(error) })),
        ),
      );
      if (canonicalParent !== parent) {
        return yield* new NotaryReceiptFailed({
          receiptPath: absolute,
          reason: "receipt parent changed while it was being created",
        });
      }
    }
    return absolute;
  });

interface DurableWriteFailure {
  readonly phase: "stage" | "link" | "parent-sync";
  readonly reason: string;
  readonly collision: boolean;
}

const durableNoClobber = (
  destination: string,
  contents: string,
): Effect.Effect<void, DurableWriteFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const parent = path.dirname(destination);
      const stageFailure = (error: unknown): DurableWriteFailure => ({
        phase: "stage",
        reason: describe(error),
        collision: false,
      });
      const temporary = yield* fileSystem.makeTempFileScoped({
        directory: parent,
        prefix: ".effect-build-apple-notary-receipt-",
      }).pipe(Effect.mapError(stageFailure));
      yield* fileSystem.chmod(temporary, 0o600).pipe(Effect.mapError(stageFailure));
      const file = yield* fileSystem.open(temporary, { flag: "w", mode: 0o600 }).pipe(Effect.mapError(stageFailure));
      yield* file.writeAll(new TextEncoder().encode(contents)).pipe(Effect.mapError(stageFailure));
      yield* file.sync.pipe(Effect.mapError(stageFailure));
      const staged = yield* fileSystem.readFileString(temporary).pipe(Effect.mapError(stageFailure));
      if (staged !== contents) {
        return yield* Effect.fail({
          phase: "stage" as const,
          reason: "staged receipt bytes changed before publication",
          collision: false,
        });
      }
      yield* Effect.uninterruptible(
        Effect.gen(function*() {
          const linked = yield* Effect.exit(fileSystem.link(temporary, destination));
          if (Exit.isFailure(linked)) {
            const collision = yield* fileSystem.exists(destination).pipe(Effect.orElseSucceed(() => false));
            return yield* Effect.fail({
              phase: "link" as const,
              reason: Cause.pretty(linked.cause),
              collision,
            });
          }
          const directory = yield* fileSystem.open(parent, { flag: "r" }).pipe(
            Effect.mapError((error): DurableWriteFailure => ({
              phase: "parent-sync",
              reason: describe(error),
              collision: false,
            })),
          );
          yield* directory.sync.pipe(
            Effect.mapError((error): DurableWriteFailure => ({
              phase: "parent-sync",
              reason: describe(error),
              collision: false,
            })),
          );
        }),
      );
    }),
  );

const createReceipt = (
  receipt: SubmissionAttemptStarted,
): Effect.Effect<void, NotaryReceiptExists | NotaryReceiptFailed, FileSystem.FileSystem | Path.Path> =>
  durableNoClobber(receipt.receiptPath, receiptJson(receipt)).pipe(
    Effect.mapError((error) =>
      error.phase === "link" && error.collision
        ? new NotaryReceiptExists({ receiptPath: receipt.receiptPath })
        : new NotaryReceiptFailed({ receiptPath: receipt.receiptPath, reason: `${error.phase}: ${error.reason}` })
    ),
  );

const commitReceipt = (
  receipt: SubmittedReceipt,
): Effect.Effect<void, SubmissionReceiptCommitFailed, FileSystem.FileSystem | Path.Path> => {
  const destination = submittedReceiptPath(receipt.receiptPath, receipt.attemptId);
  return durableNoClobber(destination, receiptJson(receipt)).pipe(
    Effect.mapError((error) =>
      new SubmissionReceiptCommitFailed({
        receiptPath: destination,
        submissionId: receipt.submissionId,
        reason: `${error.phase}: ${error.reason}${error.collision ? " (destination already exists)" : ""}`,
      })
    ),
  );
};

const exactFields = (value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

const validDigest = (value: unknown): value is Artifact.Digest =>
  isRecord(value) && exactFields(value, ["algorithm", "value"]) && value.algorithm === "sha256"
  && typeof value.value === "string" && digestPattern.test(value.value);

const validSubject = (value: unknown): value is Artifact.ArtifactReference =>
  isRecord(value) && exactFields(value, ["kind", "path", "digest"])
  && supported.includes(value.kind as typeof supported[number]) && typeof value.path === "string"
  && value.path.startsWith("/") && validDigest(value.digest);

const validTransport = (value: unknown): value is TransportReference =>
  isRecord(value) && exactFields(value, ["kind", "bytes", "digest"])
  && (value.kind === "zip" || value.kind === "disk-image" || value.kind === "installer-package")
  && typeof value.bytes === "number" && Number.isSafeInteger(value.bytes) && value.bytes >= 0
  && validDigest(value.digest);

const validTool = (value: unknown, expectedName?: string): value is Artifact.ToolReference =>
  isRecord(value) && exactFields(value, ["name", "path", "sha256"]) && typeof value.name === "string"
  && value.name !== "" && (expectedName === undefined || value.name === expectedName) && typeof value.path === "string"
  && value.path.startsWith("/") && validDigest(value.sha256);

const validOutput = (value: unknown): value is Artifact.OutputObservation =>
  isRecord(value) && exactFields(value, ["text", "truncated"]) && typeof value.text === "string"
  && typeof value.truncated === "boolean";

const validTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const validInvocation = (value: unknown): value is Artifact.ToolInvocation => {
  if (!isRecord(value)) return false;
  const fields = [
    "tool",
    "args",
    "startedAtEpochMillis",
    "completedAtEpochMillis",
    "exitCode",
    "stdout",
    "stderr",
    ...(value.cwd === undefined ? [] : ["cwd"]),
  ];
  return exactFields(value, fields) && validTool(value.tool) && Array.isArray(value.args)
    && value.args.every((argument) => typeof argument === "string")
    && (value.cwd === undefined || (typeof value.cwd === "string" && value.cwd.startsWith("/")))
    && validTime(value.startedAtEpochMillis) && validTime(value.completedAtEpochMillis)
    && value.completedAtEpochMillis >= value.startedAtEpochMillis && typeof value.exitCode === "number"
    && Number.isSafeInteger(value.exitCode) && validOutput(value.stdout) && validOutput(value.stderr);
};

const validPreparation = (
  value: unknown,
  subject: Artifact.ArtifactReference,
  transport: TransportReference,
): value is TransportPreparationProvenance => {
  if (
    !isRecord(value) || !exactFields(value, [
      "operation",
      "startedAtEpochMillis",
      "completedAtEpochMillis",
      "inputs",
      "output",
      "tools",
    ])
  ) return false;
  if (
    value.operation !== preparationOperation || !validTime(value.startedAtEpochMillis)
    || !validTime(value.completedAtEpochMillis) || value.completedAtEpochMillis < value.startedAtEpochMillis
    || !Array.isArray(value.inputs) || value.inputs.length !== 1 || !validSubject(value.inputs[0])
    || !sameCanonicalValue(value.inputs[0], subject) || !validSubject(value.output)
    || value.output.kind !== transport.kind || !sameCanonicalValue(value.output.digest, transport.digest)
    || !Array.isArray(value.tools) || value.tools.length === 0 || !value.tools.every(validInvocation)
  ) return false;
  return true;
};

const validReconciliation = (value: unknown): value is OperatorReconciliationRecord =>
  isRecord(value) && exactFields(value, ["authority", "observedAtEpochMillis"])
  && typeof value.authority === "string" && value.authority.trim() === value.authority && value.authority.length > 0
  && value.authority.length <= 1024 && validTime(value.observedAtEpochMillis);

const commonReceiptFields = [
  "schema",
  "state",
  "attemptId",
  "startedAtEpochMillis",
  "receiptPath",
  "subject",
  "transport",
  "preparation",
  "notarytool",
] as const;

const readReceiptValue = (
  value: unknown,
  baseReceiptPath: string,
  storagePath: string,
  expectedState: "SubmissionAttemptStarted" | "Submitted",
): Effect.Effect<NotaryReceipt, NotaryReceiptInvalid> => {
  if (!isRecord(value) || value.schema !== receiptSchema || value.state !== expectedState) {
    return Effect.fail(
      new NotaryReceiptInvalid({ receiptPath: storagePath, reason: "unexpected receipt schema or state" }),
    );
  }
  const submittedFields = [
    ...commonReceiptFields,
    "submissionId",
    "submittedStatus",
    "source",
    ...(value.source === "operator-reconciliation" ? ["reconciliation"] : []),
  ];
  if (!exactFields(value, expectedState === "SubmissionAttemptStarted" ? commonReceiptFields : submittedFields)) {
    return Effect.fail(
      new NotaryReceiptInvalid({ receiptPath: storagePath, reason: "receipt field set is not canonical" }),
    );
  }
  if (
    typeof value.attemptId !== "string" || !uuid.test(value.attemptId) || !validTime(value.startedAtEpochMillis)
    || value.receiptPath !== baseReceiptPath || !validSubject(value.subject) || !validTransport(value.transport)
    || !validPreparation(value.preparation, value.subject, value.transport)
    || !validTool(value.notarytool, "notarytool")
  ) {
    return Effect.fail(new NotaryReceiptInvalid({ receiptPath: storagePath, reason: "receipt fields are malformed" }));
  }
  const base = {
    schema: receiptSchema,
    attemptId: value.attemptId,
    startedAtEpochMillis: value.startedAtEpochMillis,
    receiptPath: baseReceiptPath,
    subject: value.subject,
    transport: value.transport,
    preparation: value.preparation,
    notarytool: value.notarytool,
  };
  if (expectedState === "SubmissionAttemptStarted") {
    return Effect.succeed(mintAttempt({ ...base, state: "SubmissionAttemptStarted" }));
  }
  if (
    typeof value.submissionId !== "string" || !uuid.test(value.submissionId)
    || value.submittedStatus !== "Not Queried"
    || (value.source !== "submit-response" && value.source !== "operator-reconciliation")
    || (value.source === "operator-reconciliation" && !validReconciliation(value.reconciliation))
  ) {
    return Effect.fail(
      new NotaryReceiptInvalid({ receiptPath: storagePath, reason: "submitted fields are malformed" }),
    );
  }
  return Effect.succeed(storedSubmission({
    ...base,
    state: "Submitted",
    submissionId: value.submissionId,
    submittedStatus: "Not Queried",
    source: value.source,
    ...(value.source === "operator-reconciliation" ? { reconciliation: value.reconciliation } : {}),
  } as SubmissionFields));
};

const readJsonFile = (
  storagePath: string,
): Effect.Effect<unknown, ReadReceiptError, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const symbolicLink = yield* Effect.option(fileSystem.readLink(storagePath));
    if (symbolicLink._tag === "Some") {
      return yield* new NotaryReceiptInvalid({
        receiptPath: storagePath,
        reason: "receipt must not be a symbolic link",
      });
    }
    const contents = yield* fileSystem.readFileString(storagePath).pipe(
      Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: storagePath, reason: describe(error) })),
    );
    return yield* Effect.try({
      try: () => JSON.parse(contents) as unknown,
      catch: (error) => new NotaryReceiptInvalid({ receiptPath: storagePath, reason: describe(error) }),
    });
  });

const attemptFromSubmission = (submission: SubmittedReceipt): SubmissionAttemptStarted =>
  canonicalCopy({
    schema: submission.schema,
    state: "SubmissionAttemptStarted" as const,
    attemptId: submission.attemptId,
    startedAtEpochMillis: submission.startedAtEpochMillis,
    receiptPath: submission.receiptPath,
    subject: submission.subject,
    transport: submission.transport,
    preparation: submission.preparation,
    notarytool: submission.notarytool,
  }) as SubmissionAttemptStarted;

export const readReceipt = (
  input: string,
): Effect.Effect<NotaryReceipt, ReadReceiptError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const receiptPath = yield* resolveReceiptPath(input);
    const attempt = yield* readJsonFile(receiptPath).pipe(
      Effect.flatMap((value) => readReceiptValue(value, receiptPath, receiptPath, "SubmissionAttemptStarted")),
    );
    if (attempt.state !== "SubmissionAttemptStarted") {
      return yield* new NotaryReceiptInvalid({ receiptPath, reason: "base receipt is not an attempt" });
    }
    const sidecarPath = submittedReceiptPath(receiptPath, attempt.attemptId);
    const sidecarExists = yield* fileSystem.exists(sidecarPath).pipe(
      Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath: sidecarPath, reason: describe(error) })),
    );
    if (!sidecarExists) return attempt;
    const submission = yield* readJsonFile(sidecarPath).pipe(
      Effect.flatMap((value) => readReceiptValue(value, receiptPath, sidecarPath, "Submitted")),
    );
    if (submission.state !== "Submitted" || !sameCanonicalValue(attemptFromSubmission(submission), attempt)) {
      return yield* new NotaryReceiptInvalid({
        receiptPath: sidecarPath,
        reason: "submitted sidecar is not bound to the exact base attempt",
      });
    }
    return submission;
  });

export const operatorReconciliationEvidence = (
  input: OperatorReconciliationEvidenceInput,
): Effect.Effect<OperatorReconciliationEvidence, NotaryBindingInvalid> =>
  Effect.gen(function*() {
    const receiptIsKnown = input.receipt.state === "SubmissionAttemptStarted"
      ? NotaryBinding.isAttempt(input.receipt) || NotaryBinding.isStoredReceipt(input.receipt)
      : NotaryBinding.isAuthorizedSubmission(input.receipt) || NotaryBinding.isStoredReceipt(input.receipt);
    if (!receiptIsKnown) {
      return yield* new NotaryBindingInvalid({ reason: "receipt was not read or produced by this Notary module" });
    }
    const submissionId = input.submissionId.toLowerCase();
    if (!uuid.test(submissionId)) {
      return yield* new NotaryBindingInvalid({ reason: "submissionId must be a UUID" });
    }
    if (input.receipt.state === "Submitted" && input.receipt.submissionId !== submissionId) {
      return yield* new NotaryBindingInvalid({ reason: "operator evidence does not match the stored submission id" });
    }
    const authority = input.authority.trim();
    if (authority === "" || authority.length > 1024) {
      return yield* new NotaryBindingInvalid({ reason: "authority must contain 1 to 1024 non-whitespace characters" });
    }
    const evidence = canonicalCopy({
      _tag: "OperatorReconciliationEvidence" as const,
      receipt: input.receipt,
      submissionId,
      authority,
      observedAtEpochMillis: yield* Clock.currentTimeMillis,
    }) as OperatorReconciliationEvidence;
    return NotaryBinding.registerReconciliationEvidence(evidence);
  });

export const reconcile = (
  input: ReconcileInput,
): Effect.Effect<Submission, ReconcileError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    if (!NotaryBinding.isReconciliationEvidence(input.evidence)) {
      return yield* new NotaryBindingInvalid({ reason: "operator reconciliation evidence is not authenticated" });
    }
    if (!sameCanonicalValue(input.evidence.receipt, input.receipt)) {
      return yield* new NotaryBindingInvalid({ reason: "operator evidence is bound to a different receipt" });
    }
    const current = yield* readReceipt(input.receipt.receiptPath);
    if (!sameCanonicalValue(current, input.receipt)) {
      return yield* new NotaryBindingInvalid({ reason: "durable receipt changed before reconciliation" });
    }
    if (current.state === "Submitted") {
      if (current.submissionId !== input.evidence.submissionId) {
        return yield* new NotaryBindingInvalid({ reason: "durable submission id differs from operator evidence" });
      }
      return reconciledSubmission(current as SubmissionFields);
    }
    const submitted = canonicalCopy({
      ...current,
      state: "Submitted" as const,
      submissionId: input.evidence.submissionId,
      submittedStatus: "Not Queried" as const,
      source: "operator-reconciliation" as const,
      reconciliation: {
        authority: input.evidence.authority,
        observedAtEpochMillis: input.evidence.observedAtEpochMillis,
      },
    }) as SubmittedReceipt;
    yield* commitReceipt(submitted);
    const persisted = yield* readReceipt(current.receiptPath);
    if (persisted.state !== "Submitted" || !sameCanonicalValue(persisted, submitted)) {
      return yield* new NotaryBindingInvalid({ reason: "submitted sidecar changed during reconciliation" });
    }
    return reconciledSubmission(persisted as SubmissionFields);
  });

const makeService = (
  options: LayerOptions,
): Effect.Effect<
  Service,
  Artifact.ToolError | NotaryConfigurationInvalid,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    yield* validateConfiguration(options);
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const notarytool = yield* Tool.select({ name: "notarytool", path: options.notarytoolPath });
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    const credentials = [
      "--keychain-profile",
      options.credentials.profile,
      ...(options.credentials.keychainPath === undefined ? [] : ["--keychain", options.credentials.keychainPath]),
    ] as const;

    const prepareTransport = (artifact: NotarizableArtifact) =>
      Effect.gen(function*() {
        const startedAtEpochMillis = yield* Clock.currentTimeMillis;
        const copied = yield* Lifecycle.copyAuthenticatedScoped({ input: artifact, copyTool: ditto });
        const tools: Artifact.ToolInvocation[] = [...copied.tools];
        let transportArtifact: Artifact.FileArtifact<"zip" | "disk-image" | "installer-package">;
        if (copied.artifact.kind === "app-bundle" || copied.artifact.kind === "mach-o") {
          const archivePath = `${copied.artifact.path}.zip`;
          tools.push(
            yield* Tool.runOrFail({
              tool: ditto,
              args: ["-c", "-k", "--keepParent", copied.artifact.path, archivePath],
            }),
          );
          transportArtifact = yield* Artifact.observeFile("zip", archivePath);
          const extractionRoot = yield* fileSystem.makeTempDirectoryScoped({
            prefix: ".effect-build-apple-notary-transport-verify-",
          }).pipe(
            Effect.mapError((error) =>
              new Artifact.ArtifactObservationFailed({ path: archivePath, reason: describe(error) })
            ),
          );
          tools.push(yield* Tool.runOrFail({ tool: ditto, args: ["-x", "-k", archivePath, extractionRoot] }));
          const extractedPath = path.join(extractionRoot, path.basename(copied.artifact.path));
          const extracted = copied.artifact._tag === "TreeArtifact"
            ? yield* Artifact.observeTree("app-bundle", extractedPath)
            : yield* Artifact.observeFile("mach-o", extractedPath);
          if (!Artifact.sameIdentity(copied.artifact, extracted)) {
            return yield* new Artifact.ArtifactChanged({
              path: extracted.path,
              expected: JSON.stringify(copied.artifact.identity),
              observed: JSON.stringify(extracted.identity),
            });
          }
          yield* Artifact.revalidate(copied.artifact);
        } else {
          transportArtifact = copied.artifact as Artifact.FileArtifact<"zip" | "disk-image" | "installer-package">;
        }
        yield* Artifact.revalidate(transportArtifact);
        const completedAtEpochMillis = yield* Clock.currentTimeMillis;
        const reference: TransportReference = canonicalCopy({
          kind: transportArtifact.kind,
          bytes: transportArtifact.identity.bytes,
          digest: transportArtifact.identity.digest,
        });
        const provenance = canonicalCopy({
          operation: preparationOperation,
          startedAtEpochMillis,
          completedAtEpochMillis,
          inputs: [Artifact.reference(artifact)],
          output: Artifact.reference(transportArtifact),
          tools,
        }) as TransportPreparationProvenance;
        return { artifact: transportArtifact, reference, provenance };
      });

    const validateDurableSubmission = (submission: Submission) =>
      Effect.gen(function*() {
        if (!NotaryBinding.isAuthorizedSubmission(submission) || submission.state !== "Submitted") {
          return yield* new NotaryBindingInvalid({
            reason: "submission is not authorized by a live submit or operator reconciliation",
          });
        }
        const durable = yield* readReceipt(submission.receiptPath);
        if (durable.state !== "Submitted" || !sameCanonicalValue(durable, submission)) {
          return yield* new NotaryBindingInvalid({ reason: "durable submitted receipt changed before query" });
        }
      });

    const queryArgs = (operation: "info" | "wait", submissionId: string): string[] => [
      operation,
      submissionId,
      ...credentials,
      "--output-format",
      "json",
      "--no-progress",
    ];

    const query = (
      operation: "info" | "wait",
      submission: Submission,
      trailing: readonly string[] = [],
    ): Effect.Effect<SubmissionObservation, QueryError> =>
      Effect.gen(function*() {
        yield* validateDurableSubmission(submission);
        const invocation = yield* Tool.runOrFail({
          tool: notarytool,
          args: [...queryArgs(operation, submission.submissionId), ...trailing],
        });
        const parsed = yield* parseSubmission(operation, invocation.stdout.text, submission.submissionId);
        const observation = canonicalCopy({
          submissionId: parsed.id,
          subject: submission.subject,
          transport: submission.transport,
          status: parsed.status,
          rawJson: invocation.stdout.text,
          notarytool,
        }) as unknown as SubmissionObservation;
        return NotaryBinding.registerObservation(observation);
      }).pipe(Effect.provide(services));

    const commitSubmitResponse = (
      attempt: SubmissionAttemptStarted,
      submissionId: string,
    ): Effect.Effect<SubmittedReceipt, SubmissionReceiptCommitFailed, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function*() {
        const submitted = canonicalCopy({
          ...attempt,
          state: "Submitted" as const,
          submissionId,
          submittedStatus: "Not Queried" as const,
          source: "submit-response" as const,
        }) as SubmittedReceipt;
        yield* commitReceipt(submitted);
        const persisted = yield* readReceipt(attempt.receiptPath).pipe(
          Effect.mapError((error) =>
            new SubmissionReceiptCommitFailed({
              receiptPath: submittedReceiptPath(attempt.receiptPath, attempt.attemptId),
              submissionId,
              reason: describe(error),
            })
          ),
        );
        if (persisted.state !== "Submitted" || !sameCanonicalValue(persisted, submitted)) {
          return yield* new SubmissionReceiptCommitFailed({
            receiptPath: submittedReceiptPath(attempt.receiptPath, attempt.attemptId),
            submissionId,
            reason: "submitted sidecar changed during durable verification",
          });
        }
        return persisted;
      });

    const submit = (input: SubmitInput): Effect.Effect<Submission, SubmitError> =>
      Effect.scoped(
        Effect.gen(function*() {
          yield* validateArtifact(input.artifact);
          const transport = yield* prepareTransport(input.artifact);
          const receiptPath = yield* resolveReceiptPath(input.receiptPath, {
            createParent: true,
            inputs: [input.artifact],
          });
          const attempt = mintAttempt({
            schema: receiptSchema,
            state: "SubmissionAttemptStarted",
            attemptId: yield* crypto.randomUUIDv7.pipe(
              Effect.mapError((error) => new NotaryReceiptFailed({ receiptPath, reason: describe(error) })),
            ),
            startedAtEpochMillis: yield* Clock.currentTimeMillis,
            receiptPath,
            subject: Artifact.reference(input.artifact),
            transport: transport.reference,
            preparation: transport.provenance,
            notarytool,
          });
          yield* createReceipt(attempt);
          yield* Artifact.revalidate(input.artifact);
          yield* Artifact.revalidate(transport.artifact);
          // The tool runner keeps the child interruptible, then invokes this callback
          // in the same uninterruptible completion region that owns post-run tool auth.
          const committed = yield* Tool.runWithCompletion(
            {
              tool: notarytool,
              args: [
                "submit",
                transport.artifact.path,
                ...credentials,
                "--output-format",
                "json",
                "--no-progress",
                "--no-wait",
                options.s3Acceleration === "enabled" ? "--s3-acceleration" : "--no-s3-acceleration",
              ],
            },
            ({ invocation, postAuthentication }) =>
              Effect.gen(function*() {
                const parsed = yield* parseSubmitResponse(invocation.stdout.text).pipe(
                  Effect.mapError((error) =>
                    new UnknownSubmissionOutcome({
                      receiptPath,
                      reason: invocation.exitCode === 0
                        ? error.reason
                        : `notarytool submit exited with code ${invocation.exitCode}: ${error.reason}`,
                      stdout: invocation.stdout.text,
                      stderr: invocation.stderr.text,
                    })
                  ),
                );
                const persisted = yield* commitSubmitResponse(attempt, parsed.id);
                return { invocation, parsed, persisted, postAuthentication };
              }),
          ).pipe(
            Effect.catchTags({
              AppleToolUnavailable: (error) =>
                Effect.fail(
                  new UnknownSubmissionOutcome({
                    receiptPath,
                    reason: describe(error),
                    stdout: "",
                    stderr: "",
                  }),
                ),
              AppleToolChanged: (error) =>
                Effect.fail(
                  new UnknownSubmissionOutcome({
                    receiptPath,
                    reason: describe(error),
                    stdout: "",
                    stderr: "",
                  }),
                ),
              AppleToolFailed: (error) =>
                Effect.fail(
                  new UnknownSubmissionOutcome({
                    receiptPath,
                    reason: describe(error),
                    stdout: error.stdout,
                    stderr: error.stderr,
                  }),
                ),
            }),
          );
          const { invocation, parsed, persisted, postAuthentication } = committed;
          if (Exit.isFailure(postAuthentication)) {
            const found = Cause.findErrorOption(postAuthentication.cause);
            return yield* new UnknownSubmissionOutcome({
              receiptPath,
              reason: `notarytool changed after returning submission response: ${
                found._tag === "Some" ? describe(found.value) : Cause.pretty(postAuthentication.cause)
              }`,
              stdout: invocation.stdout.text,
              stderr: invocation.stderr.text,
            });
          }
          if (invocation.exitCode !== 0) {
            yield* Effect.ignore(Artifact.revalidate(transport.artifact));
            yield* Effect.ignore(Artifact.revalidate(input.artifact));
            return yield* new UnknownSubmissionOutcome({
              receiptPath,
              reason: `notarytool submit returned id ${parsed.id} but exited with code ${invocation.exitCode}`,
              stdout: invocation.stdout.text,
              stderr: invocation.stderr.text,
            });
          }
          // Once the service has returned a valid job identifier, durability wins over
          // every subsequent local check. A detected mutation can fail this call, but it
          // must never erase the only handle that prevents a blind resubmission.
          yield* Artifact.revalidate(transport.artifact);
          yield* Artifact.revalidate(input.artifact);
          return liveSubmission(persisted as SubmissionFields);
        }),
      ).pipe(Effect.provide(services));

    const info = (submission: Submission) => query("info", submission);
    const wait = (submission: Submission, waitOptions: WaitOptions) => {
      if (!duration.test(waitOptions.timeout)) {
        return Effect.fail(
          new NotaryConfigurationInvalid({
            field: "timeout",
            reason: "expected a positive integer with optional s, m, or h suffix",
          }),
        );
      }
      return query("wait", submission, ["--timeout", waitOptions.timeout]);
    };
    const raw = (
      operation: "history" | "log",
      args: readonly string[],
    ): Effect.Effect<RawJsonObservation, QueryError> =>
      Effect.gen(function*() {
        const invocation = yield* Tool.runOrFail({ tool: notarytool, args });
        yield* parseJson(operation, invocation.stdout.text);
        return canonicalCopy({ rawJson: invocation.stdout.text, notarytool });
      }).pipe(Effect.provide(services));
    const history = () => raw("history", ["history", ...credentials, "--output-format", "json", "--no-progress"]);
    const log = (submission: Submission): Effect.Effect<SubmissionLogObservation, QueryError> =>
      Effect.gen(function*() {
        yield* validateDurableSubmission(submission);
        const observation = yield* raw("log", ["log", submission.submissionId, ...credentials]);
        return canonicalCopy({
          submissionId: submission.submissionId,
          subject: submission.subject,
          transport: submission.transport,
          ...observation,
        });
      }).pipe(Effect.provide(services));

    return { submit, info, wait, log, history };
  });

export const submit = (input: SubmitInput): Effect.Effect<Submission, SubmitError, Notarizer> =>
  Notarizer.use((service) => service.submit(input));

export const info = (
  submission: Submission,
): Effect.Effect<SubmissionObservation, QueryError, Notarizer> => Notarizer.use((service) => service.info(submission));

export const wait = (
  submission: Submission,
  options: WaitOptions,
): Effect.Effect<SubmissionObservation, QueryError, Notarizer> =>
  Notarizer.use((service) => service.wait(submission, options));

export const log = (
  submission: Submission,
): Effect.Effect<SubmissionLogObservation, QueryError, Notarizer> =>
  Notarizer.use((service) => service.log(submission));

export const history = (): Effect.Effect<RawJsonObservation, QueryError, Notarizer> =>
  Notarizer.use((service) => service.history());

export const layer = (
  options: LayerOptions,
): Layer.Layer<
  Notarizer,
  Artifact.ToolError | NotaryConfigurationInvalid,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Notarizer, makeService(options));
