import { Crypto, Effect, Exit, FileSystem, Path } from "effect";
import type { Digest } from "../Artifact.js";
import { ArtifactInvalid, CurrentConflict, CurrentUnknown, GenerationConflict } from "../BuildError.js";
import * as BorrowedContent from "./BorrowedContent.js";
import { comparePortablePaths, type TreeSnapshot, validatePortablePath } from "./TreeSnapshot.js";

export const manifestProtocol = "effect-build/generation-manifest@1" as const;
export const generationProtocol = "effect-build/directory-generation@1" as const;
export const currentProtocol = "effect-build/current-generation@1" as const;

export interface ManifestFile {
  readonly path: string;
  readonly bytes: string;
  readonly digest: Digest;
  readonly mediaType: string | null;
}

export interface GenerationManifest<Subject extends object = object> {
  readonly protocol: typeof manifestProtocol;
  readonly subject: Subject;
  readonly files: readonly ManifestFile[];
}

export interface DirectoryGeneration<Subject extends object = object> {
  readonly protocol: typeof generationProtocol;
  readonly root: string;
  readonly tree: string;
  readonly manifest: GenerationManifest<Subject>;
  readonly manifestDigest: Digest;
}

export interface CurrentGeneration {
  readonly protocol: typeof currentProtocol;
  readonly manifestDigest: Digest;
}

export interface PublishInput<Subject extends object> {
  readonly generationRoot: string;
  readonly snapshot: TreeSnapshot;
  readonly subject: Subject;
  readonly mediaTypes?: Readonly<Record<string, string | null>>;
}

export interface ActivateInput {
  readonly generation: DirectoryGeneration;
  readonly expectedCurrent: Digest | null;
}

export type RollbackInput = ActivateInput;

