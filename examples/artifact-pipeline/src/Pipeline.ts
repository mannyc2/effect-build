import { Effect, FileSystem, Path, Schema } from "effect";
import * as Archive from "effect-build-archives/Archive";
import { Build } from "effect-build-esbuild/Api";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import { fileURLToPath } from "node:url";

class UnexpectedBundleOutput extends Schema.TaggedError<UnexpectedBundleOutput>()("UnexpectedBundleOutput", {
  count: Schema.Number,
}) {}

// This identifies our file producer. An in-process esbuild result does not
// contain the authenticated selected-tool observation of a Command operation.
const provenance = Artifact.intrinsicProvenance("example-inventory-distribution");
const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));

export const prepareReport = (directory: string) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const result = yield* Build.build({
      absWorkingDir: appDirectory,
      entryPoints: ["report.ts"],
      outfile: "report.mjs",
      bundle: true,
      platform: "node",
      format: "esm",
      minify: true,
      write: false,
    });
    const [output] = result.outputFiles;
    if (output === undefined || result.outputFiles.length !== 1) {
      return yield* new UnexpectedBundleOutput({ count: result.outputFiles.length });
    }

    // Native outputFiles are caller-owned bytes. File.publish creates the
    // durable identity that another producer can verify and consume.
    const bundle = yield* File.publish(
      { destination: path.join(directory, "report.mjs"), observation: "hashed", provenance },
      (candidate) => fileSystem.writeFile(candidate, output.contents),
    );
    const instructions = yield* File.publish(
      { destination: path.join(directory, "USAGE.txt"), observation: "hashed", provenance },
      (candidate) =>
        fileSystem.writeFileString(candidate, "Run node report.mjs to print the bundled inventory summary.\n"),
    );
    return { bundle, instructions };
  });

export const archiveReport = (
  files: { readonly bundle: Artifact.HashedFile; readonly instructions: Artifact.HashedFile },
  outfile: string,
) =>
  Archive.archive(
    new Archive.ArchiveInput({
      format: "zip",
      entries: [
        new Archive.ArchiveEntry({ artifact: files.bundle, path: "inventory/report.mjs" }),
        new Archive.ArchiveEntry({ artifact: files.instructions, path: "inventory/USAGE.txt" }),
      ],
      outfile,
    }),
  );

export const buildDistribution = (directory: string) =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const files = yield* prepareReport(directory);
    // Archive revalidates each file's bytes before encoding. These steps are
    // separate commits: a later failure does not roll back an earlier file.
    const archive = yield* archiveReport(files, path.join(directory, "inventory.zip"));

    // A real consumer could upload these verified bytes here. This example
    // only creates the identity a release owner can adopt; it sends nothing.
    const adoption = yield* File.withVerifiedBytes(archive, () =>
      Effect.succeed(Artifact.adoptFile("inventory.zip", archive)));
    return { ...files, archive, adoption };
  });
