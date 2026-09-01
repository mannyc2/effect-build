import { Cause, Effect, Exit } from "effect";
import * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";
import { describe, expect, it } from "vitest";
import { combineToolObservations } from "../src/internal.js";
import {
  decodeNotaryJournalValue,
  encodeNotaryJournalValue,
  notaryJournalCodecId,
  submissionReferenceFromSubmission,
} from "../src/internal/NotaryJournalCodec.js";
import * as Notary from "../src/Notary.js";

const digest = (character: string): Artifact.Digest => Artifact.sha256Digest(character.repeat(64));

const observation = <const Name extends "notarytool" | "ditto" | "codesign" | "pkgutil">(
  name: Name,
  character: string,
  capabilityId = {
    notarytool: "notarization",
    ditto: "archive-transport",
    codesign: "signature-verification",
    pkgutil: "package-signature-verification",
  }[name],
): Tool.Observation<Name> => ({
  name,
  participants: [{
    role: "selected-command",
    name,
    version: "18.0",
    revision: "caller-adjudicated-system-build",
    channel: "system",
    content: { bytes: Artifact.decimalBytes("1"), digest: digest(character) },
  }],
  capabilities: [{
    _tag: "Present",
    id: capabilityId,
    evidence: {
      notarytool: 'native probe ["--version"] admitted exit code 0',
      ditto: 'native probe ["--help"] admitted exit code 1',
      codesign: 'native probe ["--version"] admitted exit code 2',
      pkgutil: 'native probe ["--help"] admitted exit code 0',
    }[name],
  }],
});

const submissionNotarytool = observation("notarytool", "a");
const continuationTool = observation("notarytool", "b");
const transportTool = observation("ditto", "c");
const structuralVerifier = observation("codesign", "f");
const packageStructuralVerifier = observation("pkgutil", "9");
const submissionTool = combineToolObservations(submissionNotarytool, structuralVerifier);
const packageSubmissionTool = combineToolObservations(submissionNotarytool, packageStructuralVerifier);
const submittedDigest = digest("d");
const targetDigest = digest("e");
const submissionId = "11111111-1111-1111-1111-111111111111" as Notary.SubmissionId;

const appTarget = new Notary.StapleTarget({
  kind: "app",
  identityKind: "tree-manifest",
  artifactBytes: Artifact.decimalBytes("41"),
  artifactDigest: targetDigest,
  bundleName: "effect-build.app",
});

const packageTarget = new Notary.StapleTarget({
  kind: "pkg",
  identityKind: "file-bytes",
  artifactBytes: Artifact.decimalBytes("53"),
  artifactDigest: submittedDigest,
});

const submission = new Notary.Submission({
  submissionId,
  kind: "zip",
  architecture: "arm64",
  artifactBytes: Artifact.decimalBytes("53"),
  artifactDigest: submittedDigest,
  status: new Notary.Pending({ providerStatus: "Submitted" }),
  message: "submission accepted for processing",
  submissionTool,
  tool: submissionNotarytool,
  stapleTarget: appTarget,
  transportTool,
});

const acceptedObservation = new Notary.Observation({
  submissionId,
  kind: "zip",
  architecture: "arm64",
  artifactBytes: Artifact.decimalBytes("53"),
  artifactDigest: submittedDigest,
  status: new Notary.Accepted({ providerStatus: "Accepted" }),
  message: "accepted",
  name: "effect-build.zip",
  createdDate: "2026-08-30T12:00:00Z",
  submissionTool,
  tool: continuationTool,
  stapleTarget: appTarget,
  transportTool,
});

const rejectedLog = new Notary.Log({
  submissionId,
  kind: "zip",
  architecture: "arm64",
  artifactBytes: Artifact.decimalBytes("53"),
  artifactDigest: submittedDigest,
  status: new Notary.Rejected({ providerStatus: "Invalid", summary: "signature rejected" }),
  statusSummary: "signature rejected",
  statusCode: 4000,
  archiveFilename: "effect-build.zip",
  issues: [
    new Notary.LogIssue({
      severity: "error",
      message: "missing Developer ID signature",
      path: "effect-build.app",
      code: "invalid-signature",
      docUrl: "https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution",
    }),
  ],
  submissionTool,
  tool: continuationTool,
  stapleTarget: appTarget,
  transportTool,
});

const packageSubmission = new Notary.Submission({
  submissionId,
  kind: "pkg",
  architecture: "arm64",
  artifactBytes: Artifact.decimalBytes("53"),
  artifactDigest: submittedDigest,
  status: new Notary.Pending({ providerStatus: "Submitted" }),
  submissionTool: packageSubmissionTool,
  tool: submissionNotarytool,
  stapleTarget: packageTarget,
});

