import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleIdentityInvalid,
  AppleInputInvalid,
  type Artifact,
  type ArtifactError,
  type ArtifactServices,
  type FileArtifact,
  isFileArtifact,
  type MutationProvenance,
  revalidate,
  type ToolError,
  type ToolInvocation,
  type TreeArtifact,
  UnsupportedArtifactKind,
} from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

declare const DeveloperIdApplicationTypeId: unique symbol;

export interface DeveloperIdApplication {
  readonly _tag: "DeveloperIdApplication";
  readonly [DeveloperIdApplicationTypeId]: typeof DeveloperIdApplicationTypeId;
  /** Canonical uppercase SHA-1 fingerprint, never a display name. */
  readonly fingerprint: string;
  readonly teamId: string;
}

export interface DeveloperIdApplicationInput {
  readonly fingerprint: string;
  readonly teamId: string;
}

export interface SigningPlanItem {
  /** `.` denotes the top-level input; all other paths are relative slash-separated paths inside an app bundle. */
  readonly path: string;
  /** Required only for a top-level nonbundled Mach-O and rejected for bundled code or disk images. */
  readonly identifier?: string | undefined;
  /** Caller-owned policy. `false` deliberately omits `--options runtime`. */
  readonly hardenedRuntime: boolean;
  /** Caller-owned, authenticated policy snapshot. */
  readonly entitlements?: FileArtifact<"entitlements"> | undefined;
}

export interface SignInput {
  readonly input: Artifact;
  readonly destination: string;
  readonly identity: DeveloperIdApplication;
  /** Exact caller-supplied inside-out order. The app-bundle root must be last. */
  readonly plan: readonly SigningPlanItem[];
}

export type SignedArtifact =
  | FileArtifact<"mach-o">
  | TreeArtifact<"app-bundle">
  | FileArtifact<"disk-image">;

export interface IdentityObservation {
  readonly _tag: "DeveloperIdApplicationIdentity";
  readonly fingerprint: string;
  readonly teamId: string;
  readonly invocation: ToolInvocation;
}

export interface SignatureObservation {
  readonly _tag: "CodeSignature";
  readonly path: string;
  readonly hardenedRuntime: boolean;
  readonly entitlements: boolean;
  readonly sign: ToolInvocation;
  readonly verify: ToolInvocation;
}

export interface SignResult {
  readonly artifact: SignedArtifact;
  readonly provenance: MutationProvenance;
  readonly identity: IdentityObservation;
  readonly signatures: readonly SignatureObservation[];
}

export type CodeSignError =
  | ArtifactError
  | Lifecycle.LifecycleError
  | ToolError
  | AppleIdentityInvalid
  | AppleInputInvalid
  | UnsupportedArtifactKind;

export interface LayerOptions {
  readonly codesignPath?: string | undefined;
  readonly securityPath?: string | undefined;
  readonly dittoPath?: string | undefined;
}

interface Service {
  readonly sign: (input: SignInput) => Effect.Effect<SignResult, CodeSignError>;
}

export class Signer extends Context.Service<Signer, Service>()("effect-build-apple/CodeSign/Signer") {}

const identities = new WeakSet<object>();
const fingerprintPattern = /^[0-9A-F]{40}$/;
const teamIdPattern = /^[A-Z0-9]{10}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

const invalidIdentity = (reason: string): AppleIdentityInvalid =>
  new AppleIdentityInvalid({
    operation: "CodeSign.sign",
    identity: "DeveloperIdApplication",
    reason,
  });

const validateIdentityInput = (
  input: DeveloperIdApplicationInput,
): { readonly fingerprint: string; readonly teamId: string } => {
  const fingerprint = input.fingerprint.toUpperCase();
  if (!fingerprintPattern.test(fingerprint)) {
    throw new TypeError("fingerprint must contain exactly 40 hexadecimal digits");
  }
  if (!teamIdPattern.test(input.teamId)) {
    throw new TypeError("teamId must contain exactly 10 uppercase alphanumeric characters");
  }
  return { fingerprint, teamId: input.teamId };
};

/** Constructs the only identity kind accepted by this operation family. */
export const developerIdApplication = (input: DeveloperIdApplicationInput): DeveloperIdApplication => {
  const checked = validateIdentityInput(input);
  const identity = Object.freeze({ _tag: "DeveloperIdApplication" as const, ...checked }) as DeveloperIdApplication;
  identities.add(identity);
  return identity;
};

interface NormalizedPlanItem {
  readonly path: string;
  readonly identifier?: string | undefined;
  readonly hardenedRuntime: boolean;
  readonly entitlements?: FileArtifact<"entitlements"> | undefined;
  readonly entitlementIndex?: number | undefined;
}

const invalidPlan = (field: string, reason: string): AppleInputInvalid =>
  new AppleInputInvalid({
    operation: "CodeSign.sign",
    field,
    reason,
  });

