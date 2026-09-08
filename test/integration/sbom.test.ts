import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Sbom from "effect-build-sbom";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_SYFT_BIN;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_SYFT_BIN to the exact Syft executable under test");
const run = <A, E>(effect: Effect.Effect<A, E, Sbom.Sbom | NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Sbom.layer({ executable })), Effect.provide(NodeServices.layer)));
const producer = { name: "fixture", version: "0.7.0" };
const formats = ["spdx-json", "cyclonedx-json"] as const;
const readDocument = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8"));
const expectFormat = (document: unknown, format: Sbom.Format) => expect(document).toMatchObject(format === "spdx-json"
  ? { spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT" }
  : { bomFormat: "CycloneDX", specVersion: "1.6" });
const expectPackage = (document: unknown, format: Sbom.Format) => expect(document).toMatchObject(format === "spdx-json"
  ? { packages: expect.arrayContaining([expect.objectContaining({ name: "left-pad", versionInfo: "1.3.0" })]) }
  : { components: expect.arrayContaining([expect.objectContaining({ name: "left-pad", version: "1.3.0" })]) });
let root: string;
let subjectRoot: string;
let lockfile: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-sbom-")));
  subjectRoot = join(root, "subject");
  lockfile = join(subjectRoot, "package-lock.json");
  await mkdir(subjectRoot);
  const metadata = { name: "effect-build-sbom-fixture", version: "1.2.3", dependencies: { "left-pad": "1.3.0" } };
  await writeFile(join(subjectRoot, "package.json"), JSON.stringify(metadata));
  await writeFile(lockfile, JSON.stringify({
    name: metadata.name, version: metadata.version, lockfileVersion: 3, requires: true,
    packages: {
      "": metadata,
      "node_modules/left-pad": { version: "1.3.0", resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz" },
    },
  }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real Syft SBOM generation", () => {
  it.each(formats)("detects package coordinates in a directory and writes %s without a required extension", async (format) => {
    const subject = await run(Artifact.directory(subjectRoot, producer));
    const artifact = await run(Sbom.generate({ subject, format, outfile: `dist/${format}`, cwd: root }));
    expect(artifact.path).toBe(join(root, "dist", format));
    expect(artifact.producedBy.name).toBe("syft");
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    const document = await readDocument(artifact.path);
    expectFormat(document, format);
    expectPackage(document, format);
    expect(await run(Artifact.verify(subject))).toEqual(subject);
    expect(await readdir(join(root, "dist"))).toEqual([format]);
  }, 60_000);

  it.each(formats)("preserves package-lock.json detection when scanning one file as %s", async (format) => {
    const subject = await run(Artifact.file(lockfile, producer));
    const artifact = await run(Sbom.generate({ subject, format, outfile: `file-${format}`, cwd: root, atomic: false }));
    const document = await readDocument(artifact.path);
    expectFormat(document, format);
    expectPackage(document, format);
    if (format === "spdx-json") expect(document).toMatchObject({ name: "package-lock.json" });
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    expect(await run(Artifact.verify(subject))).toEqual(subject);
    expect((await readdir(root)).sort()).toEqual([`file-${format}`, "subject"].sort());
  }, 60_000);

  it.each(formats)("accepts a refined executable with no detected packages as %s", async (format) => {
    const main = join(root, "main.c");
    const program = join(root, "program");
    await writeFile(main, "int main(void) { return 0; }\n");
    await execute("cc", [main, "-o", program], { timeout: 30_000 });
    const binary = await run(Artifact.executable(program, producer));
    const subject = { ...binary, runtime: { path: program, sha256: binary.sha256 } };
    const artifact = await run(Sbom.generate({ subject, format, outfile: join(root, "executable-sbom") }));
    const document = await readDocument(artifact.path);
    expectFormat(document, format);
    if (format === "cyclonedx-json") {
      const components = typeof document === "object" && document !== null && "components" in document ? document.components : [];
      expect(components).toEqual([]);
      expect(document).toMatchObject({ metadata: { component: { name: "program", type: "file" } } });
    }
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    expect(await run(Artifact.verify(binary))).toEqual(binary);
  }, 60_000);

  it.each(["file", "directory"] as const)("rejects changed %s subjects while preserving an existing document", async (kind) => {
    const subject = kind === "file"
      ? await run(Artifact.file(lockfile, producer))
      : await run(Artifact.directory(subjectRoot, producer));
    const outfile = join(root, "existing-sbom");
    await writeFile(outfile, "previous document");
    await writeFile(lockfile, "changed bytes\n");
    const error = await run(Sbom.generate({ subject, format: "spdx-json", outfile }).pipe(Effect.flip));
    expect(error).toMatchObject({ _tag: "ArtifactError", reason: "changed", path: subject.path });
    expect(await readFile(outfile, "utf8")).toBe("previous document");
    expect((await readdir(root)).sort()).toEqual(["existing-sbom", "subject"]);
  });

  it("retains native Syft diagnostics and rolls back when its configuration is invalid", async () => {
    const subject = await run(Artifact.file(lockfile, producer));
    const outfile = join(root, "existing-sbom");
    await writeFile(outfile, "previous document");
    await writeFile(join(root, ".syft.yaml"), "catalogers: [\n");
    const error = await run(Sbom.generate({ subject, format: "spdx-json", outfile, cwd: root }).pipe(Effect.flip));
    expect(error).toBeInstanceOf(Tool.Failed);
    if (error instanceof Tool.Failed) expect(error.stderr.length).toBeGreaterThan(0);
    expect(await readFile(outfile, "utf8")).toBe("previous document");
    expect((await readdir(root)).sort()).toEqual([".syft.yaml", "existing-sbom", "subject"]);
  }, 60_000);
});
