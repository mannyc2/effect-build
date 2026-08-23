import { NodeFileSystem, NodePath, NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, FileSystem, Layer, Path, PlatformError, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as AppBundle from "../../packages/effect-build-apple/src/AppBundle.js";
import * as Artifact from "../../packages/effect-build-apple/src/Artifact.js";
import * as DiskImage from "../../packages/effect-build-apple/src/DiskImage.js";
import * as InstallerPackage from "../../packages/effect-build-apple/src/InstallerPackage.js";
import * as Zip from "../../packages/effect-build-apple/src/Zip.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "effect-build-apple-containers-")));
  roots.push(root);
  return root;
};

interface Invocation {
  readonly tool: ToolName;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

type ToolName = "ditto" | "plutil" | "hdiutil" | "security" | "pkgbuild" | "pkgutil";

interface FakeToolsOptions {
  readonly fail?: ToolName | "zip-extraction-mismatch";
  readonly identities?: string;
  readonly destinationRace?: {
    readonly kind: "file" | "tree";
    readonly path: string;
  };
}

interface FakeTools {
  readonly paths: Readonly<Record<ToolName, string>>;
  readonly invocations: readonly Invocation[];
  readonly platform: Layer.Layer<
    | FileSystem.FileSystem
    | Path.Path
    | ChildProcessSpawner.ChildProcessSpawner
  >;
}

const fileSystemLayer = (
  race: FakeToolsOptions["destinationRace"],
): Layer.Layer<FileSystem.FileSystem> => {
  if (race === undefined) return NodeFileSystem.layer;
  return Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      let destinationChecks = 0;
      let raced = false;
      const winRace = Effect.sync(() => {
        if (raced) return;
        raced = true;
        if (race.kind === "file") writeFileSync(race.path, "concurrent destination\n");
        else mkdirSync(race.path);
      });
      return {
        ...fileSystem,
        exists: (path) =>
          fileSystem.exists(path).pipe(
            Effect.flatMap((exists) => {
              if (path !== race.path) return Effect.succeed(exists);
              destinationChecks += 1;
              if (!exists && destinationChecks === 2) {
                return winRace.pipe(Effect.as(false));
              }
              return Effect.succeed(exists);
            }),
          ),
        link: (fromPath, toPath) =>
          toPath === race.path
            ? winRace.pipe(Effect.andThen(fileSystem.link(fromPath, toPath)))
            : fileSystem.link(fromPath, toPath),
        makeDirectory: (path, options) =>
          path === race.path
            ? winRace.pipe(Effect.andThen(fileSystem.makeDirectory(path, options)))
            : fileSystem.makeDirectory(path, options),
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer));
};

