import { Effect, FileSystem, Path, Redacted, Schema } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { copyProduct, fileError, runNative, textValid, verifySignature } from "./internal.js";
import { SignedProduct } from "./Model.js";

export const SubmissionKind = Schema.Literals(["zip", "dmg", "pkg"] as const);
export type SubmissionKind = typeof SubmissionKind.Type;
export const SubmissionId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u));
export type SubmissionId = typeof SubmissionId.Type;
export const Pending = Schema.TaggedStruct("Pending", { providerStatus: Schema.NonEmptyString });
export type Pending = typeof Pending.Type;
export const Accepted = Schema.TaggedStruct("Accepted", { providerStatus: Schema.Literal("Accepted") });
export type Accepted = typeof Accepted.Type;
export const Rejected = Schema.TaggedStruct("Rejected", { providerStatus: Schema.NonEmptyString, summary: Schema.optionalKey(Schema.NonEmptyString) });
export type Rejected = typeof Rejected.Type;
export const Status = Schema.Union([Pending, Accepted, Rejected]);
export type Status = typeof Status.Type;

const referenceFields = {
  submissionId: SubmissionId,
  kind: SubmissionKind,
  artifact: SignedProduct,
  producedBy: Artifact.Producer,
};
const matchingKind = Schema.makeFilter((value: { readonly kind: SubmissionKind; readonly artifact: SignedProduct }) =>
  value.kind === (value.artifact.product === "app" ? "zip" : value.artifact.product)
    ? undefined
    : "submission kind does not match its artifact product");
export const SubmissionReference = Schema.Struct(referenceFields).check(matchingKind);
export type SubmissionReference = typeof SubmissionReference.Type;
export const Submission = Schema.Struct({ ...referenceFields, status: Status, message: Schema.optionalKey(Schema.NonEmptyString) }).check(matchingKind);
export type Submission = typeof Submission.Type;
export const Info = Schema.Struct({
  ...referenceFields,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
  name: Schema.optionalKey(Schema.NonEmptyString),
  createdDate: Schema.optionalKey(Schema.NonEmptyString),
}).check(matchingKind);
export type Info = typeof Info.Type;
export const LogIssue = Schema.Struct({
  severity: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  path: Schema.optionalKey(Schema.NonEmptyString),
  code: Schema.optionalKey(Schema.String),
  docUrl: Schema.optionalKey(Schema.NonEmptyString),
  architecture: Schema.optionalKey(Schema.NonEmptyString),
});
export type LogIssue = typeof LogIssue.Type;
export const Log = Schema.Struct({
  ...referenceFields,
  status: Status,
  statusSummary: Schema.optionalKey(Schema.NonEmptyString),
  statusCode: Schema.optionalKey(Schema.Number),
  archiveFilename: Schema.optionalKey(Schema.NonEmptyString),
  issues: Schema.Array(LogIssue),
}).check(matchingKind);
export type Log = typeof Log.Type;
export type Result = Submission | Info | Log;
export const AcceptedReference = Schema.Struct({ ...referenceFields, providerStatus: Schema.Literal("Accepted") }).check(matchingKind);
export type AcceptedReference = typeof AcceptedReference.Type;

export class ResultNotAccepted extends Schema.TaggedError<ResultNotAccepted>()("NotaryResultNotAccepted", {
  submissionId: SubmissionId,
  providerStatus: Schema.String,
}) {
  override get message(): string { return `Apple notarization ${this.submissionId} is ${this.providerStatus}`; }
}
export class ResponseInvalid extends Schema.TaggedError<ResponseInvalid>()("NotaryResponseInvalid", {
  operation: Schema.Literals(["submit", "info", "log"] as const),
  reason: Schema.String,
}) {}

const reference = (value: SubmissionReference) => Schema.decodeUnknownEffect(SubmissionReference)(value).pipe(
  Effect.mapError((error) => new InputInvalid({ reason: String(error) })),
  // A persisted reference may include additional artifact refinements; retain the original record.
  Effect.as(value),
);
export const acceptedReference = (result: Result): Effect.Effect<AcceptedReference, ResultNotAccepted | InputInvalid> =>
  Effect.gen(function*() {
    yield* reference(result);
    const status = yield* Schema.decodeUnknownEffect(Status)(result.status).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    if (status._tag !== "Accepted") return yield* new ResultNotAccepted({ submissionId: result.submissionId, providerStatus: status.providerStatus });
    return { submissionId: result.submissionId, kind: result.kind, artifact: result.artifact, producedBy: result.producedBy, providerStatus: "Accepted" };
  });

