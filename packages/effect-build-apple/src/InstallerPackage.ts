import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

declare const DeveloperIdInstallerTypeId: unique symbol;

export interface DeveloperIdInstaller {
  readonly _tag: "DeveloperIdInstaller";
  readonly [DeveloperIdInstallerTypeId]: typeof DeveloperIdInstallerTypeId;
  /** Canonical uppercase SHA-1 fingerprint, never a display name. */
  readonly fingerprint: string;
  readonly teamId: string;
}

export interface DeveloperIdInstallerInput {
  readonly fingerprint: string;
  readonly teamId: string;
}

export interface CreateInput {
  readonly app: Artifact.TreeArtifact<"app-bundle">;
  /** Destination ending in `.pkg`, resolved against the current working directory. */
  readonly outfile: string;
  readonly identity: DeveloperIdInstaller;
  readonly packageIdentifier: string;
  readonly version: string;
  readonly installLocation: string;
}

export interface LayerOptions {
  readonly dittoPath?: string;
  readonly securityPath?: string;
  readonly pkgbuildPath?: string;
  readonly pkgutilPath?: string;
}

export interface CertificateObservation {
  readonly _tag: "DeveloperIdInstallerCertificate";
  readonly sha1Fingerprint: string;
  readonly sha256Fingerprint: string;
  readonly teamId: string;
  readonly classOid: "1.2.840.113635.100.6.1.14";
  readonly lookup: Artifact.ToolInvocation;
  readonly trust: Artifact.ToolInvocation;
  readonly packageSignature: Artifact.ToolInvocation;
}

export interface CreateResult extends Artifact.MutationResult<Artifact.FileArtifact<"installer-package">> {
  readonly certificate: CertificateObservation;
}
export type CreateError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.AppleInputInvalid
  | Artifact.AppleIdentityInvalid
  | Artifact.ArtifactError
  | Lifecycle.LifecycleError
  | Artifact.ToolError;

interface Service {
  readonly create: (input: CreateInput) => Effect.Effect<CreateResult, CreateError>;
}

export class Creator extends Context.Service<Creator, Service>()("effect-build-apple/InstallerPackage/Creator") {}

const operation = "installer-package.create";
const identities = new WeakSet<object>();
const fingerprintPattern = /^[0-9A-F]{40}$/u;
const sha256FingerprintPattern = /^[0-9A-F]{64}$/u;
const teamIdPattern = /^[A-Z0-9]{10}$/u;
const installerCertificateOid = "1.2.840.113635.100.6.1.14" as const;
const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const invalidInput = (field: string, reason: string): Artifact.AppleInputInvalid =>
  new Artifact.AppleInputInvalid({ operation, field, reason });
const invalidIdentity = (reason: string): Artifact.AppleIdentityInvalid =>
  new Artifact.AppleIdentityInvalid({ operation, identity: "DeveloperIdInstaller", reason });
const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Constructs the only identity authority accepted by InstallerPackage.create. */
export const developerIdInstaller = (input: DeveloperIdInstallerInput): DeveloperIdInstaller => {
  const fingerprint = input.fingerprint.toUpperCase();
  if (!fingerprintPattern.test(fingerprint)) {
    throw new TypeError("fingerprint must contain exactly 40 hexadecimal digits");
  }
  if (!teamIdPattern.test(input.teamId)) {
    throw new TypeError("teamId must contain exactly 10 uppercase alphanumeric characters");
  }
  const identity = Object.freeze({
    _tag: "DeveloperIdInstaller" as const,
    fingerprint,
    teamId: input.teamId,
  }) as DeveloperIdInstaller;
  identities.add(identity);
  return identity;
};

const validateText = (field: string, value: string): Effect.Effect<void, Artifact.AppleInputInvalid> => {
  if (value.length === 0) return Effect.fail(invalidInput(field, "must not be empty"));
  if (containsControlCharacter(value)) {
    return Effect.fail(invalidInput(field, "contains an unsupported control character"));
  }
  return Effect.void;
};

const validateInput = (
  input: CreateInput,
): Effect.Effect<
  void,
  Artifact.UnsupportedArtifactKind | Artifact.AppleInputInvalid | Artifact.AppleIdentityInvalid
> =>
  Effect.gen(function*() {
    if (!Artifact.isTreeArtifact(input.app) || !Artifact.isKind(input.app, "app-bundle")) {
      return yield* Effect.fail(
        new Artifact.UnsupportedArtifactKind({
          operation,
          expected: ["app-bundle tree"],
          actual: actualKind(input.app),
        }),
      );
    }
    if (!input.outfile.endsWith(".pkg")) yield* Effect.fail(invalidInput("outfile", "must end in .pkg"));
    if (!identities.has(input.identity)) {
      return yield* Effect.fail(invalidIdentity("unauthenticated identity descriptor"));
    }
    if (!fingerprintPattern.test(input.identity.fingerprint) || !teamIdPattern.test(input.identity.teamId)) {
      return yield* Effect.fail(invalidIdentity("identity fields changed after construction"));
    }
    yield* validateText("packageIdentifier", input.packageIdentifier);
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(input.packageIdentifier)) {
      yield* Effect.fail(invalidInput("packageIdentifier", "must contain only letters, digits, dots, and hyphens"));
    }
    yield* validateText("version", input.version);
    yield* validateText("installLocation", input.installLocation);
    if (!input.installLocation.startsWith("/")) {
      yield* Effect.fail(invalidInput("installLocation", "must be an absolute installation path"));
    }
  });

