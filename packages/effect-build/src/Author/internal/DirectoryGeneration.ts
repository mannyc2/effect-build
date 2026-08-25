import { Crypto, Effect, Exit, FileSystem, Option, Path, Schema } from "effect";
import type { AbsolutePath, DecimalBytes, Digest } from "../../Artifact.js";
import { decimalBytes, sha256Digest } from "../../Artifact.js";
import { claimDurableDestination, contains, releaseDurableDestination } from "./Claims.js";

export const generationManifestProtocol = "effect-build/generation-manifest@1" as const;
export const directoryGenerationProtocol = "effect-build/directory-generation@1" as const;
export const currentGenerationProtocol = "effect-build/current-generation@1" as const;
export const unprofiledTreeProfile = "effect-build/generation-subject/tree@1" as const;
export const staticBrowserProfile = "effect-build/profile/static-browser-application@1" as const;

const staticBrowserEntry = "index.html" as const;
const staticBrowserMount = "relative-same-origin" as const;
const staticBrowserHost = "effect-build/generated-module-host@1" as const;
const portableComponent = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/u;
const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const canonicalMediaType = /^[a-z0-9][a-z0-9!#$%&*+.^_~-]*\/[a-z0-9][a-z0-9!#$%&*+.^_~-]*(?:; charset=utf-8)?$/u;
const canonicalDecimal = /^(?:0|[1-9][0-9]*)$/u;
const canonicalSha256 = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export interface UnprofiledTreeSubject {
  readonly profile: typeof unprofiledTreeProfile;
}

export interface StaticBrowserSubject {
  readonly profile: typeof staticBrowserProfile;
  readonly entry: typeof staticBrowserEntry;
  readonly mount: typeof staticBrowserMount;
  readonly host: typeof staticBrowserHost;
}

export type Subject = UnprofiledTreeSubject | StaticBrowserSubject;

export const unprofiledSubject: UnprofiledTreeSubject = Object.freeze({ profile: unprofiledTreeProfile });

export const staticBrowserSubject: StaticBrowserSubject = Object.freeze({
  profile: staticBrowserProfile,
  entry: staticBrowserEntry,
  mount: staticBrowserMount,
  host: staticBrowserHost,
});

export interface ManifestFile {
  readonly path: string;
  readonly bytes: DecimalBytes;
  readonly digest: Digest;
  readonly mediaType: string | null;
}

export interface Manifest {
  readonly protocol: typeof generationManifestProtocol;
  readonly subject: Subject;
  readonly files: readonly ManifestFile[];
}

export interface CurrentReference {
  readonly protocol: typeof currentGenerationProtocol;
  readonly manifestDigest: Digest;
}

export interface SealRequest {
  readonly providerRoot: string;
  readonly publicationRoot: string;
  readonly cwd?: string | undefined;
  readonly subject: Subject;
  /** Every named value is validated and every static-browser file must be named. */
  readonly mediaTypes?: Readonly<Record<string, string | null>> | undefined;
}

export interface PublicationRequest {
  readonly publicationRoot: string;
  readonly cwd?: string | undefined;
}

export interface ActivationRequest extends PublicationRequest {
  readonly manifestDigest: Digest;
}

export interface PinnedGeneration {
  readonly protocol: typeof directoryGenerationProtocol;
  readonly publicationRoot: AbsolutePath;
  readonly generationName: string;
  readonly generationRoot: AbsolutePath;
  readonly treeRoot: AbsolutePath;
  readonly manifestPath: AbsolutePath;
  readonly manifestDigest: Digest;
  readonly manifest: Manifest;
  /** Relative generation-qualified redirect target for a new browser root navigation. */
  readonly rootNavigation: string | null;
}

export interface LentFile extends ManifestFile {
  readonly absolutePath: AbsolutePath;
  readonly generationQualifiedPath: string;
  readonly contents: Uint8Array;
}

export class DirectoryGenerationFailed extends Schema.TaggedError<DirectoryGenerationFailed>()(
  "DirectoryGenerationFailed",
  { phase: Schema.String, path: Schema.String, reason: Schema.String },
) {}

export type Failure = DirectoryGenerationFailed;

interface CapturedFile extends ManifestFile {
  readonly sourcePath: AbsolutePath;
  readonly identity: CapturedFileIdentity;
}

interface CapturedFileIdentity {
  readonly dev: number;
  readonly ino: number | undefined;
  readonly nlink: number | undefined;
  readonly mtime: number | undefined;
}

interface VerifiedGeneration {
  readonly publicationRoot: AbsolutePath;
  readonly generationName: string;
  readonly generationRoot: AbsolutePath;
  readonly treeRoot: AbsolutePath;
  readonly manifestPath: AbsolutePath;
  readonly manifestDigest: Digest;
  readonly manifest: Manifest;
}

interface PinnedAuthority {
  readonly treeRoot: AbsolutePath;
  readonly files: ReadonlyMap<string, ManifestFile>;
}

const pinnedAuthorities = new WeakMap<PinnedGeneration, PinnedAuthority>();

const describe = (value: unknown): string => value instanceof Error ? value.message : String(value);

const failure = (phase: string, path: string, reason: string): DirectoryGenerationFailed =>
  new DirectoryGenerationFailed({ phase, path, reason });

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hash = (
  phase: string,
  path: string,
  contents: Uint8Array,
): Effect.Effect<Digest, DirectoryGenerationFailed, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto;
    const value = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError((error) => failure(phase, path, describe(error))),
    );
    return sha256Digest(hex(new Uint8Array(value)));
  });

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const comparePath = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.byteLength - b.byteLength;
};

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validatePortablePath = (value: string): string | undefined => {
  if (value.length === 0 || value.includes("\\") || value.startsWith("/") || value.endsWith("/")) {
    return "path must be relative, slash-separated, and non-empty";
  }
  const components = value.split("/");
  for (const component of components) {
    if (!portableComponent.test(component)) return `non-portable component ${component}`;
    if (windowsReserved.test(component)) return `reserved Windows device component ${component}`;
  }
  return undefined;
};

