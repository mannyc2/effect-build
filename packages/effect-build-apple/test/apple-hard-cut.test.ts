import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as AppBundle from "../src/AppBundle.js";
import * as Assess from "../src/Assess.js";
import * as CodeSign from "../src/CodeSign.js";
import * as DiskImage from "../src/DiskImage.js";
import * as InstallerPackage from "../src/InstallerPackage.js";
import * as Model from "../src/Model.js";
import * as Notary from "../src/Notary.js";
import * as Staple from "../src/Staple.js";

interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

interface Completion {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly exitCodeEffect?: Effect.Effect<ChildProcessSpawner.ExitCode>;
}

type Handler = (invocation: Invocation) => Completion;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-apple-"));
  roots.push(root);
  return root;
};

const executable = (root: string, name: string): string => {
  const file = join(root, name);
  writeFileSync(file, "fake native tool\n");
  chmodSync(file, 0o755);
  return file;
};

const thinMachO = (file: string, architecture: "arm64" | "x64"): void => {
  const bytes = new Uint8Array(32);
  bytes.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  bytes.set(architecture === "arm64" ? [0x0c, 0x00, 0x00, 0x01] : [0x07, 0x00, 0x00, 0x01], 4);
  bytes.set([0x02, 0x00, 0x00, 0x00], 12);
  writeFileSync(file, bytes);
  chmodSync(file, 0o755);
};

const sha256 = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

const fileArtifact = (file: string, name = "fixture") => ({
  _tag: "File" as const,
  path: file,
  bytes: readFileSync(file).byteLength,
  sha256: sha256(file),
  tool: { name, version: "18.0" },
});

const executableArtifact = (file: string, target: "macos-aarch64" | "macos-x64") => ({
  _tag: "Executable" as const,
  path: file,
  bytes: readFileSync(file).byteLength,
  sha256: sha256(file),
  target,
  tool: { name: "fixture-compiler", version: "1.0.0" },
});

const bundleArtifact = (outdir: string, name = "fixture") => {
  const entries: Array<
    | { readonly _tag: "Directory"; readonly path: string; readonly mode: number }
    | {
      readonly _tag: "File";
      readonly path: string;
      readonly mode: number;
      readonly bytes: number;
      readonly sha256: string;
    }
    | { readonly _tag: "SymbolicLink"; readonly path: string; readonly target: string }
  > = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      const information = lstatSync(entryPath);
      if (entry.isSymbolicLink()) {
        entries.push({ _tag: "SymbolicLink", path: entryPath, target: readlinkSync(entryPath) });
      } else if (entry.isDirectory()) {
        entries.push({ _tag: "Directory", path: entryPath, mode: information.mode & 0o7777 });
        visit(entryPath);
      } else if (entry.isFile()) {
        entries.push({
          _tag: "File",
          path: entryPath,
          mode: information.mode & 0o7777,
          bytes: information.size,
          sha256: sha256(entryPath),
        });
      }
    }
  };
  visit(outdir);
  return {
    _tag: "Bundle" as const,
    outdir,
    entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
    tool: { name, version: "18.0" },
  };
};

const applicationIdentity = "A".repeat(40) as Model.CertificateSha1;
const installerIdentity = "B".repeat(40) as Model.CertificateSha1;

const applicationBundle = (
  outdir: string,
  architecture: Model.Architecture = "arm64",
): Model.ApplicationBundle => ({
  ...bundleArtifact(outdir, "app-bundle"),
  architecture,
});

const developerIdBundle = (
  outdir: string,
  architecture: Model.Architecture = "arm64",
): Model.DeveloperIdApplicationBundle => ({
  ...bundleArtifact(outdir, "codesign"),
  architecture,
  signature: new Model.DeveloperIdApplicationSignature({
    architecture,
    certificateSha1: applicationIdentity,
    tool: new Model.AppleToolFact({ name: "codesign", version: "18.0" }),
    hardenedRuntime: true,
    secureTimestamp: true,
  }),
});

const developerIdDiskImage = (
  file: string,
  architecture: Model.Architecture = "arm64",
): Model.DeveloperIdDiskImage => ({
  ...fileArtifact(file, "codesign"),
  architecture,
  signature: new Model.DeveloperIdDiskImageSignature({
    architecture,
    certificateSha1: applicationIdentity,
    tool: new Model.AppleToolFact({ name: "codesign", version: "18.0" }),
    secureTimestamp: true,
  }),
});

const developerIdInstallerPackage = (
  file: string,
  architecture: Model.Architecture = "arm64",
): Model.DeveloperIdInstallerPackage => ({
  ...fileArtifact(file, "productsign+pkgutil"),
  architecture,
  tool: { name: "productsign+pkgutil", version: "18.0;15.0" },
  signature: new Model.DeveloperIdInstallerSignature({
    architecture,
    certificateSha1: installerIdentity,
    signer: new Model.AppleToolFact({ name: "productsign", version: "18.0" }),
    verifier: new Model.AppleToolFact({ name: "pkgutil", version: "15.0" }),
  }),
});

const makeSpawner = (handler: Handler): readonly [
  ChildProcessSpawner.ChildProcessSpawner["Service"],
  readonly Invocation[],
] => {
  const invocations: Invocation[] = [];
  const service = ChildProcessSpawner.make((command) => {
    if (!ChildProcess.isStandardCommand(command)) {
      return Effect.fail(PlatformError.systemError({
        _tag: "InvalidData",
        module: "test",
        method: "spawn",
        description: "expected a standard command",
      }));
    }
    return Effect.sync(() => {
      const invocation = { command: command.command, args: command.args, cwd: command.options.cwd };
      invocations.push(invocation);
      const completion = handler(invocation);
      const stdout = completion.stdout ?? "";
      const stderr = completion.stderr ?? "";
      const exitCode = completion.exitCode ?? 0;
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(41001),
        stdin: Sink.drain,
        stdout: Stream.fromIterable([new TextEncoder().encode(stdout)]),
        stderr: Stream.fromIterable([new TextEncoder().encode(stderr)]),
        all: Stream.fromIterable([new TextEncoder().encode(`${stdout}${stderr}`)]),
        exitCode: completion.exitCodeEffect ?? Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      });
    });
  });
  return [service, invocations];
};

const platform = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  Layer.merge(NodeServices.layer, Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner));

const errorOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected a typed failure");
  const error = Cause.findErrorOption(exit.cause);
  if (error._tag === "None") throw new Error("expected a typed error in the cause");
  return error.value;
};

const digest = "a".repeat(64);

