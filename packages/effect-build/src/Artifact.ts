import { Crypto, Effect, FileSystem, Path, Schema } from "effect";
import * as Inspect from "./Executable.js";
import { Target } from "./Target.js";

export const Producer = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  path: Schema.optionalKey(Schema.String),
  sha256: Schema.optionalKey(Schema.String),
});
export type Producer = typeof Producer.Type;

const Common = {
  path: Schema.String,
  bytes: Schema.Number,
  sha256: Schema.String,
  producedBy: Producer,
};

export const File = Schema.Struct({ kind: Schema.Literal("file"), ...Common });
export type File = typeof File.Type;

export const Executable = Schema.Struct({
  kind: Schema.Literal("executable"),
  ...Common,
  target: Target,
  format: Schema.Literals(["elf", "mach-o", "pe"] as const),
});
export type Executable = typeof Executable.Type;

export const Entry = Schema.Struct({
  path: Schema.String, // relative, "/"-separated
  kind: Schema.Literals(["file", "directory", "symlink"] as const),
  bytes: Schema.Number,
  mode: Schema.Number,
  sha256: Schema.optionalKey(Schema.String), // files only
  linkTarget: Schema.optionalKey(Schema.String), // symlinks only
});
export type Entry = typeof Entry.Type;

/** `sha256` of a directory is the hash of its sorted entry manifest. */
export const Directory = Schema.Struct({
  kind: Schema.Literal("directory"),
  ...Common,
  entries: Schema.Array(Entry),
});
export type Directory = typeof Directory.Type;

export const Artifact = Schema.Union([File, Executable, Directory]);
export type Artifact = typeof Artifact.Type;

/** Anything backed by a single regular file. Most consumers accept this. */
export type Regular = File | Executable;

export const isRegular = (artifact: Artifact): artifact is Regular => artifact.kind !== "directory";

export class ArtifactError extends Schema.TaggedError<ArtifactError>()("ArtifactError", {
  path: Schema.String,
  reason: Schema.Literals([
    "not-found",
    "not-a-file",
    "not-a-directory",
    "unreadable",
    "changed",
  ] as const),
  detail: Schema.optionalKey(Schema.String),
}) {
  override get message(): string {
    return `${this.reason}: ${this.path}${this.detail === undefined ? "" : ` (${this.detail})`}`;
  }
}

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const sha256 = (data: Uint8Array): Effect.Effect<string, never, Crypto.Crypto> =>
  Crypto.Crypto.use((crypto) => crypto.digest("SHA-256", data)).pipe(Effect.map(hex), Effect.orDie);

const readRegular = (path: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(path);
    const info = yield* fs.stat(absolute).pipe(
      Effect.mapError(() => new ArtifactError({ path: absolute, reason: "not-found" })),
    );
    if (info.type !== "File") return yield* new ArtifactError({ path: absolute, reason: "not-a-file" });
    const contents = yield* fs.readFile(absolute).pipe(
      Effect.mapError(() => new ArtifactError({ path: absolute, reason: "unreadable" })),
    );
    return { absolute, contents, digest: yield* sha256(contents), mode: info.mode };
  });

export const file = (path: string, producedBy: Producer): Effect.Effect<File, ArtifactError, Fs> =>
  readRegular(path).pipe(
    Effect.map(({ absolute, contents, digest }) => ({
      kind: "file" as const,
      path: absolute,
      bytes: contents.byteLength,
      sha256: digest,
      producedBy,
    })),
  );

export const executable = (
  path: string,
  producedBy: Producer,
  expected?: Target,
): Effect.Effect<Executable, ArtifactError | Inspect.InspectError | Inspect.TargetMismatch, Fs> =>
  Effect.gen(function*() {
    const { absolute, contents, digest } = yield* readRegular(path);
    const facts = yield* Inspect.parse(contents).pipe(
      Effect.mapError((e) => new Inspect.InspectError({ path: absolute, reason: e.reason })),
    );
    const target = yield* Inspect.resolveTarget(absolute, facts, expected);
    return {
      kind: "executable" as const,
      path: absolute,
      bytes: contents.byteLength,
      sha256: digest,
      producedBy,
      target,
      format: facts.format,
    };
  });