const registerCaseForms = (
  forms: Map<string, string>,
  value: string,
): string | undefined => {
  const components = value.split("/");
  for (let length = 1; length <= components.length; length++) {
    const original = components.slice(0, length).join("/");
    const folded = original.toLowerCase();
    const existing = forms.get(folded);
    if (existing !== undefined && existing !== original) {
      return `ASCII-case-insensitive collision between ${existing} and ${original}`;
    }
    forms.set(folded, original);
  }
  return undefined;
};

const canonicalSubject = (value: unknown): Subject | string => {
  if (!isRecord(value) || typeof value.profile !== "string") return "subject must be an exact supported record";
  if (value.profile === unprofiledTreeProfile) {
    return exactKeys(value, ["profile"]) ? unprofiledSubject : "unprofiled subject has unknown fields";
  }
  if (value.profile === staticBrowserProfile) {
    if (!exactKeys(value, ["profile", "entry", "mount", "host"])) {
      return "static-browser subject has unknown or missing fields";
    }
    if (
      value.entry !== staticBrowserEntry
      || value.mount !== staticBrowserMount
      || value.host !== staticBrowserHost
    ) return "static-browser subject does not match the frozen profile";
    return staticBrowserSubject;
  }
  return `unsupported generation subject ${value.profile}`;
};

const canonicalManifestFile = (value: unknown): ManifestFile | string => {
  if (!isRecord(value) || !exactKeys(value, ["path", "bytes", "digest", "mediaType"])) {
    return "manifest file has unknown or missing fields";
  }
  if (typeof value.path !== "string") return "manifest file path must be a string";
  const pathFailure = validatePortablePath(value.path);
  if (pathFailure !== undefined) return pathFailure;
  if (typeof value.bytes !== "string" || !canonicalDecimal.test(value.bytes)) {
    return `manifest byte count is not canonical for ${value.path}`;
  }
  if (
    !isRecord(value.digest)
    || !exactKeys(value.digest, ["algorithm", "value"])
    || value.digest.algorithm !== "sha256"
    || typeof value.digest.value !== "string"
    || !canonicalSha256.test(value.digest.value)
  ) return `manifest digest is not canonical for ${value.path}`;
  if (value.mediaType !== null && (typeof value.mediaType !== "string" || !canonicalMediaType.test(value.mediaType))) {
    return `manifest media type is not canonical for ${value.path}`;
  }
  return Object.freeze({
    path: value.path,
    bytes: decimalBytes(value.bytes),
    digest: sha256Digest(value.digest.value),
    mediaType: value.mediaType as string | null,
  });
};

