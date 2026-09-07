import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Nfpm from "effect-build-nfpm";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_NFPM_BIN;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_NFPM_BIN to the exact nFPM executable under test");
const archiveTool = process.platform === "linux" ? "bsdtar" : "tar";
const run = <A, E>(effect: Effect.Effect<A, E, Nfpm.Nfpm | NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Nfpm.layer({ executable })), Effect.provide(NodeServices.layer)));
const observe = (path: string) => run(Artifact.file(path, { name: "fixture", version: "0.7.0" }));
const extension = { deb: ".deb", rpm: ".rpm", apk: ".apk", archlinux: ".pkg.tar.zst", msix: ".msix" } as const;
let root: string;
let binary: Artifact.Executable;
let message: Artifact.File;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-nfpm-")));
  const source = join(root, "echo");
  const main = join(root, "main.c");
  await writeFile(main, '#include <stdio.h>\nint main(int argc, char **argv) { return puts(argc > 1 ? argv[1] : "fixture") < 0; }\n');
  await execute("cc", [main, "-o", source], { timeout: 30_000 });
  await rm(main);
  binary = await run(Artifact.executable(source, { name: "fixture", version: "0.7.0" }));
  const readme = join(root, "message.txt");
  await writeFile(readme, "packaged message\n");
  message = await observe(readme);
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const input = (format: Nfpm.Format): Nfpm.PackageInput => ({
  format,
  name: "effect-build-fixture",
  version: "1.2.3",
  architecture: process.arch === "arm64" ? "arm64" : "amd64",
  maintainer: "effect-build <fixture@example.test>",
  description: "Real nFPM package fixture",
  release: "1",
  mtime: "2009-11-10T23:00:00Z",
  homepage: "https://example.test",
  license: "MIT",
  vendor: "effect-build",
  contents: [
    { artifact: binary, dst: "/usr/bin/effect-build-fixture" },
    { artifact: message, dst: "/usr/share/effect-build-fixture/message.txt", mode: 0o640 },
  ],
  outfile: `dist/fixture${extension[format]}`,
  cwd: root,
});

