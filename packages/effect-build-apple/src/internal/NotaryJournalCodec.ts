import { Effect, Schema } from "effect";
import * as Notary from "../Notary.js";

export const notaryJournalCodecId = "effect-build-apple/notary-journal@1" as const;

export type NotaryJournalValue =
  | Notary.Submission
  | Notary.SubmissionReference
  | Notary.Observation
  | Notary.Log
  | Notary.AcceptedReference;

export const NotaryJournalValueTag = Schema.Literals(
  [
    "Submission",
    "SubmissionReference",
    "Observation",
    "Log",
    "AcceptedReference",
  ] as const,
);
export type NotaryJournalValueTag = typeof NotaryJournalValueTag.Type;

const CodecOperation = Schema.Literals(["encode", "decode", "derive-reference"] as const);
const CodecReason = Schema.Literals(
  [
    "unsupported-value",
    "invalid-bytes",
    "invalid-json",
    "schema-invalid",
    "noncanonical-bytes",
    "correlation-invalid",
  ] as const,
);
type CodecReason = typeof CodecReason.Type;

export class NotaryJournalCodecError extends Schema.TaggedError<NotaryJournalCodecError>()(
  "NotaryJournalCodecError",
  {
    operation: CodecOperation,
    reason: CodecReason,
  },
) {
  override get message(): string {
    return `${this.operation} failed for ${notaryJournalCodecId}: ${this.reason}`;
  }
}

class CodecFailure extends Error {
  readonly reason: CodecReason;

  constructor(reason: CodecReason) {
    super(reason);
    this.reason = reason;
  }
}

const fail = (reason: CodecReason): never => {
  throw new CodecFailure(reason);
};

const maximumJournalBytes = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareUtf16 = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const assertNfcRecursive = (value: unknown, reason: CodecReason): void => {
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) return fail(reason);
    return;
  }
  if (Array.isArray(value)) {
    for (const element of value) assertNfcRecursive(element, reason);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, field] of Object.entries(value)) {
    if (key.normalize("NFC") !== key) return fail(reason);
    assertNfcRecursive(field, reason);
  }
};

const canonicalValue = (value: unknown): string => {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) return fail("schema-invalid");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fail("schema-invalid");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (!isRecord(value)) return fail("schema-invalid");
  return `{${
    Object.keys(value).sort(compareUtf16).map((key) => {
      if (key.normalize("NFC") !== key) return fail("schema-invalid");
      return `${JSON.stringify(key)}:${canonicalValue(value[key])}`;
    }).join(",")
  }}`;
};

const canonicalBytes = (value: unknown): Uint8Array => encoder.encode(`${canonicalValue(value)}\n`);

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const exactObject = (value: unknown, fields: readonly string[]): JsonRecord => {
  if (!isRecord(value)) return fail("schema-invalid");
  const actual = Object.keys(value).sort(compareUtf16);
  const expected = [...fields].sort(compareUtf16);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return fail("schema-invalid");
  return value;
};

const fieldsWithOptional = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): JsonRecord => {
  if (!isRecord(value)) return fail("schema-invalid");
  return exactObject(value, [...required, ...optional.filter((field) => Object.hasOwn(value, field))]);
};

const exactDigest = (value: unknown): JsonRecord => {
  const digest = exactObject(value, ["algorithm", "value"]);
  if (digest.algorithm !== "sha256" || typeof digest.value !== "string" || !/^[0-9a-f]{64}$/u.test(digest.value)) {
    return fail("schema-invalid");
  }
  return digest;
};

const exactContent = (value: unknown): void => {
  const content = exactObject(value, ["bytes", "digest"]);
  if (typeof content.bytes !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(content.bytes)) {
    return fail("schema-invalid");
  }
  exactDigest(content.digest);
};

const nonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !value.includes("\0");

type JournalToolName = "notarytool" | "ditto" | "codesign" | "pkgutil";

