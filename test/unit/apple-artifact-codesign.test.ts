import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build-apple/src/Artifact.js";
import * as CodeSign from "../../packages/effect-build-apple/src/CodeSign.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-apple-"));
  roots.push(root);
  return root;
};

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected typed error");
  return found.value;
};

const runArtifact = <A, E>(effect: Effect.Effect<A, E, Artifact.ArtifactServices>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(NodeServices.layer)));

interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
}

interface HarnessOptions {
  readonly codesignFailure?: boolean;
  readonly codesignNoMutation?: boolean;
  readonly delayCodesign?: boolean;
  readonly replaceCodesignAfterSecurity?: boolean;
}

const makeHarness = (options: HarnessOptions = {}) => {
  const root = realpathSync(makeRoot());
  const tools = {
    codesign: join(root, "codesign"),
    security: join(root, "security"),
    ditto: join(root, "ditto"),
  };
  for (const executable of Object.values(tools)) {
    writeFileSync(executable, `fake ${basename(executable)}\n`);
    chmodSync(executable, 0o755);
  }
  const invocations: Invocation[] = [];
  let interrupted = false;
  let startedResolve: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  let signature = 0;
  const handle = (stdout: string, stderr: string, exitCode: number, delayed = false) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(50505),
      stdin: Sink.drain,
      stdout: Stream.fromIterable([new TextEncoder().encode(stdout)]),
      stderr: Stream.fromIterable([new TextEncoder().encode(stderr)]),
      all: Stream.fromIterable([new TextEncoder().encode(`${stdout}${stderr}`)]),
      exitCode: delayed ? Effect.never : Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
      isRunning: Effect.succeed(delayed),
      kill: () =>
        Effect.sync(() => {
          interrupted = true;
        }),
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  const spawner = ChildProcessSpawner.make((command) => {
    let delayed = false;
    return Effect.sync(() => {
      if (!ChildProcess.isStandardCommand(command)) throw new Error("expected standard command");
      invocations.push({ command: command.command, args: command.args });
      if (command.command === tools.security) {
        if (options.replaceCodesignAfterSecurity === true) appendFileSync(tools.codesign, "replaced\n");
        return handle(
          '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Developer ID Application: Example (TEAMID1234)"\n'
            + "     1 valid identities found\n",
          "",
          0,
        );
      }
      if (command.command === tools.ditto) {
        if (command.args.slice(0, 3).join(" ") !== "--norsrc --noextattr --noacl") {
          throw new Error(`unexpected private ditto policy ${command.args.slice(0, 3).join(" ")}`);
        }
        const source = command.args.at(-2)!;
        const destination = command.args.at(-1)!;
        cpSync(source, destination, { recursive: true, dereference: false, preserveTimestamps: true });
        return handle("", "", 0);
      }
      if (command.command !== tools.codesign) throw new Error(`unexpected command ${command.command}`);
      if (command.args[0] === "--force") {
        if (options.codesignFailure === true) return handle("sign stdout", "sign stderr", 19);
        if (options.delayCodesign === true) {
          delayed = true;
          startedResolve();
          return handle("", "", 0, true);
        }
        if (options.codesignNoMutation !== true) {
          const target = command.args.at(-1)!;
          signature += 1;
          if (existsSync(target)) {
            if (statSync(target).isDirectory()) writeFileSync(join(target, `.signature-${signature}`), "signed\n");
            else appendFileSync(target, `signature-${signature}\n`);
          }
        }
      }
      return handle("", "", 0);
    }).pipe(
      Effect.flatMap((child) =>
        delayed
          ? Effect.acquireRelease(Effect.succeed(child), () => Effect.ignore(child.kill()))
          : Effect.succeed(child)
      ),
    );
  });
  const signer = CodeSign.layer({
    codesignPath: tools.codesign,
    securityPath: tools.security,
    dittoPath: tools.ditto,
  });
  const services = Layer.merge(
    NodeServices.layer,
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );
  const layer = Layer.provide(signer, services);
  const run = <A, E>(effect: Effect.Effect<A, E, CodeSign.Signer>) =>
    Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));
  return {
    root,
    tools,
    invocations,
    layer,
    run,
    started: () => started,
    interrupted: () => interrupted,
  };
};

const identity = () =>
  CodeSign.developerIdApplication({
    fingerprint: "0123456789abcdef0123456789abcdef01234567",
    teamId: "TEAMID1234",
  });