describe("real nFPM packages", () => {
  it.each(["deb", "rpm", "apk", "archlinux"] as const)("preserves executable and file bytes and modes in %s", async (format) => {
    const artifact = await run(Nfpm.package(input(format)));
    expect(artifact.path).toBe(join(root, "dist", `fixture${extension[format]}`));
    expect(artifact.producedBy.name).toBe("nfpm");
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    const extracted = join(root, "extracted");
    await mkdir(extracted);
    let payload = artifact.path;
    if (format === "deb") {
      const members = (await execute("ar", ["-t", artifact.path])).stdout.trim().split("\n");
      expect(members).toContain("debian-binary");
      await execute("ar", ["-x", artifact.path], { cwd: extracted });
      const data = members.find((name) => name.startsWith("data.tar"));
      expect(data).toBeDefined();
      payload = join(extracted, data!);
      if (process.platform === "linux") {
        const info = await execute("dpkg-deb", ["--field", artifact.path, "Package", "Version", "Architecture"]);
        expect(info.stdout).toContain("Package: effect-build-fixture");
        expect(info.stdout).toContain("Version: 1.2.3-1");
      }
    }
    await execute(archiveTool, ["-xf", payload, "-C", extracted]);
    const packagedBinary = join(extracted, "usr/bin/effect-build-fixture");
    const packagedMessage = join(extracted, "usr/share/effect-build-fixture/message.txt");
    expect(await readFile(packagedBinary)).toEqual(await readFile(binary.path));
    expect(await readFile(packagedMessage, "utf8")).toBe("packaged message\n");
    expect((await stat(packagedBinary)).mode & 0o777).toBe(0o755);
    expect((await stat(packagedMessage)).mode & 0o777).toBe(0o640);
    expect((await execute(packagedBinary, ["packaged executable"], { timeout: 10_000 })).stdout).toBe("packaged executable\n");
    expect(await readdir(join(root, "dist"))).toEqual([`fixture${extension[format]}`]);
    expect(await run(Artifact.verify(binary))).toEqual(binary);
  }, 60_000);

  it("accepts regular artifacts refined with provider metadata", async () => {
    const refined = { ...binary, runtime: { path: binary.path, sha256: binary.sha256 } };
    const artifact = await run(Nfpm.package({
      ...input("deb"),
      contents: [{ artifact: refined, dst: "/usr/bin/refined" }],
    }));
    const extracted = join(root, "refined");
    await mkdir(extracted);
    await execute("ar", ["-x", artifact.path], { cwd: extracted });
    const payload = (await readdir(extracted)).find((name) => name.startsWith("data.tar"));
    expect(payload).toBeDefined();
    await execute(archiveTool, ["-xf", join(extracted, payload!), "-C", extracted]);
    expect(await readFile(join(extracted, "usr/bin/refined"))).toEqual(await readFile(binary.path));
  });

  it("writes an MSIX with its manifest, application bytes and image assets", async () => {
    const logoPath = join(root, "logo.png");
    await writeFile(logoPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    const logo = await observe(logoPath);
    const artifact = await run(Nfpm.package({
      ...input("msix"),
      release: "0",
      contents: [
        { artifact: binary, dst: "/app.exe" },
        { artifact: logo, dst: "/Assets/logo.png" },
      ],
      msix: {
        publisher: "CN=Effect Build Fixture",
        properties: { display_name: "effect-build fixture", publisher_display_name: "effect-build", logo: "Assets/logo.png" },
        applications: [{
          id: "EffectBuildFixture",
          executable: "app.exe",
          entry_point: "Windows.FullTrustApplication",
          visual_elements: {
            display_name: "effect-build fixture", description: "nFPM fixture", background_color: "transparent",
            square150x150_logo: "Assets/logo.png", square44x44_logo: "Assets/logo.png",
          },
        }],
        dependencies: { target_device_families: [{ name: "Windows.Desktop", min_version: "10.0.17763.0", max_version_tested: "10.0.26100.0" }] },
      },
      atomic: false,
    }));
    const extracted = join(root, "msix");
    await mkdir(extracted);
    await execute(archiveTool, ["-xf", artifact.path, "-C", extracted]);
    expect(await readFile(join(extracted, "app.exe"))).toEqual(await readFile(binary.path));
    expect(await readFile(join(extracted, "Assets/logo.png"))).toEqual(await readFile(logo.path));
    const manifest = await readFile(join(extracted, "AppxManifest.xml"), "utf8");
    expect(manifest).toContain('Publisher="CN=Effect Build Fixture"');
    expect(manifest).toContain('Executable="app.exe"');
    expect(manifest).toContain('Version="1.2.3.0"');
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    expect(await readdir(join(root, "dist"))).toEqual(["fixture.msix"]);
  }, 60_000);

  it("rejects changed content before replacing an existing package", async () => {
    const config = input("deb");
    const outfile = join(root, config.outfile);
    await mkdir(join(root, "dist"));
    await writeFile(outfile, "previous package");
    await writeFile(message.path, "changed bytes");
    const error = await run(Nfpm.package(config).pipe(Effect.flip));
    expect(error).toMatchObject({ _tag: "ArtifactError", reason: "changed", path: message.path });
    expect(await readFile(outfile, "utf8")).toBe("previous package");
    expect(await readdir(join(root, "dist"))).toEqual(["fixture.deb"]);
  });

  it.each([
    { reason: "metadata expansion", change: (config: Nfpm.PackageInput): Nfpm.PackageInput => ({ ...config, description: "$HOME" }) },
    { reason: "invalid calendar date", change: (config: Nfpm.PackageInput): Nfpm.PackageInput => ({ ...config, mtime: "2026-02-30T00:00:00Z" }) },
    { reason: "parent traversal", change: (config: Nfpm.PackageInput): Nfpm.PackageInput => ({ ...config, contents: [{ artifact: binary, dst: "/usr/../escape" }] }) },
  ])("rejects $reason before writing a package", async (change) => {
    const error = await run(Nfpm.package(change.change(input("deb"))).pipe(Effect.flip));
    expect(error).toBeInstanceOf(Nfpm.InputInvalid);
    expect((await readdir(root)).sort()).toEqual(["echo", "message.txt"]);
  });

  it("reports native nFPM errors while preserving an existing output", async () => {
    const config = { ...input("rpm"), dependencies: ["example >>> 1.2.3"] };
    const outfile = join(root, config.outfile);
    await mkdir(join(root, "dist"));
    await writeFile(outfile, "previous package");
    const error = await run(Nfpm.package(config).pipe(Effect.flip));
    expect(error).toBeInstanceOf(Tool.Failed);
    if (error instanceof Tool.Failed) expect(error.stderr.length).toBeGreaterThan(0);
    expect(await readFile(outfile, "utf8")).toBe("previous package");
    expect(await readdir(join(root, "dist"))).toEqual(["fixture.rpm"]);
  });
});
