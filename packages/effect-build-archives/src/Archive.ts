import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type * as Artifact from "effect-build/Artifact";
import type { ArtifactVerificationFailed, PublishFailed } from "effect-build/BuildError";
import * as Toolchain from "effect-build/Toolchain";
import { ArchiveFailed, type UnsafeArchiveLayout } from "./ArchiveError.js";
import { encodeTarGzip, encodeZip, type Entry } from "./internal/archive.js";
import { validateLayout } from "./internal/layout.js";
import { ArchiveInput } from "./Model.js";

export { ArchiveEntry, ArchiveInput, Format } from "./Model.js";
export type { Format as FormatType } from "./Model.js";

export type ArchiveError = UnsafeArchiveLayout | ArchiveFailed | ArtifactVerificationFailed | PublishFailed;

interface Service {
  readonly archive: (input: ArchiveInput) => Effect.Effect<Artifact.FileArtifact, ArchiveError>;
}

export class Archiver extends Context.Service<Archiver, Service>()(
  "effect-build-archives/Archive/Archiver",
) {}

const describe = (error: unknown): string => error instanceof Error ? error.message : String(error);

const tool: Artifact.Tool = { name: "effect-build-archives", version: "1" };

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
    const entries: Entry[] = [];
    for (const candidate of input.entries) {
      const contents = yield* Toolchain.readVerifiedFile(candidate.artifact).pipe(Effect.provide(services));
      entries.push({
        path: candidate.path,
        kind: "file",
        mode: candidate.executable === true ? 0o755 : 0o644,
        contents,
      });
    }
    const validated = validateLayout(entries);
    if (validated._tag === "Invalid") return yield* Effect.fail(validated.error);
    const encoded = yield* Effect.try({
      try: () => input.format === "zip" ? encodeZip(validated.entries) : encodeTarGzip(validated.entries),
      catch: (error) => new ArchiveFailed({ operation: `encode ${input.format}`, reason: describe(error) }),
    });
    return yield* Toolchain.publishFile({
      tool,
      outfile: input.outfile,
      cwd: input.cwd,
      produce: (stagedPath) =>
        fileSystem.writeFile(stagedPath, encoded).pipe(
          Effect.mapError((error) => new ArchiveFailed({ operation: `write ${stagedPath}`, reason: describe(error) })),
        ),
    }).pipe(Effect.provide(services));
  });

  return { archive };
});

export const archive = (
  input: ArchiveInput,
): Effect.Effect<Artifact.FileArtifact, ArchiveError, Archiver> => Archiver.use((service) => service.archive(input));

export const layer: Layer.Layer<
  Archiver,
  never,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> = Layer.effect(Archiver, makeService);
