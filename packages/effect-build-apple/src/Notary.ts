import { Effect, FileSystem, Path, Redacted, Schema } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, InputInvalid, type Env } from "./Apple.js";
import { copyProduct, runNative, verifySignature } from "./internal.js";
import { Signed } from "./Model.js";

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

/** Apps and standalone executables upload as ZIP archives; disk images and installers upload as themselves. */
export const submissionKind = (artifact: Signed): SubmissionKind => "product" in artifact && artifact.product !== "app" ? artifact.product : "zip";
const matchingKind = Schema.makeFilter((value: { readonly kind: SubmissionKind; readonly artifact: Signed }) =>
  value.kind === submissionKind(value.artifact) ? undefined : "submission kind does not match its artifact");
export const SubmissionReference = Schema.Struct({
  submissionId: SubmissionId,
  kind: SubmissionKind,
  artifact: Signed,
  producedBy: Artifact.Producer,
}).check(matchingKind);
export type SubmissionReference = typeof SubmissionReference.Type;
export const Submission = Schema.Struct({ ...SubmissionReference.fields, status: Status, message: Schema.optionalKey(Schema.NonEmptyString) }).check(matchingKind);
export type Submission = typeof Submission.Type;
export const Info = Schema.Struct({
  ...Submission.fields,
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
  ...SubmissionReference.fields,
  status: Status,
  statusSummary: Schema.optionalKey(Schema.NonEmptyString),
  statusCode: Schema.optionalKey(Schema.Number),
  archiveFilename: Schema.optionalKey(Schema.NonEmptyString),
  issues: Schema.Array(LogIssue),
}).check(matchingKind);
export type Log = typeof Log.Type;
export type Result = Submission | Info | Log;
export const AcceptedReference = Schema.Struct({ ...SubmissionReference.fields, providerStatus: Schema.Literal("Accepted") }).check(matchingKind);
export type AcceptedReference = typeof AcceptedReference.Type;

export class ResultNotAccepted extends Schema.TaggedError<ResultNotAccepted>()("NotaryResultNotAccepted", {
  submissionId: SubmissionId,
  providerStatus: Schema.String,
}) {
  override get message(): string { return `Apple notarization ${this.submissionId} is ${this.providerStatus}`; }
}
export class ResponseInvalid extends Schema.TaggedError<ResponseInvalid>()("NotaryResponseInvalid", {
  operation: Schema.Literals(["submit", "wait", "info", "log"] as const),
  reason: Schema.String,
}) {
  override get message(): string {
    return `notarytool ${this.operation}: ${this.reason}`;
  }
}

const reference = (value: SubmissionReference) => Schema.decodeUnknownEffect(SubmissionReference)(value).pipe(
  Effect.mapError((error) => new InputInvalid({ reason: String(error) })),
  // A persisted reference may include additional artifact refinements; retain the original record.
  Effect.as(value),
);
export const acceptedReference = Effect.fn("Apple.Notary.acceptedReference")(function*(result: Result): Effect.fn.Return<AcceptedReference, ResultNotAccepted | InputInvalid> {
  yield* reference(result);
  const status = yield* Schema.decodeUnknownEffect(Status)(result.status).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
  if (status._tag !== "Accepted") return yield* new ResultNotAccepted({ submissionId: result.submissionId, providerStatus: status.providerStatus });
  return { submissionId: result.submissionId, kind: result.kind, artifact: result.artifact, producedBy: result.producedBy, providerStatus: "Accepted" };
});

export type Credential =
  | { readonly kind: "keychain"; readonly profile: string; readonly keychain?: string | undefined }
  | { readonly kind: "api-key"; readonly keyFile: string; readonly keyId: string; readonly issuer: string }
  | { readonly kind: "apple-id"; readonly appleId: string; readonly teamId: string; readonly password: Redacted.Redacted<string> };
const credentials = Effect.fn("Apple.Notary.credentials")(function*(credential: Credential) {
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
  if (values.some((value) => typeof value !== "string" || Tool.argumentIssue(value) !== undefined)) {
    return yield* new InputInvalid({ reason: "notarization credential fields must be non-empty and contain no NUL" });
  }
  return { args, values };
});