describe("Apple Artifact", () => {
  it("observes mandatory algorithm-qualified file identities and rejects mutation or forgery", async () => {
    const root = makeRoot();
    const file = join(root, "tool");
    writeFileSync(file, "before\n");
    chmodSync(file, 0o755);

    const observed = await runArtifact(Artifact.observeFile("mach-o", file));
    expect(Exit.isSuccess(observed)).toBe(true);
    if (!Exit.isSuccess(observed)) return;
    expect(observed.value.identity.digest).toMatchObject({ algorithm: "sha256" });
    expect(observed.value.identity.digest.value).toMatch(/^[0-9a-f]{64}$/);

    const forged = { ...observed.value } as Artifact.FileArtifact;
    expect(failure(await runArtifact(Artifact.revalidate(forged)))._tag).toBe("UnauthenticatedArtifact");

    writeFileSync(file, "after\n");
    expect(failure(await runArtifact(Artifact.revalidate(observed.value)))._tag).toBe("ArtifactChanged");
  });

  it("hashes deterministic tree manifests without traversing symlinks", async () => {
    const root = makeRoot();
    const app = join(root, "Example.app");
    const outside = join(root, "outside");
    mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(app, "Contents", "MacOS", "Example"), "binary\n");
    chmodSync(join(app, "Contents", "MacOS", "Example"), 0o755);
    writeFileSync(outside, "one\n");
    symlinkSync(outside, join(app, "Contents", "external"));

    const observed = await runArtifact(Artifact.observeTree("app-bundle", app));
    expect(Exit.isSuccess(observed)).toBe(true);
    if (!Exit.isSuccess(observed)) return;
    expect(observed.value.identity.entries).toContainEqual({
      _tag: "SymbolicLink",
      path: "Contents/external",
      target: outside,
    });

    writeFileSync(outside, "two\n");
    expect(Exit.isSuccess(await runArtifact(Artifact.revalidate(observed.value)))).toBe(true);

    unlinkSync(join(app, "Contents", "external"));
    symlinkSync("elsewhere", join(app, "Contents", "external"));
    expect(failure(await runArtifact(Artifact.revalidate(observed.value)))._tag).toBe("ArtifactChanged");
  });
});

