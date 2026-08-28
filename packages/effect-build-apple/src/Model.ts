import { Schema } from "effect";
import * as Artifact from "effect-build/Artifact";
import type * as Tool from "effect-build/Author/Tool";

export const Architecture = Schema.Literals(["arm64", "x64"] as const);
export type Architecture = typeof Architecture.Type;

export interface ApplicationBundle extends Artifact.HashedTree {
  readonly architecture: Architecture;
}

export interface UdzoDiskImage extends Artifact.HashedFile {
  readonly architecture: Architecture;
}

export interface UnsignedInstallerPackage extends Artifact.HashedFile {
  readonly architecture: Architecture;
}

export const CertificateSha1 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{40}$/i, { expected: "a 40-character SHA-1 certificate fingerprint" }),
);
export type CertificateSha1 = typeof CertificateSha1.Type;

export const ProductKind = Schema.Literals(["app", "dmg", "pkg"] as const);
export type ProductKind = typeof ProductKind.Type;

interface ApplicationSignatureFields {
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly tool: Tool.Observation<"codesign">;
  readonly hardenedRuntime: true;
  readonly secureTimestamp: true;
}

export class DeveloperIdApplicationSignature implements ApplicationSignatureFields {
  readonly _tag = "DeveloperIdApplicationSignature" as const;
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly tool: Tool.Observation<"codesign">;
  readonly hardenedRuntime: true;
  readonly secureTimestamp: true;

  constructor(fields: ApplicationSignatureFields) {
    this.architecture = fields.architecture;
    this.certificateSha1 = fields.certificateSha1;
    this.tool = fields.tool;
    this.hardenedRuntime = fields.hardenedRuntime;
    this.secureTimestamp = fields.secureTimestamp;
    Object.freeze(this);
  }
}

interface DiskImageSignatureFields {
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly tool: Tool.Observation<"codesign">;
  readonly secureTimestamp: true;
}

export class DeveloperIdDiskImageSignature implements DiskImageSignatureFields {
  readonly _tag = "DeveloperIdDiskImageSignature" as const;
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly tool: Tool.Observation<"codesign">;
  readonly secureTimestamp: true;

  constructor(fields: DiskImageSignatureFields) {
    this.architecture = fields.architecture;
    this.certificateSha1 = fields.certificateSha1;
    this.tool = fields.tool;
    this.secureTimestamp = fields.secureTimestamp;
    Object.freeze(this);
  }
}

interface InstallerSignatureFields {
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly signer: Tool.Observation<"productsign">;
  readonly verifier: Tool.Observation<"pkgutil">;
}

export class DeveloperIdInstallerSignature implements InstallerSignatureFields {
  readonly _tag = "DeveloperIdInstallerSignature" as const;
  readonly architecture: Architecture;
  readonly certificateSha1: CertificateSha1;
  readonly signer: Tool.Observation<"productsign">;
  readonly verifier: Tool.Observation<"pkgutil">;

  constructor(fields: InstallerSignatureFields) {
    this.architecture = fields.architecture;
    this.certificateSha1 = fields.certificateSha1;
    this.signer = fields.signer;
    this.verifier = fields.verifier;
    Object.freeze(this);
  }
}

export interface DeveloperIdApplicationBundle extends ApplicationBundle {
  readonly signature: DeveloperIdApplicationSignature;
}

export interface DeveloperIdDiskImage extends UdzoDiskImage {
  readonly signature: DeveloperIdDiskImageSignature;
}

export interface DeveloperIdInstallerPackage extends UnsignedInstallerPackage {
  readonly signature: DeveloperIdInstallerSignature;
}

export interface NotarizationTicketFields {
  readonly submissionId: string;
  readonly submittedKind: "dmg" | "pkg" | "zip";
  readonly submittedBytes: Artifact.DecimalBytes;
  readonly submittedDigest: Artifact.Digest;
  readonly targetKind: ProductKind;
  readonly targetIdentityKind: "file-bytes" | "tree-manifest";
  readonly targetBytes: Artifact.DecimalBytes;
  readonly targetDigest: Artifact.Digest;
  readonly targetArchitecture: Architecture;
  readonly targetBundleName?: string;
  readonly submissionTool: Tool.Observation<"notarytool">;
  readonly acceptanceTool: Tool.Observation<"notarytool">;
}