const normalizeRelativePath = (input: string): string | undefined => {
  if (input === ".") return input;
  if (input === "" || input.startsWith("/") || input.includes("\\")) return undefined;
  const segments = input.split("/");
  return segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ? undefined
    : segments.join("/");
};

const isAncestor = (parent: string, child: string): boolean =>
  parent === "." ? child !== "." : child.startsWith(`${parent}/`);

const normalizePlan = (
  input: Artifact,
  supplied: readonly SigningPlanItem[],
): Effect.Effect<readonly NormalizedPlanItem[], AppleInputInvalid> =>
  Effect.gen(function*() {
    if (supplied.length === 0) return yield* invalidPlan("plan", "at least one explicit signing item is required");
    const normalized: NormalizedPlanItem[] = [];
    const paths = new Set<string>();
    let entitlementIndex = 0;
    for (let index = 0; index < supplied.length; index++) {
      const item = supplied[index]!;
      const itemPath = normalizeRelativePath(item.path);
      if (itemPath === undefined) {
        return yield* invalidPlan(`plan[${index}].path`, "must be `.` or a normalized relative slash-separated path");
      }
      if (paths.has(itemPath)) return yield* invalidPlan(`plan[${index}].path`, "duplicate signing target");
      paths.add(itemPath);
      if (typeof item.hardenedRuntime !== "boolean") {
        return yield* invalidPlan(`plan[${index}].hardenedRuntime`, "must be explicitly true or false");
      }
      if (
        item.entitlements !== undefined && (
          !isFileArtifact(item.entitlements) || item.entitlements.kind !== "entitlements"
        )
      ) {
        return yield* invalidPlan(`plan[${index}].entitlements`, "must be an authenticated entitlements file");
      }
      normalized.push(Object.freeze({
        path: itemPath,
        ...(item.identifier === undefined ? {} : { identifier: item.identifier }),
        hardenedRuntime: item.hardenedRuntime,
        ...(item.entitlements === undefined
          ? {}
          : { entitlements: item.entitlements, entitlementIndex: entitlementIndex++ }),
      }));
    }
    for (let parentIndex = 0; parentIndex < normalized.length; parentIndex++) {
      for (let childIndex = parentIndex + 1; childIndex < normalized.length; childIndex++) {
        if (isAncestor(normalized[parentIndex]!.path, normalized[childIndex]!.path)) {
          return yield* invalidPlan("plan", "parents must follow their nested signing targets");
        }
      }
    }
    if (input.kind === "app-bundle") {
      if (normalized.at(-1)!.path !== ".") return yield* invalidPlan("plan", "app-bundle root must be signed last");
      const entries = input._tag === "TreeArtifact" ? input.identity.entries : [];
      for (let index = 0; index < normalized.length; index++) {
        const item = normalized[index]!;
        if (item.identifier !== undefined) {
          return yield* invalidPlan(`plan[${index}].identifier`, "bundled code derives its signing identifier");
        }
        if (item.path !== ".") {
          const entry = entries.find(({ path }) => path === item.path);
          if (entry === undefined || entry._tag === "SymbolicLink") {
            return yield* invalidPlan(
              `plan[${index}].path`,
              "must name a nonsymlink entry in the authenticated bundle",
            );
          }
        }
      }
      return Object.freeze(normalized);
    }
    if (normalized.length !== 1 || normalized[0]!.path !== ".") {
      return yield* invalidPlan("plan", "nonbundle signing requires exactly one top-level item");
    }
    if (input.kind === "mach-o") {
      const identifier = normalized[0]!.identifier;
      if (identifier === undefined || !identifierPattern.test(identifier)) {
        return yield* invalidPlan("plan[0].identifier", "a nonbundled Mach-O requires an explicit valid identifier");
      }
    } else {
      if (normalized[0]!.identifier !== undefined) {
        return yield* invalidPlan("plan[0].identifier", "only a nonbundled Mach-O accepts an explicit identifier");
      }
      if (normalized[0]!.hardenedRuntime) {
        return yield* invalidPlan("plan[0].hardenedRuntime", "disk images do not carry hardened-runtime policy");
      }
      if (normalized[0]!.entitlements !== undefined) {
        return yield* invalidPlan("plan[0].entitlements", "disk images do not carry executable entitlements");
      }
    }
    return Object.freeze(normalized);
  });