export type Credential =
  | { readonly kind: "keychain"; readonly profile: string; readonly keychain?: string }
  | { readonly kind: "api-key"; readonly keyFile: string; readonly keyId: string; readonly issuer: string }
  | { readonly kind: "apple-id"; readonly appleId: string; readonly teamId: string; readonly password: Redacted.Redacted<string> };
const credentials = (credential: Credential) => Effect.gen(function*() {
  let args: string[];
  let values: string[];
  switch (credential.kind) {
    case "keychain":
      values = [credential.profile, ...(credential.keychain === undefined ? [] : [credential.keychain])];
      args = ["--keychain-profile", credential.profile, ...(credential.keychain === undefined ? [] : ["--keychain", credential.keychain])];
      break;
    case "api-key":
      values = [credential.keyFile, credential.keyId, credential.issuer];
      args = ["--key", credential.keyFile, "--key-id", credential.keyId, "--issuer", credential.issuer];
      break;
    case "apple-id": {
      if (!Redacted.isRedacted(credential.password)) return yield* new InputInvalid({ reason: "Apple ID password must be Redacted" });
      const password = yield* Effect.try({ try: () => Redacted.value(credential.password), catch: () => new InputInvalid({ reason: "Apple ID password is unavailable" }) });
      values = [credential.appleId, credential.teamId, password];
      args = ["--apple-id", credential.appleId, "--team-id", credential.teamId, "--password", password];
      break;
    }
    default: return yield* new InputInvalid({ reason: "unknown notarization credential kind" });
  }
  if (values.some((value) => typeof value !== "string" || !textValid(value))) {
    return yield* new InputInvalid({ reason: "notarization credential fields must be non-empty and contain no NUL" });
  }
  return { args, values };
});

type Operation = "submit" | "info" | "log";
type LookupError = InputInvalid | ResponseInvalid | Tool.Failed | Tool.SpawnFailed;
const objectValue = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
const runJson = (operation: Operation, args: readonly string[], credential: Credential, cwd?: string) => Effect.gen(function*() {
  if (cwd !== undefined && !textValid(cwd)) return yield* new InputInvalid({ reason: "cwd must be non-empty and contain no NUL" });
  const auth = yield* credentials(credential);
  const completion = yield* runNative("notarytool", [operation, ...args, "--output-format", "json", ...auth.args], {
    ...(cwd === undefined ? {} : { cwd }), redact: auth.values,
  });
  const value = yield* Effect.try({
    try: (): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(completion.stdout)),
    // JSON parse errors can contain source excerpts, so do not retain a native response in the error.
    catch: () => new ResponseInvalid({ operation, reason: "notarytool returned invalid UTF-8 JSON" }),
  });
  const data = objectValue(value);
  if (data === undefined) return yield* new ResponseInvalid({ operation, reason: "expected one JSON object" });
  const safeText = (value: unknown): string | undefined => typeof value === "string" && value.length > 0
    ? auth.values.reduce((text, secret) => text.replaceAll(secret, "<redacted>"), value)
    : undefined;
  return { data, safeText };
});
const submissionId = (operation: Operation, value: string | undefined) => {
  const canonical = value?.toLowerCase();
  return canonical !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(canonical)
    ? Effect.succeed(canonical)
    : Effect.fail(new ResponseInvalid({ operation, reason: "response is missing a valid submission UUID" }));
};
const status = (operation: Operation, providerStatus: string | undefined, summary?: string): Effect.Effect<Status, ResponseInvalid> => {
  switch (providerStatus?.trim().toLowerCase()) {
    case "accepted": return Effect.succeed({ _tag: "Accepted", providerStatus: "Accepted" });
    case "in progress": case "in-progress": case "submitted": return Effect.succeed({ _tag: "Pending", providerStatus: providerStatus! });
    case "invalid": case "rejected": return Effect.succeed({ _tag: "Rejected", providerStatus: providerStatus!, ...(summary === undefined ? {} : { summary }) });
    default: return Effect.fail(new ResponseInvalid({ operation, reason: "response has a missing or unrecognized status" }));
  }
};

