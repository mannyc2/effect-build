import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import * as Sbom from "../../packages/effect-build-sbom/src/Generate.js";
import { finalizedFile, finalizedTree } from "../fixtures/finalized-artifacts.js";
import { requiredEnvironment, requiredExecutable } from "./acceptance-support.js";

const execute = promisify(execFile);
const syft = requiredExecutable("EFFECT_BUILD_SYFT_BIN");
const bash = requiredExecutable("EFFECT_BUILD_BASH_BIN");
requiredExecutable("EFFECT_BUILD_DOCKER_BIN");
requiredExecutable("EFFECT_BUILD_SBOM_UTILITY_BIN");
const outdir = requiredEnvironment("EFFECT_BUILD_ACCEPTANCE_OUTDIR");
const subject = resolve(fileURLToPath(new URL("./fixtures/sbom-subject", import.meta.url)));
const oracle = resolve(fileURLToPath(new URL("../../scripts/acceptance/assert-sbom-documents.sh", import.meta.url)));

const run = <A, E>(effect: Effect.Effect<A, E, Sbom.Generator>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Sbom.layer({ executable: syft })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const verifyPublishedArtifact = async (artifact: {
  readonly path: string;
  readonly bytes: string;
  readonly digest: { readonly value: string };
}) => {
  const contents = await readFile(artifact.path);
  expect(artifact.bytes).toBe(String(contents.byteLength));
  expect(artifact.digest.value).toBe(createHash("sha256").update(contents).digest("hex"));
};

describe("real Syft 1.50.0 SBOM acceptance", () => {
  it("generates and independently validates directory and extension-sensitive file subjects", async () => {
    await mkdir(outdir, { recursive: true });
    const spdxPath = join(outdir, "acceptance.spdx.json");
    const cyclonedxPath = join(outdir, "acceptance.cdx.json");
    const snapshot = await finalizedTree(subject);
    const input = (outfile: string) =>
      new Sbom.GenerateInput({
        subject: new Sbom.DirectorySubject({ snapshot }),
        outfile,
      });
    const [spdxArtifact, cyclonedxArtifact] = await run(Effect.all([
      Sbom.generateSpdxJson(input(spdxPath)),
      Sbom.generateCycloneDxJson(input(cyclonedxPath)),
    ], { concurrency: 1 }));
    expect(spdxArtifact.provenance).toMatchObject({
      name: "syft",
      participants: [{ name: "syft", version: "1.50.0" }],
    });
    expect(cyclonedxArtifact.provenance).toEqual(spdxArtifact.provenance);
    await verifyPublishedArtifact(spdxArtifact);
    await verifyPublishedArtifact(cyclonedxArtifact);

    const spdxUnknown: unknown = JSON.parse(await readFile(spdxPath, "utf8"));
    const cyclonedxUnknown: unknown = JSON.parse(await readFile(cyclonedxPath, "utf8"));
    const spdx = Schema.decodeUnknownSync(Sbom.SpdxJsonDocument)(spdxUnknown);
    const cyclonedx = Schema.decodeUnknownSync(Sbom.CycloneDxJsonDocument)(cyclonedxUnknown);
    expect(spdx.spdxVersion).toBe("SPDX-2.3");
    expect(spdx.packages.some((component) => component.name === "left-pad" && component.versionInfo === "1.3.0"))
      .toBe(true);
    expect(cyclonedx.bomFormat).toBe("CycloneDX");
    expect(cyclonedx.specVersion).toBe("1.6");
    expect(cyclonedx.components?.some((component) => component.name === "left-pad" && component.version === "1.3.0"))
      .toBe(true);

    // These assertions are intentionally independent of effect-build's schemas.
    expect(spdxUnknown).toMatchObject({
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: "SPDXRef-DOCUMENT",
    });
    expect(cyclonedxUnknown).toMatchObject({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: expect.any(Number),
    });

    const lockfile = join(subject, "package-lock.json");
    const fileSpdxPath = join(outdir, "file-subject.spdx.json");
    const fileSpdxArtifact = await run(Sbom.generateSpdxJson(
      new Sbom.GenerateInput({
        subject: new Sbom.FileSubject({
          artifact: await finalizedFile(lockfile),
        }),
        outfile: fileSpdxPath,
      }),
    ));
    expect(fileSpdxArtifact.provenance).toMatchObject({
      name: "syft",
      participants: [{ name: "syft", version: "1.50.0" }],
    });
    await verifyPublishedArtifact(fileSpdxArtifact);
    const fileSpdxUnknown: unknown = JSON.parse(await readFile(fileSpdxPath, "utf8"));
    const fileSpdx = Schema.decodeUnknownSync(Sbom.SpdxJsonDocument)(fileSpdxUnknown);
    expect(fileSpdx.name).toBe("package-lock.json");
    expect(fileSpdx.packages.some((component) => component.name === "left-pad" && component.versionInfo === "1.3.0"))
      .toBe(true);
    expect(fileSpdxUnknown).toMatchObject({
      spdxVersion: "SPDX-2.3",
      name: "package-lock.json",
      packages: expect.arrayContaining([expect.objectContaining({ name: "left-pad", versionInfo: "1.3.0" })]),
    });

    await writeFile(
      join(outdir, "invalid.spdx.json"),
      JSON.stringify({
        ...(spdxUnknown as Readonly<Record<string, unknown>>),
        packages: "invalid",
      }),
    );
    await writeFile(
      join(outdir, "invalid.cdx.json"),
      JSON.stringify({
        ...(cyclonedxUnknown as Readonly<Record<string, unknown>>),
        version: "invalid",
      }),
    );
    const validation = await execute(bash, [oracle, resolve(outdir)], { maxBuffer: 8 * 1024 * 1024 });
    expect(validation.stdout).toContain("spdx-valid:ok");
    expect(validation.stdout).toContain("cyclonedx-valid:ok");
    expect(validation.stdout).toContain("file-subject-spdx-valid:ok");
    expect(validation.stdout).toContain("spdx-invalid-exit-2:ok");
    expect(validation.stdout).toContain("cyclonedx-invalid-exit-2:ok");
  }, 180_000);
});
