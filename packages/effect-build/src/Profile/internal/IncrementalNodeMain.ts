import { Crypto, Effect, FileSystem, Path, Schema, type Scope, Semaphore } from "effect";
import type * as Artifact from "../../Artifact.js";
import * as BorrowedOutput from "../../Author/BorrowedOutput.js";
import * as NodeMainLease from "../../Author/internal/NodeMainLease.js";
import * as NodeMain from "../../Author/NodeMain.js";

export const profile = "effect-build/profile/incremental-node-main@1" as const;

export interface SourceRevision {
  /** Starts at one and advances exactly once for each observed source state. */
  readonly sequence: number;
  /** Authenticates the complete source state observed by the adapter. */
  readonly digest: Artifact.Digest;
}

export interface Snapshot {
  readonly profile: typeof profile;
  readonly generation: number;
  readonly source: SourceRevision;
  /** Valid only for the duration of the rebuild continuation. */
  readonly main: NodeMain.SealedMain;
}

export interface Driver<Failure, Requirements = never, ReleaseFailure = never> {
  /**
   * Produces one borrowed sealed main for the supplied authenticated source
   * revision. The callback must be invoked exactly once and must not outlive
   * this effect.
   */
  readonly rebuild: <A, UseFailure, UseRequirements>(
    revision: SourceRevision,
    use: (main: NodeMain.SealedMain) => Effect.Effect<A, UseFailure, UseRequirements>,
  ) => Effect.Effect<A, Failure | UseFailure, Requirements | UseRequirements>;
  /** Releases the provider context. It is called exactly once after in-flight work joins. */
  readonly release: Effect.Effect<void, ReleaseFailure, Requirements>;
}

/** Provider-package internal shape; structural so the frozen core export map stays unchanged. */
export interface ProducerDriver<Failure, Requirements = never, ReleaseFailure = never> {
  readonly rebuild: (
    revision: SourceRevision,
    ownedRoot: Artifact.AbsolutePath,
  ) => Effect.Effect<NodeMain.ProducedMain, Failure, Requirements>;
  readonly release: Effect.Effect<void, ReleaseFailure, Requirements>;
}

export class IncrementalNodeMainClosed extends Schema.TaggedError<IncrementalNodeMainClosed>()(
  "IncrementalNodeMainClosed",
  {},
) {}

export class SourceRevisionRejected extends Schema.TaggedError<SourceRevisionRejected>()(
  "SourceRevisionRejected",
  { reason: Schema.String },
) {}

export class IncrementalSnapshotRejected extends Schema.TaggedError<IncrementalSnapshotRejected>()(
  "IncrementalSnapshotRejected",
  { reason: Schema.String },
) {}

export class IncrementalOfferRejected extends Schema.TaggedError<IncrementalOfferRejected>()(
  "IncrementalOfferRejected",
  { reason: Schema.String },
) {}

export class IncrementalDriverProtocolViolation extends Schema.TaggedError<IncrementalDriverProtocolViolation>()(
  "IncrementalDriverProtocolViolation",
  { reason: Schema.String },
) {}

export type CandidateFailure =
  | IncrementalNodeMainClosed
  | SourceRevisionRejected
  | IncrementalOfferRejected
  | IncrementalSnapshotRejected
  | IncrementalDriverProtocolViolation
  | Artifact.ArtifactInvalid
  | BorrowedOutput.Failure
  | NodeMain.SealedMainIdentityMismatch;

export interface Handle<Failure, Requirements = never> {
  readonly rebuild: <A, UseFailure, UseRequirements>(
    revision: SourceRevision,
    use: (snapshot: Snapshot) => Effect.Effect<A, UseFailure, UseRequirements>,
  ) => Effect.Effect<
    A,
    Failure | UseFailure | CandidateFailure,
    Requirements | UseRequirements | Crypto.Crypto | FileSystem.FileSystem | Path.Path
  >;
}

interface StableSemantics {
  readonly agreementId: string;
  readonly nodeVersion: string;
  readonly target: NodeMain.SealedMain["target"];
  readonly format: NodeMain.Format;
  readonly producer: string;
}

interface Previous {
  readonly sourceSequence: number;
  readonly sourceDigest: string;
  readonly outputDigest: string;
  readonly semantics: StableSemantics;
}

