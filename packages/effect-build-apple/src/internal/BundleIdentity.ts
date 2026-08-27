import { Crypto, Effect, FileSystem, Option, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as Toolchain from "effect-build/Toolchain";
import { isSafeRelative } from "../internal.js";
import { BundleInspectionFailed, Sha256 } from "../Model.js";

/** Symlink-aware identity of one exact `.app` directory snapshot. */
export class BundleIdentity extends Schema.Class<BundleIdentity>(
  "effect-build-apple/BundleIdentity",
)({
  bundleName: Schema.NonEmptyString,
  artifactBytes: Schema.Natural,
  artifactSha256: Sha256,
  entryCount: Schema.Natural,
}) {}

interface DirectoryEntry {
  readonly kind: "directory";
  readonly path: string;
  readonly mode: number;
}

interface FileEntry {
  readonly kind: "file";
  readonly path: string;
  readonly mode: number;
  readonly contents: Uint8Array;
  readonly sha256: Sha256;
}

interface SymbolicLinkEntry {
  readonly kind: "symlink";
  readonly path: string;
  readonly target: string;
  readonly sha256: Sha256;
}

type Entry = DirectoryEntry | FileEntry | SymbolicLinkEntry;

/** In-memory immutable projection used to rebuild exactly the tree that was identified. */
export interface BundleSnapshot {
  readonly source: string;
  readonly identity: BundleIdentity;
  readonly entries: readonly Entry[];
}

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const portable = (relative: string): string => relative.replaceAll("\\", "/");

const depth = (relative: string): number => relative.split("/").length;

const sameIdentity = (left: BundleIdentity, right: BundleIdentity): boolean =>
  left.bundleName === right.bundleName
  && left.artifactBytes === right.artifactBytes
  && left.artifactSha256 === right.artifactSha256
  && left.entryCount === right.entryCount;

export const identityEquals = sameIdentity;

/** Capture every file, directory, and link without following links into the tree. */
export const captureBundlePath = (
  source: string,
  bundleName?: string,
): Effect.Effect<
  BundleSnapshot,
  BundleInspectionFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const root = path.resolve(source);
    const identityName = bundleName ?? path.basename(root);
    const fail = (reason: string, entryPath = root) => new BundleInspectionFailed({ path: entryPath, reason });
    const digest = (contents: Uint8Array, entryPath: string) =>
      crypto.digest("SHA-256", contents).pipe(
        Effect.map((value) => hex(new Uint8Array(value)) as Sha256),
        Effect.mapError((error) => fail(`SHA-256 failed: ${String(error)}`, entryPath)),
      );

    const rootLink = yield* Effect.option(fileSystem.readLink(root));
    if (Option.isSome(rootLink)) return yield* fail("the bundle root must not be a symbolic link");
    const rootInformation = yield* fileSystem.stat(root).pipe(
      Effect.mapError((error) => fail(`stat failed: ${String(error)}`)),
    );
    if (rootInformation.type !== "Directory") {
      return yield* fail(`expected a directory, observed ${rootInformation.type}`);
    }
    const relativeEntries: string[] = [];
    const walk = (
      directory: string,
      prefix: string,
    ): Effect.Effect<void, BundleInspectionFailed> =>
      Effect.gen(function*() {
        const children = yield* fileSystem.readDirectory(directory).pipe(
          Effect.mapError((error) => fail(`read directory failed: ${String(error)}`, directory)),
        );
        for (const child of [...children].sort()) {
          const relative = prefix.length === 0 ? child : `${prefix}/${child}`;
          const childPath = path.join(directory, child);
          relativeEntries.push(portable(relative));
          if (Option.isSome(yield* Effect.option(fileSystem.readLink(childPath)))) continue;
          const information = yield* fileSystem.stat(childPath).pipe(
            Effect.mapError((error) => fail(`stat failed: ${String(error)}`, childPath)),
          );
          if (information.type === "Directory") yield* walk(childPath, relative);
        }
      });
    yield* walk(root, "");
    relativeEntries.sort();
    if (new Set(relativeEntries).size !== relativeEntries.length) {
      return yield* fail("recursive directory listing contained duplicate paths");
    }

    const entries: Entry[] = [];
    let artifactBytes = 0;
    for (const relative of relativeEntries) {
      if (!isSafeRelative(relative)) return yield* fail(`unsafe relative entry ${relative}`);
      const entryPath = path.join(root, relative);
      const link = yield* Effect.option(fileSystem.readLink(entryPath));
      if (Option.isSome(link)) {
        const target = link.value;
        if (path.isAbsolute(target)) return yield* fail(`absolute symbolic-link target ${target}`, entryPath);
        const resolvedTarget = path.resolve(path.dirname(entryPath), target);
        const targetRelative = portable(path.relative(root, resolvedTarget));
        if (!isSafeRelative(targetRelative)) {
          return yield* fail(`symbolic-link target escapes the bundle: ${target}`, entryPath);
        }
        const targetBytes = new TextEncoder().encode(target);
        artifactBytes += targetBytes.byteLength;
        entries.push({
          kind: "symlink",
          path: relative,
          target,
          sha256: yield* digest(targetBytes, entryPath),
        });
        continue;
      }

      const before = yield* fileSystem.stat(entryPath).pipe(
        Effect.mapError((error) => fail(`stat failed: ${String(error)}`, entryPath)),
      );
      const mode = Number(before.mode) & 0o777;
      if (before.type === "Directory") {
        entries.push({ kind: "directory", path: relative, mode });
        continue;
      }
      if (before.type !== "File") {
        return yield* fail(`unsupported ${before.type} entry`, entryPath);
      }
      const contents = yield* fileSystem.readFile(entryPath).pipe(
        Effect.mapError((error) => fail(`read failed: ${String(error)}`, entryPath)),
      );
      const after = yield* fileSystem.stat(entryPath).pipe(
        Effect.mapError((error) => fail(`post-read stat failed: ${String(error)}`, entryPath)),
      );
      if (
        after.type !== "File"
        || Number(before.size) !== contents.byteLength
        || Number(after.size) !== contents.byteLength
        || (Number(after.mode) & 0o777) !== mode
      ) {
        return yield* fail("file changed while its bytes were captured", entryPath);
      }
      artifactBytes += contents.byteLength;
      entries.push({
        kind: "file",
        path: relative,
        mode,
        contents,
        sha256: yield* digest(contents, entryPath),
      });
    }

    const manifest = [
      JSON.stringify(["bundle", identityName]),
      ...entries.map((entry) => {
        switch (entry.kind) {
          case "directory":
            return JSON.stringify([entry.kind, entry.path, entry.mode]);
          case "file":
            return JSON.stringify([entry.kind, entry.path, entry.mode, entry.contents.byteLength, entry.sha256]);
          case "symlink":
            return JSON.stringify([entry.kind, entry.path, entry.target, entry.sha256]);
        }
      }),
    ].join("\n");
    const manifestBytes = new TextEncoder().encode(`${manifest}\n`);
    return {
      source: root,
      entries,
      identity: new BundleIdentity({
        bundleName: identityName,
        artifactBytes,
        artifactSha256: yield* digest(manifestBytes, root),
        entryCount: entries.length,
      }),
    };
  });

