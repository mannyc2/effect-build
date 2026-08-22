import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXPECTED_ESBUILD = "0.28.2";
const EXPECTED_INTEGRITY = "sha512-GccVwhv3mmOUVQHCQm2Ox/rby8n/EqUwvZxE6Pjfikrq/lWw9g9WX/u9EykWnpot3Ko6j426DgQdea2xWKIAQA==";
const EXPECTED_SHASUM = "b1f69ae107aa8471b57756af4f8bc131407f4481";
const EXPECTED_SHA256 = "61594de12ce998652be2aa0ab72dda54bfa49407fb37ee3464468a2aac306baa";
const EXPECTED_CHROME_VERSION = "Google Chrome 151.0.7922.173";
const EXPECTED_CHROME_SHA256 = "21b789908667614137c0db7dadebf1eff21e60c6bb30f349445aef47bbfdded8";
const chrome = process.env.CHROME_EXE ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = await mkdtemp(join(tmpdir(), "effect-build-esbuild-wasm-browser-"));
const userData = join(root, "chrome-profile");
let browser;
let server;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const processGroupAlive = (child) => {
  if (!child?.pid) return false;
  if (process.platform === "win32") return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
};
const signalBrowser = (child, signal) => {
  if (process.platform === "win32") child.kill(signal);
  else if (child.pid) process.kill(-child.pid, signal);
};
const stopBrowser = async (child) => {
  if (!processGroupAlive(child)) return true;
  signalBrowser(child, "SIGTERM");
  for (let attempt = 0; attempt < 100 && processGroupAlive(child); attempt += 1) await sleep(20);
  if (processGroupAlive(child)) {
    signalBrowser(child, "SIGKILL");
    for (let attempt = 0; attempt < 100 && processGroupAlive(child); attempt += 1) await sleep(20);
  }
  return !processGroupAlive(child);
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>effect-build esbuild-wasm mechanism probe</title>
<script src="/browser.min.js"></script>
<script>
(async () => {
  const result = {
    userAgent: navigator.userAgent,
    crossOriginIsolated: self.crossOriginIsolated,
    observations: {},
  };
  const elapsed = (start) => performance.now() - start;
  try {
    const initializeStart = performance.now();
    await esbuild.initialize({ wasmURL: "/esbuild.wasm", worker: true });
    result.observations.initializeMs = elapsed(initializeStart);

    const transformStart = performance.now();
    const transformed = await esbuild.transform("const answer: number = 42", { loader: "ts" });
    result.observations.transformMs = elapsed(transformStart);
    result.transformWorks = transformed.code.includes("const answer = 42");

    let resolveCalls = 0;
    let loadCalls = 0;
    const built = await esbuild.build({
      stdin: { contents: 'import value from "research:virtual"; export default value;', loader: "js" },
      bundle: true,
      write: false,
      plugins: [{
        name: "research-browser-callback",
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
    result.pluginCallbacks = { resolveCalls, loadCalls, outputs: built.outputFiles.length };

    result.providerFailure = await esbuild.transform("export const = ;", { loader: "ts" })
      .then(() => ({ failed: false }))
      .catch((error) => ({ failed: true, name: error && error.name, errors: error && error.errors && error.errors.length }));
    const recovered = await esbuild.transform("export const recovered: number = 1", { loader: "ts" });
    result.recovered = recovered.code.includes("recovered");

    const context = await esbuild.context({
      stdin: { contents: "export default 1", loader: "js" },
      bundle: true,
      write: false,
    });
    const rebuilt = await context.rebuild();
    result.contextRebuild = rebuilt.outputFiles.length === 1;
    result.watch = await context.watch()
      .then(() => ({ supported: true }))
      .catch((error) => ({ supported: false, message: error instanceof Error ? error.message : String(error) }));
    result.serve = await context.serve({ servedir: "." })
      .then(() => ({ supported: true }))
      .catch((error) => ({ supported: false, message: error instanceof Error ? error.message : String(error) }));
    await context.dispose();

    result.write = await esbuild.build({
      stdin: { contents: "export default 1", loader: "js" },
      bundle: true,
      write: true,
      outfile: "out.js",
    }).then(() => ({ supported: true }))
      .catch((error) => ({ supported: false, message: error instanceof Error ? error.message : String(error) }));

    const concurrentStart = performance.now();
    const concurrent = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      esbuild.transform("export default " + index, { loader: "js" })));
    result.observations.concurrent16Ms = elapsed(concurrentStart);
    result.concurrent = concurrent.length === 16 && concurrent.every((item) => item.code.includes("export default"));
    result.observations.usedJSHeapSize = performance.memory && performance.memory.usedJSHeapSize;
    esbuild.stop();
  } catch (error) {
    result.fatal = error instanceof Error ? error.stack : String(error);
  }
  await fetch("/result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) });
})();
</script>`;

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

try {
  const packed = spawnSync(
    "npm",
    [
      "pack",
      `esbuild-wasm@${EXPECTED_ESBUILD}`,
      "--pack-destination",
      root,
      "--json",
      "--ignore-scripts",
      "--cache",
      join(root, "npm-cache"),
      "--userconfig",
      join(root, "empty-npmrc"),
    ],
    { encoding: "utf8" },
  );
  if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`);
  const packRecord = JSON.parse(packed.stdout)[0];
  if (packRecord.version !== EXPECTED_ESBUILD) throw new Error(`unexpected packed version ${packRecord.version}`);
  const tarball = join(root, packRecord.filename);
  const tarballSha256 = createHash("sha256").update(await readFile(tarball)).digest("hex");
  const extracted = spawnSync("tar", ["-xzf", tarball, "-C", root], { encoding: "utf8" });
  if (extracted.status !== 0) throw new Error(`tar failed: ${extracted.stderr}`);
  const browserJs = join(root, "package", "lib", "browser.min.js");
  const wasm = join(root, "package", "esbuild.wasm");

  let settleResult;
  let rejectResult;
  const resultPromise = new Promise((resolve, reject) => {
    settleResult = resolve;
    rejectResult = reject;
  });
  server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/result") {
      try {
        const value = JSON.parse((await readBody(request)).toString("utf8"));
        response.writeHead(204).end();
        settleResult(value);
      } catch (error) {
        response.writeHead(400).end();
        rejectResult(error);
      }
      return;
    }
    if (request.url === "/browser.min.js") {
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      createReadStream(browserJs).pipe(response);
      return;
    }
    if (request.url === "/esbuild.wasm") {
      response.writeHead(200, { "content-type": "application/wasm", "cache-control": "no-store" });
      createReadStream(wasm).pipe(response);
      return;
    }
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(html);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  let stderr = "";
  browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    `--user-data-dir=${userData}`,
    url,
  ], { stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32" });
  browser.stderr.on("data", (chunk) => {
    if (stderr.length < 64 * 1024) stderr += chunk.toString("utf8");
  });
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`browser probe timed out: ${stderr}`)), 30_000);
  });
  const browserError = once(browser, "error").then(([error]) => {
    throw new Error(`Chrome could not start: ${error}`);
  });
  const browserExit = once(browser, "exit").then(([code, signal]) => {
    throw new Error(`Chrome exited before returning a result: code=${code} signal=${signal} stderr=${stderr}`);
  });
  let result;
  try {
    result = await Promise.race([resultPromise, timeout, browserError, browserExit]);
  } finally {
    clearTimeout(timeoutId);
  }
  if (result.fatal) throw new Error(`browser probe fatal: ${result.fatal}`);
  const browserProcessGroupCleaned = await stopBrowser(browser);

  const chromeVersion = spawnSync(chrome, ["--version"], { encoding: "utf8" }).stdout.trim();
  const chromeSha256 = createHash("sha256").update(await readFile(chrome)).digest("hex");
  const assertions = {
    exactPackage: packRecord.version === EXPECTED_ESBUILD
      && packRecord.integrity === EXPECTED_INTEGRITY
      && packRecord.shasum === EXPECTED_SHASUM
      && tarballSha256 === EXPECTED_SHA256,
    exactBrowserHost: chromeVersion === EXPECTED_CHROME_VERSION
      && chromeSha256 === EXPECTED_CHROME_SHA256,
    wasmWorkerInitializes: typeof result.observations.initializeMs === "number",
    transformWorks: result.transformWorks === true,
    callbacksCrossWorkerBoundary: result.pluginCallbacks.resolveCalls === 1
      && result.pluginCallbacks.loadCalls === 1
      && result.pluginCallbacks.outputs === 1,
    providerFailureStructured: result.providerFailure.failed === true && result.providerFailure.errors > 0,
    workerRecoversAfterFailure: result.recovered === true,
    reusableContextWorks: result.contextRebuild === true,
    watchFailsClosed: result.watch.supported === false
      && result.watch.message.includes('Cannot use the "watch" API in this environment'),
    serveFailsClosed: result.serve.supported === false
      && result.serve.message.includes('Cannot use the "serve" API in this environment'),
    filesystemWriteFailsClosed: result.write.supported === false
      && result.write.message.includes('The "write" option is unavailable in this environment'),
    concurrentRequestsWork: result.concurrent === true,
    browserProcessGroupCleaned,
  };
  if (Object.values(assertions).some((value) => value !== true)) {
    throw new Error(`esbuild-wasm conclusion failure: ${JSON.stringify({ assertions, result })}`);
  }

  console.log(JSON.stringify({
    schema: "effect-build/interface-mechanism-probe@1",
    probe: "esbuild-wasm-browser-worker",
    classification: "research-prototype-not-product-code",
    esbuildVersion: EXPECTED_ESBUILD,
    chromeVersion,
    chromeExecutable: chrome,
    chromeSha256,
    package: {
      filename: packRecord.filename,
      integrity: packRecord.integrity,
      shasum: packRecord.shasum,
      sha256: tarballSha256,
    },
    assertions,
    observations: result,
  }, null, 2));
} finally {
  if (browser) await stopBrowser(browser);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