const canonicalManifest = (value: unknown): Manifest | string => {
  if (!isRecord(value) || !exactKeys(value, ["protocol", "subject", "files"])) {
    return "manifest has unknown or missing fields";
  }
  if (value.protocol !== generationManifestProtocol || !Array.isArray(value.files)) {
    return "manifest protocol or files field is invalid";
  }
  const subject = canonicalSubject(value.subject);
  if (typeof subject === "string") return subject;
  const files: ManifestFile[] = [];
  const forms = new Map<string, string>();
  const filePaths = new Set<string>();
  let previous: string | undefined;
  for (const candidate of value.files) {
    const file = canonicalManifestFile(candidate);
    if (typeof file === "string") return file;
    if (subject.profile === staticBrowserProfile && file.mediaType === null) {
      return `static-browser media type is required for ${file.path}`;
    }
    if (previous !== undefined && comparePath(previous, file.path) >= 0) {
      return "manifest files must be uniquely sorted by unsigned UTF-8 path bytes";
    }
    const collision = registerCaseForms(forms, file.path);
    if (collision !== undefined) return collision;
    const components = file.path.split("/");
    for (let length = 1; length < components.length; length++) {
      if (filePaths.has(components.slice(0, length).join("/"))) {
        return `manifest path is both a file and a directory at ${file.path}`;
      }
    }
    filePaths.add(file.path);
    if ([...filePaths].some((path) => path.startsWith(`${file.path}/`))) {
      return `manifest path is both a file and a directory at ${file.path}`;
    }
    previous = file.path;
    files.push(file);
  }
  return Object.freeze({ protocol: generationManifestProtocol, subject, files: Object.freeze(files) });
};

const canonicalCurrentReference = (value: unknown): CurrentReference | string => {
  if (!isRecord(value) || !exactKeys(value, ["protocol", "manifestDigest"])) {
    return "current reference has unknown or missing fields";
  }
  if (
    value.protocol !== currentGenerationProtocol
    || !isRecord(value.manifestDigest)
    || !exactKeys(value.manifestDigest, ["algorithm", "value"])
    || value.manifestDigest.algorithm !== "sha256"
    || typeof value.manifestDigest.value !== "string"
    || !canonicalSha256.test(value.manifestDigest.value)
  ) return "current reference digest is invalid";
  return Object.freeze({
    protocol: currentGenerationProtocol,
    manifestDigest: sha256Digest(value.manifestDigest.value),
  });
};

export const encodeManifest = (manifest: Manifest): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      protocol: generationManifestProtocol,
      subject: manifest.subject.profile === unprofiledTreeProfile
        ? { profile: unprofiledTreeProfile }
        : {
          profile: staticBrowserProfile,
          entry: staticBrowserEntry,
          mount: staticBrowserMount,
          host: staticBrowserHost,
        },
      files: manifest.files.map((file) => ({
        path: file.path,
        bytes: file.bytes,
        digest: { algorithm: "sha256", value: file.digest.value },
        mediaType: file.mediaType,
      })),
    }) + "\n",
  );

export const encodeCurrentReference = (manifestDigest: Digest): Uint8Array =>
  encoder.encode(
    JSON.stringify({
      protocol: currentGenerationProtocol,
      manifestDigest: { algorithm: "sha256", value: manifestDigest.value },
    }) + "\n",
  );

const decodeJson = (contents: Uint8Array): unknown | string => {
  if (contents.byteLength >= 3 && contents[0] === 0xef && contents[1] === 0xbb && contents[2] === 0xbf) {
    return "UTF-8 BOM is forbidden";
  }
  try {
    return JSON.parse(decoder.decode(contents)) as unknown;
  } catch (error) {
    return `invalid UTF-8 JSON: ${describe(error)}`;
  }
};

const decodeManifest = (contents: Uint8Array): Manifest | string => {
  const parsed = decodeJson(contents);
  if (typeof parsed === "string") return parsed;
  const manifest = canonicalManifest(parsed);
  if (typeof manifest === "string") return manifest;
  return bytesEqual(contents, encodeManifest(manifest)) ? manifest : "manifest bytes are not canonical";
};

const decodeCurrentReference = (contents: Uint8Array): CurrentReference | string => {
  const parsed = decodeJson(contents);
  if (typeof parsed === "string") return parsed;
  const current = canonicalCurrentReference(parsed);
  if (typeof current === "string") return current;
  return bytesEqual(contents, encodeCurrentReference(current.manifestDigest))
    ? current
    : "current reference bytes are not canonical";
};

const optionalNumber = (value: Option.Option<number>): number | undefined => Option.getOrUndefined(value);
const optionalDate = (value: Option.Option<Date>): number | undefined => Option.getOrUndefined(value)?.getTime();

const captureFileIdentity = (information: FileSystem.File.Info): CapturedFileIdentity =>
  Object.freeze({
    dev: information.dev,
    ino: optionalNumber(information.ino),
    nlink: optionalNumber(information.nlink),
    mtime: optionalDate(information.mtime),
  });

const sameCapturedFileIdentity = (
  captured: CapturedFileIdentity,
  current: FileSystem.File.Info,
): boolean =>
  current.type === "File"
  && captured.dev === current.dev
  && captured.ino === optionalNumber(current.ino)
  && captured.nlink === optionalNumber(current.nlink)
  && captured.mtime === optionalDate(current.mtime);

