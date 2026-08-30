import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Artifact from "effect-build/Artifact";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as AppBundle from "../../packages/effect-build-apple/src/AppBundle.js";
import { finalizedFile } from "../fixtures/finalized-artifacts.js";
import { requiredEnvironment, requiredExecutable } from "./acceptance-support.js";

const execute = promisify(execFile);
const clang = requiredExecutable("EFFECT_BUILD_CLANG_BIN");
const plutil = requiredExecutable("EFFECT_BUILD_PLUTIL_BIN");
const lipo = requiredExecutable("EFFECT_BUILD_LIPO_BIN");
const hdiutil = requiredExecutable("EFFECT_BUILD_HDIUTIL_BIN");
const codesign = requiredExecutable("EFFECT_BUILD_CODESIGN_BIN");
const pkgbuild = requiredExecutable("EFFECT_BUILD_PKGBUILD_BIN");
const productbuild = requiredExecutable("EFFECT_BUILD_PRODUCTBUILD_BIN");
const pkgutil = requiredExecutable("EFFECT_BUILD_PKGUTIL_BIN");
const xcodebuild = requiredExecutable("EFFECT_BUILD_XCODEBUILD_BIN");
const toolVersion = requiredEnvironment("EFFECT_BUILD_APPLE_TOOL_VERSION");
const xcodeVersion = requiredEnvironment("EFFECT_BUILD_XCODE_VERSION");
const hostArchitecture = requiredEnvironment("EFFECT_BUILD_APPLE_HOST_ARCH");
if (hostArchitecture !== "arm64" && hostArchitecture !== "x64") {
  throw new Error("EFFECT_BUILD_APPLE_HOST_ARCH must be arm64 or x64");
}
let root = "";
let builtApplications: AppBundle.AppBundles | undefined;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-apple-acceptance-")));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const appleTool = (executable: string) => ({ executable, version: toolVersion });

const sha256 = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");

const compileFixture = async (
  architecture: "arm64" | "x86_64",
  outfile: string,
): Promise<Artifact.HashedExecutable> => {
  const source = join(root, `fixture-${architecture}.c`);
  await writeFile(
    source,
    [
      "#include <stdio.h>",
      "int main(void) {",
      '  puts("effect-build-apple-ok");',
      "  return 0;",
      "}",
      "",
    ].join("\n"),
  );
  await execute(clang, ["-arch", architecture, "-mmacosx-version-min=13.0", source, "-o", outfile]);
  const finalized = await finalizedFile(outfile);
  return {
    ...finalized,
    _tag: "HashedExecutable",
    target: architecture === "arm64" ? "macos-aarch64" : "macos-x64",
    nativeFormat: "mach-o",
    runtime: { name: "native", version: xcodeVersion },
  };
};

const applications = (): AppBundle.AppBundles => {
  if (builtApplications === undefined) throw new Error("the app-bundle acceptance stage did not complete");
  return builtApplications;
};

const launch = async (executable: string): Promise<void> => {
  const completion = await execute(executable, []);
  expect(completion.stdout).toBe("effect-build-apple-ok\n");
};

