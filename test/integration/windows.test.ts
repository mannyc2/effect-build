import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { SignTool } from "effect-build-windows";

const native = SignTool.layer({ executable: process.env.EFFECT_BUILD_SIGNTOOL }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.live(
  "real SignTool keeps native signing and verification failures",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-signtool-" });
        const file = path.join(root, "unsigned.exe");
        yield* fs.writeFileString(file, "not a PE image");
        const signtool = yield* SignTool;
        const signing = yield* Effect.flip(
          signtool.sign({ path: file, credential: { _tag: "Pfx", file: path.join(root, "missing.pfx") } }),
        );
        assert.strictEqual(signing.reason._tag, "Exit");
        assert.isAbove(signing.message.length, 0);
        const verification = yield* Effect.flip(signtool.verify({ path: file }));
        assert.strictEqual(verification.reason._tag, "Exit");
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);