type Services = Crypto.Crypto | FileSystem.FileSystem | Path.Path;
type SealError = ArtifactInvalid | GenerationConflict;
type ActivateError = ArtifactInvalid | CurrentConflict | CurrentUnknown;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const canonicalBytes = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value)}\n`);

const mediaType = /^[a-z0-9][a-z0-9!#$%&*+.^_~-]*\/[a-z0-9][a-z0-9!#$%&*+.^_~-]*(?:; charset=utf-8)?$/u;
const sha256 = /^[0-9a-f]{64}$/u;

const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isDigest = (value: unknown): value is Digest =>
  typeof value === "object" && value !== null
  && exactKeys(value, ["algorithm", "value"])
  && (value as { readonly algorithm?: unknown }).algorithm === "sha256"
  && typeof (value as { readonly value?: unknown }).value === "string"
  && sha256.test((value as { readonly value: string }).value);

const subjectKind = (subject: object): "tree" | "static-browser" | undefined => {
  const profile = (subject as { readonly profile?: unknown }).profile;
  if (profile === "effect-build/generation-subject/tree@1" && exactKeys(subject, ["profile"])) return "tree";
  if (
    profile === "effect-build/profile/static-browser-application@1"
    && exactKeys(subject, ["profile", "entry", "mount", "host"])
    && (subject as { readonly entry?: unknown }).entry === "index.html"
    && (subject as { readonly mount?: unknown }).mount === "relative-same-origin"
    && (subject as { readonly host?: unknown }).host === "effect-build/generated-module-host@1"
  ) {
    return "static-browser";
  }
  return undefined;
};

const validateManifest = (
  value: unknown,
  source: string,
): Effect.Effect<GenerationManifest, ArtifactInvalid> =>
  Effect.gen(function*() {
    if (typeof value !== "object" || value === null || !exactKeys(value, ["protocol", "subject", "files"])) {
      return yield* new ArtifactInvalid({ path: source, reason: "manifest field set/order is invalid" });
    }
    const candidate = value as Partial<GenerationManifest>;
    if (
      candidate.protocol !== manifestProtocol || typeof candidate.subject !== "object" || candidate.subject === null
      || !Array.isArray(candidate.files)
    ) {
      return yield* new ArtifactInvalid({ path: source, reason: "manifest protocol, subject, or files are invalid" });
    }
    const kind = subjectKind(candidate.subject);
    if (kind === undefined) return yield* new ArtifactInvalid({ path: source, reason: "unknown generation subject" });
    let prior = "";
    const seen = new Set<string>();
    for (const file of candidate.files) {
      if (typeof file !== "object" || file === null || !exactKeys(file, ["path", "bytes", "digest", "mediaType"])) {
        return yield* new ArtifactInvalid({ path: source, reason: "manifest file field set/order is invalid" });
      }
      const entry = file as ManifestFile;
      if (
        typeof entry.path !== "string" || validatePortablePath(entry.path) !== undefined
        || typeof entry.bytes !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(entry.bytes)
        || !isDigest(entry.digest)
        || (entry.mediaType !== null && (typeof entry.mediaType !== "string" || !mediaType.test(entry.mediaType)))
      ) {
        return yield* new ArtifactInvalid({ path: source, reason: `invalid manifest entry ${String(entry.path)}` });
      }
      if (kind === "static-browser" && entry.mediaType === null) {
        return yield* new ArtifactInvalid({
          path: source,
          reason: `static browser media type missing for ${entry.path}`,
        });
      }
      if ((prior !== "" && comparePortablePaths(entry.path, prior) <= 0) || seen.has(entry.path.toLowerCase())) {
        return yield* new ArtifactInvalid({
          path: source,
          reason: "manifest files are not canonically ordered and unique",
        });
      }
      prior = entry.path;
      seen.add(entry.path.toLowerCase());
    }
    if (candidate.files.length === 0) {
      return yield* new ArtifactInvalid({ path: source, reason: "manifest files are empty" });
    }
    return candidate as GenerationManifest;
  });

const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const tempDirectoryScoped = (
  fileSystem: FileSystem.FileSystem,
  options: { readonly directory: string; readonly prefix: string },
) =>
  Effect.acquireRelease(
    fileSystem.makeTempDirectory(options),
    (temporary) => fileSystem.remove(temporary, { recursive: true }).pipe(Effect.ignore),
  );

const tempFileScoped = (
  fileSystem: FileSystem.FileSystem,
  options: { readonly directory: string; readonly prefix: string },
) =>
  Effect.acquireRelease(
    fileSystem.makeTempFile(options),
    (temporary) => fileSystem.remove(temporary).pipe(Effect.ignore),
  );

const parseCurrent = (bytes: Uint8Array, root: string): Effect.Effect<CurrentGeneration, ArtifactInvalid> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(decoder.decode(bytes)) as CurrentGeneration;
      const keys = Object.keys(parsed);
      if (keys.length !== 2 || keys[0] !== "protocol" || keys[1] !== "manifestDigest") {
        throw new Error("field set/order");
      }
      if (
        parsed.protocol !== currentProtocol || parsed.manifestDigest?.algorithm !== "sha256"
        || !/^[0-9a-f]{64}$/u.test(parsed.manifestDigest.value)
      ) throw new Error("invalid current reference");
      if (
        !bytes.every((byte, index) => byte === canonicalBytes(parsed)[index])
        || bytes.byteLength !== canonicalBytes(parsed).byteLength
      ) throw new Error("non-canonical encoding");
      return parsed;
    },
    catch: (error) => new ArtifactInvalid({ path: root, reason: `invalid current reference: ${describe(error)}` }),
  });

const readCurrent = (
  generationRoot: string,
): Effect.Effect<CurrentGeneration | null, ArtifactInvalid, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const currentPath = path.join(generationRoot, "current.json");
    if (
      !(yield* fileSystem.exists(currentPath).pipe(
        Effect.mapError(() =>
          new ArtifactInvalid({ path: currentPath, reason: "unable to observe current reference" })
        ),
      ))
    ) return null;
    const bytes = yield* fileSystem.readFile(currentPath).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: currentPath, reason: "unable to read current reference" })),
    );
    return yield* parseCurrent(bytes, currentPath);
  });

const verifyGeneration = <Subject extends object>(
  generation: DirectoryGeneration<Subject>,
  expectedManifestBytes: Uint8Array,
): Effect.Effect<DirectoryGeneration<Subject>, SealError, Services> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(generation.root, "manifest.json");
    const observed = yield* fileSystem.readFile(manifestPath).pipe(
      Effect.mapError(() => new GenerationConflict({ generation: generation.root, reason: "manifest is missing" })),
    );
    if (
      observed.byteLength !== expectedManifestBytes.byteLength
      || observed.some((byte, index) => byte !== expectedManifestBytes[index])
    ) {
      return yield* new GenerationConflict({ generation: generation.root, reason: "manifest bytes differ" });
    }
    for (const file of generation.manifest.files) {
      const contents = yield* fileSystem.readFile(path.join(generation.tree, file.path)).pipe(
        Effect.mapError(() => new GenerationConflict({ generation: generation.root, reason: `missing ${file.path}` })),
      );
      const digest = yield* BorrowedContent.digestBytes(contents);
      if (`${contents.byteLength}` !== file.bytes || !sameDigest(digest, file.digest)) {
        return yield* new GenerationConflict({
          generation: generation.root,
          reason: `content differs for ${file.path}`,
        });
      }
    }
    return generation;
  });

export const publish = <Subject extends object>(
  input: PublishInput<Subject>,
): Effect.Effect<DirectoryGeneration<Subject>, SealError, Services> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const generationRoot = path.normalize(path.resolve(input.generationRoot));
      if (subjectKind(input.subject) === undefined) {
        return yield* new ArtifactInvalid({ path: generationRoot, reason: "unknown generation subject" });
      }
      const files: ManifestFile[] = input.snapshot.files.map((file) => ({
        path: file.relativePath,
        bytes: `${file.bytes}`,
        digest: file.digest,
        mediaType: input.mediaTypes?.[file.relativePath] ?? null,
      }));
      for (const file of files) {
        if (file.mediaType !== null && !mediaType.test(file.mediaType)) {
          return yield* new ArtifactInvalid({ path: file.path, reason: "media type is not canonical" });
        }
        if (
          (input.subject as { readonly profile?: unknown }).profile
            === "effect-build/profile/static-browser-application@1" && file.mediaType === null
        ) {
          return yield* new ArtifactInvalid({ path: file.path, reason: "static browser files require media types" });
        }
      }
      const manifest: GenerationManifest<Subject> = Object.freeze({
        protocol: manifestProtocol,
        subject: input.subject,
        files: Object.freeze(files),
      });
      const manifestBytes = canonicalBytes(manifest);
      const manifestDigest = yield* BorrowedContent.digestBytes(manifestBytes);
      const generations = path.join(generationRoot, "generations");
      const root = path.join(generations, `sha256-${manifestDigest.value}`);
      const tree = path.join(root, "tree");
      const generation: DirectoryGeneration<Subject> = Object.freeze({
        protocol: generationProtocol,
        root,
        tree,
        manifest,
        manifestDigest,
      });
      yield* fileSystem.makeDirectory(generations, { recursive: true }).pipe(
        Effect.mapError(() =>
          new GenerationConflict({ generation: root, reason: "unable to create generations root" })
        ),
      );
      if (
        yield* fileSystem.exists(root).pipe(
          Effect.mapError(() => new GenerationConflict({ generation: root, reason: "unable to observe generation" })),
        )
      ) return yield* verifyGeneration(generation, manifestBytes);
      const staging = yield* tempDirectoryScoped(fileSystem, {
        directory: generations,
        prefix: ".effect-build-generation-",
      }).pipe(
        Effect.mapError(() => new GenerationConflict({ generation: root, reason: "unable to create staging tree" })),
      );
      const stagedTree = path.join(staging, "tree");
      yield* fileSystem.makeDirectory(stagedTree, { recursive: true }).pipe(
        Effect.mapError(() => new GenerationConflict({ generation: root, reason: "unable to create staged tree" })),
      );
      for (const file of input.snapshot.files) {
        yield* BorrowedContent.revalidate(file);
        const source = yield* fileSystem.readFile(file.path).pipe(
          Effect.mapError(() => new ArtifactInvalid({ path: file.path, reason: "unable to read borrowed file" })),
        );
        const digest = yield* BorrowedContent.digestBytes(source);
        if (source.byteLength !== file.bytes || !sameDigest(digest, file.digest)) {
          return yield* new ArtifactInvalid({ path: file.path, reason: "borrowed file changed before sealing" });
        }
        const destination = path.join(stagedTree, file.relativePath);
        yield* fileSystem.makeDirectory(path.dirname(destination), { recursive: true }).pipe(
          Effect.mapError(() =>
            new GenerationConflict({ generation: root, reason: `unable to stage ${file.relativePath}` })
          ),
        );
        yield* fileSystem.writeFile(destination, source, { flag: "wx" }).pipe(
          Effect.mapError(() =>
            new GenerationConflict({ generation: root, reason: `unable to stage ${file.relativePath}` })
          ),
        );
      }
      yield* fileSystem.writeFile(path.join(staging, "manifest.json"), manifestBytes, { flag: "wx" }).pipe(
        Effect.mapError(() => new GenerationConflict({ generation: root, reason: "unable to stage manifest" })),
      );
      const commit = yield* Effect.exit(Effect.uninterruptible(fileSystem.rename(staging, root)));
      if (Exit.isFailure(commit)) {
        if (
          yield* fileSystem.exists(root).pipe(
            Effect.mapError(() =>
              new GenerationConflict({ generation: root, reason: "unable to reobserve generation" })
            ),
          )
        ) return yield* verifyGeneration(generation, manifestBytes);
        return yield* new GenerationConflict({ generation: root, reason: "generation commit failed" });
      }
      return yield* verifyGeneration(generation, manifestBytes);
    }),
  );

const withLock = <A, E, R>(
  generationRoot: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | CurrentConflict | CurrentUnknown, R | Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      yield* fileSystem.makeDirectory(generationRoot, { recursive: true }).pipe(
        Effect.mapError((error) => new CurrentUnknown({ root: generationRoot, reason: describe(error) })),
      );
      const lockPath = path.join(generationRoot, ".current.lock");
      const random = yield* crypto.randomBytes(16).pipe(
        Effect.mapError((error) => new CurrentUnknown({ root: generationRoot, reason: describe(error) })),
      );
      const token = [...random].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      yield* Effect.acquireRelease(
        fileSystem.writeFileString(lockPath, token, { flag: "wx" }).pipe(
          Effect.mapError(() =>
            new CurrentConflict({ root: generationRoot, expected: "unlocked", observed: "locked" })
          ),
        ),
        () =>
          fileSystem.readFileString(lockPath).pipe(
            Effect.flatMap((observed) => observed === token ? fileSystem.remove(lockPath) : Effect.void),
            Effect.ignore,
          ),
      );
      return yield* effect;
    }),
  );

export const activate = (
  input: ActivateInput,
): Effect.Effect<CurrentGeneration, ActivateError, Services> =>
  Effect.gen(function*() {
    const platformPath = yield* Path.Path;
    const generationRoot = platformPath.dirname(platformPath.dirname(input.generation.root));
    return yield* withLock(
      generationRoot,
      Effect.scoped(Effect.gen(function*() {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const observed = yield* readCurrent(generationRoot);
        const observedDigest = observed?.manifestDigest ?? null;
        const matches = input.expectedCurrent === null
          ? observedDigest === null
          : observedDigest !== null && sameDigest(input.expectedCurrent, observedDigest);
        if (!matches) {
          return yield* new CurrentConflict({
            root: generationRoot,
            expected: input.expectedCurrent?.value ?? "absent",
            observed: observedDigest?.value ?? "absent",
          });
        }
        const current: CurrentGeneration = Object.freeze({
          protocol: currentProtocol,
          manifestDigest: input.generation.manifestDigest,
        });
        const bytes = canonicalBytes(current);
        const staging = yield* tempFileScoped(fileSystem, { directory: generationRoot, prefix: ".current-" }).pipe(
          Effect.mapError((error) => new CurrentUnknown({ root: generationRoot, reason: describe(error) })),
        );
        yield* fileSystem.writeFile(staging, bytes).pipe(
          Effect.mapError((error) => new CurrentUnknown({ root: generationRoot, reason: describe(error) })),
        );
        const currentPath = path.join(generationRoot, "current.json");
        const committed = yield* Effect.exit(Effect.uninterruptible(fileSystem.rename(staging, currentPath)));
        const confirmed = yield* readCurrent(generationRoot).pipe(Effect.exit);
        if (
          Exit.isSuccess(confirmed) && confirmed.value !== null
          && sameDigest(confirmed.value.manifestDigest, input.generation.manifestDigest)
        ) return current;
        if (Exit.isFailure(committed)) {
          return yield* new CurrentUnknown({
            root: generationRoot,
            reason: "reference commit failed and new value was not observed",
          });
        }
        return yield* new CurrentUnknown({
          root: generationRoot,
          reason: "committed reference could not be reobserved",
        });
      })),
    );
  });

/** Rollback is only activation of a previously published immutable generation. */
export const rollback = (
  input: RollbackInput,
): Effect.Effect<CurrentGeneration, ActivateError, Services> => activate(input);

export const resolveCurrent = (
  generationRoot: string,
): Effect.Effect<DirectoryGeneration, ArtifactInvalid | GenerationConflict, Services> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.normalize(path.resolve(generationRoot));
    const current = yield* readCurrent(root);
    if (current === null) return yield* new ArtifactInvalid({ path: root, reason: "current generation is absent" });
    const generationPath = path.join(root, "generations", `sha256-${current.manifestDigest.value}`);
    const manifestPath = path.join(generationPath, "manifest.json");
    const bytes = yield* fileSystem.readFile(manifestPath).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: manifestPath, reason: "current manifest is missing" })),
    );
    const digest = yield* BorrowedContent.digestBytes(bytes);
    if (!sameDigest(digest, current.manifestDigest)) {
      return yield* new GenerationConflict({ generation: generationPath, reason: "current manifest digest mismatch" });
    }
    const decoded = yield* Effect.try({
      try: () => JSON.parse(decoder.decode(bytes)) as unknown,
      catch: (error) => new ArtifactInvalid({ path: manifestPath, reason: describe(error) }),
    });
    const manifest = yield* validateManifest(decoded, manifestPath);
    const canonical = canonicalBytes(manifest);
    if (canonical.byteLength !== bytes.byteLength || canonical.some((byte, index) => byte !== bytes[index])) {
      return yield* new ArtifactInvalid({ path: manifestPath, reason: "manifest encoding is not canonical" });
    }
    const generation: DirectoryGeneration = {
      protocol: generationProtocol,
      root: generationPath,
      tree: path.join(generationPath, "tree"),
      manifest,
      manifestDigest: digest,
    };
    return yield* verifyGeneration(generation, bytes);
  });
