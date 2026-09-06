import { Effect } from "effect";
import { Context } from "effect-build-esbuild/Api";
import assert from "node:assert/strict";
import { test } from "node:test";
import { type BuildInfo, virtualBuildInfo } from "../src/virtual-build-info.ts";

test("a native plugin rebuilds, reports a failure, recovers, and disposes with its Effect scope", {
  timeout: 10_000,
}, async () => {
  let info: BuildInfo | undefined = { version: "1.0.0", channel: "preview" };
  let disposalCount = 0;
  let notifyDisposed!: () => void;
  const disposed = new Promise<void>((resolve) => {
    notifyDisposed = resolve;
  });

  // Import the actual generated ESM. Different contents produce different URLs,
  // so each rebuild is evaluated instead of hitting the module cache.
  const execute = (contents: Uint8Array) =>
    Effect.promise(async () => {
      const url = `data:text/javascript;base64,${Buffer.from(contents).toString("base64")}`;
      const module = await import(url);
      return module.default as unknown;
    });

  await Effect.runPromise(
    Effect.gen(function*() {
      const context = yield* Context.make({
        stdin: {
          contents: 'export { default } from "virtual:build-info";',
          sourcefile: "main.ts",
          loader: "ts",
        },
        bundle: true,
        format: "esm",
        platform: "node",
        write: false,
        metafile: true,
        logLevel: "silent",
        plugins: [
          virtualBuildInfo(() => {
            if (info === undefined) throw new Error("build info is unavailable");
            return info;
          }),
          {
            name: "observe-disposal",
            setup(build) {
              build.onDispose(() => {
                disposalCount++;
                notifyDisposed();
              });
            },
          },
        ],
      });

      const first = yield* context.rebuild;
      assert.equal(first.outputFiles.length, 1);
      assert.ok(Object.hasOwn(first.metafile.inputs, "build-info:build-info"));
      const firstOutput = first.outputFiles[0];
      assert.ok(firstOutput);
      assert.deepEqual(yield* execute(firstOutput.contents), { version: "1.0.0", channel: "preview" });
      assert.equal(disposalCount, 0);

      info = { version: "1.0.1", channel: "stable" };
      const second = yield* context.rebuild;
      const secondOutput = second.outputFiles[0];
      assert.ok(secondOutput);
      assert.deepEqual(yield* execute(secondOutput.contents), { version: "1.0.1", channel: "stable" });

      // A native plugin error stays a typed esbuild failure. It does not close
      // the context, so the application can fix the input and rebuild explicitly.
      info = undefined;
      const failed = yield* Effect.flip(context.rebuild);
      assert.equal(failed._tag, "EsbuildFailed");
      assert.equal(failed.operation, "rebuild");
      assert.equal(failed.errors[0]?.pluginName, "virtual-build-info");
      assert.equal(failed.errors[0]?.text, "build info is unavailable");
      assert.equal(disposalCount, 0);

      info = { version: "1.0.2", channel: "stable" };
      const recovered = yield* context.rebuild;
      const recoveredOutput = recovered.outputFiles[0];
      assert.ok(recoveredOutput);
      assert.deepEqual(yield* execute(recoveredOutput.contents), { version: "1.0.2", channel: "stable" });
    }).pipe(Effect.scoped),
  );

  // esbuild's onDispose notification is asynchronous. Await it, rather than
  // assuming it has fired just because the context's dispose promise resolved.
  await disposed;
  assert.equal(disposalCount, 1);
});
