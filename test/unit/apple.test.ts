import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, FileSystem, PlatformError, Redacted, Schema } from "effect";
import { Artifact, Executable, Tool } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Bun from "effect-build-bun";
import { TestArtifact, TestSpawner } from "effect-build/testing";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { script, type Config, type Invocation, type PackedEntry } from "../fixtures/apple-script.js";
const { elf, thinMacho } = TestArtifact;

const local = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const producer = { name: "fixture", version: "0.7.0" };
const certificateSha1 = "A".repeat(40);
const password = "private-notary:$42";
const submissionId = "3f33f890-0cbf-4c1e-bb39-6fba74a594f0";
const credential: Apple.Notary.Credential = { kind: "apple-id", appleId: "fixture@example.test", teamId: "TEAMID1234", password: Redacted.make(password) };
let root: string;
let tool: string;
let config: Config;
let invocations: Invocation[];
let executable: Artifact.Executable;
let resource: Artifact.File;
// Scripts mutate real staged files while TestSpawner owns child lifecycle and interruption.
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-apple-")));
  tool = join(root, "xcrun.fixture");
  config = {};
  invocations = [];
  await writeFile(tool, "xcrun fixture bytes\n");
  await writeFile(join(root, "native"), thinMacho());
  await writeFile(join(root, "resource"), "resource bytes\n");
  executable = await local(Artifact.executable(join(root, "native"), producer, "darwin-arm64"));
  resource = await local(Artifact.file(join(root, "resource"), producer));

});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const run = <A, E>(effect: Effect.Effect<A, E, Apple.Apple | NodeServices.NodeServices>) => Effect.runPromise(effect.pipe(
  Effect.provide(Apple.layer({ executable: tool })), Effect.provide(TestSpawner.layer(script(() => config, invocations))), Effect.provide(NodeServices.layer),
));
const configure = async (changes: Partial<Config>) => { config = { ...config, ...changes }; };
const calls = async (): Promise<readonly Invocation[]> => [...invocations];
const appInput = (): Apple.AppBundleInput => ({ executable, outdir: join(root, "Fixture.app"), bundleIdentifier: "dev.effect-build.fixture", bundleName: "Fixture", version: "42", shortVersion: "1.2.3", executableName: "fixture", resources: [{ artifact: resource, path: "Guide.txt" }] });
const app = () => run(Apple.appBundle(appInput()));
const signedApp = async () => run(Apple.sign({ artifact: await app(), certificateSha1, outdir: join(root, "Signed.app") }));
const unsignedFile = async (product: "dmg" | "pkg") => {
  const path = join(root, `unsigned.${product}`);
  await writeFile(path, `unsigned-${product}`);
  const file = await local(Artifact.file(path, producer));
  return product === "dmg" ? { ...file, product: "dmg" as const } : { ...file, product: "pkg" as const };
};
// A dmg | pkg union matches no sign overload; narrowing the product first keeps the result's product type.
const signFile = (source: Apple.Dmg | Apple.Pkg, outfile: string) =>
  source.product === "dmg"
    ? run(Apple.sign({ artifact: source, certificateSha1, outfile }))
    : run(Apple.sign({ artifact: source, certificateSha1, outfile }));
const signedFile = async (product: "dmg" | "pkg") => signFile(await unsignedFile(product), join(root, `signed.${product}`));
const signedExecutable = (outfile?: string) => run(Apple.sign({ artifact: executable, certificateSha1, outfile, entitlements: Bun.entitlements }));