const sameFileIdentity = (before: FileSystem.File.Info, after: FileSystem.File.Info): boolean =>
  before.type === "File"
  && after.type === "File"
  && before.size === after.size
  && before.dev === after.dev
  && optionalNumber(before.ino) === optionalNumber(after.ino)
  && optionalNumber(before.nlink) === optionalNumber(after.nlink)
  && optionalDate(before.mtime) === optionalDate(after.mtime);

const resolveRoot = (
  phase: string,
  candidate: string,
  cwd: string | undefined,
  create: boolean,
): Effect.Effect<AbsolutePath, DirectoryGenerationFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (candidate.length === 0) return yield* failure(phase, candidate, "root must not be empty");
    const requested = path.normalize(path.resolve(cwd ?? "", candidate));
    if (!path.isAbsolute(requested)) return yield* failure(phase, candidate, "root must resolve to an absolute path");
    if (create) {
      yield* fileSystem.makeDirectory(requested, { recursive: true }).pipe(
        Effect.mapError((error) => failure(phase, requested, describe(error))),
      );
    }
    const canonical = path.normalize(
      yield* fileSystem.realPath(requested).pipe(
        Effect.mapError((error) => failure(phase, requested, describe(error))),
      ),
    );
    const information = yield* fileSystem.stat(canonical).pipe(
      Effect.mapError((error) => failure(phase, canonical, describe(error))),
    );
    if (information.type !== "Directory") return yield* failure(phase, canonical, "root must be a directory");
    return canonical as AbsolutePath;
  });

const normalizeNames = (
  path: Path.Path,
  names: readonly string[],
): { readonly names: readonly string[]; readonly failure?: string | undefined } => {
  const normalized: string[] = [];
  const forms = new Map<string, string>();
  for (const name of names) {
    const portable = name.split(path.sep).join("/");
    const pathFailure = validatePortablePath(portable);
    if (pathFailure !== undefined) return { names: [], failure: `${portable}: ${pathFailure}` };
    const collision = registerCaseForms(forms, portable);
    if (collision !== undefined) return { names: [], failure: collision };
    normalized.push(portable);
  }
  normalized.sort(comparePath);
  return { names: normalized };
};

const mediaTypeFor = (
  request: SealRequest,
  portablePath: string,
): string | null | DirectoryGenerationFailed => {
  const present = request.mediaTypes !== undefined && Object.hasOwn(request.mediaTypes, portablePath);
  const value = present ? request.mediaTypes?.[portablePath] ?? null : null;
  if (value !== null && !canonicalMediaType.test(value)) {
    return failure("snapshot", portablePath, "media type is not exact lowercase canonical form");
  }
  if (request.subject.profile === staticBrowserProfile && value === null) {
    return failure("snapshot", portablePath, "static-browser generation requires a media type for every file");
  }
  return value;
};

