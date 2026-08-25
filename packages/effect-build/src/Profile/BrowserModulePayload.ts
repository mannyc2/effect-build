import { Context, Crypto, Effect, FileSystem, Path, Schema, type Scope } from "effect";
import type { AbsolutePath, DecimalBytes, Digest } from "../Artifact.js";
import * as BorrowedOutput from "../Author/BorrowedOutput.js";
import type { ProviderIdentity } from "../Author/NodeMain.js";

/** Semantically proposed portable role; provider/host conformance is tracked separately. */
export const protocol = "effect-build/profile/browser-module-payload@1" as const;
export const producedProtocol = "effect-build/produced/browser-module-payload@1" as const;

export class BrowserModulePayloadRejected extends Schema.TaggedError<BrowserModulePayloadRejected>()(
  "BrowserModulePayloadRejected",
  {
    phase: Schema.Literals(["request", "analysis"] as const),
    reason: Schema.String,
  },
) {}

export class BrowserModulePayloadUnsupported extends Schema.TaggedError<BrowserModulePayloadUnsupported>()(
  "BrowserModulePayloadUnsupported",
  { provider: Schema.String, reason: Schema.String },
) {}

export class BrowserModulePayloadProviderFailed extends Schema.TaggedError<BrowserModulePayloadProviderFailed>()(
  "BrowserModulePayloadProviderFailed",
  { provider: Schema.String, operation: Schema.String, cause: Schema.Unknown },
) {}

export type Mode = "development" | "production";
export type SourceMaps = "none" | "linked" | "inline" | "provider-default";
export type Minify = boolean | "provider-default";

export interface ModuleEntry {
  /** Stable caller identity; never inferred from the source filename. */
  readonly id: string;
  /** Provider input observed at the operation boundary. */
  readonly source: string;
}

export interface Request {
  readonly protocol: typeof protocol;
  readonly entries: readonly ModuleEntry[];
  readonly mode: Mode;
  readonly sourceMaps: SourceMaps;
  readonly minify: Minify;
  readonly external?: readonly string[];
  readonly conditions?: readonly string[];
}

export type FileRole = "entry" | "chunk" | "style" | "asset" | "source-map" | "other";

/** Portable projection supplied from structured provider evidence. */
export interface ProducedFile {
  readonly path: string;
  readonly mediaType: string;
  readonly role: FileRole;
}

export interface EntryAssociation {
  readonly requestId: string;
  readonly module: string;
  readonly associatedStyles: readonly string[];
  readonly associatedChunks: readonly string[];
  readonly associatedAssets: readonly string[];
  readonly preloadCandidates: readonly string[];
}

interface EdgeFields {
  readonly from: string;
  /** Exact provider-reported output specifier, including any query or fragment. */
  readonly rawSpecifier: string;
  /** Provider-native import/URL relation projected without core parsing. */
  readonly kind: string;
}

export interface InternalEdge extends EdgeFields {
  readonly disposition: "internal";
  readonly to: string;
}

export interface ExternalEdge extends EdgeFields {
  readonly disposition: "external";
  readonly to?: never;
}

export type Edge = InternalEdge | ExternalEdge;

export interface ProducedPayload<ProviderObservation = unknown> {
  readonly protocol: typeof producedProtocol;
  /** Candidate tree beneath the cleanup root passed to `Provider.produce`. */
  readonly root: string;
  readonly entries: readonly EntryAssociation[];
  readonly files: readonly ProducedFile[];
  readonly edges: readonly Edge[];
  /** Retained native observation; it is not part of the portable substitution law. */
  readonly provider: ProviderObservation;
}

export type ProduceError = BrowserModulePayloadProviderFailed | BrowserModulePayloadUnsupported;

interface Service {
  readonly identity: ProviderIdentity;
  readonly produce: (
    request: Request,
    ownedRoot: AbsolutePath,
  ) => Effect.Effect<ProducedPayload, ProduceError>;
}

