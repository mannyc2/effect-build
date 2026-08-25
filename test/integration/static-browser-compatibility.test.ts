import { NodeServices } from "@effect/platform-node";
import { type BrowserType, chromium, firefox, webkit } from "@playwright/test";
import { Effect, type Layer } from "effect";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunProfile from "../../packages/effect-build-bun/src/Profile.js";
import * as EsbuildProfile from "../../packages/effect-build-esbuild/src/Profile.js";
import * as RolldownProfile from "../../packages/effect-build-rolldown/src/Profile.js";
import * as StaticBrowserApplication from "../../packages/effect-build/src/Profile/StaticBrowserApplication.js";

const providerId = process.env.EFFECT_BUILD_BROWSER_PROVIDER;
const browserId = process.env.EFFECT_BUILD_BROWSER_ENGINE;
const browserRevision = process.env.EFFECT_BUILD_BROWSER_REVISION;
const certificationHost = process.env.EFFECT_BUILD_CERTIFICATION_HOST;
const receiptPath = process.env.EFFECT_BUILD_COMPAT_RECEIPT;
const enabled = providerId !== undefined || browserId !== undefined || browserRevision !== undefined
  || certificationHost !== undefined;

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-browser-compat-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const provider = (): Layer.Layer<StaticBrowserApplication.Provider, unknown, unknown> => {
  if (providerId === "bun-cli") {
    const executable = process.env.EFFECT_BUILD_BUN_BIN;
    return BunProfile.layer(executable === undefined ? {} : { executable });
  }
  if (providerId === "esbuild-api") return EsbuildProfile.layer;
  if (providerId === "rolldown-api") return RolldownProfile.layer;
  throw new Error(`unsupported browser provider ${providerId}`);
};

const browserType = (): BrowserType => {
  if (browserId === "chromium") return chromium;
  if (browserId === "firefox") return firefox;
  if (browserId === "webkit") return webkit;
  throw new Error(`unsupported browser engine ${browserId}`);
};

const mediaType = (path: string): string => {
  const extension = extname(path);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

describe.skipIf(!enabled).sequential("static browser compatibility coordinate", () => {
  it("builds, serves, and executes one generation-qualified application", async () => {
    if (
      providerId === undefined || browserId === undefined || browserRevision === undefined
      || certificationHost === undefined
    ) {
      throw new Error("all compatibility coordinate environment fields are required");
    }
    const entrypoint = join(root, "main.ts");
    const lazy = join(root, "lazy.ts");
    const stylesheet = join(root, "application.css");
    const message = join(root, "message.txt");
    await Promise.all([
      writeFile(lazy, 'export const value = "lazy-ok";\n'),
      writeFile(stylesheet, "body { color: rgb(1, 2, 3); }\n"),
      writeFile(message, "resource-ok\n"),
      writeFile(
        entrypoint,
        'const lazy = await import("./lazy.js");\n'
          + 'const resource = await fetch(new URL("../static/message.txt", import.meta.url)).then((response) => response.text());\n'
          + "document.body.dataset.result = `${lazy.value}|${resource.trim()}`;\n",
      ),
    ]);
    const generation = await Effect.runPromise(
      StaticBrowserApplication.build({
        request: {
          protocol: StaticBrowserApplication.protocol,
          entrypoint,
          resources: [
            { source: stylesheet, destination: "static/application.css", mediaType: "text/css; charset=utf-8" },
            { source: message, destination: "static/message.txt", mediaType: "text/plain; charset=utf-8" },
          ],
        },
        generationRoot: join(root, "generations"),
      }).pipe(Effect.provide(provider()), Effect.provide(NodeServices.layer)) as Effect.Effect<
        StaticBrowserApplication.StaticBrowserApplication
      >,
    );
    const server = createServer((request, response) => {
      const relative = decodeURIComponent((request.url ?? "/").split("?")[0]!).replace(/^\/+/, "") || "index.html";
      const candidate = normalize(resolve(generation.tree, relative));
      if (!candidate.startsWith(`${normalize(generation.tree)}${process.platform === "win32" ? "\\" : "/"}`)) {
        response.writeHead(400).end();
        return;
      }
      readFile(candidate).then(
        (bytes) => {
          response.writeHead(200, { "content-type": mediaType(candidate), "cache-control": "no-store" });
          response.end(bytes);
        },
        () => response.writeHead(404).end(),
      );
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("HTTP server did not bind a TCP port");
    const selectedBrowser = browserType();
    expect(selectedBrowser.executablePath()).toContain(`${browserId}-${browserRevision}`);
    const browser = await selectedBrowser.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const diagnostics: string[] = [];
      page.on("request", (request) => diagnostics.push(`request: ${request.url()}`));
      page.on("response", (response) => diagnostics.push(`response: ${response.status()} ${response.url()}`));
      page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()}`));
      page.on("console", (message) => {
        if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
      });
      await page.goto(`http://127.0.0.1:${address.port}/index.html`);
      try {
        await page.waitForFunction(() => document.body.dataset.result !== undefined, undefined, { timeout: 10_000 });
      } catch {
        const script = await page.locator("script[type=module]").getAttribute("src");
        const source = script === null
          ? "missing module script"
          : await page.evaluate((url) => fetch(url).then((r) => r.text()), script);
        throw new Error(`browser application did not become ready: ${diagnostics.join(" | ")} | source: ${source}`);
      }
      expect(await page.locator("body").getAttribute("data-result")).toBe("lazy-ok|resource-ok");
      expect(await page.locator("body").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(1, 2, 3)");
      expect(generation.manifest.files.every(({ digest }) => digest.value.length === 64)).toBe(true);
      if (receiptPath !== undefined) {
        await mkdir(resolve(receiptPath, ".."), { recursive: true });
        await writeFile(
          receiptPath,
          `${
            JSON.stringify({
              providerGroup: providerId,
              browserEngine: `${browserId}@${browserRevision}`,
              certificationHost,
              manifestSha256: generation.manifestDigest.value,
            })
          }\n`,
          { flag: "wx" },
        );
      }
    } finally {
      await browser.close();
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => error ? reject(error) : resolveClose())
      );
    }
  }, 300_000);
});