const captureSnapshot = (
  request: SealRequest,
  providerRoot: AbsolutePath,
  stagedTree: AbsolutePath,
): Effect.Effect<Manifest, DirectoryGenerationFailed, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rawNames = yield* fileSystem.readDirectory(providerRoot, { recursive: true }).pipe(
      Effect.mapError((error) => failure("snapshot", providerRoot, describe(error))),
    );
    const normalized = normalizeNames(path, rawNames);
    if (normalized.failure !== undefined) return yield* failure("snapshot", providerRoot, normalized.failure);
    const files: CapturedFile[] = [];
    const knownFiles = new Set<string>();
    for (const portable of normalized.names) {
      const hostRelative = portable.split("/").join(path.sep);
      const sourcePath = path.normalize(path.join(providerRoot, hostRelative));
      if (!contains(path, providerRoot, sourcePath)) {
        return yield* failure("snapshot", sourcePath, "entry escaped the provider root");
      }
      const canonical = path.normalize(
        yield* fileSystem.realPath(sourcePath).pipe(
          Effect.mapError((error) => failure("snapshot", sourcePath, describe(error))),
        ),
      );
      if (canonical !== sourcePath || !contains(path, providerRoot, canonical)) {
        return yield* failure("snapshot", sourcePath, "symbolic links and junctions are forbidden");
      }
      const before = yield* fileSystem.stat(sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", sourcePath, describe(error))),
      );
      if (before.type === "Directory") continue;
      if (before.type !== "File") {
        return yield* failure("snapshot", sourcePath, "tree entries must be regular files or directories");
      }
      const contents = yield* fileSystem.readFile(sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", sourcePath, describe(error))),
      );
      const after = yield* fileSystem.stat(sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", sourcePath, describe(error))),
      );
      if (!sameFileIdentity(before, after) || `${after.size}` !== `${contents.byteLength}`) {
        return yield* failure("snapshot", sourcePath, "file changed while the snapshot was observed");
      }
      const mediaType = mediaTypeFor(request, portable);
      if (mediaType instanceof DirectoryGenerationFailed) return yield* mediaType;
      const digest = yield* hash("snapshot", sourcePath, contents);
      const stagedPath = path.normalize(path.join(stagedTree, hostRelative));
      yield* fileSystem.makeDirectory(path.dirname(stagedPath), { recursive: true }).pipe(
        Effect.mapError((error) => failure("snapshot", stagedPath, describe(error))),
      );
      yield* fileSystem.writeFile(stagedPath, contents).pipe(
        Effect.mapError((error) => failure("snapshot", stagedPath, describe(error))),
      );
      const stagedContents = yield* fileSystem.readFile(stagedPath).pipe(
        Effect.mapError((error) => failure("snapshot", stagedPath, describe(error))),
      );
      const stagedDigest = yield* hash("snapshot", stagedPath, stagedContents);
      if (stagedContents.byteLength !== contents.byteLength || stagedDigest.value !== digest.value) {
        return yield* failure("snapshot", stagedPath, "staged bytes do not match the observed provider bytes");
      }
      knownFiles.add(portable);
      files.push(Object.freeze({
        sourcePath: sourcePath as AbsolutePath,
        identity: captureFileIdentity(after),
        path: portable,
        bytes: decimalBytes(`${contents.byteLength}`),
        digest,
        mediaType,
      }));
    }
    const afterNames = yield* fileSystem.readDirectory(providerRoot, { recursive: true }).pipe(
      Effect.mapError((error) => failure("snapshot", providerRoot, describe(error))),
    );
    const afterNormalized = normalizeNames(path, afterNames);
    if (
      afterNormalized.failure !== undefined
      || normalized.names.length !== afterNormalized.names.length
      || normalized.names.some((name, index) => name !== afterNormalized.names[index])
    ) return yield* failure("snapshot", providerRoot, "tree names changed while the snapshot was observed");
    for (const named of Object.keys(request.mediaTypes ?? {})) {
      const pathFailure = validatePortablePath(named);
      if (pathFailure !== undefined) return yield* failure("snapshot", named, pathFailure);
      if (!knownFiles.has(named)) {
        return yield* failure("snapshot", named, "media type names an absent or non-file entry");
      }
    }
    for (const captured of files) {
      const canonical = path.normalize(
        yield* fileSystem.realPath(captured.sourcePath).pipe(
          Effect.mapError((error) => failure("snapshot", captured.sourcePath, describe(error))),
        ),
      );
      if (canonical !== captured.sourcePath || !contains(path, providerRoot, canonical)) {
        return yield* failure("snapshot", captured.sourcePath, "captured file identity changed before sealing");
      }
      const before = yield* fileSystem.stat(captured.sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", captured.sourcePath, describe(error))),
      );
      if (!sameCapturedFileIdentity(captured.identity, before)) {
        return yield* failure("snapshot", captured.sourcePath, "captured file identity changed before sealing");
      }
      const contents = yield* fileSystem.readFile(captured.sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", captured.sourcePath, describe(error))),
      );
      const after = yield* fileSystem.stat(captured.sourcePath).pipe(
        Effect.mapError((error) => failure("snapshot", captured.sourcePath, describe(error))),
      );
      const digest = yield* hash("snapshot", captured.sourcePath, contents);
      if (
        !sameFileIdentity(before, after)
        || !sameCapturedFileIdentity(captured.identity, after)
        || `${contents.byteLength}` !== captured.bytes
        || digest.value !== captured.digest.value
      ) return yield* failure("snapshot", captured.sourcePath, "captured file bytes changed before sealing");
    }
    files.sort((left, right) => comparePath(left.path, right.path));
    return Object.freeze({
      protocol: generationManifestProtocol,
      subject: canonicalSubject(request.subject) as Subject,
      files: Object.freeze(
        files.map(({ sourcePath: _sourcePath, identity: _identity, ...file }) => Object.freeze(file)),
      ),
    });
  });

const expectedTreeNames = (manifest: Manifest): readonly string[] => {
  const names = new Set<string>();
  for (const file of manifest.files) {
    const components = file.path.split("/");
    for (let length = 1; length <= components.length; length++) names.add(components.slice(0, length).join("/"));
  }
  return [...names].sort(comparePath);
};