const encoder = new TextEncoder();

/** Observe a directory tree. Symlinks are recorded, never followed. */
export const directory = (root: string, producedBy: Producer): Effect.Effect<Directory, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const absolute = p.resolve(root);
    const info = yield* fs.stat(absolute).pipe(
      Effect.mapError(() => new ArtifactError({ path: absolute, reason: "not-found" })),
    );
    if (info.type !== "Directory") return yield* new ArtifactError({ path: absolute, reason: "not-a-directory" });
    const names = yield* fs.readDirectory(absolute).pipe(
      Effect.mapError(() => new ArtifactError({ path: absolute, reason: "unreadable" })),
    );
    const entries: Entry[] = [];
    let total = 0;
    for (const name of names) {
      const full = p.join(absolute, name);
      const rel = name.split(p.sep).join("/");
      // stat follows links; distinguish them before reading bytes or traversing children.
      const link = yield* fs.readLink(full).pipe(Effect.option);
      if (link._tag === "Some") {
        entries.push({ path: rel, kind: "symlink", bytes: 0, mode: 0o777, linkTarget: link.value });
        continue;
      }
      const stat = yield* fs.stat(full).pipe(
        Effect.mapError(() => new ArtifactError({ path: full, reason: "unreadable" })),
      );
      if (stat.type === "Directory") {
        entries.push({ path: rel, kind: "directory", bytes: 0, mode: stat.mode & 0o7777 });
        const children = yield* fs.readDirectory(full).pipe(
          Effect.mapError(() => new ArtifactError({ path: full, reason: "unreadable" })),
        );
        names.push(...children.map((child) => p.join(name, child)));
      } else {
        const contents = yield* fs.readFile(full).pipe(
          Effect.mapError(() => new ArtifactError({ path: full, reason: "unreadable" })),
        );
        total += contents.byteLength;
        entries.push({
          path: rel,
          kind: "file",
          bytes: contents.byteLength,
          mode: stat.mode & 0o7777,
          sha256: yield* sha256(contents),
        });
      }
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = entries.map((e) => `${e.kind} ${e.mode.toString(8)} ${e.bytes} ${e.sha256 ?? e.linkTarget ?? ""} ${e.path}`).join("\n");
    return {
      kind: "directory" as const,
      path: absolute,
      bytes: total,
      sha256: yield* sha256(encoder.encode(manifest)),
      producedBy,
      entries,
    };
  });

/** Artifacts record bytes; call verify when consuming them later in a pipeline. */
export const verify = <A extends Artifact>(artifact: A): Effect.Effect<A, ArtifactError, Fs> =>
  Effect.gen(function*() {
    const current = artifact.kind === "directory"
      ? yield* directory(artifact.path, artifact.producedBy)
      : yield* file(artifact.path, artifact.producedBy);
    if (current.sha256 !== artifact.sha256 || current.bytes !== artifact.bytes) {
      return yield* new ArtifactError({ path: artifact.path, reason: "changed" });
    }
    return artifact;
  });

/** Read the bytes of a regular artifact, verifying them on the way in. */
export const readVerified = (artifact: Regular): Effect.Effect<Uint8Array, ArtifactError, Fs> =>
  readRegular(artifact.path).pipe(
    Effect.flatMap(({ contents, digest }) =>
      digest === artifact.sha256
        ? Effect.succeed(contents)
        : Effect.fail(new ArtifactError({ path: artifact.path, reason: "changed" }))
    ),
  );

export const encode = Schema.encodeSync(Schema.Array(Artifact));
export const decode = Schema.decodeUnknownSync(Schema.Array(Artifact));