const exactProbeEvidence: Readonly<Record<JournalToolName, string>> = {
  notarytool: 'native probe ["--version"] admitted exit code 0',
  ditto: 'native probe ["--help"] admitted exit code 1',
  codesign: 'native probe ["--version"] admitted exit code 2',
  pkgutil: 'native probe ["--help"] admitted exit code 0',
};

const admittedCapabilities: Readonly<Record<JournalToolName, readonly string[]>> = {
  notarytool: ["notarization", "rejection-fixture-notarization"],
  ditto: ["archive-transport", "rejection-fixture-archive-transport"],
  codesign: ["signature-verification", "rejection-fixture-ad-hoc-signing"],
  pkgutil: ["package-signature-verification"],
};

const capabilityIdOf = (observation: JsonRecord): string => {
  const capabilities = observation.capabilities;
  if (!Array.isArray(capabilities) || !isRecord(capabilities[0]) || typeof capabilities[0].id !== "string") {
    return fail("schema-invalid");
  }
  return capabilities[0].id;
};

const exactSelectedToolObservation = (value: unknown, expectedName: JournalToolName): JsonRecord => {
  const observation = exactObject(value, ["name", "participants", "capabilities"]);
  if (
    observation.name !== expectedName || !Array.isArray(observation.participants)
    || observation.participants.length !== 1
    || !Array.isArray(observation.capabilities)
    || observation.capabilities.length !== 1
  ) {
    return fail("schema-invalid");
  }
  const participant = exactObject(
    observation.participants[0],
    ["role", "name", "version", "revision", "channel", "content"],
  );
  if (
    participant.role !== "selected-command"
    || participant.name !== expectedName
    || !nonEmptyText(participant.version)
    || participant.revision !== "caller-adjudicated-system-build"
    || participant.channel !== "system"
  ) {
    return fail("schema-invalid");
  }
  exactContent(participant.content);
  const capability = exactObject(observation.capabilities[0], ["_tag", "id", "evidence"]);
  if (
    capability._tag !== "Present"
    || !admittedCapabilities[expectedName].includes(capability.id as string)
    || capability.evidence !== exactProbeEvidence[expectedName]
  ) {
    return fail("schema-invalid");
  }
  return observation;
};

const exactCombinedToolObservation = (
  value: unknown,
  expectedNames: readonly [JournalToolName, ...JournalToolName[]],
): readonly JsonRecord[] => {
  const observation = exactObject(value, ["name", "participants", "capabilities"]);
  const participants = observation.participants;
  const capabilities = observation.capabilities;
  if (
    observation.name !== expectedNames[0]
    || !Array.isArray(participants)
    || participants.length !== expectedNames.length
    || !Array.isArray(capabilities)
    || capabilities.length !== expectedNames.length
  ) {
    return fail("correlation-invalid");
  }
  return expectedNames.map((name, index) => {
    const participant = participants[index];
    if (!isRecord(participant) || participant.name !== name) return fail("correlation-invalid");
    return exactSelectedToolObservation({
      name,
      participants: [participant],
      capabilities: [capabilities[index]],
    }, name);
  });
};

const exactStatus = (value: unknown): void => {
  if (!isRecord(value)) return fail("schema-invalid");
  if (value._tag === "Pending") {
    const status = exactObject(value, ["_tag", "providerStatus"]);
    if (!nonEmptyText(status.providerStatus)) return fail("schema-invalid");
  } else if (value._tag === "Accepted") {
    const status = exactObject(value, ["_tag", "providerStatus"]);
    if (status.providerStatus !== "Accepted") return fail("schema-invalid");
  } else if (value._tag === "Rejected") {
    const status = fieldsWithOptional(value, ["_tag", "providerStatus"], ["summary"]);
    if (!nonEmptyText(status.providerStatus)) return fail("schema-invalid");
    if (Object.hasOwn(status, "summary") && !nonEmptyText(status.summary)) return fail("schema-invalid");
  } else {
    return fail("schema-invalid");
  }
};