const readVerifiedFile = (
  phase: string,
  treeRoot: AbsolutePath,
  file: ManifestFile,
): Effect.Effect<Uint8Array, DirectoryGenerationFailed, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = path.normalize(path.join(treeRoot, file.path.split("/").join(path.sep)));
    if (!contains(path, treeRoot, absolute)) {
      return yield* failure(phase, absolute, "listed path escaped the generation");
    }
    const canonical = path.normalize(
      yield* fileSystem.realPath(absolute).pipe(
        Effect.mapError((error) => failure(phase, absolute, describe(error))),
      ),
    );
    if (canonical !== absolute || !contains(path, treeRoot, canonical)) {
      return yield* failure(phase, absolute, "listed path resolves through a link or outside the generation");
    }
    const before = yield* fileSystem.stat(absolute).pipe(
      Effect.mapError((error) => failure(phase, absolute, describe(error))),
    );
    if (before.type !== "File") return yield* failure(phase, absolute, "listed path is not a regular file");
    const contents = yield* fileSystem.readFile(absolute).pipe(
      Effect.mapError((error) => failure(phase, absolute, describe(error))),
    );
    const after = yield* fileSystem.stat(absolute).pipe(
      Effect.mapError((error) => failure(phase, absolute, describe(error))),
    );
    const observedDigest = yield* hash(phase, absolute, contents);
    if (
      !sameFileIdentity(before, after)
      || `${contents.byteLength}` !== file.bytes
      || observedDigest.value !== file.digest.value
    ) return yield* failure(phase, absolute, "listed file bytes do not match the pinned manifest");
    return contents;
  });

const loadVerifiedGeneration = (
  publicationRoot: AbsolutePath,
  manifestDigest: Digest,
): Effect.Effect<VerifiedGeneration, DirectoryGenerationFailed, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const generationName = `sha256-${manifestDigest.value}`;
    const generationRoot = path.normalize(path.join(publicationRoot, "generations", generationName)) as AbsolutePath;
    const canonicalGeneration = path.normalize(
      yield* fileSystem.realPath(generationRoot).pipe(
        Effect.mapError((error) => failure("reader", generationRoot, describe(error))),
      ),
    );
    if (canonicalGeneration !== generationRoot || !contains(path, publicationRoot, canonicalGeneration)) {
      return yield* failure("reader", generationRoot, "generation root is not an exact contained directory");
    }
    const generationInfo = yield* fileSystem.stat(generationRoot).pipe(
      Effect.mapError((error) => failure("reader", generationRoot, describe(error))),
    );
    if (generationInfo.type !== "Directory") {
      return yield* failure("reader", generationRoot, "generation is not a directory");
    }
    const manifestPath = path.join(generationRoot, "manifest.json") as AbsolutePath;
    const treeRoot = path.join(generationRoot, "tree") as AbsolutePath;
    const canonicalManifestPath = path.normalize(
      yield* fileSystem.realPath(manifestPath).pipe(
        Effect.mapError((error) => failure("reader", manifestPath, describe(error))),
      ),
    );
    const canonicalTreeRoot = path.normalize(
      yield* fileSystem.realPath(treeRoot).pipe(
        Effect.mapError((error) => failure("reader", treeRoot, describe(error))),
      ),
    );
    if (canonicalManifestPath !== manifestPath || canonicalTreeRoot !== treeRoot) {
      return yield* failure("reader", generationRoot, "manifest and tree must not resolve through links");
    }
    const manifestInfo = yield* fileSystem.stat(manifestPath).pipe(
      Effect.mapError((error) => failure("reader", manifestPath, describe(error))),
    );
    if (manifestInfo.type !== "File") {
      return yield* failure("reader", manifestPath, "manifest is not a regular file");
    }
    const manifestContents = yield* fileSystem.readFile(manifestPath).pipe(
      Effect.mapError((error) => failure("reader", manifestPath, describe(error))),
    );
    const observedManifestDigest = yield* hash("reader", manifestPath, manifestContents);
    if (observedManifestDigest.value !== manifestDigest.value) {
      return yield* failure("reader", manifestPath, "manifest digest does not match current or directory identity");
    }
    const manifest = decodeManifest(manifestContents);
    if (typeof manifest === "string") return yield* failure("reader", manifestPath, manifest);
    const treeInfo = yield* fileSystem.stat(treeRoot).pipe(
      Effect.mapError((error) => failure("reader", treeRoot, describe(error))),
    );
    if (treeInfo.type !== "Directory") return yield* failure("reader", treeRoot, "generation tree is not a directory");
    const rawNames = yield* fileSystem.readDirectory(treeRoot, { recursive: true }).pipe(
      Effect.mapError((error) => failure("reader", treeRoot, describe(error))),
    );
    const names = normalizeNames(path, rawNames);
    if (names.failure !== undefined) return yield* failure("reader", treeRoot, names.failure);
    const expected = expectedTreeNames(manifest);
    if (
      names.names.length !== expected.length
      || names.names.some((name, index) => name !== expected[index])
    ) return yield* failure("reader", treeRoot, "generation tree does not exactly match the manifest");
    for (const file of manifest.files) yield* readVerifiedFile("reader", treeRoot, file);
    return Object.freeze({
      publicationRoot,
      generationName,
      generationRoot,
      treeRoot,
      manifestPath,
      manifestDigest,
      manifest,
    });
  });