interface State {
  phase: "open" | "closing" | "closed";
  previous: Previous | undefined;
}

type SealingRequirements<Requirements> =
  | Requirements
  | BorrowedOutput.CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path;

const canonicalDigest = (digest: Artifact.Digest): boolean =>
  digest.algorithm === "sha256" && /^[0-9a-f]{64}$/u.test(digest.value);

const validateProgram = (program: NodeMain.Request): Effect.Effect<void, SourceRevisionRejected> => {
  if (program.protocol !== NodeMain.profile) {
    return Effect.fail(new SourceRevisionRejected({ reason: "unknown Node-main profile protocol" }));
  }
  if (program.entrypoint.length === 0 || program.entrypoint.includes("\0")) {
    return Effect.fail(new SourceRevisionRejected({ reason: "entrypoint must be non-empty and contain no NUL" }));
  }
  if (program.format !== "commonjs" && program.format !== "module") {
    return Effect.fail(new SourceRevisionRejected({ reason: "format must be commonjs or module" }));
  }
  return Effect.void;
};

const canonicalBuiltins = (values: readonly string[]): readonly string[] | undefined => {
  if (values.some((value) => !/^node:[a-z0-9_./-]+$/u.test(value))) return undefined;
  const canonical = [...new Set(values)].sort((left, right) => left.localeCompare(right));
  return canonical.length === values.length && canonical.every((value, index) => value === values[index])
    ? Object.freeze(canonical)
    : undefined;
};

const validateOffer = (
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
): Effect.Effect<void, IncrementalOfferRejected> => {
  if (offer.protocol !== NodeMain.offerProtocol) {
    return Effect.fail(new IncrementalOfferRejected({ reason: "unknown assembler offer protocol" }));
  }
  if (offer.agreementId.length === 0 || offer.nodeVersion.length === 0 || !offer.formats.includes(program.format)) {
    return Effect.fail(new IncrementalOfferRejected({ reason: "assembler offer does not admit the requested main" }));
  }
  if (
    offer.loader !== "sea-default"
    || offer.assets !== "none"
    || offer.snapshot !== false
    || offer.codeCache !== false
    || offer.dynamicImport !== "bundled-only"
    || canonicalBuiltins(offer.builtins) === undefined
  ) {
    return Effect.fail(new IncrementalOfferRejected({ reason: "assembler offer is outside the sealed Node-main law" }));
  }
  return Effect.void;
};

const validateProduced = (
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
  produced: NodeMain.ProducedMain,
): Effect.Effect<readonly string[], IncrementalSnapshotRejected> => {
  if (
    produced.protocol !== NodeMain.producedProtocol
    || produced.agreementId !== offer.agreementId
    || produced.format !== program.format
  ) {
    return Effect.fail(
      new IncrementalSnapshotRejected({
        reason: "provider output changed the produced protocol, agreement, or format",
      }),
    );
  }
  if (produced.sideOutputs.length !== 0 || produced.evidence.length === 0) {
    return Effect.fail(
      new IncrementalSnapshotRejected({
        reason: "a sealed incremental main requires one output and non-empty evidence",
      }),
    );
  }
  if (
    produced.producer.package.length === 0
    || produced.producer.version.length === 0
    || produced.producer.engine.length === 0
    || produced.producer.engineVersion.length === 0
  ) {
    return Effect.fail(new IncrementalSnapshotRejected({ reason: "provider identity is incomplete" }));
  }
  const builtins = canonicalBuiltins(produced.builtins);
  if (builtins === undefined || builtins.some((builtin) => !offer.builtins.includes(builtin))) {
    return Effect.fail(
      new IncrementalSnapshotRejected({
        reason: "provider output retained a non-canonical or unavailable runtime load",
      }),
    );
  }
  return Effect.succeed(builtins);
};

