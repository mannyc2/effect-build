import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Effect, FileSystem, Layer, Path, Sink } from "effect";
import { Tool } from "effect-build";
import { Bun } from "effect-build-bun";
import { SignTool } from "effect-build-windows";
import { ChildProcess } from "effect/process";

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bun = yield* Bun;
  const signer = yield* SignTool;
  const library = yield* Config.String("EFFECT_BUILD_TRUSTED_SIGNING_LIBRARY");
  const metadata = yield* Config.String("EFFECT_BUILD_TRUSTED_SIGNING_METADATA");
  const timestampUrl = yield* Config.String("EFFECT_BUILD_TIMESTAMP_URL").pipe(
    Config.withDefault("http://timestamp.acs.microsoft.com"),
  );

  const source = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-signing-" });
  const main = path.join(source, "main.ts");
  const outfile = path.resolve("dist", "example.exe");
  yield* fs.writeFileString(main, 'console.log("hello from a signed effect-build executable");\n');
  yield* bun.compile({ entrypoints: [main], outfile, target: "bun-windows-x64", atomic: true });
  const signed = yield* signer.sign({
    path: outfile,
    credential: { _tag: "TrustedSigning", library, metadata },
    timestampUrl,
  });
  yield* signer.verify({ path: signed });
  const executable = yield* Tool.make("signed-example", { executable: signed });
  yield* executable.run(ChildProcess.make(executable.executable, [], { stdin: "ignore" }), Sink.drain);
  yield* Effect.logInfo("Signed and verified executable", { path: signed });
  return signed;
});

const services = Layer.mergeAll(
  Bun.layerConfig({ executable: Config.String("EFFECT_BUILD_BUN").pipe(Config.withDefault(undefined)) }),
  SignTool.layerConfig({ executable: Config.String("EFFECT_BUILD_SIGNTOOL") }),
).pipe(Layer.provideMerge(NodeServices.layer));

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This credentialed application provides its platform at the entry point.
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
