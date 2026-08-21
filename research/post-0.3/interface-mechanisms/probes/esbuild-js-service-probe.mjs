import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const EXPECTED_ESBUILD = "0.28.2";
const EXPECTED_PACKAGE_JSON_SHA256 = "9d0bc453f4e791553c4cc2298ba023b409241fd9801e494741666eb0f6051490";
const EXPECTED_JS_ENTRYPOINT_SHA256 = "61ec0ba144ff93f4bf0e96ad6fab6f430ede0aa13e27ace8063ed63ba416b3cd";
const EXPECTED_NATIVE_BINARY_SHA256 = "10b6243df618d374bb2d5c9cfbe7052e1405f6aa4e53a6164f11a91b9f2e1384";
const here = dirname(fileURLToPath(import.meta.url));
const localRequire = createRequire(import.meta.url);
const packageJsonPath = localRequire.resolve("esbuild/package.json");
const jsEntrypointPath = localRequire.resolve("esbuild");
const packageRequire = createRequire(packageJsonPath);
if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error(`checked esbuild service receipt is Darwin arm64 only; observed ${process.platform}/${process.arch}`);
}
const nativeBinaryPath = packageRequire.resolve("@esbuild/darwin-arm64/bin/esbuild");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;

if (esbuild.version !== EXPECTED_ESBUILD) {
  throw new Error(`expected esbuild ${EXPECTED_ESBUILD}, observed ${esbuild.version}`);
}