type Operation = "submit" | "wait" | "info" | "log";
type LookupError = InputInvalid | ResponseInvalid | Tool.Failed | Tool.SpawnFailed;
const objectValue = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
const runJson = Effect.fn("Apple.Notary.runJson")(function*(operation: Operation, args: readonly string[], credential: Credential, cwd?: string) {
  const cwdIssue = cwd === undefined ? undefined : Tool.argumentIssue(cwd);
  if (cwdIssue !== undefined) return yield* new InputInvalid({ reason: `cwd ${cwdIssue}` });
  const auth = yield* credentials(credential);
  const completion = yield* runNative("notarytool", [operation, ...args, "--output-format", "json", ...auth.args], {
    cwd, redact: auth.values,
  });
  const value = yield* Effect.try({
    try: (): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(completion.stdout)),
    // JSON parse errors can contain source excerpts, so do not retain a native response in the error.
    catch: () => new ResponseInvalid({ operation, reason: "notarytool returned invalid UTF-8 JSON" }),
  });
  const data = objectValue(value);
  if (data === undefined) return yield* new ResponseInvalid({ operation, reason: "expected one JSON object" });
  // Successful responses are data, which Tool.run leaves raw; credentials echoed in them are scrubbed here.
  const scrub = Tool.redact(auth.values);
  const safeText = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? scrub(value) : undefined;
  return { data, safeText };
});
/** Drop absent optional fields, so a record matches a schema that declares them as optional keys. */
const present = <T extends Record<string, unknown>>(fields: T): { readonly [K in keyof T]?: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as { readonly [K in keyof T]?: Exclude<T[K], undefined> };
const submissionId = (operation: Operation, value: string | undefined) => {
  const canonical = value?.toLowerCase();
  return Schema.is(SubmissionId)(canonical)
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

export interface SubmitInput {
  readonly artifact: Signed;
  readonly credential: Credential;
  readonly cwd?: string | undefined;
}
export type NotarizeError = LookupError | Artifact.ArtifactError;
/** Upload once and return the submission ID before waiting. Persist this reference to recover after interruption. */
export const submit = (input: SubmitInput): Effect.Effect<SubmissionReference, NotarizeError, Apple | Env> =>
  Effect.scoped(Effect.gen(function*() {
    yield* Schema.decodeUnknownEffect(Signed)(input.artifact).pipe(Effect.mapError((error) => new InputInvalid({ reason: String(error) })));
    const { tool } = yield* Apple;
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-notary-" }).pipe(Effect.mapError(Artifact.ioError(input.artifact.path, "write")));
    const snapshot = p.join(temporary, p.basename(input.artifact.path));
    // Upload a verified private copy so changes to the caller's file cannot change the submitted bytes.
    yield* copyProduct(input.artifact, snapshot);
    yield* verifySignature(input.artifact, snapshot);
    let path = snapshot;
    const kind = submissionKind(input.artifact);
    if (kind === "zip") {
      path = p.join(temporary, `${p.basename(input.artifact.path)}.zip`);
      yield* runNative("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", snapshot, path]);
    }
    const response = yield* runJson("submit", [path], input.credential, input.cwd);
    const id = yield* submissionId("submit", response.safeText(response.data.id));
    return { submissionId: id, kind, artifact: input.artifact, producedBy: Tool.producer(tool) };
  }));

export interface NotarizeInput extends SubmitInput {
  /** Native notarytool duration, for example `30m`. A timeout does not cancel Apple's processing. */
  readonly timeout?: string | undefined;
}
const timeoutArgs = (timeout?: string) => timeout !== undefined && !/^\d+(?:s|m|h)?$/u.test(timeout)
  ? Effect.fail(new InputInvalid({ reason: "timeout must be an integer followed by an optional s, m, or h" }))
  : Effect.succeed(timeout === undefined ? [] : ["--timeout", timeout]);
/** Convenience composition. Use submit, persist its reference, then wait when interruption recovery matters. */
export const notarize = (input: NotarizeInput): Effect.Effect<Submission, NotarizeError, Apple | Env> =>
  Effect.gen(function*() {
    yield* timeoutArgs(input.timeout);
    const reference = yield* submit(input);
    return yield* wait({ reference, credential: input.credential, timeout: input.timeout, cwd: input.cwd });
  });

export interface LookupInput {
  readonly reference: SubmissionReference;
  readonly credential: Credential;
  readonly cwd?: string | undefined;
}
export interface WaitInput extends LookupInput {
  /** Native notarytool duration. A timeout leaves the submitted job available through info/log/wait. */
  readonly timeout?: string | undefined;
}
/**
 * Every lookup checks the persisted reference, asks notarytool about its ID, and confirms the
 * response names that ID. The local artifact is never touched: a persisted ID stays useful
 * after the file has moved or been removed.
 */
const lookup = Effect.fn("Apple.Notary.lookup")(function*(operation: "wait" | "info" | "log", input: LookupInput, args: readonly string[] = []) {
  yield* reference(input.reference);
  const { tool } = yield* Apple;
  const response = yield* runJson(operation, [input.reference.submissionId, ...args], input.credential, input.cwd);
  // The log response names the submission `jobId`; the others name it `id`.
  const id = yield* submissionId(operation, response.safeText(operation === "log" ? response.data.jobId : response.data.id));
  if (id !== input.reference.submissionId) {
    return yield* new ResponseInvalid({ operation, reason: "response submission UUID differs from the requested UUID" });
  }
  const { kind, artifact } = input.reference;
  return { response, base: { submissionId: id, kind, artifact, producedBy: Tool.producer(tool) } };
});
/** Wait for an already persisted submission; never re-upload or retry submission. */
export const wait = Effect.fn("Apple.Notary.wait")(function*(input: WaitInput): Effect.fn.Return<Submission, LookupError, Apple | Env> {
  const args = yield* timeoutArgs(input.timeout);
  const { response, base } = yield* lookup("wait", input, args);
  const message = response.safeText(response.data.message);
  return { ...base, status: yield* status("wait", response.safeText(response.data.status), message), ...present({ message }) };
});
export const info = Effect.fn("Apple.Notary.info")(function*(input: LookupInput): Effect.fn.Return<Info, LookupError, Apple | Env> {
  const { response, base } = yield* lookup("info", input);
  const message = response.safeText(response.data.message);
  return {
    ...base,
    status: yield* status("info", response.safeText(response.data.status), message),
    ...present({ message, name: response.safeText(response.data.name), createdDate: response.safeText(response.data.createdDate) }),
  };
});
export const log = Effect.fn("Apple.Notary.log")(function*(input: LookupInput): Effect.fn.Return<Log, LookupError, Apple | Env> {
  const { response, base } = yield* lookup("log", input);
  const nativeIssues = response.data.issues ?? [];
  if (!Array.isArray(nativeIssues)) return yield* new ResponseInvalid({ operation: "log", reason: "issues must be an array or null" });
  const issues = yield* Effect.forEach(nativeIssues, (value: unknown, index) => Effect.gen(function*() {
    const issue = objectValue(value);
    const severity = response.safeText(issue?.severity);
    const message = response.safeText(issue?.message);
    if (severity === undefined || message === undefined) return yield* new ResponseInvalid({ operation: "log", reason: `issues[${index}] lacks severity or message` });
    return {
      severity,
      message,
      ...present({
        path: response.safeText(issue?.path),
        code: response.safeText(typeof issue?.code === "number" ? String(issue.code) : issue?.code),
        docUrl: response.safeText(issue?.docUrl),
        architecture: response.safeText(issue?.architecture),
      }),
    };
  }));
  const statusSummary = response.safeText(response.data.statusSummary);
  return {
    ...base,
    status: yield* status("log", response.safeText(response.data.status), statusSummary),
    issues,
    ...present({
      statusSummary,
      statusCode: typeof response.data.statusCode === "number" ? response.data.statusCode : undefined,
      archiveFilename: response.safeText(response.data.archiveFilename),
    }),
  };
});
