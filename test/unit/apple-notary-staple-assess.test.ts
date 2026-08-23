import { NodeCrypto, NodeFileSystem, NodePath, NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, FileSystem, Layer, PlatformError, Sink, Stream } from "effect";
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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build-apple/src/Artifact.js";
import * as Assess from "../../packages/effect-build-apple/src/Assess.js";
import * as Notary from "../../packages/effect-build-apple/src/Notary.js";
import * as Staple from "../../packages/effect-build-apple/src/Staple.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "effect-build-apple-trust-")));
  roots.push(root);
  return root;
};

interface SyncEvent {
  readonly path: string;
  readonly flag: FileSystem.OpenFlag | undefined;
}

const recordingFileSystemLayer = (syncs: SyncEvent[]): Layer.Layer<FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem;
      return {
        ...fileSystem,
        open: (path, options) =>
          fileSystem.open(path, options).pipe(
            Effect.map((file) => ({
              [FileSystem.FileTypeId]: FileSystem.FileTypeId,
              stat: file.stat,
              seek: file.seek.bind(file),
              sync: Effect.sync(() => {
                syncs.push({ path, flag: options?.flag });
              }).pipe(Effect.andThen(file.sync)),
              read: file.read.bind(file),
              readAlloc: file.readAlloc.bind(file),
              truncate: file.truncate.bind(file),
              write: file.write.bind(file),
              writeAll: file.writeAll.bind(file),
            } satisfies FileSystem.File)),
          ),
      } satisfies FileSystem.FileSystem;
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer));

const failure = <A, E>(exit: Exit.Exit<A, E>): E => {
  if (!Exit.isFailure(exit)) throw new Error("expected a typed failure");
  const found = Cause.findErrorOption(exit.cause);
  if (found._tag === "None") throw new Error("expected a typed failure in the Cause");
  return found.value;
};

type ToolName = "codesign" | "ditto" | "notarytool" | "pkgutil" | "spctl" | "stapler";

interface Invocation {
  readonly tool: ToolName;
  readonly args: readonly string[];
}

interface HarnessOptions {
  readonly submit?: "accepted" | "delay" | "malformed" | "nonzero";
  readonly assessment?: "accepted" | "denied" | "operational-failure";
  readonly mutateSubmittedTransport?: boolean;
  readonly mutateAssessmentSnapshot?: boolean;
  readonly onSubmit?: (transportPath: string) => void;
  readonly fileSystemLayer?: Layer.Layer<FileSystem.FileSystem>;
}