const assertUnsignedCode = async (target: string): Promise<void> => {
  const failure: unknown = await execute(
    codesign,
    ["--verify", "--deep", "--strict", "--verbose=2", target],
    { env: { ...process.env, LC_ALL: "C" } },
  ).then(() => undefined, (error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const output = failure as Error & { readonly stdout?: string; readonly stderr?: string };
  expect(`${output.stdout ?? ""}\n${output.stderr ?? ""}`).toMatch(
    /(?:code object is not signed at all|code has no resources but signature indicates they must be present)/,
  );
};

const assertUnsignedPackage = async (installer: string): Promise<void> => {
  const observation: unknown = await execute(pkgutil, ["--check-signature", installer], {
    env: { ...process.env, LC_ALL: "C" },
  }).then((completion) => completion, (error: unknown) => error);
  const output = observation as { readonly stdout?: string; readonly stderr?: string };
  expect(`${output.stdout ?? ""}\n${output.stderr ?? ""}`).toContain("Status: no signature");
};

describe.sequential("real Apple-native artifact mechanics", () => {
  it("builds exactly arm64 and x64 unsigned app bundles and launches the matching-host variant", async () => {
    expect(process.arch).toBe(hostArchitecture);
    expect((await execute(xcodebuild, ["-version"])).stdout).toContain(`Xcode ${xcodeVersion}\n`);
    expect((await execute(clang, ["--version"])).stdout).toContain("Apple clang version");
    const arm64Executable = join(root, "fixture-arm64");
    const x64Executable = join(root, "fixture-x64");
    const arm64Artifact = await compileFixture("arm64", arm64Executable);
    const x64Artifact = await compileFixture("x86_64", x64Executable);
    const arm64App = join(root, "EffectBuild-arm64.app");
    const x64App = join(root, "EffectBuild-x64.app");
    const input = {
      bundleIdentifier: "dev.effect-build.acceptance",
      bundleName: "EffectBuildAcceptance",
      displayName: "effect-build acceptance",
      executableName: "effect-build-acceptance",
      version: "123",
      shortVersion: "1.2.3",
      arm64: {
        executable: arm64Artifact,
        outdir: arm64App,
        minimumSystemVersion: "13.0",
      },
      x64: {
        executable: x64Artifact,
        outdir: x64App,
        minimumSystemVersion: "13.0",
      },
    } satisfies AppBundle.BuildAppBundlesInput;
    const output = await Effect.runPromise(
      AppBundle.buildAppBundles(input).pipe(
        Effect.provide(AppBundle.layer({ plutil: appleTool(plutil) })),
        Effect.provide(NodeServices.layer),
      ),
    );
    builtApplications = output;
    expect(output.arm64.root).toBe(arm64App);
    expect(output.x64.root).toBe(x64App);
    expect(output.arm64.provenance).toMatchObject({ name: "plutil", participants: [{ version: toolVersion }] });
    expect(output.x64.provenance).toMatchObject({ name: "plutil", participants: [{ version: toolVersion }] });
    for (const applicationBundle of [output.arm64, output.x64]) {
      expect(applicationBundle.entries.map((entry) => entry.relativePath)).toEqual([
        "Contents",
        "Contents/Info.plist",
        "Contents/MacOS",
        "Contents/MacOS/effect-build-acceptance",
        "Contents/Resources",
      ]);
      for (const file of applicationBundle.entries.filter((entry) => entry.kind === "file")) {
        const absolute = join(applicationBundle.root, ...file.relativePath.split("/"));
        const contents = await readFile(absolute);
        expect(file.bytes).toBe(`${contents.byteLength}`);
        expect(file.digest.value).toBe(createHash("sha256").update(contents).digest("hex"));
        expect(file.mode & 0o777).toBe(file.relativePath.endsWith("/MacOS/effect-build-acceptance") ? 0o755 : 0o644);
      }
    }

    for (const [architecture, app] of [["arm64", arm64App], ["x86_64", x64App]] as const) {
      const info = join(app, "Contents", "Info.plist");
      await execute(plutil, ["-lint", "--", info]);
      const properties: unknown = JSON.parse(
        (await execute(plutil, ["-convert", "json", "-o", "-", "--", info])).stdout,
      );
      expect(properties).toMatchObject({
        CFBundleExecutable: "effect-build-acceptance",
        CFBundleIdentifier: "dev.effect-build.acceptance",
        CFBundlePackageType: "APPL",
        CFBundleShortVersionString: "1.2.3",
        CFBundleVersion: "123",
        LSMinimumSystemVersion: "13.0",
      });
      const binary = join(app, "Contents", "MacOS", "effect-build-acceptance");
      expect((await execute(lipo, ["-archs", binary])).stdout.trim()).toBe(architecture);
      await assertUnsignedCode(app);
    }
    await launch(
      join(hostArchitecture === "arm64" ? arm64App : x64App, "Contents", "MacOS", "effect-build-acceptance"),
    );
  }, 120_000);

  it("exercises direct credential-free hdiutil mechanics without entering the Developer ID release API", async () => {
    const arm64Dmg = join(root, "EffectBuild-arm64.dmg");
    const x64Dmg = join(root, "EffectBuild-x64.dmg");
    for (
      const [architecture, sourceApp, outfile] of [
        ["arm64", applications().arm64.root, arm64Dmg],
        ["x64", applications().x64.root, x64Dmg],
      ] as const
    ) {
      const layout = join(root, `direct-dmg-layout-${architecture}`);
      await mkdir(layout);
      await cp(sourceApp, join(layout, basename(sourceApp)), {
        recursive: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
      });
      await symlink("/Applications", join(layout, "Applications"));
      await execute(hdiutil, [
        "create",
        "-fs",
        "HFS+",
        "-format",
        "UDZO",
        "-volname",
        `EffectBuild ${architecture}`,
        "-srcfolder",
        layout,
        outfile,
      ]);
      expect((await stat(outfile)).size).toBeGreaterThan(0);
      expect(await sha256(outfile)).toMatch(/^[0-9a-f]{64}$/);
    }
    await execute(hdiutil, ["verify", arm64Dmg]);
    await execute(hdiutil, ["verify", x64Dmg]);
    await assertUnsignedCode(arm64Dmg);
    await assertUnsignedCode(x64Dmg);

    const selectedDmg = hostArchitecture === "arm64" ? arm64Dmg : x64Dmg;
    const selectedApp = hostArchitecture === "arm64" ? "EffectBuild-arm64.app" : "EffectBuild-x64.app";
    const mount = join(root, `mounted-${hostArchitecture}`);
    await mkdir(mount);
    await execute(hdiutil, ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, selectedDmg]);
    try {
      expect(await readdir(mount)).toEqual(expect.arrayContaining(["Applications", selectedApp]));
      await assertUnsignedCode(join(mount, selectedApp));
      await launch(join(mount, selectedApp, "Contents", "MacOS", "effect-build-acceptance"));
    } finally {
      await execute(hdiutil, ["detach", mount]);
    }
  }, 180_000);

  it(
    "exercises direct credential-free pkgbuild/productbuild mechanics outside the Developer ID release API",
    async () => {
      const arm64Package = join(root, "EffectBuild-arm64.pkg");
      const x64Package = join(root, "EffectBuild-x64.pkg");
      for (
        const [architecture, app, installer] of [
          ["arm64", applications().arm64.root, arm64Package],
          ["x86_64", applications().x64.root, x64Package],
        ] as const
      ) {
        const identifierArchitecture = architecture === "arm64" ? "arm64" : "x64";
        const component = join(root, `EffectBuild-${architecture}.component.pkg`);
        await execute(pkgbuild, [
          "--component",
          app,
          "--identifier",
          `dev.effect-build.acceptance.${identifierArchitecture}`,
          "--version",
          "1.2.3",
          "--install-location",
          "/Applications",
          component,
        ]);
        await execute(productbuild, ["--package", component, installer]);
        expect((await stat(installer)).size).toBeGreaterThan(0);
        expect(await sha256(installer)).toMatch(/^[0-9a-f]{64}$/);
        await assertUnsignedPackage(installer);
        const appName = `EffectBuild-${architecture === "arm64" ? "arm64" : "x64"}.app`;
        const listing = (await execute(pkgutil, ["--payload-files", installer])).stdout;
        expect(listing).toMatch(
          new RegExp(`(?:^|\\n)(?:\\./)?${appName}/Contents/MacOS/effect-build-acceptance(?:\\n|$)`),
        );
        const expanded = join(root, `expanded-${architecture}`);
        await execute(pkgutil, ["--expand-full", installer, expanded]);
        const paths = await readdir(expanded, { recursive: true });
        const relative = paths.find((path) => path.endsWith(`${appName}/Contents/MacOS/effect-build-acceptance`));
        expect(relative).toBeDefined();
        if (relative !== undefined) {
          const executable = join(expanded, relative);
          expect((await execute(lipo, ["-archs", executable])).stdout.trim()).toBe(architecture);
          await assertUnsignedCode(join(
            expanded,
            relative.slice(0, relative.indexOf(`${appName}/`) + appName.length),
          ));
          if ((hostArchitecture === "arm64" ? "arm64" : "x86_64") === architecture) await launch(executable);
        }
      }
    },
    180_000,
  );
});
