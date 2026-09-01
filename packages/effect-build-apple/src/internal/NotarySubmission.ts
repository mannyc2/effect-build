import { Cause, Crypto, Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import type * as Tool from "effect-build/Author/Tool";
import {
  AppleToolChanged,
  capturePlatformServices,
  combineToolObservations,
  copyTreeSnapshot,
  describe,
  type SelectedAppleTool,
} from "../internal.js";
import type { Architecture } from "../Model.js";

export type ProviderOperation = "submit" | "info" | "log";
export type JsonObject = Record<string, unknown>;

export interface CredentialArguments {
  readonly args: readonly string[];
  readonly sensitiveValues: readonly string[];
}

interface ResponseInvalidFields {
  readonly operation: ProviderOperation;
  readonly reason: string;
}

interface PreparationFailedFields {
  readonly path: string;
  readonly reason: string;
}

interface OutcomeUnknownFields {
  readonly artifactDigest: string;
  readonly reason: string;
}

export interface SubmissionFields<Status, StapleTarget> {
  readonly submissionId: string;
  readonly kind: "dmg" | "pkg" | "zip";
  readonly architecture: Architecture;
  readonly artifactBytes: Artifact.DecimalBytes;
  readonly artifactDigest: Artifact.Digest;
  readonly status: Status;
  readonly message?: string;
  readonly submissionTool: Tool.Observation<"notarytool">;
  readonly tool: Tool.Observation<"notarytool">;
  readonly stapleTarget?: StapleTarget;
  readonly transportTool?: Tool.Observation<"ditto">;
}

export interface SubmissionModel<
  Submission,
  Status,
  StapleTarget,
  ResponseInvalid,
  PreparationFailed,
  OutcomeUnknown,
> {
  readonly responseInvalid: (fields: ResponseInvalidFields) => ResponseInvalid;
  readonly preparationFailed: (fields: PreparationFailedFields) => PreparationFailed;
  readonly isPreparationFailed: (value: unknown) => value is PreparationFailed;
  readonly outcomeUnknown: (fields: OutcomeUnknownFields) => OutcomeUnknown;
  readonly accepted: () => Status;
  readonly pending: (providerStatus: string) => Status;
  readonly rejected: (providerStatus: string, summary?: string) => Status;
  readonly submission: (fields: SubmissionFields<Status, StapleTarget>) => Submission;
}

export interface AppSnapshotIdentity {
  readonly architecture: Architecture;
  readonly bundleName: string;
  readonly rootMode: Artifact.FileMode;
  readonly entries: readonly Artifact.HashedTreeEntry[];
  readonly totalBytes: Artifact.DecimalBytes;
  readonly manifestDigest: Artifact.Digest;
}

export interface AppSnapshotSubmission<StapleTarget> {
  readonly sourcePath: string;
  readonly snapshotRoot: Artifact.AbsolutePath;
  readonly identity: AppSnapshotIdentity;
  readonly stapleTarget: StapleTarget;
}

export interface PreparedAppSubmission<StapleTarget> {
  readonly architecture: Architecture;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly digest: Artifact.Digest;
  readonly stapleTarget: StapleTarget;
  readonly structuralVerifier: Tool.Observation<"codesign">;
  readonly transportTool: Tool.Observation<"ditto">;
}

export const scrub = (text: string, values: readonly string[]): string =>
  values.reduce((redacted, value) => value.length === 0 ? redacted : redacted.split(value).join("<redacted>"), text);

export const parseObject = <ResponseInvalid>(
  responseInvalid: (fields: ResponseInvalidFields) => ResponseInvalid,
  operation: ProviderOperation,
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
    catch: (error) => responseInvalid({ operation, reason: describe(error) }),
  });

export const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const requireText = <ResponseInvalid>(
  responseInvalid: (fields: ResponseInvalidFields) => ResponseInvalid,
  operation: ProviderOperation,
  object: JsonObject,
  key: string,
): Effect.Effect<string, ResponseInvalid> => {
  const value = nonEmpty(object[key]);
  return value === undefined
    ? Effect.fail(responseInvalid({ operation, reason: `missing non-empty ${key}` }))
    : Effect.succeed(value);
};