const makeHarness = (options: HarnessOptions = {}) => {
  const root = makeRoot();
  const toolRoot = join(root, "tools");
  mkdirSync(toolRoot);
  const paths = Object.fromEntries(
    (["codesign", "ditto", "notarytool", "pkgutil", "spctl", "stapler"] as const).map((name) => {
      const path = join(toolRoot, name);
      writeFileSync(path, `fake ${name}\n`);
      chmodSync(path, 0o755);
      return [name, path];
    }),
  ) as Readonly<Record<ToolName, string>>;
  const invocations: Invocation[] = [];
  const archives = new Map<string, string>();
  let interrupted = false;
  let startedResolve: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });

  const handle = (stdout: string, stderr: string, exitCode: number, delayed = false) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(59001),
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
    return Effect.try({
      try: () => {
        if (!ChildProcess.isStandardCommand(command)) throw new Error("expected a standard command");
        const found = (Object.entries(paths) as Array<[ToolName, string]>).find(([, path]) => path === command.command);
        if (found === undefined) throw new Error(`unexpected executable ${command.command}`);
        const [tool] = found;
        invocations.push({ tool, args: command.args });

        if (tool === "ditto") {
          const source = command.args.at(-2)!;
          const destination = command.args.at(-1)!;
          if (command.args.includes("-c")) {
            writeFileSync(destination, `zip transport:${basename(source)}\n`);
            archives.set(destination, source);
          } else if (command.args.includes("-x")) {
            const archived = archives.get(source);
            if (archived === undefined) throw new Error(`unknown fake archive ${source}`);
            cpSync(archived, join(destination, basename(archived)), {
              recursive: statSync(archived).isDirectory(),
              dereference: false,
              preserveTimestamps: true,
            });
          } else {
            cpSync(source, destination, {
              recursive: statSync(source).isDirectory(),
              dereference: false,
              preserveTimestamps: true,
            });
          }
          return handle("", "", 0);
        }

        if (tool === "notarytool") {
          const operation = command.args[0];
          if (operation === "submit") {
            options.onSubmit?.(command.args[1]!);
            if (options.mutateSubmittedTransport) appendFileSync(command.args[1]!, "tampered in flight\n");
            if (options.submit === "delay") {
              delayed = true;
              startedResolve();
              return handle("", "", 0, true);
            }
            if (options.submit === "nonzero") return handle("upload stdout", "network uncertainty", 69);
            if (options.submit === "malformed") return handle('{"message":"no id"}\n', "", 0);
            return handle(
              '{"id":"11111111-2222-3333-4444-555555555555","message":"Successfully uploaded file","status":"In Progress"}\n',
              "",
              0,
            );
          }
          if (operation === "info") {
            return handle(
              '{"id":"11111111-2222-3333-4444-555555555555","name":"Example.zip","status":"Accepted"}\n',
              "",
              0,
            );
          }
          if (operation === "wait") {
            return handle(
              '{"id":"11111111-2222-3333-4444-555555555555","name":"Example.zip","status":"Invalid"}\n',
              "",
              0,
            );
          }
          if (operation === "history") {
            return handle('{"history":[],"message":"Successfully received history"}\n', "", 0);
          }
          if (operation === "log") return handle('{"jobId":"11111111-2222-3333-4444-555555555555"}\n', "", 0);
          throw new Error(`unexpected notarytool operation ${operation}`);
        }

        if (tool === "stapler") {
          if (command.args[0] === "staple") appendFileSync(command.args[1]!, "stapled\n");
          return handle("", "", 0);
        }

        if (tool === "spctl") {
          if (options.mutateAssessmentSnapshot) appendFileSync(command.args.at(-1)!, "tampered observation\n");
          if (options.assessment === "operational-failure") return handle("", "spctl failed", 1);
          if (options.assessment === "denied") {
            return handle("<plist><dict><key>assessment:verdict</key><false/></dict></plist>\n", "", 3);
          }
          return handle("<plist><dict><key>assessment:verdict</key><true/></dict></plist>\n", "", 0);
        }

        return handle("", "", 0);
      },
      catch: (error) =>
        PlatformError.systemError({
          _tag: "Unknown",
          module: "apple-trust-test",
          method: "spawn",
          description: error instanceof Error ? error.message : String(error),
        }),
    }).pipe(
      Effect.flatMap((child) =>
        delayed
          ? Effect.acquireRelease(Effect.succeed(child), () => Effect.ignore(child.kill()))
          : Effect.succeed(child)
      ),
    );
  });

  const platform = Layer.mergeAll(
    options.fileSystemLayer ?? NodeFileSystem.layer,
    NodePath.layer,
    NodeCrypto.layer,
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );
  return { root, paths, invocations, interrupted: () => interrupted, started: () => started, platform };
};

const observeFile = (kind: Artifact.FileArtifactKind, path: string) =>
  Effect.runPromise(Artifact.observeFile(kind, path).pipe(Effect.provide(NodeServices.layer)));

const observeApp = async (root: string) => {
  const app = join(root, "Example.app");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), "<plist/>\n");
  writeFileSync(join(app, "Contents", "MacOS", "Example"), "signed executable\n");
  return Artifact.observeTree("app-bundle", app).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);
};

const notaryLayer = (harness: ReturnType<typeof makeHarness>) =>
  Notary.layer({
    notarytoolPath: harness.paths.notarytool,
    dittoPath: harness.paths.ditto,
    credentials: { _tag: "KeychainProfile", profile: "effect-build-ci" },
    s3Acceleration: "disabled",
  }).pipe(Layer.provide(harness.platform));