const validateIdentity = (
  identity: DeveloperIdApplication,
  security: Tool.SelectedTool,
): Effect.Effect<IdentityObservation, ToolError | AppleIdentityInvalid, Tool.ToolServices> =>
  Effect.gen(function*() {
    if (!identities.has(identity)) return yield* invalidIdentity("unauthenticated identity descriptor");
    if (!fingerprintPattern.test(identity.fingerprint) || !teamIdPattern.test(identity.teamId)) {
      return yield* invalidIdentity("identity fields changed after construction");
    }
    const invocation = yield* Tool.runOrFail({
      tool: security,
      args: ["find-identity", "-v", "-p", "codesigning"],
    });
    const lines = invocation.stdout.text.split(/\r?\n/);
    let label: string | undefined;
    for (const line of lines) {
      const match = /^\s*\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"]+)"\s*$/.exec(line);
      if (match?.[1]?.toUpperCase() === identity.fingerprint) {
        label = match[2];
        break;
      }
    }
    if (label === undefined) return yield* invalidIdentity("fingerprint is not a valid codesigning identity");
    if (!label.startsWith("Developer ID Application: ")) {
      return yield* invalidIdentity("fingerprint is not a Developer ID Application identity");
    }
    const team = /\(([A-Z0-9]{10})\)$/.exec(label)?.[1];
    if (team !== identity.teamId) {
      return yield* invalidIdentity("identity Team ID does not match the requested Team ID");
    }
    return Object.freeze({
      _tag: "DeveloperIdApplicationIdentity" as const,
      fingerprint: identity.fingerprint,
      teamId: identity.teamId,
      invocation,
    });
  });

const makeService = (
  options: LayerOptions = {},
): Effect.Effect<
  Service,
  ToolError,
  ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const codesign = yield* Tool.select({ name: "codesign", path: options.codesignPath ?? "/usr/bin/codesign" });
    const security = yield* Tool.select({ name: "security", path: options.securityPath ?? "/usr/bin/security" });
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const sign = (supplied: SignInput): Effect.Effect<SignResult, CodeSignError> =>
      Effect.gen(function*() {
        const input = supplied.input;
        if (input.kind !== "mach-o" && input.kind !== "app-bundle" && input.kind !== "disk-image") {
          return yield* new UnsupportedArtifactKind({
            operation: "CodeSign.sign",
            actual: input.kind,
            expected: ["mach-o", "app-bundle", "disk-image"],
          });
        }
        yield* revalidate(input);
        const plan = yield* normalizePlan(input, [...supplied.plan]);
        const supporting = plan.flatMap((item) => item.entitlements === undefined ? [] : [item.entitlements]);
        for (const entitlements of supporting) yield* revalidate(entitlements);
        const identity = yield* validateIdentity(supplied.identity, security);
        const signatures: SignatureObservation[] = [];
        const mutate = ({ staged, supportingInputs }: Lifecycle.MutationContext<typeof input>) =>
          Effect.gen(function*() {
            const invocations: ToolInvocation[] = [];
            const targetPath = (item: NormalizedPlanItem): string =>
              item.path === "." ? staged.path : path.join(staged.path, ...item.path.split("/"));
            const signs: { readonly item: NormalizedPlanItem; readonly invocation: ToolInvocation }[] = [];
            for (const item of plan) {
              const args = ["--force", "--sign", supplied.identity.fingerprint, "--timestamp"];
              if (item.hardenedRuntime) args.push("--options", "runtime");
              if (item.entitlementIndex !== undefined) {
                args.push("--entitlements", supportingInputs[item.entitlementIndex]!.path);
              }
              if (item.identifier !== undefined) args.push("--identifier", item.identifier);
              args.push(targetPath(item));
              const invocation = yield* Tool.runOrFail({ tool: codesign, args });
              invocations.push(invocation);
              signs.push({ item, invocation });
            }
            for (const { item, invocation: signed } of signs) {
              const verified = yield* Tool.runOrFail({
                tool: codesign,
                args: ["--verify", "--strict", "--verbose=2", targetPath(item)],
              });
              invocations.push(verified);
              signatures.push(Object.freeze({
                _tag: "CodeSignature",
                path: item.path,
                hardenedRuntime: item.hardenedRuntime,
                entitlements: item.entitlements !== undefined,
                sign: signed,
                verify: verified,
              }));
            }
            return invocations;
          });
        const mutation = input._tag === "FileArtifact"
          ? yield* Lifecycle.publishFileMutation({
            operation: "CodeSign.sign",
            input,
            supportingInputs: supporting,
            destination: supplied.destination,
            copyTool: ditto,
            mutate,
          })
          : yield* Lifecycle.publishTreeMutation({
            operation: "CodeSign.sign",
            input,
            supportingInputs: supporting,
            destination: supplied.destination,
            copyTool: ditto,
            mutate,
          });
        return {
          artifact: mutation.artifact as SignedArtifact,
          provenance: {
            ...mutation.provenance,
            tools: [identity.invocation, ...mutation.provenance.tools],
          },
          identity,
          signatures: Object.freeze(signatures),
        };
      }).pipe(Effect.provide(services));
    return { sign };
  });

export const sign = (input: SignInput): Effect.Effect<SignResult, CodeSignError, Signer> =>
  Signer.use((service) => service.sign(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Signer,
  ToolError,
  ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Signer, makeService(options));
