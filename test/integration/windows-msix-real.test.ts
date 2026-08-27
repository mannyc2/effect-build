import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Redacted } from "effect";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import * as Nfpm from "../../packages/effect-build-nfpm/src/Package.js";
import * as Sign from "../../packages/effect-build-windows/src/SignMsix.js";
import { requiredEnvironment, requiredExecutable } from "./acceptance-support.js";

const nfpm = requiredExecutable("EFFECT_BUILD_NFPM_BIN");
const signTool = requiredExecutable("EFFECT_BUILD_SIGNTOOL_BIN");
const signToolVersion = requiredEnvironment("EFFECT_BUILD_SIGNTOOL_VERSION");
const application = requiredExecutable("EFFECT_BUILD_WINDOWS_EXE");
const pfxFile = requiredEnvironment("EFFECT_BUILD_TEST_PFX");
const pfxPassword = requiredEnvironment("EFFECT_BUILD_TEST_PFX_PASSWORD");
const timestampUrl = requiredEnvironment("EFFECT_BUILD_TIMESTAMP_URL");
const outdir = requiredEnvironment("EFFECT_BUILD_ACCEPTANCE_OUTDIR");

const crc32 = (value: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (kind: string, data: Uint8Array): Buffer => {
  const type = Buffer.from(kind, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
};

const solidPng = (width: number, height: number): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = row + 1 + x * 4;
      rows[pixel] = 32;
      rows[pixel + 1] = 96;
      rows[pixel + 2] = 192;
      rows[pixel + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const finalizedFile = async (path: string) => {
  const bytes = await readFile(path);
  return {
    path,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } as const;
};

describe("real nFPM MSIX and Windows SDK Authenticode mechanics", () => {
  it("builds an unsigned MSIX, signs a staged copy with RFC 3161, and records exact native artifacts", async () => {
    await mkdir(outdir, { recursive: true });
    const assets = join(outdir, "assets");
    await mkdir(assets, { recursive: true });
    const logo = join(assets, "logo.png");
    const logo150 = join(assets, "logo150.png");
    const logo44 = join(assets, "logo44.png");
    await writeFile(logo, solidPng(50, 50));
    await writeFile(logo150, solidPng(150, 150));
    await writeFile(logo44, solidPng(44, 44));
    const unsigned = join(outdir, "effect-build-acceptance-unsigned.msix");
    const signed = join(outdir, "effect-build-acceptance-signed.msix");
    const packageInput = new Nfpm.PackageInput({
      metadata: new Nfpm.PackageMetadata({
        name: "effect-build-acceptance",
        version: "1.2.3",
        architecture: "amd64",
        maintainer: "effect-build acceptance <acceptance@example.test>",
        description: "effect-build Windows MSIX acceptance fixture",
        license: "MIT",
        contents: [
          new Nfpm.PackageContent({ artifact: await finalizedFile(application), dst: "/effect-build-acceptance.exe" }),
          new Nfpm.PackageContent({ artifact: await finalizedFile(logo), dst: "/Assets/logo.png" }),
          new Nfpm.PackageContent({ artifact: await finalizedFile(logo150), dst: "/Assets/logo150.png" }),
          new Nfpm.PackageContent({ artifact: await finalizedFile(logo44), dst: "/Assets/logo44.png" }),
        ],
      }),
      release: "0",
      mtime: "2009-11-10T23:00:00Z",
      msix: new Nfpm.MsixOptions({
        publisher: "CN=Effect Build Acceptance",
        properties: new Nfpm.MsixProperties({
          display_name: "effect-build acceptance",
          publisher_display_name: "effect-build acceptance",
          logo: "Assets/logo.png",
        }),
        applications: [
          new Nfpm.MsixApplication({
            id: "EffectBuildAcceptance",
            executable: "effect-build-acceptance.exe",
            entry_point: "Windows.FullTrustApplication",
            visual_elements: new Nfpm.MsixVisualElements({
              display_name: "effect-build acceptance",
              description: "effect-build Windows MSIX acceptance fixture",
              background_color: "transparent",
              square150x150_logo: "Assets/logo150.png",
              square44x44_logo: "Assets/logo44.png",
            }),
          }),
        ],
        dependencies: new Nfpm.MsixDependencies({
          target_device_families: [
            new Nfpm.MsixTargetDeviceFamily({
              name: "Windows.Desktop",
              min_version: "10.0.17763.0",
              max_version_tested: "10.0.26100.0",
            }),
          ],
        }),
      }),
      outfile: unsigned,
    });
    const unsignedArtifact = await Effect.runPromise(
      Nfpm.buildMsix(packageInput).pipe(
        Effect.provide(Nfpm.layer({ executable: nfpm })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(unsignedArtifact.tool).toEqual({ name: "nfpm", version: "2.47.0" });
    const unsignedBytes = await readFile(unsigned);
    expect(unsignedArtifact.bytes).toBe(unsignedBytes.byteLength);
    expect(unsignedArtifact.sha256).toBe(createHash("sha256").update(unsignedBytes).digest("hex"));

    const credential = Sign.pfxCredentialLayer({
      file: pfxFile,
      password: Redacted.make(pfxPassword),
    });
    const signedArtifact = await Effect.runPromise(
      Sign.signMsix(
        new Sign.SignMsixInput({
          source: unsignedArtifact,
          outfile: signed,
          timestampUrl,
          description: "effect-build acceptance",
          descriptionUrl: "https://github.com/mannyc2/effect-build",
        }),
      ).pipe(
        Effect.provide(Sign.layer({ executable: signTool, version: signToolVersion }).pipe(Layer.provide(credential))),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(signedArtifact.tool.name).toBe("signtool");
    expect(signedArtifact.tool.version).toBe(signToolVersion);
    const signedBytes = await readFile(signed);
    expect(signedArtifact.bytes).toBe(signedBytes.byteLength);
    expect(signedArtifact.sha256).toBe(createHash("sha256").update(signedBytes).digest("hex"));
    expect(unsignedBytes).not.toEqual(signedBytes);
  }, 300_000);
});