export interface NotarizeInput {
  readonly artifact: SignedProduct;
  readonly credential: Credential;
  /** Native notarytool duration, for example `30m`. A timeout does not cancel Apple's processing. */
  readonly timeout?: string;
  readonly cwd?: string;
}
export type NotarizeError = LookupError | Artifact.ArtifactError;
export const notarize = (input: NotarizeInput): Effect.Effect<Submission, NotarizeError, Apple | Env> =>
  Effect.scoped(Effect.gen(function*() {
    yield* Schema.decodeUnknownEffect(SignedProduct)(input.artifact).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    if (input.timeout !== undefined && !/^\d+(?:s|m|h)?$/u.test(input.timeout)) {
      return yield* new InputInvalid({ reason: "timeout must be an integer followed by an optional s, m, or h" });
    }
    const { tool } = yield* Apple;
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-notary-" }).pipe(Effect.mapError(fileError(input.artifact.path)));
    const snapshot = p.join(temporary, p.basename(input.artifact.path));
    // Upload a verified private copy so changes to the caller's file cannot change the submitted bytes.
    yield* copyProduct(input.artifact, snapshot);
    yield* verifySignature(input.artifact, snapshot);
    let path = snapshot;
    const kind = input.artifact.product === "app" ? "zip" : input.artifact.product;
    if (input.artifact.product === "app") {
      path = p.join(temporary, `${p.basename(input.artifact.path)}.zip`);
      yield* runNative("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", snapshot, path]);
    }
    const response = yield* runJson("submit", [path, "--wait", ...(input.timeout === undefined ? [] : ["--timeout", input.timeout])], input.credential, input.cwd);
    const id = yield* submissionId("submit", response.safeText(response.data.id));
    const message = response.safeText(response.data.message);
    return {
      submissionId: id, kind, artifact: input.artifact, producedBy: Tool.producer(tool),
      status: yield* status("submit", response.safeText(response.data.status), message),
      ...(message === undefined ? {} : { message }),
    };
  }));

export interface LookupInput {
  readonly reference: SubmissionReference;
  readonly credential: Credential;
  readonly cwd?: string;
}
export const info = (input: LookupInput): Effect.Effect<Info, LookupError, Apple | Env> => Effect.gen(function*() {
  yield* reference(input.reference);
  const { tool } = yield* Apple;
  // A persisted ID remains useful after the local artifact has moved or been removed.
  const response = yield* runJson("info", [input.reference.submissionId], input.credential, input.cwd);
  const id = yield* submissionId("info", response.safeText(response.data.id));
  if (id !== input.reference.submissionId) return yield* new ResponseInvalid({ operation: "info", reason: "response submission UUID differs from the requested UUID" });
  const message = response.safeText(response.data.message);
  const name = response.safeText(response.data.name);
  const createdDate = response.safeText(response.data.createdDate);
  return {
    submissionId: id, kind: input.reference.kind, artifact: input.reference.artifact, producedBy: Tool.producer(tool),
    status: yield* status("info", response.safeText(response.data.status), message),
    ...(message === undefined ? {} : { message }), ...(name === undefined ? {} : { name }), ...(createdDate === undefined ? {} : { createdDate }),
  };
});
export const log = (input: LookupInput): Effect.Effect<Log, LookupError, Apple | Env> => Effect.gen(function*() {
  yield* reference(input.reference);
  const { tool } = yield* Apple;
  const response = yield* runJson("log", [input.reference.submissionId], input.credential, input.cwd);
  const id = yield* submissionId("log", response.safeText(response.data.jobId));
  if (id !== input.reference.submissionId) return yield* new ResponseInvalid({ operation: "log", reason: "response submission UUID differs from the requested UUID" });
  const nativeIssues = response.data.issues ?? [];
  if (!Array.isArray(nativeIssues)) return yield* new ResponseInvalid({ operation: "log", reason: "issues must be an array or null" });
  const issues: LogIssue[] = [];
  for (const [index, value] of nativeIssues.entries()) {
    const issue = objectValue(value);
    const severity = response.safeText(issue?.severity);
    const message = response.safeText(issue?.message);
    if (severity === undefined || message === undefined) return yield* new ResponseInvalid({ operation: "log", reason: `issues[${index}] lacks severity or message` });
    const path = response.safeText(issue?.path);
    const code = response.safeText(typeof issue?.code === "number" ? String(issue.code) : issue?.code);
    const docUrl = response.safeText(issue?.docUrl);
    const architecture = response.safeText(issue?.architecture);
    issues.push({ severity, message, ...(path === undefined ? {} : { path }), ...(code === undefined ? {} : { code }), ...(docUrl === undefined ? {} : { docUrl }), ...(architecture === undefined ? {} : { architecture }) });
  }
  const statusSummary = response.safeText(response.data.statusSummary);
  const archiveFilename = response.safeText(response.data.archiveFilename);
  const statusCode = typeof response.data.statusCode === "number" ? response.data.statusCode : undefined;
  return {
    submissionId: id, kind: input.reference.kind, artifact: input.reference.artifact, producedBy: Tool.producer(tool),
    status: yield* status("log", response.safeText(response.data.status), statusSummary), issues,
    ...(statusSummary === undefined ? {} : { statusSummary }), ...(statusCode === undefined ? {} : { statusCode }), ...(archiveFilename === undefined ? {} : { archiveFilename }),
  };
});
