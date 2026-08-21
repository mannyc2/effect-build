import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  access,
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { conclusion, infrastructure } from "./receipt.mjs";
import { requiredPath } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 300_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const walk = async (root) => {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  return files.sort();
};

const firstExisting = async (candidates) => {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through fixed runner paths.
    }
  }
  return undefined;
};

const chrome = await firstExisting([
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]);
infrastructure(chrome !== undefined, "a real Chromium/Chrome executable is required");
const font = await firstExisting([
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]);
infrastructure(font !== undefined, "a real browser-loadable font fixture is required");

const svg = (label, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${fill}"/><text x="1" y="12" font-size="5">${label}</text></svg>\n`;

const makeFixture = async (root) => {
  const source = join(root, "source");
  await mkdir(join(source, "assets"), { recursive: true });
  await mkdir(join(source, "nested"), { recursive: true });
  await writeFile(join(source, "index.html"), `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="./top.css">
  <link rel="preload" as="font" href="./assets/font.ttf" type="font/ttf" crossorigin>
</head>
<body>
  <p id="font-probe">browser profile</p>
  <div id="module-probe"></div>
  <img id="direct-image" src="./assets/direct.svg" alt="direct">
  <script type="module" src="./app.ts"></script>
</body>
</html>
`);
  await writeFile(join(source, "top.css"), `@font-face {
  font-family: FixtureFont;
  src: url("./assets/font.ttf") format("truetype");
}
body {
  border-top: 7px solid rgb(1, 2, 3);
  font-family: FixtureFont, sans-serif;
  background-image: url("./assets/top.svg");
}
`);
  await writeFile(join(source, "module.css"), `#module-probe {
  width: 11px;
  height: 9px;
  background-image: url("./assets/module.svg");
}
`);
  await writeFile(join(source, "app.ts"), `import "./module.css";
document.body.dataset.ready = "yes";
const chunk = await import("./nested/chunk.ts");
chunk.activate();
`);
  await writeFile(join(source, "nested/chunk.ts"), `import "./chunk.css";
export const activate = (): void => {
  const element = document.createElement("div");
  element.id = "dynamic-probe";
  document.body.append(element);
  document.body.dataset.chunk = "loaded";
};
`);
  await writeFile(join(source, "nested/chunk.css"), `#dynamic-probe {
  width: 5px;
  height: 13px;
  background-image: url("../assets/nested.svg");
}
`);
  await writeFile(join(source, "assets/direct.svg"), svg("direct", "red"));
  await writeFile(join(source, "assets/top.svg"), svg("top", "green"));
  await writeFile(join(source, "assets/module.svg"), svg("module", "blue"));
  await writeFile(join(source, "assets/nested.svg"), svg("nested", "orange"));
  await copyFile(font, join(source, "assets/font.ttf"));
  return source;
};

const buildApplication = async ({ provider, executable, source, output, minify }) => {
  await mkdir(output, { recursive: true });
  const base = provider === "bun"
    ? ["build", "index.html", "--outdir", output, "--target=browser", ...(minify ? ["--minify"] : [])]
    : ["bundle", "--outdir", output, "--platform=browser", ...(minify ? ["--minify"] : []), "index.html"];
  const sourceMapCandidates = provider === "bun"
    ? ["--sourcemap=linked", "--sourcemap=external"]
    : ["--sourcemap=linked", "--sourcemap"];
  let completion;
  let selectedSourceMapFlag;
  for (const flag of sourceMapCandidates) {
    const argv = provider === "bun"
      ? [...base, flag]
      : [...base.slice(0, -1), flag, base.at(-1)];
    const attempted = await run(executable, argv, { cwd: source });
    if (attempted.ok) {
      completion = attempted;
      selectedSourceMapFlag = flag;
      break;
    }
  }
  if (completion === undefined) completion = await run(executable, base, { cwd: source });
  if (!completion.ok) {
    return {
      conforms: false,
      failure: {
        phase: "provider-build",
        stderr: completion.stderr,
        message: completion.message,
      },
    };
  }
  const files = await walk(output);
  const htmlPath = files.find((path) => path.endsWith(".html"));
  conclusion(htmlPath !== undefined, `${provider} emitted no HTML entry`);
  const html = await readFile(htmlPath, "utf8");
  const nativeTopLevelPreserved = /top(?:[-.][^"']+)?\.css/.test(html)
    && files.some((path) => path.endsWith(".css"));
  const mapFiles = files.filter((path) => path.endsWith(".map"));
  if (selectedSourceMapFlag !== undefined) {
    conclusion(mapFiles.length > 0, `${provider} accepted ${selectedSourceMapFlag} but emitted no source map`);
  }
  return { htmlPath, selectedSourceMapFlag, nativeTopLevelPreserved, mapFiles };
};

const normalizeTopLevelResources = async (source, output, htmlPath) => {
  await copyFile(join(source, "top.css"), join(output, "top.css"));
  await cp(join(source, "assets"), join(output, "assets"), { recursive: true, force: true });
  let html = await readFile(htmlPath, "utf8");
  if (!html.includes("top.css")) {
    html = html.replace("</head>", '<link rel="stylesheet" href="./top.css"></head>');
  }
  if (!html.includes("assets/font.ttf")) {
    html = html.replace(
      "</head>",
      '<link rel="preload" as="font" href="./assets/font.ttf" type="font/ttf" crossorigin></head>',
    );
  }
  if (!/id=["']direct-image["']/.test(html)) {
    html = html.replace(
      "</body>",
      '<img id="direct-image" src="./assets/direct.svg" alt="direct"></body>',
    );
  }
  await writeFile(htmlPath, html);
};

const mime = (path) => {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".ttf": return "font/ttf";
    case ".map": return "application/json";
    default: return "application/octet-stream";
  }
};

const withStaticServer = async (root, entry, use) => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const requested = decodeURIComponent(url.pathname === "/" ? `/${entry}` : url.pathname);
      const candidate = resolve(root, `.${requested}`);
      const fromRoot = relative(root, candidate);
      if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        response.writeHead(403).end();
        return;
      }
      const information = await stat(candidate);
      if (!information.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": mime(candidate), "cache-control": "no-store" });
      response.end(await readFile(candidate));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  infrastructure(typeof address === "object" && address !== null, "static server did not bind a TCP port");
  try {
    return await use(`http://127.0.0.1:${address.port}/${entry}`);
  } finally {
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
};

const allocatePort = async () => {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  infrastructure(typeof address === "object" && address !== null, "port allocator failed");
  const port = address.port;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
};

const evaluateInChrome = async (url) => {
  const port = await allocatePort();
  const userData = await mkdtemp(join(tmpdir(), "effect-build-browser-chrome-"));
  const child = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserStderr = "";
  child.stderr.on("data", (chunk) => {
    if (browserStderr.length < 64 * 1024) browserStderr += chunk.toString("utf8");
  });
  try {
    let version;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          version = await response.json();
          break;
        }
      } catch {
        // Browser endpoint is not ready yet.
      }
      await sleep(50);
    }
    infrastructure(version !== undefined, `Chrome remote debugging failed: ${browserStderr}`);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: "PUT" });
    infrastructure(targetResponse.ok, `Chrome target creation failed: ${targetResponse.status}`);
    const target = await targetResponse.json();
    infrastructure(typeof target.webSocketDebuggerUrl === "string", "Chrome target has no debugger URL");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    const failedRequests = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const waiter = pending.get(message.id);
        if (waiter !== undefined) {
          pending.delete(message.id);
          if (message.error === undefined) waiter.resolve(message.result);
          else waiter.reject(new Error(JSON.stringify(message.error)));
        }
      } else if (message.method === "Network.loadingFailed" && message.params?.canceled !== true) {
        failedRequests.push(message.params);
      }
    });
    const send = (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve: resolveCommand, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.navigate", { url });
    const evaluation = await send("Runtime.evaluate", {
      expression: `(async () => {
        const deadline = Date.now() + 10000;
        while ((document.body?.dataset.ready !== "yes" || document.body?.dataset.chunk !== "loaded") && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await document.fonts.ready;
        await document.fonts.load("12px FixtureFont");
        const body = getComputedStyle(document.body);
        const moduleElement = document.querySelector("#module-probe");
        const dynamicElement = document.querySelector("#dynamic-probe");
        const image = document.querySelector("#direct-image");
        if (!moduleElement || !dynamicElement || !image) throw new Error("application elements missing");
        const moduleProbe = getComputedStyle(moduleElement);
        const dynamicProbe = getComputedStyle(dynamicElement);
        const imageUrl = (value) => {
          const match = /url\\(["']?(.*?)["']?\\)/.exec(value);
          return match?.[1];
        };
        const backgroundUrls = [body.backgroundImage, moduleProbe.backgroundImage, dynamicProbe.backgroundImage]
          .map(imageUrl)
          .filter(Boolean);
        const backgroundLoads = await Promise.all(backgroundUrls.map(async (resource) => {
          const response = await fetch(new URL(resource, document.baseURI));
          return { resource, ok: response.ok };
        }));
        return {
          ready: document.body.dataset.ready,
          chunk: document.body.dataset.chunk,
          borderTopWidth: body.borderTopWidth,
          moduleWidth: moduleProbe.width,
          dynamicHeight: dynamicProbe.height,
          imageWidth: image.naturalWidth,
          fontLoaded: document.fonts.check("12px FixtureFont"),
          backgroundLoads,
          resourceCount: performance.getEntriesByType("resource").length,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    socket.close();
    infrastructure(evaluation.exceptionDetails === undefined, JSON.stringify(evaluation.exceptionDetails));
    const value = evaluation.result?.value;
    infrastructure(value !== undefined, "Chrome evaluation returned no value");
    return { value, failedRequests };
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      sleep(2_000).then(() => child.kill("SIGKILL")),
    ]);
    await rm(userData, { recursive: true, force: true });
  }
};

const selectedBun = await requiredPath("EFFECT_BUILD_BUN_BIN");
const currentBun = await requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN");
const selectedDeno = await requiredPath("EFFECT_BUILD_DENO_BIN");
const currentDeno = await requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN");
const matrix = [
  { provider: "bun", version: "1.3.9", executable: selectedBun },
  { provider: "bun", version: "1.3.14", executable: currentBun },
  { provider: "deno", version: "2.9.3", executable: selectedDeno },
  { provider: "deno", version: "2.9.5", executable: currentDeno },
];

const root = await mkdtemp(join(tmpdir(), "effect-build-browser-behavior-"));
export let browserBehaviorResult;
try {
  const source = await makeFixture(root);
  const observations = [];
  for (const item of matrix) {
    for (const minify of [false, true]) {
      const output = join(root, `${item.provider}-${item.version}-${minify ? "min" : "pretty"}`);
      const build = await buildApplication({ ...item, source, output, minify });
      if (build.conforms === false) {
        observations.push({
          provider: item.provider,
          version: item.version,
          minify,
          conforms: false,
          failure: build.failure,
        });
        continue;
      }
      await normalizeTopLevelResources(source, output, build.htmlPath);
      const entry = relative(output, build.htmlPath).replaceAll("\\", "/");
      const browser = await withStaticServer(output, entry, (url) => evaluateInChrome(url));
      conclusion(browser.value.ready === "yes", `${item.provider} ${item.version} application did not start`);
      conclusion(browser.value.chunk === "loaded", `${item.provider} ${item.version} dynamic import did not execute`);
      conclusion(browser.value.borderTopWidth === "7px", `${item.provider} ${item.version} top-level CSS did not apply`);
      conclusion(browser.value.moduleWidth === "11px", `${item.provider} ${item.version} module CSS did not apply`);
      conclusion(browser.value.dynamicHeight === "13px", `${item.provider} ${item.version} nested dynamic CSS did not apply`);
      conclusion(browser.value.imageWidth > 0, `${item.provider} ${item.version} direct image did not load`);
      conclusion(browser.value.fontLoaded === true, `${item.provider} ${item.version} font did not load`);
      conclusion(browser.value.backgroundLoads.length === 3, `${item.provider} ${item.version} did not expose every CSS URL asset`);
      conclusion(browser.value.backgroundLoads.every((resource) => resource.ok), `${item.provider} ${item.version} CSS URL asset failed`);
      conclusion(browser.failedRequests.length === 0, `${item.provider} ${item.version} had failed browser requests`);
      observations.push({
        provider: item.provider,
        version: item.version,
        minify,
        conforms: true,
        nativeTopLevelPreserved: build.nativeTopLevelPreserved,
        sourceMapFlag: build.selectedSourceMapFlag,
        sourceMapFiles: build.mapFiles.map((path) => relative(output, path).replaceAll("\\", "/")),
        browser: browser.value,
      });
    }
  }
  conclusion(
    observations.some((item) =>
      item.provider === "deno"
      && (item.conforms === false || item.nativeTopLevelPreserved === false)
    ),
    "the native Deno top-level linked-resource falsifier unexpectedly disappeared",
  );
  const allNormalizedCellsPassed = observations.length === matrix.length * 2
    && observations.every((item) =>
      item.conforms === true
      && item.browser.ready === "yes"
      && item.browser.chunk === "loaded"
    );
  browserBehaviorResult = {
    role: "BrowserModuleApplication",
    nativeTopLevelResourcePortability: "falsified",
    adapterNormalizedApplicationSemantics: allNormalizedCellsPassed ? "established" : "falsified",
    observations,
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