const makePinned = (verified: VerifiedGeneration): PinnedGeneration => {
  const prefix = `generations/${verified.generationName}/tree/`;
  const pinned = Object.freeze({
    protocol: directoryGenerationProtocol,
    publicationRoot: verified.publicationRoot,
    generationName: verified.generationName,
    generationRoot: verified.generationRoot,
    treeRoot: verified.treeRoot,
    manifestPath: verified.manifestPath,
    manifestDigest: verified.manifestDigest,
    manifest: verified.manifest,
    rootNavigation: verified.manifest.subject.profile === staticBrowserProfile
      ? `${prefix}${staticBrowserEntry}`
      : null,
  });
  pinnedAuthorities.set(pinned, {
    treeRoot: verified.treeRoot,
    files: new Map(verified.manifest.files.map((file) => [file.path, file])),
  });
  return pinned;
};

const writeCurrent = (
  publicationRoot: AbsolutePath,
  verified: VerifiedGeneration,
): Effect.Effect<PinnedGeneration, DirectoryGenerationFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const currentPath = path.join(publicationRoot, "current.json");
      const staged = yield* fileSystem.makeTempFileScoped({
        directory: publicationRoot,
        prefix: ".effect-build-current-",
        suffix: ".json",
      }).pipe(Effect.mapError((error) => failure("activation", currentPath, describe(error))));
      const contents = encodeCurrentReference(verified.manifestDigest);
      yield* fileSystem.writeFile(staged, contents).pipe(
        Effect.mapError((error) => failure("activation", staged, describe(error))),
      );
      const observed = yield* fileSystem.readFile(staged).pipe(
        Effect.mapError((error) => failure("activation", staged, describe(error))),
      );
      if (!bytesEqual(contents, observed)) {
        return yield* failure("activation", staged, "staged current reference changed before activation");
      }
      yield* Effect.uninterruptible(fileSystem.rename(staged, currentPath)).pipe(
        Effect.mapError((error) => failure("activation", currentPath, describe(error))),
      );
      return makePinned(verified);
    }),
  );

const withCurrentClaim = <A, E, R>(
  publicationRoot: AbsolutePath,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DirectoryGenerationFailed, R | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const currentPath = path.join(publicationRoot, "current.json");
    const conflict = claimDurableDestination(path, currentPath);
    if (conflict !== undefined) return yield* failure("activation", currentPath, conflict);
    yield* Effect.addFinalizer(() => Effect.sync(() => releaseDurableDestination(path, currentPath)));
    return yield* effect;
  }).pipe(Effect.scoped);

const installGeneration = (
  stagedRoot: AbsolutePath,
  publicationRoot: AbsolutePath,
  manifestDigest: Digest,
): Effect.Effect<VerifiedGeneration, DirectoryGenerationFailed, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const finalRoot = path.join(publicationRoot, "generations", `sha256-${manifestDigest.value}`) as AbsolutePath;
    if (
      !(yield* fileSystem.exists(finalRoot).pipe(
        Effect.mapError((error) => failure("seal", finalRoot, describe(error))),
      ))
    ) {
      const renameExit = yield* Effect.exit(Effect.uninterruptible(fileSystem.rename(stagedRoot, finalRoot)));
      if (Exit.isFailure(renameExit)) {
        const appeared = yield* fileSystem.exists(finalRoot).pipe(
          Effect.mapError((error) => failure("seal", finalRoot, describe(error))),
        );
        if (!appeared) return yield* failure("seal", finalRoot, describe(renameExit.cause));
      }
    }
    return yield* loadVerifiedGeneration(publicationRoot, manifestDigest);
  });

/**
 * Captures one quiescent provider root, installs one content-addressed immutable
 * generation, and atomically replaces only `current.json`.
 */