export class NotarizationTicket implements NotarizationTicketFields {
  readonly submissionId: string;
  readonly submittedKind: "dmg" | "pkg" | "zip";
  readonly submittedBytes: Artifact.DecimalBytes;
  readonly submittedDigest: Artifact.Digest;
  readonly targetKind: ProductKind;
  readonly targetIdentityKind: "file-bytes" | "tree-manifest";
  readonly targetBytes: Artifact.DecimalBytes;
  readonly targetDigest: Artifact.Digest;
  readonly targetArchitecture: Architecture;
  readonly targetBundleName?: string;
  readonly submissionTool: Tool.Observation<"notarytool">;
  readonly acceptanceTool: Tool.Observation<"notarytool">;

  constructor(fields: NotarizationTicketFields) {
    this.submissionId = fields.submissionId;
    this.submittedKind = fields.submittedKind;
    this.submittedBytes = fields.submittedBytes;
    this.submittedDigest = fields.submittedDigest;
    this.targetKind = fields.targetKind;
    this.targetIdentityKind = fields.targetIdentityKind;
    this.targetBytes = fields.targetBytes;
    this.targetDigest = fields.targetDigest;
    this.targetArchitecture = fields.targetArchitecture;
    if (fields.targetBundleName !== undefined) this.targetBundleName = fields.targetBundleName;
    this.submissionTool = fields.submissionTool;
    this.acceptanceTool = fields.acceptanceTool;
    Object.freeze(this);
  }
}

export interface StapledApplicationBundle extends DeveloperIdApplicationBundle {
  readonly notarizationTicket: NotarizationTicket;
}

export interface StapledDiskImage extends DeveloperIdDiskImage {
  readonly notarizationTicket: NotarizationTicket;
}

export interface StapledInstallerPackage extends DeveloperIdInstallerPackage {
  readonly notarizationTicket: NotarizationTicket;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isObservation = (value: unknown, name: string): value is Tool.Observation<string> =>
  Artifact.isProvenance(value)
  && "name" in value
  && value.name === name
  && value.participants.length > 0;

const observationIncluded = (
  provenance: Artifact.Provenance,
  observation: Tool.Observation<string>,
): boolean =>
  "participants" in provenance
  && provenance.participants.some((participant) =>
    observation.participants.some((expected) =>
      participant.name === expected.name
      && participant.content.digest.value === expected.content.digest.value
    )
  );

const observationMatches = (provenance: Artifact.Provenance, observation: Tool.Observation<string>): boolean =>
  isObservation(provenance, observation.name)
  && observationIncluded(provenance, observation);

export const hasDeveloperIdApplicationSignature = (
  artifact: Artifact.HashedTree,
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
    && isObservation(signature.tool, "codesign")
    && observationMatches(artifact.provenance, signature.tool);
};

export const hasDeveloperIdDiskImageSignature = (
  artifact: Artifact.HashedFile,
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
    && isObservation(signature.tool, "codesign")
    && observationMatches(artifact.provenance, signature.tool);
};

export const hasDeveloperIdInstallerSignature = (
  artifact: Artifact.HashedFile,
): artifact is DeveloperIdInstallerPackage => {
  const signature = (artifact as { readonly signature?: unknown }).signature;
  const architecture = (artifact as { readonly architecture?: unknown }).architecture;
  return isObject(signature)
    && (architecture === "arm64" || architecture === "x64")
    && signature._tag === "DeveloperIdInstallerSignature"
    && signature.architecture === architecture
    && typeof signature.certificateSha1 === "string"
    && /^[0-9a-f]{40}$/i.test(signature.certificateSha1)
    && isObservation(signature.signer, "productsign")
    && isObservation(signature.verifier, "pkgutil")
    && observationMatches(artifact.provenance, signature.signer)
    && observationIncluded(artifact.provenance, signature.verifier);
};

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

export interface AppleToolOptions {
  readonly version: string;
  readonly executable?: string | undefined;
}
