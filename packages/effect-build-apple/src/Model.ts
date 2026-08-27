import { Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";

/** The two separately distributed macOS architectures selected by the release contract. */
export const Architecture = Schema.Literals(["arm64", "x64"] as const);
export type Architecture = typeof Architecture.Type;

/** Exact architecture-bearing app result emitted by the selected app constructor. */
export interface ApplicationBundle extends Artifact.Bundle {
  readonly architecture: Architecture;
}

/** Exact architecture-bearing UDZO image before Developer ID signing. */
export interface UdzoDiskImage extends Artifact.FileArtifact {
  readonly architecture: Architecture;
}

/** Exact architecture-bearing flat installer before Developer ID Installer signing. */
export interface UnsignedInstallerPackage extends Artifact.FileArtifact {
  readonly architecture: Architecture;
}

/** Lowercase SHA-256 used to bind remote and local observations to immutable input bytes. */
export const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { expected: "a lowercase SHA-256 digest" }),
);
export type Sha256 = typeof Sha256.Type;

/** Exact SHA-1 certificate fingerprint accepted by Apple's identity selector. */
export const CertificateSha1 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{40}$/i, { expected: "a 40-character SHA-1 certificate fingerprint" }),
);
export type CertificateSha1 = typeof CertificateSha1.Type;

/** Closed Apple product family used by notarization, stapling, and Gatekeeper. */
export const ProductKind = Schema.Literals(["app", "dmg", "pkg"] as const);
export type ProductKind = typeof ProductKind.Type;

/** Durable, credential-free provenance for an Apple command-line tool. */
export class AppleToolFact extends Schema.Class<AppleToolFact>(
  "effect-build-apple/AppleToolFact",
)({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
}) {}

/** Durable evidence emitted only after Developer ID Application signing and strict verification. */
export class DeveloperIdApplicationSignature extends Schema.TaggedClass<DeveloperIdApplicationSignature>()(
  "DeveloperIdApplicationSignature",
  {
    architecture: Architecture,
    certificateSha1: CertificateSha1,
    tool: AppleToolFact,
    hardenedRuntime: Schema.Literal(true),
    secureTimestamp: Schema.Literal(true),
  },
) {}

/** Durable evidence emitted only after Developer ID signing and strict verification of a UDIF image. */
export class DeveloperIdDiskImageSignature extends Schema.TaggedClass<DeveloperIdDiskImageSignature>()(
  "DeveloperIdDiskImageSignature",
  {
    architecture: Architecture,
    certificateSha1: CertificateSha1,
    tool: AppleToolFact,
    secureTimestamp: Schema.Literal(true),
  },
) {}

/** Durable evidence emitted only after Developer ID Installer signing and package-signature verification. */
export class DeveloperIdInstallerSignature extends Schema.TaggedClass<DeveloperIdInstallerSignature>()(
  "DeveloperIdInstallerSignature",
  {
    architecture: Architecture,
    certificateSha1: CertificateSha1,
    signer: AppleToolFact,
    verifier: AppleToolFact,
  },
) {}

/** Exact app bundle carrying a verified Developer ID Application signature. */
export interface DeveloperIdApplicationBundle extends ApplicationBundle {
  readonly signature: DeveloperIdApplicationSignature;
}

/** Exact UDIF bytes carrying a verified Developer ID Application signature. */
export interface DeveloperIdDiskImage extends UdzoDiskImage {
  readonly signature: DeveloperIdDiskImageSignature;
}

/** Exact flat-package bytes carrying a verified Developer ID Installer signature. */
export interface DeveloperIdInstallerPackage extends UnsignedInstallerPackage {
  readonly signature: DeveloperIdInstallerSignature;
}

/** Notarization ticket correlation retained on every stapled artifact. */
export class NotarizationTicket extends Schema.Class<NotarizationTicket>(
  "effect-build-apple/NotarizationTicket",
)({
  submissionId: Schema.String.check(
    Schema.isPattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      { expected: "a lowercase UUID submission identifier" },
    ),
  ),
  submittedKind: Schema.Literals(["dmg", "pkg", "zip"] as const),
  submittedBytes: Schema.Natural,
  submittedSha256: Sha256,
  targetKind: ProductKind,
  targetIdentityKind: Schema.Literals(["file-bytes", "bundle-manifest"] as const),
  targetBytes: Schema.Natural,
  targetSha256: Sha256,
  targetArchitecture: Architecture,
  targetBundleName: Schema.optionalKey(Schema.NonEmptyString),
  submissionTool: AppleToolFact,
  acceptanceTool: AppleToolFact,
}) {}

/** Developer-ID app whose exact pre-staple manifest was accepted and whose ticket validates. */
export interface StapledApplicationBundle extends DeveloperIdApplicationBundle {
  readonly notarizationTicket: NotarizationTicket;
}

/** Developer-ID DMG whose exact pre-staple bytes were accepted and whose ticket validates. */
export interface StapledDiskImage extends DeveloperIdDiskImage {
  readonly notarizationTicket: NotarizationTicket;
}