describe("Apple Notary", () => {
  it("submits an authenticated app through a private ZIP and persists its recoverable submission id", async () => {
    const harness = makeHarness();
    const app = await observeApp(harness.root);
    const receiptPath = join(harness.root, "notary-receipt.json");
    const before = readFileSync(join(app.path, "Contents", "Info.plist"));
    const exit = await Effect.runPromiseExit(
      Notary.submit({ artifact: app, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.submissionId).toBe("11111111-2222-3333-4444-555555555555");
    expect(exit.value.subject).toEqual(Artifact.reference(app));
    expect(exit.value.transport.kind).toBe("zip");
    expect(exit.value.transport.digest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(app.path, "Contents", "Info.plist"))).toEqual(before);
    const submit = harness.invocations.find(({ tool }) => tool === "notarytool")!;
    expect(submit.args).toEqual([
      "submit",
      expect.not.stringMatching(app.path),
      "--keychain-profile",
      "effect-build-ci",
      "--output-format",
      "json",
      "--no-progress",
      "--no-wait",
      "--no-s3-acceleration",
    ]);
    expect(submit.args).not.toContain("--force");
    const attempt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    expect(attempt).toMatchObject({
      schema: "effect-build-apple/notary-receipt@1",
      state: "SubmissionAttemptStarted",
      preparation: {
        operation: "notary.prepare-transport",
        inputs: [Artifact.reference(app)],
        output: { kind: "zip", digest: exit.value.transport.digest },
      },
    });
    const submittedPath = Notary.submittedReceiptPath(receiptPath, String(attempt.attemptId));
    expect(JSON.parse(readFileSync(submittedPath, "utf8"))).toMatchObject({
      schema: "effect-build-apple/notary-receipt@1",
      state: "Submitted",
      submissionId: exit.value.submissionId,
    });
    expect(harness.invocations.filter(({ tool, args }) => tool === "ditto" && args[0] === "-x")).toHaveLength(1);
  });

  it("fsyncs each complete immutable record and its parent directory", async () => {
    const syncs: SyncEvent[] = [];
    const harness = makeHarness({ fileSystemLayer: recordingFileSystemLayer(syncs) });
    const archivePath = join(harness.root, "Durable.zip");
    const receiptPath = join(harness.root, "durable.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const submission = await Effect.runPromise(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(existsSync(Notary.submittedReceiptPath(receiptPath, submission.attemptId))).toBe(true);
    expect(syncs).toHaveLength(4);
    expect(syncs.filter(({ flag }) => flag === "w")).toHaveLength(2);
    expect(syncs.filter(({ flag }) => flag === "r")).toHaveLength(2);
  });

  it("publishes the base attempt without clobber under concurrent submitters", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Concurrent.zip");
    const receiptPath = join(harness.root, "concurrent.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const exits = await Effect.runPromise(
      Effect.all([
        Effect.exit(Notary.submit({ artifact: archive, receiptPath })),
        Effect.exit(Notary.submit({ artifact: archive, receiptPath })),
      ], { concurrency: "unbounded" }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
    const failed = exits.find(Exit.isFailure);
    if (failed === undefined) throw new Error("expected one concurrent submit to fail");
    expect(failure(failed)).toMatchObject({ _tag: "NotaryReceiptExists", receiptPath });
    expect(harness.invocations.filter(({ tool, args }) => tool === "notarytool" && args[0] === "submit")).toHaveLength(
      1,
    );
    const attempt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    expect(attempt.state).toBe("SubmissionAttemptStarted");
    expect(existsSync(Notary.submittedReceiptPath(receiptPath, String(attempt.attemptId)))).toBe(true);
  });

  it("never overwrites a concurrently published submitted sidecar", async () => {
    let receiptPath = "";
    const forgedId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const harness = makeHarness({
      onSubmit: () => {
        const attempt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
        const sidecarPath = Notary.submittedReceiptPath(receiptPath, String(attempt.attemptId));
        writeFileSync(
          sidecarPath,
          `${
            JSON.stringify(
              {
                ...attempt,
                state: "Submitted",
                submissionId: forgedId,
                submittedStatus: "In Progress",
                source: "submit-response",
              },
              null,
              2,
            )
          }\n`,
        );
      },
    });
    const archivePath = join(harness.root, "Raced.zip");
    receiptPath = join(harness.root, "raced.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const exit = await Effect.runPromiseExit(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(exit)).toMatchObject({ _tag: "SubmissionReceiptCommitFailed" });
    const attempt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    expect(attempt.state).toBe("SubmissionAttemptStarted");
    expect(JSON.parse(readFileSync(
      Notary.submittedReceiptPath(receiptPath, String(attempt.attemptId)),
      "utf8",
    ))).toMatchObject({ submissionId: forgedId });
  });

  it("records unknown outcome before upload and never converts interruption into a typed failure", async () => {
    const harness = makeHarness({ submit: "delay" });
    const executablePath = join(harness.root, "tool");
    writeFileSync(executablePath, "signed executable\n");
    chmodSync(executablePath, 0o755);
    const executable = await observeFile("mach-o", executablePath);
    const receiptPath = join(harness.root, "unknown.json");
    const fiber = Effect.runFork(
      Notary.submit({ artifact: executable, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    await harness.started();
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(harness.interrupted()).toBe(true);
    expect(readFileSync(executablePath, "utf8")).toBe("signed executable\n");
    expect(JSON.parse(readFileSync(receiptPath, "utf8"))).toMatchObject({
      schema: "effect-build-apple/notary-receipt@1",
      state: "SubmissionAttemptStarted",
    });
  });

  it("classifies launched nonzero and malformed submit output as unknown outcomes without blind retry", async () => {
    for (const submit of ["nonzero", "malformed"] as const) {
      const harness = makeHarness({ submit });
      const archivePath = join(harness.root, "Example.zip");
      writeFileSync(archivePath, "signed app archive\n");
      const archive = await observeFile("zip", archivePath);
      const receiptPath = join(harness.root, `${submit}.json`);
      const first = await Effect.runPromiseExit(
        Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
      );
      expect(failure(first)).toMatchObject({ _tag: "UnknownSubmissionOutcome", receiptPath });
      expect(JSON.parse(readFileSync(receiptPath, "utf8"))).toMatchObject({ state: "SubmissionAttemptStarted" });
      const second = await Effect.runPromiseExit(
        Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
      );
      expect(failure(second)).toMatchObject({ _tag: "NotaryReceiptExists", receiptPath });
      expect(harness.invocations.filter(({ tool }) => tool === "notarytool")).toHaveLength(1);
    }
  });

  it("resumes info, wait, log, and history by durable id without treating rejection as execution failure", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Example.zip");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const submission = await Effect.runPromise(
      Notary.submit({ artifact: archive, receiptPath: join(harness.root, "receipt.json") }).pipe(
        Effect.provide(notaryLayer(harness)),
      ),
    );
    const [info, waited, log, history] = await Effect.runPromise(
      Effect.all([
        Notary.info(submission),
        Notary.wait(submission, { timeout: "5m" }),
        Notary.log(submission),
        Notary.history(),
      ], { concurrency: 1 }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(info.status).toBe("Accepted");
    expect(waited.status).toBe("Invalid");
    expect(waited.submissionId).toBe(submission.submissionId);
    expect(log.rawJson).toContain(submission.submissionId);
    expect(history.rawJson).toContain("history");
    expect(harness.invocations.find(({ args }) => args[0] === "wait")?.args).toContain("5m");
  });

  it("rejects non-integer wait durations before invoking Apple", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Example.zip");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const submission = await Effect.runPromise(
      Notary.submit({ artifact: archive, receiptPath: join(harness.root, "receipt.json") }).pipe(
        Effect.provide(notaryLayer(harness)),
      ),
    );
    const before = harness.invocations.length;
    const exit = await Effect.runPromiseExit(
      Notary.wait(submission, { timeout: "1.5m" }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(exit)).toMatchObject({ _tag: "NotaryConfigurationInvalid", field: "timeout" });
    expect(harness.invocations).toHaveLength(before);
  });

  it("treats a schema-valid disk receipt as data until explicit operator evidence authenticates it", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Restarted.zip");
    const receiptPath = join(harness.root, "restart.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    await Effect.runPromise(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    const stored = await Effect.runPromise(Notary.readReceipt(receiptPath).pipe(Effect.provide(NodeServices.layer)));
    if (stored.state !== "Submitted") throw new Error("expected submitted sidecar");
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.subject)).toBe(true);
    expect(Object.isFrozen(stored.subject.digest)).toBe(true);
    expect(Object.isFrozen(stored.preparation)).toBe(true);
    expect(Object.isFrozen(stored.preparation.tools)).toBe(true);
    expect(Object.isFrozen(stored.preparation.tools[0]?.args)).toBe(true);

    const before = harness.invocations.length;
    const unauthenticated = await Effect.runPromiseExit(
      Notary.info(stored).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(unauthenticated)).toMatchObject({ _tag: "NotaryBindingInvalid" });
    expect(harness.invocations).toHaveLength(before);

    const evidence = await Effect.runPromise(Notary.operatorReconciliationEvidence({
      receipt: stored,
      submissionId: stored.submissionId,
      authority: "retained notarytool history exported by the release operator",
    }));
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.receipt)).toBe(true);
    const reconciled = await Effect.runPromise(
      Notary.reconcile({ receipt: stored, evidence }).pipe(Effect.provide(NodeServices.layer)),
    );
    const observation = await Effect.runPromise(
      Notary.info(reconciled).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(observation.status).toBe("Accepted");
  });

  it("rereads the immutable submitted sidecar and rejects valid-looking tampering before Apple work", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Tamper.zip");
    const receiptPath = join(harness.root, "tamper.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const submission = await Effect.runPromise(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    const submittedPath = Notary.submittedReceiptPath(receiptPath, submission.attemptId);
    const stored = JSON.parse(readFileSync(submittedPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      submittedPath,
      `${
        JSON.stringify(
          {
            ...stored,
            submissionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          },
          null,
          2,
        )
      }\n`,
    );
    const before = harness.invocations.length;
    const exit = await Effect.runPromiseExit(
      Notary.info(submission).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(exit)).toMatchObject({ _tag: "NotaryBindingInvalid" });
    expect(harness.invocations).toHaveLength(before);
  });

  it("fails closed if the authenticated transport changes during submit and leaves only the base attempt", async () => {
    const harness = makeHarness({ mutateSubmittedTransport: true });
    const archivePath = join(harness.root, "Transport.zip");
    const receiptPath = join(harness.root, "transport.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const exit = await Effect.runPromiseExit(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(exit)).toMatchObject({ _tag: "ArtifactChanged" });
    const attempt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    expect(attempt.state).toBe("SubmissionAttemptStarted");
    expect(existsSync(Notary.submittedReceiptPath(receiptPath, String(attempt.attemptId)))).toBe(false);
  });

  it("reattaches an independently recovered id to the exact durable unknown-outcome receipt", async () => {
    const harness = makeHarness({ submit: "nonzero" });
    const archivePath = join(harness.root, "Recovered.zip");
    const receiptPath = join(harness.root, "recovered.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    const attempted = await Effect.runPromiseExit(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(failure(attempted)).toMatchObject({ _tag: "UnknownSubmissionOutcome" });
    const receipt = await Effect.runPromise(
      Notary.readReceipt(receiptPath).pipe(Effect.provide(NodeServices.layer)),
    );
    if (receipt.state !== "SubmissionAttemptStarted") throw new Error("expected unknown-outcome attempt receipt");
    const evidence = await Effect.runPromise(Notary.operatorReconciliationEvidence({
      receipt,
      submissionId: "11111111-2222-3333-4444-555555555555",
      authority: "retained notarytool history exported by the release operator",
    }));
    const submission = await Effect.runPromise(
      Notary.reconcile({ receipt, evidence }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(submission.source).toBe("operator-reconciliation");
    expect(submission.reconciliation).toMatchObject({ authority: evidence.authority });
    expect(submission.subject).toEqual(Artifact.reference(archive));
    const observation = await Effect.runPromise(
      Notary.info(submission).pipe(Effect.provide(notaryLayer(harness))),
    );
    expect(observation).toMatchObject({ status: "Accepted", subject: Artifact.reference(archive) });
  });

  it("rejects structural operator evidence and leaves the unknown-outcome attempt unresolved", async () => {
    const harness = makeHarness({ submit: "nonzero" });
    const archivePath = join(harness.root, "ForgedEvidence.zip");
    const receiptPath = join(harness.root, "forged-evidence.json");
    writeFileSync(archivePath, "signed app archive\n");
    const archive = await observeFile("zip", archivePath);
    await Effect.runPromiseExit(
      Notary.submit({ artifact: archive, receiptPath }).pipe(Effect.provide(notaryLayer(harness))),
    );
    const receipt = await Effect.runPromise(Notary.readReceipt(receiptPath).pipe(Effect.provide(NodeServices.layer)));
    if (receipt.state !== "SubmissionAttemptStarted") throw new Error("expected unresolved attempt");
    const exit = await Effect.runPromiseExit(
      Notary.reconcile({
        receipt,
        evidence: {
          _tag: "OperatorReconciliationEvidence",
          receipt,
          submissionId: "11111111-2222-3333-4444-555555555555",
          authority: "forged structural value",
          observedAtEpochMillis: 0,
        } as never,
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(failure(exit)).toMatchObject({ _tag: "NotaryBindingInvalid" });
    expect(existsSync(Notary.submittedReceiptPath(receiptPath, receipt.attemptId))).toBe(false);
  });
});

describe("Apple Staple", () => {
  it("staples and validates a private copy before publishing a new authenticated artifact", async () => {
    const harness = makeHarness();
    const imagePath = join(harness.root, "Example.dmg");
    const destination = join(harness.root, "Example-stapled.dmg");
    writeFileSync(imagePath, "signed disk image\n");
    const image = await observeFile("disk-image", imagePath);
    const before = readFileSync(imagePath);
    const submission = await Effect.runPromise(
      Notary.submit({ artifact: image, receiptPath: join(harness.root, "image-notary.json") }).pipe(
        Effect.provide(notaryLayer(harness)),
      ),
    );
    const notarization = await Effect.runPromise(
      Notary.info(submission).pipe(Effect.provide(notaryLayer(harness))),
    );
    if (notarization.status !== "Accepted") throw new Error("fake Notary did not accept the disk image");
    const layer = Staple.layer({ staplerPath: harness.paths.stapler, dittoPath: harness.paths.ditto }).pipe(
      Layer.provide(harness.platform),
    );
    const exit = await Effect.runPromiseExit(
      Staple.staple({ input: image, destination, notarization }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(readFileSync(imagePath)).toEqual(before);
    expect(readFileSync(destination, "utf8")).toContain("stapled");
    expect(exit.value.artifact.identity.digest.value).not.toBe(image.identity.digest.value);
    expect(exit.value.notarization).toBe(notarization);
    const stapler = harness.invocations.filter(({ tool }) => tool === "stapler");
    expect(stapler.map(({ args }) => args[0])).toEqual(["staple", "validate"]);
    expect(stapler.every(({ args }) => args.length === 2)).toBe(true);
    expect(stapler[0]?.args[1]).not.toBe(imagePath);
  });

  it("rejects ZIP and raw executable inputs before running a tool", async () => {
    for (const kind of ["zip", "mach-o"] as const) {
      const harness = makeHarness();
      const path = join(harness.root, kind === "zip" ? "Example.zip" : "tool");
      writeFileSync(path, "artifact\n");
      const artifact = await observeFile(kind, path);
      const layer = Staple.layer({ staplerPath: harness.paths.stapler, dittoPath: harness.paths.ditto }).pipe(
        Layer.provide(harness.platform),
      );
      const exit = await Effect.runPromiseExit(
        Staple.staple({ input: artifact, destination: join(harness.root, "out") } as never).pipe(
          Effect.provide(layer),
        ),
      );
      expect(failure(exit)).toMatchObject({ _tag: "UnsupportedArtifactKind" });
      expect(harness.invocations).toEqual([]);
    }
  });

  it("rejects forged Accepted observations before stapler work", async () => {
    const harness = makeHarness();
    const imagePath = join(harness.root, "Example.dmg");
    writeFileSync(imagePath, "signed disk image\n");
    const image = await observeFile("disk-image", imagePath);
    const layer = Staple.layer({ staplerPath: harness.paths.stapler, dittoPath: harness.paths.ditto }).pipe(
      Layer.provide(harness.platform),
    );
    const exit = await Effect.runPromiseExit(
      Staple.staple({
        input: image,
        destination: join(harness.root, "forged.dmg"),
        notarization: { status: "Accepted" } as never,
      }).pipe(Effect.provide(layer)),
    );
    expect(failure(exit)).toMatchObject({ _tag: "NotaryBindingInvalid" });
    expect(harness.invocations).toEqual([]);
  });
});

describe("Apple Assess", () => {
  it("returns Gatekeeper denial as a digest-bound observation and leaves the caller input unchanged", async () => {
    const harness = makeHarness({ assessment: "denied" });
    const executablePath = join(harness.root, "tool");
    writeFileSync(executablePath, "signed executable\n");
    chmodSync(executablePath, 0o755);
    const executable = await observeFile("mach-o", executablePath);
    const before = readFileSync(executablePath);
    const layer = Assess.layer({
      codesignPath: harness.paths.codesign,
      dittoPath: harness.paths.ditto,
      pkgutilPath: harness.paths.pkgutil,
      spctlPath: harness.paths.spctl,
    }).pipe(Layer.provide(harness.platform));
    const exit = await Effect.runPromiseExit(Assess.assess(executable).pipe(Effect.provide(layer)));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.subject).toEqual(Artifact.reference(executable));
    expect(exit.value.signature.valid).toBe(true);
    expect(exit.value.gatekeeper).toMatchObject({ accepted: false, exitCode: 3, type: "execute" });
    expect(exit.value.gatekeeper.rawPlist).toContain("assessment:verdict");
    expect(readFileSync(executablePath)).toEqual(before);
    const spctl = harness.invocations.find(({ tool }) => tool === "spctl")!;
    expect(spctl.args.slice(0, 8)).toEqual([
      "--assess",
      "--type",
      "execute",
      "--ignore-cache",
      "--no-cache",
      "--raw",
      expect.not.stringMatching(executablePath),
    ]);
  });

  it("rejects a private assessment snapshot changed by an observer while preserving caller bytes", async () => {
    const harness = makeHarness({ mutateAssessmentSnapshot: true });
    const executablePath = join(harness.root, "changed-observation-tool");
    writeFileSync(executablePath, "signed executable\n");
    chmodSync(executablePath, 0o755);
    const executable = await observeFile("mach-o", executablePath);
    const before = readFileSync(executablePath);
    const layer = Assess.layer({
      codesignPath: harness.paths.codesign,
      dittoPath: harness.paths.ditto,
      pkgutilPath: harness.paths.pkgutil,
      spctlPath: harness.paths.spctl,
    }).pipe(Layer.provide(harness.platform));
    const exit = await Effect.runPromiseExit(Assess.assess(executable).pipe(Effect.provide(layer)));
    expect(failure(exit)).toMatchObject({ _tag: "ArtifactChanged" });
    expect(readFileSync(executablePath)).toEqual(before);
  });

  it("maps package assessment to install and distinguishes operational spctl failure", async () => {
    const harness = makeHarness({ assessment: "operational-failure" });
    const packagePath = join(harness.root, "Example.pkg");
    writeFileSync(packagePath, "signed package\n");
    const pkg = await observeFile("installer-package", packagePath);
    const layer = Assess.layer({
      codesignPath: harness.paths.codesign,
      dittoPath: harness.paths.ditto,
      pkgutilPath: harness.paths.pkgutil,
      spctlPath: harness.paths.spctl,
    }).pipe(Layer.provide(harness.platform));
    const exit = await Effect.runPromiseExit(Assess.assess(pkg).pipe(Effect.provide(layer)));
    expect(failure(exit)).toMatchObject({ _tag: "AssessmentToolFailed", tool: "spctl", exitCode: 1 });
    expect(harness.invocations.find(({ tool }) => tool === "pkgutil")?.args[0]).toBe("--check-signature");
    expect(harness.invocations.find(({ tool }) => tool === "spctl")?.args.slice(0, 3)).toEqual([
      "--assess",
      "--type",
      "install",
    ]);
  });

  it("rejects ZIP assessment before spawning", async () => {
    const harness = makeHarness();
    const archivePath = join(harness.root, "Example.zip");
    writeFileSync(archivePath, "archive\n");
    const archive = await observeFile("zip", archivePath);
    const layer = Assess.layer({
      codesignPath: harness.paths.codesign,
      dittoPath: harness.paths.ditto,
      pkgutilPath: harness.paths.pkgutil,
      spctlPath: harness.paths.spctl,
    }).pipe(Layer.provide(harness.platform));
    const exit = await Effect.runPromiseExit(Assess.assess(archive as never).pipe(Effect.provide(layer)));
    expect(failure(exit)).toMatchObject({ _tag: "UnsupportedArtifactKind" });
    expect(harness.invocations).toEqual([]);
  });
});
