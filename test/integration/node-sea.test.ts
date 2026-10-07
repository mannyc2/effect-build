import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Tool } from "effect-build";
import { NodeSea } from "effect-build-node-sea";
import { ChildProcess } from "effect/process";

it.live("assembles and executes a real native Node SEA with an embedded asset", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "node-sea-integration-" });
    const main = path.join(directory, "main.cjs");
    const asset = path.join(directory, "message.txt");
    yield* fs.writeFileString(main, 'console.log(require("node:sea").getAsset("message", "utf8"));');
    yield* fs.writeFileString(asset, "native SEA works");
    const output = yield* Effect.gen(function*() {
      const sea = yield* NodeSea;
      return yield* sea.assemble({
        main,
        outfile: path.join(directory, "app"),
        assets: { message: asset },
        atomic: true,
      });
    }).pipe(
      Effect.provideContext(
        yield* Layer.build(
          NodeSea.layer({ executable: process.env.EFFECT_BUILD_NODE }).pipe(Layer.provide(NodeServices.layer)),
        ),
      ),
    );
    const executable = yield* Tool.make("app", { executable: output });
    const printed = yield* executable.run(
      ChildProcess.make(output, [], { stdin: "ignore" }),
      executable.text({ maxBytes: 4096 }),
    );
    assert.strictEqual(printed.trim(), "native SEA works");
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the native integration entry point.
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)), 120_000);
