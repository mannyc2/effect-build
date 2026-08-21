import { NodeServices } from "@effect/platform-node";
import { createRequire } from "node:module";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Effect, Exit, Fiber } from "effect";
import { ChildProcess } from "effect/unstable/process";
import * as esbuild from "esbuild";
import { conclusion, infrastructure } from "./receipt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "r4-provider-process.mjs");
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const withTimeout = async (promise, milliseconds, label) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};
const trace = (message) => {
  if (process.env.EFFECT_BUILD_R4_TRACE === "1") console.error(`[r4] ${message}`);
};

const waitFor = async (predicate, label, timeout = 10_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await predicate();
    if (result) return result;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const processExists = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const settled = async (promise) => {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (error) {
    return {
      status: "rejected",
      code: error !== null && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const providerDirectChild = async (root) => {
  trace("child:start");
  const outputRoot = join(root, "provider-direct-output");
  let handle;
  let fiber;
  const started = new Promise((resolveStarted) => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        handle = yield* ChildProcess.make(
          process.execPath,
          [fixture, outputRoot],
          { shell: false, forceKillAfter: "300 millis" },
        );
        resolveStarted();
        return yield* Effect.never;
      }),
    ).pipe(Effect.provide(NodeServices.layer));
    fiber = Effect.runFork(program);
  });
  await started;
  const readyPath = join(outputRoot, "ready.json");
  const ready = await waitFor(async () => {
    try {
      return JSON.parse(await readFile(readyPath, "utf8"));
    } catch {
      return undefined;
    }
  }, "provider-direct partial-output fixture");
  infrastructure(handle !== undefined && fiber !== undefined, "Effect child fixture did not acquire a handle");
  conclusion(handle.pid === ready.parentPid, "fixture reported a different direct-child pid");
  conclusion(processExists(ready.parentPid), "direct child was not alive before scope interruption");
  conclusion(processExists(ready.descendantPid), "descendant was not alive before scope interruption");

  await Effect.runPromise(Fiber.interrupt(fiber));
  trace("child:scope-closed");
  await waitFor(() => !processExists(ready.parentPid), "direct child termination and reap");
  if (process.platform !== "win32") {
    await waitFor(() => !processExists(ready.descendantPid), "descendant process-group termination");
  }

  const complete = await stat(join(outputRoot, "complete-output.bin"));
  const partial = await stat(join(outputRoot, "partial-output.bin"));
  conclusion(complete.size === 256 * 1024, "complete provider-direct remnant changed");
  conclusion(partial.size === 32 * 1024, "partial provider-direct remnant changed");
  const result = {
    officialCommand: "effect/unstable/process/ChildProcess.make",
    directPid: ready.parentPid,
    descendantPid: ready.descendantPid,
    directChildTerminatedAndReaped: !processExists(ready.parentPid),
    descendantTermination: process.platform === "win32"
      ? "not-claimed-by-this-probe"
      : !processExists(ready.descendantPid),
    durableProviderDirectRemnants: {
      completeBytes: complete.size,
      partialBytes: partial.size,
      automaticallyCleaned: false,
    },
  };
  trace("child:done");
  return result;
};

const esbuildOneShotInterruption = async (root) => {
  trace("esbuild:one-shot:start");
  const entry = join(root, "esbuild-one-shot-entry.ts");
  await writeFile(entry, 'export const oneShot = "continued";\n');
  let entered;
  let release;
  let providerCompleted = false;
  let onEndObserved = false;
  let providerPromise;
  const enteredPromise = new Promise((resolveEntered) => {
    entered = resolveEntered;
  });
  const gate = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  const provider = () => {
    providerPromise = esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      logLevel: "silent",
      plugins: [{
        name: "r4-one-shot-interruption",
        setup(build) {
          build.onLoad({ filter: /esbuild-one-shot-entry\.ts$/ }, async (args) => {
            entered();
            await gate;
            return { contents: await readFile(args.path, "utf8"), loader: "ts" };
          });
          build.onEnd(() => {
            onEndObserved = true;
          });
        },
      }],
    }).then((result) => {
      providerCompleted = true;
      return result;
    });
    return providerPromise;
  };
  const fiber = Effect.runFork(Effect.promise(provider));
  await withTimeout(enteredPromise, 5_000, "esbuild one-shot delayed plugin");
  await Effect.runPromise(Fiber.interrupt(fiber));
  const callerExit = await Effect.runPromise(Fiber.await(fiber));
  conclusion(Exit.isFailure(callerExit), "Effect interruption did not fail the one-shot caller fiber");
  conclusion(providerCompleted === false, "esbuild one-shot provider completed before plugin release");
  release();
  const result = await withTimeout(providerPromise, 5_000, "esbuild one-shot provider continuation");
  conclusion(providerCompleted, "esbuild one-shot provider did not continue after caller interruption");
  conclusion(onEndObserved, "esbuild one-shot continuation did not reach plugin onEnd");
  conclusion(result.outputFiles.length === 1, "esbuild one-shot continuation produced no memory output");
  trace("esbuild:one-shot:done");
  return {
    callerFiberInterrupted: true,
    providerCompletedAfterInterruption: providerCompleted,
    delayedPluginCompleted: onEndObserved,
    outputFiles: result.outputFiles.length,
  };
};