const exactStapleTarget = (value: unknown): JsonRecord => {
  const target = fieldsWithOptional(
    value,
    ["kind", "identityKind", "artifactBytes", "artifactDigest"],
    ["bundleName"],
  );
  if (target.kind !== "app" && target.kind !== "dmg" && target.kind !== "pkg") return fail("schema-invalid");
  if (target.identityKind !== "file-bytes" && target.identityKind !== "tree-manifest") {
    return fail("schema-invalid");
  }
  if (typeof target.artifactBytes !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(target.artifactBytes)) {
    return fail("schema-invalid");
  }
  exactDigest(target.artifactDigest);
  if (Object.hasOwn(target, "bundleName") && !nonEmptyText(target.bundleName)) return fail("schema-invalid");
  return target;
};

const exactLogIssue = (value: unknown): void => {
  const issue = fieldsWithOptional(value, ["severity", "message"], ["path", "code", "docUrl"]);
  for (const field of ["severity", "message"] as const) {
    if (!nonEmptyText(issue[field])) return fail("schema-invalid");
  }
  for (const field of ["path", "docUrl"] as const) {
    if (Object.hasOwn(issue, field) && !nonEmptyText(issue[field])) return fail("schema-invalid");
  }
  if (Object.hasOwn(issue, "code") && typeof issue.code !== "string") return fail("schema-invalid");
};

const exactCommon = (value: JsonRecord): void => {
  exactDigest(value.artifactDigest);
  if (Object.hasOwn(value, "tool")) exactSelectedToolObservation(value.tool, "notarytool");
  if (Object.hasOwn(value, "transportTool")) exactSelectedToolObservation(value.transportTool, "ditto");
  exactStapleTarget(value.stapleTarget);
};

const exactWireValue = (tag: NotaryJournalValueTag, value: unknown): JsonRecord => {
  let record: JsonRecord;
  switch (tag) {
    case "Submission":
      record = fieldsWithOptional(
        value,
        [
          "submissionId",
          "kind",
          "architecture",
          "artifactBytes",
          "artifactDigest",
          "status",
          "submissionTool",
          "tool",
          "stapleTarget",
        ],
        ["message", "transportTool"],
      );
      exactStatus(record.status);
      break;
    case "SubmissionReference":
      record = fieldsWithOptional(
        value,
        [
          "submissionId",
          "kind",
          "architecture",
          "artifactBytes",
          "artifactDigest",
          "submissionTool",
          "stapleTarget",
        ],
        ["transportTool"],
      );
      break;
    case "Observation":
      record = fieldsWithOptional(
        value,
        [
          "submissionId",
          "kind",
          "architecture",
          "artifactBytes",
          "artifactDigest",
          "status",
          "submissionTool",
          "tool",
          "stapleTarget",
        ],
        ["message", "name", "createdDate", "transportTool"],
      );
      exactStatus(record.status);
      break;
    case "Log":
      record = fieldsWithOptional(
        value,
        [
          "submissionId",
          "kind",
          "architecture",
          "artifactBytes",
          "artifactDigest",
          "status",
          "issues",
          "submissionTool",
          "tool",
          "stapleTarget",
        ],
        ["statusSummary", "statusCode", "archiveFilename", "transportTool"],
      );
      exactStatus(record.status);
      if (!Array.isArray(record.issues)) return fail("schema-invalid");
      for (const issue of record.issues) exactLogIssue(issue);
      break;
    case "AcceptedReference":
      record = fieldsWithOptional(
        value,
        [
          "submissionId",
          "kind",
          "architecture",
          "artifactBytes",
          "artifactDigest",
          "providerStatus",
          "submissionTool",
          "tool",
          "stapleTarget",
        ],
        ["transportTool"],
      );
      if (record.providerStatus !== "Accepted") return fail("schema-invalid");
      break;
  }
  exactCommon(record);
  return record;
};

