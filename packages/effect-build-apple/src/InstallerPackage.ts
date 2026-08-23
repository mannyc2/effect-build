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

export type CreateResult = Artifact.MutationResult<Artifact.FileArtifact<"installer-package">>;
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
const teamIdPattern = /^[A-Z0-9]{10}$/u;
const identityLine = /^\s*\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"]+)"\s*$/u;
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

const validateIdentityInventory = (
  identity: DeveloperIdInstaller,
  stdout: string,
): Effect.Effect<void, Artifact.AppleIdentityInvalid> => {
  const matches = stdout
    .split(/\r?\n/u)
    .map((line) => identityLine.exec(line))
    .filter((match): match is RegExpExecArray => match !== null && match[1]!.toUpperCase() === identity.fingerprint);
  if (matches.length === 0) {
    return Effect.fail(invalidIdentity("fingerprint was not found in the security identity inventory"));
  }
  if (matches.length !== 1 || !matches[0]![2]!.startsWith("Developer ID Installer: ")) {
    return Effect.fail(
      invalidIdentity(
        matches.length !== 1
          ? "the fingerprint is not unambiguous in the security identity inventory"
          : `identity is not a Developer ID Installer certificate: ${matches[0]![2]}`,
      ),
    );
  }
  const teamId = /\(([A-Z0-9]{10})\)$/u.exec(matches[0]![2]!)?.[1];
  if (teamId !== identity.teamId) {
    return Effect.fail(invalidIdentity("identity Team ID does not match the requested Team ID"));
  }
  return Effect.void;
};

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
      return yield* Lifecycle.publishConstructedFile({
        operation,
        inputs: [input.app],
        destination: input.outfile,
        kind: "installer-package",
        copyTool: ditto,
        produce: ({ inputs: snapshots, stagedPath }) =>
          Effect.gen(function*() {
            const inventory = yield* Tool.runOrFail({
              tool: security,
              args: ["find-identity", "-v", "-p", "basic"],
            });
            yield* validateIdentityInventory(input.identity, inventory.stdout.text);
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
                stagedPath,
              ],
            });
            const checked = yield* Tool.runOrFail({
              tool: pkgutil,
              args: ["--check-signature", stagedPath],
            });
            return [inventory, built, checked];
          }),
      });
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