export const seal = (
  request: SealRequest,
): Effect.Effect<
  PinnedGeneration,
  DirectoryGenerationFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const subject = canonicalSubject(request.subject);
      if (typeof subject === "string") return yield* failure("preflight", request.providerRoot, subject);
      const providerRoot = yield* resolveRoot("preflight", request.providerRoot, request.cwd, false);
      const publicationRoot = yield* resolveRoot("preflight", request.publicationRoot, request.cwd, true);
      if (contains(path, providerRoot, publicationRoot) || contains(path, publicationRoot, providerRoot)) {
        return yield* failure("preflight", publicationRoot, "provider and publication roots must not overlap");
      }
      return yield* withCurrentClaim(
        publicationRoot,
        Effect.gen(function*() {
          const generationsRoot = path.join(publicationRoot, "generations");
          yield* fileSystem.makeDirectory(generationsRoot, { recursive: true }).pipe(
            Effect.mapError((error) => failure("seal", generationsRoot, describe(error))),
          );
          const stagedRoot = yield* fileSystem.makeTempDirectory({
            directory: generationsRoot,
            prefix: ".effect-build-generation-",
          }).pipe(Effect.mapError((error) => failure("seal", generationsRoot, describe(error))));
          yield* Effect.addFinalizer(() =>
            fileSystem.remove(stagedRoot, { recursive: true, force: true }).pipe(Effect.orDie)
          );
          const stagedTree = path.join(stagedRoot, "tree") as AbsolutePath;
          yield* fileSystem.makeDirectory(stagedTree).pipe(
            Effect.mapError((error) => failure("seal", stagedTree, describe(error))),
          );
          const manifest = yield* captureSnapshot({ ...request, subject }, providerRoot, stagedTree);
          const manifestContents = encodeManifest(manifest);
          const manifestDigest = yield* hash("seal", stagedRoot, manifestContents);
          const manifestPath = path.join(stagedRoot, "manifest.json");
          yield* fileSystem.writeFile(manifestPath, manifestContents).pipe(
            Effect.mapError((error) => failure("seal", manifestPath, describe(error))),
          );
          const verified = yield* installGeneration(stagedRoot as AbsolutePath, publicationRoot, manifestDigest);
          return yield* writeCurrent(publicationRoot, verified);
        }),
      );
    }),
  );

/** Atomically points `current.json` at a previously sealed generation. */
export const activate = (
  request: ActivationRequest,
): Effect.Effect<
  PinnedGeneration,
  DirectoryGenerationFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    if (request.manifestDigest.algorithm !== "sha256" || !canonicalSha256.test(request.manifestDigest.value)) {
      return yield* failure("preflight", request.publicationRoot, "activation digest is not canonical SHA-256");
    }
    const publicationRoot = yield* resolveRoot("preflight", request.publicationRoot, request.cwd, false);
    return yield* withCurrentClaim(
      publicationRoot,
      loadVerifiedGeneration(publicationRoot, request.manifestDigest).pipe(
        Effect.flatMap((verified) => writeCurrent(publicationRoot, verified)),
      ),
    );
  });

/** Reads `current.json` once, derives one generation identity, and pins it. */
export const pin = (
  request: PublicationRequest,
): Effect.Effect<
  PinnedGeneration,
  DirectoryGenerationFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const publicationRoot = yield* resolveRoot("preflight", request.publicationRoot, request.cwd, false);
    const currentPath = path.join(publicationRoot, "current.json");
    const canonical = path.normalize(
      yield* fileSystem.realPath(currentPath).pipe(
        Effect.mapError((error) => failure("reader", currentPath, describe(error))),
      ),
    );
    if (canonical !== currentPath) {
      return yield* failure("reader", currentPath, "current reference must be a regular file");
    }
    const contents = yield* fileSystem.readFile(currentPath).pipe(
      Effect.mapError((error) => failure("reader", currentPath, describe(error))),
    );
    const current = decodeCurrentReference(contents);
    if (typeof current === "string") return yield* failure("reader", currentPath, current);
    const verified = yield* loadVerifiedGeneration(publicationRoot, current.manifestDigest);
    return makePinned(verified);
  });

/** Revalidates and lends exactly one manifest-listed file from the pinned generation. */
export const read = (
  pinned: PinnedGeneration,
  portablePath: string,
): Effect.Effect<
  LentFile,
  DirectoryGenerationFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => {
  const authority = pinnedAuthorities.get(pinned);
  if (authority === undefined) return Effect.fail(failure("reader", portablePath, "generation authority is forged"));
  const pathFailure = validatePortablePath(portablePath);
  if (pathFailure !== undefined) return Effect.fail(failure("reader", portablePath, pathFailure));
  const file = authority.files.get(portablePath);
  if (file === undefined) {
    return Effect.fail(failure("reader", portablePath, "path is not listed by the pinned manifest"));
  }
  return Effect.gen(function*() {
    const path = yield* Path.Path;
    const contents = yield* readVerifiedFile("reader", authority.treeRoot, file);
    return Object.freeze({
      ...file,
      absolutePath: path.join(authority.treeRoot, portablePath.split("/").join(path.sep)) as AbsolutePath,
      generationQualifiedPath: `generations/${pinned.generationName}/tree/${portablePath}`,
      contents,
    });
  });
};
