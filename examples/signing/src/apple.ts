import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Effect, FileSystem, Layer, Path, Schema, Sink } from "effect";
import { Tool } from "effect-build";
import { Codesign, Notarytool, Stapler } from "effect-build-apple";
import type { Credential } from "effect-build-apple/Notarytool";
import { Bun } from "effect-build-bun";
import { ChildProcess } from "effect/process";

class NotarizationRejected extends Schema.TaggedError<NotarizationRejected>()("NotarizationRejected", {
  id: Schema.String,
  status: Schema.String,
}) {
  override get message(): string {
    return `Notarization ${this.id} finished with status ${this.status}`;
  }
}

const info = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.effect-build.example</string>
<key>CFBundleName</key><string>Example</string>
<key>CFBundleExecutable</key><string>example</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
</dict></plist>
`;

// These are Bun's documented hardened-runtime permissions for its JavaScript engine.
const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-executable-page-protection</key><true/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
`;

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bun = yield* Bun;
  const codesign = yield* Codesign;
  const notary = yield* Notarytool;
  const stapler = yield* Stapler;
  const identity = yield* Config.String("EFFECT_BUILD_APPLE_CERTIFICATE_SHA1");
  const target = yield* Config.String("EFFECT_BUILD_BUN_TARGET");
  const credential: Credential = {
    _tag: "ApiKey",
    keyFile: yield* Config.String("EFFECT_BUILD_APPLE_API_KEY_FILE"),
    keyId: yield* Config.String("EFFECT_BUILD_APPLE_API_KEY_ID"),
    issuer: yield* Config.String("EFFECT_BUILD_APPLE_API_ISSUER"),
  };

  const source = yield* fs.makeTempDirectoryScoped({ prefix: "effect-build-signing-" });
  const main = path.join(source, "main.ts");
  const permissions = path.join(source, "entitlements.plist");
  yield* fs.writeFileString(main, 'console.log("hello from a signed effect-build executable");\n');
  yield* fs.writeFileString(permissions, entitlements);

  const app = path.resolve("dist", "Example.app");
  const executable = path.join(app, "Contents", "MacOS", "example");
  const archive = path.resolve("dist", "example-darwin.zip");
  yield* fs.remove(app, { recursive: true, force: true });
  yield* fs.makeDirectory(path.dirname(executable), { recursive: true });
  yield* fs.writeFileString(path.join(app, "Contents", "Info.plist"), info);
  yield* bun.compile({ entrypoints: [main], outfile: executable, target, atomic: true });
  yield* codesign.sign({
    path: app,
    identity,
    force: true,
    hardenedRuntime: true,
    timestamp: true,
    entitlements: permissions,
  });
  yield* codesign.verify({ path: app, strict: true });

  const signed = yield* Tool.make("signed-example", { executable });
  yield* signed.run(ChildProcess.make(signed.executable, [], { stdin: "ignore" }), Sink.drain);

  const ditto = yield* Tool.make("ditto");
  const zip = Effect.gen(function*() {
    yield* fs.remove(archive, { force: true });
    yield* ditto.run(
      ChildProcess.make(ditto.executable, ["-c", "-k", "--keepParent", app, archive], { stdin: "ignore" }),
      Sink.drain,
    );
  });
  yield* zip;
  const submission = yield* notary.submit({ path: archive, credential });
  const result = yield* notary.wait({ id: submission.id, credential, timeout: "30m" });
  if (result.status !== "Accepted") {
    return yield* NotarizationRejected.make({ id: result.id, status: result.status });
  }
  yield* stapler.staple({ path: app });
  yield* stapler.validate({ path: app });
  yield* zip;
  yield* Effect.logInfo("Signed and notarized application", { app, archive, submission: result.id });
  return archive;
});

const services = Layer.mergeAll(
  Bun.layerConfig({ executable: Config.String("EFFECT_BUILD_BUN").pipe(Config.withDefault(undefined)) }),
  Codesign.layer(),
  Notarytool.layer(),
  Stapler.layer(),
).pipe(Layer.provideMerge(NodeServices.layer));

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- This credentialed application provides its platform at the entry point.
NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(services)));
