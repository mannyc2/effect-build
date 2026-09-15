import { Effect, FileSystem, Path, Redacted, Schema } from "effect";
import { Artifact, Tool } from "effect-build";
import { Apple, type Env } from "./Apple.js";
import { outputPath, runNative } from "./internal.js";
import type { Product } from "./Model.js";

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

export const Submission = Schema.Struct({
  submissionId: SubmissionId,
  producedBy: Artifact.Producer,
  status: Status,
  message: Schema.optionalKey(Schema.NonEmptyString),
});
export type Submission = typeof Submission.Type;
export const Info = Schema.Struct({
  ...Submission.fields,
  name: Schema.optionalKey(Schema.NonEmptyString),
  createdDate: Schema.optionalKey(Schema.NonEmptyString),
});
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
  submissionId: SubmissionId,
  producedBy: Artifact.Producer,
  status: Status,
  statusSummary: Schema.optionalKey(Schema.NonEmptyString),
  statusCode: Schema.optionalKey(Schema.Number),
  archiveFilename: Schema.optionalKey(Schema.NonEmptyString),
  issues: Schema.Array(LogIssue),
});
export type Log = typeof Log.Type;
export type Result = Submission | Info | Log;
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

/** An explicit release check; native wait/info/log still return every status. */
export const expectAccepted = <A extends Result>(result: A): Effect.Effect<A, ResultNotAccepted> =>
  result.status._tag === "Accepted" ? Effect.succeed(result)
    : Effect.fail(new ResultNotAccepted({ submissionId: result.submissionId, providerStatus: result.status.providerStatus }));

export type Credential =
  | { readonly kind: "keychain"; readonly profile: string; readonly keychain?: string | undefined }
  | { readonly kind: "api-key"; readonly keyFile: string; readonly keyId: string; readonly issuer: string }
  | { readonly kind: "apple-id"; readonly appleId: string; readonly teamId: string; readonly password: Redacted.Redacted<string> };
const credentials = Effect.fn("Apple.Notary.credentials")(function*(operation: string, credential: Credential) {
  const invalid = (reason: string) => new Tool.InputInvalid({ operation, reason });
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
      if (!Redacted.isRedacted(credential.password)) return yield* invalid("Apple ID password must be Redacted");
      const password = yield* Effect.try({ try: () => Redacted.value(credential.password), catch: () => invalid("Apple ID password is unavailable") });
      values = [credential.appleId, credential.teamId, password];
      args = ["--apple-id", credential.appleId, "--team-id", credential.teamId, "--password", password];
      break;
    }
    default: return yield* invalid("unknown notarization credential kind");
  }
  if (values.some((value) => typeof value !== "string" || Tool.argumentIssue(value) !== undefined)) {
    return yield* invalid("notarization credential fields must be non-empty and contain no NUL");
  }
  return { args, values };
});

