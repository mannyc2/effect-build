import { Context, Crypto, Effect, FileSystem, Path, Schema } from "effect";
import type * as Artifact from "../Artifact.js";
import { ArtifactInvalid, decimalBytes, sha256Digest } from "../Artifact.js";
import type { SystemTarget } from "../SystemTarget.js";
import * as BorrowedOutput from "./BorrowedOutput.js";
import * as NodeMainLease from "./internal/NodeMainLease.js";

const describeUnknown = (cause: unknown): string => {
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) return cause.message;
  if ((typeof cause === "object" && cause !== null) || typeof cause === "function") {
    try {
      const message = Reflect.get(cause, "message");
      if (typeof message === "string") return message;
    } catch {
      // Fall through to the remaining bounded descriptions.
    }
    try {
      const tag = Reflect.get(cause, "_tag");
      if (typeof tag === "string") return tag;
    } catch {
      // Fall through to primitive coercion.
    }
  }
  try {
    return String(cause);
  } catch {
    return "unknown cause";
  }
};

export class PortableRejected extends Schema.TaggedError<PortableRejected>()("PortableRejected", {
  profile: Schema.String,
  phase: Schema.Literals(["request", "analysis"] as const),
  reason: Schema.String,
}) {
  override get message(): string {
    return `${this.profile} rejected during ${this.phase}: ${this.reason}`;
  }
}

export class PortableUnsupported extends Schema.TaggedError<PortableUnsupported>()("PortableUnsupported", {
  profile: Schema.String,
  provider: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `${this.profile} is unsupported by ${this.provider}: ${this.reason}`;
  }
}

export class ProviderFailed extends Schema.TaggedError<ProviderFailed>()("ProviderFailed", {
  provider: Schema.String,
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    const detail = describeUnknown(this.cause);
    return `${this.provider} ${this.operation} failed${detail.length === 0 ? "" : `: ${detail}`}`;
  }
}

export const profile = "effect-build/profile/node-main/sea-default-loader@1" as const;
export const offerProtocol = "effect-build/profile/node-main/assembler-offer@1" as const;
export const producedProtocol = "effect-build/profile/node-main/produced@1" as const;

export type Format = "commonjs" | "module";

export interface ProviderIdentity {
  readonly package: string;
  readonly version: string;
  readonly engine: string;
  readonly engineVersion: string;
}

export interface Request {
  readonly protocol: typeof profile;
  readonly entrypoint: string;
  readonly format: Format;
}

export interface AssemblerOffer {
  readonly protocol: typeof offerProtocol;
  /** Changes whenever a compatibility-relevant semantic term changes. */
  readonly agreementId: string;
  readonly nodeVersion: string;
  readonly target: SystemTarget;
  readonly formats: readonly [Format, ...Format[]];
  readonly builtins: readonly string[];
  readonly loader: "sea-default";
  readonly assets: "none";
  readonly snapshot: false;
  readonly codeCache: false;
  readonly dynamicImport: "bundled-only";
}

export interface ProducedMain {
  readonly protocol: typeof producedProtocol;
  readonly agreementId: string;
  readonly format: Format;
  readonly path: string;
  /** Canonical surviving runtime loads. Local/package/JSON/addon loads are illegal. */
  readonly builtins: readonly string[];
  readonly sideOutputs: readonly [];
  readonly producer: ProviderIdentity;
  readonly evidence: readonly [unknown, ...unknown[]];
}

export interface OfferRequest {
  readonly format: Format;
}

export interface AssembleRequest {
  readonly outfile: string;
  readonly main: SealedMain;
}

export interface BuildInput {
  readonly program: Request;
  readonly outfile: string;
}

export type RoleError = ArtifactInvalid | PortableRejected | PortableUnsupported | ProviderFailed;

interface ProducerService {
  readonly produce: (
    request: Request,
    offer: AssemblerOffer,
    ownedRoot: Artifact.AbsolutePath,
  ) => Effect.Effect<ProducedMain, RoleError>;
}

interface AssemblerService {
  /** Pure with respect to output mutation. This is always called before producer work. */
  readonly offer: (request: OfferRequest) => Effect.Effect<AssemblerOffer, RoleError>;
  readonly assemble: (
    request: AssembleRequest,
  ) => Effect.Effect<
    Artifact.Executable,
    RoleError | BorrowedOutput.Failure | SealedMainIdentityMismatch
  >;
}