const validateRevision = (
  revision: SourceRevision,
  previous: Previous | undefined,
): Effect.Effect<SourceRevision, SourceRevisionRejected> => {
  if (!Number.isSafeInteger(revision.sequence) || revision.sequence <= 0) {
    return Effect.fail(new SourceRevisionRejected({ reason: "source sequence must be a positive safe integer" }));
  }
  if (!canonicalDigest(revision.digest)) {
    return Effect.fail(new SourceRevisionRejected({ reason: "source digest must be canonical sha256" }));
  }
  if (previous === undefined && revision.sequence !== 1) {
    return Effect.fail(new SourceRevisionRejected({ reason: "the first source sequence must be one" }));
  }
  if (previous !== undefined && revision.sequence !== previous.sourceSequence + 1) {
    return Effect.fail(new SourceRevisionRejected({ reason: "source sequences must be contiguous" }));
  }
  if (previous !== undefined && revision.digest.value === previous.sourceDigest) {
    return Effect.fail(new SourceRevisionRejected({ reason: "a rebuild requires a newly authenticated source state" }));
  }
  return Effect.succeed(Object.freeze({
    sequence: revision.sequence,
    digest: Object.freeze({ algorithm: "sha256" as const, value: revision.digest.value }),
  }));
};

const producerIdentity = (producer: NodeMain.ProviderIdentity): string =>
  JSON.stringify([producer.package, producer.version, producer.engine, producer.engineVersion]);

const semanticsOf = (main: NodeMain.SealedMain): StableSemantics =>
  Object.freeze({
    agreementId: main.agreementId,
    nodeVersion: main.nodeVersion,
    target: main.target,
    format: main.format,
    producer: producerIdentity(main.producer),
  });

const sameSemantics = (left: StableSemantics, right: StableSemantics): boolean =>
  left.agreementId === right.agreementId
  && left.nodeVersion === right.nodeVersion
  && left.target === right.target
  && left.format === right.format
  && left.producer === right.producer;

const validateSnapshot = (
  program: NodeMain.Request,
  main: NodeMain.SealedMain,
  previous: Previous | undefined,
): Effect.Effect<StableSemantics, CandidateFailure, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    if (main.profile !== NodeMain.profile || main.format !== program.format) {
      return yield* new IncrementalSnapshotRejected({
        reason: "the rebuilt main changed the requested Node-main profile or format",
      });
    }
    yield* NodeMain.acquire(main);
    const semantics = semanticsOf(main);
    if (previous !== undefined && !sameSemantics(previous.semantics, semantics)) {
      return yield* new IncrementalSnapshotRejected({
        reason: "the rebuilt main changed its agreement, Node target, format, or producer identity",
      });
    }
    if (previous !== undefined && main.identity.digest.value === previous.outputDigest) {
      return yield* new IncrementalSnapshotRejected({
        reason: "a newly observed source state must produce a new authenticated main identity",
      });
    }
    return semantics;
  });

/**
 * Owns only the portable incremental lifecycle. Provider contexts and rebuild
 * options remain in package-private adapters. Rebuilds are serialized; Scope
 * close rejects queued/new work, joins the active continuation, then releases
 * the provider driver exactly once.
 */
export const make = <Failure, Requirements, ReleaseFailure>(
  program: NodeMain.Request,
  driver: Driver<Failure, Requirements, ReleaseFailure>,
): Effect.Effect<Handle<Failure, Requirements>, SourceRevisionRejected, Requirements | Scope.Scope> =>
  Effect.gen(function*() {
    yield* validateProgram(program);
    const semaphore = yield* Semaphore.make(1);
    const state: State = { phase: "open", previous: undefined };

    const handle: Handle<Failure, Requirements> = Object.freeze({
      rebuild: <A, UseFailure, UseRequirements>(
        revision: SourceRevision,
        use: (snapshot: Snapshot) => Effect.Effect<A, UseFailure, UseRequirements>,
      ) =>
        semaphore.withPermit(
          Effect.gen(function*() {
            if (state.phase !== "open") return yield* new IncrementalNodeMainClosed();
            const source = yield* validateRevision(revision, state.previous);
            let callbackInvocations = 0;
            let completed: Previous | undefined;
            const value = yield* driver.rebuild(source, (main) =>
              Effect.gen(function*() {
                callbackInvocations += 1;
                if (callbackInvocations !== 1) {
                  return yield* new IncrementalDriverProtocolViolation({
                    reason: "the provider driver invoked the borrowed snapshot continuation more than once",
                  });
                }
                const semantics = yield* validateSnapshot(program, main, state.previous);
                const snapshot: Snapshot = Object.freeze({
                  profile,
                  generation: source.sequence,
                  source,
                  main,
                });
                const result = yield* use(snapshot);
                completed = Object.freeze({
                  sourceSequence: source.sequence,
                  sourceDigest: source.digest.value,
                  outputDigest: main.identity.digest.value,
                  semantics,
                });
                return result;
              }));
            if (callbackInvocations !== 1 || completed === undefined) {
              return yield* new IncrementalDriverProtocolViolation({
                reason: "the provider driver did not complete exactly one borrowed snapshot continuation",
              });
            }
            state.previous = completed;
            return value;
          }),
        ),
    });

    return yield* Effect.acquireRelease(
      Effect.succeed(handle),
      () =>
        Effect.sync(() => {
          state.phase = "closing";
        }).pipe(
          Effect.andThen(
            semaphore.withPermit(
              driver.release.pipe(
                Effect.orDie,
                Effect.ensuring(Effect.sync(() => {
                  state.phase = "closed";
                })),
              ),
            ),
          ),
        ),
    );
  });

