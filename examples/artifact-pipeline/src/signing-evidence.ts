import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Schema } from "effect";
import { Artifact } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Bun from "effect-build-bun";
import { buildDarwinRelease, buildWindowsRelease } from "./signing.js";

// Credentialed signing evidence: the signing workflow runs this on macOS and Windows with real identities.
const required = (name: string) => Effect.suspend(() => {
  const value = process.env[name];
  return value === undefined || value === "" ? Effect.fail(new Error(`${name} is required`)) : Effect.succeed(value);
});

const program = Effect.scoped(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* fs.makeTempDirectoryScoped();
  const entrypoint = path.join(source, "example.ts");
  yield* fs.writeFileString(entrypoint, 'console.log("hello from a signed effect-build executable");\n');
  const executable = yield* Bun.compile({
    entrypoints: [entrypoint], outfile: path.join("dist", process.platform === "win32" ? "example.exe" : "example"),
  }).pipe(Effect.provide(Bun.layer({ executable: process.env.EFFECT_BUILD_BUN })));
  if (process.platform === "darwin") {
    const certificateSha1 = yield* required("EFFECT_BUILD_APPLE_CERTIFICATE_SHA1");
    const credential: Apple.Notary.Credential = {
      kind: "api-key",
      keyFile: yield* required("EFFECT_BUILD_APPLE_API_KEY_FILE"),
      keyId: yield* required("EFFECT_BUILD_APPLE_API_KEY_ID"),
      issuer: yield* required("EFFECT_BUILD_APPLE_API_ISSUER"),
    };
    const release = yield* buildDarwinRelease(executable, certificateSha1, credential);
    yield* Effect.log(JSON.stringify({
      submission: Schema.encodeSync(Apple.Notary.Submission)(release.submission),
      artifacts: Artifact.encode([release.executable, release.archive]),
    }, null, 2));
  } else if (process.platform === "win32") {
    const credential = {
      kind: "trusted-signing" as const,
      library: yield* required("EFFECT_BUILD_TRUSTED_SIGNING_LIBRARY"),
      metadata: yield* required("EFFECT_BUILD_TRUSTED_SIGNING_METADATA"),
    };
    const release = yield* buildWindowsRelease(executable, credential, process.env.EFFECT_BUILD_TIMESTAMP_URL ?? "http://timestamp.acs.microsoft.com");
    yield* Effect.log(JSON.stringify(Artifact.encode([release.executable, release.archive]), null, 2));
  } else {
    return yield* Effect.fail(new Error("signing evidence runs on macOS or Windows"));
  }
}));

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