interface SelectedCertificate {
  readonly sha1Fingerprint: string;
  readonly sha256Fingerprint: string;
  readonly pem: string;
}

const certificateRecord =
  /SHA-256 hash:\s*([0-9A-Fa-f]{64})\s*\r?\nSHA-1 hash:\s*([0-9A-Fa-f]{40})\s*\r?\n(-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----)/gu;

const selectCertificate = (
  identity: DeveloperIdInstaller,
  inventory: Artifact.ToolInvocation,
): Effect.Effect<SelectedCertificate, Artifact.AppleIdentityInvalid> => {
  if (inventory.stdout.truncated || inventory.stderr.truncated) {
    return Effect.fail(invalidIdentity("security certificate inventory output was truncated"));
  }
  const matches = [...inventory.stdout.text.matchAll(certificateRecord)]
    .filter((match) => match[2]!.toUpperCase() === identity.fingerprint);
  if (matches.length !== 1) {
    return Effect.fail(invalidIdentity(
      matches.length === 0
        ? "fingerprint was not found in the security certificate inventory"
        : "fingerprint was not unambiguous in the security certificate inventory",
    ));
  }
  return Effect.succeed({
    sha1Fingerprint: matches[0]![2]!.toUpperCase(),
    sha256Fingerprint: matches[0]![1]!.toUpperCase(),
    pem: `${matches[0]![3]!}\n`,
  });
};

const invocationOutput = (invocation: Artifact.ToolInvocation): string =>
  [invocation.stdout.text, invocation.stderr.text].filter((output) => output.length > 0).join("\n");

const validateTrustedCertificate = (
  identity: DeveloperIdInstaller,
  selected: SelectedCertificate,
  trust: Artifact.ToolInvocation,
): Effect.Effect<void, Artifact.AppleIdentityInvalid> => {
  if (trust.stdout.truncated || trust.stderr.truncated) {
    return Effect.fail(invalidIdentity("security trust output was truncated"));
  }
  const output = invocationOutput(trust);
  if (!/certificate verification successful/iu.test(output)) {
    return Effect.fail(invalidIdentity("security did not report successful package-signing trust evaluation"));
  }
  const subjectStart = output.indexOf("Subject Name:");
  const issuerStart = output.indexOf("Issuer Name:", subjectStart);
  if (subjectStart === -1 || issuerStart === -1) {
    return Effect.fail(invalidIdentity("security trust output did not contain a leaf subject"));
  }
  const subject = output.slice(subjectStart, issuerStart);
  const teamIds = [...subject.matchAll(/^\s*Organizational Unit:\s*([A-Z0-9]+)\s*$/gmu)].map((match) => match[1]!);
  if (teamIds.length !== 1 || teamIds[0] !== identity.teamId) {
    return Effect.fail(invalidIdentity("trusted certificate subject.OU does not match the requested Team ID"));
  }
  const nextSubject = output.indexOf("Subject Name:", subjectStart + "Subject Name:".length);
  const leaf = output.slice(subjectStart, nextSubject === -1 ? output.length : nextSubject);
  if (!new RegExp(`\\(\\s*${installerCertificateOid.replaceAll(".", "\\.")}\\s*\\)`, "u").test(leaf)) {
    return Effect.fail(invalidIdentity("trusted certificate is not a Developer ID Installer certificate"));
  }
  const sha1 = /SHA-1:\s*([0-9A-Fa-f]{40})/u.exec(leaf)?.[1]?.toUpperCase();
  const sha256 = /SHA-256:\s*([0-9A-Fa-f]{64})/u.exec(leaf)?.[1]?.toUpperCase();
  if (sha1 !== selected.sha1Fingerprint || sha256 !== selected.sha256Fingerprint) {
    return Effect.fail(invalidIdentity("security trust output fingerprints do not match the selected certificate"));
  }
  return Effect.void;
};