const esbuildContextRaceMatrix = async (root) => {
  trace("esbuild:context-races:start");
  const entry = join(root, "esbuild-race-entry.ts");
  await writeFile(entry, 'export const race = "v1";\n');

  let coalescedEntered;
  let releaseCoalesced;
  let starts = 0;
  const coalescedGate = new Promise((resolveRelease) => {
    releaseCoalesced = resolveRelease;
  });
  const coalescedStarted = new Promise((resolveStarted) => {
    coalescedEntered = resolveStarted;
  });
  const coalescedContext = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "r4-coalesced-rebuild",
      setup(build) {
        build.onStart(async () => {
          starts += 1;
          coalescedEntered();
          await coalescedGate;
        });
      },
    }],
  });
  try {
    const first = coalescedContext.rebuild();
    await coalescedStarted;
    const second = coalescedContext.rebuild();
    await sleep(25);
    conclusion(starts === 1, "concurrent esbuild rebuild was not coalesced while active");
    releaseCoalesced();
    const results = await Promise.all([first, second]);
    conclusion(results.every((result) => result.outputFiles?.length === 1), "coalesced rebuild lost memory output");
  } finally {
    releaseCoalesced();
    await coalescedContext.dispose();
  }

  let activeEntered;
  let releaseActive;
  const activeGate = new Promise((resolveRelease) => {
    releaseActive = resolveRelease;
  });
  const activeStarted = new Promise((resolveStarted) => {
    activeEntered = resolveStarted;
  });
  const disposingContext = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "r4-dispose-active-rebuild",
      setup(build) {
        build.onLoad({ filter: /esbuild-race-entry\.ts$/ }, async (args) => {
          activeEntered();
          await activeGate;
          return { contents: await readFile(args.path, "utf8"), loader: "ts" };
        });
      },
    }],
  });
  const active = settled(disposingContext.rebuild());
  await activeStarted;
  let disposeResolved = false;
  const dispose = disposingContext.dispose().then(() => {
    disposeResolved = true;
  });
  await sleep(25);
  const disposeResolvedBeforeActivePluginRelease = disposeResolved;
  releaseActive();
  await withTimeout(dispose, 5_000, "esbuild dispose raced with active rebuild");
  const activeAfterDispose = await active;
  const postDispose = {
    rebuild: await settled(Promise.resolve().then(() => disposingContext.rebuild())),
    watch: await settled(Promise.resolve().then(() => disposingContext.watch())),
    serve: await settled(Promise.resolve().then(() => disposingContext.serve({ port: 0 }))),
  };
  conclusion(Object.values(postDispose).every((result) => result.status === "rejected"), "post-dispose context method was accepted");

  let cleanupStartedResolve;
  let releaseCleanup;
  let cleanupFinished = false;
  const cleanupStarted = new Promise((resolveStarted) => {
    cleanupStartedResolve = resolveStarted;
  });
  const cleanupGate = new Promise((resolveRelease) => {
    releaseCleanup = resolveRelease;
  });
  const cleanupContext = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "r4-delayed-plugin-cleanup",
      setup(build) {
        build.onDispose(async () => {
          cleanupStartedResolve();
          await cleanupGate;
          cleanupFinished = true;
        });
      },
    }],
  });
  await cleanupContext.rebuild();
  let cleanupDisposeResolved = false;
  const cleanupDispose = cleanupContext.dispose().then(() => {
    cleanupDisposeResolved = true;
  });
  await withTimeout(cleanupStarted, 5_000, "esbuild delayed plugin cleanup start");
  await sleep(25);
  const disposeResolvedBeforePluginCleanupRelease = cleanupDisposeResolved;
  releaseCleanup();
  await withTimeout(cleanupDispose, 5_000, "esbuild delayed plugin cleanup dispose");
  await waitFor(() => cleanupFinished, "esbuild delayed plugin cleanup finish");
  await cleanupContext.dispose();

  trace("esbuild:context-races:done");
  return {
    concurrentRebuilds: { calls: 2, providerStarts: starts, coalesced: starts === 1 },
    disposeDuringActiveRebuild: {
      disposeResolvedBeforeActivePluginRelease,
      activeOutcome: activeAfterDispose.status,
    },
    postDispose: Object.fromEntries(
      Object.entries(postDispose).map(([operation, result]) => [operation, result.status]),
    ),
    delayedPluginCleanup: {
      disposeResolvedBeforePluginCleanupRelease,
      cleanupEventuallyFinished: cleanupFinished,
      secondDispose: "fulfilled",
    },
  };
};

