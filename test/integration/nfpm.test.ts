import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Nfpm } from "effect-build-nfpm";

const native = Nfpm.layer({ executable: process.env.EFFECT_BUILD_NFPM_BIN }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.live(
  "real nFPM packages native configuration as a Debian archive",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-nfpm-" });
        const config = path.join(root, "nfpm.json");
        yield* fs.writeFileString(path.join(root, "hello.txt"), "hello\n");
        yield* fs.writeFileString(
          config,
          JSON.stringify({
            name: "effect-build-fixture",
            version: "1.2.3",
            arch: "amd64",
            platform: "linux",
            maintainer: "Effect Build <fixture@example.com>",
            description: "Integration fixture",
            contents: [{ src: path.join(root, "hello.txt"), dst: "/usr/share/effect-build-fixture/hello.txt" }],
          }),
        );
        const nfpm = yield* Nfpm;
        const outfile = yield* nfpm.package({
          config,
          format: "deb",
          outfile: path.join(root, "fixture.deb"),
          atomic: true,
        });
        const bytes = yield* fs.readFile(outfile);
        assert.strictEqual(new TextDecoder().decode(bytes.subarray(0, 8)), "!<arch>\n");
        assert.strictEqual(outfile, path.join(root, "fixture.deb"));
      }).pipe(Effect.provideContext(context))
    )),
  60_000,
);