const rejectionFixtureNotarytool = observation("notarytool", "7", "rejection-fixture-notarization");
const rejectionFixtureVerifier = observation("codesign", "8", "rejection-fixture-ad-hoc-signing");
const rejectionFixtureTransport = observation("ditto", "6", "rejection-fixture-archive-transport");
const rejectionFixtureSubmission = new Notary.Submission({
  ...submission,
  status: new Notary.Rejected({ providerStatus: "Invalid", summary: "secure timestamp intentionally absent" }),
  submissionTool: combineToolObservations(rejectionFixtureNotarytool, rejectionFixtureVerifier),
  tool: rejectionFixtureNotarytool,
  transportTool: rejectionFixtureTransport,
});

const compareUtf16 = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const canonicalValue = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${
    Object.keys(record).sort(compareUtf16).map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(
      ",",
    )
  }}`;
};

const canonicalBytes = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalValue(value)}\n`);

const decodedEnvelope = (bytes: Uint8Array): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected failure");
  const error = Cause.findErrorOption(exit.cause);
  if (error._tag !== "Some") throw new Error("expected typed error");
  return error.value;
};

const expectDecodeReason = async (bytes: Uint8Array, reason: string): Promise<void> => {
  const exit = await Effect.runPromiseExit(decodeNotaryJournalValue(bytes));
  expect(errorOf(exit)).toMatchObject({
    _tag: "NotaryJournalCodecError",
    operation: "decode",
    reason,
  });
};

