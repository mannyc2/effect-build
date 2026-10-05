import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Codesign, Notarytool, Stapler } from "effect-build-apple";

const native = Layer.mergeAll(
  Codesign.layer({ executable: process.env.EFFECT_BUILD_CODESIGN }),
  Notarytool.layer({ executable: process.env.EFFECT_BUILD_NOTARYTOOL }),
  Stapler.layer({ executable: process.env.EFFECT_BUILD_STAPLER }),
).pipe(Layer.provideMerge(NodeServices.layer));

it.live(
  "real codesign signs and verifies an ad-hoc Mach-O copy",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-codesign-" });
        const file = path.join(root, "signed-true");
        yield* fs.copyFile("/usr/bin/true", file);
        const codesign = yield* Codesign;
        assert.strictEqual(yield* codesign.sign({ path: file, identity: "-", force: true, timestamp: false }), file);
        yield* codesign.verify({ path: file, strict: true });
        assert.isAbove((yield* fs.readFile(file)).length, 0);
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);

it.live(
  "real notarytool and stapler preserve native invalid-input failures",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-apple-failure-" });
        const file = path.join(root, "unsigned.dmg");
        yield* fs.writeFileString(file, "not a disk image");
        const notarytool = yield* Notarytool;
        const lookup = yield* Effect.flip(
          notarytool.info({
            id: "invalid-id",
            credential: { _tag: "Keychain", profile: "effect-build-nonexistent-profile" },
          }),
        );
        assert.strictEqual(lookup.reason._tag, "Exit");
        const stapler = yield* Stapler;
        const validation = yield* Effect.flip(stapler.validate({ path: file }));
        assert.strictEqual(validation.reason._tag, "Exit");
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);
