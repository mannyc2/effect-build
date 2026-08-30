import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import * as ArtifactAuthor from "effect-build/Artifact";
import * as FileAuthor from "effect-build/Author/File";
import { ArchiveFailed, type UnsafeArchiveLayout } from "./ArchiveError.js";
import { encodeTarGzip, encodeZip, type Entry } from "./internal/archive.js";
import { validateLayout } from "./internal/layout.js";
import { ArchiveInput } from "./Model.js";

export { ArchiveEntry, ArchiveInput, Format } from "./Model.js";
export type { Format as FormatType } from "./Model.js";

export type ArchiveError =
  | UnsafeArchiveLayout
  | ArchiveFailed
  | FileAuthor.FileVerificationFailed
  | FileAuthor.PublicationFailure;

interface Service {
  readonly archive: (input: ArchiveInput) => Effect.Effect<Artifact.HashedFile, ArchiveError>;
}

export class Archiver extends Context.Service<Archiver, Service>()(
  "effect-build-archives/Archive/Archiver",
) {}

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const makeService: Effect.Effect<
  Service,
  never,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> = Effect.gen(function*() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
    Context.add(Path.Path, path),
    Context.add(Crypto.Crypto, crypto),
  );

  const archive = Effect.fn("effect-build-archives.archive")(function*(candidate: ArchiveInput) {
    const input = yield* Schema.decodeUnknownEffect(ArchiveInput, { onExcessProperty: "error" })(candidate).pipe(
      Effect.mapError((error) => new ArchiveFailed({ operation: "decode input", reason: String(error) })),
    );
    const extension = input.format === "zip" ? ".zip" : ".tar.gz";
    if (!input.outfile.endsWith(extension)) {
      return yield* Effect.fail(
        new ArchiveFailed({
          operation: "validate input",
          reason: `${input.format} output must end with ${extension}`,
        }),
      );
    }
    const finalize = (entries: readonly Entry[]) =>
      Effect.gen(function*() {
        const validated = validateLayout(entries);
        if (validated._tag === "Invalid") return yield* Effect.fail(validated.error);
        const encoded = yield* Effect.try({
          try: () => input.format === "zip" ? encodeZip(validated.entries) : encodeTarGzip(validated.entries),
          catch: (error) => new ArchiveFailed({ operation: `encode ${input.format}`, reason: describe(error) }),
        });
        return yield* FileAuthor.publish(
          {
            destination: input.outfile,
            cwd: input.cwd,
            observation: "hashed",
            provenance: ArtifactAuthor.intrinsicProvenance("effect-build-archives"),
          },
          (stagedPath) =>
            fileSystem.writeFile(stagedPath, encoded).pipe(
              Effect.mapError((error) =>
                new ArchiveFailed({ operation: `write ${stagedPath}`, reason: describe(error) })
              ),
            ),
        );
      });
    const collect = (
      index: number,
      entries: readonly Entry[],
    ): Effect.Effect<Artifact.HashedFile, ArchiveError, Crypto.Crypto | FileSystem.FileSystem | Path.Path> => {
      const candidate = input.entries[index];
      if (candidate === undefined) return finalize(entries);
      return FileAuthor.withVerifiedBytes(candidate.artifact, (contents) =>
        collect(index + 1, [
          ...entries,
          {
            path: candidate.path,
            kind: "file" as const,
            mode: candidate.executable === true ? 0o755 : 0o644,
            contents,
          },
        ]));
    };
    return yield* collect(0, []);
  });

  return { archive: (input) => archive(input).pipe(Effect.provide(services)) };
});

export const archive = (
  input: ArchiveInput,
): Effect.Effect<Artifact.HashedFile, ArchiveError, Archiver> => Archiver.use((service) => service.archive(input));

export const layer: Layer.Layer<
  Archiver,
  never,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> = Layer.effect(Archiver, makeService);