export class Provider extends Context.Service<Provider, Service>()(
  "effect-build/Profile/BrowserModulePayload/Provider",
) {}

export interface BorrowedFile {
  readonly path: string;
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
  readonly mediaType: string;
  readonly role: FileRole;
}

export interface Borrowed {
  readonly protocol: typeof protocol;
  readonly producer: ProviderIdentity;
  readonly root: AbsolutePath;
  /** Hashed lease handle; `observe` revalidates liveness and the complete tree. */
  readonly tree: BorrowedOutput.Tree<"hashed">;
  readonly entries: readonly EntryAssociation[];
  readonly files: readonly BorrowedFile[];
  readonly edges: readonly Edge[];
  /** Retained native observation; consumers must not treat it as portable metadata. */
  readonly provider: unknown;
}

export type Error =
  | ProduceError
  | BrowserModulePayloadRejected
  | BorrowedOutput.Failure
  | BorrowedOutput.CleanupFailedAfterSuccessfulUse;

const modes: ReadonlySet<unknown> = new Set<Mode>(["development", "production"]);
const sourceMaps: ReadonlySet<unknown> = new Set<SourceMaps>(["none", "linked", "inline", "provider-default"]);
const fileRoles: ReadonlySet<unknown> = new Set<FileRole>([
  "entry",
  "chunk",
  "style",
  "asset",
  "source-map",
  "other",
]);
const canonicalMediaType = /^[a-z0-9][a-z0-9!#$%&*+.^_~-]*\/[a-z0-9][a-z0-9!#$%&*+.^_~-]*(?:; charset=utf-8)?$/u;
const portableComponent = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/u;
const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const encoder = new TextEncoder();

const comparePortablePaths = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

const validatePortablePath = (relativePath: string): string | undefined => {
  if (relativePath.includes("\\") || relativePath.startsWith("/") || relativePath.endsWith("/")) {
    return "path is not canonical slash-relative form";
  }
  for (const component of relativePath.split("/")) {
    if (!portableComponent.test(component) || component === "." || component === "..") {
      return `invalid path component ${JSON.stringify(component)}`;
    }
    if (component.endsWith(".") || component.endsWith(" ")) {
      return `path component ends in dot or space: ${component}`;
    }
    if (windowsReserved.test(component)) return `Windows reserved device basename: ${component}`;
  }
  return undefined;
};

const reject = (phase: "request" | "analysis", reason: string): BrowserModulePayloadRejected =>
  new BrowserModulePayloadRejected({ phase, reason });

const nonEmptyUnique = (
  values: readonly string[] | undefined,
  field: string,
): Effect.Effect<readonly string[], BrowserModulePayloadRejected> =>
  Effect.gen(function*() {
    const copied: string[] = [];
    const seen = new Set<string>();
    for (const value of values ?? []) {
      if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
        return yield* reject("request", `${field} contains an empty or invalid value`);
      }
      if (seen.has(value)) return yield* reject("request", `${field} contains a duplicate value: ${value}`);
      seen.add(value);
      copied.push(value);
    }
    return Object.freeze(copied);
  });