export class Producer extends Context.Service<Producer, ProducerService>()("effect-build/Author/NodeMain/Producer") {}
export class Assembler
  extends Context.Service<Assembler, AssemblerService>()("effect-build/Author/NodeMain/Assembler")
{}

const SealedMainTypeId = NodeMainLease.TypeId;

/** Opaque semantic capability. Only this module can mint a valid sealed main. */
export interface SealedMain {
  readonly [SealedMainTypeId]: typeof SealedMainTypeId;
  readonly profile: typeof profile;
  readonly agreementId: string;
  readonly nodeVersion: string;
  readonly target: SystemTarget;
  readonly format: Format;
  readonly builtins: readonly string[];
  readonly identity: Readonly<{ readonly bytes: Artifact.DecimalBytes; readonly digest: Artifact.Digest }>;
  readonly producer: ProviderIdentity;
  readonly evidence: readonly [unknown, ...unknown[]];
}

export interface AcquiredMain {
  readonly contents: Uint8Array;
  readonly format: Format;
  readonly agreementId: string;
  readonly identity: SealedMain["identity"];
}

export class SealedMainIdentityMismatch extends Schema.TaggedError<SealedMainIdentityMismatch>()(
  "SealedMainIdentityMismatch",
  {
    expectedDigest: Schema.String,
    observedDigest: Schema.String,
    expectedBytes: Schema.String,
    observedBytes: Schema.String,
  },
) {}

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const reject = (phase: "request" | "analysis", reason: string): PortableRejected =>
  new PortableRejected({ profile, phase, reason });

