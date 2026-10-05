import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Sbom } from "effect-build-sbom";

const native = Sbom.layer({ executable: process.env.EFFECT_BUILD_SYFT_BIN }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.live(
  "real Syft discovers a locked npm package and writes the requested SPDX format",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-syft-" });
        yield* fs.writeFileString(
          path.join(root, "package.json"),
          JSON.stringify({ name: "fixture", version: "1.0.0", dependencies: { effect: "4.0.0" } }),
        );
        yield* fs.writeFileString(
          path.join(root, "package-lock.json"),
          JSON.stringify({
            name: "fixture",
            version: "1.0.0",
            lockfileVersion: 3,
            requires: true,
            packages: {
              "": { name: "fixture", version: "1.0.0", dependencies: { effect: "4.0.0" } },
              "node_modules/effect": { version: "4.0.0", license: "MIT" },
            },
          }),
        );
        const sbom = yield* Sbom;
        const input = { source: `dir:${root}`, env: { SYFT_CHECK_FOR_APP_UPDATE: "false" }, extendEnv: true };
        const report = yield* sbom.report(input);
        const inventory = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ artifacts: Schema.Array(Schema.Struct({ name: Schema.String, version: Schema.String })) }),
        )(report);
        assert.isTrue(
          inventory.artifacts.some((artifact) => artifact.name === "effect" && artifact.version === "4.0.0"),
        );
        const outfile = yield* sbom.generate({
          ...input,
          format: "spdx-json@2.3",
          outfile: path.join(root, "sbom.json"),
          atomic: true,
        });
        const spdx = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Struct({ spdxVersion: Schema.String })),
        )(yield* fs.readFileString(outfile));
        assert.strictEqual(spdx.spdxVersion, "SPDX-2.3");
      }).pipe(Effect.provideContext(context))
    )),
  120_000,
);
