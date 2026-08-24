import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as BorrowedContent from "../../packages/effect-build/src/Author/BorrowedContent.js";
import * as Generation from "../../packages/effect-build/src/Author/Generation.js";
import * as TreeSnapshot from "../../packages/effect-build/src/Author/TreeSnapshot.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Immutable generations", () => {
  it("emits the frozen canonical static-browser manifest bytes", async () => {
    const source = await makeRoot();
    const generations = await makeRoot();
    await mkdir(join(source, "assets"));
    await writeFile(join(source, "assets", "app.js"), "");
    await writeFile(join(source, "index.html"), "");
    const snapshot = await Effect.runPromise(TreeSnapshot.observe(source).pipe(Effect.provide(NodeServices.layer)));
    const generation = await Effect.runPromise(
      Generation.publish({
        generationRoot: generations,
        snapshot,
        subject: {
          profile: "effect-build/profile/static-browser-application@1",
          entry: "index.html",
          mount: "relative-same-origin",
          host: "effect-build/generated-module-host@1",
        },
        mediaTypes: {
          "assets/app.js": "text/javascript; charset=utf-8",
          "index.html": "text/html; charset=utf-8",
        },
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(generation.manifestDigest.value).toBe("211ead14e221092d32c78fd7c992d27aeb54753a837a89d1ac3b063d0aa28a3a");
  });

  it("seals authenticated bytes, activates once, and resolves the pinned generation", async () => {
    const source = await makeRoot();
    const generations = await makeRoot();
    await mkdir(join(source, "assets"));
    await writeFile(join(source, "index.html"), "<script type=module src=assets/app.js></script>");
    await writeFile(join(source, "assets", "app.js"), "export const version = 1;");
    const snapshot = await Effect.runPromise(TreeSnapshot.observe(source).pipe(Effect.provide(NodeServices.layer)));
    const generation = await Effect.runPromise(
      Generation.publish({
        generationRoot: generations,
        snapshot,
        subject: { profile: "effect-build/generation-subject/tree@1" },
        mediaTypes: {
          "index.html": "text/html; charset=utf-8",
          "assets/app.js": "text/javascript; charset=utf-8",
        },
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(generation.root).toContain(`sha256-${generation.manifestDigest.value}`);
    expect(await readFile(join(generation.tree, "assets", "app.js"), "utf8")).toContain("version = 1");

    const activated = await Effect.runPromise(
      Generation.activate({ generation, expectedCurrent: null }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(activated.manifestDigest).toEqual(generation.manifestDigest);
    const resolved = await Effect.runPromise(
      Generation.resolveCurrent(generations).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(resolved.manifestDigest).toEqual(generation.manifestDigest);
  });

  it("rejects source mutation and stale expected-current activation", async () => {
    const source = await makeRoot();
    const generations = await makeRoot();
    const input = join(source, "entry.js");
    await writeFile(input, "first");
    const staleSnapshot = await Effect.runPromise(
      TreeSnapshot.observe(source).pipe(Effect.provide(NodeServices.layer)),
    );
    await writeFile(input, "other");
    const staleSeal = await run(
      Generation.publish({
        generationRoot: generations,
        snapshot: staleSnapshot,
        subject: { profile: "effect-build/generation-subject/tree@1" },
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(staleSeal)).toBe(true);

    const freshSnapshot = await Effect.runPromise(
      TreeSnapshot.observe(source).pipe(Effect.provide(NodeServices.layer)),
    );
    const first = await Effect.runPromise(
      Generation.publish({
        generationRoot: generations,
        snapshot: freshSnapshot,
        subject: { profile: "effect-build/generation-subject/tree@1" },
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    await Effect.runPromise(
      Generation.activate({ generation: first, expectedCurrent: null }).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );

    await writeFile(input, "third");
    const nextSnapshot = await Effect.runPromise(
      TreeSnapshot.observe(source).pipe(Effect.provide(NodeServices.layer)),
    );
    const next = await Effect.runPromise(
      Generation.publish({
        generationRoot: generations,
        snapshot: nextSnapshot,
        subject: { profile: "effect-build/generation-subject/tree@1" },
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    const conflict = await run(
      Generation.activate({ generation: next, expectedCurrent: null }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(conflict)).toBe(true);
    const stillFirst = await Effect.runPromise(
      Generation.resolveCurrent(generations).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(stillFirst.manifestDigest).toEqual(first.manifestDigest);
  });
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-author-"));
  roots.push(root);
  return root;
};

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(effect);

describe("Author content authentication", () => {
  it("detects a same-size file mutation after borrowing", async () => {
    const root = await makeRoot();
    const file = join(root, "input.js");
    await writeFile(file, "first");
    const borrowed = await Effect.runPromise(
      BorrowedContent.observeFile(file).pipe(Effect.provide(NodeServices.layer)),
    );
    await writeFile(file, "other");
    const exit = await run(BorrowedContent.revalidate(borrowed).pipe(Effect.provide(NodeServices.layer)));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("rejects symbolic-link aliases before lending file authority", async () => {
    const root = await makeRoot();
    const target = join(root, "target.js");
    const alias = join(root, "alias.js");
    await writeFile(target, "export {};");
    await symlink(target, alias);
    const exit = await run(BorrowedContent.observeFile(alias).pipe(Effect.provide(NodeServices.layer)));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("observes a canonical, authenticated tree and rejects forbidden entries", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "z.js"), "z");
    await writeFile(join(root, "assets", "a.css"), "a");
    const snapshot = await Effect.runPromise(
      TreeSnapshot.observe(root).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(snapshot.files.map(({ relativePath }) => relativePath)).toEqual(["assets/a.css", "z.js"]);
    expect(snapshot.files.every(({ digest }) => /^[0-9a-f]{64}$/u.test(digest.value))).toBe(true);

    const invalidRoot = await makeRoot();
    await writeFile(join(invalidRoot, "CON.txt"), "reserved");
    const invalid = await run(TreeSnapshot.observe(invalidRoot).pipe(Effect.provide(NodeServices.layer)));
    expect(Exit.isFailure(invalid)).toBe(true);
  });
});