const exactCorrelation = (tag: NotaryJournalValueTag, value: JsonRecord): void => {
  const kind = value.kind;
  const target = exactStapleTarget(value.stapleTarget);
  const transport = Object.hasOwn(value, "transportTool");
  let verifier: "codesign" | "pkgutil";
  if (kind === "zip") {
    verifier = "codesign";
    if (!transport) return fail("correlation-invalid");
    if (
      target.kind !== "app"
      || target.identityKind !== "tree-manifest"
      || !nonEmptyText(target.bundleName)
      || !target.bundleName.endsWith(".app")
    ) return fail("correlation-invalid");
  } else if (kind === "dmg" || kind === "pkg") {
    verifier = kind === "pkg" ? "pkgutil" : "codesign";
    if (transport) return fail("correlation-invalid");
    if (
      target.kind !== kind
      || target.identityKind !== "file-bytes"
      || Object.hasOwn(target, "bundleName")
      || target.artifactBytes !== value.artifactBytes
      || canonicalValue(target.artifactDigest) !== canonicalValue(value.artifactDigest)
    ) return fail("correlation-invalid");
  } else {
    return fail("schema-invalid");
  }
  const submissionComponents = exactCombinedToolObservation(value.submissionTool, ["notarytool", verifier]);
  const submissionCapabilities = submissionComponents.map(capabilityIdOf);
  if (kind === "zip") {
    const transportCapability = capabilityIdOf(exactSelectedToolObservation(value.transportTool, "ditto"));
    const tuple = [...submissionCapabilities, transportCapability];
    const normal = ["notarization", "signature-verification", "archive-transport"];
    const rejection = [
      "rejection-fixture-notarization",
      "rejection-fixture-ad-hoc-signing",
      "rejection-fixture-archive-transport",
    ];
    if (canonicalValue(tuple) !== canonicalValue(normal) && canonicalValue(tuple) !== canonicalValue(rejection)) {
      return fail("correlation-invalid");
    }
  } else {
    const expected = kind === "pkg"
      ? ["notarization", "package-signature-verification"]
      : ["notarization", "signature-verification"];
    if (canonicalValue(submissionCapabilities) !== canonicalValue(expected)) return fail("correlation-invalid");
  }
  if (
    tag === "Submission"
    && canonicalValue(submissionComponents[0]) !== canonicalValue(value.tool)
  ) {
    return fail("correlation-invalid");
  }
  if (
    (tag === "Observation" || tag === "Log" || tag === "AcceptedReference")
    && capabilityIdOf(exactSelectedToolObservation(value.tool, "notarytool")) !== "notarization"
  ) {
    return fail("correlation-invalid");
  }
};

const tagOf = (value: NotaryJournalValue): NotaryJournalValueTag => {
  if (value instanceof Notary.Submission) return "Submission";
  if (value instanceof Notary.SubmissionReference) return "SubmissionReference";
  if (value instanceof Notary.Observation) return "Observation";
  if (value instanceof Notary.Log) return "Log";
  if (value instanceof Notary.AcceptedReference) return "AcceptedReference";
  return fail("unsupported-value");
};

const schemaFor = (tag: NotaryJournalValueTag) => {
  switch (tag) {
    case "Submission":
      return Notary.Submission;
    case "SubmissionReference":
      return Notary.SubmissionReference;
    case "Observation":
      return Notary.Observation;
    case "Log":
      return Notary.Log;
    case "AcceptedReference":
      return Notary.AcceptedReference;
  }
};

const encodeWireValue = (tag: NotaryJournalValueTag, value: NotaryJournalValue): unknown => {
  switch (tag) {
    case "Submission":
      return Schema.encodeUnknownSync(Notary.Submission, { onExcessProperty: "error" })(value);
    case "SubmissionReference":
      return Schema.encodeUnknownSync(Notary.SubmissionReference, { onExcessProperty: "error" })(value);
    case "Observation":
      return Schema.encodeUnknownSync(Notary.Observation, { onExcessProperty: "error" })(value);
    case "Log":
      return Schema.encodeUnknownSync(Notary.Log, { onExcessProperty: "error" })(value);
    case "AcceptedReference":
      return Schema.encodeUnknownSync(Notary.AcceptedReference, { onExcessProperty: "error" })(value);
  }
};