const validateRequest = (input: Request): Effect.Effect<Request, BrowserModulePayloadRejected> =>
  Effect.gen(function*() {
    if ((input as { readonly protocol?: unknown }).protocol !== protocol) {
      return yield* reject("request", "unknown protocol major");
    }
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      return yield* reject("request", "at least one explicit module entry is required");
    }
    if (!modes.has(input.mode)) return yield* reject("request", "unknown build mode");
    if (!sourceMaps.has(input.sourceMaps)) return yield* reject("request", "unknown source-map mode");
    if (typeof input.minify !== "boolean" && input.minify !== "provider-default") {
      return yield* reject("request", "unknown minify mode");
    }
    const ids = new Set<string>();
    const sources = new Set<string>();
    const entries: ModuleEntry[] = [];
    for (const entry of input.entries) {
      if (
        typeof entry !== "object"
        || entry === null
        || typeof entry.id !== "string"
        || entry.id.length === 0
        || entry.id.includes("\0")
      ) return yield* reject("request", "module entry has an empty or invalid id");
      if (typeof entry.source !== "string" || entry.source.length === 0 || entry.source.includes("\0")) {
        return yield* reject("request", `module entry ${entry.id} has an empty or invalid source`);
      }
      if (ids.has(entry.id)) return yield* reject("request", `duplicate module entry id: ${entry.id}`);
      if (sources.has(entry.source)) return yield* reject("request", `duplicate module entry source: ${entry.source}`);
      ids.add(entry.id);
      sources.add(entry.source);
      entries.push(Object.freeze({ id: entry.id, source: entry.source }));
    }
    const external = yield* nonEmptyUnique(input.external, "external");
    const conditions = yield* nonEmptyUnique(input.conditions, "conditions");
    return Object.freeze({
      protocol,
      entries: Object.freeze(entries),
      mode: input.mode,
      sourceMaps: input.sourceMaps,
      minify: input.minify,
      ...(external.length === 0 ? {} : { external }),
      ...(conditions.length === 0 ? {} : { conditions }),
    });
  });

const validatePath = (value: string, label: string): Effect.Effect<string, BrowserModulePayloadRejected> => {
  const problem = typeof value === "string" ? validatePortablePath(value) : "path is not a string";
  return problem === undefined
    ? Effect.succeed(value)
    : Effect.fail(reject("analysis", `${label}: ${problem}`));
};

const copyAssociated = (
  values: readonly string[],
  label: string,
  expectedRole: FileRole | undefined,
  files: ReadonlyMap<string, ProducedFile>,
): Effect.Effect<readonly string[], BrowserModulePayloadRejected> =>
  Effect.gen(function*() {
    if (!Array.isArray(values)) return yield* reject("analysis", `${label} is not an array`);
    const copied: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      yield* validatePath(value, `${label} path is invalid`);
      const file = files.get(value);
      if (file === undefined) return yield* reject("analysis", `${label} references an unknown output: ${value}`);
      if (expectedRole !== undefined && file.role !== expectedRole) {
        return yield* reject(
          "analysis",
          `${label} references ${value} with role ${file.role}, expected ${expectedRole}`,
        );
      }
      if (seen.has(value)) return yield* reject("analysis", `${label} contains a duplicate output: ${value}`);
      seen.add(value);
      copied.push(value);
    }
    return Object.freeze(copied);
  });

