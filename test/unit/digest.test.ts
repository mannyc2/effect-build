import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import * as Digest from "../../packages/effect-build/src/Digest.ts";

it.layer(NodeServices.layer)("optional digests", (it) => {
  it.effect("hashes bounded reads without loading the whole file", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "large");
      yield* fs.writeFile(file, new Uint8Array(200_000).fill(97));
      let largest = 0;
      let reads = 0;
      const digest = yield* Digest.sha256(file).pipe(Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        readFile: () => Effect.die("whole-file reads are forbidden"),
        open: Effect.fnUntraced(function*(target: string, options?: Parameters<FileSystem.FileSystem["open"]>[1]) {
          const handle = yield* fs.open(target, options);
          return {
            ...handle,
            read: (buffer) => {
              largest = Math.max(largest, buffer.byteLength);
              reads++;
              return handle.read(buffer);
            },
          } satisfies FileSystem.File;
        }),
      }));
      assert.strictEqual(digest, "2287d207f24a941ff3b56c04c8a25ad56b63e3023207b3bb5b4ac0c9869d74be");
      assert.isAtMost(largest, 64 * 1024);
      assert.isAbove(reads, 3);
    }));

  it.effect("memoizes only the caller's chosen lifetime and verifies fresh bytes", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "input");
      yield* fs.writeFileString(file, "abc");
      let opens = 0;
      const services = {
        ...fs,
        open: (
          target: string,
          options?: { readonly flag?: FileSystem.OpenFlag | undefined; readonly mode?: number | undefined },
        ) => {
          opens++;
          return fs.open(target, options);
        },
      };
      const computation = Digest.sha256(file).pipe(Effect.provideService(FileSystem.FileSystem, services));
      const cached = yield* Effect.cached(computation);
      const expected = yield* cached;
      assert.strictEqual(expected, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      assert.strictEqual(yield* cached, expected);
      assert.strictEqual(opens, 1);
      yield* Digest.verifySha256(file, expected);
      yield* fs.writeFileString(file, "changed");
      assert.strictEqual(yield* cached, expected);
      const error = yield* Digest.verifySha256(expected)(file).pipe(Effect.flip);
      assert.deepInclude(error, { _tag: "DigestError", path: file });
      assert.deepInclude(error.reason, { _tag: "Mismatch", expected });
      assert.notStrictEqual(yield* computation, expected);
      assert.strictEqual(opens, 2);
    }));

  it.effect("preserves native read failures as a typed reason", () =>
    Effect.gen(function*() {
      const error = yield* Digest.sha256("/does-not-exist/effect-build").pipe(Effect.flip);
      assert.deepInclude(error, { _tag: "DigestError", path: "/does-not-exist/effect-build" });
      assert.strictEqual(error.reason._tag, "Read");
    }));
});