const decodeWireValue = (tag: NotaryJournalValueTag, value: unknown): NotaryJournalValue =>
  Schema.decodeUnknownSync(schemaFor(tag), { onExcessProperty: "error" })(value) as NotaryJournalValue;

const encodeUnsafe = (value: NotaryJournalValue): Uint8Array => {
  const tag = tagOf(value);
  const wire = encodeWireValue(tag, value);
  assertNfcRecursive(wire, "schema-invalid");
  const record = exactWireValue(tag, wire);
  exactCorrelation(tag, record);
  const bytes = canonicalBytes({ codec: notaryJournalCodecId, type: tag, value: wire });
  if (bytes.byteLength === 0 || bytes.byteLength > maximumJournalBytes) return fail("invalid-bytes");
  return bytes;
};

const decodeUnsafe = (bytes: Uint8Array): NotaryJournalValue => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maximumJournalBytes) {
    return fail("invalid-bytes");
  }
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return fail("invalid-bytes");
  }
  if (!text.endsWith("\n")) return fail("noncanonical-bytes");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch {
    return fail("invalid-json");
  }
  assertNfcRecursive(parsed, "noncanonical-bytes");
  const envelope = exactObject(parsed, ["codec", "type", "value"]);
  if (envelope.codec !== notaryJournalCodecId || !Schema.is(NotaryJournalValueTag)(envelope.type)) {
    return fail("schema-invalid");
  }
  const tag = envelope.type;
  const record = exactWireValue(tag, envelope.value);
  exactCorrelation(tag, record);
  const decoded = decodeWireValue(tag, envelope.value);
  if (!sameBytes(bytes, encodeUnsafe(decoded))) return fail("noncanonical-bytes");
  return decoded;
};

const codecError = (
  operation: typeof CodecOperation.Type,
  cause: unknown,
): NotaryJournalCodecError =>
  new NotaryJournalCodecError({
    operation,
    reason: cause instanceof CodecFailure ? cause.reason : "schema-invalid",
  });

export const encodeNotaryJournalValue = (
  value: NotaryJournalValue,
): Effect.Effect<Uint8Array, NotaryJournalCodecError> =>
  Effect.try({
    try: () => encodeUnsafe(value),
    catch: (cause) => codecError("encode", cause),
  });

export const decodeNotaryJournalValue = (
  bytes: Uint8Array,
): Effect.Effect<NotaryJournalValue, NotaryJournalCodecError> =>
  Effect.try({
    try: () => decodeUnsafe(bytes),
    catch: (cause) => codecError("decode", cause),
  });

export const submissionReferenceFromSubmission = (
  submission: Notary.Submission,
): Effect.Effect<Notary.SubmissionReference, NotaryJournalCodecError> =>
  Effect.try({
    try: () => {
      const wire = encodeWireValue("Submission", submission);
      const record = exactWireValue("Submission", wire);
      exactCorrelation("Submission", record);
      const reference = new Notary.SubmissionReference({
        submissionId: submission.submissionId,
        kind: submission.kind,
        architecture: submission.architecture,
        artifactBytes: submission.artifactBytes,
        artifactDigest: submission.artifactDigest,
        submissionTool: submission.submissionTool,
        ...(submission.stapleTarget === undefined ? {} : { stapleTarget: submission.stapleTarget }),
        ...(submission.transportTool === undefined ? {} : { transportTool: submission.transportTool }),
      });
      encodeUnsafe(reference);
      return reference;
    },
    catch: (cause) => codecError("derive-reference", cause),
  });