const validateProduced = (
  request: Request,
  produced: ProducedPayload,
  tree: BorrowedOutput.Tree<"hashed">,
  identity: ProviderIdentity,
): Effect.Effect<Borrowed, BrowserModulePayloadRejected> =>
  Effect.gen(function*() {
    if ((produced as { readonly protocol?: unknown }).protocol !== producedProtocol) {
      return yield* reject("analysis", "unknown provider protocol major");
    }
    if (!Array.isArray(produced.files)) return yield* reject("analysis", "provider files are not an array");
    const filesByPath = new Map<string, ProducedFile>();
    for (const file of produced.files) {
      if (typeof file !== "object" || file === null) return yield* reject("analysis", "invalid provider file");
      yield* validatePath(file.path, "invalid provider output path");
      if (filesByPath.has(file.path)) return yield* reject("analysis", `duplicate provider output: ${file.path}`);
      if (!canonicalMediaType.test(file.mediaType)) {
        return yield* reject("analysis", `invalid provider media type for ${file.path}`);
      }
      if (!fileRoles.has(file.role)) return yield* reject("analysis", `invalid provider role for ${file.path}`);
      filesByPath.set(file.path, Object.freeze({ path: file.path, mediaType: file.mediaType, role: file.role }));
    }
    const observedFiles = tree.initial.entries.filter(
      (entry): entry is BorrowedOutput.HashedTreeFileEntry => entry.kind === "file",
    );
    const actualPaths = observedFiles.map(({ relativePath }) => relativePath);
    const declaredPaths = [...filesByPath.keys()].sort(comparePortablePaths);
    if (
      actualPaths.length !== declaredPaths.length
      || actualPaths.some((path, index) => path !== declaredPaths[index])
    ) return yield* reject("analysis", "provider metadata does not exactly cover the borrowed output tree");

    if (!Array.isArray(produced.entries)) return yield* reject("analysis", "provider entries are not an array");
    const requestedIds = new Set(request.entries.map(({ id }) => id));
    const associatedIds = new Set<string>();
    const associatedModules = new Set<string>();
    const roleCoverage = {
      style: new Set<string>(),
      chunk: new Set<string>(),
      asset: new Set<string>(),
    };
    const entries: EntryAssociation[] = [];
    for (const association of produced.entries) {
      if (typeof association !== "object" || association === null || typeof association.requestId !== "string") {
        return yield* reject("analysis", "invalid entry association");
      }
      if (!requestedIds.has(association.requestId)) {
        return yield* reject("analysis", `unknown requested entry id: ${association.requestId}`);
      }
      if (associatedIds.has(association.requestId)) {
        return yield* reject("analysis", `duplicate entry association: ${association.requestId}`);
      }
      yield* validatePath(association.module, `invalid module for ${association.requestId}`);
      const moduleFile = filesByPath.get(association.module);
      if (moduleFile?.role !== "entry") {
        return yield* reject("analysis", `entry ${association.requestId} does not identify an entry-role output`);
      }
      if (associatedModules.has(association.module)) {
        return yield* reject("analysis", `entry output is associated more than once: ${association.module}`);
      }
      const associatedStyles = yield* copyAssociated(
        association.associatedStyles,
        `styles for ${association.requestId}`,
        "style",
        filesByPath,
      );
      const associatedChunks = yield* copyAssociated(
        association.associatedChunks,
        `chunks for ${association.requestId}`,
        "chunk",
        filesByPath,
      );
      const associatedAssets = yield* copyAssociated(
        association.associatedAssets,
        `assets for ${association.requestId}`,
        "asset",
        filesByPath,
      );
      const preloadCandidates = yield* copyAssociated(
        association.preloadCandidates,
        `preload candidates for ${association.requestId}`,
        undefined,
        filesByPath,
      );
      associatedStyles.forEach((value) => roleCoverage.style.add(value));
      associatedChunks.forEach((value) => roleCoverage.chunk.add(value));
      associatedAssets.forEach((value) => roleCoverage.asset.add(value));
      associatedIds.add(association.requestId);
      associatedModules.add(association.module);
      entries.push(Object.freeze({
        requestId: association.requestId,
        module: association.module,
        associatedStyles,
        associatedChunks,
        associatedAssets,
        preloadCandidates,
      }));
    }
    if (associatedIds.size !== requestedIds.size) {
      return yield* reject("analysis", "provider entry associations do not exactly cover requested entry ids");
    }
    for (const file of filesByPath.values()) {
      if (file.role === "entry" && !associatedModules.has(file.path)) {
        return yield* reject("analysis", `unassociated entry output: ${file.path}`);
      }
      if (
        (file.role === "style" || file.role === "chunk" || file.role === "asset")
        && !roleCoverage[file.role].has(file.path)
      ) return yield* reject("analysis", `unassociated ${file.role} output: ${file.path}`);
    }

    if (!Array.isArray(produced.edges)) return yield* reject("analysis", "provider edges are not an array");
    const edgeKeys = new Set<string>();
    const edges: Edge[] = [];
    for (const edge of produced.edges) {
      if (typeof edge !== "object" || edge === null) return yield* reject("analysis", "invalid provider edge");
      yield* validatePath(edge.from, "invalid edge source");
      if (!filesByPath.has(edge.from)) return yield* reject("analysis", `edge source is not an output: ${edge.from}`);
      if (
        typeof edge.rawSpecifier !== "string"
        || edge.rawSpecifier.length === 0
        || edge.rawSpecifier.includes("\0")
      ) return yield* reject("analysis", `edge from ${edge.from} has an invalid raw specifier`);
      if (typeof edge.kind !== "string" || edge.kind.length === 0 || edge.kind.includes("\0")) {
        return yield* reject("analysis", `edge from ${edge.from} has an invalid kind`);
      }
      let copied: Edge;
      if (edge.disposition === "internal") {
        yield* validatePath(edge.to, `invalid internal edge target from ${edge.from}`);
        if (!filesByPath.has(edge.to)) {
          return yield* reject("analysis", `internal edge target is not an output: ${edge.from} -> ${edge.to}`);
        }
        if (edge.rawSpecifier.startsWith("/") || edge.rawSpecifier.startsWith("\\")) {
          return yield* reject(
            "analysis",
            `root-relative internal edge is outside the relative payload law: ${edge.rawSpecifier}`,
          );
        }
        copied = Object.freeze({
          from: edge.from,
          rawSpecifier: edge.rawSpecifier,
          kind: edge.kind,
          disposition: "internal",
          to: edge.to,
        });
      } else if (edge.disposition === "external") {
        if ((edge as { readonly to?: unknown }).to !== undefined) {
          return yield* reject("analysis", `external edge must not identify an output target: ${edge.from}`);
        }
        copied = Object.freeze({
          from: edge.from,
          rawSpecifier: edge.rawSpecifier,
          kind: edge.kind,
          disposition: "external",
        });
      } else {
        return yield* reject("analysis", `edge from ${edge.from} has an unknown disposition`);
      }
      const key = `${copied.from}\0${copied.rawSpecifier}\0${copied.kind}\0${copied.disposition}\0${
        copied.disposition === "internal" ? copied.to : ""
      }`;
      if (edgeKeys.has(key)) return yield* reject("analysis", `duplicate provider edge from ${edge.from}`);
      edgeKeys.add(key);
      edges.push(copied);
    }

    const observedByPath = new Map(observedFiles.map((file) => [file.relativePath, file]));
    const files = declaredPaths.map((path) => {
      const declared = filesByPath.get(path)!;
      const observed = observedByPath.get(path)!;
      return Object.freeze({
        path,
        bytes: observed.bytes,
        digest: observed.digest,
        mediaType: declared.mediaType,
        role: declared.role,
      });
    });
    return Object.freeze({
      protocol,
      producer: identity,
      root: tree.root,
      tree,
      entries: Object.freeze(entries),
      files: Object.freeze(files),
      edges: Object.freeze(edges),
      provider: produced.provider,
    });
  });

export const withPayload = <A, UseError, UseRequirements>(
  request: Request,
  use: (payload: Borrowed) => Effect.Effect<A, UseError, UseRequirements>,
): Effect.Effect<
  A,
  Error | UseError,
  | Provider
  | BorrowedOutput.CleanupReporter
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | Exclude<UseRequirements, Scope.Scope>
> =>
  Effect.flatMap(validateRequest(request), (validated) =>
    Effect.flatMap(Provider, (provider) => {
      let produced: ProducedPayload | undefined;
      return BorrowedOutput.withTree(
        {
          prefix: "effect-build-browser-module-payload-",
          produce: (ownedRoot) =>
            Effect.tap(provider.produce(validated, ownedRoot), (value) =>
              Effect.sync(() => {
                produced = value;
              })).pipe(Effect.map((value) => value.root)),
        },
        "hashed",
        (tree) => {
          const value = produced;
          return value === undefined
            ? Effect.fail(reject("analysis", "provider completed without a result"))
            : Effect.flatMap(validateProduced(validated, value, tree, provider.identity), use);
        },
      );
    }));
