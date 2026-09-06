import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { AnalyzeMetafile, Build } from "effect-build-esbuild/Api";
import { virtualBuildInfo } from "./virtual-build-info.ts";

const program = Effect.gen(function*() {
  const result = yield* Build.build({
    stdin: {
      contents: [
        'import info from "virtual:build-info";',
        "export const banner = `${info.version} (${info.channel})`;",
      ].join("\n"),
      sourcefile: "banner.ts",
      loader: "ts",
    },
    plugins: [virtualBuildInfo(() => ({ version: "1.0.0", channel: "preview" }))],
    bundle: true,
    format: "esm",
    platform: "node",
    // Names the in-memory output; write: false keeps it off the filesystem.
    outfile: "dist/banner.mjs",
    write: false,
    metafile: true,
  });

  for (const output of result.outputFiles) {
    yield* Console.log(`${output.path}: ${output.contents.byteLength} bytes`);
    yield* Console.log(output.text);
  }
  const analysis = yield* AnalyzeMetafile.analyzeMetafile(result.metafile, { color: false, verbose: true });
  yield* Console.log(analysis);
});

NodeRuntime.runMain(program);
