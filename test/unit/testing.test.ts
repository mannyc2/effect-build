import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Context, Deferred, Effect, Fiber, FileSystem, Path, PlatformError } from "effect";
import { Artifact, Cache, Target, Tool } from "effect-build";
import {
  expectNoStagingLeft,
  expectReproducible,
  TestArtifact,
  TestCache,
  TestFileSystem,
  TestPlatform,
  TestSpawner,
  TestTool,
} from "effect-build/testing";
import { KeyValueStore } from "effect/unstable/persistence";
import { ChildProcess } from "effect/unstable/process";
import { describe, expect, it } from "vitest";

const run = <A, E>(program: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));

describe("public testing fixtures", () => {
  it.each(Target.all)(
    "writes a verified executable for %s",
    async (target) =>
      run(Effect.scoped(Effect.gen(function*() {
        const artifact = yield* TestArtifact.executable(target).pipe(Effect.flatMap(Artifact.withSha256));
        expect(artifact.target).toBe(target);
        expect(artifact.format).toBe(Target.parts(target).format);
        expect(yield* Artifact.verify(artifact)).toEqual(artifact);
      }))),
  );

  it.each(["darwin-x64", "darwin-arm64"] as const)(
    "writes a fat executable for %s",
    async (target) =>
      run(Effect.scoped(Effect.gen(function*() {
        const artifact = yield* TestArtifact.executable(target, { fat: true }).pipe(Effect.flatMap(Artifact.withSha256));
        expect(artifact.target).toBe(target);
        expect(yield* Artifact.verify(artifact)).toEqual(artifact);
      }))),
  );

  it("records stable sorted trees and cleans real fixtures at scope exit", async () =>
    run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const roots = yield* Effect.scoped(Effect.gen(function*() {
        const first = yield* TestArtifact.tree({ "z.txt": "last", "folder/a.txt": "first" }).pipe(Effect.flatMap(Artifact.withSha256));
        const second = yield* TestArtifact.tree({ "folder/a.txt": "first", "z.txt": "last" }).pipe(Effect.flatMap(Artifact.withSha256));
        expect(first.entries.map((entry) => entry.path)).toEqual(["folder", "folder/a.txt", "z.txt"]);
        expect(first.sha256).toBe(second.sha256);
        if (process.platform !== "win32") expect(first.rootMode).toBe(0o755);
        expect(yield* Artifact.verify(first)).toEqual(first);
        const file = yield* TestArtifact.file("bytes", "nested/file");
        expect(yield* fs.readFileString(file.path)).toBe("bytes");
        return [first.path, second.path, file.path];
      }));
      for (const path of roots) expect(yield* fs.exists(path)).toBe(false);
    })));

  it.skipIf(process.platform === "win32")(
    "preserves tree symlinks without following them",
    async () =>
      run(Effect.scoped(Effect.gen(function*() {
        const tree = yield* TestArtifact.tree({ file: "contents", alias: { link: "file" } }).pipe(Effect.flatMap(Artifact.withSha256));
        expect(tree.entries[0]).toMatchObject({ path: "alias", kind: "symlink", linkTarget: "file" });
        expect(yield* Artifact.verify(tree)).toEqual(tree);
      }))),
  );

  it("rejects fixture paths that escape or descend through a symlink", async () =>
    run(Effect.scoped(Effect.gen(function*() {
      expect(yield* TestArtifact.file("bytes", "../outside").pipe(Effect.flip)).toMatchObject({
        reason: "invalid-metadata",
      });
      expect(yield* TestArtifact.tree({ alias: { link: "../outside" }, "alias/file": "bytes" }).pipe(Effect.flip))
        .toMatchObject({ reason: "invalid-metadata" });
    }))));

  it("copies and verifies real host executable bytes", async () =>
    run(Effect.scoped(Effect.gen(function*() {
      const host = yield* TestArtifact.host().pipe(Effect.flatMap(Artifact.withSha256));
      const original = yield* Artifact.executable(process.execPath, host.producedBy).pipe(Effect.flatMap(Artifact.withSha256));
      expect(host.sha256).toBe(original.sha256);
      expect(host.target).toBe(original.target);
    }))), 30_000);

  it("resolves a real placeholder through the public provider layer", async () => {
    class Fixture extends Context.Service<Fixture, Tool.Service>()("testing/Fixture") {}
    const provider = Tool.provider(Fixture, {
      name: "fixture",
      version: { supported: ">=2.0.0 <3.0.0", tested: ["2.0.0"] },
    });
    await run(Effect.scoped(Effect.gen(function*() {
      const fixture = yield* TestTool.installed("fixture", "2.0.0");
      const resolved = yield* provider.resolved.pipe(
        Effect.provide(provider.layer({ executable: fixture.executable })),
        Effect.provide(fixture.spawner),
      );
      expect(resolved).toMatchObject({ version: "2.0.0", name: "fixture" });
      expect(resolved).not.toHaveProperty("sha256");
      expect((yield* Tool.withSha256(resolved)).sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(resolved.bytes).toBeGreaterThan(0);
    })));
  });
});