describe("effect-build-apple hard cut", () => {
  it("constructs exactly arm64 and x64 app bundles and validates each plist", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    const icon = join(root, "icon.icns");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    writeFileSync(icon, "icon");
    const [spawner, invocations] = makeSpawner(() => ({}));
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    const result = await Effect.runPromise(
      AppBundle.buildAppBundles(
        {
          bundleIdentifier: "dev.effect.build.fixture",
          bundleName: "Fixture",
          displayName: "Effect Build Fixture",
          executableName: "fixture",
          version: "42",
          shortVersion: "1.2.3",
          arm64: {
            executable: executableArtifact(armExecutable, "macos-aarch64"),
            outdir: join(root, "Fixture-arm64.app"),
            minimumSystemVersion: "13.0",
          },
          x64: {
            executable: executableArtifact(x64Executable, "macos-x64"),
            outdir: join(root, "Fixture-x64.app"),
            minimumSystemVersion: "12.0",
          },
          resources: [{ artifact: fileArtifact(icon), destination: "AppIcon.icns" }],
        },
      ).pipe(Effect.provide(provider)),
    );

    expect(Object.keys(result)).toEqual(["arm64", "x64"]);
    expect(result.arm64._tag).toBe("Bundle");
    expect(result.x64._tag).toBe("Bundle");
    expect(result.arm64.architecture).toBe("arm64");
    expect(result.x64.architecture).toBe("x64");
    expect(result.arm64.tool).toEqual({ name: "plutil", version: "18.0" });
    expect(readFileSync(join(root, "Fixture-arm64.app/Contents/MacOS/fixture"))).toEqual(readFileSync(armExecutable));
    expect(readFileSync(join(root, "Fixture-x64.app/Contents/MacOS/fixture"))).toEqual(readFileSync(x64Executable));
    expect(readFileSync(join(root, "Fixture-arm64.app/Contents/Resources/AppIcon.icns"), "utf8")).toBe("icon");
    const info = readFileSync(join(root, "Fixture-arm64.app/Contents/Info.plist"), "utf8");
    expect(info).toContain("dev.effect.build.fixture");
    expect(info).toContain("<string>13.0</string>");
    expect(invocations.map(({ args }) => args[0])).toEqual(["-help", "-lint", "-lint"]);
    for (const invocation of invocations.slice(1)) {
      expect(invocation.command).toBe(plutil);
      expect(invocation.args.slice(0, 2)).toEqual(["-lint", "--"]);
      expect(invocation.args[2]).toMatch(/Contents\/Info\.plist$/);
    }
  });

  it("rejects swapped, non-Mach-O, and universal executable inputs before either app is created", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    const textExecutable = join(root, "text-bin");
    const universalExecutable = join(root, "universal-bin");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    writeFileSync(textExecutable, "not Mach-O");
    chmodSync(textExecutable, 0o755);
    writeFileSync(universalExecutable, new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]));
    chmodSync(universalExecutable, 0o755);
    const input = (arm64: string, x64: string, suffix: string) => ({
      bundleIdentifier: `dev.effect.build.${suffix}`,
      bundleName: "Fixture",
      displayName: "Fixture",
      executableName: "fixture",
      version: "1",
      shortVersion: "1.0.0",
      arm64: { executable: executableArtifact(arm64, "macos-aarch64"), outdir: join(root, `${suffix}-arm64.app`) },
      x64: { executable: executableArtifact(x64, "macos-x64"), outdir: join(root, `${suffix}-x64.app`) },
    });
    const [spawner, invocations] = makeSpawner(() => ({}));
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    const exits = await Effect.runPromise(
      Effect.gen(function*() {
        const swapped = yield* Effect.exit(AppBundle.buildAppBundles(input(x64Executable, armExecutable, "swapped")));
        const nonMachO = yield* Effect.exit(AppBundle.buildAppBundles(input(textExecutable, x64Executable, "text")));
        const universal = yield* Effect.exit(
          AppBundle.buildAppBundles(input(universalExecutable, x64Executable, "fat")),
        );
        return { nonMachO, swapped, universal };
      }).pipe(Effect.provide(provider)),
    );
    expect(errorOf(exits.swapped)).toMatchObject({
      _tag: "ExecutableArchitectureMismatch",
      expected: "arm64",
      observed: "a thin x64 Mach-O",
    });
    expect(errorOf(exits.nonMachO)).toMatchObject({
      _tag: "ExecutableArchitectureMismatch",
      observed: "a non-Mach-O file",
    });
    expect(errorOf(exits.universal)).toMatchObject({
      _tag: "ExecutableArchitectureMismatch",
      observed: expect.stringContaining("universal/fat Mach-O"),
    });
    expect(invocations.map(({ args }) => args)).toEqual([["-help"]]);
    expect(existsSync(join(root, "swapped-arm64.app"))).toBe(false);
    expect(existsSync(join(root, "text-arm64.app"))).toBe(false);
    expect(existsSync(join(root, "fat-arm64.app"))).toBe(false);
  });

  it("rejects mutable executable identities and colliding resource layouts before publication", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    const resourceA = join(root, "resource-a");
    const resourceB = join(root, "resource-b");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    writeFileSync(resourceA, "a");
    writeFileSync(resourceB, "b");
    const armArtifact = executableArtifact(armExecutable, "macos-aarch64");
    const input = (suffix: string): AppBundle.BuildAppBundlesInput => ({
      bundleIdentifier: `dev.effect.build.${suffix}`,
      bundleName: "Fixture",
      displayName: "Fixture",
      executableName: "fixture",
      version: "1",
      shortVersion: "1.0.0",
      arm64: { executable: armArtifact, outdir: join(root, `${suffix}-arm64.app`) },
      x64: { executable: executableArtifact(x64Executable, "macos-x64"), outdir: join(root, `${suffix}-x64.app`) },
    });
    const [spawner] = makeSpawner(() => ({}));
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    thinMachO(armExecutable, "x64");
    const changed = await Effect.runPromiseExit(
      AppBundle.buildAppBundles(input("changed")).pipe(Effect.provide(provider)),
    );
    expect(errorOf(changed)).toMatchObject({ _tag: "ArtifactVerificationFailed", path: armExecutable });
    expect(existsSync(join(root, "changed-arm64.app"))).toBe(false);

    thinMachO(armExecutable, "arm64");
    const collidingInput = {
      ...input("collision"),
      arm64: { ...input("collision").arm64, executable: executableArtifact(armExecutable, "macos-aarch64") },
      resources: [
        { artifact: fileArtifact(resourceA), destination: "Guide" },
        { artifact: fileArtifact(resourceB), destination: "guide/readme.txt" },
      ],
    };
    const collision = await Effect.runPromiseExit(
      AppBundle.buildAppBundles(collidingInput).pipe(Effect.provide(provider)),
    );
    expect(errorOf(collision)).toMatchObject({ _tag: "PublishFailed", reason: expect.stringContaining("collision") });
    expect(existsSync(join(root, "collision-arm64.app"))).toBe(false);
  });

  it("rolls back the first app output when the second architecture fails", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    let lintCount = 0;
    const [spawner] = makeSpawner(({ args }) =>
      args[0] === "-lint" && ++lintCount === 2
        ? { exitCode: 65, stderr: "second architecture rejected" }
        : {}
    );
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    const armOut = join(root, "Rollback-arm64.app");
    const x64Out = join(root, "Rollback-x64.app");
    const exit = await Effect.runPromiseExit(
      AppBundle.buildAppBundles({
        bundleIdentifier: "dev.effect.build.rollback",
        bundleName: "Rollback",
        displayName: "Rollback",
        executableName: "rollback",
        version: "1",
        shortVersion: "1.0.0",
        arm64: { executable: executableArtifact(armExecutable, "macos-aarch64"), outdir: armOut },
        x64: { executable: executableArtifact(x64Executable, "macos-x64"), outdir: x64Out },
      }).pipe(Effect.provide(provider)),
    );
    expect(errorOf(exit)).toMatchObject({ _tag: "ToolFailed", exitCode: 65 });
    expect(existsSync(armOut)).toBe(false);
    expect(existsSync(x64Out)).toBe(false);
  });

  it("rolls back an exact pair when interrupted after the first commit", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    let resolveSecondLint!: () => void;
    const secondLint = new Promise<void>((resolve) => {
      resolveSecondLint = resolve;
    });
    let lintCount = 0;
    const [spawner] = makeSpawner(({ args }) => {
      if (args[0] !== "-lint") return {};
      lintCount += 1;
      if (lintCount !== 2) return {};
      resolveSecondLint();
      return { exitCodeEffect: Effect.never };
    });
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    const armOut = join(root, "Interrupted-arm64.app");
    const x64Out = join(root, "Interrupted-x64.app");
    const program = AppBundle.buildAppBundles({
      bundleIdentifier: "dev.effect.build.interrupted",
      bundleName: "Interrupted",
      displayName: "Interrupted",
      executableName: "interrupted",
      version: "1",
      shortVersion: "1.0.0",
      arm64: { executable: executableArtifact(armExecutable, "macos-aarch64"), outdir: armOut },
      x64: { executable: executableArtifact(x64Executable, "macos-x64"), outdir: x64Out },
    }).pipe(Effect.provide(provider));
    const fiber = Effect.runFork(program);
    await secondLint;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(existsSync(armOut)).toBe(false);
    expect(existsSync(x64Out)).toBe(false);
  });

  it("fails layer construction when a native tool probe exits nonzero", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    const [spawner, invocations] = makeSpawner(() => ({ exitCode: 64, stderr: "probe rejected" }));
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(platform(spawner)),
    );
    const exit = await Effect.runPromiseExit(
      AppBundle.buildAppBundles({
        bundleIdentifier: "dev.effect.build.probe",
        bundleName: "Fixture",
        displayName: "Fixture",
        executableName: "fixture",
        version: "1",
        shortVersion: "1.0.0",
        arm64: { executable: executableArtifact(armExecutable, "macos-aarch64"), outdir: join(root, "arm64.app") },
        x64: { executable: executableArtifact(x64Executable, "macos-x64"), outdir: join(root, "x64.app") },
      }).pipe(Effect.provide(provider)),
    );
    expect(errorOf(exit)).toMatchObject({ _tag: "ToolFailed", exitCode: 64, stderr: "probe rejected" });
    expect(invocations.map(({ args }) => args)).toEqual([["-help"]]);
  });

  it("builds exact UDZO images and unsigned pkgbuild/productbuild installers", async () => {
    const root = makeRoot();
    const hdiutil = executable(root, "hdiutil");
    const codesign = executable(root, "codesign");
    const pkgbuild = executable(root, "pkgbuild");
    const productbuild = executable(root, "productbuild");
    const pkgutil = executable(root, "pkgutil");
    const armApp = join(root, "Fixture-arm64.app");
    const x64App = join(root, "Fixture-x64.app");
    mkdirSync(join(armApp, "Contents"), { recursive: true });
    mkdirSync(join(x64App, "Contents"), { recursive: true });
    writeFileSync(join(armApp, "Contents/Info.plist"), "arm");
    writeFileSync(join(x64App, "Contents/Info.plist"), "x64");
    const armBundle = developerIdBundle(armApp, "arm64");
    const x64Bundle = developerIdBundle(x64App, "x64");

    const mountedDevice = "/dev/disk42";
    let latestLayout = "";
    let mountedPath = "";
    let mountIndex = 0;
    const [dmgSpawner, dmgInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "create") {
        latestLayout = args[args.indexOf("-srcfolder") + 1]!;
        writeFileSync(args.at(-1)!, `UDZO:${args[6]}`);
      }
      if (args[0] === "attach") {
        mountedPath = join(root, `mounted-${mountIndex++}`);
        cpSync(latestLayout, mountedPath, { recursive: true, verbatimSymlinks: true });
        return { stdout: `${mountedDevice}\tApple_HFS\t${mountedPath}\n` };
      }
      if (args[0] === "info") return { stdout: `image-path: fixture.dmg\ndev-entry: ${mountedDevice}\n` };
      if (args[0] === "detach" && mountedPath.length > 0) rmSync(mountedPath, { recursive: true, force: true });
      return {};
    });
    const dmgProvider = DiskImage.layer({
      hdiutil: { executable: hdiutil, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(platform(dmgSpawner)));
    const dmgs = await Effect.runPromise(
      DiskImage.createDiskImages(
        {
          arm64: {
            sourceApp: armBundle,
            outfile: join(root, "fixture-arm64.dmg"),
            volumeName: "Fixture arm64",
          },
          x64: {
            sourceApp: x64Bundle,
            outfile: join(root, "fixture-x64.dmg"),
            volumeName: "Fixture x64",
          },
        },
      ).pipe(Effect.provide(dmgProvider)),
    );
    expect(dmgs.arm64.tool).toEqual({ name: "hdiutil", version: "18.0" });
    expect(dmgs.arm64.architecture).toBe("arm64");
    expect(dmgs.x64.architecture).toBe("x64");
    expect(readFileSync(dmgs.x64.path, "utf8")).toContain("UDZO");
    const hdiutilInvocations = dmgInvocations.filter(({ command }) => basename(command) === "hdiutil");
    expect(hdiutilInvocations.map(({ args }) => args[0])).toEqual([
      "help",
      "create",
      "verify",
      "attach",
      "info",
      "detach",
      "create",
      "verify",
      "attach",
      "info",
      "detach",
    ]);
    for (const invocation of hdiutilInvocations.filter(({ args }) => args[0] === "create")) {
      expect(invocation.args.slice(0, 5)).toEqual(["create", "-fs", "HFS+", "-format", "UDZO"]);
      expect(invocation.args).toContain("-srcfolder");
    }
    for (const offset of [1, 6]) {
      const stagedPath = hdiutilInvocations[offset]!.args.at(-1)!;
      expect(hdiutilInvocations[offset + 1]!.args).toEqual(["verify", stagedPath]);
      expect(hdiutilInvocations[offset + 2]!.args).toEqual([
        "attach",
        "-readonly",
        "-nobrowse",
        "-noautoopen",
        stagedPath,
      ]);
      expect(hdiutilInvocations[offset + 3]!.args).toEqual(["info"]);
      expect(hdiutilInvocations[offset + 4]!.args).toEqual(["detach", mountedDevice]);
    }
    const layoutFile = join(root, "layout.txt");
    writeFileSync(layoutFile, "layout");
    const collidingLayout = await Effect.runPromiseExit(
      DiskImage.createDiskImages({
        arm64: {
          sourceApp: armBundle,
          outfile: join(root, "collision-arm64.dmg"),
          volumeName: "Collision arm64",
          layout: [{ artifact: fileArtifact(layoutFile), destination: "fixture-arm64.app/overwrite" }],
        },
        x64: {
          sourceApp: x64Bundle,
          outfile: join(root, "collision-x64.dmg"),
          volumeName: "Collision x64",
        },
      }).pipe(Effect.provide(dmgProvider)),
    );
    expect(errorOf(collidingLayout)).toMatchObject({
      _tag: "PublishFailed",
      reason: expect.stringContaining("collides"),
    });
    expect(existsSync(join(root, "collision-arm64.dmg"))).toBe(false);

    const wrongArchitectureArm = join(root, "wrong-architecture-arm64.dmg");
    const wrongArchitectureX64 = join(root, "wrong-architecture-x64.dmg");
    const wrongArchitecture = await Effect.runPromiseExit(
      DiskImage.createDiskImages({
        arm64: { sourceApp: armBundle, outfile: wrongArchitectureArm, volumeName: "Wrong arm64" },
        x64: {
          sourceApp: developerIdBundle(x64App, "arm64"),
          outfile: wrongArchitectureX64,
          volumeName: "Wrong x64",
        },
      }).pipe(Effect.provide(dmgProvider)),
    );
    expect(errorOf(wrongArchitecture)).toMatchObject({
      _tag: "AppleProductStateInvalid",
      expected: expect.stringContaining("x64"),
    });
    expect(existsSync(wrongArchitectureArm)).toBe(false);
    expect(existsSync(wrongArchitectureX64)).toBe(false);

    let detachLayout = "";
    const detachMount = join(root, "detach-mounted");
    const [detachFailureSpawner] = makeSpawner(({ args }) => {
      if (args[0] === "create") {
        detachLayout = args[args.indexOf("-srcfolder") + 1]!;
        writeFileSync(args.at(-1)!, "UDZO");
      }
      if (args[0] === "attach") {
        cpSync(detachLayout, detachMount, { recursive: true, verbatimSymlinks: true });
        return { stdout: `${mountedDevice}\tApple_HFS\t${detachMount}\n` };
      }
      if (args[0] === "info") return { stdout: `dev-entry: ${mountedDevice}\n` };
      if (args[0] === "detach") return { exitCode: 73, stderr: "detach failed" };
      return {};
    });
    const detachFailureProvider = DiskImage.layer({
      hdiutil: { executable: hdiutil, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(platform(detachFailureSpawner)));
    const detachArm = join(root, "detach-failure-arm64.dmg");
    const detachX64 = join(root, "detach-failure-x64.dmg");
    const detachFailure = await Effect.runPromiseExit(
      DiskImage.createDiskImages({
        arm64: { sourceApp: armBundle, outfile: detachArm, volumeName: "Detach arm64" },
        x64: { sourceApp: x64Bundle, outfile: detachX64, volumeName: "Detach x64" },
      }).pipe(Effect.provide(detachFailureProvider)),
    );
    expect(Exit.isFailure(detachFailure)).toBe(true);
    expect(existsSync(detachArm)).toBe(false);
    expect(existsSync(detachX64)).toBe(false);

    const [verificationFailureSpawner, verificationFailureInvocations] = makeSpawner(({ command, args }) =>
      basename(command) === "codesign" && args[0] === "--verify"
        ? { exitCode: 42, stderr: "signature invalid" }
        : {}
    );
    const verificationFailureProvider = DiskImage.layer({
      hdiutil: { executable: hdiutil, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(platform(verificationFailureSpawner)));
    const unverified = await Effect.runPromiseExit(
      DiskImage.createDiskImages({
        arm64: {
          sourceApp: armBundle,
          outfile: join(root, "unverified-arm64.dmg"),
          volumeName: "Unverified arm64",
        },
        x64: {
          sourceApp: x64Bundle,
          outfile: join(root, "unverified-x64.dmg"),
          volumeName: "Unverified x64",
        },
      }).pipe(Effect.provide(verificationFailureProvider)),
    );
    expect(errorOf(unverified)).toMatchObject({ _tag: "ToolFailed", tool: "codesign", exitCode: 42 });
    expect(verificationFailureInvocations.some(({ args }) => args[0] === "create")).toBe(false);

    let payloadIndex = 0;
    const [pkgSpawner, pkgInvocations] = makeSpawner(({ command, args }) => {
      if (basename(command) === "pkgbuild" && args[0] !== "--version") {
        writeFileSync(args.at(-1)!, "component");
      }
      if (basename(command) === "productbuild" && args[0] !== "--version") {
        writeFileSync(args.at(-1)!, "installer");
      }
      if (basename(command) === "pkgutil" && args[0] === "--payload-files") {
        const appName = payloadIndex++ === 0 ? "Fixture-arm64.app" : "Fixture-x64.app";
        return { stdout: `./${appName}/Contents/Info.plist\n` };
      }
      return {};
    });
    const pkgProvider = InstallerPackage.layer({
      pkgbuild: { executable: pkgbuild, version: "18.0" },
      productbuild: { executable: productbuild, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(platform(pkgSpawner)));
    const packages = await Effect.runPromise(
      InstallerPackage.buildInstallerPackages(
        {
          arm64: {
            sourceApp: armBundle,
            outfile: join(root, "fixture-arm64.pkg"),
            identifier: "dev.effect.build.fixture.arm64",
            version: "1.2.3",
          },
          x64: {
            sourceApp: x64Bundle,
            outfile: join(root, "fixture-x64.pkg"),
            identifier: "dev.effect.build.fixture.x64",
            version: "1.2.3",
          },
        },
      ).pipe(Effect.provide(pkgProvider)),
    );
    expect(packages.arm64.tool).toEqual({
      name: "pkgbuild+productbuild+pkgutil",
      version: "18.0;18.0;15.0",
    });
    expect(packages.arm64.architecture).toBe("arm64");
    expect(packages.x64.architecture).toBe("x64");
    const build = pkgInvocations.find(({ command, args }) =>
      basename(command) === "pkgbuild" && args[0] === "--component"
    )!;
    const packagedApp = build.args[1]!;
    expect(packagedApp).not.toBe(armApp);
    expect(packagedApp).toMatch(/\.effect-build-installer-app-.*\/Fixture-arm64\.app$/);
    expect(build.args.slice(0, 10)).toEqual([
      "--component",
      packagedApp,
      "--identifier",
      "dev.effect.build.fixture.arm64",
      "--version",
      "1.2.3",
      "--install-location",
      "/Applications",
      build.args[8],
    ]);
    expect(
      pkgInvocations.filter(({ command, args }) => basename(command) === "productbuild" && args[0] === "--package"),
    )
      .toHaveLength(2);
    expect(
      pkgInvocations.filter(({ command, args }) => basename(command) === "pkgutil" && args[0] === "--payload-files"),
    )
      .toHaveLength(2);
  });

  it("Developer ID-signs app and pkg copies with exact identities and redacted typed failures", async () => {
    const root = makeRoot();
    const codesign = executable(root, "codesign");
    const productsign = executable(root, "productsign");
    const pkgutil = executable(root, "pkgutil");
    const appIdentity = "A".repeat(40);
    const installerIdentity = "B".repeat(40);
    const sourceApp = join(root, "Unsigned.app");
    mkdirSync(join(sourceApp, "Contents/MacOS"), { recursive: true });
    mkdirSync(join(sourceApp, "Contents/Frameworks/Nested.framework"), { recursive: true });
    writeFileSync(join(sourceApp, "Contents/MacOS/app"), "app");
    writeFileSync(join(sourceApp, "Contents/Frameworks/Nested.framework/Nested"), "nested");
    const chainedFramework = join(sourceApp, "Contents/Frameworks/Chained.framework");
    mkdirSync(join(chainedFramework, "Versions/A/Resources"), { recursive: true });
    writeFileSync(join(chainedFramework, "Versions/A/Chained"), "chained");
    chmodSync(join(chainedFramework, "Versions/A/Chained"), 0o755);
    writeFileSync(join(chainedFramework, "Versions/A/Resources/Info.plist"), "info");
    symlinkSync("A", join(chainedFramework, "Versions/Current"));
    symlinkSync("Versions/Current/Chained", join(chainedFramework, "Chained"));
    symlinkSync("Versions/Current/Resources", join(chainedFramework, "Resources"));
    chmodSync(join(chainedFramework, "Versions/A/Resources"), 0o555);
    const entitlements = join(root, "app.entitlements");
    const unsignedDmg = join(root, "unsigned.dmg");
    writeFileSync(entitlements, "<plist/>");
    writeFileSync(unsignedDmg, "unsigned-dmg");
    const unsignedBundle = applicationBundle(sourceApp, "arm64");

    const [appSpawner, appInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "--force" && args.at(-1)?.includes("effect-build")) {
        const target = args.at(-1)!;
        if (target.endsWith(".dmg")) {
          writeFileSync(target, `${readFileSync(target, "utf8")}:developer-id-signed`);
        } else if (target.includes(".effect-build-")) {
          mkdirSync(join(target, "Contents/_CodeSignature"), { recursive: true });
          writeFileSync(join(target, "Contents/_CodeSignature/CodeResources"), "signed");
        }
      }
      return {};
    });
    const appDeps = Layer.merge(
      platform(appSpawner),
      CodeSign.developerIdApplicationIdentityLayer(appIdentity as CodeSign.CertificateSha1),
    );
    const appProvider = CodeSign.appLayer({
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(appDeps));
    const { signed, signedDmg } = await Effect.runPromise(
      Effect.gen(function*() {
        const signed = yield* CodeSign.signApp({
          sourceApp: unsignedBundle,
          outdir: join(root, "Signed.app"),
          entitlements: fileArtifact(entitlements, "entitlements"),
          nestedCode: [{ path: "Contents/Frameworks/Nested.framework" }],
        });
        const signedDmg = yield* CodeSign.signDiskImage({
          sourceDiskImage: {
            _tag: "File",
            path: unsignedDmg,
            bytes: readFileSync(unsignedDmg).byteLength,
            sha256: sha256(unsignedDmg),
            tool: { name: "hdiutil", version: "18.0" },
            architecture: "arm64",
          },
          outfile: join(root, "signed.dmg"),
        });
        return { signed, signedDmg };
      }).pipe(Effect.provide(appProvider)),
    );
    expect(signed.tool).toEqual({ name: "codesign", version: "18.0" });
    expect(signed.architecture).toBe("arm64");
    expect(signed.entries).toContainEqual(expect.objectContaining({
      _tag: "SymbolicLink",
      path: join(root, "Signed.app/Contents/Frameworks/Chained.framework/Chained"),
      target: "Versions/Current/Chained",
    }));
    expect(readlinkSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/Current"))).toBe("A");
    expect(readlinkSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Resources"))).toBe(
      "Versions/Current/Resources",
    );
    expect(lstatSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/A/Resources")).mode & 0o777)
      .toBe(0o555);
    expect(signed.signature).toMatchObject({
      _tag: "DeveloperIdApplicationSignature",
      certificateSha1: appIdentity,
      tool: { name: "codesign", version: "18.0" },
      hardenedRuntime: true,
      secureTimestamp: true,
    });
    const appCommands = appInvocations.slice(1).map(({ args }) => args);
    expect(appCommands[0]!.slice(0, 6)).toEqual([
      "--force",
      "--sign",
      appIdentity,
      "--timestamp",
      "--options",
      "runtime",
    ]);
    expect(appCommands[0]!.at(-1)).toMatch(/Contents\/Frameworks\/Nested\.framework$/);
    expect(appCommands[1]).toContain("--entitlements");
    expect(appCommands[2]!.slice(0, 4)).toEqual(["--verify", "--deep", "--strict", "--verbose=2"]);
    expect(appCommands[3]).toEqual([
      "--force",
      "--sign",
      appIdentity,
      "--timestamp",
      expect.stringMatching(/\.effect-build-.*\/signed\.dmg$/),
    ]);
    expect(appCommands[4]).toEqual(["--verify", "--strict", "--verbose=2", appCommands[3]!.at(-1)]);
    expect(readFileSync(signedDmg.path, "utf8")).toBe("unsigned-dmg:developer-id-signed");
    expect(signedDmg.sha256).toBe(sha256(signedDmg.path));
    expect(signedDmg.architecture).toBe("arm64");
    expect(signedDmg.signature).toMatchObject({
      _tag: "DeveloperIdDiskImageSignature",
      certificateSha1: appIdentity,
      secureTimestamp: true,
    });

    const unsignedPackage = join(root, "unsigned.pkg");
    writeFileSync(unsignedPackage, "unsigned");
    const [pkgSpawner, pkgInvocations] = makeSpawner(({ command, args }) => {
      if (basename(command) === "productsign" && args[0] === "--sign") copyFileSync(args[3]!, args[4]!);
      return {};
    });
    const pkgDeps = Layer.merge(
      platform(pkgSpawner),
      CodeSign.developerIdInstallerIdentityLayer(installerIdentity as CodeSign.CertificateSha1),
    );
    const pkgProvider = CodeSign.installerLayer({
      productsign: { executable: productsign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(pkgDeps));
    const signedPackage = await Effect.runPromise(
      CodeSign.signInstallerPackage(
        {
          sourcePackage: {
            _tag: "File",
            path: unsignedPackage,
            bytes: readFileSync(unsignedPackage).byteLength,
            sha256: sha256(unsignedPackage),
            tool: { name: "productbuild", version: "18.0" },
            architecture: "arm64",
          },
          outfile: join(root, "signed.pkg"),
        },
      ).pipe(Effect.provide(pkgProvider)),
    );
    expect(signedPackage._tag).toBe("File");
    expect(signedPackage.architecture).toBe("arm64");
    expect(signedPackage.signature).toMatchObject({
      _tag: "DeveloperIdInstallerSignature",
      certificateSha1: installerIdentity,
      signer: { name: "productsign", version: "18.0" },
      verifier: { name: "pkgutil", version: "15.0" },
    });
    const productCommand = pkgInvocations.find(({ command, args }) =>
      basename(command) === "productsign" && args[0] === "--sign"
    )!;
    expect(productCommand.args.slice(0, 3)).toEqual(["--sign", installerIdentity, "--timestamp"]);
    expect(productCommand.args[3]).not.toBe(unsignedPackage);
    expect(productCommand.args[3]).toMatch(/\.effect-build-.*\/signed\.pkg\.unsigned\.pkg$/);

    const [failureSpawner] = makeSpawner(({ args }) =>
      args[0] === "--force"
        ? { exitCode: 31, stderr: `identity ${appIdentity} rejected` }
        : {}
    );
    const failureDeps = Layer.merge(
      platform(failureSpawner),
      CodeSign.developerIdApplicationIdentityLayer(appIdentity as CodeSign.CertificateSha1),
    );
    const failureProvider = CodeSign.appLayer({
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(failureDeps));
    const failed = await Effect.runPromiseExit(
      CodeSign.signApp(
        {
          sourceApp: unsignedBundle,
          outdir: join(root, "NeverPublished.app"),
        },
      ).pipe(Effect.provide(failureProvider)),
    );
    const failure = errorOf(failed) as { readonly _tag: string; readonly stderr: string };
    expect(failure._tag).toBe("ToolFailed");
    expect(failure.stderr).toContain("<redacted>");
    expect(JSON.stringify(failure)).not.toContain(appIdentity);
    expect(existsSync(join(root, "NeverPublished.app/Contents"))).toBe(false);
    chmodSync(join(chainedFramework, "Versions/A/Resources"), 0o755);
    chmodSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/A/Resources"), 0o755);
  });

  it("correlates submit/info/log across two runners without persisting credentials", async () => {
    const root = makeRoot();
    const xcrun = executable(root, "xcrun");
    const ditto = executable(root, "ditto");
    const codesign = executable(root, "codesign");
    const pkgutil = executable(root, "pkgutil");
    const profile = "private-notary-profile";
    const submissionId = "3f33f890-0cbf-4c1e-bb39-6fba74a594f0";
    const artifact = join(root, "signed.pkg");
    writeFileSync(artifact, "signed");
    const artifactDigest = sha256(artifact);
    const largeIssueMessage = "x".repeat(1_100_000);
    const submitInput = (artifactSha256: string): Notary.SubmitInput => ({
      kind: "pkg",
      artifact: {
        ...developerIdInstallerPackage(artifact),
        sha256: artifactSha256,
      },
    });
    let submittedSnapshot = "";
    const [runnerOne, runnerOneInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "notarytool" && args[1] === "submit") {
        submittedSnapshot = readFileSync(args[2]!, "utf8");
        return { stdout: JSON.stringify({ id: submissionId, message: `uploaded for ${profile}` }) };
      }
      return { stdout: "notarytool version 1.0.0\n" };
    });
    const runnerOneDeps = Layer.merge(
      platform(runnerOne),
      Notary.keychainProfileCredentialLayer({ profile }),
    );
    const runnerOneProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(runnerOneDeps));
    const submitted = await Effect.runPromise(
      Notary.submit(submitInput(artifactDigest)).pipe(Effect.provide(runnerOneProvider)),
    );
    expect(submitted.submissionId).toBe(submissionId);
    expect(submitted.status._tag).toBe("Pending");
    expect(submitted.submissionTool).toEqual({ name: "notarytool", version: "18.0" });
    expect(submitted.tool).toEqual({ name: "notarytool", version: "18.0" });
    expect(JSON.stringify(submitted)).not.toContain(profile);
    const stagedSubmission = runnerOneInvocations[5]!.args[2]!;
    expect(stagedSubmission).not.toBe(artifact);
    expect(stagedSubmission).toMatch(/\.effect-build-notary-.*\/signed\.pkg$/);
    expect(submittedSnapshot).toBe("signed");
    expect(runnerOneInvocations[5]!.args).toEqual([
      "notarytool",
      "submit",
      stagedSubmission,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);

    const reference = new Notary.SubmissionReference({
      submissionId: submitted.submissionId,
      kind: submitted.kind,
      architecture: submitted.architecture,
      artifactBytes: submitted.artifactBytes,
      artifactSha256: submitted.artifactSha256,
      submissionTool: submitted.submissionTool,
      ...(submitted.stapleTarget === undefined ? {} : { stapleTarget: submitted.stapleTarget }),
      ...(submitted.transportTool === undefined ? {} : { transportTool: submitted.transportTool }),
    });
    const [runnerTwo, runnerTwoInvocations] = makeSpawner(({ args }) => {
      if (args[1] === "info") {
        return {
          stdout: JSON.stringify({
            id: submissionId,
            status: "Accepted",
            name: `signed-${profile}.pkg`,
            createdDate: "2026-08-25T00:00:00Z",
          }),
        };
      }
      if (args[1] === "log") {
        return {
          stdout: JSON.stringify({
            jobId: submissionId.toUpperCase(),
            status: "Accepted",
            statusSummary: "Ready for distribution",
            statusCode: 0,
            archiveFilename: "signed.pkg",
            issues: [
              { severity: "warning", message: largeIssueMessage },
              { severity: "warning", message: `profile ${profile} was ignored` },
            ],
          }),
        };
      }
      return { stdout: "notarytool version 1.0.0\n" };
    });
    const runnerTwoDeps = Layer.merge(
      platform(runnerTwo),
      Notary.keychainProfileCredentialLayer({ profile }),
    );
    const runnerTwoProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.1" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(runnerTwoDeps));
    const { log, observed } = await Effect.runPromise(
      Effect.gen(function*() {
        const observed = yield* Notary.info(reference);
        const log = yield* Notary.log(reference);
        return { observed, log };
      }).pipe(Effect.provide(runnerTwoProvider)),
    );
    expect(observed.status._tag).toBe("Accepted");
    const accepted = await Effect.runPromise(Notary.acceptedReference(observed));
    expect(accepted).toMatchObject({
      providerStatus: "Accepted",
      stapleTarget: {
        kind: "pkg",
        identityKind: "file-bytes",
        artifactSha256: artifactDigest,
      },
      submissionTool: { name: "notarytool", version: "18.0" },
      tool: { name: "notarytool", version: "18.1" },
    });
    const pendingReference = await Effect.runPromiseExit(Notary.acceptedReference(submitted));
    expect(errorOf(pendingReference)).toMatchObject({ _tag: "NotaryResultNotAccepted" });
    expect(log.submissionId).toBe(reference.submissionId);
    expect(log.artifactSha256).toBe(artifactDigest);
    expect(log.issues[0]?.message).toHaveLength(1_100_000);
    expect(JSON.stringify({ observed, log })).not.toContain(profile);
    expect(runnerTwoInvocations[4]!.args).toEqual([
      "notarytool",
      "info",
      submissionId,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);
    expect(runnerTwoInvocations[5]!.args).toEqual([
      "notarytool",
      "log",
      submissionId,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);

    const differentId = "d53e8e0e-1ca7-4fc4-a587-17347c6023af";
    const [mismatchSpawner] = makeSpawner(({ args }) =>
      args[1] === "info"
        ? { stdout: JSON.stringify({ id: differentId, status: "Accepted" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const mismatchProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(mismatchSpawner),
      Notary.keychainProfileCredentialLayer({ profile }),
    )));
    const mismatchExit = await Effect.runPromiseExit(
      Notary.info(reference).pipe(Effect.provide(mismatchProvider)),
    );
    const mismatch = errorOf(mismatchExit) as { readonly _tag: string; readonly observedSubmissionId: string };
    expect(mismatch).toMatchObject({
      _tag: "NotaryCorrelationFailed",
      observedSubmissionId: differentId,
    });

    const [unknownSpawner] = makeSpawner(({ args }) =>
      args[1] === "submit"
        ? { exitCode: 75, stderr: `transport lost for ${profile}` }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const unknownProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(unknownSpawner),
      Notary.keychainProfileCredentialLayer({ profile }),
    )));
    const unknownExit = await Effect.runPromiseExit(
      Notary.submit(submitInput(artifactDigest)).pipe(Effect.provide(unknownProvider)),
    );
    const unknown = errorOf(unknownExit) as { readonly _tag: string; readonly reason: string };
    expect(unknown._tag).toBe("SubmissionOutcomeUnknown");
    expect(unknown.reason).toContain("<redacted>");
    expect(JSON.stringify(unknown)).not.toContain(profile);

    const [malformedSpawner] = makeSpawner(({ args }) =>
      args[1] === "submit"
        ? { stdout: JSON.stringify({ message: "uploaded but response identity was lost" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const malformedProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(malformedSpawner),
      Notary.keychainProfileCredentialLayer({ profile }),
    )));
    const malformedExit = await Effect.runPromiseExit(
      Notary.submit(submitInput(artifactDigest)).pipe(Effect.provide(malformedProvider)),
    );
    expect(errorOf(malformedExit)).toMatchObject({
      _tag: "SubmissionOutcomeUnknown",
      artifactSha256: artifactDigest,
    });

    const [identitySpawner, identityInvocations] = makeSpawner(({ args }) =>
      args[1] === "submit"
        ? { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const identityProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(identitySpawner),
      Notary.keychainProfileCredentialLayer({ profile }),
    )));
    const identityExit = await Effect.runPromiseExit(
      Notary.submit(submitInput(digest)).pipe(Effect.provide(identityProvider)),
    );
    expect(errorOf(identityExit)).toMatchObject({
      _tag: "AppleFileArtifactIdentityMismatch",
      expectedSha256: digest,
    });
    expect(identityInvocations.map(({ args }) => args)).toEqual([
      ["notarytool", "--version"],
      ["--help"],
      ["--version"],
      ["--help"],
    ]);
  });

  it("binds an app ZIP transport to an exact symlink-aware bundle before stapling", async () => {
    const root = makeRoot();
    const xcrun = executable(root, "xcrun");
    const ditto = executable(root, "ditto");
    const codesign = executable(root, "codesign");
    const pkgutil = executable(root, "pkgutil");
    const sourceApp = join(root, "Signed.app");
    mkdirSync(join(sourceApp, "Contents/MacOS"), { recursive: true });
    mkdirSync(join(sourceApp, "Contents/Resources"), { recursive: true });
    writeFileSync(join(sourceApp, "Contents/MacOS/app"), "signed-app");
    chmodSync(join(sourceApp, "Contents/MacOS/app"), 0o755);
    writeFileSync(join(sourceApp, "Contents/Resources/version-a"), "version-a");
    symlinkSync("version-a", join(sourceApp, "Contents/Resources/current"));
    const framework = join(sourceApp, "Contents/Frameworks/Fixture.framework");
    mkdirSync(join(framework, "Versions/A/Resources"), { recursive: true });
    writeFileSync(join(framework, "Versions/A/Fixture"), "framework-binary");
    chmodSync(join(framework, "Versions/A/Fixture"), 0o755);
    writeFileSync(join(framework, "Versions/A/Resources/Info.plist"), "framework-info");
    symlinkSync("A", join(framework, "Versions/Current"));
    symlinkSync("Versions/Current/Fixture", join(framework, "Fixture"));
    symlinkSync("Versions/Current/Resources", join(framework, "Resources"));

    const bundleAt = (outdir: string) => developerIdBundle(outdir);
    const bundle = bundleAt(sourceApp);
    const submissionId = "f17717f8-c582-4ef7-8a18-e8872eec79e0";
    let transportSource = "";
    const [notarySpawner, notaryInvocations] = makeSpawner(({ command, args }) => {
      if (basename(command) === "ditto" && args[0] === "-c") {
        transportSource = args.at(-2)!;
        writeFileSync(args.at(-1)!, `zip:${basename(transportSource)}`);
      }
      if (basename(command) === "ditto" && args[0] === "-x") {
        const extractedApp = join(args.at(-1)!, basename(transportSource));
        cpSync(transportSource, extractedApp, {
          recursive: true,
          verbatimSymlinks: true,
        });
      }
      if (args[0] === "notarytool" && args[1] === "submit") {
        return { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) };
      }
      return { stdout: "tool version 1\n" };
    });
    const notaryProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(notarySpawner),
      Notary.keychainProfileCredentialLayer({ profile: "fixture-profile" }),
    )));
    const submission = await Effect.runPromise(
      Notary.submitApp({ bundle }).pipe(Effect.provide(notaryProvider)),
    );
    const acceptance = await Effect.runPromise(Notary.acceptedReference(submission));
    expect(submission).toMatchObject({
      kind: "zip",
      status: { _tag: "Accepted" },
      stapleTarget: { kind: "app", identityKind: "bundle-manifest", bundleName: "Signed.app" },
      transportTool: { name: "ditto", version: "18.0" },
    });
    expect(submission.artifactSha256).toHaveLength(64);
    expect(acceptance.stapleTarget.artifactSha256).not.toBe(submission.artifactSha256);
    expect(notaryInvocations.map(({ args }) => args[0])).toEqual([
      "notarytool",
      "--help",
      "--version",
      "--help",
      "--verify",
      "-c",
      "-x",
      "--verify",
      "notarytool",
    ]);

    const [stapleSpawner] = makeSpawner(({ args }) => {
      if (args[0] === "stapler" && args[1] === "staple") {
        mkdirSync(join(args[2]!, "Contents/_CodeSignature"), { recursive: true });
        writeFileSync(join(args[2]!, "Contents/_CodeSignature/NotaryTicket"), "ticket");
      }
      return {};
    });
    const stapleProvider = Staple.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(platform(stapleSpawner)));
    const stapled = await Effect.runPromise(
      Staple.stapleApp({
        source: bundle,
        acceptance,
        outdir: join(root, "Stapled.app"),
      }).pipe(Effect.provide(stapleProvider)),
    );
    expect(stapled.entries).toContainEqual(expect.objectContaining({
      _tag: "SymbolicLink",
      path: join(root, "Stapled.app/Contents/Resources/current"),
      target: "version-a",
    }));
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Versions/Current"))).toBe("A");
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Fixture"))).toBe(
      "Versions/Current/Fixture",
    );
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Resources"))).toBe(
      "Versions/Current/Resources",
    );
    expect(readFileSync(join(root, "Stapled.app/Contents/_CodeSignature/NotaryTicket"), "utf8")).toBe("ticket");

    const changedApp = join(root, "Changed.app");
    cpSync(sourceApp, changedApp, { recursive: true, verbatimSymlinks: true });
    writeFileSync(join(changedApp, "Contents/Resources/version-a"), "different");
    const rejected = await Effect.runPromiseExit(
      Staple.stapleApp({
        source: bundleAt(changedApp),
        acceptance,
        outdir: join(root, "MustNotStaple.app"),
      }).pipe(Effect.provide(stapleProvider)),
    );
    expect(errorOf(rejected)).toMatchObject({ _tag: "NotaryAcceptanceMismatch" });
    expect(existsSync(join(root, "MustNotStaple.app"))).toBe(false);

    let badTransportSubmitted = false;
    let badTransportSource = "";
    const [badTransportSpawner] = makeSpawner(({ command, args }) => {
      if (basename(command) === "ditto" && args[0] === "-c") {
        badTransportSource = args.at(-2)!;
        writeFileSync(args.at(-1)!, "corruptible-zip");
      }
      if (basename(command) === "ditto" && args[0] === "-x") {
        const extractedApp = join(args.at(-1)!, basename(badTransportSource));
        cpSync(badTransportSource, extractedApp, { recursive: true, verbatimSymlinks: true });
        writeFileSync(join(extractedApp, "Contents/Resources/version-a"), "transport changed it");
      }
      if (args[0] === "notarytool" && args[1] === "submit") badTransportSubmitted = true;
      return { stdout: "tool version 1\n" };
    });
    const badTransportProvider = Notary.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(badTransportSpawner),
      Notary.keychainProfileCredentialLayer({ profile: "fixture-profile" }),
    )));
    const badTransport = await Effect.runPromiseExit(
      Notary.submitApp({ bundle }).pipe(Effect.provide(badTransportProvider)),
    );
    expect(errorOf(badTransport)).toMatchObject({ _tag: "AppleBundleInspectionFailed" });
    expect(badTransportSubmitted).toBe(false);
  });

  it("staples new bytes and performs product-specific Gatekeeper verification", async () => {
    const root = makeRoot();
    const xcrun = executable(root, "xcrun");
    const spctl = executable(root, "spctl");
    const codesign = executable(root, "codesign");
    const pkgutil = executable(root, "pkgutil");
    const sourceDmg = join(root, "accepted.dmg");
    writeFileSync(sourceDmg, "accepted");
    const sourceDmgArtifact = developerIdDiskImage(sourceDmg);
    const acceptance = new Notary.AcceptedReference({
      submissionId: "3f33f890-0cbf-4c1e-bb39-6fba74a594f0",
      kind: "dmg",
      architecture: "arm64",
      artifactBytes: sourceDmgArtifact.bytes,
      artifactSha256: sourceDmgArtifact.sha256 as Model.Sha256,
      providerStatus: "Accepted",
      submissionTool: new Model.AppleToolFact({ name: "notarytool", version: "17.4" }),
      tool: new Model.AppleToolFact({ name: "notarytool", version: "18.0" }),
      stapleTarget: new Notary.StapleTarget({
        kind: "dmg",
        identityKind: "file-bytes",
        artifactBytes: sourceDmgArtifact.bytes,
        artifactSha256: sourceDmgArtifact.sha256 as Model.Sha256,
      }),
    });
    const [stapleSpawner, stapleInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "stapler" && args[1] === "staple") {
        writeFileSync(args[2]!, `${readFileSync(args[2]!, "utf8")}:stapled`);
      }
      return {};
    });
    const stapleProvider = Staple.layer({
      xcrun: { executable: xcrun, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(platform(stapleSpawner)));
    const stapled = await Effect.runPromise(
      Staple.stapleFile(
        {
          kind: "dmg",
          source: sourceDmgArtifact,
          acceptance,
          outfile: join(root, "final.dmg"),
        },
      ).pipe(Effect.provide(stapleProvider)),
    );
    expect(stapled._tag).toBe("File");
    expect(stapled.tool).toEqual({ name: "stapler", version: "18.0" });
    expect(stapled.notarizationTicket).toMatchObject({
      submissionTool: { name: "notarytool", version: "17.4" },
      acceptanceTool: { name: "notarytool", version: "18.0" },
    });
    expect(readFileSync(stapled.path, "utf8")).toBe("accepted:stapled");
    expect(
      stapleInvocations.filter(({ command }) => basename(command) === "xcrun").map(({ args }) => args.slice(0, 2)),
    ).toEqual([
      ["stapler", "-h"],
      ["stapler", "staple"],
      ["stapler", "validate"],
    ]);

    const mismatchedAcceptance = new Notary.AcceptedReference({
      ...acceptance,
      stapleTarget: new Notary.StapleTarget({
        kind: "dmg",
        identityKind: "file-bytes",
        artifactBytes: sourceDmgArtifact.bytes,
        artifactSha256: digest as Model.Sha256,
      }),
    });
    const rejectedStaple = await Effect.runPromiseExit(
      Staple.stapleFile({
        kind: "dmg",
        source: sourceDmgArtifact,
        acceptance: mismatchedAcceptance,
        outfile: join(root, "must-not-staple.dmg"),
      }).pipe(Effect.provide(stapleProvider)),
    );
    expect(errorOf(rejectedStaple)).toMatchObject({ _tag: "NotaryAcceptanceMismatch" });
    expect(existsSync(join(root, "must-not-staple.dmg"))).toBe(false);

    const finalApp = join(root, "Final.app");
    const finalPkg = join(root, "Final.pkg");
    mkdirSync(join(finalApp, "Contents/MacOS"), { recursive: true });
    writeFileSync(join(finalApp, "Contents/MacOS/app"), "signed-app");
    writeFileSync(finalPkg, "signed-pkg");
    const assessmentTicket = new Model.NotarizationTicket({
      submissionId: "f17717f8-c582-4ef7-8a18-e8872eec79e0",
      submittedKind: "zip",
      submittedBytes: 1,
      submittedSha256: digest as Model.Sha256,
      targetKind: "app",
      targetIdentityKind: "bundle-manifest",
      targetBytes: 1,
      targetSha256: digest as Model.Sha256,
      targetArchitecture: "arm64",
      targetBundleName: "Final.app",
      submissionTool: new Model.AppleToolFact({ name: "notarytool", version: "18.0" }),
      acceptanceTool: new Model.AppleToolFact({ name: "notarytool", version: "18.0" }),
    });
    const finalAppArtifact: Model.StapledApplicationBundle = {
      ...developerIdBundle(finalApp),
      tool: { name: "stapler", version: "18.0" },
      notarizationTicket: assessmentTicket,
    };
    const finalPkgArtifact: Model.StapledInstallerPackage = {
      ...developerIdInstallerPackage(finalPkg),
      tool: { name: "stapler", version: "18.0" },
      notarizationTicket: new Model.NotarizationTicket({
        submissionId: assessmentTicket.submissionId,
        submittedKind: "pkg",
        submittedBytes: assessmentTicket.submittedBytes,
        submittedSha256: assessmentTicket.submittedSha256,
        targetKind: "pkg",
        targetIdentityKind: "file-bytes",
        targetBytes: assessmentTicket.targetBytes,
        targetSha256: assessmentTicket.targetSha256,
        targetArchitecture: "arm64",
        submissionTool: assessmentTicket.submissionTool,
        acceptanceTool: assessmentTicket.acceptanceTool,
      }),
    };

    const [assessSpawner, assessInvocations] = makeSpawner(() => ({}));
    const assessProvider = Assess.layer({
      spctl: { executable: spctl, version: "15.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(platform(assessSpawner)));
    const { app, dmg, pkg } = await Effect.runPromise(
      Effect.gen(function*() {
        const app = yield* Assess.assess(
          {
            kind: "app",
            artifact: finalAppArtifact,
          },
        );
        const dmg = yield* Assess.assess(
          {
            kind: "dmg",
            artifact: stapled,
          },
        );
        const pkg = yield* Assess.assess(
          {
            kind: "pkg",
            artifact: finalPkgArtifact,
          },
        );
        return { app, dmg, pkg };
      }).pipe(Effect.provide(assessProvider)),
    );
    expect(app.structuralVerifier.name).toBe("codesign");
    expect(app.identityKind).toBe("bundle-manifest");
    expect(app.artifactSha256).toHaveLength(64);
    expect(dmg.accepted).toBe(true);
    expect(dmg.identityKind).toBe("file-bytes");
    expect(dmg.artifactSha256).toBe(sha256(stapled.path));
    expect(pkg.structuralVerifier.name).toBe("pkgutil");
    const commands = assessInvocations.slice(3).map(({ command, args }) => [basename(command), ...args]);
    const assessedApp = commands[0]!.at(-1)!;
    const assessedDmg = commands[2]!.at(-1)!;
    const assessedPkg = commands[4]!.at(-1)!;
    expect(assessedApp).toMatch(/\.effect-build-assess-.*\/Final\.app$/);
    expect(assessedDmg).toMatch(/\.effect-build-assess-.*\/final\.dmg$/);
    expect(assessedPkg).toMatch(/\.effect-build-assess-.*\/Final\.pkg$/);
    expect(commands).toEqual([
      ["spctl", "--assess", "--type", "execute", "--verbose=4", assessedApp],
      ["codesign", "--verify", "--deep", "--strict", "--verbose=2", assessedApp],
      [
        "spctl",
        "--assess",
        "--type",
        "open",
        "--context",
        "context:primary-signature",
        "--verbose=4",
        assessedDmg,
      ],
      ["codesign", "--verify", "--strict", "--verbose=2", assessedDmg],
      ["spctl", "--assess", "--type", "install", "--verbose=4", assessedPkg],
      ["pkgutil", "--check-signature", assessedPkg],
    ]);

    const changingPkg = join(root, "changing.pkg");
    writeFileSync(changingPkg, "before");
    const [changingSpawner] = makeSpawner(({ command, args }) => {
      if (basename(command) === "spctl" && args[0] === "--assess") writeFileSync(args.at(-1)!, "after");
      return {};
    });
    const changingProvider = Assess.layer({
      spctl: { executable: spctl, version: "15.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(platform(changingSpawner)));
    const changed = await Effect.runPromiseExit(
      Assess.assess({
        kind: "pkg",
        artifact: {
          ...developerIdInstallerPackage(changingPkg),
          tool: { name: "stapler", version: "18.0" },
          notarizationTicket: new Model.NotarizationTicket({
            submissionId: assessmentTicket.submissionId,
            submittedKind: "pkg",
            submittedBytes: assessmentTicket.submittedBytes,
            submittedSha256: assessmentTicket.submittedSha256,
            targetKind: "pkg",
            targetIdentityKind: "file-bytes",
            targetBytes: assessmentTicket.targetBytes,
            targetSha256: assessmentTicket.targetSha256,
            targetArchitecture: "arm64",
            submissionTool: assessmentTicket.submissionTool,
            acceptanceTool: assessmentTicket.acceptanceTool,
          }),
        },
      }).pipe(Effect.provide(changingProvider)),
    );
    expect(errorOf(changed)).toMatchObject({ _tag: "AppleFileArtifactIdentityMismatch" });
  });
});
