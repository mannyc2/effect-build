import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Bun } from "effect-build-bun";
import * as Tool from "effect-build/Tool";
import { ChildProcess } from "effect/process";

const native = Bun.layer({ executable: process.env.EFFECT_BUILD_BUN }).pipe(Layer.provideMerge(NodeServices.layer));

it.live(
  "real Bun builds a bundle and atomically publishes a runnable executable",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-bun-" });
        yield* fs.writeFileString(path.join(root, "main.ts"), 'console.log("hello from effect-build");\n');
        const bun = yield* Bun;
        const outdir = yield* bun.build({
          entrypoints: ["main.ts"],
          outdir: "dist",
          target: "bun",
          cwd: root,
          atomic: true,
        });
        assert.include(yield* fs.readFileString(path.join(outdir, "main.js")), "hello from effect-build");
        const os = process.platform === "win32" ? "windows" : process.platform;
        const outfile = yield* bun.compile({
          entrypoints: ["main.ts"],
          outfile: "hello",
          target: `bun-${os}-${process.arch}`,
          cwd: root,
          atomic: true,
        });
        const executable = yield* Tool.make("hello", { executable: outfile });
        const output = yield* executable.run(
          ChildProcess.make(outfile, [], { stdin: "ignore" }),
          executable.text({ maxBytes: 4096 }),
        );
        assert.strictEqual(output.trim(), "hello from effect-build");
        assert.strictEqual(outfile, path.join(root, process.platform === "win32" ? "hello.exe" : "hello"));
      }).pipe(Effect.provideContext(context))
    )),
  300_000,
);

it.live(
  "real Bun failure preserves the previous atomic destination",
  () =>
    Layer.build(native).pipe(Effect.flatMap((context) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-bun-failure-" });
        const outfile = path.join(root, "previous");
        yield* fs.writeFileString(outfile, "previous output");
        const bun = yield* Bun;
        const error = yield* Effect.flip(
          bun.compile({ entrypoints: ["missing.ts"], outfile, target: "bun-linux-x64", cwd: root, atomic: true }),
        );
        assert.strictEqual(error._tag, "ToolError");
        assert.strictEqual(yield* fs.readFileString(outfile), "previous output");
        assert.deepStrictEqual(yield* fs.readDirectory(root), ["previous"]);
      }).pipe(Effect.provideContext(context))
    )),
  30_000,
);