export const requireSubmissionId = <ResponseInvalid>(
  responseInvalid: (fields: ResponseInvalidFields) => ResponseInvalid,
  operation: ProviderOperation,
  object: JsonObject,
  key: string,
  sensitiveValues: readonly string[],
): Effect.Effect<string, ResponseInvalid> =>
  Effect.flatMap(requireText(responseInvalid, operation, object, key), (value) => {
    const canonical = value.toLowerCase();
    if (sensitiveValues.some((sensitive) => sensitive.length > 0 && canonical.includes(sensitive.toLowerCase()))) {
      return Effect.fail(responseInvalid({ operation, reason: `${key} overlaps credential material` }));
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(canonical)
      ? Effect.succeed(canonical)
      : Effect.fail(responseInvalid({ operation, reason: `${key} is not a submission UUID` }));
  });

export const normalizeStatus = <Status, ResponseInvalid>(
  model: Pick<
    SubmissionModel<unknown, Status, unknown, ResponseInvalid, unknown, unknown>,
    "accepted" | "pending" | "rejected" | "responseInvalid"
  >,
  operation: ProviderOperation,
  providerStatus: string,
  summary?: string,
): Effect.Effect<Status, ResponseInvalid> => {
  const normalized = providerStatus.trim().toLowerCase();
  if (normalized === "accepted") return Effect.succeed(model.accepted());
  if (normalized === "in progress" || normalized === "in-progress" || normalized === "submitted") {
    return Effect.succeed(model.pending(providerStatus));
  }
  if (normalized === "invalid" || normalized === "rejected") {
    return Effect.succeed(model.rejected(providerStatus, summary));
  }
  return Effect.fail(model.responseInvalid({ operation, reason: `unknown status ${providerStatus}` }));
};

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const firstEntryMismatch = (
  expected: readonly Artifact.HashedTreeEntry[],
  observed: readonly Artifact.HashedTreeEntry[],
): string => {
  const entryCount = Math.max(expected.length, observed.length);
  for (let index = 0; index < entryCount; index++) {
    const wanted = JSON.stringify(expected[index]);
    const actual = JSON.stringify(observed[index]);
    if (wanted !== actual) return `${index}: ${wanted} -> ${actual}`.slice(0, 1024);
  }
  return "none";
};

export const makeSubmissionEngine = <
  Submission,
  Status,
  StapleTarget,
  ResponseInvalid,
  PreparationFailed,
  OutcomeUnknown,
>(options: {
  readonly notarytool: SelectedAppleTool<"notarytool">;
  readonly ditto: SelectedAppleTool<"ditto">;
  readonly codesign: SelectedAppleTool<"codesign">;
  readonly pkgutil?: SelectedAppleTool<"pkgutil">;
  readonly credentialArguments: Effect.Effect<CredentialArguments>;
  readonly model: SubmissionModel<
    Submission,
    Status,
    StapleTarget,
    ResponseInvalid,
    PreparationFailed,
    OutcomeUnknown
  >;
}) =>
  Effect.gen(function*() {
    const { fileSystem, path, services } = yield* capturePlatformServices;
    const crypto = yield* Crypto.Crypto;

    const run = (operation: ProviderOperation, args: readonly string[]) =>
      Effect.gen(function*() {
        const credential = yield* options.credentialArguments;
        const completion = yield* options.notarytool.run(
          [operation, ...args, "--output-format", "json", ...credential.args],
          { redact: credential.sensitiveValues },
        );
        const text = yield* Effect.try({
          try: () => new TextDecoder("utf-8", { fatal: true }).decode(completion.stdout),
          catch: (error) =>
            options.model.responseInvalid({
              operation,
              reason: `stdout was not UTF-8: ${scrub(describe(error), credential.sensitiveValues)}`,
            }),
        });
        return { text, sensitiveValues: credential.sensitiveValues } as const;
      }).pipe(Effect.provide(services));

    const submitObservedBytes = (
      kind: "dmg" | "pkg" | "zip",
      architecture: Architecture,
      name: string,
      bytes: Uint8Array,
      digest: Artifact.Digest,
      structuralVerifier: Tool.Observation<"codesign" | "pkgutil">,
      stapleTarget?: StapleTarget,
      transportTool?: Tool.Observation<"ditto">,
    ) =>
      Effect.acquireUseRelease(
        fileSystem.makeTempDirectory({ prefix: ".effect-build-notary-" }).pipe(
          Effect.mapError((error) => options.model.preparationFailed({ path: name, reason: describe(error) })),
        ),
        (directory) =>
          Effect.gen(function*() {
            const staged = path.join(directory, name);
            yield* fileSystem.writeFile(staged, bytes).pipe(
              Effect.mapError((error) => options.model.preparationFailed({ path: name, reason: describe(error) })),
            );
            if (
              (kind === "pkg" && structuralVerifier.name !== "pkgutil")
              || (kind !== "pkg" && structuralVerifier.name !== "codesign")
            ) {
              return yield* Effect.fail(options.model.preparationFailed({
                path: staged,
                reason: `${kind} submission used ${structuralVerifier.name} instead of its structural verifier`,
              }));
            }
            if (kind === "dmg") yield* options.codesign.run(["--verify", "--strict", "--verbose=2", staged]);
            if (kind === "pkg") {
              if (options.pkgutil === undefined) {
                return yield* Effect.fail(options.model.preparationFailed({
                  path: staged,
                  reason: "pkgutil is required for package submission",
                }));
              }
              yield* options.pkgutil.run(["--check-signature", staged]);
            }
            const response = yield* run("submit", [staged]).pipe(
              Effect.mapError((failure) =>
                failure instanceof AppleToolChanged
                  ? failure
                  : options.model.outcomeUnknown({ artifactDigest: digest.value, reason: describe(failure) })
              ),
            );
            return yield* Effect.gen(function*() {
              const object = yield* parseObject(options.model.responseInvalid, "submit", response.text);
              const submissionId = yield* requireSubmissionId(
                options.model.responseInvalid,
                "submit",
                object,
                "id",
                response.sensitiveValues,
              );
              const safeText = (value: unknown) => {
                const text = nonEmpty(value);
                return text === undefined ? undefined : scrub(text, response.sensitiveValues);
              };
              const providerStatus = safeText(object.status) ?? "Submitted";
              const message = safeText(object.message);
              const status = yield* normalizeStatus(options.model, "submit", providerStatus, message);
              return options.model.submission({
                submissionId,
                kind,
                architecture,
                artifactBytes: Artifact.decimalBytes(`${bytes.byteLength}`),
                artifactDigest: digest,
                status,
                ...(message === undefined ? {} : { message }),
                submissionTool: combineToolObservations(options.notarytool.observation, structuralVerifier),
                tool: options.notarytool.observation,
                ...(stapleTarget === undefined ? {} : { stapleTarget }),
                ...(transportTool === undefined ? {} : { transportTool }),
              });
            }).pipe(
              Effect.mapError((failure) =>
                options.model.outcomeUnknown({
                  artifactDigest: digest.value,
                  reason: scrub(
                    typeof failure === "object"
                      && failure !== null
                      && "reason" in failure
                      && typeof failure.reason === "string"
                      ? failure.reason
                      : describe(failure) || "provider response could not be correlated",
                    response.sensitiveValues,
                  ),
                })
              ),
            );
          }),
        (directory) =>
          fileSystem.remove(directory, { recursive: true, force: true }).pipe(
            Effect.timeout("5 seconds"),
            Effect.catchCause((cause) =>
              Effect.logWarning("Notary submission staging cleanup failed after preserving provider exit").pipe(
                Effect.annotateLogs({
                  directory,
                  reason: Cause.pretty(cause).slice(0, 1024),
                }),
              )
            ),
          ),
      ).pipe(Effect.provide(services));

    const submitBytes = (
      kind: "dmg" | "pkg",
      architecture: Architecture,
      name: string,
      bytes: Uint8Array,
      digest: Artifact.Digest,
      stapleTarget?: StapleTarget,
    ) => {
      const verifier = kind === "dmg" ? options.codesign : options.pkgutil;
      if (verifier === undefined) {
        return Effect.fail(options.model.preparationFailed({
          path: name,
          reason: "pkgutil is required for package submission",
        }));
      }
      return submitObservedBytes(
        kind,
        architecture,
        name,
        bytes,
        digest,
        verifier.observation,
        stapleTarget,
      );
    };

    const prepareAppSnapshot = (input: AppSnapshotSubmission<StapleTarget>) =>
      Effect.scoped(
        Effect.gen(function*() {
          const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: ".effect-build-notary-app-" }).pipe(
            Effect.mapError((error) =>
              options.model.preparationFailed({ path: input.sourcePath, reason: describe(error) })
            ),
          );
          const stagedApp = path.join(directory, input.identity.bundleName);
          yield* copyTreeSnapshot(input.snapshotRoot, stagedApp).pipe(
            Effect.mapError((error) =>
              options.model.preparationFailed({ path: input.sourcePath, reason: error.message })
            ),
          );
          yield* options.codesign.run(["--verify", "--deep", "--strict", "--verbose=2", stagedApp]);
          const zipName = `${input.identity.bundleName.slice(0, -4)}.zip`;
          const zipPath = path.join(directory, zipName);
          yield* options.ditto.run(["-c", "-k", "--keepParent", stagedApp, zipPath]);
          yield* BorrowedOutput.withTree(
            {
              prefix: "effect-build-notary-extracted-",
              produce: (ownedRoot) =>
                Effect.gen(function*() {
                  const extracted = path.join(ownedRoot, "payload");
                  yield* fileSystem.makeDirectory(extracted);
                  yield* options.ditto.run(["-x", "-k", zipPath, extracted]);
                  const entries = (yield* fileSystem.readDirectory(extracted)).sort();
                  if (entries.length !== 1 || entries[0] !== input.identity.bundleName) {
                    return yield* Effect.fail(options.model.preparationFailed({
                      path: zipPath,
                      reason: `ZIP extraction must contain exactly ${input.identity.bundleName}`,
                    }));
                  }
                  return path.join(extracted, input.identity.bundleName);
                }),
            },
            "hashed",
            (tree) =>
              Effect.gen(function*() {
                if (
                  tree.initial.manifestDigest.value !== input.identity.manifestDigest.value
                  || tree.initial.totalBytes !== input.identity.totalBytes
                  || tree.initial.rootMode !== input.identity.rootMode
                ) {
                  return yield* Effect.fail(options.model.preparationFailed({
                    path: zipPath,
                    reason: [
                      "ZIP projection changed bundle identity",
                      `manifest ${input.identity.manifestDigest.value} -> ${tree.initial.manifestDigest.value}`,
                      `bytes ${input.identity.totalBytes} -> ${tree.initial.totalBytes}`,
                      `root mode ${input.identity.rootMode} -> ${tree.initial.rootMode}`,
                      `first entry mismatch ${firstEntryMismatch(input.identity.entries, tree.initial.entries)}`,
                    ].join("; "),
                  }));
                }
                yield* options.codesign.run(["--verify", "--deep", "--strict", "--verbose=2", tree.root]);
                yield* tree.observe;
              }),
          ).pipe(
            Effect.provide(BorrowedOutput.CleanupReporter.layer),
            Effect.mapError((error) =>
              options.model.isPreparationFailed(error)
                ? error as PreparationFailed
                : options.model.preparationFailed({ path: zipPath, reason: describe(error) })
            ),
          );
          const zipBytes = yield* fileSystem.readFile(zipPath).pipe(
            Effect.mapError((error) => options.model.preparationFailed({ path: zipPath, reason: describe(error) })),
          );
          const hashed = yield* crypto.digest("SHA-256", zipBytes).pipe(
            Effect.mapError((error) => options.model.preparationFailed({ path: zipPath, reason: describe(error) })),
          );
          return Object.freeze({
            architecture: input.identity.architecture,
            name: zipName,
            bytes: zipBytes,
            digest: Artifact.sha256Digest(hex(new Uint8Array(hashed))),
            stapleTarget: input.stapleTarget,
            structuralVerifier: options.codesign.observation,
            transportTool: options.ditto.observation,
          }) satisfies PreparedAppSubmission<StapleTarget>;
        }),
      ).pipe(Effect.provide(services));

    const submitPreparedApp = (prepared: PreparedAppSubmission<StapleTarget>) =>
      prepared.structuralVerifier !== options.codesign.observation
        ? Effect.fail(options.model.preparationFailed({
          path: prepared.name,
          reason: "prepared App submission did not retain this engine's exact codesign observation",
        }))
        : submitObservedBytes(
          "zip",
          prepared.architecture,
          prepared.name,
          prepared.bytes,
          prepared.digest,
          prepared.structuralVerifier,
          prepared.stapleTarget,
          prepared.transportTool,
        );

    const submitAppSnapshot = (input: AppSnapshotSubmission<StapleTarget>) =>
      Effect.flatMap(prepareAppSnapshot(input), submitPreparedApp);

    return { prepareAppSnapshot, run, submitAppSnapshot, submitBytes, submitPreparedApp } as const;
  });
