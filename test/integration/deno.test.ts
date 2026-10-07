import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Deno } from "effect-build-deno";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const native = Deno.layer({ executable: process.env.EFFECT_BUILD_DENO, runtime: process.env.EFFECT_BUILD_DENORT }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.live(
  "real Deno keeps its final basename when atomically compiling",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-deno-" });
        yield* fs.writeFileString(path.join(root, "main.ts"), "console.log(import.meta.url);\n");
        const deno = yield* Deno;
        const outfile = yield* deno.compile({
          entrypoint: "main.ts",
          outfile: "chosen-name",
          cwd: root,
          config: false,
          extraArgs: ["--no-check", "--no-remote"],
          atomic: true,
        });
        const tool = yield* Tool.make("compiled-deno", { executable: outfile });
        const url = yield* tool.run(ChildProcess.make(outfile, [], { stdin: "ignore" }), tool.text({ maxBytes: 4096 }));
        assert.include(url, "/deno-compile-chosen-name");
        assert.strictEqual(path.basename(outfile), process.platform === "win32" ? "chosen-name.exe" : "chosen-name");
      }).pipe(Effect.provideContext(context))
    )),
  300_000,
);

it.live(
  "real Deno bundles with its native command",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-deno-bundle-" });
        yield* fs.writeFileString(
          path.join(root, "main.ts"),
          "export const answer: number = 42; console.log(answer);\n",
        );
        const deno = yield* Deno;
        const outdir = yield* deno.bundle({
          entrypoints: ["main.ts"],
          outdir: "dist",
          cwd: root,
          config: false,
          atomic: true,
        });
        const contents = yield* fs.readFileString(path.join(outdir, "main.js"));
        assert.include(contents, "42");
      }).pipe(Effect.provideContext(context))
    )),
  300_000,
);
