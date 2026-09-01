import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, FileSystem, Layer, PlatformError, Sink, Stream } from "effect";
import * as Artifact from "effect-build/Artifact";
import * as File from "effect-build/Author/File";
import type * as Tool from "effect-build/Author/Tool";
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
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as AppBundle from "../src/AppBundle.js";
import * as Assess from "../src/Assess.js";
import * as CodeSign from "../src/CodeSign.js";
import * as DiskImage from "../src/DiskImage.js";
import * as InstallerPackage from "../src/InstallerPackage.js";
import { claimApplePairMember, selectAppleTool, withApplePairRollback } from "../src/internal.js";
import * as NotaryRejectionFixture from "../src/internal/NotaryRejectionFixture.js";
import * as Model from "../src/Model.js";
import * as Notary from "../src/Notary.js";
import * as Staple from "../src/Staple.js";

// @ts-expect-error Apple certification helpers are intentionally private Node script modules.
const { extractAppleOperationToolObservations } = await import(
  "../../../scripts/apple-certification/tool-observation.mjs"
);

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

const nativeProbeCases = [
  ["plutil", ["-help"], 0],
  ["codesign", ["--version"], 2],
  ["productsign", ["--version"], 1],
  ["hdiutil", ["help"], 0],
  ["pkgbuild", ["--version"], 1],
  ["productbuild", ["--version"], 1],
  ["pkgutil", ["--help"], 0],
  ["spctl", ["--version"], 2],
  ["notarytool", ["--version"], 0],
  ["ditto", ["--help"], 1],
  ["stapler", ["-h"], 64],
] as const;

const nonzeroNativeProbeCases = nativeProbeCases.filter(([, , exitCode]) => exitCode !== 0);

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
const digest = "a".repeat(64);

interface ExpectedAppleTool {
  readonly name: string;
  readonly capabilityId: string;
}

const appleToolLineage = (JSON.parse(
  readFileSync(new URL("../../../tooling/effect-build-contract.json", import.meta.url), "utf8"),
) as {
  readonly releaseCertification: {
    readonly apple: {
      readonly operationToolLineage: {
        readonly byOperationId: Readonly<Record<string, Readonly<Record<string, readonly ExpectedAppleTool[]>>>>;
      };
    };
  };
}).releaseCertification.apple.operationToolLineage.byOperationId;

const extractedToolNames = (
  operationId: string,
  product: string,
  carriers: readonly unknown[],
): readonly string[] =>
  extractAppleOperationToolObservations({
    operationId,
    product,
    carriers,
    expectedComponents: appleToolLineage[operationId]![product]!,
  }).map((observation: { readonly name: string }) => observation.name);

const toolObservation = <const Name extends string>(name: Name, version = "18.0"): Tool.Observation<Name> => ({
  name,
  participants: [{
    role: "fixture",
    name,
    version,
    revision: "fixture",
    channel: "test",
    content: { bytes: Artifact.decimalBytes("1"), digest: Artifact.sha256Digest(digest) },
  }],
  capabilities: [],
});

const filePublication = {
  scope: "file" as const,
  commit: "same-parent-no-replace-link" as const,
  committed: true as const,
};
const treePublication = { scope: "tree" as const, commit: "same-parent-rename" as const, committed: true as const };

const fileArtifact = (file: string, name = "fixture") => ({
  _tag: "HashedFile" as const,
  path: realpathSync(file) as Artifact.AbsolutePath,
  bytes: Artifact.decimalBytes(`${readFileSync(file).byteLength}`),
  digest: Artifact.sha256Digest(sha256(file)),
  provenance: toolObservation(name),
  publication: filePublication,
});

const executableArtifact = (file: string, target: "macos-aarch64" | "macos-x64") => ({
  _tag: "HashedExecutable" as const,
  path: realpathSync(file) as Artifact.AbsolutePath,
  bytes: Artifact.decimalBytes(`${readFileSync(file).byteLength}`),
  digest: Artifact.sha256Digest(sha256(file)),
  target,
  nativeFormat: "mach-o" as const,
  runtime: { name: "fixture", version: "1.0.0" },
  provenance: toolObservation("fixture-compiler", "1.0.0"),
  publication: filePublication,
});

const bundleArtifact = (outdir: string, name = "fixture") => {
  const entries: Array<
    | {
      readonly kind: "directory";
      readonly relativePath: Artifact.PortableRelativePath;
      readonly mode: Artifact.FileMode;
    }
    | {
      readonly kind: "file";
      readonly relativePath: Artifact.PortableRelativePath;
      readonly mode: Artifact.FileMode;
      readonly bytes: Artifact.DecimalBytes;
      readonly digest: Artifact.Digest;
    }
    | { readonly kind: "symbolic-link"; readonly relativePath: Artifact.PortableRelativePath; readonly target: string }
  > = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      const information = lstatSync(entryPath);
      const relativePath = Artifact.portableRelativePath(entryPath.slice(outdir.length + 1).split("\\").join("/"));
      if (entry.isSymbolicLink()) {
        entries.push({ kind: "symbolic-link", relativePath, target: readlinkSync(entryPath) });
      } else if (entry.isDirectory()) {
        entries.push({ kind: "directory", relativePath, mode: Artifact.fileMode(information.mode & 0o7777) });
        visit(entryPath);
      } else if (entry.isFile()) {
        entries.push({
          kind: "file",
          relativePath,
          mode: Artifact.fileMode(information.mode & 0o7777),
          bytes: Artifact.decimalBytes(`${information.size}`),
          digest: Artifact.sha256Digest(sha256(entryPath)),
        });
      }
    }
  };
  visit(outdir);
  const sorted = entries.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.relativePath, "utf8"),
      Buffer.from(right.relativePath, "utf8"),
    )
  );
  const rootMode = Artifact.fileMode(lstatSync(outdir).mode & 0o7777);
  const totalBytes = Artifact.decimalBytes(`${
    sorted.reduce(
      (total, entry) => total + (entry.kind === "file" ? Number(entry.bytes) : 0),
      0,
    )
  }`);
  const manifestDigest = Artifact.sha256Digest(
    createHash("sha256").update(JSON.stringify({ rootMode, totalBytes, entries: sorted })).digest("hex"),
  );
  return {
    _tag: "HashedTree" as const,
    root: realpathSync(outdir) as Artifact.AbsolutePath,
    rootMode,
    entries: sorted,
    totalBytes,
    manifestDigest,
    provenance: toolObservation(name),
    publication: treePublication,
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
    tool: toolObservation("codesign"),
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
    tool: toolObservation("codesign"),
    secureTimestamp: true,
  }),
});

const developerIdInstallerPackage = (
  file: string,
  architecture: Model.Architecture = "arm64",
): Model.DeveloperIdInstallerPackage => {
  const signer = toolObservation("productsign");
  const verifier = toolObservation("pkgutil", "15.0");
  return {
    ...fileArtifact(file, "productsign+pkgutil"),
    provenance: {
      name: "productsign",
      participants: [...signer.participants, ...verifier.participants],
      capabilities: [...signer.capabilities, ...verifier.capabilities],
    },
    architecture,
    signature: new Model.DeveloperIdInstallerSignature({
      architecture,
      certificateSha1: installerIdentity,
      signer,
      verifier,
    }),
  };
};

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
      const nativeProbeExitCode = nativeProbeCases.find(([name, args]) =>
        basename(command.command) === name
        && args.length === command.args.length
        && args.every((value, index) => value === command.args[index])
      )?.[2];
      const exitCode = completion.exitCode ?? nativeProbeExitCode ?? 0;
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

const errorTagsOf = <A, E>(exit: Exit.Exit<A, E>): readonly string[] => {
  if (!Exit.isFailure(exit)) throw new Error("expected a failure cause");
  return exit.cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [];
    const tag = (reason.error as { readonly _tag?: unknown })._tag;
    return typeof tag === "string" ? [tag] : [];
  });
};