const serviceChildren = () => {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ps failed: ${result.stderr}`);
  return result.stdout.split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || Number(match[2]) !== process.pid || !match[4].includes("--service=0.28.2")) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), rssKiB: Number(match[3]), command: match[4] }];
  });
};

const waitFor = async (predicate, timeoutMs = 2_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await sleep(20);
  }
  return predicate();
};

const before = serviceChildren();
const coldStart = process.hrtime.bigint();
const transformed = await esbuild.transform("const value: number = 42", { loader: "ts" });
const coldTransformMs = elapsedMs(coldStart);
const afterTransform = serviceChildren();

let resolveCalls = 0;
let loadCalls = 0;
const pluginBuild = await esbuild.build({
  stdin: { contents: 'import value from "research:virtual"; export default value;', loader: "js" },
  bundle: true,
  write: false,
  plugins: [{
    name: "research-callback",
    setup(build) {
      build.onResolve({ filter: /^research:virtual$/ }, (args) => {
        resolveCalls += 1;
        return { path: args.path, namespace: "research" };
      });
      build.onLoad({ filter: /.*/, namespace: "research" }, () => {
        loadCalls += 1;
        return { contents: 'export default "callback-ran";', loader: "js" };
      });
    },
  }],
});

const invalid = await esbuild.transform("export const = ;", { loader: "ts" })
  .then(() => ({ failed: false }))
  .catch((error) => ({ failed: true, name: error?.name, errors: error?.errors?.length ?? null }));
const recovered = await esbuild.transform("export const recovered: number = 1", { loader: "ts" });

const contextA = await esbuild.context({ stdin: { contents: "export default 1" }, bundle: true, write: false });
const contextB = await esbuild.context({ stdin: { contents: "export default 2" }, bundle: true, write: false });
await Promise.all([contextA.rebuild(), contextB.rebuild()]);
const withTwoContexts = serviceChildren();
await Promise.all([contextA.dispose(), contextB.dispose()]);
const afterDispose = serviceChildren();

let releaseSlowPlugin;
const slowPluginGate = new Promise((resolve) => {
  releaseSlowPlugin = resolve;
});
let signalSlowPluginEntered;
const slowPluginEntered = new Promise((resolve) => {
  signalSlowPluginEntered = resolve;
});
const cancellationContext = await esbuild.context({
  stdin: { contents: "export default 3" },
  bundle: true,
  write: false,
  plugins: [{
    name: "research-cancellation",
    setup(build) {
      build.onStart(async () => {
        signalSlowPluginEntered();
        await slowPluginGate;
      });
    },
  }],
});
const rebuild = cancellationContext.rebuild()
  .then(() => ({ outcome: "completed" }))
  .catch((error) => ({ outcome: "failed", message: error instanceof Error ? error.message : String(error) }));
let callbackEntryTimeout;
try {
  await Promise.race([
    slowPluginEntered,
    new Promise((_, reject) => {
      callbackEntryTimeout = setTimeout(() => reject(new Error("cancellation plugin callback did not start")), 2_000);
    }),
  ]);
} finally {
  clearTimeout(callbackEntryTimeout);
}
const cancellationStart = process.hrtime.bigint();
const cancel = cancellationContext.cancel();
const cancellationPendingWhileCallbackBlocked = await Promise.race([
  cancel.then(() => false),
  sleep(25).then(() => true),
]);
releaseSlowPlugin();
await cancel;
const cancellationRequestToSettlementMs = elapsedMs(cancellationStart);
const rebuildOutcome = await rebuild;
await cancellationContext.dispose();

esbuild.stop();
const afterStop = await waitFor(() => serviceChildren().length === 0 ? [] : null);
const restartStart = process.hrtime.bigint();
await esbuild.transform("export default 4", { loader: "js" });
const restartMs = elapsedMs(restartStart);
const afterRestart = serviceChildren();
esbuild.stop();
await waitFor(() => serviceChildren().length === 0 ? [] : null);

const packageJson = await readFile(packageJsonPath);
const packageJsonSha256 = createHash("sha256").update(packageJson).digest("hex");
const jsEntrypointSha256 = createHash("sha256").update(await readFile(jsEntrypointPath)).digest("hex");
const nativeBinarySha256 = createHash("sha256").update(await readFile(nativeBinaryPath)).digest("hex");

const assertions = {
  noServiceBeforeFirstCall: before.length === 0,
  firstCallStartsNativeService: afterTransform.length === 1,
  transformWorks: transformed.code.includes("const value = 42"),
  callbacksRoundTripAcrossProtocol: resolveCalls === 1 && loadCalls === 1 && pluginBuild.outputFiles.length === 1,
  providerFailureStructured: invalid.failed === true && invalid.errors > 0,
  serviceRecoversAfterFailure: recovered.code.includes("recovered"),
  contextsShareOneProcess: withTwoContexts.length === 1 && withTwoContexts[0].pid === afterTransform[0].pid,
  contextDisposeDoesNotStopProcess: afterDispose.length === 1 && afterDispose[0].pid === afterTransform[0].pid,
  cancelWaitsForHostCallback: cancellationPendingWhileCallbackBlocked === true,
  canceledRebuildFails: rebuildOutcome.outcome === "failed" && /cancel(?:ed|led)/i.test(rebuildOutcome.message),
  stopTerminatesProcess: Array.isArray(afterStop) && afterStop.length === 0,
  laterCallRestartsProcess: afterRestart.length === 1 && afterRestart[0].pid !== afterTransform[0].pid,
  exactPackageAndNativeBinary: packageJsonSha256 === EXPECTED_PACKAGE_JSON_SHA256
    && jsEntrypointSha256 === EXPECTED_JS_ENTRYPOINT_SHA256
    && nativeBinarySha256 === EXPECTED_NATIVE_BINARY_SHA256
    && process.env.ESBUILD_BINARY_PATH === undefined
    && afterTransform[0].command.startsWith(`${nativeBinaryPath} `),
};
if (Object.values(assertions).some((value) => value !== true)) {
  throw new Error(`esbuild service conclusion failure: ${JSON.stringify(assertions)}`);
}

console.log(JSON.stringify({
  schema: "effect-build/interface-mechanism-probe@1",
  probe: "esbuild-js-native-service",
  classification: "current-provider-mechanism-trace",
  esbuildVersion: esbuild.version,
  nodeVersion: process.version,
  packageJsonSha256,
  jsEntrypointSha256,
  nativeBinaryPackage: "@esbuild/darwin-arm64",
  nativeBinarySha256,
  assertions,
  observations: {
    coldTransformMs,
    restartMs,
    service: afterTransform[0],
    cancellationPendingWhileCallbackBlocked,
    cancellationRequestToSettlementMs,
    rebuildOutcome,
  },
}, null, 2));
