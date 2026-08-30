import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem, Schema } from "effect";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as File from "../../packages/effect-build/src/Author/File.js";
import * as Tree from "../../packages/effect-build/src/Author/Tree.js";

const roots: string[] = [];
const provenance = Artifact.intrinsicProvenance("effect-build/test-finalizer");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-finalizer-"));
  roots.push(root);
  return root;
};

const failure = (exit: Exit.Exit<unknown, unknown>): unknown => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  expect(found._tag).toBe("Some");
  return found._tag === "Some" ? found.value : undefined;
};

describe("durable file finalization and adoption", () => {
  it("recaptures before one commit, preserves exact provenance, and lends verified bytes", async () => {
    const root = await makeRoot();
    const destination = join(root, "artifact.bin");
    let inspectedBeforeCommit = false;
    const artifact = await Effect.runPromise(
      File.publish(
        { destination, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(candidate, "immutable-bytes")),
        (candidate) =>
          Effect.promise(async () => {
            inspectedBeforeCommit = await readFile(destination).then(() => false, () => true);
            expect(candidate.digest.value).toMatch(/^[0-9a-f]{64}$/u);
          }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(inspectedBeforeCommit).toBe(true);
    expect(artifact._tag).toBe("HashedFile");
    expect(Schema.decodeUnknownSync(Artifact.HashedFileSchema)(artifact)).toBe(artifact);
    expect(artifact.provenance).toBe(provenance);
    expect(artifact.publication).toEqual({
      scope: "file",
      commit: "same-parent-no-replace-link",
      committed: true,
    });
    const text = await Effect.runPromise(
      File.withVerifiedBytes(artifact, (bytes) => Effect.succeed(new TextDecoder().decode(bytes))).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(text).toBe("immutable-bytes");
    expect(Artifact.adoptFile("release/app.bin", artifact)).toEqual({
      protocol: "effect-build/artifact-adoption@1",
      kind: "file",
      logicalName: "release/app.bin",
      bytes: artifact.bytes,
      digest: artifact.digest,
    });
  });

  it("rejects inspector mutation and later durable-byte mutation", async () => {
    const root = await makeRoot();
    const destination = join(root, "changed.bin");
    const publishExit = await Effect.runPromiseExit(
      File.publish(
        { destination, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(candidate, "first")),
        (candidate) => Effect.promise(() => writeFile(candidate.path, "other")),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(publishExit)).toBeInstanceOf(File.FileCandidateChanged);
    await expect(readFile(destination)).rejects.toThrow();

    const artifact = await Effect.runPromise(
      File.publish(
        { destination, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(candidate, "first")),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    await writeFile(destination, "other");
    const verification = await Effect.runPromiseExit(
      File.withVerifiedBytes(artifact, () => Effect.void).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(verification)).toBeInstanceOf(File.FileVerificationFailed);
  });

  it("never replaces an existing destination", async () => {
    const root = await makeRoot();
    const destination = join(root, "owned.bin");
    await writeFile(destination, "caller-owned");

    const exit = await Effect.runPromiseExit(
      File.publish(
        { destination, observation: "hashed", provenance },
        () => Effect.die("producer must not run"),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(failure(exit)).toBeInstanceOf(File.FileDestinationLocked);
    expect(await readFile(destination, "utf8")).toBe("caller-owned");
  });

  it("loses a publication race without replacing the winner", async () => {
    const root = await makeRoot();
    const destination = join(root, "raced.bin");

    const exit = await Effect.runPromiseExit(
      File.publish(
        { destination, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(candidate, "candidate")),
        () => Effect.promise(() => writeFile(destination, "concurrent-winner")),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(failure(exit)).toBeInstanceOf(File.FileDestinationLocked);
    expect(await readFile(destination, "utf8")).toBe("concurrent-winner");
  });

  it("defers interruption through the indivisible no-replace link and rolls back an undelivered commit", async () => {
    const root = await makeRoot();
    const destination = join(root, "interrupted.bin");
    const nested = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const linkEntered = yield* Deferred.make<void>();
          const delayed = {
            ...fileSystem,
            link: (oldPath: string, newPath: string) =>
              Effect.gen(function*() {
                yield* Deferred.succeed(linkEntered, undefined);
                yield* Effect.sleep("30 millis");
                yield* fileSystem.link(oldPath, newPath);
              }),
          } satisfies FileSystem.FileSystem;
          const fiber = yield* File.publish(
            { destination, observation: "hashed", provenance },
            (candidate) => Effect.promise(() => writeFile(candidate, "committed-after-interrupt")),
          ).pipe(Effect.provideService(FileSystem.FileSystem, delayed), Effect.forkChild);
          yield* Deferred.await(linkEntered);
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(nested)).toBe(true);
    if (Exit.isFailure(nested)) expect(Cause.hasInterrupts(nested.cause)).toBe(true);
    await expect(readFile(destination, "utf8")).rejects.toThrow();
  });
});

describe.skipIf(process.platform === "win32")("durable tree finalization and adoption", () => {
  it("commits one symlink-aware exact tree and lends a private verified snapshot", async () => {
    const root = await makeRoot();
    const outdir = join(root, "bundle");
    const artifact = await Effect.runPromise(
      Tree.publish(
        { outdir, observation: "hashed", provenance },
        (candidate) =>
          Effect.promise(async () => {
            await mkdir(join(candidate, "bin"));
            await writeFile(join(candidate, "bin", "app"), "tree-bytes");
            await chmod(join(candidate, "bin", "app"), 0o755);
            await symlink("bin/app", join(candidate, "current"));
          }),
        (candidate) =>
          Effect.sync(() => {
            expect(candidate.entries.map((entry) => entry.kind)).toEqual(["directory", "file", "symbolic-link"]);
          }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(artifact._tag).toBe("HashedTree");
    expect(Schema.decodeUnknownSync(Artifact.HashedTreeSchema)(artifact)).toBe(artifact);
    expect(artifact.provenance).toBe(provenance);
    expect(artifact.manifestDigest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(artifact.publication).toEqual({ scope: "tree", commit: "same-parent-rename", committed: true });
    const projected = await Effect.runPromise(
      Tree.projectFile(artifact, "bin/app").pipe(Effect.provide(NodeServices.layer)),
    );
    expect(projected).toMatchObject({
      _tag: "HashedFile",
      path: join(artifact.root, "bin", "app"),
      provenance,
      publication: {
        scope: "tree-file-projection",
        commit: "same-parent-rename",
        committed: true,
        treeRoot: artifact.root,
        relativePath: "bin/app",
        treeManifestDigest: artifact.manifestDigest,
      },
    });
    const projectedEntry = artifact.entries.find(
      (entry): entry is Artifact.HashedTreeFileEntry => entry.kind === "file" && entry.relativePath === "bin/app",
    );
    expect(projected.digest.value).toBe(projectedEntry?.digest.value);
    const snapshot = await Effect.runPromise(
      Tree.withVerifiedSnapshot(artifact, (privateRoot) =>
        Effect.promise(async () => ({
          bytes: await readFile(join(privateRoot, "bin", "app"), "utf8"),
          link: await readlink(join(privateRoot, "current")),
          privateRoot,
        }))).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(snapshot.bytes).toBe("tree-bytes");
    expect(snapshot.link).toBe("bin/app");
    await expect(readFile(join(snapshot.privateRoot, "bin", "app"))).rejects.toThrow();
    expect(Artifact.adoptTree("release/app-tree", artifact)).toEqual({
      protocol: "effect-build/artifact-adoption@1",
      kind: "tree",
      logicalName: "release/app-tree",
      totalBytes: artifact.totalBytes,
      manifestDigest: artifact.manifestDigest,
    });
  });

  it("rejects inspector mutation, existing destinations, and later tree mutation", async () => {
    const root = await makeRoot();
    const changed = join(root, "changed");
    const changedExit = await Effect.runPromiseExit(
      Tree.publish(
        { outdir: changed, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(join(candidate, "entry"), "first")),
        (candidate) => Effect.promise(() => writeFile(join(candidate.root, "entry"), "other")),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(changedExit)).toBeInstanceOf(Tree.TreeCandidateChanged);
    await expect(readFile(join(changed, "entry"))).rejects.toThrow();

    await mkdir(changed);
    const existingExit = await Effect.runPromiseExit(
      Tree.publish(
        { outdir: changed, observation: "hashed", provenance },
        () => Effect.die("producer must not run"),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(existingExit)).toBeInstanceOf(Tree.TreeDestinationLocked);
    await rm(changed, { recursive: true });

    const raced = join(root, "raced-tree");
    const racedExit = await Effect.runPromiseExit(
      Tree.publish(
        { outdir: raced, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(join(candidate, "entry"), "candidate")),
        () => Effect.promise(() => mkdir(raced)),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(racedExit)).toBeInstanceOf(Tree.TreeDestinationLocked);
    expect((await stat(raced)).isDirectory()).toBe(true);
    await rm(raced, { recursive: true });

    const artifact = await Effect.runPromise(
      Tree.publish(
        { outdir: changed, observation: "hashed", provenance },
        (candidate) => Effect.promise(() => writeFile(join(candidate, "entry"), "first")),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    await writeFile(join(changed, "entry"), "other");
    const verification = await Effect.runPromiseExit(
      Tree.withVerifiedSnapshot(artifact, () => Effect.void).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(verification)).toBeInstanceOf(Tree.TreeVerificationFailed);
  });

  it("defers interruption through one directory rename and rolls back an undelivered generation", async () => {
    const root = await makeRoot();
    const outdir = join(root, "interrupted-tree");
    const nested = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const renameEntered = yield* Deferred.make<void>();
          const delayed = {
            ...fileSystem,
            rename: (oldPath: string, newPath: string) =>
              Effect.gen(function*() {
                yield* Deferred.succeed(renameEntered, undefined);
                yield* Effect.sleep("30 millis");
                yield* fileSystem.rename(oldPath, newPath);
              }),
          } satisfies FileSystem.FileSystem;
          const fiber = yield* Tree.publish(
            { outdir, observation: "hashed", provenance },
            (candidate) => Effect.promise(() => writeFile(join(candidate, "entry"), "complete-tree")),
          ).pipe(Effect.provideService(FileSystem.FileSystem, delayed), Effect.forkChild);
          yield* Deferred.await(renameEntered);
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(nested)).toBe(true);
    if (Exit.isFailure(nested)) expect(Cause.hasInterrupts(nested.cause)).toBe(true);
    await expect(readFile(join(outdir, "entry"), "utf8")).rejects.toThrow();
  });
});