describe("Apple products on real files", () => {
  it.each([true, false])("copies executable/resources and writes escaped plist values with atomic=%s", async (atomic) => {
    const result = await run(Apple.appBundle({ ...appInput(), atomic, displayName: `Tools & <Things> 'quoted'`, minimumSystemVersion: "13.0", resources: [
      { artifact: resource, path: "Guide.txt" }, { artifact: executable, path: "bin/helper" }, { artifact: executable, path: "data/helper", executable: false },
    ] }));
    expect(await readFile(join(result.path, "Contents/MacOS/fixture"))).toEqual(await readFile(executable.path));
    expect(await readFile(join(result.path, "Contents/Resources/Guide.txt"), "utf8")).toBe("resource bytes\n");
    const plist = await readFile(join(result.path, "Contents/Info.plist"), "utf8");
    expect(plist).toContain("Tools &amp; &lt;Things&gt;");
    for (const value of ["dev.effect-build.fixture", "1.2.3", "13.0", "APPL"]) expect(plist).toContain(`<string>${value}</string>`);
    if (process.platform !== "win32") {
      expect((await stat(join(result.path, "Contents/MacOS/fixture"))).mode & 0o777).toBe(0o755);
      expect((await stat(join(result.path, "Contents/Resources/Guide.txt"))).mode & 0o777).toBe(0o644);
      expect((await stat(join(result.path, "Contents/Resources/bin/helper"))).mode & 0o777).toBe(0o755);
      expect((await stat(join(result.path, "Contents/Resources/data/helper"))).mode & 0o777).toBe(0o644);
    }
    expect((await calls()).filter((call) => call.tool === "plutil")).toHaveLength(1);
  });

  it.each([["../escape"], ["/absolute"], ["C:/drive"], ["back\\slash"], ["same", "same"], ["Guide", "Guide/readme"]])("rejects resource layout %j before producing an app", async (...paths) => {
    const failure = await run(Apple.appBundle({ ...appInput(), resources: paths.map((path) => ({ artifact: resource, path })) }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.InputInvalid);
    expect(await readdir(root)).not.toContain("Fixture.app");
  });

  it.each([["Readme", "README"], ["Docs/a", "docs/b"], ["café/a", "cafe\u0301/b"]])("uses the filesystem's actual spelling rules for %j", async (...paths) => {
    const probe = join(root, "spelling-probe");
    await mkdir(probe);
    await mkdir(join(probe, paths[0]!.split("/")[0]!));
    const distinct = await mkdir(join(probe, paths[1]!.split("/")[0]!)).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      return false;
    });
    const secondPath = join(root, "second-resource");
    await writeFile(secondPath, "second resource");
    const second = await local(Artifact.file(secondPath, producer));
    const operation = Apple.appBundle({ ...appInput(), resources: [{ artifact: resource, path: paths[0]! }, { artifact: second, path: paths[1]! }] });
    if (distinct) {
      const result = await run(operation);
      expect(await readFile(join(result.path, "Contents/Resources", paths[0]!), "utf8")).toBe("resource bytes\n");
      expect(await readFile(join(result.path, "Contents/Resources", paths[1]!), "utf8")).toBe("second resource");
    } else {
      expect(await run(operation.pipe(Effect.flip))).toMatchObject({ _tag: "ArtifactError", reason: "unwritable" });
      expect(await readdir(root)).not.toContain("Fixture.app");
    }
  });

  it("reports a plist write failure truthfully and retains the previous app", async () => {
    const outdir = join(root, "Fixture.app");
    await mkdir(outdir);
    await writeFile(join(outdir, "previous"), "keep me");
    const before = (await readdir(root)).sort();
    const fs = await local(FileSystem.FileSystem);
    const denied: FileSystem.FileSystem = {
      ...fs,
      writeFileString: (path, contents, options) => path.endsWith("Info.plist")
        ? Effect.fail(PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "writeFileString", pathOrDescriptor: path }))
        : fs.writeFileString(path, contents, options),
    };
    const failure = await run(Apple.appBundle(appInput()).pipe(Effect.provideService(FileSystem.FileSystem, denied), Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "unwritable", path: expect.stringContaining("Info.plist") });
    expect(await readFile(join(outdir, "previous"), "utf8")).toBe("keep me");
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it("preserves a destination when resolving it fails with permission denied", async () => {
    const original = await app();
    const outdir = join(root, "Result.app");
    await mkdir(outdir);
    await writeFile(join(outdir, "previous"), "keep me");
    const before = (await readdir(root)).sort();
    const fs = await local(FileSystem.FileSystem);
    const denied: FileSystem.FileSystem = {
      ...fs,
      realPath: (path) => path === outdir
        ? Effect.fail(PlatformError.systemError({ _tag: "PermissionDenied", module: "FileSystem", method: "realPath", pathOrDescriptor: path }))
        : fs.realPath(path),
    };
    const failure = await run(Apple.sign({ artifact: original, certificateSha1, outdir, atomic: false }).pipe(
      Effect.provideService(FileSystem.FileSystem, denied), Effect.flip,
    ));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "unreadable", path: outdir });
    expect(await readFile(join(outdir, "previous"), "utf8")).toBe("keep me");
    expect((await calls()).some((call) => call.tool === "ditto")).toBe(false);
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it("copies current resource bytes without requiring a content identity", async () => {
    await writeFile(resource.path, "changed input");
    const result = await run(Apple.appBundle(appInput()));
    expect(await readFile(join(result.path, "Contents/Resources/Guide.txt"), "utf8")).toBe("changed input");
    expect(result).not.toHaveProperty("sha256");
  });

  it("signs nested code before the app and preserves framework symlinks", async () => {
    const original = await app(), framework = join(original.path, "Contents/Frameworks/Fixture.framework");
    await mkdir(join(framework, "Versions/A/Resources"), { recursive: true });
    await writeFile(join(framework, "Versions/A/Fixture"), "framework binary");
    await chmod(join(framework, "Versions/A/Fixture"), 0o755);
    if (process.platform !== "win32") {
      await symlink("A", join(framework, "Versions/Current"));
      await symlink("Versions/Current/Fixture", join(framework, "Fixture"));
    }
    const source = { ...original, ...await local(Artifact.directory(original.path, producer)) };
    await writeFile(join(root, "entitlements.plist"), '<?xml version="1.0"?><plist version="1.0"><dict/></plist>');
    const entitlements = await local(Artifact.file(join(root, "entitlements.plist"), producer));
    const outdir = join(root, "Signed.app");
    await configure({ watchPath: outdir });
    const result = await run(Apple.sign({ artifact: source, certificateSha1, outdir, entitlements, nestedCode: [{ path: "Contents/Frameworks/Fixture.framework", entitlements }] }));
    const commands = (await calls()).filter((call) => call.tool === "codesign");
    expect(commands.map((call) => call.args[0])).toEqual(["--force", "--force"]);
    expect(commands[0]!.args.at(-1)).toContain("Fixture.framework");
    expect(basename(commands[1]!.args.at(-1)!)).toBe("Signed.app");
    expect(commands.every((call) => !call.watchPathExisted)).toBe(true);
    expect(commands[0]!.args).toContain("runtime");
    expect(commands[1]!.args).toContain("--entitlements");
    expect(await readFile(join(result.path, "Contents/_CodeSignature/CodeResources"), "utf8")).toBe("signed resources");
    if (process.platform !== "win32") {
      expect(await readlink(join(result.path, "Contents/Frameworks/Fixture.framework/Versions/Current"))).toBe("A");
      expect(await readlink(join(result.path, "Contents/Frameworks/Fixture.framework/Fixture"))).toBe("Versions/Current/Fixture");
      expect((await stat(join(result.path, "Contents/Frameworks/Fixture.framework/Versions/A/Fixture"))).mode & 0o777).toBe(0o755);
    }
  });

  it.each(["codesign.sign"])("preserves source and destination apps after %s fails", async (fail) => {
    const source = await app(), outdir = join(root, "Previous.app");
    await mkdir(outdir); await writeFile(join(outdir, "keep"), "previous app");
    const previous = await local(Artifact.directory(outdir, producer).pipe(Effect.flatMap(Artifact.withSha256)));
    await configure({ fail });
    const before = (await readdir(root)).sort();
    expect(await run(Apple.sign({ artifact: source, certificateSha1, outdir }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await local(Artifact.verify(previous))).toEqual(previous);
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it.each(["same", "different"])("signs directly into the %s app directory without stale entries", async (destination) => {
    const source = await app(), outdir = destination === "same" ? source.path : join(root, "Existing.app");
    if (destination === "different") { await mkdir(outdir); await writeFile(join(outdir, "stale"), "old output"); }
    const result = await run(Apple.sign({ artifact: source, certificateSha1, outdir, atomic: false }));
    expect(await readdir(result.path)).toEqual(["Contents"]);
    expect(await readFile(join(result.path, "Contents/MacOS/fixture"))).toEqual(await readFile(executable.path));
  });

  it("packages an unsigned app without imposing signing checks", async () => {
    const source = await app();
    const dmg = await run(Apple.dmg({ artifact: source, outfile: join(root, "fixture.dmg"), volumeName: "Fixture", ...(process.platform === "win32" ? {} : { applicationsLink: true }), layout: [{ artifact: resource, path: "Extras/Guide.txt" }] }));
    const installer = await run(Apple.pkg({ artifact: source, outfile: join(root, "fixture.pkg"), identifier: "dev.effect-build.fixture", version: "1.2.3" }));
    const packed = JSON.parse(await readFile(dmg.path, "utf8")) as { readonly entries: readonly PackedEntry[] };
    expect(packed.entries.find((entry) => entry.path === "Extras/Guide.txt")?.contents).toBe(Buffer.from("resource bytes\n").toString("base64"));
    expect(packed.entries.some((entry) => entry.path === "Fixture.app/Contents/MacOS/fixture")).toBe(true);
    if (process.platform !== "win32") expect(packed.entries.find((entry) => entry.path === "Applications")?.target).toBe("/Applications");
    const pkg = JSON.parse(await readFile(installer.path, "utf8")) as { readonly entries: readonly PackedEntry[] };
    expect(pkg.entries.find((entry) => entry.path === "Contents/MacOS/fixture")?.contents).toBe(Buffer.from(await readFile(executable.path)).toString("base64"));
  });

  it("packages an unsigned executable into an installer that lands in a bin directory", async () => {
    const source = executable;
    const installer = await run(Apple.pkg({ artifact: source, outfile: join(root, "cli.pkg"), identifier: "dev.effect-build.cli", version: "1.2.3" }));
    const packed = JSON.parse(await readFile(installer.path, "utf8")) as { readonly entries: readonly PackedEntry[]; readonly location: string };
    expect(packed.location).toBe("/usr/local/bin");
    expect(packed.entries.map((entry) => [entry.path, entry.kind])).toEqual([["native", "file"]]);
    expect(packed.entries[0]!.contents).toBe(Buffer.from(await readFile(source.path)).toString("base64"));
    if (process.platform !== "win32") expect(packed.entries[0]!.mode).toBe(0o755);
    const build = (await calls()).find((call) => call.tool === "pkgbuild")!;
    expect(build.args[0]).toBe("--root");
    const custom = await run(Apple.pkg({ artifact: source, outfile: join(root, "custom.pkg"), identifier: "dev.effect-build.cli", version: "1.2.3", installLocation: "/opt/cli/bin" }));
    expect((JSON.parse(await readFile(custom.path, "utf8")) as { readonly location: string }).location).toBe("/opt/cli/bin");
  });

  it.each(["hdiutil.create", "pkgbuild", "productbuild"])("preserves an existing package and removes staging after %s fails", async (fail) => {
    const source = await signedApp(), diskImage = fail.startsWith("hdiutil"), outfile = join(root, diskImage ? "previous.dmg" : "previous.pkg");
    await writeFile(outfile, "previous product"); await configure({ fail });
    const before = (await readdir(root)).sort();
    const operation = diskImage
      ? Apple.dmg({ artifact: source, outfile, volumeName: "Fixture" }).pipe(Effect.asVoid)
      : Apple.pkg({ artifact: source, outfile, identifier: "dev.effect-build.fixture", version: "1.2.3" }).pipe(Effect.asVoid);
    expect(await run(operation.pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous product");
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it.each(["dmg", "pkg"] as const)("signs %s copies and reports the modified bytes", async (product) => {
    const source = await local(Artifact.withSha256(await unsignedFile(product)));
    const result = await signFile(source, join(root, `signed.${product}`));
    expect(result).not.toHaveProperty("sha256");
    expect(await readFile(source.path, "utf8")).toBe(`unsigned-${product}`);
    expect(await readFile(result.path, "utf8")).toBe(`unsigned-${product}:signed`);
  });
});

describe("Standalone Darwin executables", () => {
  it("signs a copy with the hardened runtime and Bun's entitlements, retaining the target", async () => {
    const original = await readFile(executable.path);
    const result = await signedExecutable(join(root, "signed-cli"));
    expect(result).toMatchObject({ kind: "executable", target: "darwin-arm64", format: "mach-o", path: join(root, "signed-cli") });
    expect(result.signature).toEqual({ certificateSha1, secureTimestamp: true, hardenedRuntime: true });
    expect(await readFile(result.path)).toEqual(Buffer.concat([original, Buffer.from(":signed")]));
    expect(await readFile(executable.path)).toEqual(original);
    if (process.platform !== "win32") expect((await stat(result.path)).mode & 0o777).toBe(0o755);
    const plist = (await calls()).find((call) => call.tool === "plutil")!.plist!;
    for (const key of Bun.entitlements) expect(plist).toMatch(new RegExp(`<key>${key.replaceAll(".", "\\.")}</key>\\s*<true/>`));
    const commands = (await calls()).filter((call) => call.tool === "codesign");
    expect(commands.map((call) => call.args[0])).toEqual(["--force"]);
    expect(commands[0]!.args.slice(0, 7)).toEqual(["--force", "--sign", certificateSha1, "--timestamp", "--options", "runtime", "--entitlements"]);
    expect(commands[0]!.args.at(-1)).not.toBe(result.path);
    expect(Schema.decodeUnknownSync(Apple.SignedExecutable)(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("signs in place by default with a plist artifact", async () => {
    await writeFile(join(root, "entitlements.plist"), '<?xml version="1.0"?><plist version="1.0"><dict/></plist>');
    const entitlements = await local(Artifact.file(join(root, "entitlements.plist"), producer));
    const result = await run(Apple.sign({ artifact: executable, certificateSha1, entitlements }));
    expect(result.path).toBe(executable.path);
    expect(await readFile(result.path)).toEqual(Buffer.concat([thinMacho(), Buffer.from(":signed")]));
    expect((await calls()).find((call) => call.tool === "plutil")!.plist).toContain("<dict/>");
  });

  it("rejects non-Darwin executables and malformed entitlement keys before signing", async () => {
    await writeFile(join(root, "linux"), elf());
    const linux = await local(Artifact.executable(join(root, "linux"), producer));
    expect(await run(Apple.sign({ artifact: linux, certificateSha1, outfile: join(root, "never") }).pipe(Effect.flip))).toBeInstanceOf(Tool.InputInvalid);
    expect(await run(Apple.pkg({ artifact: linux, outfile: join(root, "never.pkg"), identifier: "dev.fixture", version: "1" }).pipe(Effect.flip))).toBeInstanceOf(Tool.InputInvalid);
    expect(await run(Apple.Notary.submit({ artifact: linux, credential }).pipe(Effect.flip))).toBeInstanceOf(Tool.InputInvalid);
    expect(await run(Apple.assess({ artifact: linux }).pipe(Effect.flip))).toBeInstanceOf(Tool.InputInvalid);
    for (const entitlements of [[], [""], ["a", "a"], [" com.apple.security.cs.allow-jit"], ["bad\0key"]]) {
      expect(await run(Apple.sign({ artifact: executable, certificateSha1, outfile: join(root, "never"), entitlements }).pipe(Effect.flip))).toBeInstanceOf(Tool.InputInvalid);
    }
    expect(await readdir(root)).not.toContain("never");
    expect(await readdir(root)).not.toContain("calls.jsonl");
  });

  it.each(["codesign.sign", "plutil"])("preserves the input and an existing output after %s fails", async (fail) => {
    const outfile = join(root, "previous-cli");
    await writeFile(outfile, "previous executable");
    await configure({ fail });
    const listing = async () => (await readdir(root)).filter((name) => name !== "calls.jsonl").sort();
    const before = await listing();
    expect(await run(Apple.sign({ artifact: executable, certificateSha1, outfile, entitlements: Bun.entitlements }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous executable");
    expect(await listing()).toEqual(before);
  });

  it("rejects a signed binary whose header no longer matches the input target", async () => {
    await configure({ corruptTarget: true });
    const failure = await run(Apple.sign({ artifact: executable, certificateSha1, outfile: join(root, "never") }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Executable.TargetMismatch);
    expect(await readdir(root)).not.toContain("never");
  });

  it("assesses a standalone executable without prior receipt or signature metadata", async () => {
    expect(await run(Apple.assess({ artifact: executable }))).toBe(executable);
    expect((await calls()).map((call) => call.tool)).toEqual(["spctl"]);
    expect((await calls())[0]!.args.slice(0, 4)).toEqual(["--assess", "--type", "execute", "--verbose=4"]);
  });
});

describe("Explicit Apple assurance operations", () => {
  it.each(["app", "dmg", "pkg", "executable"] as const)("verifies a %s signature only when explicitly requested", async (kind) => {
    const signed = kind === "app" ? await signedApp() : kind === "executable" ? await signedExecutable() : await signedFile(kind);
    const artifact = signed.kind === "directory" ? { ...await local(Artifact.directory(signed.path, producer)), product: "app" as const }
      : signed.kind === "executable" ? await local(Artifact.executable(signed.path, producer))
      : { ...await local(Artifact.file(signed.path, producer)), product: signed.product };
    invocations.length = 0;
    expect(await run(Apple.verifySignature({ artifact }))).toBe(artifact);
    expect((await calls()).map((call) => [call.tool, call.args[0]])).toEqual([[kind === "pkg" ? "pkgutil" : "codesign", kind === "pkg" ? "--check-signature" : "--verify"]]);
  });

  it("reports signature, ticket, and assessment failures through their explicit operations", async () => {
    const artifact = await unsignedFile("dmg");
    expect(await run(Apple.verifySignature({ artifact }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await run(Apple.validateTicket({ artifact }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    await configure({ fail: "spctl" });
    expect(await run(Apple.assess({ artifact }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
  });
});

describe("Apple notarization and stapling", () => {
  it("submits current bytes and persists only the native ID for later lookups", async () => {
    const source = await unsignedFile("dmg");
    await configure({ submit: { id: submissionId.toUpperCase(), message: `uploaded with ${password}` } });
    const id = await run(Apple.Notary.submit({ artifact: source, credential }));
    expect(id).toBe(submissionId);
    const encoded = Schema.encodeSync(Apple.Notary.SubmissionId)(id);
    const restored = Schema.decodeUnknownSync(Apple.Notary.SubmissionId)(JSON.parse(JSON.stringify(encoded)));
    await rm(source.path);
    await configure({ wait: { id, status: "Accepted" } });
    const result = await run(Apple.Notary.wait({ submissionId: restored, credential, timeout: "5m" }));
    expect(await local(Apple.Notary.expectAccepted(result))).toBe(result);
    expect((await run(Apple.Notary.info({ submissionId: id, credential }))).submissionId).toBe(id);
    expect((await run(Apple.Notary.log({ submissionId: id, credential }))).issues).toEqual([]);
    expect(Schema.decodeUnknownSync(Apple.Notary.Submission)(JSON.parse(JSON.stringify(Schema.encodeSync(Apple.Notary.Submission)(result))))).toEqual(result);
    const native = (await calls()).filter((call) => call.tool === "notarytool");
    expect(native.map((call) => call.args[0])).toEqual(["submit", "wait", "info", "log"]);
    expect(native[0]!.args[1]).toBe(source.path);
    expect(native[0]!.args).not.toContain("--wait");
    expect(native[1]!.args).toContain("5m");
    expect((await calls()).some((call) => call.tool === "codesign" || call.tool === "pkgutil")).toBe(false);
  });

  it("recovers a failed wait using a native ID from outside this library", async () => {
    await configure({ fail: "notarytool.wait" });
    expect(await run(Apple.Notary.wait({ submissionId, credential, timeout: "1s" }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    await configure({ fail: "none" });
    expect((await run(Apple.Notary.wait({ submissionId, credential }))).status._tag).toBe("Accepted");
    expect((await calls()).map((call) => call.args[0])).toEqual(["wait", "wait"]);
  });

  it("keeps an interrupted wait as interruption and resumes from the same ID", async () => {
    await configure({ waitForAbort: true });
    const controller = new AbortController();
    const waiting = Effect.runPromiseExit(Apple.Notary.wait({ submissionId, credential }).pipe(
      Effect.provide(Apple.layer({ executable: tool })), Effect.provide(TestSpawner.layer(script(() => config, invocations))), Effect.provide(NodeServices.layer),
    ), { signal: controller.signal });
    try {
      await expect.poll(() => invocations.map((call) => call.args[0])).toEqual(["wait"]);
    } finally { controller.abort(); }
    const exit = await waiting;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    await configure({ waitForAbort: false });
    expect((await run(Apple.Notary.wait({ submissionId, credential }))).status._tag).toBe("Accepted");
    expect((await calls()).map((call) => call.args[0])).toEqual(["wait", "wait"]);
  });

  it.each(["Invalid", "Rejected", "In Progress"])("returns native status %s until acceptance is explicitly required", async (status) => {
    const source = await unsignedFile("dmg");
    await configure({ submit: { id: submissionId, status } });
    const result = await run(Apple.Notary.notarize({ artifact: source, credential }));
    expect(result.status.providerStatus).toBe(status);
    expect(await local(Apple.Notary.expectAccepted(result).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResultNotAccepted);
  });

  it("does not impose a supplied digest when uploading current bytes", async () => {
    const source = await local(Artifact.withSha256(await unsignedFile("dmg")));
    await writeFile(source.path, "changed input");
    expect(await run(Apple.Notary.submit({ artifact: source, credential }))).toBe(submissionId);
    expect((await calls()).map((call) => call.tool)).toEqual(["notarytool"]);
    expect((await calls())[0]!.payloadSha).not.toBe(source.sha256);
  });

  it("rejects malformed responses, mismatched UUIDs and transport failure without retrying", async () => {
    const source = await unsignedFile("dmg");
    for (const rawResponse of ["{not JSON", JSON.stringify({ id: "not-a-uuid" })]) {
      await configure({ rawResponse });
      expect(await run(Apple.Notary.submit({ artifact: source, credential }).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResponseInvalid);
    }
    await configure({ rawResponse: JSON.stringify({ id: "d53e8e0e-1ca7-4fc4-a587-17347c6023af", status: "Accepted" }) });
    expect(await run(Apple.Notary.info({ submissionId, credential }).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResponseInvalid);
    await configure({ fail: "notarytool.submit" });
    const failure = await run(Apple.Notary.submit({ artifact: source, credential }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(JSON.stringify(failure)).not.toContain(password);
    if (failure instanceof Tool.Failed) { expect(failure.args).toContain("<redacted>"); expect(failure.stderr).toContain("<redacted>"); }
    expect((await calls()).filter((call) => call.args[0] === "submit")).toHaveLength(3);
  });

  it("decodes nullable log issues and preserves diagnostics through JSON", async () => {
    expect((await run(Apple.Notary.log({ submissionId, credential }))).issues).toEqual([]);
    await configure({ logResponse: { jobId: submissionId.toUpperCase(), status: "Invalid", statusCode: 4000, statusSummary: "Invalid signature", issues: [{ severity: "error", message: `problem ${password}`, path: "Fixture.app", architecture: "arm64", code: 123 }] } });
    const log = await run(Apple.Notary.log({ submissionId, credential }));
    expect(log.issues[0]).toMatchObject({ code: "123", architecture: "arm64", path: "Fixture.app" });
    expect(log.status.providerStatus).toBe("Invalid");
    expect(JSON.stringify(log)).not.toContain(password);
    expect(Schema.decodeUnknownSync(Apple.Notary.Log)(JSON.parse(JSON.stringify(Schema.encodeSync(Apple.Notary.Log)(log))))).toEqual(log);
  });

  it.each(["app", "executable"] as const)("uploads %s through a temporary ZIP without signature preflights", async (kind) => {
    const source = kind === "app" ? await app() : executable;
    invocations.length = 0;
    expect(await run(Apple.Notary.submit({ artifact: source, credential }))).toBe(submissionId);
    const native = await calls();
    expect(native.map((call) => call.tool)).toEqual(["ditto", "notarytool"]);
    expect(native[0]!.args.at(-2)).toBe(source.path);
    const uploaded = native[1]!.args[1]!;
    expect(uploaded).toMatch(/\.zip$/u);
    await expect(stat(uploaded)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["app", "dmg", "pkg"] as const)("staples a relocated %s without a wrapper receipt and validates only on request", async (product) => {
    const source = await local(Artifact.withSha256(product === "app" ? await signedApp() : await signedFile(product)));
    const relocatedPath = join(root, `Relocated.${product}`);
    if (source.kind === "directory") await cp(source.path, relocatedPath, { recursive: true, verbatimSymlinks: true }); else await copyFile(source.path, relocatedPath);
    await rm(source.path, { recursive: true });
    const relocated = { ...source, path: relocatedPath };
    invocations.length = 0;
    const stapled = relocated.product === "app"
      ? await run(Apple.staple({ artifact: relocated, outdir: join(root, "Stapled.app") }))
      : await run(Apple.staple({ artifact: relocated, outfile: join(root, `stapled.${product}`) }));
    expect((await calls()).filter((call) => call.tool !== "ditto").map((call) => [call.tool, call.args[0]])).toEqual([["stapler", "staple"]]);
    expect(stapled).not.toHaveProperty("sha256");
    expect(stapled).not.toHaveProperty("signature");
    expect(stapled).not.toHaveProperty("ticket");
    expect((await local(Artifact.withSha256(stapled))).sha256).not.toBe(source.sha256);
    expect(await run(Apple.validateTicket({ artifact: stapled }))).toBe(stapled);
    expect(await run(Apple.assess({ artifact: stapled }))).toBe(stapled);
    expect(await local(Artifact.verify(relocated))).toEqual(relocated);
    expect((await calls()).slice(-2).map((call) => [call.tool, call.args[0]])).toEqual([["stapler", "validate"], ["spctl", "--assess"]]);
  });

  it("preserves existing bytes when stapling fails", async () => {
    const source = await local(Artifact.withSha256(await unsignedFile("dmg"))), outfile = join(root, "previous.dmg");
    await writeFile(outfile, "previous bytes"); await configure({ fail: "stapler.staple" });
    const before = (await readdir(root)).sort();
    expect(await run(Apple.staple({ artifact: source, outfile }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous bytes");
    expect(await local(Artifact.verify(source))).toEqual(source);
    expect((await readdir(root)).sort()).toEqual(before);
  });
});
