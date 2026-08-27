import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Schema } from "effect";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Nfpm from "../../packages/effect-build-nfpm/src/Package.js";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";
import { installFixtureExecutable } from "../fixtures/tools/install-fixture-executable.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-nfpm-hard-cut.mjs", import.meta.url)));
let root = "";
let executable = "";
let payload: Artifact.FinalizedFile;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-nfpm-hard-cut-"));
  executable = await installFixtureExecutable({ fixture, root, name: "nfpm" });
  const payloadPath = join(root, "fixture-cli");
  const contents = new TextEncoder().encode("#!/bin/sh\nprintf 'fixture-cli-ok\\n'\n");
  await writeFile(payloadPath, contents);
  payload = {
    path: payloadPath,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
});

afterEach(() => {
  delete process.env.FAKE_NFPM_LOG;
  delete process.env.FAKE_NFPM_MODE;
  delete process.env.FAKE_NFPM_VERSION;
  delete process.env.FAKE_PROJECT_MARKER;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const input = (outfile: string, overrides: Partial<Nfpm.PackageInput> = {}) =>
  new Nfpm.PackageInput({
    metadata: new Nfpm.PackageMetadata({
      name: "fixture-cli",
      version: "1.2.3",
      architecture: "amd64",
      maintainer: "Release Team <release@example.test>",
      description: "Fixture command line application",
      contents: [
        new Nfpm.PackageContent({
          artifact: payload,
          dst: "/usr/bin/fixture-cli",
          mode: 493,
        }),
      ],
      license: "MIT",
      dependencies: ["ca-certificates"],
    }),
    release: "1",
    mtime: "2009-11-10T23:00:00Z",
    ...(outfile.endsWith(".msix")
      ? {
        msix: new Nfpm.MsixOptions({
          publisher: "CN=Fixture",
          properties: new Nfpm.MsixProperties({
            display_name: "Fixture CLI",
            publisher_display_name: "Fixture Publisher",
            logo: "Assets/logo.png",
          }),
          applications: [
            new Nfpm.MsixApplication({
              id: "FixtureCli",
              executable: "fixture-cli.exe",
              entry_point: "Windows.FullTrustApplication",
              visual_elements: new Nfpm.MsixVisualElements({
                display_name: "Fixture CLI",
                description: "Fixture command line application",
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
      }
      : {}),
    outfile: join(root, outfile),
    ...overrides,
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, Nfpm.Packager>,
  options: Nfpm.LayerOptions = { executable },
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(Nfpm.layer(options)),
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
    JSON.parse(line) as {
      readonly argv: readonly string[];
      readonly cwd: string;
      readonly marker: string;
      readonly configuration?: Record<string, unknown>;
    }
  );

describe.sequential("nFPM hard-cut package operations", () => {
  it("fails layer construction for a missing explicit executable", async () => {
    const exit = await run(Nfpm.buildDeb(input("missing-tool.deb")), {
      executable: join(root, "not-nfpm"),
    });
    const failure = failureOf(exit) as { readonly _tag: string; readonly tool: string };
    expect(failure._tag).toBe("ToolNotFound");
    expect(failure.tool).toBe("nfpm");
    expect(await absent(join(root, "missing-tool.deb"))).toBe(true);
  });

  it("builds all five selected formats with closed exact argv", async () => {
    const cases = [
      ["deb", Nfpm.buildDeb, "fixture.deb"],
      ["rpm", Nfpm.buildRpm, "fixture.rpm"],
      ["apk", Nfpm.buildApk, "fixture.apk"],
      ["archlinux", Nfpm.buildArchLinux, "fixture.pkg.tar.zst"],
      ["msix", Nfpm.buildMsix, "fixture.msix"],
    ] as const;

    for (const [format, operation, name] of cases) {
      const log = join(root, `${format}.log`);
      process.env.FAKE_NFPM_LOG = log;
      process.env.FAKE_PROJECT_MARKER = "preserved";
      const exit = await run(operation(input(name)));
      expect(Exit.isSuccess(exit), format).toBe(true);
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toMatchObject({
          _tag: "File",
          path: join(root, name),
          tool: { name: "nfpm", version: "2.47.0" },
        });
        expect(exit.value.bytes).toBeGreaterThan(0);
        expect(exit.value.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      const invocations = await logLines(log);
      expect(invocations.map(({ argv }) => argv)).toHaveLength(2);
      expect(invocations[0]?.argv).toEqual(["--version"]);
      const packageArgv = invocations[1]?.argv ?? [];
      expect(packageArgv.slice(0, 2)).toEqual([
        "package",
        "--config",
      ]);
      expect(packageArgv[2]).toContain("/.effect-build-");
      expect(packageArgv[2]?.endsWith("/nfpm.json")).toBe(true);
      expect(packageArgv.slice(3, 5)).toEqual([
        "--packager",
        format,
      ]);
      expect(packageArgv[5]).toBe("--target");
      expect(packageArgv[6]).toContain(`/.effect-build-`);
      expect(packageArgv[6]?.endsWith(name)).toBe(true);
      expect(invocations[1]?.marker).toBe("preserved");
      const configuration = invocations[1]?.configuration;
      expect(configuration).toMatchObject({
        name: "fixture-cli",
        version: "1.2.3",
        arch: "amd64",
        disable_globbing: true,
        maintainer: "Release Team <release@example.test>",
        description: "Fixture command line application",
        license: "MIT",
        depends: ["ca-certificates"],
        release: "1",
        contents: [{
          src: expect.stringMatching(/\/\.effect-build-[^/]+\/inputs\/0$/),
          dst: "/usr/bin/fixture-cli",
          type: "file",
          expand: false,
          file_info: { mode: 493 },
        }],
      });
      if (format === "msix") {
        expect(configuration).toMatchObject({
          msix: {
            publisher: "CN=Fixture",
            properties: {
              display_name: "Fixture CLI",
              publisher_display_name: "Fixture Publisher",
              logo: "Assets/logo.png",
            },
          },
        });
      } else {
        expect(configuration).not.toHaveProperty("msix");
      }
      delete process.env.FAKE_NFPM_LOG;
    }
  });

  it("probes one resolved tool once for multiple operations in one layer", async () => {
    const log = join(root, "resolve-once.log");
    process.env.FAKE_NFPM_LOG = log;
    const program = Effect.all([
      Nfpm.buildDeb(input("once-a.deb")),
      Nfpm.buildRpm(input("once-b.rpm")),
    ]).pipe(
      Effect.provide(Nfpm.layer({ executable })),
      Effect.provide(NodeServices.layer),
    );
    const exit = await Effect.runPromiseExit(program);
    expect(Exit.isSuccess(exit)).toBe(true);
    const invocations = await logLines(log);
    expect(invocations.filter(({ argv }) => argv[0] === "--version")).toHaveLength(1);
    expect(invocations.filter(({ argv }) => argv[0] === "package")).toHaveLength(2);
  });

  it("preserves native failure diagnostics and does not finalize output", async () => {
    process.env.FAKE_NFPM_MODE = "fail";
    const destination = join(root, "failed.deb");
    const failure = failureOf(await run(Nfpm.buildDeb(input("failed.deb")))) as {
      readonly _tag: string;
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    };
    expect(failure).toMatchObject({
      _tag: "ToolFailed",
      exitCode: 19,
      stdout: "native nfpm stdout",
      stderr: "native nfpm stderr",
    });
    expect(await absent(destination)).toBe(true);
  });

  it("reports missing tool output as PublishFailed and cleans staging", async () => {
    process.env.FAKE_NFPM_MODE = "missing";
    const failure = failureOf(await run(Nfpm.buildApk(input("missing.apk")))) as {
      readonly _tag: string;
      readonly reason: string;
    };
    expect(failure._tag).toBe("PublishFailed");
    expect(failure.reason).toContain("did not produce");
    expect((await readdir(root)).some((name) => name.startsWith(".effect-build-"))).toBe(false);
  });

  it("always records a digest and warns rather than rejecting an untested version", async () => {
    process.env.FAKE_NFPM_VERSION = "9.9.9";
    const exit = await run(Nfpm.buildRpm(input("untested.rpm")));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.tool.version).toBe("9.9.9");
      expect(exit.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("rejects payload bytes changed after finalization before nFPM runs", async () => {
    await writeFile(payload.path, "mutated payload");
    const exit = await run(Nfpm.buildDeb(input("mutated.deb")));
    const failure = failureOf(exit) as { readonly _tag: string; readonly reason: string };
    expect(failure._tag).toBe("ArtifactVerificationFailed");
    await writeFile(payload.path, "#!/bin/sh\nprintf 'fixture-cli-ok\\n'\n");
  });

  it("rejects removed native escape hatches and excess nested fields before nFPM runs", async () => {
    const valid = input("rejected-native.deb");
    const candidates = [
      { ...valid, native: { overrides: { deb: { contents: [{ src: "/tmp/unverified" }] } } } },
      {
        ...valid,
        metadata: {
          ...valid.metadata,
          contents: [{ ...valid.metadata.contents[0], native: { file_info: { mode: 493 } } }],
        },
      },
      { ...valid, release: "$RELEASE_VERSION" },
      { ...valid, mtime: "2026-99-99T99:99:99Z" },
      { ...valid, mtime: "2026-02-30T00:00:00Z" },
    ] as const;

    for (const candidate of candidates) {
      const failure = failureOf(
        await run(Nfpm.buildDeb(candidate as unknown as Nfpm.PackageInput)),
      ) as { readonly _tag: string; readonly path: string };
      expect(failure).toMatchObject({ _tag: "NfpmConfigurationRejected", path: "input" });
    }
    expect(await absent(valid.outfile)).toBe(true);
  });

  it("rejects format/output mismatches and MSIX metadata on non-MSIX formats", async () => {
    const wrongExtension = input("wrong-extension.rpm");
    const extensionFailure = failureOf(await run(Nfpm.buildDeb(wrongExtension))) as {
      readonly _tag: string;
      readonly path: string;
    };
    expect(extensionFailure).toMatchObject({ _tag: "NfpmConfigurationRejected", path: "input.outfile" });
    expect(await absent(wrongExtension.outfile)).toBe(true);

    const msix = input("metadata.msix");
    if (msix.msix === undefined) throw new Error("MSIX fixture did not include required metadata");
    const invalid = new Nfpm.PackageInput({ ...input("metadata.deb"), msix: msix.msix });
    const metadataFailure = failureOf(await run(Nfpm.buildDeb(invalid))) as {
      readonly _tag: string;
      readonly path: string;
    };
    expect(metadataFailure).toMatchObject({ _tag: "NfpmConfigurationRejected", path: "input.msix" });
    expect(await absent(invalid.outfile)).toBe(true);
  });

  it("rejects deferred formats and noncanonical package paths at the operation boundary", async () => {
    const deferred = join(root, "deferred.ipk");
    const deferredFailure = failureOf(
      await run(Nfpm.buildPackage("ipk" as unknown as Nfpm.Format, input("deferred.ipk"))),
    ) as { readonly _tag: string; readonly path: string };
    expect(deferredFailure).toMatchObject({ _tag: "NfpmConfigurationRejected", path: "format" });
    expect(await absent(deferred)).toBe(true);

    for (
      const [label, dst] of [
        ["relative", "usr/bin/fixture-cli"],
        ["traversal", "/../../usr/bin/fixture-cli"],
        ["dot", "/usr/./bin/fixture-cli"],
        ["empty segment", "/usr//bin/fixture-cli"],
        ["backslash", "/usr\\bin\\fixture-cli"],
        ["root", "/"],
        ["trailing slash", "/usr/bin/fixture-cli/"],
      ] as const
    ) {
      const valid = input(`invalid-path-${label}.deb`);
      const candidate = {
        ...valid,
        metadata: {
          ...valid.metadata,
          contents: [{ ...valid.metadata.contents[0], dst }],
        },
      } as unknown as Nfpm.PackageInput;
      const failure = failureOf(await run(Nfpm.buildDeb(candidate))) as {
        readonly _tag: string;
        readonly path: string;
      };
      expect(failure).toMatchObject({ _tag: "NfpmConfigurationRejected", path: "input" });
      expect(await absent(valid.outfile)).toBe(true);
    }
  });

  it("exports schema-checkable closed input and format projections", () => {
    expect(() => Schema.decodeUnknownSync(Nfpm.PackageInput)({ metadata: {}, outfile: "x" })).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Nfpm.PackageMetadata)({
        name: "fixture",
        version: "$RELEASE_VERSION",
        architecture: "amd64",
        maintainer: "Release Team",
        description: "fixture",
        contents: [],
      })
    ).toThrow();
    expect(() => Nfpm.formatProjection("ipk" as unknown as Nfpm.Format)).toThrow();
    for (const format of Nfpm.Format.literals) {
      const projection = Schema.decodeUnknownSync(Nfpm.FormatProjection)(Nfpm.formatProjection(format));
      expect(projection.format).toBe(format);
      expect(projection.extension.startsWith(".")).toBe(true);
      expect(projection.mediaType).toContain("/");
    }
  });
});