describe("effect-build-apple package-private Notary journal codec", () => {
  it("round-trips every admitted value through one exact canonical byte representation", async () => {
    const reference = await Effect.runPromise(submissionReferenceFromSubmission(submission));
    const packageReference = await Effect.runPromise(submissionReferenceFromSubmission(packageSubmission));
    const accepted = await Effect.runPromise(Notary.acceptedReference(acceptedObservation));
    const values = [
      submission,
      reference,
      packageSubmission,
      packageReference,
      rejectionFixtureSubmission,
      acceptedObservation,
      rejectedLog,
      accepted,
    ] as const;

    for (const value of values) {
      const bytes = await Effect.runPromise(encodeNotaryJournalValue(value));
      const text = new TextDecoder().decode(bytes);
      expect(text.endsWith("\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
      expect(text).not.toContain("\r");
      expect(text).not.toContain("\n ");
      expect(decodedEnvelope(bytes).codec).toBe(notaryJournalCodecId);

      const decoded = await Effect.runPromise(decodeNotaryJournalValue(bytes));
      expect(decoded.constructor).toBe(value.constructor);
      expect(JSON.parse(JSON.stringify(decoded))).toEqual(JSON.parse(JSON.stringify(value)));
      expect(await Effect.runPromise(encodeNotaryJournalValue(decoded))).toEqual(bytes);
    }
  });

  it("derives the sole fresh-runner reference without losing or substituting a field", async () => {
    const reference = await Effect.runPromise(submissionReferenceFromSubmission(submission));
    expect(reference).toEqual(
      new Notary.SubmissionReference({
        submissionId: submission.submissionId,
        kind: submission.kind,
        architecture: submission.architecture,
        artifactBytes: submission.artifactBytes,
        artifactDigest: submission.artifactDigest,
        submissionTool: submission.submissionTool,
        stapleTarget: submission.stapleTarget,
        transportTool: submission.transportTool,
      }),
    );
    expect(reference).not.toHaveProperty("status");
    expect(reference).not.toHaveProperty("message");
    expect(reference).not.toHaveProperty("tool");
  });

  it("rejects alternate JSON bytes instead of normalizing them silently", async () => {
    const bytes = await Effect.runPromise(encodeNotaryJournalValue(submission));
    const text = new TextDecoder().decode(bytes);
    await expectDecodeReason(new TextEncoder().encode(text.slice(0, -1)), "noncanonical-bytes");
    await expectDecodeReason(new TextEncoder().encode(`${text}\n`), "noncanonical-bytes");
    await expectDecodeReason(new TextEncoder().encode(` ${text}`), "noncanonical-bytes");
    await expectDecodeReason(new Uint8Array([0xff, 0x0a]), "invalid-bytes");

    const pretty = new TextEncoder().encode(`${JSON.stringify(decodedEnvelope(bytes), null, 2)}\n`);
    await expectDecodeReason(pretty, "noncanonical-bytes");
  });

  it("rejects non-NFC strings recursively instead of admitting a second canonical byte form", async () => {
    const nonNfcSubmission = new Notary.Submission({
      ...submission,
      message: "synthetic-e\u0301",
    });
    const encodeExit = await Effect.runPromiseExit(encodeNotaryJournalValue(nonNfcSubmission));
    expect(errorOf(encodeExit)).toMatchObject({ operation: "encode", reason: "schema-invalid" });

    const bytes = await Effect.runPromise(encodeNotaryJournalValue(submission));
    const topLevel = decodedEnvelope(bytes);
    (topLevel.value as Record<string, unknown>).message = "synthetic-e\u0301";
    await expectDecodeReason(canonicalBytes(topLevel), "noncanonical-bytes");

    const nested = decodedEnvelope(bytes);
    const tool = (nested.value as Record<string, unknown>).submissionTool as Record<string, unknown>;
    const participant = (tool.participants as Array<Record<string, unknown>>)[0]!;
    participant.channel = "synthetic-e\u0301";
    await expectDecodeReason(canonicalBytes(nested), "noncanonical-bytes");
  });

  it("rejects excess fields at the envelope, native result, tool, participant, capability, digest, and target", async () => {
    const bytes = await Effect.runPromise(encodeNotaryJournalValue(submission));
    const mutations: Array<(envelope: Record<string, unknown>) => void> = [
      (envelope) => {
        envelope.extra = true;
      },
      (envelope) => {
        (envelope.value as Record<string, unknown>).extra = true;
      },
      (envelope) => {
        ((envelope.value as Record<string, unknown>).artifactDigest as Record<string, unknown>).extra = true;
      },
      (envelope) => {
        ((envelope.value as Record<string, unknown>).submissionTool as Record<string, unknown>).extra = true;
      },
      (envelope) => {
        const tool = (envelope.value as Record<string, unknown>).submissionTool as Record<string, unknown>;
        (tool.participants as Array<Record<string, unknown>>)[0]!.extra = true;
      },
      (envelope) => {
        const tool = (envelope.value as Record<string, unknown>).submissionTool as Record<string, unknown>;
        (tool.capabilities as Array<Record<string, unknown>>)[0]!.extra = true;
      },
      (envelope) => {
        ((envelope.value as Record<string, unknown>).stapleTarget as Record<string, unknown>).extra = true;
      },
      (envelope) => {
        ((envelope.value as Record<string, unknown>).status as Record<string, unknown>).extra = true;
      },
    ];

    for (const mutate of mutations) {
      const envelope = decodedEnvelope(bytes);
      mutate(envelope);
      await expectDecodeReason(canonicalBytes(envelope), "schema-invalid");
    }
  });

  it("requires one exactly correlated staple target in every admitted journal variant", async () => {
    const reference = await Effect.runPromise(submissionReferenceFromSubmission(submission));
    const accepted = await Effect.runPromise(Notary.acceptedReference(acceptedObservation));
    const values = [submission, reference, acceptedObservation, rejectedLog, accepted] as const;

    for (const value of values) {
      const bytes = await Effect.runPromise(encodeNotaryJournalValue(value));
      const envelope = decodedEnvelope(bytes);
      delete (envelope.value as Record<string, unknown>).stapleTarget;
      await expectDecodeReason(canonicalBytes(envelope), "schema-invalid");

      const withoutVerifier = decodedEnvelope(bytes);
      const combined = (withoutVerifier.value as Record<string, unknown>).submissionTool as Record<string, unknown>;
      (combined.participants as unknown[]).pop();
      (combined.capabilities as unknown[]).pop();
      await expectDecodeReason(canonicalBytes(withoutVerifier), "correlation-invalid");
    }

    const transportOnly = decodedEnvelope(await Effect.runPromise(encodeNotaryJournalValue(submission)));
    delete (transportOnly.value as Record<string, unknown>).stapleTarget;
    await expectDecodeReason(canonicalBytes(transportOnly), "schema-invalid");
  });

  it("rejects wrong codec identity and every invalid product or tool correlation", async () => {
    const bytes = await Effect.runPromise(encodeNotaryJournalValue(submission));
    const wrongCodec = decodedEnvelope(bytes);
    wrongCodec.codec = "effect-build-apple/notary-journal@2";
    await expectDecodeReason(canonicalBytes(wrongCodec), "schema-invalid");

    const wrongToolSubmission = new Notary.Submission({ ...submission, tool: continuationTool });
    const deriveExit = await Effect.runPromiseExit(submissionReferenceFromSubmission(wrongToolSubmission));
    expect(errorOf(deriveExit)).toMatchObject({ operation: "derive-reference", reason: "correlation-invalid" });

    const reversedSubmissionTool: Tool.Observation<"notarytool"> = {
      name: "notarytool",
      participants: [...submissionTool.participants].reverse() as [
        Tool.ParticipantIdentity,
        ...Tool.ParticipantIdentity[],
      ],
      capabilities: [...submissionTool.capabilities].reverse(),
    };
    const reversedExit = await Effect.runPromiseExit(
      encodeNotaryJournalValue(new Notary.Submission({ ...submission, submissionTool: reversedSubmissionTool })),
    );
    expect(errorOf(reversedExit)).toMatchObject({ reason: "correlation-invalid" });

    const extraVerifierTool = combineToolObservations(submissionNotarytool, structuralVerifier, structuralVerifier);
    const extraVerifierExit = await Effect.runPromiseExit(
      encodeNotaryJournalValue(new Notary.Submission({ ...submission, submissionTool: extraVerifierTool })),
    );
    expect(errorOf(extraVerifierExit)).toMatchObject({ reason: "correlation-invalid" });

    const missingCapabilityTool: Tool.Observation<"notarytool"> = {
      ...submissionTool,
      capabilities: submissionTool.capabilities.slice(0, 1),
    };
    const missingCapabilityExit = await Effect.runPromiseExit(
      encodeNotaryJournalValue(new Notary.Submission({ ...submission, submissionTool: missingCapabilityTool })),
    );
    expect(errorOf(missingCapabilityExit)).toMatchObject({ reason: "correlation-invalid" });

    const wrongNotarytool = observation("notarytool", "a", "wrong-capability");
    const wrongCodesign = observation("codesign", "f", "wrong-capability");
    const wrongDitto = observation("ditto", "c", "wrong-capability");
    const fabricatedCapabilityExit = await Effect.runPromiseExit(encodeNotaryJournalValue(
      new Notary.Submission({
        ...submission,
        submissionTool: combineToolObservations(wrongNotarytool, wrongCodesign),
        tool: wrongNotarytool,
        transportTool: wrongDitto,
      }),
    ));
    expect(errorOf(fabricatedCapabilityExit)).toMatchObject({ reason: "schema-invalid" });

    const fixtureNotarytool = observation("notarytool", "7", "rejection-fixture-notarization");
    const fixtureCodesign = observation("codesign", "8", "rejection-fixture-ad-hoc-signing");
    const fixtureDitto = observation("ditto", "6", "rejection-fixture-archive-transport");
    const normalNotaryFixtureVerifierExit = await Effect.runPromiseExit(encodeNotaryJournalValue(
      new Notary.Submission({
        ...submission,
        submissionTool: combineToolObservations(submissionNotarytool, fixtureCodesign),
        tool: submissionNotarytool,
      }),
    ));
    expect(errorOf(normalNotaryFixtureVerifierExit)).toMatchObject({ reason: "correlation-invalid" });
    const fixtureNotaryNormalVerifierExit = await Effect.runPromiseExit(encodeNotaryJournalValue(
      new Notary.Submission({
        ...submission,
        submissionTool: combineToolObservations(fixtureNotarytool, structuralVerifier),
        tool: fixtureNotarytool,
        transportTool: fixtureDitto,
      }),
    ));
    expect(errorOf(fixtureNotaryNormalVerifierExit)).toMatchObject({ reason: "correlation-invalid" });
    const normalPairFixtureTransportExit = await Effect.runPromiseExit(encodeNotaryJournalValue(
      new Notary.Submission({ ...submission, transportTool: fixtureDitto }),
    ));
    expect(errorOf(normalPairFixtureTransportExit)).toMatchObject({ reason: "correlation-invalid" });
    const fixturePairNormalTransportExit = await Effect.runPromiseExit(encodeNotaryJournalValue(
      new Notary.Submission({
        ...submission,
        submissionTool: combineToolObservations(fixtureNotarytool, fixtureCodesign),
        tool: fixtureNotarytool,
      }),
    ));
    expect(errorOf(fixturePairNormalTransportExit)).toMatchObject({ reason: "correlation-invalid" });

    const accepted = await Effect.runPromise(Notary.acceptedReference(acceptedObservation));
    const continuationValues = [
      new Notary.Observation({ ...acceptedObservation, tool: continuationTool }),
      new Notary.Log({ ...rejectedLog, tool: continuationTool }),
      new Notary.AcceptedReference({ ...accepted, tool: continuationTool }),
    ] as const;
    for (const value of continuationValues) {
      const bytes = await Effect.runPromise(encodeNotaryJournalValue(value));
      const decoded = await Effect.runPromise(decodeNotaryJournalValue(bytes));
      expect("tool" in decoded ? decoded.tool : undefined).toEqual(continuationTool);
      expect("submissionTool" in decoded ? decoded.submissionTool : undefined).toEqual(submissionTool);
    }

    const fixtureContinuationValues = [
      new Notary.Observation({ ...acceptedObservation, tool: rejectionFixtureNotarytool }),
      new Notary.Log({ ...rejectedLog, tool: rejectionFixtureNotarytool }),
      new Notary.AcceptedReference({ ...accepted, tool: rejectionFixtureNotarytool }),
    ] as const;
    for (const value of fixtureContinuationValues) {
      const exit = await Effect.runPromiseExit(encodeNotaryJournalValue(value));
      expect(errorOf(exit)).toMatchObject({ operation: "encode", reason: "correlation-invalid" });
    }

    for (const value of continuationValues) {
      const bytes = await Effect.runPromise(encodeNotaryJournalValue(value));
      const envelope = decodedEnvelope(bytes);
      (envelope.value as Record<string, unknown>).tool = rejectionFixtureNotarytool;
      await expectDecodeReason(canonicalBytes(envelope), "correlation-invalid");
    }

    const dmgTarget = new Notary.StapleTarget({
      kind: "dmg",
      identityKind: "file-bytes",
      artifactBytes: Artifact.decimalBytes("53"),
      artifactDigest: submittedDigest,
    });
    const dmgWithTransport = new Notary.Submission({
      ...submission,
      kind: "dmg",
      stapleTarget: dmgTarget,
    });
    const dmgExit = await Effect.runPromiseExit(encodeNotaryJournalValue(dmgWithTransport));
    expect(errorOf(dmgExit)).toMatchObject({ reason: "correlation-invalid" });

    const mismatchedDmgTarget = new Notary.StapleTarget({
      ...dmgTarget,
      artifactBytes: Artifact.decimalBytes("54"),
    });
    const dmgWithMismatchedTarget = new Notary.Submission({
      submissionId: submission.submissionId,
      kind: "dmg",
      architecture: submission.architecture,
      artifactBytes: submission.artifactBytes,
      artifactDigest: submission.artifactDigest,
      status: submission.status,
      message: submission.message,
      submissionTool: submission.submissionTool,
      tool: submission.tool,
      stapleTarget: mismatchedDmgTarget,
    });
    const mismatchedDmgExit = await Effect.runPromiseExit(encodeNotaryJournalValue(dmgWithMismatchedTarget));
    expect(errorOf(mismatchedDmgExit)).toMatchObject({ reason: "correlation-invalid" });

    const zipWithFileTarget = new Notary.Submission({
      ...submission,
      stapleTarget: dmgTarget,
    });
    const zipExit = await Effect.runPromiseExit(encodeNotaryJournalValue(zipWithFileTarget));
    expect(errorOf(zipExit)).toMatchObject({ reason: "correlation-invalid" });

    const zipWithPackageVerifier = new Notary.Submission({
      ...submission,
      submissionTool: packageSubmissionTool,
    });
    const verifierExit = await Effect.runPromiseExit(encodeNotaryJournalValue(zipWithPackageVerifier));
    expect(errorOf(verifierExit)).toMatchObject({ reason: "correlation-invalid" });

    const packageWithCodesignVerifier = new Notary.Submission({
      ...packageSubmission,
      submissionTool,
    });
    const packageVerifierExit = await Effect.runPromiseExit(encodeNotaryJournalValue(packageWithCodesignVerifier));
    expect(errorOf(packageVerifierExit)).toMatchObject({ reason: "correlation-invalid" });
  });

  it("bounds hostile journal bytes before emitting or parsing", async () => {
    await expectDecodeReason(new Uint8Array(), "invalid-bytes");
    await expectDecodeReason(new Uint8Array(1024 * 1024 + 1), "invalid-bytes");

    const oversizedLog = new Notary.Log({
      ...rejectedLog,
      issues: [
        new Notary.LogIssue({
          ...rejectedLog.issues[0]!,
          message: "x".repeat(1024 * 1024),
        }),
      ],
    });
    const encodeExit = await Effect.runPromiseExit(encodeNotaryJournalValue(oversizedLog));
    expect(errorOf(encodeExit)).toMatchObject({
      _tag: "NotaryJournalCodecError",
      operation: "encode",
      reason: "invalid-bytes",
    });
  });
});