const esbuildHandle = async (root) => {
  trace("esbuild:start");
  const entry = join(root, "esbuild-entry.ts");
  const output = join(root, "esbuild-output.js");
  await writeFile(entry, 'console.log("before-cancel")\n');
  let entered;
  let release;
  const enteredPromise = new Promise((resolveEntered) => {
    entered = resolveEntered;
  });
  const gate = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  let delay = true;
  const context = await esbuild.context({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: output,
    logLevel: "silent",
    plugins: [{
      name: "r4-cancel-gate",
      setup(build) {
        build.onLoad({ filter: /esbuild-entry\.ts$/ }, async (args) => {
          if (delay) {
            entered();
            await gate;
          }
          return { contents: await readFile(args.path, "utf8"), loader: "ts" };
        });
      },
    }],
  });
  try {
    const active = settled(context.rebuild());
    await enteredPromise;
    let cancelResolved = false;
    const cancel = context.cancel().then(() => {
      cancelResolved = true;
    });
    await sleep(25);
    const cancelResolvedBeforePluginRelease = cancelResolved;
    release();
    await cancel;
    const canceled = await active;
    conclusion(canceled.status === "rejected", "esbuild cancel did not reject the active rebuild");
    delay = false;
    await writeFile(entry, 'console.log("after-cancel")\n');
    await context.rebuild();
    conclusion((await readFile(output, "utf8")).includes("after-cancel"), "esbuild cancel disposed the context");
    await context.dispose();
    const postDispose = await settled(context.rebuild());
    conclusion(postDispose.status === "rejected", "esbuild accepted rebuild after dispose");
    const result = {
      provider: "esbuild",
      version: esbuild.version,
      methods: {
        rebuild: typeof context.rebuild,
        cancel: typeof context.cancel,
        dispose: typeof context.dispose,
      },
      activeCancel: canceled.status,
      cancelResolvedBeforePluginRelease,
      cancelDisposes: false,
      rebuildAfterCancel: "fulfilled",
      postDispose: postDispose.status,
    };
    trace("esbuild:done");
    return result;
  } finally {
    release();
    await context.dispose();
  }
};

const externalPackage = async (name) => {
  const externalRoot = process.env.RESEARCH_EXTERNAL_NODE_MODULES;
  infrastructure(
    typeof externalRoot === "string" && isAbsolute(externalRoot),
    "RESEARCH_EXTERNAL_NODE_MODULES must be an absolute path",
  );
  const require = createRequire(join(externalRoot, "effect-build-r4-research.cjs"));
  const packageJson = require.resolve(`${name}/package.json`);
  const entry = require.resolve(name);
  await access(entry);
  return {
    module: await import(pathToFileURL(entry).href),
    metadata: JSON.parse(await readFile(packageJson, "utf8")),
  };
};

