import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { decimalBytes, sha256Digest } from "../../packages/effect-build/src/Artifact.js";
import * as DirectoryGeneration from "../../packages/effect-build/src/Author/internal/DirectoryGeneration.js";

interface ResearchContract {
  readonly evidenceControl: {
    readonly directoryGeneration: {
      readonly manifestBytes: { readonly sample: string; readonly sampleSha256: string };
      readonly currentReferenceBytes: { readonly sample: string; readonly sampleSha256: string };
    };
  };
}

describe("CORE-DIRECTORY-GENERATION architecture", () => {
  it("implements the frozen canonical bytes without widening the exact public core surface", async () => {
    const contract = JSON.parse(
      await readFile("tooling/research-complete-contract.json", "utf8"),
    ) as ResearchContract;
    const generation = contract.evidenceControl.directoryGeneration;
    const sample = JSON.parse(generation.manifestBytes.sample) as {
      readonly files: readonly {
        readonly path: string;
        readonly bytes: string;
        readonly digest: { readonly value: string };
        readonly mediaType: string;
      }[];
    };
    const manifest: DirectoryGeneration.Manifest = {
      protocol: DirectoryGeneration.generationManifestProtocol,
      subject: DirectoryGeneration.staticBrowserSubject,
      files: sample.files.map((file) => ({
        path: file.path,
        bytes: decimalBytes(file.bytes),
        digest: sha256Digest(file.digest.value),
        mediaType: file.mediaType,
      })),
    };
    const manifestBytes = DirectoryGeneration.encodeManifest(manifest);
    const manifestText = new TextDecoder().decode(manifestBytes);
    expect(manifestText).toBe(generation.manifestBytes.sample);
    expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(
      generation.manifestBytes.sampleSha256,
    );
    const digest = sha256Digest(generation.manifestBytes.sampleSha256);
    const currentBytes = DirectoryGeneration.encodeCurrentReference(digest);
    expect(new TextDecoder().decode(currentBytes)).toBe(generation.currentReferenceBytes.sample);
    expect(createHash("sha256").update(currentBytes).digest("hex")).toBe(
      generation.currentReferenceBytes.sampleSha256,
    );

    const packageManifest = JSON.parse(await readFile("packages/effect-build/package.json", "utf8")) as {
      readonly exports: Readonly<Record<string, unknown>>;
    };
    expect(Object.keys(packageManifest.exports)).toHaveLength(7);
    expect(Object.keys(packageManifest.exports)).not.toContain("./Author/Generation");
    expect(Object.keys(packageManifest.exports)).not.toContain("./Author/TreeSnapshot");
    expect(Object.keys(packageManifest.exports).some((subpath) => subpath.includes("internal"))).toBe(false);
    const rootSource = await readFile("packages/effect-build/src/index.ts", "utf8");
    expect(rootSource).not.toContain("DirectoryGeneration");
  });
});
