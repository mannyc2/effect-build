import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Fiber, FileSystem, Path, PlatformError, Schema } from "effect";
import * as Atomic from "../../packages/effect-build/src/Atomic.ts";
import * as Executable from "../../packages/effect-build/src/Executable.ts";

it.layer(NodeServices.layer)("optional publication", (it) => {
  it.effect("stages privately beside a destination and returns the final path", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "app");
      yield* fs.writeFileString(destination, "old");
      let staging = "";
      const published = yield* Atomic.file(
        destination,
        Effect.fnUntraced(function*(staged) {
          staging = path.dirname(staged);
          assert.strictEqual(path.dirname(staging), root);
          // Windows permissions are ACLs; native mode bits do not express POSIX owner privacy.
          if (path.sep === "/") assert.strictEqual((yield* fs.stat(staging)).mode & 0o777, 0o700);
          assert.strictEqual(yield* fs.readFileString(destination), "old");
          yield* fs.writeFileString(staged, "new");
          return { path: staged };
        }),
      );
      assert.strictEqual(published, destination);
      assert.strictEqual(yield* fs.readFileString(destination), "new");
      assert.isFalse(yield* fs.exists(staging));
    }));

  it.effect("preserves production and selected-check failures before commit", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "app");
      yield* fs.writeFileString(destination, "old");
      const production = yield* Atomic.file(destination, () => Effect.fail("production")).pipe(Effect.flip);
      assert.strictEqual(production, "production");
      const check = yield* Atomic.file(destination, (staged) => fs.writeFileString(staged, "script"), {
        check: Executable.checkNative,
      }).pipe(Effect.flip);
      assert.instanceOf(check, Executable.ExecutableError);
      assert.strictEqual(Schema.is(Executable.ExecutableError)(check) ? check.path : "", destination);
      assert.strictEqual(yield* fs.readFileString(destination), "old");
      assert.deepStrictEqual(yield* fs.readDirectory(root), ["app"]);
    }));

  it.effect("keeps both production and cleanup causes", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const denied = PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "remove" });
      const cause = yield* Atomic.file(path.join(root, "app"), () => Effect.fail("production")).pipe(
        Effect.provideService(FileSystem.FileSystem, { ...fs, remove: () => Effect.fail(denied) }),
        Effect.sandbox,
        Effect.flip,
      );
      const failures = cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error);
      assert.lengthOf(failures, 2);
      assert.strictEqual(failures[0], "production");
      assert.deepInclude(failures[1], { _tag: "AtomicError", step: "cleanup", cause: denied });
    }));

  it.effect("reports cleanup failure after a successful rename without undoing publication", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "app");
      const denied = PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "remove" });
      const error = yield* Atomic.file(destination, (staged) => fs.writeFileString(staged, "published")).pipe(
        Effect.provideService(FileSystem.FileSystem, { ...fs, remove: () => Effect.fail(denied) }),
        Effect.flip,
      );
      assert.deepInclude(error, { _tag: "AtomicError", step: "cleanup", cause: denied });
      assert.strictEqual(yield* fs.readFileString(destination), "published");
    }));

  it.effect("interruption removes staging while preserving the old destination", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "app");
      yield* fs.writeFileString(destination, "old");
      const staged = yield* Deferred.make<string>();
      const fiber = yield* Atomic.file(
        destination,
        Effect.fnUntraced(function*(file) {
          yield* fs.writeFileString(file, "unfinished");
          yield* Deferred.succeed(staged, path.dirname(file));
          return yield* Effect.never;
        }),
      ).pipe(Effect.forkChild);
      const directory = yield* Deferred.await(staged);
      yield* Fiber.interrupt(fiber);
      assert.isFalse(yield* fs.exists(directory));
      assert.strictEqual(yield* fs.readFileString(destination), "old");
    }));

  it.effect("overwrites staged leaves and retains unrelated files", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "bundle");
      yield* fs.makeDirectory(destination);
      yield* fs.writeFileString(path.join(destination, "keep"), "unrelated");
      yield* fs.writeFileString(path.join(destination, "main.js"), "old");
      const result = yield* Atomic.directory(
        destination,
        Effect.fnUntraced(function*(staging) {
          yield* fs.writeFileString(path.join(staging, "main.js"), "new");
          yield* fs.makeDirectory(path.join(staging, "nested"));
          yield* fs.writeFileString(path.join(staging, "nested", "main.js.map"), "map");
          yield* fs.makeDirectory(path.join(staging, "empty"));
        }),
      );
      assert.strictEqual(result, destination);
      assert.strictEqual(yield* fs.readFileString(path.join(destination, "main.js")), "new");
      assert.strictEqual(yield* fs.readFileString(path.join(destination, "nested", "main.js.map")), "map");
      assert.strictEqual(yield* fs.readFileString(path.join(destination, "keep")), "unrelated");
      assert.isFalse(yield* fs.exists(path.join(destination, "empty")));
    }));

  it.effect("a later commit failure leaves earlier files published", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "bundle");
      yield* fs.makeDirectory(destination);
      yield* fs.writeFileString(path.join(destination, "a"), "old-a");
      yield* fs.writeFileString(path.join(destination, "b"), "old-b");
      const denied = PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "rename" });
      const error = yield* Atomic.directory(
        destination,
        Effect.fnUntraced(function*(staging) {
          yield* fs.writeFileString(path.join(staging, "a"), "new-a");
          yield* fs.writeFileString(path.join(staging, "b"), "new-b");
        }),
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          rename: (source, target) =>
            target === path.join(destination, "b") ? Effect.fail(denied) : fs.rename(source, target),
        }),
        Effect.flip,
      );
      assert.deepInclude(error, { _tag: "AtomicError", step: "commit" });
      assert.strictEqual(yield* fs.readFileString(path.join(destination, "a")), "new-a");
      assert.strictEqual(yield* fs.readFileString(path.join(destination, "b")), "old-b");
      assert.deepStrictEqual(yield* fs.readDirectory(root), ["bundle"]);
    }));

  it.effect("returns an existing final directory when production emits no leaves", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(yield* fs.makeTempDirectoryScoped());
      const destination = path.join(root, "empty");
      assert.strictEqual(yield* Atomic.directory(destination, () => Effect.void), destination);
      assert.deepStrictEqual(yield* fs.readDirectory(destination), []);
    }));
});
