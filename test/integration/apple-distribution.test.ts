import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer } from "effect";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as AppBundle from "../../packages/effect-build-apple/src/AppBundle.js";
import * as Artifact from "../../packages/effect-build-apple/src/Artifact.js";
import * as Assess from "../../packages/effect-build-apple/src/Assess.js";
import * as CodeSign from "../../packages/effect-build-apple/src/CodeSign.js";
import * as DiskImage from "../../packages/effect-build-apple/src/DiskImage.js";
import * as Notary from "../../packages/effect-build-apple/src/Notary.js";
import * as Staple from "../../packages/effect-build-apple/src/Staple.js";
import * as Zip from "../../packages/effect-build-apple/src/Zip.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "effect-build-apple-integration-")));
  roots.push(root);
  return root;
};

const copyThinMachOFixture = (destination: string): void => {
  const source = "/usr/bin/true";
  const magic = readFileSync(source).subarray(0, 4).toString("hex");
  if (["cafebabe", "cafebabf", "bebafeca", "bfbafeca"].includes(magic)) {
    const architectures = execFileSync("/usr/bin/lipo", ["-archs", source], { encoding: "utf8" }).trim().split(/\s+/u);
    const architecture = process.arch === "arm64"
      ? architectures.includes("arm64")
        ? "arm64"
        : "arm64e"
      : "x86_64";
    execFileSync("/usr/bin/lipo", [source, "-thin", architecture, "-output", destination]);
  } else {
    copyFileSync(source, destination);
  }
  chmodSync(destination, 0o755);
};

const provide = <A, E, R>(effect: Effect.Effect<A, E, R>, layer: Layer.Layer<R, unknown, NodeServices.NodeServices>) =>
  effect.pipe(Effect.provide(layer.pipe(Layer.provide(NodeServices.layer))));

const failureTag = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (!Exit.isFailure(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None" || typeof found.value !== "object" || found.value === null || !("_tag" in found.value)) {
    throw new Error("expected tagged failure");
  }
  return String(found.value._tag);
};

describe.runIf(process.platform === "darwin")("Apple distribution local tools", () => {
  it("constructs and independently validates real app, ZIP, and UDZO disk-image artifacts", async () => {
    const root = makeRoot();
    const resourcePath = join(root, "NOTICE.txt");
    const executablePath = join(root, "effect-build-fixture-source");
    writeFileSync(resourcePath, "integration fixture\n");
    copyThinMachOFixture(executablePath);
    const executable = await Effect.runPromise(
      Artifact.observeFile("mach-o", executablePath).pipe(Effect.provide(NodeServices.layer)),
    );
    const resource = await Effect.runPromise(
      Artifact.observeFile("resource", resourcePath).pipe(Effect.provide(NodeServices.layer)),
    );
    const original = readFileSync(executable.path);

    const app = await Effect.runPromise(
      provide(
        AppBundle.create({
          executable,
          resources: [{ artifact: resource, destination: "NOTICE.txt" }],
          outfile: join(root, "EffectBuildFixture.app"),
          bundleIdentifier: "dev.effect.build.integration",
          bundleName: "Effect Build Fixture",
          executableName: "effect-build-fixture",
          version: "1",
          shortVersion: "1.0.0",
          minimumSystemVersion: "13.0",
        }),
        AppBundle.layer(),
      ),
    );
    const archive = await Effect.runPromise(
      provide(
        Zip.create({ app: app.artifact, outfile: join(root, "EffectBuildFixture.zip") }),
        Zip.layer(),
      ),
    );
    const image = await Effect.runPromise(
      provide(
        DiskImage.create({
          app: app.artifact,
          outfile: join(root, "EffectBuildFixture.dmg"),
          volumeName: "Effect Build Fixture",
        }),
        DiskImage.layer(),
      ),
    );

    expect(app.artifact.identity.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(archive.artifact.identity.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(image.artifact.identity.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(readFileSync(executable.path)).toEqual(original);
    expect(existsSync(app.artifact.path)).toBe(true);
    expect(existsSync(archive.artifact.path)).toBe(true);
    expect(existsSync(image.artifact.path)).toBe(true);
  }, 60_000);

  it("selects the installed Apple/Xcode tools while kind fences prevent credentialed or network work", async () => {
    const root = makeRoot();
    const resourcePath = join(root, "resource.txt");
    const zipPath = join(root, "transport.zip");
    writeFileSync(resourcePath, "resource\n");
    writeFileSync(zipPath, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("transport\n")]));
    const resource = await Effect.runPromise(
      Artifact.observeFile("resource", resourcePath).pipe(Effect.provide(NodeServices.layer)),
    );
    const zip = await Effect.runPromise(
      Artifact.observeFile("zip", zipPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const notarytoolPath = execFileSync("/usr/bin/xcrun", ["--no-cache", "--find", "notarytool"], {
      encoding: "utf8",
    }).trim();
    const staplerPath = execFileSync("/usr/bin/xcrun", ["--no-cache", "--find", "stapler"], {
      encoding: "utf8",
    }).trim();

    const notary = await Effect.runPromiseExit(
      provide(
        Notary.submit({ artifact: resource as never, receiptPath: join(root, "must-not-exist.json") }),
        Notary.layer({
          notarytoolPath,
          credentials: { _tag: "KeychainProfile", profile: "not-used-after-kind-check" },
          s3Acceleration: "disabled",
        }),
      ),
    );
    const staple = await Effect.runPromiseExit(
      provide(
        Staple.staple({ input: zip, destination: join(root, "must-not-exist.zip") } as never),
        Staple.layer({ staplerPath }),
      ),
    );
    const assess = await Effect.runPromiseExit(provide(Assess.assess(zip as never), Assess.layer()));
    const sign = await Effect.runPromiseExit(
      provide(
        CodeSign.sign({
          input: zip as unknown as CodeSign.SignableArtifact,
          destination: join(root, "must-not-exist-signed.zip"),
          identity: CodeSign.developerIdApplication({
            fingerprint: "0000000000000000000000000000000000000000",
            teamId: "TEAMID0000",
          }),
          plan: [{ path: ".", hardenedRuntime: false }],
        }),
        CodeSign.layer(),
      ),
    );

    expect(failureTag(notary)).toBe("UnsupportedArtifactKind");
    expect(failureTag(staple)).toBe("UnsupportedArtifactKind");
    expect(failureTag(assess)).toBe("UnsupportedArtifactKind");
    expect(failureTag(sign)).toBe("UnsupportedArtifactKind");
    expect(existsSync(join(root, "must-not-exist.json"))).toBe(false);
  }, 30_000);
});
