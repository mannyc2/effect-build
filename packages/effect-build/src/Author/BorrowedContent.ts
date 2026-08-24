import { Crypto, Effect, FileSystem, Path } from "effect";
import type { Digest } from "../Artifact.js";
import { ArtifactInvalid } from "../BuildError.js";

export const protocol = "effect-build/borrowed-content@1" as const;

export interface BorrowedFile {
  readonly protocol: typeof protocol;
  readonly path: string;
  readonly bytes: number;
  readonly digest: Digest;
}

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const digestBytes = (
  contents: Uint8Array,
): Effect.Effect<Digest, ArtifactInvalid, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto.digest("SHA-256", contents).pipe(
      Effect.mapError(() => invalid("<bytes>", "sha-256 digest unavailable")),
    );
    return Object.freeze({ algorithm: "sha256" as const, value: hex(new Uint8Array(digest)) });
  });

const invalid = (path: string, reason: string): ArtifactInvalid => new ArtifactInvalid({ path, reason });

export const observeFile = (
  inputPath: string,
): Effect.Effect<BorrowedFile, ArtifactInvalid, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = path.normalize(path.resolve(inputPath));
    const canonicalParent = yield* fileSystem.realPath(path.dirname(absolute)).pipe(
      Effect.mapError(() => invalid(absolute, "parent directory does not resolve")),
    );
    const expected = path.normalize(path.join(canonicalParent, path.basename(absolute)));
    const canonical = yield* fileSystem.realPath(absolute).pipe(
      Effect.mapError(() => invalid(absolute, "path does not resolve to a regular file")),
    );
    if (path.normalize(canonical) !== expected) {
      return yield* new ArtifactInvalid({ path: absolute, reason: "symbolic links and aliases are forbidden" });
    }
    const information = yield* fileSystem.stat(expected).pipe(
      Effect.mapError(() => invalid(expected, "unable to inspect file")),
    );
    if (information.type !== "File") return yield* invalid(expected, "expected a regular file");
    const contents = yield* fileSystem.readFile(expected).pipe(
      Effect.mapError(() => invalid(expected, "unable to read file")),
    );
    if (contents.byteLength !== Number(information.size)) {
      return yield* invalid(absolute, "file changed while it was being observed");
    }
    const digest = yield* digestBytes(contents);
    return Object.freeze({
      protocol,
      path: expected,
      bytes: contents.byteLength,
      digest,
    });
  });

export const revalidate = (
  borrowed: BorrowedFile,
): Effect.Effect<void, ArtifactInvalid, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    observeFile(borrowed.path),
    (observed) =>
      observed.bytes === borrowed.bytes && observed.digest.value === borrowed.digest.value
        ? Effect.void
        : Effect.fail(invalid(borrowed.path, "borrowed bytes changed after observation")),
  );