/** notarytool subcommands; each is also the tail of its span name. */
type Operation = "submit" | "wait" | "info" | "log";
type LookupError = Tool.InputInvalid | ResponseInvalid | Tool.Failed | Tool.SpawnFailed;
const objectValue = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
const runJson = Effect.fn("Apple.Notary.runJson")(function*(operation: Operation, args: readonly string[], credential: Credential, options: Tool.EnvironmentOptions & { readonly cwd?: string | undefined } = {}) {
  const cwd = options.cwd;
  const cwdIssue = cwd === undefined ? undefined : Tool.argumentIssue(cwd);
  if (cwdIssue !== undefined) return yield* new Tool.InputInvalid({ operation: `Apple.Notary.${operation}`, reason: `cwd ${cwdIssue}` });
  const auth = yield* credentials(`Apple.Notary.${operation}`, credential);
  const completion = yield* runNative("notarytool", [operation, ...args, "--output-format", "json", ...auth.args], {
    ...options, cwd, redact: auth.values,
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

export interface SubmitInput extends Tool.EnvironmentOptions {
  readonly artifact: Product | Artifact.Executable;
  readonly credential: Credential;
  readonly cwd?: string | undefined;
}
export type NotarizeError = LookupError | Artifact.ArtifactError;
/** Upload once and return Apple's ID before waiting. Persist the ID to resume later. */
export const submit = (input: SubmitInput): Effect.Effect<SubmissionId, NotarizeError, Apple | Env> =>
  Effect.scoped(Effect.gen(function*() {
    const artifact = input.artifact;
    if (artifact.kind === "executable" && (artifact.format !== "mach-o" || !artifact.target.startsWith("darwin-"))) {
      return yield* new Tool.InputInvalid({ operation: "Apple.Notary.submit", reason: "executables must target Darwin and use Mach-O" });
    }
    const source = yield* outputPath("Apple.Notary.submit", artifact.path, artifact.kind === "executable" ? undefined : `.${artifact.product}`, input.cwd);
    let path = source;
    if (artifact.kind === "executable" || artifact.product === "app") {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-notary-" }).pipe(Effect.mapError(Artifact.ioError(source, "write")));
      path = p.join(temporary, `${p.basename(source)}.zip`);
      yield* runNative("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", source, path], input);
    }
    const response = yield* runJson("submit", [path], input.credential, input);
    return yield* submissionId("submit", response.safeText(response.data.id));
  }));

export interface NotarizeInput extends SubmitInput {
  /** Native notarytool duration, for example `30m`. A timeout does not cancel Apple's processing. */
  readonly timeout?: string | undefined;
}
const timeoutArgs = (operation: string, timeout?: string) => timeout !== undefined && !/^\d+(?:s|m|h)?$/u.test(timeout)
  ? Effect.fail(new Tool.InputInvalid({ operation, reason: "timeout must be an integer followed by an optional s, m, or h" }))
  : Effect.succeed(timeout === undefined ? [] : ["--timeout", timeout]);
/** Convenience composition. Use submit, persist its ID, then wait when interruption recovery matters. */
export const notarize = (input: NotarizeInput): Effect.Effect<Submission, NotarizeError, Apple | Env> =>
  Effect.gen(function*() {
    yield* timeoutArgs("Apple.Notary.notarize", input.timeout);
    const submissionId = yield* submit(input);
    return yield* wait({ ...input, submissionId });
  });

export interface LookupInput extends Tool.EnvironmentOptions {
  readonly submissionId: SubmissionId;
  readonly credential: Credential;
  readonly cwd?: string | undefined;
}
export interface WaitInput extends LookupInput {
  /** Native notarytool duration. A timeout leaves the submitted job available through info/log/wait. */
  readonly timeout?: string | undefined;
}
/** Look up a native submission ID without requiring a local artifact or prior wrapper result. */
const lookup = Effect.fn("Apple.Notary.lookup")(function*(operation: "wait" | "info" | "log", input: LookupInput, args: readonly string[] = []) {
  const requested = yield* Schema.decodeUnknownEffect(SubmissionId)(input.submissionId.toLowerCase()).pipe(
    Effect.mapError((error) => new Tool.InputInvalid({ operation: `Apple.Notary.${operation}`, reason: String(error) })),
  );
  const { tool } = yield* Apple;
  const response = yield* runJson(operation, [requested, ...args], input.credential, input);
  const id = yield* submissionId(operation, response.safeText(operation === "log" ? response.data.jobId : response.data.id));
  if (id !== requested) {
    return yield* new ResponseInvalid({ operation, reason: "response submission UUID differs from the requested UUID" });
  }
  return { response, base: { submissionId: id, producedBy: Tool.producedBy(tool) } };
});
/** Wait for an already persisted submission; never re-upload or retry submission. */
export const wait = Effect.fn("Apple.Notary.wait")(function*(input: WaitInput): Effect.fn.Return<Submission, LookupError, Apple | Env> {
  const args = yield* timeoutArgs("Apple.Notary.wait", input.timeout);
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