describe("scripted processes", () => {
  it("records arguments and environment while a script uses its declared services to write real files", async () => {
    class Contents extends Context.Service<Contents, string>()("testing/Contents") {}
    const fake = TestSpawner.layer((call) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(path.join(call.cwd, call.args[0]!), yield* Contents);
        return { stdout: "hello", stderr: new TextEncoder().encode("warning") };
      })
    );
    await run(
      Effect.scoped(Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const completion = yield* Tool.run(TestTool.resolved("fixture", "1.0.0"), ["file with spaces"], {
          cwd: root,
          env: { ONLY: "value" },
          extendEnv: false,
        });
        expect(new TextDecoder().decode(completion.stdout)).toBe("hello");
        expect(new TextDecoder().decode(completion.stderr)).toBe("warning");
        expect(yield* fs.readFileString(path.join(root, "file with spaces"))).toBe("written by script");
        const calls = yield* TestSpawner.Calls;
        const snapshot = yield* calls.all;
        expect(snapshot).toHaveLength(1);
        expect(snapshot[0]).toMatchObject({ args: ["file with spaces"], cwd: path.resolve(root), env: { ONLY: "value" } });
        yield* Tool.run(TestTool.resolved("fixture", "1.0.0"), ["next"], { cwd: root });
        expect(snapshot).toHaveLength(1);
        expect(yield* calls.all).toHaveLength(2);
      })).pipe(Effect.provide(fake), Effect.provideService(Contents, "written by script")),
    );
  });

  it("returns nonzero completion as the normal Tool failure", async () => {
    const failure = await run(
      Tool.run(TestTool.resolved("fixture", "1.0.0"), ["build"]).pipe(
        Effect.provide(TestSpawner.layer(() => Effect.succeed({ exitCode: 37, stdout: "partial", stderr: "failed" }))),
        Effect.flip,
      ),
    );
    expect(failure).toMatchObject({ _tag: "ToolFailed", exitCode: 37, stdout: "partial", stderr: "failed" });
    expect(String(failure)).toBe(`${failure._tag}: ${failure.message}`);
  });

  it("closes resources requested by the script when the process completes", async () => {
    let directory = "";
    const fake = TestSpawner.layer(() => Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      directory = yield* fs.makeTempDirectoryScoped();
      expect(yield* fs.exists(directory)).toBe(true);
      return {};
    }));
    await run(Effect.gen(function*() {
      yield* Tool.run(TestTool.resolved("fixture", "1.0.0"), []);
      const fs = yield* FileSystem.FileSystem;
      expect(directory).not.toBe("");
      expect(yield* fs.exists(directory)).toBe(false);
    }).pipe(Effect.provide(fake)));
  });

  it("interrupts a running script when its process scope closes", async () =>
    run(Effect.gen(function*() {
      const entered = yield* Deferred.make<void>();
      let finalized = false;
      const fake = TestSpawner.layer(() =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Effect.sync(() => {
            finalized = true;
          })),
        )
      );
      yield* Effect.scoped(Effect.gen(function*() {
        const fiber = yield* Tool.run(TestTool.resolved("fixture", "1.0.0"), []).pipe(Effect.forkScoped);
        yield* Deferred.await(entered);
        yield* Fiber.interrupt(fiber);
      })).pipe(Effect.provide(fake));
      expect(finalized).toBe(true);
    })));

  it("models inherited and replaced process environments", async () => {
    await run(
      Effect.scoped(Effect.gen(function*() {
        yield* ChildProcess.make("fixture", [], { env: { TESTING: "yes" }, extendEnv: true });
        yield* ChildProcess.make("fixture", [], { env: { TESTING: "only", PATH: undefined } });
        const calls = yield* (yield* TestSpawner.Calls).all;
        expect(calls[0]!.env).toMatchObject({
          ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
          TESTING: "yes",
        });
        expect(calls[1]!.env).toEqual({ TESTING: "only" });
      })).pipe(Effect.provide(TestSpawner.layer(() => Effect.succeed({})))),
    );
  });
});