const fileSystemWithPairRemovalFailure = async (
  destination: string,
  armed: () => boolean,
  recursive: boolean,
): Promise<{ readonly fileSystem: FileSystem.FileSystem; readonly attempts: () => number }> => {
  const baseFileSystem = await Effect.runPromise(
    FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
  );
  let attempts = 0;
  const fileSystem: FileSystem.FileSystem = {
    ...baseFileSystem,
    remove: (target, options) => {
      if (
        armed()
        && target === destination
        && options?.force === true
        && (options?.recursive ?? false) === recursive
      ) {
        attempts += 1;
        return Effect.fail(PlatformError.systemError({
          _tag: "InvalidData",
          module: "test",
          method: "remove",
          description: "deliberate exact-pair rollback failure",
        }));
      }
      return baseFileSystem.remove(target, options);
    },
  };
  return { fileSystem, attempts: () => attempts };
};

describe("effect-build-apple hard cut", () => {
  it.each(nativeProbeCases)(
    "admits only the exact native %s probe status",
    async (name, args, exitCode) => {
      const root = makeRoot();
      const tool = executable(root, name);
      const probeStdout = `${name}-probe-stdout`;
      const probeStderr = `${name}-probe-stderr`;
      const [spawner, invocations] = makeSpawner(() => ({ exitCode, stdout: probeStdout, stderr: probeStderr }));
      const selected = await Effect.runPromise(
        selectAppleTool(name, { executable: tool, version: "18.0" }).pipe(
          Effect.provide(platform(spawner)),
        ),
      );
      expect(selected.observation.name).toBe(name);
      expect(selected.observation.capabilities).toContainEqual({
        _tag: "Present",
        id: `${name}-command`,
        evidence: `native probe ${JSON.stringify(args)} admitted exit code ${exitCode}`,
      });
      expect(JSON.stringify(selected.observation)).not.toContain(probeStdout);
      expect(JSON.stringify(selected.observation)).not.toContain(probeStderr);
      expect(invocations).toEqual([{ command: realpathSync(tool), args, cwd: undefined }]);
    },
  );

  it("rejects a non-allowed native probe status even when it is nonzero", async () => {
    const root = makeRoot();
    const codesign = executable(root, "codesign");
    const [spawner] = makeSpawner(() => ({ exitCode: 1, stderr: "unexpected usage status" }));
    const exit = await Effect.runPromiseExit(
      selectAppleTool("codesign", { executable: codesign, version: "18.0" }).pipe(
        Effect.provide(platform(spawner)),
      ),
    );
    expect(errorOf(exit)).toMatchObject({
      _tag: "AppleToolFailed",
      tool: "codesign",
      exitCode: 1,
      stderr: "unexpected usage status",
    });
  });

  it.each(nonzeroNativeProbeCases)(
    "rejects exit zero for native %s instead of widening its exact status",
    async (name) => {
      const root = makeRoot();
      const tool = executable(root, name);
      const [spawner] = makeSpawner(() => ({ exitCode: 0, stderr: "unexpected zero status" }));
      const exit = await Effect.runPromiseExit(
        selectAppleTool(name, { executable: tool, version: "18.0" }).pipe(
          Effect.provide(platform(spawner)),
        ),
      );
      expect(errorOf(exit)).toMatchObject({
        _tag: "AppleToolFailed",
        tool: name,
        exitCode: 0,
        stderr: "unexpected zero status",
      });
    },
  );

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
    expect(result.arm64._tag).toBe("HashedTree");
    expect(result.x64._tag).toBe("HashedTree");
    expect(result.arm64.architecture).toBe("arm64");
    expect(result.x64.architecture).toBe("x64");
    expect(result.arm64.provenance).toMatchObject({ name: "plutil", participants: [{ version: "18.0" }] });
    expect(readFileSync(join(root, "Fixture-arm64.app/Contents/MacOS/fixture"))).toEqual(readFileSync(armExecutable));
    expect(readFileSync(join(root, "Fixture-x64.app/Contents/MacOS/fixture"))).toEqual(readFileSync(x64Executable));
    expect(readFileSync(join(root, "Fixture-arm64.app/Contents/Resources/AppIcon.icns"), "utf8")).toBe("icon");
    const info = readFileSync(join(root, "Fixture-arm64.app/Contents/Info.plist"), "utf8");
    expect(info).toContain("dev.effect.build.fixture");
    expect(info).toContain("<string>13.0</string>");
    expect(invocations.map(({ args }) => args[0])).toEqual(["-help", "-lint", "-lint"]);
    for (const invocation of invocations.slice(1)) {
      expect(invocation.command).toBe(realpathSync(plutil));
      expect(invocation.args.slice(0, 2)).toEqual(["-lint", "--"]);
      expect(basename(invocation.args[2] ?? "")).toBe("Info.plist");
      expect(basename(dirname(invocation.args[2] ?? ""))).toBe("Contents");
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
    expect(errorOf(changed)).toMatchObject({ _tag: "FileVerificationFailed", path: realpathSync(armExecutable) });
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
    expect(errorOf(collision)).toMatchObject({
      _tag: "AppleOperationInvalid",
      reason: expect.stringContaining("collision"),
    });
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
    expect(errorOf(exit)).toMatchObject({ _tag: "AppleToolFailed", exitCode: 65 });
    expect(existsSync(armOut)).toBe(false);
    expect(existsSync(x64Out)).toBe(false);
  });

  it("surfaces app-pair rollback residue when destination removal fails", async () => {
    const root = makeRoot();
    const plutil = executable(root, "plutil");
    const armExecutable = join(root, "arm64-bin");
    const x64Executable = join(root, "x64-bin");
    thinMachO(armExecutable, "arm64");
    thinMachO(x64Executable, "x64");
    const armOut = join(root, "Rollback-failure-arm64.app");
    const x64Out = join(root, "Rollback-failure-x64.app");
    let secondRejected = false;
    let lintCount = 0;
    const [spawner] = makeSpawner(({ args }) => {
      if (args[0] === "-lint" && ++lintCount === 2) {
        secondRejected = true;
        return { exitCode: 65, stderr: "second architecture rejected" };
      }
      return {};
    });
    const injected = await fileSystemWithPairRemovalFailure(armOut, () => secondRejected, true);
    const provider = AppBundle.layer({ plutil: { executable: plutil, version: "18.0" } }).pipe(
      Layer.provide(Layer.merge(
        platform(spawner),
        Layer.succeed(FileSystem.FileSystem, injected.fileSystem),
      )),
    );
    const exit = await Effect.runPromiseExit(
      AppBundle.buildAppBundles({
        bundleIdentifier: "dev.effect.build.rollback-failure",
        bundleName: "Rollback Failure",
        displayName: "Rollback Failure",
        executableName: "rollback-failure",
        version: "1",
        shortVersion: "1.0.0",
        arm64: { executable: executableArtifact(armExecutable, "macos-aarch64"), outdir: armOut },
        x64: { executable: executableArtifact(x64Executable, "macos-x64"), outdir: x64Out },
      }).pipe(Effect.provide(provider)),
    );
    expect(errorTagsOf(exit)).toEqual(expect.arrayContaining(["AppleToolFailed", "TreeCommitFailed"]));
    expect(injected.attempts()).toBe(1);
    expect(existsSync(armOut)).toBe(true);
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
    const interrupted = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true);
    expect(Exit.isFailure(interrupted) && interrupted.cause.reasons.some(({ _tag }) => _tag === "Fail")).toBe(false);
    expect(existsSync(armOut)).toBe(false);
    expect(existsSync(x64Out)).toBe(false);
  });

  it.each(["arm64", "x64"] as const)(
    "atomically claims the %s publication boundary before observing interruption",
    async (boundary) => {
      const root = makeRoot();
      const armOut = join(root, "boundary-arm64");
      const x64Out = join(root, "boundary-x64-link");
      const missingTarget = join(root, "missing-target");
      const fileSystem = await Effect.runPromise(
        FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
      );
      let armCommitted = false;
      let x64Committed = false;
      let releaseBoundary!: () => void;
      let resolveBoundary!: () => void;
      const boundaryReached = new Promise<void>((resolve) => {
        resolveBoundary = resolve;
      });
      const publishedHook = Effect.callback<void>((resume) => {
        releaseBoundary = () => resume(Effect.void);
        resolveBoundary();
      });
      const source = Effect.gen(function*() {
        yield* claimApplePairMember(
          fileSystem.writeFileString(armOut, "owned arm64 publication"),
          () => {
            armCommitted = true;
          },
          boundary === "arm64" ? publishedHook : undefined,
        );
        yield* claimApplePairMember(
          fileSystem.symlink(missingTarget, x64Out),
          () => {
            x64Committed = true;
          },
          boundary === "x64" ? publishedHook : undefined,
        );
      });
      const program = withApplePairRollback(source, fileSystem, () => ({
        operation: "test exact pair ownership transfer",
        arm64Path: armOut,
        x64Path: x64Out,
        arm64Committed: armCommitted,
        x64Committed,
        recursive: false,
        failure: (reason) => new File.FileCommitFailed({ destination: armOut, reason }),
      }));
      const fiber = Effect.runFork(program);
      await boundaryReached;
      fiber.interruptUnsafe(999);
      releaseBoundary();
      const interrupted = await Effect.runPromise(Fiber.await(fiber));
      expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true);
      expect(armCommitted).toBe(true);
      expect(x64Committed).toBe(boundary === "x64");
      expect(() => lstatSync(armOut)).toThrow();
      expect(() => lstatSync(x64Out)).toThrow();
    },
  );

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
    expect(errorOf(exit)).toMatchObject({ _tag: "AppleToolFailed", exitCode: 64, stderr: "probe rejected" });
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
    expect(dmgs.arm64.provenance).toMatchObject({
      name: "hdiutil",
      participants: [
        { name: "hdiutil", version: "18.0" },
        { name: "codesign", version: "18.0" },
      ],
    });
    expect(dmgs.x64.provenance).toEqual(dmgs.arm64.provenance);
    expect(extractedToolNames("PROD-APPLE-005", "dmg", [dmgs.arm64.provenance])).toEqual([
      "codesign",
      "hdiutil",
    ]);
    expect(dmgs).not.toHaveProperty("operationTools");
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

    const corruptMountedProjection = async (kind: "app" | "layout") => {
      let sourceLayout = "";
      const mounted = join(root, `corrupt-mounted-${kind}`);
      const [spawner, invocations] = makeSpawner(({ args }) => {
        if (args[0] === "create") {
          sourceLayout = args[args.indexOf("-srcfolder") + 1]!;
          writeFileSync(args.at(-1)!, "UDZO");
        }
        if (args[0] === "attach") {
          cpSync(sourceLayout, mounted, { recursive: true, verbatimSymlinks: true });
          writeFileSync(
            kind === "app"
              ? join(mounted, "Fixture-arm64.app/Contents/Info.plist")
              : join(mounted, "Extras/layout.txt"),
            "corrupted after imaging",
          );
          return { stdout: `${mountedDevice}\tApple_HFS\t${mounted}\n` };
        }
        if (args[0] === "info") return { stdout: `dev-entry: ${mountedDevice}\n` };
        if (args[0] === "detach") rmSync(mounted, { recursive: true, force: true });
        return {};
      });
      const provider = DiskImage.layer({
        hdiutil: { executable: hdiutil, version: "18.0" },
        codesign: { executable: codesign, version: "18.0" },
      }).pipe(Layer.provide(platform(spawner)));
      const armOut = join(root, `corrupt-${kind}-arm64.dmg`);
      const x64Out = join(root, `corrupt-${kind}-x64.dmg`);
      const exit = await Effect.runPromiseExit(
        DiskImage.createDiskImages({
          arm64: {
            sourceApp: armBundle,
            outfile: armOut,
            volumeName: `Corrupt ${kind}`,
            ...(kind === "layout"
              ? { layout: [{ artifact: fileArtifact(layoutFile), destination: "Extras/layout.txt" }] }
              : {}),
          },
          x64: { sourceApp: x64Bundle, outfile: x64Out, volumeName: `Unused ${kind}` },
        }).pipe(Effect.provide(provider)),
      );
      expect(errorOf(exit)).toMatchObject({
        _tag: kind === "app" ? "TreeVerificationFailed" : "FileVerificationFailed",
        reason: expect.stringMatching(/(?:mismatch|does not match)/u),
      });
      expect(existsSync(armOut)).toBe(false);
      expect(existsSync(x64Out)).toBe(false);
      expect(invocations.some(({ args }) => args[0] === "detach")).toBe(true);
    };
    await corruptMountedProjection("app");
    await corruptMountedProjection("layout");

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
      _tag: "AppleOperationInvalid",
      reason: expect.stringContaining("colliding"),
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
    expect(errorOf(detachFailure)).toMatchObject({ _tag: "AppleToolFailed", tool: "hdiutil", exitCode: 73 });
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
    expect(errorOf(unverified)).toMatchObject({ _tag: "AppleToolFailed", tool: "codesign", exitCode: 42 });
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
    expect(packages.arm64.provenance).toMatchObject({ name: "productbuild" });
    expect((packages.arm64.provenance as Tool.Observation<"productbuild">).participants.map(({ name }) => name))
      .toEqual([
        "productbuild",
        "pkgbuild",
        "pkgutil",
        "codesign",
      ]);
    expect((packages.arm64.provenance as Tool.Observation<"productbuild">).participants.map(({ version }) => version))
      .toEqual(["18.0", "18.0", "15.0", "18.0"]);
    expect(packages.x64.provenance).toEqual(packages.arm64.provenance);
    expect(extractedToolNames("PROD-APPLE-006", "pkg", [packages.arm64.provenance])).toEqual([
      "codesign",
      "pkgbuild",
      "productbuild",
      "pkgutil",
    ]);
    expect(packages).not.toHaveProperty("operationTools");
    expect(packages.arm64.architecture).toBe("arm64");
    expect(packages.x64.architecture).toBe("x64");
    const build = pkgInvocations.find(({ command, args }) =>
      basename(command) === "pkgbuild" && args[0] === "--component"
    )!;
    const packagedApp = build.args[1]!;
    expect(packagedApp).not.toBe(armApp);
    expect(basename(packagedApp)).toBe("Fixture-arm64.app");
    expect(basename(dirname(packagedApp))).toMatch(/^\.effect-build-installer-/);
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

  it("surfaces disk-image-pair rollback residue when destination removal fails", async () => {
    const root = makeRoot();
    const hdiutil = executable(root, "hdiutil");
    const codesign = executable(root, "codesign");
    const armApp = join(root, "Rollback-arm64.app");
    const x64App = join(root, "Rollback-x64.app");
    mkdirSync(join(armApp, "Contents"), { recursive: true });
    mkdirSync(join(x64App, "Contents"), { recursive: true });
    writeFileSync(join(armApp, "Contents/Info.plist"), "arm");
    writeFileSync(join(x64App, "Contents/Info.plist"), "x64");
    const armOut = join(root, "rollback-failure-arm64.dmg");
    const x64Out = join(root, "rollback-failure-x64.dmg");
    let secondRejected = false;
    let createCount = 0;
    let layout = "";
    const mounted = join(root, "rollback-mounted");
    const device = "/dev/disk91";
    const [spawner] = makeSpawner(({ command, args }) => {
      if (basename(command) !== "hdiutil") return {};
      if (args[0] === "create") {
        createCount += 1;
        if (createCount === 2) {
          secondRejected = true;
          return { exitCode: 65, stderr: "second disk image rejected" };
        }
        layout = args[args.indexOf("-srcfolder") + 1]!;
        writeFileSync(args.at(-1)!, "UDZO");
      }
      if (args[0] === "attach") {
        cpSync(layout, mounted, { recursive: true, verbatimSymlinks: true });
        return { stdout: `${device}\tApple_HFS\t${mounted}\n` };
      }
      if (args[0] === "info") return { stdout: `dev-entry: ${device}\n` };
      if (args[0] === "detach") rmSync(mounted, { recursive: true, force: true });
      return {};
    });
    const injected = await fileSystemWithPairRemovalFailure(armOut, () => secondRejected, false);
    const provider = DiskImage.layer({
      hdiutil: { executable: hdiutil, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(spawner),
      Layer.succeed(FileSystem.FileSystem, injected.fileSystem),
    )));
    const exit = await Effect.runPromiseExit(
      DiskImage.createDiskImages({
        arm64: { sourceApp: developerIdBundle(armApp, "arm64"), outfile: armOut, volumeName: "Rollback arm64" },
        x64: { sourceApp: developerIdBundle(x64App, "x64"), outfile: x64Out, volumeName: "Rollback x64" },
      }).pipe(Effect.provide(provider)),
    );
    expect(errorTagsOf(exit)).toEqual(expect.arrayContaining(["AppleToolFailed", "FileCommitFailed"]));
    expect(injected.attempts()).toBe(1);
    expect(existsSync(armOut)).toBe(true);
    expect(existsSync(x64Out)).toBe(false);
  });

  it("surfaces installer-pair rollback residue when destination removal fails", async () => {
    const root = makeRoot();
    const pkgbuild = executable(root, "pkgbuild");
    const productbuild = executable(root, "productbuild");
    const pkgutil = executable(root, "pkgutil");
    const codesign = executable(root, "codesign");
    const armApp = join(root, "Rollback-arm64.app");
    const x64App = join(root, "Rollback-x64.app");
    mkdirSync(join(armApp, "Contents"), { recursive: true });
    mkdirSync(join(x64App, "Contents"), { recursive: true });
    writeFileSync(join(armApp, "Contents/Info.plist"), "arm");
    writeFileSync(join(x64App, "Contents/Info.plist"), "x64");
    const armOut = join(root, "rollback-failure-arm64.pkg");
    const x64Out = join(root, "rollback-failure-x64.pkg");
    let secondRejected = false;
    let productbuildCount = 0;
    const [spawner] = makeSpawner(({ command, args }) => {
      if (basename(command) === "pkgbuild" && args[0] !== "--version") {
        writeFileSync(args.at(-1)!, "component");
      }
      if (basename(command) === "productbuild" && args[0] !== "--version") {
        productbuildCount += 1;
        if (productbuildCount === 2) {
          secondRejected = true;
          return { exitCode: 65, stderr: "second installer rejected" };
        }
        writeFileSync(args.at(-1)!, "installer");
      }
      if (basename(command) === "pkgutil" && args[0] === "--payload-files") {
        return { stdout: `./${basename(armApp)}/Contents/Info.plist\n` };
      }
      return {};
    });
    const injected = await fileSystemWithPairRemovalFailure(armOut, () => secondRejected, false);
    const provider = InstallerPackage.layer({
      pkgbuild: { executable: pkgbuild, version: "18.0" },
      productbuild: { executable: productbuild, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(spawner),
      Layer.succeed(FileSystem.FileSystem, injected.fileSystem),
    )));
    const exit = await Effect.runPromiseExit(
      InstallerPackage.buildInstallerPackages({
        arm64: {
          sourceApp: developerIdBundle(armApp, "arm64"),
          outfile: armOut,
          identifier: "dev.effect.build.rollback.arm64",
          version: "1.0.0",
        },
        x64: {
          sourceApp: developerIdBundle(x64App, "x64"),
          outfile: x64Out,
          identifier: "dev.effect.build.rollback.x64",
          version: "1.0.0",
        },
      }).pipe(Effect.provide(provider)),
    );
    expect(errorTagsOf(exit)).toEqual(expect.arrayContaining(["AppleToolFailed", "FileCommitFailed"]));
    expect(injected.attempts()).toBe(1);
    expect(existsSync(armOut)).toBe(true);
    expect(existsSync(x64Out)).toBe(false);
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
            ...fileArtifact(unsignedDmg, "hdiutil"),
            architecture: "arm64",
          },
          outfile: join(root, "signed.dmg"),
        });
        return { signed, signedDmg };
      }).pipe(Effect.provide(appProvider)),
    );
    expect(signed.provenance).toMatchObject({ name: "codesign", participants: [{ version: "18.0" }] });
    expect(signed.architecture).toBe("arm64");
    expect(signed.entries).toContainEqual(expect.objectContaining({
      kind: "symbolic-link",
      relativePath: "Contents/Frameworks/Chained.framework/Chained",
      target: join("Versions", "Current", "Chained"),
    }));
    expect(readlinkSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/Current"))).toBe("A");
    expect(readlinkSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Resources"))).toBe(
      join("Versions", "Current", "Resources"),
    );
    expect(lstatSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/A/Resources")).mode & 0o777)
      .toBe(lstatSync(join(chainedFramework, "Versions/A/Resources")).mode & 0o777);
    expect(signed.signature).toMatchObject({
      _tag: "DeveloperIdApplicationSignature",
      certificateSha1: appIdentity,
      tool: { name: "codesign", participants: [{ version: "18.0" }] },
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
    const nestedFramework = appCommands[0]!.at(-1) ?? "";
    expect(basename(nestedFramework)).toBe("Nested.framework");
    expect(basename(dirname(nestedFramework))).toBe("Frameworks");
    expect(basename(dirname(dirname(nestedFramework)))).toBe("Contents");
    expect(appCommands[1]).toContain("--entitlements");
    expect(appCommands[2]!.slice(0, 4)).toEqual(["--verify", "--deep", "--strict", "--verbose=2"]);
    const stagedDmg = appCommands[3]!.at(-1) ?? "";
    expect(basename(stagedDmg)).toBe("signed.dmg");
    expect(basename(dirname(stagedDmg))).toMatch(/^\.effect-build-/);
    expect(appCommands[3]).toEqual([
      "--force",
      "--sign",
      appIdentity,
      "--timestamp",
      stagedDmg,
    ]);
    expect(appCommands[4]).toEqual(["--verify", "--strict", "--verbose=2", appCommands[3]!.at(-1)]);
    expect(readFileSync(signedDmg.path, "utf8")).toBe("unsigned-dmg:developer-id-signed");
    expect(signedDmg.digest.value).toBe(sha256(signedDmg.path));
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
            ...fileArtifact(unsignedPackage, "productbuild"),
            architecture: "arm64",
          },
          outfile: join(root, "signed.pkg"),
        },
      ).pipe(Effect.provide(pkgProvider)),
    );
    expect(signedPackage._tag).toBe("HashedFile");
    expect(signedPackage.architecture).toBe("arm64");
    expect((signedPackage.provenance as Tool.Observation<"productsign">).participants.map(({ name }) => name)).toEqual([
      "productsign",
      "pkgutil",
    ]);
    expect(Model.hasDeveloperIdInstallerSignature({
      ...signedPackage,
      provenance: toolObservation("productsign"),
    })).toBe(false);
    expect(signedPackage.signature).toMatchObject({
      _tag: "DeveloperIdInstallerSignature",
      certificateSha1: installerIdentity,
      signer: { name: "productsign", participants: [{ version: "18.0" }] },
      verifier: { name: "pkgutil", participants: [{ version: "15.0" }] },
    });
    const productCommand = pkgInvocations.find(({ command, args }) =>
      basename(command) === "productsign" && args[0] === "--sign"
    )!;
    expect(productCommand.args.slice(0, 3)).toEqual(["--sign", installerIdentity, "--timestamp"]);
    expect(productCommand.args[3]).not.toBe(unsignedPackage);
    expect(basename(productCommand.args[3] ?? "")).toMatch(/\.pkg$/);
    expect(basename(dirname(productCommand.args[3] ?? ""))).toMatch(/^\.effect-build-unsigned-installer-/);
    expect(basename(dirname(dirname(productCommand.args[3] ?? "")))).toMatch(/^\.effect-build-file-/);

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
    expect(failure._tag).toBe("AppleToolFailed");
    expect(failure.stderr).toContain("<redacted>");
    expect(JSON.stringify(failure)).not.toContain(appIdentity);
    expect(existsSync(join(root, "NeverPublished.app/Contents"))).toBe(false);
    chmodSync(join(chainedFramework, "Versions/A/Resources"), 0o755);
    chmodSync(join(root, "Signed.app/Contents/Frameworks/Chained.framework/Versions/A/Resources"), 0o755);
  });

  it("correlates submit/info/log across two runners without persisting credentials", async () => {
    const root = makeRoot();
    const notarytool = executable(root, "notarytool");
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
        digest: Artifact.sha256Digest(artifactSha256),
      },
    });
    let submittedSnapshot = "";
    const [runnerOne, runnerOneInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "submit") {
        submittedSnapshot = readFileSync(args[1]!, "utf8");
        return { stdout: JSON.stringify({ id: submissionId, message: `uploaded for ${profile}` }) };
      }
      return { stdout: "notarytool version 1.0.0\n" };
    });
    const runnerOneDeps = Layer.merge(
      platform(runnerOne),
      Notary.keychainProfileCredentialLayer({ profile }),
    );
    const runnerOneProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(runnerOneDeps));
    const submitted = await Effect.runPromise(
      Notary.submit(submitInput(artifactDigest)).pipe(Effect.provide(runnerOneProvider)),
    );
    expect(submitted.submissionId).toBe(submissionId);
    expect(submitted.status._tag).toBe("Pending");
    expect(submitted.submissionTool).toMatchObject({
      name: "notarytool",
      participants: [
        { name: "notarytool", version: "18.0" },
        { name: "pkgutil", version: "15.0" },
      ],
    });
    expect(submitted.tool).toMatchObject({ name: "notarytool", participants: [{ version: "18.0" }] });
    expect(extractedToolNames("PROD-APPLE-007", "pkg", [submitted.submissionTool])).toEqual([
      "pkgutil",
      "notarytool",
    ]);
    expect(submitted).not.toHaveProperty("structuralVerifier");
    expect(JSON.stringify(submitted)).not.toContain(profile);
    const stagedSubmission = runnerOneInvocations[5]!.args[1]!;
    expect(stagedSubmission).not.toBe(artifact);
    expect(basename(stagedSubmission)).toBe("signed.pkg");
    expect(basename(dirname(stagedSubmission))).toMatch(/^\.effect-build-notary-/);
    expect(submittedSnapshot).toBe("signed");
    expect(runnerOneInvocations[5]!.args).toEqual([
      "submit",
      stagedSubmission,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);

    const diskImagePath = join(root, "signed.dmg");
    writeFileSync(diskImagePath, "signed-dmg");
    const diskImageSubmission = await Effect.runPromise(
      Notary.submit({ kind: "dmg", artifact: developerIdDiskImage(diskImagePath) }).pipe(
        Effect.provide(runnerOneProvider),
      ),
    );
    expect(diskImageSubmission.submissionTool).toMatchObject({
      name: "notarytool",
      participants: [
        { name: "notarytool", version: "18.0" },
        { name: "codesign", version: "18.0" },
      ],
    });
    expect(extractedToolNames("PROD-APPLE-007", "dmg", [diskImageSubmission.submissionTool])).toEqual([
      "codesign",
      "notarytool",
    ]);

    const reference = new Notary.SubmissionReference({
      submissionId: submitted.submissionId,
      kind: submitted.kind,
      architecture: submitted.architecture,
      artifactBytes: submitted.artifactBytes,
      artifactDigest: submitted.artifactDigest,
      submissionTool: submitted.submissionTool,
      ...(submitted.stapleTarget === undefined ? {} : { stapleTarget: submitted.stapleTarget }),
      ...(submitted.transportTool === undefined ? {} : { transportTool: submitted.transportTool }),
    });
    const [runnerTwo, runnerTwoInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "info") {
        return {
          stdout: JSON.stringify({
            id: submissionId,
            status: "Accepted",
            name: `signed-${profile}.pkg`,
            createdDate: "2026-08-25T00:00:00Z",
          }),
        };
      }
      if (args[0] === "log") {
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
      notarytool: { executable: notarytool, version: "18.1" },
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
        artifactDigest: { value: artifactDigest },
      },
      submissionTool: {
        name: "notarytool",
        participants: [
          { name: "notarytool", version: "18.0" },
          { name: "pkgutil", version: "15.0" },
        ],
      },
      tool: { name: "notarytool", participants: [{ version: "18.1" }] },
    });
    const pendingReference = await Effect.runPromiseExit(Notary.acceptedReference(submitted));
    expect(errorOf(pendingReference)).toMatchObject({ _tag: "NotaryResultNotAccepted" });
    expect(log.submissionId).toBe(reference.submissionId);
    expect(log.artifactDigest.value).toBe(artifactDigest);
    expect(log.submissionTool).toBe(reference.submissionTool);
    expect(extractedToolNames("PROD-APPLE-009", "pkg", [observed.tool])).toEqual(["notarytool"]);
    expect(extractedToolNames("PROD-APPLE-010", "pkg", [log.tool])).toEqual(["notarytool"]);
    expect(log.issues[0]?.message).toHaveLength(1_100_000);
    expect(JSON.stringify({ observed, log })).not.toContain(profile);
    expect(runnerTwoInvocations[4]!.args).toEqual([
      "info",
      submissionId,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);
    expect(runnerTwoInvocations[5]!.args).toEqual([
      "log",
      submissionId,
      "--output-format",
      "json",
      "--keychain-profile",
      profile,
    ]);

    const differentId = "d53e8e0e-1ca7-4fc4-a587-17347c6023af";
    const [mismatchSpawner] = makeSpawner(({ args }) =>
      args[0] === "info"
        ? { stdout: JSON.stringify({ id: differentId, status: "Accepted" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const mismatchProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
      args[0] === "submit"
        ? { exitCode: 75, stderr: `transport lost for ${profile}` }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const unknownProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
      args[0] === "submit"
        ? { stdout: JSON.stringify({ message: "uploaded but response identity was lost" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const malformedProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
      artifactDigest: artifactDigest,
    });

    const [identitySpawner, identityInvocations] = makeSpawner(({ args }) =>
      args[0] === "submit"
        ? { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) }
        : { stdout: "notarytool version 1.0.0\n" }
    );
    const identityProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
      _tag: "FileVerificationFailed",
      reason: expect.stringContaining("digest mismatch"),
    });
    expect(identityInvocations.map(({ args }) => args)).toEqual([
      ["--version"],
      ["--help"],
      ["--version"],
      ["--help"],
    ]);

    let credentialAcquisitions = 0;
    const issuedCredentials: string[] = [];
    const rotatingCredential = Layer.succeed(Notary.Credential, {
      arguments: Effect.sync(() => {
        const token = `rotating-profile-${++credentialAcquisitions}`;
        issuedCredentials.push(token);
        return { args: ["--keychain-profile", token], sensitiveValues: [token] };
      }),
    });
    const [rotatingSpawner, rotatingInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "submit") return { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) };
      if (args[0] === "info") return { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) };
      if (args[0] === "log") return { stdout: JSON.stringify({ jobId: submissionId, status: "Accepted", issues: [] }) };
      return { stdout: "notarytool version 1.0.0\n" };
    });
    const rotatingProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(platform(rotatingSpawner), rotatingCredential)));
    await Effect.runPromise(
      Effect.gen(function*() {
        expect(credentialAcquisitions).toBe(0);
        const submission = yield* Notary.submit(submitInput(artifactDigest));
        expect(credentialAcquisitions).toBe(1);
        const dynamicReference = new Notary.SubmissionReference({
          submissionId: submission.submissionId,
          kind: submission.kind,
          architecture: submission.architecture,
          artifactBytes: submission.artifactBytes,
          artifactDigest: submission.artifactDigest,
          submissionTool: submission.submissionTool,
          ...(submission.stapleTarget === undefined ? {} : { stapleTarget: submission.stapleTarget }),
        });
        yield* Notary.info(dynamicReference);
        expect(credentialAcquisitions).toBe(2);
        yield* Notary.log(dynamicReference);
        expect(credentialAcquisitions).toBe(3);
      }).pipe(Effect.provide(rotatingProvider)),
    );
    const credentialLaunches = rotatingInvocations.filter(({ args }) =>
      args[0] === "submit" || args[0] === "info" || args[0] === "log"
    );
    expect(credentialLaunches).toHaveLength(3);
    for (const [index, invocation] of credentialLaunches.entries()) {
      expect(invocation.args).toContain(issuedCredentials[index]);
      expect(issuedCredentials.filter((token) => invocation.args.includes(token))).toEqual([issuedCredentials[index]]);
    }

    const mutableNotarytool = executable(root, "mutable-notarytool");
    let changedToolSubmits = 0;
    const [changedToolSpawner] = makeSpawner(({ args }) => {
      if (args[0] === "submit") changedToolSubmits++;
      return { stdout: "notarytool version 1.0.0\n" };
    });
    const changedToolProvider = Notary.layer({
      notarytool: { executable: mutableNotarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(changedToolSpawner),
      Notary.keychainProfileCredentialLayer({ profile }),
    )));
    const changedTool = await Effect.runPromiseExit(
      Effect.gen(function*() {
        yield* Effect.sync(() => writeFileSync(mutableNotarytool, "changed selected tool bytes\n"));
        return yield* Notary.submit(submitInput(artifactDigest));
      }).pipe(Effect.provide(changedToolProvider)),
    );
    expect(errorOf(changedTool)).toMatchObject({ _tag: "AppleToolChanged", tool: "notarytool" });
    expect(changedToolSubmits).toBe(0);
  });

  it("preserves a known native submission when staging cleanup fails after the provider response", async () => {
    const root = makeRoot();
    const notarytool = executable(root, "notarytool");
    const ditto = executable(root, "ditto");
    const codesign = executable(root, "codesign");
    const pkgutil = executable(root, "pkgutil");
    const artifact = join(root, "signed.pkg");
    writeFileSync(artifact, "signed");
    const submissionId = "e455e2bf-2207-47a7-a1a5-3aab2cd87f6e";
    let stagedDirectory = "";
    let providerResponses = 0;
    let cleanupFailures = 0;
    const [spawner] = makeSpawner(({ command, args }) => {
      if (basename(command) === "notarytool" && args[0] === "submit") {
        providerResponses++;
        stagedDirectory = dirname(args[1]!);
        return { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) };
      }
      return { stdout: "tool version 1\n" };
    });
    const baseFileSystem = await Effect.runPromise(
      FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)),
    );
    const cleanupFailingFileSystem: FileSystem.FileSystem = {
      ...baseFileSystem,
      remove: (target, options) => {
        if (providerResponses > 0 && target === stagedDirectory && options?.recursive === true) {
          cleanupFailures++;
          return Effect.fail(PlatformError.systemError({
            _tag: "InvalidData",
            module: "test",
            method: "remove",
            description: "deliberate post-response staging cleanup failure",
          }));
        }
        return baseFileSystem.remove(target, options);
      },
    };
    const injectedPlatform = Layer.merge(
      platform(spawner),
      Layer.succeed(FileSystem.FileSystem, cleanupFailingFileSystem),
    );
    const provider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(Layer.merge(
      injectedPlatform,
      Notary.keychainProfileCredentialLayer({ profile: "fixture-profile" }),
    )));
    const submission = await Effect.runPromise(
      Notary.submit({ kind: "pkg", artifact: developerIdInstallerPackage(artifact) }).pipe(
        Effect.provide(provider),
      ),
    );
    expect(submission).toBeInstanceOf(Notary.Submission);
    expect(submission).toMatchObject({ submissionId, status: { _tag: "Accepted" } });
    expect(providerResponses).toBe(1);
    expect(cleanupFailures).toBe(1);
    expect(existsSync(stagedDirectory)).toBe(true);
    rmSync(stagedDirectory, { recursive: true, force: true });
  });

  it("binds an app ZIP transport to an exact symlink-aware bundle before stapling", async () => {
    const root = makeRoot();
    const notarytool = executable(root, "notarytool");
    const stapler = executable(root, "stapler");
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
      if (basename(command) === "notarytool" && args[0] === "submit") {
        return { stdout: JSON.stringify({ id: submissionId, status: "Accepted" }) };
      }
      return { stdout: "tool version 1\n" };
    });
    const notaryProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
      stapleTarget: { kind: "app", identityKind: "tree-manifest", bundleName: "Signed.app" },
      submissionTool: {
        name: "notarytool",
        participants: [
          { name: "notarytool", version: "18.0" },
          { name: "codesign", version: "18.0" },
        ],
      },
      transportTool: { name: "ditto", participants: [{ version: "18.0" }] },
    });
    expect(
      extractedToolNames("PROD-APPLE-008", "app", [submission.submissionTool, submission.transportTool]),
    ).toEqual(["codesign", "ditto", "notarytool"]);
    expect(submission.artifactDigest.value).toHaveLength(64);
    expect(acceptance.stapleTarget.artifactDigest.value).not.toBe(submission.artifactDigest.value);
    expect(notaryInvocations.map(({ args }) => args[0])).toEqual([
      "--version",
      "--help",
      "--version",
      "--help",
      "--verify",
      "-c",
      "-x",
      "--verify",
      "submit",
    ]);

    const [stapleSpawner] = makeSpawner(({ args }) => {
      if (args[0] === "staple") {
        mkdirSync(join(args[1]!, "Contents/_CodeSignature"), { recursive: true });
        writeFileSync(join(args[1]!, "Contents/_CodeSignature/NotaryTicket"), "ticket");
      }
      return {};
    });
    const stapleProvider = Staple.layer({
      stapler: { executable: stapler, version: "18.0" },
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
      kind: "symbolic-link",
      relativePath: "Contents/Resources/current",
      target: "version-a",
    }));
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Versions/Current"))).toBe("A");
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Fixture"))).toBe(
      join("Versions", "Current", "Fixture"),
    );
    expect(readlinkSync(join(root, "Stapled.app/Contents/Frameworks/Fixture.framework/Resources"))).toBe(
      join("Versions", "Current", "Resources"),
    );
    expect(readFileSync(join(root, "Stapled.app/Contents/_CodeSignature/NotaryTicket"), "utf8")).toBe("ticket");
    expect(stapled.provenance).toMatchObject({
      name: "stapler",
      participants: [
        { name: "stapler", version: "18.0" },
        { name: "codesign", version: "18.0" },
      ],
    });
    expect(extractedToolNames("PROD-APPLE-011", "app", [stapled.provenance])).toEqual([
      "codesign",
      "stapler",
    ]);

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
      if (basename(command) === "notarytool" && args[0] === "submit") badTransportSubmitted = true;
      return { stdout: "tool version 1\n" };
    });
    const badTransportProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
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
    expect(errorOf(badTransport)).toMatchObject({ _tag: "SubmissionPreparationFailed" });
    expect(badTransportSubmitted).toBe(false);
  });

  it("keeps the ad-hoc rejection app private and submits its exact ZIP once", async () => {
    const root = makeRoot();
    const notarytool = executable(root, "notarytool");
    const ditto = executable(root, "ditto");
    const codesign = executable(root, "codesign");
    const pkgutil = executable(root, "pkgutil");
    const sourceApp = join(root, "Unsigned-arm64.app");
    mkdirSync(join(sourceApp, "Contents/MacOS"), { recursive: true });
    writeFileSync(join(sourceApp, "Contents/MacOS/effect-build"), "unsigned-arm64");
    chmodSync(join(sourceApp, "Contents/MacOS/effect-build"), 0o755);
    const bundle: Model.ApplicationBundle = {
      ...bundleArtifact(sourceApp, "plutil"),
      architecture: "arm64",
    };
    const submissionId = "b7888dce-7b63-4c30-ac8f-361e6a4e748b";
    let transportSource = "";
    const [spawner, invocations] = makeSpawner(({ command, args }) => {
      if (basename(command) === "codesign" && args[0] === "--force") {
        mkdirSync(join(args.at(-1)!, "Contents/_CodeSignature"), { recursive: true });
        writeFileSync(join(args.at(-1)!, "Contents/_CodeSignature/CodeResources"), "ad-hoc-no-timestamp");
      }
      if (basename(command) === "ditto" && args[0] === "-c") {
        transportSource = args.at(-2)!;
        writeFileSync(args.at(-1)!, `zip:${basename(transportSource)}`);
      }
      if (basename(command) === "ditto" && args[0] === "-x") {
        const extractedApp = join(args.at(-1)!, basename(transportSource));
        cpSync(transportSource, extractedApp, { recursive: true, verbatimSymlinks: true });
      }
      if (basename(command) === "notarytool" && args[0] === "submit") {
        return {
          stdout: JSON.stringify({
            id: submissionId,
            status: "Invalid",
            message: "bundle lacks a secure Developer ID timestamp",
          }),
        };
      }
      return { stdout: "tool version 1\n" };
    });
    const dependencies = Layer.merge(
      platform(spawner),
      Notary.keychainProfileCredentialLayer({ profile: "fixture-profile" }),
    );

    const publicProvider = Notary.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
      pkgutil: { executable: pkgutil, version: "15.0" },
    }).pipe(Layer.provide(dependencies));
    const publicCandidate = {
      ...bundle,
      signature: {
        _tag: "AdHocRejectionSignature",
        architecture: "arm64",
        identity: "-",
        tool: toolObservation("codesign"),
        hardenedRuntime: true,
        secureTimestamp: false,
      },
    } as unknown as Model.DeveloperIdApplicationBundle;
    const publicExit = await Effect.runPromiseExit(
      Notary.submitApp({ bundle: publicCandidate }).pipe(Effect.provide(publicProvider)),
    );
    expect(errorOf(publicExit)).toMatchObject({ _tag: "AppleProductStateInvalid" });
    expect(invocations.filter(({ args }) => args[0] === "submit")).toHaveLength(0);

    const fixtureStart = invocations.length;
    const fixtureProvider = NotaryRejectionFixture.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(dependencies));
    const submission = await Effect.runPromise(
      NotaryRejectionFixture.submitOnce({ bundle }).pipe(Effect.provide(fixtureProvider)),
    );
    const fixtureInvocations = invocations.slice(fixtureStart);
    expect(fixtureInvocations.map(({ args }) => args[0])).toEqual([
      "--version",
      "--help",
      "--version",
      "--force",
      "--verify",
      "--verify",
      "--verify",
      "-c",
      "-x",
      "--verify",
      "submit",
    ]);
    const sign = fixtureInvocations.find(({ args }) => args[0] === "--force")!;
    expect(sign.args).toEqual([
      "--force",
      "--deep",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--timestamp=none",
      sign.args.at(-1),
    ]);
    expect(fixtureInvocations.filter(({ args }) => args[0] === "submit")).toHaveLength(1);
    expect(submission).toBeInstanceOf(Notary.Submission);
    expect(submission).toMatchObject({
      kind: "zip",
      architecture: "arm64",
      status: { _tag: "Rejected", providerStatus: "Invalid" },
      stapleTarget: { kind: "app", identityKind: "tree-manifest", bundleName: "Unsigned-arm64.app" },
      submissionTool: { name: "notarytool", participants: [{ name: "notarytool" }, { name: "codesign" }] },
      transportTool: { name: "ditto" },
    });
    expect(submission.stapleTarget?.artifactDigest.value).not.toBe(bundle.manifestDigest.value);
    expect("root" in submission).toBe(false);
    expect("path" in submission).toBe(false);
    expect("signature" in submission).toBe(false);
    expect(JSON.stringify(submission)).not.toContain("AdHocRejectionSignature");
  });

  it("maps rejection-fixture response loss to one unknown outcome without retry", async () => {
    const root = makeRoot();
    const notarytool = executable(root, "notarytool");
    const ditto = executable(root, "ditto");
    const codesign = executable(root, "codesign");
    const sourceApp = join(root, "Unsigned-x64.app");
    mkdirSync(join(sourceApp, "Contents/MacOS"), { recursive: true });
    writeFileSync(join(sourceApp, "Contents/MacOS/effect-build"), "unsigned-x64");
    chmodSync(join(sourceApp, "Contents/MacOS/effect-build"), 0o755);
    const bundle: Model.ApplicationBundle = {
      ...bundleArtifact(sourceApp, "plutil"),
      architecture: "x64",
    };
    let transportSource = "";
    let submissions = 0;
    const [spawner] = makeSpawner(({ command, args }) => {
      if (basename(command) === "codesign" && args[0] === "--force") {
        mkdirSync(join(args.at(-1)!, "Contents/_CodeSignature"), { recursive: true });
        writeFileSync(join(args.at(-1)!, "Contents/_CodeSignature/CodeResources"), "ad-hoc-no-timestamp");
      }
      if (basename(command) === "ditto" && args[0] === "-c") {
        transportSource = args.at(-2)!;
        writeFileSync(args.at(-1)!, `zip:${basename(transportSource)}`);
      }
      if (basename(command) === "ditto" && args[0] === "-x") {
        cpSync(transportSource, join(args.at(-1)!, basename(transportSource)), {
          recursive: true,
          verbatimSymlinks: true,
        });
      }
      if (basename(command) === "notarytool" && args[0] === "submit") {
        submissions++;
        return { exitCode: 75, stderr: "provider response lost after upload" };
      }
      return { stdout: "tool version 1\n" };
    });
    const provider = NotaryRejectionFixture.layer({
      notarytool: { executable: notarytool, version: "18.0" },
      ditto: { executable: ditto, version: "18.0" },
      codesign: { executable: codesign, version: "18.0" },
    }).pipe(Layer.provide(Layer.merge(
      platform(spawner),
      Notary.keychainProfileCredentialLayer({ profile: "fixture-profile" }),
    )));
    const exit = await Effect.runPromiseExit(
      NotaryRejectionFixture.submitOnce({ bundle }).pipe(Effect.provide(provider)),
    );
    expect(errorOf(exit)).toMatchObject({
      _tag: "SubmissionOutcomeUnknown",
      reason: expect.stringContaining("provider response lost after upload"),
    });
    expect(submissions).toBe(1);
  });

  it("staples new bytes and performs product-specific Gatekeeper verification", async () => {
    const root = makeRoot();
    const stapler = executable(root, "stapler");
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
      artifactDigest: sourceDmgArtifact.digest,
      providerStatus: "Accepted",
      submissionTool: toolObservation("notarytool", "17.4"),
      tool: toolObservation("notarytool", "18.0"),
      stapleTarget: new Notary.StapleTarget({
        kind: "dmg",
        identityKind: "file-bytes",
        artifactBytes: sourceDmgArtifact.bytes,
        artifactDigest: sourceDmgArtifact.digest,
      }),
    });
    const [stapleSpawner, stapleInvocations] = makeSpawner(({ args }) => {
      if (args[0] === "staple") {
        writeFileSync(args[1]!, `${readFileSync(args[1]!, "utf8")}:stapled`);
      }
      return {};
    });
    const stapleProvider = Staple.layer({
      stapler: { executable: stapler, version: "18.0" },
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
    expect(stapled._tag).toBe("HashedFile");
    expect(stapled.provenance).toMatchObject({
      name: "stapler",
      participants: [
        { name: "stapler", version: "18.0" },
        { name: "codesign", version: "18.0" },
      ],
    });
    expect(extractedToolNames("PROD-APPLE-012", "dmg", [stapled.provenance])).toEqual([
      "codesign",
      "stapler",
    ]);
    expect(stapled.notarizationTicket).toMatchObject({
      submissionTool: { name: "notarytool", participants: [{ version: "17.4" }] },
      acceptanceTool: { name: "notarytool", participants: [{ version: "18.0" }] },
    });
    expect(stapled.notarizationTicket).not.toHaveProperty("structuralVerifier");
    expect(stapled.notarizationTicket).not.toHaveProperty("staplingTool");
    expect(readFileSync(stapled.path, "utf8")).toBe("accepted:stapled");
    expect(
      stapleInvocations.filter(({ command }) => basename(command) === "stapler").map(({ args }) => args.slice(0, 1)),
    ).toEqual([
      ["-h"],
      ["staple"],
      ["validate"],
    ]);

    const sourcePkg = join(root, "accepted.pkg");
    writeFileSync(sourcePkg, "accepted-pkg");
    const sourcePkgArtifact = developerIdInstallerPackage(sourcePkg);
    const packageAcceptance = new Notary.AcceptedReference({
      submissionId: "f17717f8-c582-4ef7-8a18-e8872eec79e0",
      kind: "pkg",
      architecture: "arm64",
      artifactBytes: sourcePkgArtifact.bytes,
      artifactDigest: sourcePkgArtifact.digest,
      providerStatus: "Accepted",
      submissionTool: toolObservation("notarytool", "17.4"),
      tool: toolObservation("notarytool", "18.0"),
      stapleTarget: new Notary.StapleTarget({
        kind: "pkg",
        identityKind: "file-bytes",
        artifactBytes: sourcePkgArtifact.bytes,
        artifactDigest: sourcePkgArtifact.digest,
      }),
    });
    const stapledPackage = await Effect.runPromise(
      Staple.stapleFile({
        kind: "pkg",
        source: sourcePkgArtifact,
        acceptance: packageAcceptance,
        outfile: join(root, "final.pkg"),
      }).pipe(Effect.provide(stapleProvider)),
    );
    expect(stapledPackage.provenance).toMatchObject({
      name: "stapler",
      participants: [
        { name: "stapler", version: "18.0" },
        { name: "pkgutil", version: "15.0" },
      ],
    });
    expect(extractedToolNames("PROD-APPLE-012", "pkg", [stapledPackage.provenance])).toEqual([
      "pkgutil",
      "stapler",
    ]);

    const mismatchedAcceptance = new Notary.AcceptedReference({
      ...acceptance,
      stapleTarget: new Notary.StapleTarget({
        kind: "dmg",
        identityKind: "file-bytes",
        artifactBytes: sourceDmgArtifact.bytes,
        artifactDigest: Artifact.sha256Digest(digest),
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
    // Keep this path distinct from the earlier `final.pkg`: the default macOS
    // filesystem is case-insensitive, so those names can resolve to one file.
    const finalPkg = join(root, "Assessed.pkg");
    mkdirSync(join(finalApp, "Contents/MacOS"), { recursive: true });
    writeFileSync(join(finalApp, "Contents/MacOS/app"), "signed-app");
    writeFileSync(finalPkg, "signed-pkg");
    const assessmentTicket = new Model.NotarizationTicket({
      submissionId: "f17717f8-c582-4ef7-8a18-e8872eec79e0",
      submittedKind: "zip",
      submittedBytes: Artifact.decimalBytes("1"),
      submittedDigest: Artifact.sha256Digest(digest),
      targetKind: "app",
      targetIdentityKind: "tree-manifest",
      targetBytes: Artifact.decimalBytes("1"),
      targetDigest: Artifact.sha256Digest(digest),
      targetArchitecture: "arm64",
      targetBundleName: "Final.app",
      submissionTool: toolObservation("notarytool", "18.0"),
      acceptanceTool: toolObservation("notarytool", "18.0"),
    });
    const finalAppArtifact: Model.StapledApplicationBundle = {
      ...developerIdBundle(finalApp),
      notarizationTicket: assessmentTicket,
    };
    const finalPkgArtifact: Model.StapledInstallerPackage = {
      ...developerIdInstallerPackage(finalPkg),
      notarizationTicket: new Model.NotarizationTicket({
        submissionId: assessmentTicket.submissionId,
        submittedKind: "pkg",
        submittedBytes: assessmentTicket.submittedBytes,
        submittedDigest: assessmentTicket.submittedDigest,
        targetKind: "pkg",
        targetIdentityKind: "file-bytes",
        targetBytes: assessmentTicket.targetBytes,
        targetDigest: assessmentTicket.targetDigest,
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
    expect(app.identityKind).toBe("tree-manifest");
    expect(app.artifactDigest.value).toHaveLength(64);
    expect(dmg.accepted).toBe(true);
    expect(dmg.identityKind).toBe("file-bytes");
    expect(dmg.artifactDigest.value).toBe(sha256(stapled.path));
    expect(pkg.structuralVerifier.name).toBe("pkgutil");
    expect(extractedToolNames("PROD-APPLE-013", "app", [app.gatekeeper, app.structuralVerifier])).toEqual([
      "spctl",
      "codesign",
    ]);
    expect(extractedToolNames("PROD-APPLE-013", "dmg", [dmg.gatekeeper, dmg.structuralVerifier])).toEqual([
      "spctl",
      "codesign",
    ]);
    expect(extractedToolNames("PROD-APPLE-013", "pkg", [pkg.gatekeeper, pkg.structuralVerifier])).toEqual([
      "spctl",
      "pkgutil",
    ]);
    const commands = assessInvocations.slice(3).map(({ command, args }) => [basename(command), ...args]);
    const assessedApp = commands[0]!.at(-1)!;
    const assessedDmg = commands[2]!.at(-1)!;
    const assessedPkg = commands[4]!.at(-1)!;
    expect(basename(assessedApp)).toBe("Final.app");
    expect(basename(assessedDmg)).toBe("final.dmg");
    expect(basename(assessedPkg)).toBe("Assessed.pkg");
    for (const assessed of [assessedApp, assessedDmg, assessedPkg]) {
      expect(basename(dirname(assessed))).toMatch(/^effect-build-assess-(?:app|file)-/);
    }
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
          notarizationTicket: new Model.NotarizationTicket({
            submissionId: assessmentTicket.submissionId,
            submittedKind: "pkg",
            submittedBytes: assessmentTicket.submittedBytes,
            submittedDigest: assessmentTicket.submittedDigest,
            targetKind: "pkg",
            targetIdentityKind: "file-bytes",
            targetBytes: assessmentTicket.targetBytes,
            targetDigest: assessmentTicket.targetDigest,
            targetArchitecture: "arm64",
            submissionTool: assessmentTicket.submissionTool,
            acceptanceTool: assessmentTicket.acceptanceTool,
          }),
        },
      }).pipe(Effect.provide(changingProvider)),
    );
    expect(errorOf(changed)).toMatchObject({ _tag: "BorrowedOutputChanged" });
  });
});