const normalizeBuiltins = (values: readonly string[]): readonly string[] | undefined => {
  const normalized = values.map((value) => value.startsWith("node:") ? value : `node:${value}`);
  if (normalized.some((value) => !/^node:[a-z0-9_./-]+$/u.test(value))) return undefined;
  const unique = [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
  return unique.length === normalized.length ? Object.freeze(unique) : undefined;
};

const canonicalBuiltins = (values: readonly string[]): readonly string[] | undefined => {
  const normalized = normalizeBuiltins(values);
  return normalized !== undefined && normalized.every((value, index) => value === values[index])
    ? normalized
    : undefined;
};

const validateRequest = (request: Request): Effect.Effect<void, PortableRejected> => {
  if ((request as { readonly protocol?: unknown }).protocol !== profile) {
    return Effect.fail(reject("request", "unknown profile protocol"));
  }
  if (request.entrypoint.length === 0 || request.entrypoint.includes("\0")) {
    return Effect.fail(reject("request", "entrypoint must be non-empty and contain no NUL"));
  }
  if (request.format !== "commonjs" && request.format !== "module") {
    return Effect.fail(reject("request", "format must be commonjs or module"));
  }
  return Effect.void;
};

const validateOffer = (offer: AssemblerOffer, request: Request): Effect.Effect<void, PortableRejected> => {
  if (offer.protocol !== offerProtocol) return Effect.fail(reject("request", "assembler offered an unknown protocol"));
  if (offer.agreementId.length === 0 || offer.nodeVersion.length === 0) {
    return Effect.fail(reject("request", "assembler offer has an empty agreement or Node version"));
  }
  if (!offer.formats.includes(request.format)) {
    return Effect.fail(reject("request", `assembler does not accept ${request.format}`));
  }
  if (
    offer.loader !== "sea-default"
    || offer.assets !== "none"
    || offer.snapshot !== false
    || offer.codeCache !== false
    || offer.dynamicImport !== "bundled-only"
  ) {
    return Effect.fail(reject("request", "assembler offer is outside the strict SEA default-loader profile"));
  }
  if (canonicalBuiltins(offer.builtins) === undefined) {
    return Effect.fail(reject("request", "assembler built-in inventory is not canonical"));
  }
  return Effect.void;
};

const validateProduced = (
  produced: ProducedMain,
  request: Request,
  offer: AssemblerOffer,
): Effect.Effect<readonly string[], PortableRejected> => {
  if (produced.protocol !== producedProtocol) return Effect.fail(reject("analysis", "unknown producer protocol"));
  if (produced.agreementId !== offer.agreementId) {
    return Effect.fail(reject("analysis", "producer did not bind the assembler agreement"));
  }
  if (produced.format !== request.format) return Effect.fail(reject("analysis", "producer changed the main format"));
  if (produced.sideOutputs.length !== 0) {
    return Effect.fail(reject("analysis", "strict sealed main cannot have side outputs"));
  }
  if (produced.evidence.length === 0) return Effect.fail(reject("analysis", "producer evidence is empty"));
  const builtins = canonicalBuiltins(produced.builtins);
  if (builtins === undefined || builtins.some((builtin) => !offer.builtins.includes(builtin))) {
    return Effect.fail(reject("analysis", "producer reported a non-canonical or unavailable runtime load"));
  }
  return Effect.succeed(builtins);
};

const mint = (
  produced: ProducedMain,
  offer: AssemblerOffer,
  builtins: readonly string[],
  borrowed: BorrowedOutput.File<"hashed">,
): SealedMain => {
  const sealed = NodeMainLease.mint({
    profile,
    agreementId: offer.agreementId,
    nodeVersion: offer.nodeVersion,
    target: offer.target,
    format: produced.format,
    builtins,
    identity: Object.freeze({ bytes: borrowed.initial.bytes, digest: borrowed.initial.digest }),
    producer: Object.freeze(produced.producer),
    evidence: Object.freeze(produced.evidence),
  }, borrowed);
  return sealed;
};

/**
 * Acquires one immutable byte snapshot and re-observes the borrowed file around
 * the read. The transport path is never part of the public semantic value.
 */
export const acquire = (
  main: SealedMain,
): Effect.Effect<
  AcquiredMain,
  BorrowedOutput.Failure | ArtifactInvalid | SealedMainIdentityMismatch,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const borrowed = NodeMainLease.borrowedOf(main);
    if (borrowed === undefined) {
      return yield* new ArtifactInvalid({ path: "<sealed-main>", reason: "value was not minted by this module" });
    }
    const before = yield* borrowed.observe;
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const contents = yield* fileSystem.readFile(borrowed.path).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: borrowed.path, reason: "unable to acquire sealed main" })),
    );
    const after = yield* borrowed.observe;
    const rawDigest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: borrowed.path, reason: "sha-256 digest unavailable" })),
    );
    const observedDigest = sha256Digest(hex(new Uint8Array(rawDigest)));
    const observedBytes = decimalBytes(`${contents.byteLength}`);
    if (
      before.digest.value !== main.identity.digest.value
      || after.digest.value !== main.identity.digest.value
      || observedDigest.value !== main.identity.digest.value
      || observedBytes !== main.identity.bytes
    ) {
      return yield* new SealedMainIdentityMismatch({
        expectedDigest: main.identity.digest.value,
        observedDigest: observedDigest.value,
        expectedBytes: main.identity.bytes,
        observedBytes,
      });
    }
    return Object.freeze({
      contents: Uint8Array.from(contents),
      format: main.format,
      agreementId: main.agreementId,
      identity: main.identity,
    });
  });

/**
 * Offer-first composition: negotiate, validate, produce, seal, and consume in
 * one borrowed continuation. No destination is touched before offer acceptance.
 */
export const assemble = (
  input: BuildInput,
): Effect.Effect<
  Artifact.Executable,
  | RoleError
  | BorrowedOutput.Failure
  | SealedMainIdentityMismatch
  | BorrowedOutput.CleanupFailedAfterSuccessfulUse,
  | Producer
  | Assembler
  | BorrowedOutput.CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
> =>
  Effect.gen(function*() {
    yield* validateRequest(input.program);
    const assembler = yield* Assembler;
    const offer = yield* assembler.offer({ format: input.program.format });
    yield* validateOffer(offer, input.program);
    const producer = yield* Producer;
    let produced: ProducedMain | undefined;
    let builtins: readonly string[] | undefined;
    return yield* BorrowedOutput.withFile(
      {
        prefix: "effect-build-node-main-",
        produce: (ownedRoot) =>
          Effect.gen(function*() {
            produced = yield* producer.produce(input.program, offer, ownedRoot);
            builtins = yield* validateProduced(produced, input.program, offer);
            return produced.path;
          }),
      },
      "hashed",
      (borrowed) => {
        if (produced === undefined || builtins === undefined) {
          return Effect.die("Node main producer metadata was not captured");
        }
        return assembler.assemble({ outfile: input.outfile, main: mint(produced, offer, builtins, borrowed) });
      },
    );
  });