const packageLeafSha256 = (
  invocation: Artifact.ToolInvocation,
): Effect.Effect<string, Artifact.AppleIdentityInvalid> => {
  if (invocation.stdout.truncated || invocation.stderr.truncated) {
    return Effect.fail(invalidIdentity("pkgutil signature output was truncated"));
  }
  const output = invocationOutput(invocation);
  if (!/^\s*Status:\s*signed by a certificate trusted by .+$/imu.test(output)) {
    return Effect.fail(invalidIdentity("pkgutil did not report a trusted package signature"));
  }
  const chain = output.indexOf("Certificate Chain:");
  const first = chain === -1 ? undefined : /^\s*1\.\s.*$/mu.exec(output.slice(chain));
  if (chain === -1 || first?.index === undefined) {
    return Effect.fail(invalidIdentity("pkgutil output did not contain a leaf certificate"));
  }
  const leafStart = chain + first.index;
  const remainder = output.slice(leafStart);
  const second = /^\s*2\.\s.*$/mu.exec(remainder);
  const leaf = remainder.slice(0, second?.index ?? remainder.length);
  const label = /SHA-?256 Fingerprint:\s*/iu.exec(leaf);
  if (label?.index === undefined) {
    return Effect.fail(invalidIdentity("pkgutil leaf certificate did not contain a SHA-256 fingerprint"));
  }
  const lines = leaf.slice(label.index + label[0].length).split(/\r?\n/u);
  let fingerprint = "";
  for (const line of lines) {
    const compact = line.replaceAll(/[\s:]/gu, "");
    if (compact.length === 0) continue;
    if (!/^[0-9A-Fa-f]+$/u.test(compact)) break;
    fingerprint += compact;
    if (fingerprint.length >= 64) break;
  }
  const normalized = fingerprint.toUpperCase();
  return sha256FingerprintPattern.test(normalized)
    ? Effect.succeed(normalized)
    : Effect.fail(invalidIdentity("pkgutil leaf SHA-256 fingerprint was malformed"));
};

const redactedLookup = (
  inventory: Artifact.ToolInvocation,
  selected: SelectedCertificate,
): Artifact.ToolInvocation =>
  Object.freeze({
    ...inventory,
    stdout: Object.freeze({
      text: `selected certificate SHA-1 ${selected.sha1Fingerprint}; SHA-256 ${selected.sha256Fingerprint}\n`,
      truncated: false,
    }),
    stderr: Object.freeze({ text: "", truncated: false }),
  });

const makeService = (
  options: LayerOptions = {},
): Effect.Effect<
  Service,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const security = yield* Tool.select({ name: "security", path: options.securityPath ?? "/usr/bin/security" });
    const pkgbuild = yield* Tool.select({ name: "pkgbuild", path: options.pkgbuildPath ?? "/usr/bin/pkgbuild" });
    const pkgutil = yield* Tool.select({ name: "pkgutil", path: options.pkgutilPath ?? "/usr/sbin/pkgutil" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const create = Effect.fn("effect-build-apple/InstallerPackage.create")(function*(input: CreateInput) {
      yield* validateInput(input);
      let certificate: CertificateObservation | undefined;
      const mutation = yield* Lifecycle.publishConstructedFile({
        operation,
        inputs: [input.app],
        destination: input.outfile,
        kind: "installer-package",
        copyTool: ditto,
        produce: ({ inputs: snapshots, stagedPath }) =>
          Effect.gen(function*() {
            const inventory = yield* Tool.runOrFail({
              tool: security,
              args: ["find-certificate", "-a", "-Z", "-p"],
            });
            const selected = yield* selectCertificate(input.identity, inventory);
            const certificatePath = path.join(
              path.dirname(stagedPath),
              ".effect-build-apple-installer-certificate.pem",
            );
            yield* fileSystem.writeFileString(certificatePath, selected.pem, { flag: "wx", mode: 0o600 }).pipe(
              Effect.mapError((error) =>
                new Artifact.ArtifactPublishFailed({
                  destination: stagedPath,
                  reason: `write selected certificate: ${describe(error)}`,
                })
              ),
            );
            const trust = yield* Tool.runOrFail({
              tool: security,
              args: ["verify-cert", "-c", certificatePath, "-p", "pkgSign", "-L", "-t", "-v"],
            });
            yield* validateTrustedCertificate(input.identity, selected, trust);
            const built = yield* Tool.runOrFail({
              tool: pkgbuild,
              args: [
                "--component",
                snapshots[0]!.path,
                "--install-location",
                input.installLocation,
                "--identifier",
                input.packageIdentifier,
                "--version",
                input.version,
                "--sign",
                input.identity.fingerprint,
                "--timestamp",
                stagedPath,
              ],
            });
            const checked = yield* Tool.runOrFail({
              tool: pkgutil,
              args: ["--check-signature", stagedPath],
            });
            const packageFingerprint = yield* packageLeafSha256(checked);
            if (packageFingerprint !== selected.sha256Fingerprint) {
              return yield* invalidIdentity(
                "pkgutil leaf certificate does not match the exact certificate selected for signing",
              );
            }
            const lookup = redactedLookup(inventory, selected);
            certificate = Object.freeze({
              _tag: "DeveloperIdInstallerCertificate" as const,
              sha1Fingerprint: selected.sha1Fingerprint,
              sha256Fingerprint: selected.sha256Fingerprint,
              teamId: input.identity.teamId,
              classOid: installerCertificateOid,
              lookup,
              trust,
              packageSignature: checked,
            });
            return [lookup, trust, built, checked];
          }),
      });
      return { ...mutation, certificate: certificate! };
    });

    return { create: (input) => create(input).pipe(Effect.provide(services)) };
  });

export const create = (input: CreateInput): Effect.Effect<CreateResult, CreateError, Creator> =>
  Creator.use((service) => service.create(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Creator,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Creator, makeService(options));