describe("filesystem faults and assertions", () => {
  it("fails only the selected invocations and resets counters for a fresh layer build", async () => {
    const faults = TestFileSystem.failing({ chmod: [{ call: 2 }, { call: 4, error: "fourth chmod" }] });
    const exercise = Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      return yield* Effect.forEach([1, 2, 3, 4, 5], () => fs.chmod(root, 0o755).pipe(Effect.exit));
    })).pipe(Effect.provide(faults));
    for (let i = 0; i < 2; i++) {
      expect((await run(exercise)).map((exit) => exit._tag)).toEqual([
        "Success",
        "Failure",
        "Success",
        "Failure",
        "Success",
      ]);
    }
  });

  it("preserves a producer failure and reports a staging leak after failure", async () =>
    run(Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      expect(yield* Effect.fail("build failed").pipe(expectNoStagingLeft(root), Effect.flip)).toBe("build failed");
      yield* fs.makeDirectory(path.join(root, ".effect-build-leaked"));
      const failure = yield* Effect.fail("build failed").pipe(expectNoStagingLeft(root), Effect.flip);
      expect(failure).toMatchObject({ _tag: "StagingLeaked", entries: [".effect-build-leaked"] });
      expect(String(failure)).toContain("StagingLeaked: staging remains");
    }))));

  it("compares content across two destinations and rejects different bytes", async () =>
    run(Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const produce = (path: string, contents: string) =>
        fs.writeFileString(path, contents).pipe(
          Effect.andThen(Artifact.file(path, { name: "fixture", version: "1.0.0" })),
        );
      const result = yield* expectReproducible((path) => produce(path, "same"));
      expect(yield* Artifact.withSha256(result).pipe(Effect.flatMap(Artifact.verify), Effect.as(result))).toEqual(result);
      let count = 0;
      expect(yield* expectReproducible((path) => produce(path, String(count++))).pipe(Effect.flip)).toMatchObject({
        _tag: "ReproducibilityFailure",
      });
    }))));

  it("supplies a fresh cache index and removes the object directory with its scope", async () =>
    run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* Effect.scoped(Effect.gen(function*() {
        const layer = yield* TestCache.layer;
        return yield* Effect.gen(function*() {
          const index = yield* KeyValueStore.KeyValueStore;
          const objects = yield* Cache.Objects;
          yield* index.set("key", "value");
          expect(yield* index.get("key")).toBe("value");
          expect(yield* fs.exists(objects.directory)).toBe(true);
          return objects.directory;
        }).pipe(Effect.provide(layer));
      }));
      expect(yield* fs.exists(directory)).toBe(false);
    })));

  it.each([[TestPlatform.win32, "C:\\tools\\build.exe", "\\"], [TestPlatform.posix, "/tools/build.exe", "/"]] as const)(
    "supplies independent path semantics %#",
    async (layer, filename, sep) => {
      const facts = await Effect.runPromise(
        Effect.gen(function*() {
          const path = yield* Path.Path;
          return { basename: path.basename(filename), sep: path.sep };
        }).pipe(Effect.provide(layer)),
      );
      expect(facts).toEqual({ basename: "build.exe", sep });
    },
  );

  it("uses Windows .exe lookup and semicolon-separated Path on every host", async () =>
    run(Effect.scoped(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const placeholder = yield* TestArtifact.file("tool");
      const found = "C:\\tools\\fixture.exe";
      const attempts: string[] = [];
      const located = yield* Tool.locate({ name: "fixture" }).pipe(
        Effect.provide(TestPlatform.win32),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ Path: "C:\\missing;C:\\tools" }),
        ),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          stat: (path) => {
            attempts.push(path);
            return path === found
              ? fs.stat(placeholder.path)
              : Effect.fail(
                PlatformError.systemError({
                  _tag: "NotFound",
                  module: "FileSystem",
                  method: "stat",
                  pathOrDescriptor: path,
                }),
              );
          },
          realPath: (path) => Effect.succeed(path),
        }),
      );
      expect(located).toBe(found);
      expect(attempts).toContain("C:\\missing\\fixture.exe");
      expect(attempts.at(-1)).toBe(found);
    }))));
});