const makeTools = (root: string, options: FakeToolsOptions = {}): FakeTools => {
  const toolRoot = mkdtempSync(join(root, "tools-"));
  const paths = Object.fromEntries(
    (["ditto", "plutil", "hdiutil", "security", "pkgbuild", "pkgutil"] as const).map((name) => {
      const path = join(toolRoot, name);
      writeFileSync(path, `fake ${name}\n`);
      chmodSync(path, 0o755);
      return [name, path];
    }),
  ) as unknown as Readonly<Record<ToolName, string>>;
  const invocations: Invocation[] = [];
  const zipSources = new Map<string, string>();

  const handle = (stdout: string, stderr: string, exitCode: number) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(54001),
      stdin: Sink.drain,
      stdout: Stream.fromIterable([new TextEncoder().encode(stdout)]),
      stderr: Stream.fromIterable([new TextEncoder().encode(stderr)]),
      all: Stream.fromIterable([new TextEncoder().encode(`${stdout}${stderr}`)]),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });

  const spawner = ChildProcessSpawner.make((command) =>
    Effect.try({
      try: () => {
        if (!ChildProcess.isStandardCommand(command)) throw new Error("expected a standard command");
        const found = (Object.entries(paths) as Array<[ToolName, string]>).find(([, path]) => path === command.command);
        if (found === undefined) throw new Error(`unexpected executable ${command.command}`);
        const [tool] = found;
        invocations.push({ tool, args: command.args, cwd: command.options.cwd });
        if (options.fail === tool) return handle(`${tool} stdout`, `${tool} stderr`, 23);

        if (tool === "ditto") {
          if (command.args[0] === "--norsrc") {
            if (command.args.slice(0, 3).join(" ") !== "--norsrc --noextattr --noacl") {
              throw new Error(`unexpected private ditto policy ${command.args.slice(0, 3).join(" ")}`);
            }
            const source = command.args.at(-2)!;
            const destination = command.args.at(-1)!;
            cpSync(source, destination, { recursive: statSync(source).isDirectory(), preserveTimestamps: true });
          } else if (command.args[0] === "-c") {
            const source = command.args.at(-2)!;
            const destination = command.args.at(-1)!;
            zipSources.set(destination, source);
            writeFileSync(destination, `zip:${basename(source)}\n`);
          } else if (command.args[0] === "-x") {
            const archive = command.args.at(-2)!;
            const destination = command.args.at(-1)!;
            const source = zipSources.get(archive);
            if (source === undefined) throw new Error(`unknown fake archive ${archive}`);
            mkdirSync(destination, { recursive: true });
            cpSync(source, join(destination, basename(source)), { recursive: true, preserveTimestamps: true });
            if (options.fail === "zip-extraction-mismatch") {
              writeFileSync(join(destination, basename(source), "Contents", "Info.plist"), "tampered plist\n");
            }
          } else {
            throw new Error(`unexpected ditto argv ${command.args.join(" ")}`);
          }
        } else if (tool === "hdiutil" && command.args[0] === "create") {
          writeFileSync(command.args.at(-1)!, "fake UDZO image\n");
        } else if (tool === "security") {
          return handle(
            options.identities
              ?? '  1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Installer: Example Org (TEAMID1234)"\n     1 valid identities found\n',
            "",
            0,
          );
        } else if (tool === "pkgbuild") {
          writeFileSync(command.args.at(-1)!, "fake signed installer package\n");
        }
        return handle("", "", 0);
      },
      catch: (error) =>
        PlatformError.systemError({
          _tag: "Unknown",
          module: "apple-containers-test",
          method: "spawn",
          description: error instanceof Error ? error.message : String(error),
        }),
    })
  );

  return {
    paths,
    invocations,
    platform: Layer.mergeAll(
      fileSystemLayer(options.destinationRace),
      NodePath.layer,
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
    ),
  };
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected a typed failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected a typed failure in the Cause");
  return found.value;
};

const run = <A, E, R, R2>(effect: Effect.Effect<A, E, R>, provider: Layer.Layer<R, unknown, R2>, tools: FakeTools) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(provider.pipe(Layer.provide(tools.platform))),
    ) as Effect.Effect<A, E>,
  );

const observeFile = (kind: Artifact.FileArtifactKind, path: string) =>
  Effect.runPromise(Artifact.observeFile(kind, path).pipe(Effect.provide(NodeServices.layer)));

const makeInputs = async (root: string) => {
  const executablePath = join(root, "example-tool");
  const resourcePath = join(root, "read me.txt");
  writeFileSync(executablePath, new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 1, 2, 3, 4]));
  chmodSync(executablePath, 0o751);
  writeFileSync(resourcePath, "authenticated resource\n");
  return {
    executable: await observeFile("mach-o", executablePath),
    resource: await observeFile("resource", resourcePath),
    executablePath,
    resourcePath,
  };
};

const createApp = async (root: string, tools: FakeTools, name = "Example & Tool") => {
  const inputs = await makeInputs(root);
  const outfile = join(root, "Example.app");
  const exit = await run(
    AppBundle.create({
      executable: inputs.executable,
      resources: [{ artifact: inputs.resource, destination: "Documentation/read me.txt" }],
      outfile,
      bundleIdentifier: "com.example.tool",
      bundleName: name,
      executableName: "example-tool",
      version: "42",
      shortVersion: "1.2.3",
      minimumSystemVersion: "13.0",
    }),
    AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
    tools,
  );
  if (!Exit.isSuccess(exit)) throw new Error(`app construction failed: ${JSON.stringify(failure(exit))}`);
  return { ...inputs, outfile, result: exit.value };
};

const expectedPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Example &amp; Tool</string>
  <key>CFBundleExecutable</key>
  <string>example-tool</string>
  <key>CFBundleIdentifier</key>
  <string>com.example.tool</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Example &amp; Tool</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.2.3</string>
  <key>CFBundleVersion</key>
  <string>42</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
</dict>
</plist>
`;

const stagingEntries = (root: string): readonly string[] =>
  readdirSync(root).filter((entry) => entry.startsWith(".effect-build-"));

describe("Apple container construction", () => {
  it("creates a deterministic authenticated app bundle without mutating inputs", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const first = await createApp(root, tools);
    const executableCopy = join(first.outfile, "Contents", "MacOS", "example-tool");
    const plist = join(first.outfile, "Contents", "Info.plist");
    const resourceCopy = join(first.outfile, "Contents", "Resources", "Documentation", "read me.txt");

    expect(first.result.artifact).toMatchObject({ _tag: "TreeArtifact", kind: "app-bundle", path: first.outfile });
    expect(first.result.artifact.identity.digest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(first.result.provenance.operation).toBe("app-bundle.create");
    expect(first.result.provenance.inputs.map((input) => input.digest.value)).toEqual([
      first.executable.identity.digest.value,
      first.resource.identity.digest.value,
    ]);
    expect(first.result.provenance.output).toEqual(Artifact.reference(first.result.artifact));
    expect(first.result.provenance.tools.map(({ tool }) => tool.name)).toEqual([
      "ditto",
      "ditto",
      "ditto",
      "ditto",
      "plutil",
    ]);
    const privateCopies = tools.invocations.filter(({ tool, args }) => tool === "ditto" && args[0] === "--norsrc");
    expect(privateCopies.length).toBeGreaterThan(0);
    expect(privateCopies.map(({ args }) => args.slice(0, 3))).toEqual(
      privateCopies.map(() => ["--norsrc", "--noextattr", "--noacl"]),
    );
    expect(
      Exit.isSuccess(
        await Effect.runPromiseExit(
          Artifact.revalidate(first.result.artifact).pipe(Effect.provide(NodeServices.layer)),
        ),
      ),
    ).toBe(true);
    expect(readFileSync(plist, "utf8")).toBe(expectedPlist);
    expect(readFileSync(executableCopy)).toEqual(readFileSync(first.executablePath));
    expect(statSync(executableCopy).mode & 0o777).toBe(0o751);
    expect(readFileSync(resourceCopy, "utf8")).toBe("authenticated resource\n");
    expect([...readFileSync(first.executablePath)]).toEqual([0xcf, 0xfa, 0xed, 0xfe, 1, 2, 3, 4]);
    expect(readFileSync(first.resourcePath, "utf8")).toBe("authenticated resource\n");

    const lint = tools.invocations.find(({ tool }) => tool === "plutil");
    expect(lint?.args[0]).toBe("-lint");
    expect(lint?.args[1]).toMatch(/\/Contents\/Info\.plist$/);
    expect(lint?.args[1]).not.toBe(plist);
    expect(stagingEntries(root)).toEqual([]);

    const secondRoot = makeRoot();
    const secondTools = makeTools(secondRoot);
    const second = await createApp(secondRoot, secondTools);
    expect(second.result.artifact.identity.digest).toEqual(first.result.artifact.identity.digest);
    expect(readFileSync(join(second.outfile, "Contents", "Info.plist"), "utf8")).toBe(expectedPlist);
  });

  it("rejects wrong artifact kinds and unsafe resource destinations before spawning", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const inputs = await makeInputs(root);
    const base = {
      executable: inputs.resource as unknown as Artifact.FileArtifact<"mach-o">,
      outfile: join(root, "Wrong.app"),
      bundleIdentifier: "com.example.wrong",
      bundleName: "Wrong",
      executableName: "wrong",
      version: "1",
      shortVersion: "1.0.0",
      minimumSystemVersion: "13.0",
    };
    const wrongKind = await run(
      AppBundle.create(base),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(wrongKind)).toMatchObject({ _tag: "UnsupportedArtifactKind" });

    const traversal = await run(
      AppBundle.create({
        ...base,
        executable: inputs.executable,
        resources: [{ artifact: inputs.resource, destination: "../Info.plist" }],
      }),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(traversal)).toMatchObject({ _tag: "AppleInputInvalid" });

    const invalidMetadata = [
      {
        field: "bundleIdentifier",
        request: { ...base, executable: inputs.executable, bundleIdentifier: "not a bundle id" },
      },
      { field: "version", request: { ...base, executable: inputs.executable, version: "1.2.3.4" } },
      { field: "shortVersion", request: { ...base, executable: inputs.executable, shortVersion: "1.2" } },
      {
        field: "minimumSystemVersion",
        request: { ...base, executable: inputs.executable, minimumSystemVersion: "macOS 13" },
      },
    ] as const;
    for (const invalid of invalidMetadata) {
      const exit = await run(
        AppBundle.create(invalid.request),
        AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
        tools,
      );
      expect(failure(exit)).toMatchObject({ _tag: "AppleInputInvalid", field: invalid.field });
    }
    expect(tools.invocations).toEqual([]);
  });

  it("rejects a changed authenticated input before copying or publishing", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const inputs = await makeInputs(root);
    writeFileSync(inputs.executablePath, "changed after authentication\n");
    const outfile = join(root, "Changed.app");
    const exit = await run(
      AppBundle.create({
        executable: inputs.executable,
        resources: [{ artifact: inputs.resource, destination: "read me.txt" }],
        outfile,
        bundleIdentifier: "com.example.changed",
        bundleName: "Changed",
        executableName: "changed",
        version: "1",
        shortVersion: "1.0.0",
        minimumSystemVersion: "13.0",
      }),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(exit)).toMatchObject({ _tag: "ArtifactChanged", path: inputs.executablePath });
    expect(tools.invocations).toEqual([]);
    expect(existsSync(outfile)).toBe(false);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("removes staging on plist failure and refuses to clobber an existing app", async () => {
    const root = makeRoot();
    const tools = makeTools(root, { fail: "plutil" });
    const inputs = await makeInputs(root);
    const outfile = join(root, "Failed.app");
    const request = {
      executable: inputs.executable,
      outfile,
      bundleIdentifier: "com.example.preserved",
      bundleName: "Preserved",
      executableName: "preserved",
      version: "1",
      shortVersion: "1.0.0",
      minimumSystemVersion: "13.0",
    } satisfies AppBundle.CreateInput;
    const exit = await run(
      AppBundle.create(request),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(exit)).toMatchObject({ _tag: "AppleToolFailed", tool: "plutil", exitCode: 23 });
    expect(existsSync(outfile)).toBe(false);
    expect(stagingEntries(root)).toEqual([]);

    const preserved = join(root, "Preserved.app");
    mkdirSync(preserved);
    writeFileSync(join(preserved, "sentinel"), "old app\n");
    const noClobber = await run(
      AppBundle.create({ ...request, outfile: preserved }),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(noClobber)).toMatchObject({ _tag: "ArtifactPublishFailed" });
    expect(readFileSync(join(preserved, "sentinel"), "utf8")).toBe("old app\n");
    expect(readdirSync(preserved)).toEqual(["sentinel"]);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("refuses an existing app destination before running a construction tool", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const inputs = await makeInputs(root);
    const outfile = join(root, "Preserved.app");
    mkdirSync(outfile);
    writeFileSync(join(outfile, "sentinel"), "old app\n");
    const exit = await run(
      AppBundle.create({
        executable: inputs.executable,
        outfile,
        bundleIdentifier: "com.example.preserved",
        bundleName: "Preserved",
        executableName: "preserved",
        version: "1",
        shortVersion: "1.0.0",
        minimumSystemVersion: "13.0",
      }),
      AppBundle.layer({ dittoPath: tools.paths.ditto, plutilPath: tools.paths.plutil }),
      tools,
    );
    expect(failure(exit)).toMatchObject({ _tag: "ArtifactPublishFailed" });
    expect(readFileSync(join(outfile, "sentinel"), "utf8")).toBe("old app\n");
    expect(readdirSync(outfile)).toEqual(["sentinel"]);
    expect(tools.invocations).toEqual([]);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("atomically refuses file and tree destinations won by a concurrent publisher", async () => {
    const treeRoot = makeRoot();
    const treeDestination = join(treeRoot, "Raced.app");
    const treeTools = makeTools(treeRoot, {
      destinationRace: { kind: "tree", path: treeDestination },
    });
    const treeInputs = await makeInputs(treeRoot);
    const treeExit = await run(
      AppBundle.create({
        executable: treeInputs.executable,
        outfile: treeDestination,
        bundleIdentifier: "com.example.raced",
        bundleName: "Raced",
        executableName: "raced",
        version: "1",
        shortVersion: "1.0.0",
        minimumSystemVersion: "13.0",
      }),
      AppBundle.layer({ dittoPath: treeTools.paths.ditto, plutilPath: treeTools.paths.plutil }),
      treeTools,
    );
    expect(failure(treeExit)).toMatchObject({ _tag: "ArtifactPublishFailed" });
    expect(readdirSync(treeDestination)).toEqual([]);
    expect(treeTools.invocations.length).toBeGreaterThan(0);
    expect(stagingEntries(treeRoot)).toEqual([]);

    const fileRoot = makeRoot();
    const appTools = makeTools(fileRoot);
    const app = await createApp(fileRoot, appTools);
    const fileDestination = join(fileRoot, "Raced.zip");
    const fileTools = makeTools(fileRoot, {
      destinationRace: { kind: "file", path: fileDestination },
    });
    const fileExit = await run(
      Zip.create({ app: app.result.artifact, outfile: fileDestination }),
      Zip.layer({ dittoPath: fileTools.paths.ditto }),
      fileTools,
    );
    expect(failure(fileExit)).toMatchObject({ _tag: "ArtifactPublishFailed" });
    expect(readFileSync(fileDestination, "utf8")).toBe("concurrent destination\n");
    expect(fileTools.invocations.length).toBeGreaterThan(0);
    expect(stagingEntries(fileRoot)).toEqual([]);
  });

  it("creates a ZIP with ditto and proves its extracted app digest", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const app = await createApp(root, tools);
    const outfile = join(root, "Example.zip");
    const exit = await run(
      Zip.create({ app: app.result.artifact, outfile }),
      Zip.layer({ dittoPath: tools.paths.ditto }),
      tools,
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.artifact).toMatchObject({ _tag: "FileArtifact", kind: "zip", path: outfile });
    expect(exit.value.provenance.inputs).toEqual([Artifact.reference(app.result.artifact)]);
    expect(exit.value.provenance.output).toEqual(Artifact.reference(exit.value.artifact));
    expect(exit.value.provenance.tools.map(({ tool }) => tool.name)).toEqual(["ditto", "ditto", "ditto"]);
    const zipInvocations = tools.invocations.filter(({ tool, args }) => tool === "ditto" && args[0] !== "--norsrc");
    expect(zipInvocations).toHaveLength(2);
    expect(zipInvocations[0]?.args.slice(0, 3)).toEqual(["-c", "-k", "--keepParent"]);
    expect(zipInvocations[0]?.args.at(-2)).not.toBe(app.outfile);
    expect(zipInvocations[0]?.args.at(-1)).not.toBe(outfile);
    expect(zipInvocations[1]?.args.slice(0, 2)).toEqual(["-x", "-k"]);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("rejects ZIP extraction mismatches without publishing a destination", async () => {
    const root = makeRoot();
    const goodTools = makeTools(root);
    const app = await createApp(root, goodTools);
    const tools = makeTools(root, { fail: "zip-extraction-mismatch" });
    const outfile = join(root, "Rejected.zip");
    const exit = await run(
      Zip.create({ app: app.result.artifact, outfile }),
      Zip.layer({ dittoPath: tools.paths.ditto }),
      tools,
    );
    expect(failure(exit)).toMatchObject({ _tag: "ArtifactChanged" });
    expect(existsSync(outfile)).toBe(false);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("creates and verifies an explicit-volume UDZO disk image with exact argv", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const app = await createApp(root, tools);
    const outfile = join(root, "Example.dmg");
    const exit = await run(
      DiskImage.create({ app: app.result.artifact, outfile, volumeName: "Example Installer" }),
      DiskImage.layer({ dittoPath: tools.paths.ditto, hdiutilPath: tools.paths.hdiutil }),
      tools,
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.artifact).toMatchObject({ _tag: "FileArtifact", kind: "disk-image", path: outfile });
    expect(exit.value.provenance.inputs).toEqual([Artifact.reference(app.result.artifact)]);
    expect(exit.value.provenance.output).toEqual(Artifact.reference(exit.value.artifact));
    expect(exit.value.provenance.tools.map(({ tool }) => tool.name)).toEqual(["ditto", "hdiutil", "hdiutil"]);
    const hdiutil = tools.invocations.filter(({ tool }) => tool === "hdiutil");
    expect(hdiutil).toHaveLength(2);
    expect(hdiutil[0]?.args.slice(0, 2)).toEqual(["create", "-srcfolder"]);
    expect(hdiutil[0]?.args.slice(3, 7)).toEqual(["-volname", "Example Installer", "-format", "UDZO"]);
    expect(hdiutil[0]?.args.at(-1)).not.toBe(outfile);
    expect(hdiutil[1]?.args).toEqual(["verify", hdiutil[0]?.args.at(-1)]);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("builds a one-app package with an exact Developer ID Installer fingerprint", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const app = await createApp(root, tools);
    const outfile = join(root, "Example.pkg");
    const identity = InstallerPackage.developerIdInstaller({
      fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      teamId: "TEAMID1234",
    });
    const exit = await run(
      InstallerPackage.create({
        app: app.result.artifact,
        outfile,
        identity,
        packageIdentifier: "com.example.tool.pkg",
        version: "1.2.3",
        installLocation: "/Applications",
      }),
      InstallerPackage.layer({
        dittoPath: tools.paths.ditto,
        securityPath: tools.paths.security,
        pkgbuildPath: tools.paths.pkgbuild,
        pkgutilPath: tools.paths.pkgutil,
      }),
      tools,
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.artifact).toMatchObject({ _tag: "FileArtifact", kind: "installer-package", path: outfile });
    expect(exit.value.provenance.inputs).toEqual([Artifact.reference(app.result.artifact)]);
    expect(exit.value.provenance.output).toEqual(Artifact.reference(exit.value.artifact));
    expect(exit.value.provenance.tools.map(({ tool }) => tool.name)).toEqual([
      "ditto",
      "security",
      "pkgbuild",
      "pkgutil",
    ]);
    const security = tools.invocations.find(({ tool }) => tool === "security");
    expect(security?.args).toEqual(["find-identity", "-v", "-p", "basic"]);
    const pkgbuild = tools.invocations.find(({ tool }) => tool === "pkgbuild");
    expect(pkgbuild?.args).toEqual([
      "--component",
      expect.stringMatching(/\.app$/),
      "--install-location",
      "/Applications",
      "--identifier",
      "com.example.tool.pkg",
      "--version",
      "1.2.3",
      "--sign",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      expect.not.stringMatching(/^Example\.pkg$/),
    ]);
    expect(pkgbuild?.args[1]).not.toBe(app.outfile);
    const pkgutil = tools.invocations.find(({ tool }) => tool === "pkgutil");
    expect(pkgutil?.args).toEqual(["--check-signature", pkgbuild?.args.at(-1)]);
    expect(stagingEntries(root)).toEqual([]);
  });

  it("rejects malformed, missing, and Application identities before pkgbuild", async () => {
    const root = makeRoot();
    const setupTools = makeTools(root);
    const app = await createApp(root, setupTools);
    const runPackage = (tools: FakeTools, identity: InstallerPackage.DeveloperIdInstaller) =>
      run(
        InstallerPackage.create({
          app: app.result.artifact,
          outfile: join(root, `Rejected-${tools.invocations.length}.pkg`),
          identity,
          packageIdentifier: "com.example.rejected",
          version: "1",
          installLocation: "/Applications",
        }),
        InstallerPackage.layer({
          dittoPath: tools.paths.ditto,
          securityPath: tools.paths.security,
          pkgbuildPath: tools.paths.pkgbuild,
          pkgutilPath: tools.paths.pkgutil,
        }),
        tools,
      );

    const malformedTools = makeTools(root);
    expect(() => InstallerPackage.developerIdInstaller({ fingerprint: "not-a-fingerprint", teamId: "TEAMID1234" }))
      .toThrow(/fingerprint/u);
    const malformed = await runPackage(
      malformedTools,
      {
        _tag: "DeveloperIdInstaller",
        fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        teamId: "TEAMID1234",
      } as InstallerPackage.DeveloperIdInstaller,
    );
    expect(failure(malformed)).toMatchObject({ _tag: "AppleIdentityInvalid" });
    expect(malformedTools.invocations).toEqual([]);

    const missingTools = makeTools(root, { identities: "     0 valid identities found\n" });
    const identity = InstallerPackage.developerIdInstaller({
      fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      teamId: "TEAMID1234",
    });
    expect(failure(await runPackage(missingTools, identity))).toMatchObject({
      _tag: "AppleIdentityInvalid",
      identity: "DeveloperIdInstaller",
    });
    expect(missingTools.invocations.some(({ tool }) => tool === "pkgbuild")).toBe(false);

    const applicationTools = makeTools(root, {
      identities:
        '  1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Application: Example Org (TEAMID1234)"\n     1 valid identities found\n',
    });
    expect(failure(await runPackage(applicationTools, identity))).toMatchObject({
      _tag: "AppleIdentityInvalid",
      identity: "DeveloperIdInstaller",
    });
    expect(applicationTools.invocations.some(({ tool }) => tool === "pkgbuild")).toBe(false);

    const wrongTeamTools = makeTools(root, {
      identities:
        '  1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Installer: Example Org (TEAMID9999)"\n     1 valid identities found\n',
    });
    expect(failure(await runPackage(wrongTeamTools, identity))).toMatchObject({
      _tag: "AppleIdentityInvalid",
      reason: expect.stringContaining("Team ID"),
    });
    expect(wrongTeamTools.invocations.some(({ tool }) => tool === "pkgbuild")).toBe(false);
  });

  it("rejects non-app artifacts for ZIP, disk image, and installer package", async () => {
    const root = makeRoot();
    const tools = makeTools(root);
    const { executable } = await makeInputs(root);
    const wrongApp = executable as unknown as Artifact.TreeArtifact<"app-bundle">;
    const identity = InstallerPackage.developerIdInstaller({
      fingerprint: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      teamId: "TEAMID1234",
    });
    const zip = await run(
      Zip.create({ app: wrongApp, outfile: join(root, "wrong.zip") }),
      Zip.layer({ dittoPath: tools.paths.ditto }),
      tools,
    );
    const disk = await run(
      DiskImage.create({ app: wrongApp, outfile: join(root, "wrong.dmg"), volumeName: "Wrong" }),
      DiskImage.layer({ dittoPath: tools.paths.ditto, hdiutilPath: tools.paths.hdiutil }),
      tools,
    );
    const pkg = await run(
      InstallerPackage.create({
        app: wrongApp,
        outfile: join(root, "wrong.pkg"),
        identity,
        packageIdentifier: "com.example.wrong",
        version: "1",
        installLocation: "/Applications",
      }),
      InstallerPackage.layer({
        dittoPath: tools.paths.ditto,
        securityPath: tools.paths.security,
        pkgbuildPath: tools.paths.pkgbuild,
        pkgutilPath: tools.paths.pkgutil,
      }),
      tools,
    );
    expect(failure(zip)).toMatchObject({ _tag: "UnsupportedArtifactKind" });
    expect(failure(disk)).toMatchObject({ _tag: "UnsupportedArtifactKind" });
    expect(failure(pkg)).toMatchObject({ _tag: "UnsupportedArtifactKind" });
    expect(tools.invocations).toEqual([]);
    expect(existsSync(join(root, "wrong.zip"))).toBe(false);
    expect(existsSync(join(root, "wrong.dmg"))).toBe(false);
    expect(existsSync(join(root, "wrong.pkg"))).toBe(false);
  });
});
