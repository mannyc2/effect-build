import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const producer = { name: "fixture", version: "0.7.0" };
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "effect-build-artifact-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("artifacts from real files", () => {
  it("reads verified bytes and round-trips a JSON manifest", async () => {
    const path = join(root, "hello.txt");
    const contents = "hello π\n";
    await writeFile(path, contents);
    const file = await run(Artifact.file(path, producer));
    expect(file.bytes).toBe(Buffer.byteLength(contents));
    expect(file.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    expect(new TextDecoder().decode(await run(Artifact.readVerified(file)))).toBe(contents);
    expect(await run(Artifact.verify(file))).toBe(file);
    const json: unknown = JSON.parse(JSON.stringify(Artifact.encode([file])));
    const decoded = Artifact.decode(json);
    expect(decoded).toEqual([file]);
    expect(await run(Artifact.verify(decoded[0]!))).toEqual(file);
  });

  it("rejects changed bytes even when the file length stays the same", async () => {
    const path = join(root, "app.txt");
    await writeFile(path, "before");
    const file = await run(Artifact.file(path, producer));
    await writeFile(path, "after!");
    const failures = await Promise.all([
      run(Artifact.verify(file).pipe(Effect.flip)),
      run(Artifact.readVerified(file).pipe(Effect.flip)),
    ]);
    for (const failure of failures) {
      expect(failure).toMatchObject({
        _tag: "ArtifactError", path, reason: "changed",
      });
    }
  });

  it("reports a missing path and a directory used as a regular file", async () => {
    const missing = join(root, "missing");
    expect(await run(Artifact.file(missing, producer).pipe(Effect.flip))).toMatchObject({
      path: missing, reason: "not-found",
    });
    expect(await run(Artifact.file(root, producer).pipe(Effect.flip))).toMatchObject({
      path: root, reason: "not-a-file",
    });
  });
});

describe("directory manifests", () => {
  it("sorts nested entries and produces the same digest across repeated reads", async () => {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.txt"), "last");
    await writeFile(join(root, "nested", "b.txt"), "inside");
    await writeFile(join(root, "a.txt"), "first");
    const first = await run(Artifact.directory(root, producer));
    const second = await run(Artifact.directory(root, producer));
    expect(first.entries.map((entry) => entry.path)).toEqual(["a.txt", "nested", "nested/b.txt", "z.txt"]);
    expect(first.bytes).toBe(15);
    expect(second).toEqual(first);
    expect(await run(Artifact.verify(first))).toBe(first);
    await writeFile(join(root, "nested", "b.txt"), "edited");
    expect(await run(Artifact.verify(first).pipe(Effect.flip))).toMatchObject({ reason: "changed" });
  });

  it("records a directory symlink without including or following its target", async () => {
    const tree = join(root, "tree");
    const outside = join(root, "outside");
    const link = join(tree, "linked");
    await mkdir(tree);
    await mkdir(outside);
    await writeFile(join(tree, "local.txt"), "local");
    await writeFile(join(outside, "secret.txt"), "outside contents");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const first = await run(Artifact.directory(tree, producer));
    expect(first.entries.map((entry) => entry.path)).toEqual(["linked", "local.txt"]);
    expect(first.entries[0]).toMatchObject({
      path: "linked", kind: "symlink", bytes: 0, linkTarget: await readlink(link),
    });
    expect(first.bytes).toBe(5);
    await writeFile(join(outside, "secret.txt"), "changed outside the tree");
    expect(await run(Artifact.directory(tree, producer))).toEqual(first);
  });

  it("records a dangling symlink without trying to read its missing target", async () => {
    const link = join(root, "missing-link");
    await symlink(join(root, "absent"), link, process.platform === "win32" ? "junction" : "dir");
    const artifact = await run(Artifact.directory(root, producer));
    expect(artifact.entries).toHaveLength(1);
    expect(artifact.entries[0]).toMatchObject({
      path: "missing-link", kind: "symlink", bytes: 0, linkTarget: await readlink(link),
    });
    expect(artifact.bytes).toBe(0);
  });
});
