import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  AppleIdentityInvalid,
  AppleInputInvalid,
  type ArtifactError,
  ArtifactPublishFailed,
  type ArtifactServices,
  type FileArtifact,
  isFileArtifact,
  type MutationProvenance,
  observeFile,
  observeTree,
  revalidate,
  type ToolError,
  type ToolInvocation,
  type TreeArtifact,
  UnsupportedArtifactKind,
} from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Plist from "./internal/Plist.js";
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

export interface SignInput<A extends SignableArtifact = SignableArtifact> {
  readonly input: A;
  readonly destination: string;
  readonly identity: DeveloperIdApplication;
  /** Exact caller-supplied inside-out order. The app-bundle root must be last. */
  readonly plan: readonly SigningPlanItem[];
}

export type SignableArtifact =
  | FileArtifact<"mach-o" | "disk-image">
  | TreeArtifact<"app-bundle">;

export interface IdentityObservation {
  readonly _tag: "DeveloperIdApplicationIdentity";
  readonly fingerprint: string;
  readonly teamId: string;
  readonly designatedRequirement: string;
}

export interface SignatureObservation {
  readonly _tag: "CodeSignature";
  readonly path: string;
  readonly identifier: string;
  readonly teamId: string;
  readonly secureTimestamp: string;
  readonly hardenedRuntime: boolean;
  readonly entitlements: boolean;
  readonly sign: ToolInvocation;
  readonly verify: ToolInvocation;
  readonly display: ToolInvocation;
  readonly entitlementDisplay: ToolInvocation;
  readonly entitlementNormalization?: ToolInvocation | undefined;
}

export interface SignResult<A extends SignableArtifact = SignableArtifact> {
  readonly artifact: A;
  readonly provenance: MutationProvenance;
  readonly identity: IdentityObservation;
  readonly signatures: readonly SignatureObservation[];
}

export class CodeSignatureInvalid extends Schema.TaggedError<CodeSignatureInvalid>()(
  "CodeSignatureInvalid",
  { path: Schema.String, reason: Schema.String },
) {}

export type CodeSignError =
  | ArtifactError
  | Lifecycle.LifecycleError
  | ToolError
  | AppleIdentityInvalid
  | AppleInputInvalid
  | CodeSignatureInvalid
  | UnsupportedArtifactKind;

export interface LayerOptions {
  readonly codesignPath?: string | undefined;
  readonly dittoPath?: string | undefined;
  readonly plutilPath?: string | undefined;
}

interface Service {
  readonly sign: <A extends SignableArtifact>(input: SignInput<A>) => Effect.Effect<SignResult<A>, CodeSignError>;
}

export class Signer extends Context.Service<Signer, Service>()("effect-build-apple/CodeSign/Signer") {}

const identities = new WeakSet<object>();
const fingerprintPattern = /^[0-9A-F]{40}$/;
const teamIdPattern = /^[A-Z0-9]{10}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const developerIdApplicationOid = "1.2.840.113635.100.6.1.13";

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
  input: SignableArtifact,
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

const designatedRequirement = (identity: DeveloperIdApplication): string =>
  `=anchor apple generic and certificate leaf = H"${identity.fingerprint}"`
  + ` and certificate leaf[subject.OU] = "${identity.teamId}"`
  + ` and certificate leaf[field.${developerIdApplicationOid}] exists`;

const validateIdentity = (
  identity: DeveloperIdApplication,
): Effect.Effect<IdentityObservation, AppleIdentityInvalid> => {
  if (!identities.has(identity)) return Effect.fail(invalidIdentity("unauthenticated identity descriptor"));
  if (!fingerprintPattern.test(identity.fingerprint) || !teamIdPattern.test(identity.teamId)) {
    return Effect.fail(invalidIdentity("identity fields changed after construction"));
  }
  return Effect.succeed(Object.freeze({
    _tag: "DeveloperIdApplicationIdentity" as const,
    fingerprint: identity.fingerprint,
    teamId: identity.teamId,
    designatedRequirement: designatedRequirement(identity),
  }));
};

const signatureInvalid = (path: string, reason: string): CodeSignatureInvalid =>
  new CodeSignatureInvalid({ path, reason });

const combinedOutput = (invocation: ToolInvocation): string =>
  [invocation.stdout.text, invocation.stderr.text].filter((output) => output.length > 0).join("\n");

