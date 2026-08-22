import { NodeServices } from "@effect/platform-node";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { Effect, Exit, Fiber, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { conclusion, infrastructure } from "./receipt.mjs";
import { requiredPath } from "./probe-runtime.mjs";

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const waitFor = async (predicate, label, timeout = 45_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await predicate();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const firstOutput = async (outdir, source) => {
  const stem = basename(source, extname(source));
  for (const name of [`${stem}.js`, `${stem}.mjs`, `${stem}.cjs`]) {
    const path = join(outdir, name);
    try {
      await access(path);
      return path;
    } catch {
      // Continue through provider output names.
    }
  }
  return undefined;
};

const collectText = (stream) =>
  Stream.runFold(stream, () => "", (text, bytes) =>
    text.length >= 64 * 1024 ? text : `${text}${new TextDecoder().decode(bytes)}`
  );

const signalEffect = (handle, signal) => {
  for (const name of ["kill", "sendSignal", "signal"]) {
    const method = handle[name];
    if (typeof method === "function") {
      const value = method.call(handle, signal);
      if (Effect.isEffect(value)) return value;
      if (value instanceof Promise) return Effect.promise(() => value);
      return Effect.succeed(value);
    }
  }
  return Effect.fail(new Error("official ChildProcess handle exposes no signal operation"));
};

const summarizeExit = (exit) =>
  Exit.isSuccess(exit)
    ? { _tag: "ExitCode", exitCode: Number(exit.value) }
    : { _tag: "PlatformFailure" };

const watchOne = async ({ provider, executable, source, outdir }) => {
  await mkdir(outdir, { recursive: true });
  const argv = provider === "bun"
    ? ["build", source, "--outdir", outdir, "--target=node", "--watch"]
    : ["bundle", "--watch", "--outdir", outdir, source];
  let pid;
  let handleKeys = [];
  const program = Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* ChildProcess.make(executable, argv, {
        cwd: dirname(source),
        shell: false,
        forceKillAfter: "1 second",
      });
      pid = handle.pid;
      handleKeys = Reflect.ownKeys(handle).map(String).sort();
      const stdoutFiber = yield* Effect.forkScoped(collectText(handle.stdout));
      const stderrFiber = yield* Effect.forkScoped(collectText(handle.stderr));
      const firstPath = yield* Effect.promise(() =>
        waitFor(async () => firstOutput(outdir, source), `${provider} initial watch output`)
      );
      const firstContents = yield* Effect.promise(() => readFile(firstPath, "utf8"));
      yield* Effect.promise(() => writeFile(source, 'console.log("watch-v2")\n'));
      yield* Effect.promise(() =>
        waitFor(async () => {
          const currentPath = await firstOutput(outdir, source);
          if (currentPath === undefined) return false;
          const contents = await readFile(currentPath, "utf8");
          return contents.includes("watch-v2");
        }, `${provider} rebuilt watch output`)
      );
      yield* signalEffect(handle, "SIGTERM");
      const exit = summarizeExit(yield* Effect.exit(handle.exitCode));
      const stdout = yield* Fiber.join(stdoutFiber);
      const stderr = yield* Fiber.join(stderrFiber);
      return {
        pid,
        handleKeys,
        initialOutputObserved: firstContents.length > 0,
        rebuildObserved: true,
        signal: "SIGTERM",
        exit,
        stdout,
        stderr,
      };
    }),
  ).pipe(Effect.provide(NodeServices.layer));
  const observation = await Effect.runPromise(program);
  conclusion(typeof observation.pid === "number", `${provider} watch did not expose a numeric pid`);
  conclusion(observation.initialOutputObserved, `${provider} watch did not emit initial output`);
  conclusion(observation.rebuildObserved, `${provider} watch did not rebuild`);
  conclusion(typeof observation.stdout === "string" && typeof observation.stderr === "string", `${provider} watch did not expose raw stdio`);
  return observation;
};

const processExists = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const interruptionClosesScope = async (executable) => {
  let pid;
  const started = new Promise((resolveStarted) => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* ChildProcess.make(
          executable,
          ["-e", "setInterval(() => {}, 1000)"],
          { shell: false, forceKillAfter: "500 millis" },
        );
        pid = handle.pid;
        resolveStarted();
        return yield* Effect.never;
      }),
    ).pipe(Effect.provide(NodeServices.layer));
    const fiber = Effect.runFork(program);
    interruptionClosesScope.fiber = fiber;
  });
  await started;
  infrastructure(typeof pid === "number", "interruption fixture has no pid");
  conclusion(processExists(pid), "interruption fixture was not alive before interruption");
  await Effect.runPromise(Fiber.interrupt(interruptionClosesScope.fiber));
  await waitFor(() => !processExists(pid), "scope interruption to terminate child", 10_000);
  return { pid, terminatedAfterFiberInterruption: true };
};

const signalThenForceKill = async (executable) => {
  const program = Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* ChildProcess.make(
        executable,
        ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        { shell: false, forceKillAfter: "500 millis" },
      );
      const pid = handle.pid;
      yield* signalEffect(handle, "SIGTERM");
      const exit = summarizeExit(yield* Effect.exit(handle.exitCode));
      return { pid, exit };
    }),
  ).pipe(Effect.provide(NodeServices.layer));
  const observation = await Effect.runPromise(program);
  await waitFor(() => !processExists(observation.pid), "force-kill timeout", 10_000);
  return { ...observation, forceKilledAfterIgnoredSignal: true };
};

const bun = await requiredPath("EFFECT_BUILD_BUN_BIN");
const deno = await requiredPath("EFFECT_BUILD_DENO_BIN");
const root = await mkdtemp(join(tmpdir(), "effect-build-provider-watch-"));
export let providerNativeWatchResult;
try {
  const bunSource = join(root, "bun-entry.ts");
  const denoSource = join(root, "deno-entry.ts");
  await writeFile(bunSource, 'console.log("watch-v1")\n');
  await writeFile(denoSource, 'console.log("watch-v1")\n');
  const bunObservation = await watchOne({
    provider: "bun",
    executable: bun,
    source: bunSource,
    outdir: join(root, "bun-out"),
  });
  const denoObservation = await watchOne({
    provider: "deno",
    executable: deno,
    source: denoSource,
    outdir: join(root, "deno-out"),
  });
  const interrupted = await interruptionClosesScope(process.execPath);
  const forceKilled = await signalThenForceKill(process.execPath);
  providerNativeWatchResult = {
    portableTypedEventProtocol: "falsified",
    providerNativeCommandWatch: "established",
    eventProtocol: "raw-stdio-and-exit-only",
    readinessProtocol: "not-advertised",
    bun: bunObservation,
    deno: denoObservation,
    interruption: interrupted,
    forceKill: forceKilled,
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
