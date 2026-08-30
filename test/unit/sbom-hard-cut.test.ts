import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Schema } from "effect";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Sbom from "../../packages/effect-build-sbom/src/Generate.js";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";
import { finalizedFile, finalizedTree } from "../fixtures/finalized-artifacts.js";
import { installFixtureExecutable } from "../fixtures/tools/install-fixture-executable.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-syft-hard-cut.mjs", import.meta.url)));
let root = "";
let executable = "";
let fileSubject: Artifact.HashedFile;
let directorySubject: Artifact.HashedTree;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-sbom-hard-cut-"));
  executable = await installFixtureExecutable({ fixture, root, name: "syft" });
  const subjectPath = join(root, "release.tar.gz");
  const contents = new TextEncoder().encode("finalized archive bytes");
  await writeFile(subjectPath, contents);
  fileSubject = await finalizedFile(subjectPath);
  const directory = join(root, "release-directory");
  await mkdir(directory);
  await writeFile(join(directory, "package.json"), '{"name":"fixture"}\n');
  directorySubject = await finalizedTree(directory);
});

afterEach(() => {
  delete process.env.FAKE_SYFT_LOG;
  delete process.env.FAKE_SYFT_MODE;
  delete process.env.FAKE_SYFT_VERSION;
  delete process.env.FAKE_PROJECT_MARKER;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const input = (
  outfile: string,
  subject: Sbom.ScanSubject = new Sbom.DirectorySubject({ snapshot: directorySubject }),
  overrides: Partial<Sbom.GenerateInput> = {},
) =>
  new Sbom.GenerateInput({
    subject,
    outfile: join(root, outfile),
    ...overrides,
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, Sbom.Generator>,
  options: Sbom.LayerOptions = { executable },
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Sbom.layer(options)),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const absent = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (error as { readonly code?: string }).code === "ENOENT";
  }
};

const logLines = async (path: string) =>
  (await readFile(path, "utf8")).trim().split("\n").map((line) =>
    JSON.parse(line) as { readonly argv: readonly string[]; readonly cwd: string; readonly marker: string }
  );

describe.sequential("Syft SBOM hard-cut operations", () => {
  it("fails layer construction for a missing explicit executable", async () => {
    const exit = await run(Sbom.generateSpdxJson(input("missing-tool.spdx.json")), {
      executable: join(root, "not-syft"),
    });
    const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("SyftToolUnavailable");
    expect(failure.reason).toContain("syft");
    expect(await absent(join(root, "missing-tool.spdx.json"))).toBe(true);
  });

  it("uses one explicit source policy for SPDX directory and CycloneDX file scans", async () => {
    const log = join(root, "subjects.log");
    process.env.FAKE_SYFT_LOG = log;
    process.env.FAKE_PROJECT_MARKER = "preserved";
    const program = Effect.all([
      Sbom.generateSpdxJson(input(
        "release.spdx.json",
        new Sbom.DirectorySubject({ snapshot: directorySubject }),
      )),
      Sbom.generateCycloneDxJson(input(
        "release.cdx.json",
        new Sbom.FileSubject({ artifact: fileSubject }),
      )),
    ]).pipe(
      Effect.provide(Sbom.layer({ executable })),
      Effect.provide(NodeServices.layer),
    );
    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      for (const artifact of exit.value) {
        expect(artifact._tag).toBe("HashedFile");
        expect(artifact.provenance).toMatchObject({
          name: "syft",
          participants: [{ name: "syft", version: "1.50.0" }],
        });
        expect(artifact.digest.value).toMatch(/^[0-9a-f]{64}$/);
      }
    }

    const invocations = await logLines(log);
    expect(invocations.filter(({ argv }) => argv[0] === "version")).toHaveLength(1);
    const scans = invocations.filter(({ argv }) => argv[0] === "scan");
    expect(scans).toHaveLength(2);
    expect(scans[0]?.argv[0]).toBe("scan");
    expect(basename(scans[0]?.argv[1] ?? "")).toMatch(/^effect-build-tree-snapshot-/);
    expect(scans[0]?.argv.slice(2, 4)).toEqual(["--from", "dir"]);
    expect(scans[0]?.argv[4]).toBe("--output");
    const spdxOutput = scans[0]?.argv[5]?.replace(/^spdx-json@2\.3=/, "") ?? "";
    expect(basename(dirname(spdxOutput))).toMatch(/^\.effect-build-/);
    expect(scans[0]?.argv[6]).toBe("--quiet");
    expect(scans[1]?.argv[0]).toBe("scan");
    const fileSubjectPath = scans[1]?.argv[1] ?? "";
    expect(basename(dirname(fileSubjectPath))).toBe("effect-build-sbom-subject");
    expect(basename(dirname(dirname(fileSubjectPath)))).toMatch(/^\.effect-build-file-/);
    expect(basename(fileSubjectPath)).toBe("release.tar.gz");
    expect(scans[1]?.argv.slice(2, 4)).toEqual(["--from", "file"]);
    const cyclonedxOutput = scans[1]?.argv[5]?.replace(/^cyclonedx-json@1\.6=/, "") ?? "";
    expect(basename(dirname(cyclonedxOutput))).toMatch(/^\.effect-build-/);
    expect(scans.every(({ marker }) => marker === "preserved")).toBe(true);

    const spdx = JSON.parse(await readFile(join(root, "release.spdx.json"), "utf8"));
    const cyclonedx = JSON.parse(await readFile(join(root, "release.cdx.json"), "utf8"));
    expect(Schema.decodeUnknownSync(Sbom.SpdxJsonDocument)(spdx).packages).toHaveLength(1);
    expect(Schema.decodeUnknownSync(Sbom.CycloneDxJsonDocument)(cyclonedx).components).toHaveLength(1);
  });

  it("reauthenticates the selected Syft bytes immediately before scan launch", async () => {
    const original = await readFile(executable);
    const program = Effect.gen(function*() {
      yield* Effect.promise(() => writeFile(executable, "#!/bin/sh\nexit 0\n"));
      return yield* Sbom.generateSpdxJson(input("changed-tool.spdx.json"));
    }).pipe(
      Effect.provide(Sbom.layer({ executable })),
      Effect.provide(NodeServices.layer),
    );
    try {
      const failure = failureOf(await Effect.runPromiseExit(program)) as { readonly _tag: string };
      expect(failure._tag).toBe("SyftToolChanged");
    } finally {
      await writeFile(executable, original);
    }
  });

  it("preserves native Syft diagnostics and leaves no final file", async () => {
    process.env.FAKE_SYFT_MODE = "fail";
    const destination = join(root, "failed.spdx.json");
    const failure = failureOf(await run(Sbom.generateSpdxJson(input("failed.spdx.json")))) as {
      readonly _tag: string;
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    };
    expect(failure).toMatchObject({
      _tag: "SyftCommandFailed",
      exitCode: 23,
      stdout: "native syft stdout",
      stderr: "native syft stderr",
    });
    expect(await absent(destination)).toBe(true);
  });

  it("reports missing SBOM output as FileCandidateMissing and cleans staging", async () => {
    process.env.FAKE_SYFT_MODE = "missing";
    const failure = failureOf(
      await run(Sbom.generateCycloneDxJson(input("missing.cdx.json"))),
    ) as { readonly _tag: string; readonly stagedPath: string };
    expect(failure._tag).toBe("FileCandidateMissing");
    expect(failure.stagedPath).toContain("missing.cdx.json");
    expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
  });

  it("rejects a schema-invalid document before publication", async () => {
    process.env.FAKE_SYFT_MODE = "invalid";
    const destination = join(root, "invalid.spdx.json");
    const failure = failureOf(
      await run(Sbom.generateSpdxJson(input("invalid.spdx.json"))),
    ) as { readonly _tag: string; readonly format: string; readonly reason: string };
    expect(failure._tag).toBe("SbomInvalid");
    expect(failure.format).toBe("spdx-json");
    expect(failure.reason).toContain("SPDX-2.3");
    expect(await absent(destination)).toBe(true);
  });

  it("rejects invalid UTF-8 before the exact captured bytes can be published", async () => {
    process.env.FAKE_SYFT_MODE = "invalid-utf8";
    const destination = join(root, "invalid-utf8.spdx.json");
    const failure = failureOf(
      await run(Sbom.generateSpdxJson(input("invalid-utf8.spdx.json"))),
    ) as { readonly _tag: string; readonly format: string; readonly reason: string };
    expect(failure).toMatchObject({ _tag: "SbomInvalid", format: "spdx-json" });
    expect(failure.reason).toContain("parse JSON");
    expect(await absent(destination)).toBe(true);
  });

  it("rejects format/output extension mismatches before Syft can run", async () => {
    const destination = join(root, "wrong.cdx.json");
    const failure = failureOf(
      await run(Sbom.generateSpdxJson(input("wrong.cdx.json"))),
    ) as { readonly _tag: string; readonly format: string; readonly reason: string };
    expect(failure).toMatchObject({ _tag: "SbomInvalid", format: "spdx-json" });
    expect(failure.reason).toContain("must end with .spdx.json");
    expect(await absent(destination)).toBe(true);
  });

  it("rejects an unrecognized output format before Syft can run", async () => {
    const destination = join(root, "invalid-format.json");
    const failure = failureOf(
      await run(Sbom.generate("syft-json" as unknown as Sbom.OutputFormat, input("invalid-format.json"))),
    ) as { readonly _tag: string; readonly format: string; readonly reason: string };
    expect(failure).toMatchObject({ _tag: "SbomInvalid", format: "syft-json" });
    expect(failure.reason).toContain("decode selected format");
    expect(await absent(destination)).toBe(true);
  });

  it("always records a digest and warns rather than rejecting an untested version", async () => {
    process.env.FAKE_SYFT_VERSION = "9.9.9";
    const exit = await run(Sbom.generateSpdxJson(input("untested.spdx.json")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.provenance).toMatchObject({ participants: [{ version: "9.9.9" }] });
      expect(exit.value.digest.value).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("exports closed subject, document, and format schemas", () => {
    expect(Schema.decodeUnknownSync(Sbom.ScanSubject)({ _tag: "Directory", snapshot: directorySubject })._tag)
      .toBe("Directory");
    expect(() => Schema.decodeUnknownSync(Sbom.ScanSubject)({ _tag: "Image", path: "alpine" })).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Sbom.SpdxJsonDocument)({
        spdxVersion: "SPDX-2.2",
        dataLicense: "CC0-1.0",
        SPDXID: "SPDXRef-DOCUMENT",
        name: "bad",
        documentNamespace: "https://example.test/bad",
        creationInfo: {},
      })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Sbom.CycloneDxJsonDocument)({
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        version: 1,
        components: [],
      })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Sbom.SpdxPackage)({
        SPDXID: "SPDXRef-Package-fixture",
        name: "fixture",
      })
    ).toThrow();
    for (
      const invalid of [
        {
          bomFormat: "CycloneDX",
          specVersion: "1.6",
          version: 0,
          components: [{ type: "library", name: "fixture" }],
        },
        {
          bomFormat: "CycloneDX",
          specVersion: "1.6",
          version: 1,
          components: [{ type: "arbitrary", name: "fixture" }],
        },
      ]
    ) {
      expect(() => Schema.decodeUnknownSync(Sbom.CycloneDxJsonDocument)(invalid)).toThrow();
    }
    for (const format of Sbom.OutputFormat.literals) {
      const projection = Schema.decodeUnknownSync(Sbom.FormatProjection)(Sbom.formatProjection(format));
      expect(projection.format).toBe(format);
      expect(projection.mediaType).toContain("json");
    }
    expect(() => Sbom.formatProjection("syft-json" as unknown as Sbom.OutputFormat)).toThrow();
  });
});