const oneField = (
  output: string,
  name: string,
  path: string,
): Effect.Effect<string, CodeSignatureInvalid> => {
  const values = output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${name}=`))
    .map((line) => line.slice(name.length + 1).trim());
  return values.length === 1 && values[0]!.length > 0
    ? Effect.succeed(values[0]!)
    : Effect.fail(signatureInvalid(path, `expected exactly one nonempty ${name} field`));
};

interface ParsedDisplay {
  readonly identifier: string;
  readonly teamId: string;
  readonly secureTimestamp: string;
  readonly hardenedRuntime: boolean;
}

const parseDisplay = (
  invocation: ToolInvocation,
  path: string,
): Effect.Effect<ParsedDisplay, CodeSignatureInvalid> =>
  Effect.gen(function*() {
    if (invocation.stdout.truncated || invocation.stderr.truncated) {
      return yield* signatureInvalid(path, "codesign display output was truncated");
    }
    const output = combinedOutput(invocation);
    const identifier = yield* oneField(output, "Identifier", path);
    if (!identifierPattern.test(identifier)) {
      return yield* signatureInvalid(path, "displayed identifier was invalid");
    }
    const teamId = yield* oneField(output, "TeamIdentifier", path);
    const secureTimestamp = yield* oneField(output, "Timestamp", path);
    if (/^(?:none|not set)$/iu.test(secureTimestamp)) {
      return yield* signatureInvalid(path, "signature does not carry a secure timestamp");
    }
    const directories = output.split(/\r?\n/u).filter((line) => line.startsWith("CodeDirectory "));
    if (directories.length !== 1) {
      return yield* signatureInvalid(path, "expected exactly one CodeDirectory display record");
    }
    const flags = /\bflags=0x[0-9A-Fa-f]+\(([^)]*)\)/u.exec(directories[0]!)?.[1];
    if (flags === undefined) return yield* signatureInvalid(path, "CodeDirectory flags were not parseable");
    return {
      identifier,
      teamId,
      secureTimestamp,
      hardenedRuntime: flags.split(",").map((flag) => flag.trim()).includes("runtime"),
    };
  });

const canonicalEntitlements = (
  xml: string,
  path: string,
  source: string,
): Effect.Effect<string, CodeSignatureInvalid> =>
  Effect.try({
    try: () => Plist.canonicalXml(xml),
    catch: (error) =>
      signatureInvalid(path, `${source} entitlements were not a canonical XML property list: ${String(error)}`),
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
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const plutil = yield* Tool.select({ name: "plutil", path: options.plutilPath ?? "/usr/bin/plutil" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const sign = <A extends SignableArtifact>(
      supplied: SignInput<A>,
    ): Effect.Effect<SignResult<A>, CodeSignError> =>
      Effect.gen(function*() {
        const input = supplied.input;
        const kind: string = input.kind;
        if (kind !== "mach-o" && kind !== "app-bundle" && kind !== "disk-image") {
          return yield* new UnsupportedArtifactKind({
            operation: "CodeSign.sign",
            actual: kind,
            expected: ["mach-o", "app-bundle", "disk-image"],
          });
        }
        yield* revalidate(input);
        const plan = yield* normalizePlan(input, [...supplied.plan]);
        const supporting = plan.flatMap((item) => item.entitlements === undefined ? [] : [item.entitlements]);
        for (const entitlements of supporting) yield* revalidate(entitlements);
        const identity = yield* validateIdentity(supplied.identity);
        const signatures: SignatureObservation[] = [];
        const mutate = ({ staged, supportingInputs }: Lifecycle.MutationContext<SignableArtifact>) =>
          Effect.gen(function*() {
            const invocations: ToolInvocation[] = [];
            const targetPath = (root: string, item: NormalizedPlanItem): string =>
              item.path === "." ? root : path.join(root, ...item.path.split("/"));
            const signs: { readonly item: NormalizedPlanItem; readonly invocation: ToolInvocation }[] = [];
            for (const item of plan) {
              const args = ["--force", "--sign", supplied.identity.fingerprint, "--timestamp"];
              if (item.hardenedRuntime) args.push("--options", "runtime");
              if (item.entitlementIndex !== undefined) {
                args.push("--entitlements", supportingInputs[item.entitlementIndex]!.path);
              }
              if (item.identifier !== undefined) args.push("--identifier", item.identifier);
              args.push(targetPath(staged.path, item));
              const invocation = yield* Tool.runOrFail({ tool: codesign, args });
              invocations.push(invocation);
              signs.push({ item, invocation });
            }
            yield* Effect.scoped(
              Effect.gen(function*() {
                const signedArtifact = staged._tag === "FileArtifact"
                  ? yield* observeFile(staged.kind, staged.path)
                  : yield* observeTree(staged.kind, staged.path);
                const normalized = yield* Lifecycle.copyAuthenticatedScoped({
                  input: signedArtifact,
                  copyTool: ditto,
                  directory: path.dirname(staged.path),
                });
                invocations.push(...normalized.tools);
                for (const { item, invocation: signed } of signs) {
                  const normalizedPath = targetPath(normalized.artifact.path, item);
                  const verified = yield* Tool.runOrFail({
                    tool: codesign,
                    args: [
                      "--verify",
                      "--strict",
                      "--verbose=2",
                      "-R",
                      identity.designatedRequirement,
                      normalizedPath,
                    ],
                  });
                  invocations.push(verified);
                  const displayed = yield* Tool.runOrFail({
                    tool: codesign,
                    args: ["--display", "--verbose=4", normalizedPath],
                  });
                  invocations.push(displayed);
                  const display = yield* parseDisplay(displayed, item.path);
                  if (display.teamId !== identity.teamId) {
                    return yield* signatureInvalid(
                      item.path,
                      "displayed TeamIdentifier does not match the selected identity",
                    );
                  }
                  if (display.hardenedRuntime !== item.hardenedRuntime) {
                    return yield* signatureInvalid(
                      item.path,
                      `displayed hardened-runtime flag was ${String(display.hardenedRuntime)}`,
                    );
                  }
                  if (item.identifier !== undefined && display.identifier !== item.identifier) {
                    return yield* signatureInvalid(
                      item.path,
                      "displayed identifier does not match the explicit identifier",
                    );
                  }
                  const entitlementDisplay = yield* Tool.runOrFail({
                    tool: codesign,
                    args: ["--display", "--entitlements", "-", "--xml", normalizedPath],
                  });
                  invocations.push(entitlementDisplay);
                  if (entitlementDisplay.stdout.truncated || entitlementDisplay.stderr.truncated) {
                    return yield* signatureInvalid(item.path, "codesign entitlement output was truncated");
                  }
                  const actualXml = entitlementDisplay.stdout.text.trim();
                  let entitlementNormalization: ToolInvocation | undefined;
                  if (item.entitlementIndex === undefined) {
                    if (actualXml.length > 0) {
                      return yield* signatureInvalid(item.path, "signature unexpectedly carries entitlements");
                    }
                  } else {
                    if (actualXml.length === 0) {
                      return yield* signatureInvalid(item.path, "signature is missing the requested entitlements");
                    }
                    entitlementNormalization = yield* Tool.runOrFail({
                      tool: plutil,
                      args: ["-convert", "xml1", "-o", "-", supportingInputs[item.entitlementIndex]!.path],
                    });
                    invocations.push(entitlementNormalization);
                    if (entitlementNormalization.stdout.truncated || entitlementNormalization.stderr.truncated) {
                      return yield* signatureInvalid(item.path, "plutil entitlement output was truncated");
                    }
                    const expected = yield* canonicalEntitlements(
                      entitlementNormalization.stdout.text,
                      item.path,
                      "requested",
                    );
                    const actual = yield* canonicalEntitlements(actualXml, item.path, "embedded");
                    if (actual !== expected) {
                      return yield* signatureInvalid(
                        item.path,
                        "embedded entitlements differ from the authenticated request",
                      );
                    }
                  }
                  signatures.push(Object.freeze({
                    _tag: "CodeSignature",
                    path: item.path,
                    identifier: display.identifier,
                    teamId: display.teamId,
                    secureTimestamp: display.secureTimestamp,
                    hardenedRuntime: display.hardenedRuntime,
                    entitlements: actualXml.length > 0,
                    sign: signed,
                    verify: verified,
                    display: displayed,
                    entitlementDisplay,
                    ...(entitlementNormalization === undefined ? {} : { entitlementNormalization }),
                  }));
                }
                if (staged._tag === "TreeArtifact") {
                  const deepVerification = yield* Tool.runOrFail({
                    tool: codesign,
                    args: [
                      "--verify",
                      "--strict",
                      "--verbose=2",
                      "--deep",
                      "-R",
                      identity.designatedRequirement,
                      normalized.artifact.path,
                    ],
                  });
                  invocations.push(deepVerification);
                }
                yield* Effect.uninterruptible(
                  fileSystem.remove(staged.path, { recursive: staged._tag === "TreeArtifact" }).pipe(
                    Effect.andThen(fileSystem.rename(normalized.artifact.path, staged.path)),
                  ),
                ).pipe(
                  Effect.mapError((error) =>
                    new ArtifactPublishFailed({
                      destination: supplied.destination,
                      reason: `publish normalized signed artifact: ${String(error)}`,
                    })
                  ),
                );
              }),
            );
            return invocations;
          });
        const publishFile = <K extends "mach-o" | "disk-image">(file: FileArtifact<K>) =>
          Lifecycle.publishFileMutation({
            operation: "CodeSign.sign",
            input: file,
            supportingInputs: supporting,
            destination: supplied.destination,
            copyTool: ditto,
            mutate: (context) => mutate(context),
          });
        const publishTree = (tree: TreeArtifact<"app-bundle">) =>
          Lifecycle.publishTreeMutation({
            operation: "CodeSign.sign",
            input: tree,
            supportingInputs: supporting,
            destination: supplied.destination,
            copyTool: ditto,
            mutate: (context) => mutate(context),
          });
        const mutation = input._tag === "FileArtifact"
          ? yield* publishFile(input)
          : yield* publishTree(input);
        return {
          artifact: mutation.artifact as A,
          provenance: mutation.provenance,
          identity,
          signatures: Object.freeze(signatures),
        };
      }).pipe(Effect.provide(services));
    return { sign };
  });

export const sign = <A extends SignableArtifact>(
  input: SignInput<A>,
): Effect.Effect<SignResult<A>, CodeSignError, Signer> => Signer.use((service) => service.sign(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Signer,
  ToolError,
  ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Signer, makeService(options));
