import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import * as Executable from "../../packages/effect-build/src/Executable.ts";

it.layer(NodeServices.layer)("optional native-header check", (it) => {
  it.effect.each([
    "7f454c46",
    "feedface",
    "cefaedfe",
    "feedfacf",
    "cffaedfe",
    "cafebabe",
    "bebafeca",
    "cafebabf",
    "bfbafeca",
    "4d5a0000",
  ])("accepts the four-byte native magic %s without reading payloads", (magic) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "app");
      const bytes = Uint8Array.from(magic.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
      yield* fs.writeFile(file, bytes);
      let requested = 0;
      yield* Executable.checkNative(file).pipe(Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        readFile: () => Effect.die("whole-file reads are forbidden"),
        open: Effect.fnUntraced(function*(target: string, options?: Parameters<FileSystem.FileSystem["open"]>[1]) {
          const handle = yield* fs.open(target, options);
          return {
            ...handle,
            readAlloc: (length) => {
              requested += length;
              return handle.readAlloc(length);
            },
          } satisfies FileSystem.File;
        }),
      }));
      assert.strictEqual(requested, 4);
    }));

  it.effect.each([new Uint8Array(), new Uint8Array([0x4d, 0x5a]), new TextEncoder().encode("#!/bin/sh")])(
    "rejects empty, truncated and non-native magic %#",
    (bytes) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "app");
        yield* fs.writeFile(file, bytes);
        const error = yield* Executable.checkNative(file).pipe(Effect.flip);
        assert.deepInclude(error, { _tag: "ExecutableError", path: file });
      }),
  );

  it.effect("keeps a native open failure in the platform error channel", () =>
    Effect.gen(function*() {
      const error = yield* Executable.checkNative("/does-not-exist/effect-build").pipe(Effect.flip);
      assert.strictEqual(error._tag, "PlatformError");
    }));
});