describe("Apple CodeSign", () => {
  it("signs a copied Mach-O with exact fingerprint argv, snapshotted entitlements, and strict verification", async () => {
    const harness = makeHarness();
    const inputPath = join(harness.root, "input");
    const entitlementsPath = join(harness.root, "entitlements.plist");
    const destination = join(harness.root, "signed");
    writeFileSync(inputPath, "unsigned\n");
    chmodSync(inputPath, 0o755);
    writeFileSync(entitlementsPath, "<plist/>\n");
    const before = readFileSync(inputPath);
    const input = await Effect.runPromise(
      Artifact.observeFile("mach-o", inputPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const entitlements = await Effect.runPromise(
      Artifact.observeFile("entitlements", entitlementsPath).pipe(Effect.provide(NodeServices.layer)),
    );

    const exit = await harness.run(CodeSign.sign({
      input,
      destination,
      identity: identity(),
      plan: [{
        path: ".",
        identifier: "com.example.tool",
        hardenedRuntime: true,
        entitlements,
      }],
    }));
    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(readFileSync(inputPath)).toEqual(before);
    expect(readFileSync(destination)).not.toEqual(before);
    expect(exit.value.artifact.identity.digest.value).not.toBe(input.identity.digest.value);
    expect(exit.value.provenance.inputs).toHaveLength(2);
    expect(exit.value.provenance.output.digest).toEqual(exit.value.artifact.identity.digest);
    expect(Exit.isSuccess(await runArtifact(Artifact.revalidate(exit.value.artifact)))).toBe(true);

    const security = harness.invocations.find(({ command }) => command === harness.tools.security)!;
    expect(security.args).toEqual(["find-identity", "-v", "-p", "codesigning"]);
    const sign = harness.invocations.find(({ args }) => args[0] === "--force")!;
    expect(sign.args.slice(0, 8)).toEqual([
      "--force",
      "--sign",
      "0123456789ABCDEF0123456789ABCDEF01234567",
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      expect.not.stringMatching(entitlementsPath),
    ]);
    expect(sign.args.slice(8, 10)).toEqual(["--identifier", "com.example.tool"]);
    expect(sign.args).not.toContain("--deep");
    expect(sign.args.at(-1)).not.toBe(inputPath);
    const verify = harness.invocations.find(({ args }) => args[0] === "--verify")!;
    expect(verify.args.slice(0, 3)).toEqual(["--verify", "--strict", "--verbose=2"]);
    expect(verify.args).not.toContain("--deep");
    expect(
      harness.invocations
        .filter(({ command }) => command === harness.tools.ditto)
        .every(({ args }) => args.slice(0, 3).join(" ") === "--norsrc --noextattr --noacl"),
    ).toBe(true);
  });

  it("rejects a successful signing tool that leaves the authenticated identity unchanged", async () => {
    const harness = makeHarness({ codesignNoMutation: true });
    const inputPath = join(harness.root, "input");
    const destination = join(harness.root, "signed");
    writeFileSync(inputPath, "unsigned\n");
    chmodSync(inputPath, 0o755);
    const input = await Effect.runPromise(
      Artifact.observeFile("mach-o", inputPath).pipe(Effect.provide(NodeServices.layer)),
    );

    const exit = await harness.run(CodeSign.sign({
      input,
      destination,
      identity: identity(),
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));

    expect(failure(exit)).toMatchObject({
      _tag: "ArtifactPublishFailed",
      destination,
      reason: expect.stringContaining("unchanged authenticated output identity"),
    });
    expect(existsSync(destination)).toBe(false);
    expect(Exit.isSuccess(await runArtifact(Artifact.revalidate(input)))).toBe(true);
  });

  it("executes an app-bundle plan in exact inside-out order and verifies only after signing", async () => {
    const harness = makeHarness();
    const appPath = join(harness.root, "Input.app");
    const helper = join(appPath, "Contents", "Frameworks", "Helper");
    mkdirSync(join(appPath, "Contents", "MacOS"), { recursive: true });
    mkdirSync(join(appPath, "Contents", "Frameworks"), { recursive: true });
    writeFileSync(join(appPath, "Contents", "MacOS", "Main"), "main\n");
    writeFileSync(helper, "helper\n");
    chmodSync(join(appPath, "Contents", "MacOS", "Main"), 0o755);
    chmodSync(helper, 0o755);
    const input = await Effect.runPromise(
      Artifact.observeTree("app-bundle", appPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const exit = await harness.run(CodeSign.sign({
      input,
      destination: join(harness.root, "Signed.app"),
      identity: identity(),
      plan: [
        { path: "Contents/Frameworks/Helper", hardenedRuntime: false },
        { path: ".", hardenedRuntime: true },
      ],
    }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    const codesign = harness.invocations.filter(({ command }) => command === harness.tools.codesign);
    expect(codesign.map(({ args }) => args[0])).toEqual(["--force", "--force", "--verify", "--verify"]);
    expect(codesign[0]!.args.at(-1)).toMatch(/Signed\.app\/Contents\/Frameworks\/Helper$/);
    expect(codesign[1]!.args.at(-1)).toMatch(/Signed\.app$/);
    expect(codesign.every(({ args }) => !args.includes("--deep"))).toBe(true);
    expect(exit.value.signatures.map(({ path }) => path)).toEqual(["Contents/Frameworks/Helper", "."]);
    expect(Exit.isSuccess(await runArtifact(Artifact.revalidate(input)))).toBe(true);
  });

  it("rejects unsupported, changed, and forged inputs before process work", async () => {
    const harness = makeHarness();
    const path = join(harness.root, "archive.zip");
    writeFileSync(path, "zip\n");
    const zip = await Effect.runPromise(
      Artifact.observeFile("zip", path).pipe(Effect.provide(NodeServices.layer)),
    );
    const unsupported = await harness.run(CodeSign.sign({
      input: zip,
      destination: join(harness.root, "out.zip"),
      identity: identity(),
      plan: [{ path: ".", hardenedRuntime: false }],
    }));
    expect(failure(unsupported)._tag).toBe("UnsupportedArtifactKind");
    expect(harness.invocations).toEqual([]);

    const executablePath = join(harness.root, "tool");
    writeFileSync(executablePath, "before\n");
    chmodSync(executablePath, 0o755);
    const executable = await Effect.runPromise(
      Artifact.observeFile("mach-o", executablePath).pipe(Effect.provide(NodeServices.layer)),
    );
    writeFileSync(executablePath, "changed\n");
    const changed = await harness.run(CodeSign.sign({
      input: executable,
      destination: join(harness.root, "changed-out"),
      identity: identity(),
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));
    expect(failure(changed)._tag).toBe("ArtifactChanged");
    expect(harness.invocations).toEqual([]);
  });

  it("rejects parent-first plans, missing raw identifiers, and forged identities before process work", async () => {
    const harness = makeHarness();
    const executablePath = join(harness.root, "tool");
    writeFileSync(executablePath, "unsigned\n");
    chmodSync(executablePath, 0o755);
    const executable = await Effect.runPromise(
      Artifact.observeFile("mach-o", executablePath).pipe(Effect.provide(NodeServices.layer)),
    );
    const missingIdentifier = await harness.run(CodeSign.sign({
      input: executable,
      destination: join(harness.root, "missing-id"),
      identity: identity(),
      plan: [{ path: ".", hardenedRuntime: false }],
    }));
    expect(failure(missingIdentifier)._tag).toBe("AppleInputInvalid");

    const forged = {
      _tag: "DeveloperIdApplication",
      fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
      teamId: "TEAMID1234",
    } as CodeSign.DeveloperIdApplication;
    const forgedIdentity = await harness.run(CodeSign.sign({
      input: executable,
      destination: join(harness.root, "forged-id"),
      identity: forged,
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));
    expect(failure(forgedIdentity)._tag).toBe("AppleIdentityInvalid");
    expect(harness.invocations).toEqual([]);
  });

  it("rejects executable runtime policy and entitlements for disk images before process work", async () => {
    const harness = makeHarness();
    const diskImagePath = join(harness.root, "Input.dmg");
    const entitlementsPath = join(harness.root, "entitlements.plist");
    writeFileSync(diskImagePath, "disk image\n");
    writeFileSync(entitlementsPath, "<plist/>\n");
    const diskImage = await Effect.runPromise(
      Artifact.observeFile("disk-image", diskImagePath).pipe(Effect.provide(NodeServices.layer)),
    );
    const entitlements = await Effect.runPromise(
      Artifact.observeFile("entitlements", entitlementsPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const runtime = await harness.run(CodeSign.sign({
      input: diskImage,
      destination: join(harness.root, "runtime.dmg"),
      identity: identity(),
      plan: [{ path: ".", hardenedRuntime: true }],
    }));
    expect(failure(runtime)).toMatchObject({ _tag: "AppleInputInvalid", field: "plan[0].hardenedRuntime" });
    const policy = await harness.run(CodeSign.sign({
      input: diskImage,
      destination: join(harness.root, "entitlements.dmg"),
      identity: identity(),
      plan: [{ path: ".", hardenedRuntime: false, entitlements }],
    }));
    expect(failure(policy)).toMatchObject({ _tag: "AppleInputInvalid", field: "plan[0].entitlements" });
    expect(harness.invocations).toEqual([]);
  });

  it("keeps caller input and an existing destination unchanged on tool or destination failure", async () => {
    const harness = makeHarness({ codesignFailure: true });
    const inputPath = join(harness.root, "tool");
    const destination = join(harness.root, "signed");
    writeFileSync(inputPath, "unsigned\n");
    chmodSync(inputPath, 0o755);
    const input = await Effect.runPromise(
      Artifact.observeFile("mach-o", inputPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const before = readFileSync(inputPath);
    const failed = await harness.run(CodeSign.sign({
      input,
      destination,
      identity: identity(),
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));
    expect(failure(failed)._tag).toBe("AppleToolFailed");
    expect(readFileSync(inputPath)).toEqual(before);
    expect(existsSync(destination)).toBe(false);

    writeFileSync(destination, "keep\n");
    const existing = await harness.run(CodeSign.sign({
      input,
      destination,
      identity: identity(),
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));
    expect(failure(existing)._tag).toBe("ArtifactPublishFailed");
    expect(readFileSync(destination, "utf8")).toBe("keep\n");
  });

  it("detects selected-tool replacement and preserves interruption Cause", async () => {
    const changedToolHarness = makeHarness({ replaceCodesignAfterSecurity: true });
    const changedInputPath = join(changedToolHarness.root, "tool");
    writeFileSync(changedInputPath, "unsigned\n");
    chmodSync(changedInputPath, 0o755);
    const changedInput = await Effect.runPromise(
      Artifact.observeFile("mach-o", changedInputPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const changed = await changedToolHarness.run(CodeSign.sign({
      input: changedInput,
      destination: join(changedToolHarness.root, "out"),
      identity: identity(),
      plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
    }));
    expect(["AppleToolChanged", "AppleToolFailed"]).toContain(failure(changed)._tag);

    const interruptedHarness = makeHarness({ delayCodesign: true });
    const inputPath = join(interruptedHarness.root, "input");
    writeFileSync(inputPath, "unsigned\n");
    chmodSync(inputPath, 0o755);
    const input = await Effect.runPromise(
      Artifact.observeFile("mach-o", inputPath).pipe(Effect.provide(NodeServices.layer)),
    );
    const before = readFileSync(inputPath);
    const fiber = Effect.runFork(
      CodeSign.sign({
        input,
        destination: join(interruptedHarness.root, "signed"),
        identity: identity(),
        plan: [{ path: ".", identifier: "com.example.tool", hardenedRuntime: false }],
      }).pipe(Effect.provide(interruptedHarness.layer)),
    );
    await interruptedHarness.started();
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(interruptedHarness.interrupted()).toBe(true);
    expect(readFileSync(inputPath)).toEqual(before);
    expect(existsSync(join(interruptedHarness.root, "signed"))).toBe(false);
  });
});