/**
 * Seals native output from a concrete reusable provider context into the same
 * incremental consumer. This composition and its provider adapters remain
 * package-private until the named cross-provider evidence gate closes.
 */
export const makeFromProducer = <AcquireFailure, AcquireRequirements, Failure, Requirements, ReleaseFailure>(
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
  acquire: Effect.Effect<
    ProducerDriver<Failure, Requirements, ReleaseFailure>,
    AcquireFailure,
    AcquireRequirements
  >,
): Effect.Effect<
  Handle<
    | Failure
    | IncrementalSnapshotRejected
    | BorrowedOutput.Failure
    | BorrowedOutput.CleanupFailedAfterSuccessfulUse,
    SealingRequirements<Requirements>
  >,
  SourceRevisionRejected | IncrementalOfferRejected | AcquireFailure,
  | AcquireRequirements
  | Requirements
  | BorrowedOutput.CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
> =>
  Effect.gen(function*() {
    yield* validateProgram(program);
    yield* validateOffer(program, offer);
    const producer = yield* Effect.acquireRelease(
      acquire,
      ({ release }) => release.pipe(Effect.orDie),
    );
    const driver: Driver<
      | Failure
      | IncrementalSnapshotRejected
      | BorrowedOutput.Failure
      | BorrowedOutput.CleanupFailedAfterSuccessfulUse,
      SealingRequirements<Requirements>,
      ReleaseFailure
    > = {
      rebuild: ((revision, use) => {
        let produced: NodeMain.ProducedMain | undefined;
        return BorrowedOutput.withFile(
          {
            prefix: "effect-build-incremental-node-main-",
            produce: (ownedRoot) =>
              producer.rebuild(revision, ownedRoot).pipe(
                Effect.tap((value) =>
                  Effect.sync(() => {
                    produced = value;
                  })
                ),
                Effect.map((value) => value.path),
              ),
          },
          "hashed",
          (borrowed) =>
            Effect.gen(function*() {
              if (produced === undefined) return yield* Effect.die("incremental producer metadata was not captured");
              const builtins = yield* validateProduced(program, offer, produced);
              const main = NodeMainLease.mint({
                profile: NodeMain.profile,
                agreementId: offer.agreementId,
                nodeVersion: offer.nodeVersion,
                target: offer.target,
                format: produced.format,
                builtins,
                identity: Object.freeze({ bytes: borrowed.initial.bytes, digest: borrowed.initial.digest }),
                producer: Object.freeze(produced.producer),
                evidence: Object.freeze(produced.evidence),
              }, borrowed) as NodeMain.SealedMain;
              return yield* use(main);
            }),
        );
      }) as Driver<
        | Failure
        | IncrementalSnapshotRejected
        | BorrowedOutput.Failure
        | BorrowedOutput.CleanupFailedAfterSuccessfulUse,
        SealingRequirements<Requirements>,
        ReleaseFailure
      >["rebuild"],
      // The outer acquisition finalizer owns provider release. Because it was
      // registered first, this lifecycle finalizer closes admission and joins
      // in-flight consumers before provider release runs.
      release: Effect.void,
    };
    return yield* make(program, driver);
  });