const concurrentRolldownGenerate = async (rolldown, entry) => {
  trace("rolldown:concurrency:start");
  let active = 0;
  let maxActive = 0;
  let entries = 0;
  let release;
  const gate = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  const bothEntered = new Promise((resolveBoth) => {
    concurrentRolldownGenerate.resolveBoth = resolveBoth;
  });
  const bundle = await rolldown({ input: entry });
  const output = () => ({
    format: "esm",
    plugins: [{
      name: "r4-concurrent-output",
      async renderStart() {
        active += 1;
        entries += 1;
        maxActive = Math.max(maxActive, active);
        if (entries === 2) concurrentRolldownGenerate.resolveBoth();
        await gate;
        active -= 1;
      },
    }],
  });
  try {
    const first = bundle.generate(output());
    const second = bundle.generate(output());
    await withTimeout(bothEntered, 5_000, "two concurrent Rolldown generate hooks");
    release();
    const results = await Promise.all([settled(first), settled(second)]);
    conclusion(results.every((result) => result.status === "fulfilled"), "concurrent Rolldown generate failed");
    conclusion(maxActive === 2, "Rolldown generate calls did not overlap");
    const result = { calls: 2, maxActive, results: results.map((item) => item.status) };
    trace("rolldown:concurrency:done");
    return result;
  } finally {
    release();
    await bundle.close();
  }
};

const rolldownCloseRace = async (rolldown, entry) => {
  trace("rolldown:close-race:start");
  let entered;
  let release;
  const enteredPromise = new Promise((resolveEntered) => {
    entered = resolveEntered;
  });
  const gate = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  const bundle = await rolldown({ input: entry });
  const active = bundle.generate({
    format: "esm",
    plugins: [{
      name: "r4-close-race",
      async renderStart() {
        entered();
        await gate;
      },
    }],
  });
  await enteredPromise;
  let closeResolved = false;
  const close = bundle.close().then(() => {
    closeResolved = true;
  });
  await withTimeout(close, 2_000, "Rolldown close during active generate");
  conclusion(closeResolved, "Rolldown close waited for the in-flight generate operation");
  conclusion(bundle.closed === true, "Rolldown did not expose closed state after close");
  release();
  const activeResult = await settled(active);
  conclusion(activeResult.status === "fulfilled", "Rolldown close canceled in-flight generate");
  const postClose = await settled(bundle.generate({ format: "esm" }));
  conclusion(postClose.status === "rejected", "Rolldown accepted generate after close");
  const postCloseMarker = postClose.code === "ALREADY_CLOSED" || postClose.message.includes("[ALREADY_CLOSED]")
    ? "ALREADY_CLOSED"
    : "unclassified";
  conclusion(postCloseMarker === "ALREADY_CLOSED", "Rolldown post-close diagnostic changed");
  const result = {
    methods: {
      generate: typeof bundle.generate,
      close: typeof bundle.close,
      cancel: typeof bundle.cancel,
      dispose: typeof bundle.dispose,
      asyncDispose: typeof bundle[Symbol.asyncDispose],
    },
    closeResolvedWhileGenerateBlocked: true,
    closeCanceledActiveGenerate: false,
    activeGenerateAfterClose: activeResult.status,
    postClose: postClose.status,
    postCloseMarker,
  };
  trace("rolldown:close-race:done");
  return result;
};

const rolldownHandle = async (root) => {
  trace("rolldown:start");
  const { module, metadata } = await externalPackage("rolldown");
  infrastructure(metadata.version === "1.2.4", `expected Rolldown 1.2.4, received ${metadata.version}`);
  const entry = join(root, "rolldown-entry.js");
  await writeFile(entry, 'export const answer = 42;\n');
  const concurrency = await concurrentRolldownGenerate(module.rolldown, entry);
  const closeRace = await rolldownCloseRace(module.rolldown, entry);
  const result = { provider: "rolldown", version: metadata.version, concurrency, closeRace };
  trace("rolldown:done");
  return result;
};

const root = await mkdtemp(join(tmpdir(), "effect-build-r4-runtime-"));
export let r4RuntimeResult;
try {
  r4RuntimeResult = {
    child: await providerDirectChild(root),
    esbuildOneShot: await esbuildOneShotInterruption(root),
    esbuild: await esbuildHandle(root),
    esbuildContextRaces: await esbuildContextRaceMatrix(root),
    rolldown: await rolldownHandle(root),
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
