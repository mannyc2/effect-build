import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, FileSystem } from "effect";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Digest } from "../../packages/effect-build/src/Artifact.js";
import * as DirectoryGeneration from "../../packages/effect-build/src/Author/internal/DirectoryGeneration.js";

const run = <A>(effect: Effect.Effect<A, DirectoryGeneration.Failure, NodeServices.NodeServices>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

const runExit = <A>(
  effect: Effect.Effect<A, DirectoryGeneration.Failure, NodeServices.NodeServices>,
): Promise<Exit.Exit<A, DirectoryGeneration.Failure>> =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(NodeServices.layer)));

const errorOf = (exit: Exit.Exit<unknown, DirectoryGeneration.Failure>): DirectoryGeneration.Failure => {
  if (Exit.isSuccess(exit)) throw new Error("expected directory-generation failure");
  const option = Cause.findErrorOption(exit.cause);
  if (option._tag === "None") throw new Error("expected typed directory-generation failure");
  return option.value;
};

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

const workspace = async (): Promise<
  { readonly root: string; readonly provider: string; readonly publication: string }
> => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-generation-"));
  const provider = join(root, "provider");
  const publication = join(root, "publication");
  await mkdir(join(provider, "assets"), { recursive: true });
  return { root, provider, publication };
};

describe("package-private immutable directory generations", () => {
  it("seals canonical generations, pins old readers, and rolls current back without collection", async () => {
    const paths = await workspace();
    try {
      await writeFile(join(paths.provider, "index.js"), "export const version = 1;\n");
      await writeFile(join(paths.provider, "assets", "data.bin"), Uint8Array.of(0, 1, 2, 3));
      const first = await run(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
        mediaTypes: { "index.js": "text/javascript; charset=utf-8", "assets/data.bin": null },
      }));

      expect(first.protocol).toBe(DirectoryGeneration.directoryGenerationProtocol);
      expect(first.rootNavigation).toBeNull();
      expect(first.manifest.files.map(({ path }) => path)).toEqual(["assets/data.bin", "index.js"]);
      expect(await exists(join(first.generationRoot, "manifest.json"))).toBe(true);
      expect(await exists(join(first.treeRoot, "assets", "data.bin"))).toBe(true);
      const manifestText = await readFile(first.manifestPath, "utf8");
      expect(manifestText.endsWith("\n")).toBe(true);
      expect(Object.keys(JSON.parse(manifestText) as object)).toEqual(["protocol", "subject", "files"]);
      expect(first.generationName).toBe(`sha256-${first.manifestDigest.value}`);

      const firstFile = await run(DirectoryGeneration.read(first, "index.js"));
      expect(new TextDecoder().decode(firstFile.contents)).toBe("export const version = 1;\n");
      expect(firstFile.generationQualifiedPath).toBe(`generations/${first.generationName}/tree/index.js`);

      await writeFile(join(paths.provider, "index.js"), "export const version = 2;\n");
      const second = await run(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
        mediaTypes: { "index.js": "text/javascript; charset=utf-8", "assets/data.bin": null },
      }));
      expect(second.manifestDigest.value).not.toBe(first.manifestDigest.value);
      const stillPinnedFirst = await run(DirectoryGeneration.read(first, "index.js"));
      expect(new TextDecoder().decode(stillPinnedFirst.contents)).toContain("version = 1");
      expect((await run(DirectoryGeneration.pin({ publicationRoot: paths.publication }))).manifestDigest).toEqual(
        second.manifestDigest,
      );

      await run(DirectoryGeneration.activate({
        publicationRoot: paths.publication,
        manifestDigest: first.manifestDigest,
      }));
      const rolledBack = await run(DirectoryGeneration.pin({ publicationRoot: paths.publication }));
      expect(rolledBack.manifestDigest).toEqual(first.manifestDigest);
      expect(new TextDecoder().decode((await run(DirectoryGeneration.read(rolledBack, "index.js"))).contents))
        .toContain(
          "version = 1",
        );
      const generations = (await readdir(join(paths.publication, "generations"))).filter((name) =>
        name.startsWith("sha256-")
      );
      expect(generations.sort()).toEqual([first.generationName, second.generationName].sort());
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("rejects non-portable trees and noncanonical profile metadata before changing current", async () => {
    const paths = await workspace();
    try {
      await writeFile(join(paths.provider, "index.html"), "<!doctype html>\n");
      const baseline = await run(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
      }));
      const baselineCurrent = await readFile(join(paths.publication, "current.json"));

      await writeFile(join(paths.provider, "CON.txt"), "reserved\n");
      const reserved = await runExit(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
      }));
      expect(errorOf(reserved).reason).toContain("reserved Windows device");
      expect(await readFile(join(paths.publication, "current.json"))).toEqual(baselineCurrent);
      await rm(join(paths.provider, "CON.txt"));

      const missingMediaType = await runExit(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.staticBrowserSubject,
      }));
      expect(errorOf(missingMediaType).reason).toContain("requires a media type");
      expect(await readFile(join(paths.publication, "current.json"))).toEqual(baselineCurrent);

      const noncanonicalMediaType = await runExit(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.staticBrowserSubject,
        mediaTypes: { "index.html": "Text/HTML" },
      }));
      expect(errorOf(noncanonicalMediaType).reason).toContain("exact lowercase canonical");
      expect(await readFile(join(paths.publication, "current.json"))).toEqual(baselineCurrent);

      const browser = await run(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.staticBrowserSubject,
        mediaTypes: { "index.html": "text/html; charset=utf-8" },
      }));
      expect(browser.rootNavigation).toBe(`generations/${browser.generationName}/tree/index.html`);
      expect(baseline.generationName).not.toBe(browser.generationName);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects symbolic links instead of following provider aliases", async () => {
    const paths = await workspace();
    try {
      await writeFile(join(paths.provider, "target.js"), "export {};\n");
      await symlink(join(paths.provider, "target.js"), join(paths.provider, "alias.js"));
      const exit = await runExit(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
      }));
      expect(errorOf(exit).reason).toContain("symbolic links");
      expect(await exists(join(paths.publication, "current.json"))).toBe(false);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("rejects an early file that mutates while a later file is being captured", async () => {
    const paths = await workspace();
    try {
      const early = join(paths.provider, "a-early.txt");
      const later = join(paths.provider, "z-later.txt");
      await writeFile(early, "before\n");
      await writeFile(later, "later!\n");
      let mutated = false;
      const adversarial = Effect.gen(function*() {
        const fileSystem = yield* FileSystem.FileSystem;
        const intercepted: FileSystem.FileSystem = new Proxy(fileSystem, {
          get(target, property, receiver) {
            if (property !== "readFile") return Reflect.get(target, property, receiver) as unknown;
            return (candidate: string) => {
              if (!mutated && candidate.endsWith("/z-later.txt")) {
                mutated = true;
                return Effect.promise(() => writeFile(early, "after!\n")).pipe(
                  Effect.andThen(fileSystem.readFile(candidate)),
                );
              }
              return fileSystem.readFile(candidate);
            };
          },
        });
        return yield* DirectoryGeneration.seal({
          providerRoot: paths.provider,
          publicationRoot: paths.publication,
          subject: DirectoryGeneration.unprofiledSubject,
        }).pipe(Effect.provideService(FileSystem.FileSystem, intercepted));
      });

      const exit = await runExit(adversarial);
      expect(mutated).toBe(true);
      expect(errorOf(exit).reason).toContain("changed before sealing");
      expect(await exists(join(paths.publication, "current.json"))).toBe(false);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("rejects tampering, extra tree entries, unlisted paths, and forged reader authority", async () => {
    const paths = await workspace();
    try {
      await writeFile(join(paths.provider, "index.js"), "first\n");
      const pinned = await run(DirectoryGeneration.seal({
        providerRoot: paths.provider,
        publicationRoot: paths.publication,
        subject: DirectoryGeneration.unprofiledSubject,
      }));

      const unlisted = await runExit(DirectoryGeneration.read(pinned, "absent.js"));
      expect(errorOf(unlisted).reason).toContain("not listed");
      const forged = await runExit(DirectoryGeneration.read({ ...pinned }, "index.js"));
      expect(errorOf(forged).reason).toContain("forged");

      const canonicalCurrent = await readFile(join(paths.publication, "current.json"));
      await writeFile(
        join(paths.publication, "current.json"),
        `${
          JSON.stringify({
            protocol: DirectoryGeneration.currentGenerationProtocol,
            manifestDigest: pinned.manifestDigest,
            fallback: pinned.manifestDigest,
          })
        }\n`,
      );
      const unknownCurrentField = await runExit(DirectoryGeneration.pin({ publicationRoot: paths.publication }));
      expect(errorOf(unknownCurrentField).reason).toContain("unknown or missing fields");
      await writeFile(join(paths.publication, "current.json"), canonicalCurrent);

      const extra = join(pinned.treeRoot, "extra.js");
      await writeFile(extra, "extra\n");
      const extraExit = await runExit(DirectoryGeneration.pin({ publicationRoot: paths.publication }));
      expect(errorOf(extraExit).reason).toContain("exactly match");
      await rm(extra);

      await writeFile(join(pinned.treeRoot, "index.js"), "other\n");
      const changed = await runExit(DirectoryGeneration.read(pinned, "index.js"));
      expect(errorOf(changed).reason).toContain("do not match");
      const repin = await runExit(DirectoryGeneration.pin({ publicationRoot: paths.publication }));
      expect(errorOf(repin).reason).toContain("do not match");
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("rejects ASCII-case-insensitive manifest collisions before lending any file", async () => {
    const paths = await workspace();
    try {
      await mkdir(paths.publication, { recursive: true });
      const emptyDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const manifest = `${
        JSON.stringify({
          protocol: DirectoryGeneration.generationManifestProtocol,
          subject: DirectoryGeneration.unprofiledSubject,
          files: [
            { path: "Foo/a", bytes: "0", digest: { algorithm: "sha256", value: emptyDigest }, mediaType: null },
            { path: "foo/b", bytes: "0", digest: { algorithm: "sha256", value: emptyDigest }, mediaType: null },
          ],
        })
      }\n`;
      const manifestDigest = createHash("sha256").update(manifest).digest("hex");
      const generationRoot = join(paths.publication, "generations", `sha256-${manifestDigest}`);
      await mkdir(join(generationRoot, "tree"), { recursive: true });
      await writeFile(join(generationRoot, "manifest.json"), manifest);
      await writeFile(
        join(paths.publication, "current.json"),
        DirectoryGeneration.encodeCurrentReference(sha256Digest(manifestDigest)),
      );

      const exit = await runExit(DirectoryGeneration.pin({ publicationRoot: paths.publication }));
      expect(errorOf(exit).reason).toContain("ASCII-case-insensitive collision");
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });
});