/** Developer-ID pkg whose exact pre-staple bytes were accepted and whose ticket validates. */
export interface StapledInstallerPackage extends DeveloperIdInstallerPackage {
  readonly notarizationTicket: NotarizationTicket;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isToolFact = (value: unknown): boolean =>
  isObject(value) && typeof value.name === "string" && value.name.length > 0
  && typeof value.version === "string" && value.version.length > 0;

/** Runtime guard used at package boundaries; public structural types alone are not trusted. */
export const hasDeveloperIdApplicationSignature = (
  artifact: Artifact.Bundle,
): artifact is DeveloperIdApplicationBundle => {
  const signature = (artifact as { readonly signature?: unknown }).signature;
  const architecture = (artifact as { readonly architecture?: unknown }).architecture;
  return isObject(signature)
    && (architecture === "arm64" || architecture === "x64")
    && signature._tag === "DeveloperIdApplicationSignature"
    && signature.architecture === architecture
    && typeof signature.certificateSha1 === "string"
    && /^[0-9a-f]{40}$/i.test(signature.certificateSha1)
    && signature.hardenedRuntime === true
    && signature.secureTimestamp === true
    && isToolFact(signature.tool)
    && isObject(signature.tool)
    && signature.tool.name === "codesign"
    && artifact.tool.name === "codesign"
    && artifact.tool.version === signature.tool.version;
};

/** Runtime metadata guard for Developer ID-signed UDIF artifacts; native verification remains authoritative. */
export const hasDeveloperIdDiskImageSignature = (
  artifact: Artifact.FileArtifact,
): artifact is DeveloperIdDiskImage => {
  const signature = (artifact as { readonly signature?: unknown }).signature;
  const architecture = (artifact as { readonly architecture?: unknown }).architecture;
  return isObject(signature)
    && (architecture === "arm64" || architecture === "x64")
    && signature._tag === "DeveloperIdDiskImageSignature"
    && signature.architecture === architecture
    && typeof signature.certificateSha1 === "string"
    && /^[0-9a-f]{40}$/i.test(signature.certificateSha1)
    && signature.secureTimestamp === true
    && isToolFact(signature.tool)
    && isObject(signature.tool)
    && signature.tool.name === "codesign"
    && artifact.tool.name === "codesign"
    && artifact.tool.version === signature.tool.version;
};

/** Runtime guard used before installer notarization or stapling. */
export const hasDeveloperIdInstallerSignature = (
  artifact: Artifact.FileArtifact,
): artifact is DeveloperIdInstallerPackage => {
  const signature = (artifact as { readonly signature?: unknown }).signature;
  const architecture = (artifact as { readonly architecture?: unknown }).architecture;
  return isObject(signature)
    && (architecture === "arm64" || architecture === "x64")
    && signature._tag === "DeveloperIdInstallerSignature"
    && signature.architecture === architecture
    && typeof signature.certificateSha1 === "string"
    && /^[0-9a-f]{40}$/i.test(signature.certificateSha1)
    && isToolFact(signature.signer)
    && isObject(signature.signer)
    && signature.signer.name === "productsign"
    && isToolFact(signature.verifier)
    && isObject(signature.verifier)
    && signature.verifier.name === "pkgutil"
    && artifact.tool.name === "productsign+pkgutil"
    && artifact.tool.version === `${signature.signer.version};${signature.verifier.version}`;
};

/** A release operation received an artifact in the wrong Apple trust state. */
export class ProductStateInvalid extends Schema.TaggedError<ProductStateInvalid>()(
  "AppleProductStateInvalid",
  {
    operation: Schema.NonEmptyString,
    path: Schema.NonEmptyString,
    expected: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `${this.operation} requires ${this.expected}: ${this.path}`;
  }
}

/**
 * Resolve coordinates plus an exact version fact supplied by the application.
 *
 * Several Apple system tools do not expose an independently parseable semantic
 * version. The version should therefore be the exact Xcode/CLT or macOS tool
 * build fact selected by the application and acceptance matrix.
 */
export interface AppleToolOptions {
  readonly version: string;
  readonly executable?: string | undefined;
}

/** A bundle path could not be captured as one safe, stable directory tree. */
export class BundleInspectionFailed extends Schema.TaggedError<BundleInspectionFailed>()(
  "AppleBundleInspectionFailed",
  {
    path: Schema.NonEmptyString,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `could not capture Apple bundle ${this.path}: ${this.reason}`;
  }
}

/** A mutable path no longer matches the finalized file identity supplied to an Apple boundary. */
export class FileArtifactIdentityMismatch extends Schema.TaggedError<FileArtifactIdentityMismatch>()(
  "AppleFileArtifactIdentityMismatch",
  {
    operation: Schema.NonEmptyString,
    path: Schema.NonEmptyString,
    expectedBytes: Schema.Number,
    expectedSha256: Schema.optionalKey(Sha256),
    observedBytes: Schema.optionalKey(Schema.Natural),
    observedSha256: Schema.optionalKey(Sha256),
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `${this.operation} rejected finalized file ${this.path}: ${this.reason}`;
  }
}
