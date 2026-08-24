import { Crypto, Effect, FileSystem, Path } from "effect";
import { ArtifactInvalid } from "../BuildError.js";
import * as BorrowedContent from "./BorrowedContent.js";

export const protocol = "effect-build/tree-snapshot@1" as const;

export interface SnapshotFile extends BorrowedContent.BorrowedFile {
  readonly relativePath: string;
}

export interface TreeSnapshot {
  readonly protocol: typeof protocol;
  readonly root: string;
  readonly files: readonly SnapshotFile[];
}

const component = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/u;
const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const encoder = new TextEncoder();

export const comparePortablePaths = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};

export const validatePortablePath = (relativePath: string): string | undefined => {
  if (relativePath.includes("\\") || relativePath.startsWith("/") || relativePath.endsWith("/")) {
    return "path is not canonical slash-relative form";
  }
  const parts = relativePath.split("/");
  for (const part of parts) {
    if (!component.test(part) || part === "." || part === "..") return `invalid path component ${JSON.stringify(part)}`;
    if (part.endsWith(".") || part.endsWith(" ")) return `path component ends in dot or space: ${part}`;
    if (windowsReserved.test(part)) return `Windows reserved device basename: ${part}`;
  }
  return undefined;
};

export const observe = (
  inputRoot: string,
): Effect.Effect<TreeSnapshot, ArtifactInvalid, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absoluteRoot = path.normalize(path.resolve(inputRoot));
    const canonicalParent = yield* fileSystem.realPath(path.dirname(absoluteRoot)).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: absoluteRoot, reason: "tree parent does not resolve" })),
    );
    const expectedRoot = path.normalize(path.join(canonicalParent, path.basename(absoluteRoot)));
    const canonicalRoot = yield* fileSystem.realPath(absoluteRoot).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: absoluteRoot, reason: "tree root does not exist" })),
    );
    if (path.normalize(canonicalRoot) !== expectedRoot) {
      return yield* new ArtifactInvalid({
        path: absoluteRoot,
        reason: "tree root must not be a symbolic link or alias",
      });
    }
    const rootInformation = yield* fileSystem.stat(expectedRoot).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: expectedRoot, reason: "unable to inspect tree root" })),
    );
    if (rootInformation.type !== "Directory") {
      return yield* new ArtifactInvalid({ path: absoluteRoot, reason: "tree root is not a directory" });
    }

    const entries = yield* fileSystem.readDirectory(expectedRoot, { recursive: true }).pipe(
      Effect.mapError(() => new ArtifactInvalid({ path: expectedRoot, reason: "unable to enumerate tree" })),
    );
    const seen = new Set<string>();
    const files: SnapshotFile[] = [];
    for (const entry of entries) {
      const relativePath = entry.split(path.sep).join("/");
      const problem = validatePortablePath(relativePath);
      if (problem !== undefined) return yield* new ArtifactInvalid({ path: relativePath, reason: problem });
      const folded = relativePath.toLowerCase();
      if (seen.has(folded)) {
        return yield* new ArtifactInvalid({ path: relativePath, reason: "ASCII case-insensitive path collision" });
      }
      seen.add(folded);
      const absolute = path.join(expectedRoot, entry);
      const canonical = yield* fileSystem.realPath(absolute).pipe(
        Effect.mapError(() => new ArtifactInvalid({ path: absolute, reason: "entry disappeared during observation" })),
      );
      if (path.normalize(canonical) !== path.normalize(absolute)) {
        return yield* new ArtifactInvalid({ path: absolute, reason: "symbolic links and aliases are forbidden" });
      }
      const information = yield* fileSystem.stat(absolute).pipe(
        Effect.mapError(() => new ArtifactInvalid({ path: absolute, reason: "unable to inspect entry" })),
      );
      if (information.type === "Directory") continue;
      if (information.type !== "File") {
        return yield* new ArtifactInvalid({ path: absolute, reason: `unsupported entry type ${information.type}` });
      }
      const borrowed = yield* BorrowedContent.observeFile(absolute);
      files.push(Object.freeze({ ...borrowed, relativePath }));
    }
    files.sort((left, right) => comparePortablePaths(left.relativePath, right.relativePath));
    if (files.length === 0) return yield* new ArtifactInvalid({ path: expectedRoot, reason: "tree is empty" });
    return Object.freeze({ protocol, root: expectedRoot, files: Object.freeze(files) });
  });

export const revalidate = (
  snapshot: TreeSnapshot,
): Effect.Effect<void, ArtifactInvalid, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.forEach(snapshot.files, BorrowedContent.revalidate, { discard: true });
