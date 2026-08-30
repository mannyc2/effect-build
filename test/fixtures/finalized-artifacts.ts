import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as FileAuthor from "effect-build/Author/File";
import * as TreeAuthor from "effect-build/Author/Tree";
import { copyFile, cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const provenance = Artifact.intrinsicProvenance("effect-build-test-fixture");

/** Test-only finalizer for one exact durable source file. */
export const finalizedFile = async (source: string): Promise<FileAuthor.Artifact> => {
  const holder = await mkdtemp(join(tmpdir(), "effect-build-finalized-file-"));
  const program = FileAuthor.publish(
    {
      destination: join(holder, basename(resolve(source))),
      observation: "hashed",
      provenance,
    },
    (candidate) => Effect.tryPromise(() => copyFile(source, candidate)),
  ).pipe(Effect.provide(NodeServices.layer));
  return Effect.runPromise(program as Effect.Effect<FileAuthor.Artifact, unknown>);
};

/** Test-only finalizer for one exact durable directory tree. */
export const finalizedTree = async (directory: string): Promise<Artifact.HashedTree> => {
  const holder = await mkdtemp(join(tmpdir(), "effect-build-finalized-tree-"));
  const program = TreeAuthor.publish(
    {
      outdir: join(holder, "tree"),
      observation: "hashed",
      provenance,
    },
    (candidate) => Effect.tryPromise(() => cp(directory, candidate, { recursive: true, force: false })),
  ).pipe(Effect.provide(NodeServices.layer));
  return Effect.runPromise(program as Effect.Effect<Artifact.HashedTree, unknown>);
};