/** Capture a core bundle's current tree; no caller-supplied aggregate identity is trusted. */
export const captureBundle = (
  bundle: Artifact.Bundle,
): Effect.Effect<
  BundleSnapshot,
  BundleInspectionFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.scoped(
    Effect.gen(function*() {
      const path = yield* Path.Path;
      const snapshot = yield* Toolchain.materializeVerifiedBundle(bundle).pipe(
        Effect.mapError((error) => new BundleInspectionFailed({ path: bundle.outdir, reason: error.reason })),
      );
      return yield* captureBundlePath(snapshot, path.basename(path.resolve(bundle.outdir)));
    }),
  );

/** Rebuild a captured tree without reopening its mutable source path. */
export const materializeBundle = (
  snapshot: BundleSnapshot,
  destination: string,
): Effect.Effect<void, BundleInspectionFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(destination);
    const fail = (reason: string, entryPath = root) => new BundleInspectionFailed({ path: entryPath, reason });
    yield* fileSystem.makeDirectory(root, { recursive: true, mode: 0o755 }).pipe(
      Effect.mapError((error) => fail(`make bundle root failed: ${String(error)}`)),
    );
    const directories = snapshot.entries
      .filter((entry): entry is DirectoryEntry => entry.kind === "directory")
      .sort((left, right) => depth(left.path) - depth(right.path) || left.path.localeCompare(right.path));
    for (const entry of directories) {
      const entryPath = path.join(root, entry.path);
      yield* fileSystem.makeDirectory(entryPath, { recursive: true, mode: 0o700 }).pipe(
        Effect.mapError((error) => fail(`make directory failed: ${String(error)}`, entryPath)),
      );
    }
    for (const entry of snapshot.entries) {
      if (entry.kind !== "file") continue;
      const entryPath = path.join(root, entry.path);
      yield* fileSystem.makeDirectory(path.dirname(entryPath), { recursive: true }).pipe(
        Effect.mapError((error) => fail(`make file parent failed: ${String(error)}`, entryPath)),
      );
      yield* fileSystem.writeFile(entryPath, entry.contents).pipe(
        Effect.mapError((error) => fail(`write file failed: ${String(error)}`, entryPath)),
      );
      yield* fileSystem.chmod(entryPath, entry.mode).pipe(
        Effect.mapError((error) => fail(`chmod file failed: ${String(error)}`, entryPath)),
      );
    }
    for (const entry of snapshot.entries) {
      if (entry.kind !== "symlink") continue;
      const entryPath = path.join(root, entry.path);
      yield* fileSystem.makeDirectory(path.dirname(entryPath), { recursive: true }).pipe(
        Effect.mapError((error) => fail(`make link parent failed: ${String(error)}`, entryPath)),
      );
      yield* fileSystem.symlink(entry.target, entryPath).pipe(
        Effect.mapError((error) => fail(`create symbolic link failed: ${String(error)}`, entryPath)),
      );
    }
    for (const entry of [...directories].reverse()) {
      const entryPath = path.join(root, entry.path);
      yield* fileSystem.chmod(entryPath, entry.mode).pipe(
        Effect.mapError((error) => fail(`chmod directory failed: ${String(error)}`, entryPath)),
      );
    }
    yield* fileSystem.chmod(root, 0o755).pipe(
      Effect.mapError((error) => fail(`chmod bundle root failed: ${String(error)}`)),
    );
  });

/** Restore owner traversal/write bits on an owned snapshot before recursive cleanup. */
export const makeBundleRemovable = (
  snapshot: BundleSnapshot,
  destination: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(destination);
    yield* fileSystem.chmod(root, 0o700);
    const directories = snapshot.entries
      .filter((entry): entry is DirectoryEntry => entry.kind === "directory")
      .sort((left, right) => depth(left.path) - depth(right.path) || left.path.localeCompare(right.path));
    for (const entry of directories) {
      yield* fileSystem.chmod(path.join(root, entry.path), 0o700);
    }
  }).pipe(Effect.ignore);

/** Re-observe a materialized snapshot and require exact manifest equality. */
export const verifyMaterializedBundle = (
  expected: BundleIdentity,
  destination: string,
): Effect.Effect<
  void,
  BundleInspectionFailed,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.flatMap(captureBundlePath(destination), (observed) =>
    sameIdentity(expected, observed.identity)
      ? Effect.void
      : Effect.fail(
        new BundleInspectionFailed({
          path: observed.source,
          reason:
            `bundle manifest mismatch: expected ${expected.artifactSha256}, observed ${observed.identity.artifactSha256}`,
        }),
      ));
