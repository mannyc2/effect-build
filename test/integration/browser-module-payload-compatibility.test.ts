import { NodeServices } from "@effect/platform-node";
import { type BrowserType, chromium, firefox, webkit } from "@playwright/test";
import { Effect, Layer } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunCommand from "../../packages/effect-build-bun/src/Command/index.js";
import { toPlatformMetadataPath } from "../../packages/effect-build-bun/src/internal/MetadataPath.js";
import { Runtime as BunCommandRuntime } from "../../packages/effect-build-bun/src/internal/Runtime.js";
import * as EsbuildApi from "../../packages/effect-build-esbuild/src/Api/index.js";
import * as RolldownBuild from "../../packages/effect-build-rolldown/src/Api/Build.js";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import type * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as BrowserModulePayload from "../../packages/effect-build/src/Profile/BrowserModulePayload.js";
import { assertCertificationHost } from "../../scripts/certification-host.mjs";

const providerId = process.env.EFFECT_BUILD_BROWSER_PROVIDER;
const browserId = process.env.EFFECT_BUILD_BROWSER_ENGINE;
const browserRevision = process.env.EFFECT_BUILD_BROWSER_REVISION;
const certificationHost = process.env.EFFECT_BUILD_CERTIFICATION_HOST;
const receiptPath = process.env.EFFECT_BUILD_COMPAT_RECEIPT;
const enabled = providerId !== undefined || browserId !== undefined || browserRevision !== undefined
  || certificationHost !== undefined;

let fixtureRoot = "";
beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "effect-build-browser-module-payload-"));
});
afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

interface NativeImport {
  readonly rawSpecifier: string;
  readonly kind: string;
  readonly external: boolean;
  readonly target?: string;
}

interface NativeOutput {
  readonly path: string;
  readonly entryId?: string;
  readonly imports: readonly NativeImport[];
}

const identity = (group: string): NodeMain.ProviderIdentity =>
  Object.freeze(
    group === "bun-cli"
      ? { package: "effect-build-bun", version: "0.5.0", engine: "bun", engineVersion: "1.3.14" }
      : group === "esbuild-api"
      ? { package: "effect-build-esbuild", version: "0.5.0", engine: "esbuild", engineVersion: "0.28.2" }
      : { package: "effect-build-rolldown", version: "0.5.0", engine: "rolldown", engineVersion: "1.2.5" },
  );

const failed = (provider: string, operation: string, cause: unknown) =>
  new BrowserModulePayload.BrowserModulePayloadProviderFailed({ provider, operation, cause });

const unsupported = (provider: string, reason: string) =>
  new BrowserModulePayload.BrowserModulePayloadUnsupported({ provider, reason });

const portable = (root: string, path: string): string => relative(root, path).split(sep).join("/");

const canonicalFile = async (path: string): Promise<string> => {
  const absolute = toPlatformMetadataPath({ isAbsolute, resolve }, path);
  const canonical = await realpath(absolute).catch(() => normalize(absolute));
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
};

const bunPortableOutput = (root: string, metadataPath: string): string => {
  const normalized = metadataPath.split("\\").join("/");
  const crossDrive = /^(?:\.\.\/)+([A-Za-z]:\/.*)$/u.exec(normalized);
  if (crossDrive !== null) return portable(root, crossDrive[1]!);
  if (!isAbsolute(metadataPath) && !normalized.startsWith("../")) {
    return normalized.startsWith("./") ? normalized.slice(2) : normalized;
  }
  return portable(root, resolve(metadataPath));
};

const bindMetadataOutput = (root: string, metadataPath: string, files: readonly string[]): string => {
  const normalized = metadataPath.split("\\").join("/");
  const matches = files.filter((file) => normalized === file || normalized.endsWith(`/${file}`));
  if (matches.length !== 1) {
    throw new Error(`metadata output ${metadataPath} has ${matches.length} payload bindings beneath ${root}`);
  }
  return matches[0]!;
};

const edgeTarget = (from: string, rawSpecifier: string, outputs: ReadonlySet<string>): string | undefined => {
  const pathOnly = rawSpecifier.split(/[?#]/u, 1)[0]!;
  const candidate = posix.normalize(posix.join(posix.dirname(from), pathOnly));
  return outputs.has(candidate) ? candidate : outputs.has(pathOnly) ? pathOnly : undefined;
};

const declarePayload = (
  request: BrowserModulePayload.Request,
  root: string,
  outputs: readonly NativeOutput[],
  provider: NodeMain.ProviderIdentity,
): BrowserModulePayload.ProducedPayload => {
  const outputPaths = new Set(outputs.map(({ path }) => path));
  const chunks = outputs.filter(({ entryId }) => entryId === undefined).map(({ path }) => path);
  const entries = request.entries.map((entry) => {
    const matches = outputs.filter(({ entryId }) => entryId === entry.id);
    if (matches.length !== 1) throw unsupported(provider.package, `entry ${entry.id} has ${matches.length} outputs`);
    return Object.freeze({
      requestId: entry.id,
      module: matches[0]!.path,
      associatedStyles: Object.freeze([]),
      associatedChunks: Object.freeze([...chunks]),
      associatedAssets: Object.freeze([]),
      preloadCandidates: Object.freeze([...chunks]),
    });
  });
  const edges: BrowserModulePayload.Edge[] = [];
  for (const output of outputs) {
    for (const imported of output.imports) {
      if (imported.external) {
        edges.push(Object.freeze({
          from: output.path,
          rawSpecifier: imported.rawSpecifier,
          kind: imported.kind,
          disposition: "external",
        }));
        continue;
      }
      const to = imported.target ?? edgeTarget(output.path, imported.rawSpecifier, outputPaths);
      if (to === undefined) {
        throw unsupported(provider.package, `unresolved native output edge ${output.path} -> ${imported.rawSpecifier}`);
      }
      edges.push(Object.freeze({
        from: output.path,
        rawSpecifier: imported.rawSpecifier,
        kind: imported.kind,
        disposition: "internal",
        to,
      }));
    }
  }
  return Object.freeze({
    protocol: BrowserModulePayload.producedProtocol,
    root,
    entries: Object.freeze(entries),
    files: Object.freeze(outputs.map((output) =>
      Object.freeze({
        path: output.path,
        mediaType: "text/javascript; charset=utf-8",
        role: output.entryId === undefined ? "chunk" as const : "entry" as const,
      })
    )),
    edges: Object.freeze(edges),
    provider: Object.freeze({
      status: "conditional-candidate-executed",
      group: providerId,
      graphSource: provider.engine,
    }),
  });
};

const produceBun = (
  request: BrowserModulePayload.Request,
  ownedRoot: Artifact.AbsolutePath,
  provider: NodeMain.ProviderIdentity,
): Effect.Effect<BrowserModulePayload.ProducedPayload, BrowserModulePayload.ProduceError, BunCommandRuntime> =>
  Effect.gen(function*() {
    const metadataPath = join(ownedRoot, "provider-metafile.json");
    yield* BunCommand.Build.buildToDirectory({
      entrypoints: request.entries.map(({ source }) => source) as [string, ...string[]],
      outdir: ownedRoot,
      target: "browser",
      format: "esm",
      splitting: true,
      sourcemap: "none",
      minify: request.minify === true,
      metafile: metadataPath,
      naming: {
        entry: "entries/[name]-[hash].[ext]",
        chunk: "chunks/chunk-[hash].[ext]",
        asset: "assets/[name]-[hash].[ext]",
      },
    }).pipe(Effect.mapError((cause) => failed(provider.package, "build-browser-module-payload", cause)));
    return yield* Effect.tryPromise({
      try: async () => {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
          readonly outputs?: Readonly<
            Record<string, {
              readonly entryPoint?: string;
              readonly imports?: readonly {
                readonly path: string;
                readonly kind?: string;
                readonly external?: boolean;
              }[];
            }>
          >;
        };
        await unlink(metadataPath);
        const outputRecords = Object.entries(metadata.outputs ?? {});
        const files = outputRecords.map(([path]) => bunPortableOutput(ownedRoot, path));
        const sourceBindings = await Promise.all(request.entries.map(async (entry) => ({
          entry,
          source: await canonicalFile(entry.source),
        })));
        const outputs = await Promise.all(outputRecords.map(async ([path, value]) => {
          const outputPath = bindMetadataOutput(ownedRoot, bunPortableOutput(ownedRoot, path), files);
          const entrySource = value.entryPoint === undefined ? undefined : await canonicalFile(value.entryPoint);
          const entry = sourceBindings.find(({ source }) => entrySource === source)?.entry;
          return {
            path: outputPath,
            ...(entry === undefined ? {} : { entryId: entry.id }),
            imports: (value.imports ?? []).map((imported) => ({
              rawSpecifier: imported.path,
              kind: imported.kind ?? "import-statement",
              external: imported.external === true,
              ...(imported.external === true
                ? {}
                : { target: bindMetadataOutput(ownedRoot, imported.path, files) }),
            })),
          };
        }));
        return declarePayload(request, ownedRoot, outputs, provider);
      },
      catch: (cause) =>
        cause instanceof BrowserModulePayload.BrowserModulePayloadUnsupported
          ? cause
          : failed(provider.package, "observe-browser-module-payload", cause),
    });
  });

const produceEsbuild = (
  request: BrowserModulePayload.Request,
  ownedRoot: Artifact.AbsolutePath,
  provider: NodeMain.ProviderIdentity,
): Effect.Effect<BrowserModulePayload.ProducedPayload, BrowserModulePayload.ProduceError> =>
  Effect.gen(function*() {
    const result = yield* EsbuildApi.Build.build({
      entryPoints: Object.fromEntries(request.entries.map(({ id, source }) => [id, source])),
      bundle: true,
      platform: "browser",
      format: "esm",
      splitting: true,
      outdir: ownedRoot,
      entryNames: "entries/[name]-[hash]",
      chunkNames: "chunks/chunk-[hash]",
      assetNames: "assets/[name]-[hash]",
      sourcemap: false,
      minify: request.minify === true,
      metafile: true,
      logLevel: "silent",
      write: false,
    }).pipe(Effect.mapError((cause) => failed(provider.package, "build-browser-module-payload", cause)));
    return yield* Effect.tryPromise({
      try: async () => {
        await Promise.all(result.outputFiles.map(async (output) => {
          await mkdir(dirname(output.path), { recursive: true });
          await writeFile(output.path, output.contents, { flag: "wx" });
        }));
        const files = result.outputFiles.map(({ path }) => portable(ownedRoot, path));
        const sourceBindings = await Promise.all(request.entries.map(async (entry) => ({
          entry,
          source: await canonicalFile(entry.source),
        })));
        const outputs = await Promise.all(
          Object.entries(result.metafile.outputs).map(async ([path, value]) => {
            const outputPath = bindMetadataOutput(ownedRoot, path, files);
            const entrySource = value.entryPoint === undefined ? undefined : await canonicalFile(value.entryPoint);
            const entry = sourceBindings.find(({ source }) => entrySource === source)?.entry;
            return {
              path: outputPath,
              ...(entry === undefined ? {} : { entryId: entry.id }),
              imports: value.imports.map((imported) => ({
                rawSpecifier: imported.path,
                kind: imported.kind,
                external: imported.external === true,
                ...(imported.external === true
                  ? {}
                  : { target: bindMetadataOutput(ownedRoot, imported.path, files) }),
              })),
            };
          }),
        );
        return declarePayload(request, ownedRoot, outputs, provider);
      },
      catch: (cause) =>
        cause instanceof BrowserModulePayload.BrowserModulePayloadUnsupported
          ? cause
          : failed(provider.package, "materialize-browser-module-payload", cause),
    });
  });

const produceRolldown = (
  request: BrowserModulePayload.Request,
  ownedRoot: Artifact.AbsolutePath,
  provider: NodeMain.ProviderIdentity,
): Effect.Effect<BrowserModulePayload.ProducedPayload, BrowserModulePayload.ProduceError> =>
  Effect.gen(function*() {
    const result = yield* RolldownBuild.generate(
      {
        input: Object.fromEntries(request.entries.map(({ id, source }) => [id, source])),
        platform: "browser",
      },
      {
        format: "esm",
        entryFileNames: "entries/[name]-[hash].js",
        chunkFileNames: "chunks/chunk-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        minify: request.minify === true,
      },
    ).pipe(Effect.mapError((cause) => failed(provider.package, "build-browser-module-payload", cause)));
    return yield* Effect.tryPromise({
      try: async () => {
        const outputs: NativeOutput[] = [];
        const sourceBindings = await Promise.all(request.entries.map(async (entry) => ({
          entry,
          source: await canonicalFile(entry.source),
        })));
        for (const item of result.output) {
          if (item.type !== "chunk") {
            throw unsupported(provider.package, `unexpected non-module output ${item.fileName}`);
          }
          const path = item.fileName.split("\\").join("/");
          const output = join(ownedRoot, ...path.split("/"));
          await mkdir(dirname(output), { recursive: true });
          await writeFile(output, item.code, { flag: "wx" });
          const facade = item.facadeModuleId === null ? undefined : await canonicalFile(item.facadeModuleId);
          const entry = sourceBindings.find(({ source }) => facade === source)?.entry;
          outputs.push({
            path,
            ...(entry === undefined ? {} : { entryId: entry.id }),
            imports: [
              ...item.imports.map((rawSpecifier) => ({ rawSpecifier, kind: "import-statement", external: false })),
              ...item.dynamicImports.map((rawSpecifier) => ({ rawSpecifier, kind: "dynamic-import", external: false })),
            ],
          });
        }
        return declarePayload(request, ownedRoot, outputs, provider);
      },
      catch: (cause) =>
        cause instanceof BrowserModulePayload.BrowserModulePayloadUnsupported
          ? cause
          : failed(provider.package, "materialize-browser-module-payload", cause),
    });
  });

const provider = () => {
  if (providerId === undefined) throw new Error("browser provider coordinate is missing");
  const providerIdentity = identity(providerId);
  const makeService = (bunRuntime?: BunCommandRuntime["Service"]): BrowserModulePayload.Provider["Service"] => ({
    identity: providerIdentity,
    produce: (request, ownedRoot) =>
      providerId === "bun-cli"
        ? produceBun(request, ownedRoot, providerIdentity).pipe(
          Effect.provideService(BunCommandRuntime, bunRuntime!),
        )
        : providerId === "esbuild-api"
        ? produceEsbuild(request, ownedRoot, providerIdentity)
        : providerId === "rolldown-api"
        ? produceRolldown(request, ownedRoot, providerIdentity)
        : Effect.fail(unsupported(providerId, "unknown provider coordinate")),
  });
  if (providerId !== "bun-cli") return Layer.succeed(BrowserModulePayload.Provider, makeService());
  const executable = process.env.EFFECT_BUILD_BUN_BIN;
  const runtime = BunCommand.layer(
    executable === undefined ? {} : { executable: executable as Artifact.AbsolutePath },
  ).pipe(Layer.provide(NodeServices.layer));
  return Layer.effect(
    BrowserModulePayload.Provider,
    Effect.map(BunCommandRuntime, (service) => makeService(service)),
  ).pipe(Layer.provide(runtime));
};

const browserType = (): BrowserType => {
  if (browserId === "chromium") return chromium;
  if (browserId === "firefox") return firefox;
  if (browserId === "webkit") return webkit;
  throw new Error(`unsupported browser engine ${browserId}`);
};

const serveAndExecute = (payload: BrowserModulePayload.Borrowed): Promise<string> =>
  new Promise((complete, reject) => {
    const entry = payload.entries[0];
    if (entry === undefined) {
      reject(new Error("browser payload has no entry association"));
      return;
    }
    const mediaTypes = new Map(payload.files.map(({ path, mediaType }) => [path, mediaType]));
    const server = createServer((request, response) => {
      const url = decodeURIComponent((request.url ?? "/").split("?", 1)[0]!);
      if (url === "/" || url === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(`<!doctype html><body><script type="module" src="/payload/${entry.module}"></script></body>`);
        return;
      }
      if (!url.startsWith("/payload/")) {
        response.writeHead(404).end();
        return;
      }
      const relativePath = url.slice("/payload/".length);
      const candidate = normalize(resolve(payload.root, relativePath));
      const root = normalize(payload.root);
      if (!candidate.startsWith(`${root}${sep}`)) {
        response.writeHead(400).end();
        return;
      }
      readFile(candidate).then(
        (bytes) => {
          response.writeHead(200, {
            "content-type": mediaTypes.get(relativePath) ?? "application/octet-stream",
            "cache-control": "no-store",
          });
          response.end(bytes);
        },
        () => response.writeHead(404).end(),
      );
    });
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("browser payload server did not bind a port"));
        return;
      }
      let browser: Awaited<ReturnType<BrowserType["launch"]>> | undefined;
      try {
        const selected = browserType();
        expect(selected.executablePath()).toContain(`${browserId}-${browserRevision}`);
        browser = await selected.launch({ headless: true });
        const page = await browser.newPage();
        const diagnostics: string[] = [];
        page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.message}`));
        page.on("requestfailed", (request) => diagnostics.push(`requestfailed:${request.url()}`));
        await page.goto(`http://127.0.0.1:${address.port}/index.html`);
        try {
          await page.waitForFunction(() => document.body.dataset.result === "lazy-ok", undefined, { timeout: 10_000 });
        } catch {
          throw new Error(`browser payload did not execute: ${diagnostics.join("|")}`);
        }
        await Effect.runPromise(payload.tree.observe);
        complete(payload.tree.initial.manifestDigest.value);
      } catch (cause) {
        reject(cause);
      } finally {
        await browser?.close();
        server.close();
      }
    });
  });

describe.skipIf(!enabled).sequential("BrowserModulePayload compatibility candidate coordinate", () => {
  it("executes the borrowed provider graph without claiming durable application admission", async () => {
    if (
      providerId === undefined || browserId === undefined || browserRevision === undefined
      || certificationHost === undefined
    ) throw new Error("all browser compatibility coordinate fields are required");
    const host = assertCertificationHost(certificationHost);

    const application = join(fixtureRoot, "application.ts");
    const lazy = join(fixtureRoot, "lazy.ts");
    await Promise.all([
      writeFile(lazy, 'export const value = "lazy-ok";\n'),
      writeFile(
        application,
        'const lazy = await import("./lazy.ts");\n'
          + "document.body.dataset.result = lazy.value;\n",
      ),
    ]);
    const request: BrowserModulePayload.Request = {
      protocol: BrowserModulePayload.protocol,
      entries: [{ id: "application", source: application }],
      mode: "production",
      sourceMaps: "none",
      minify: false,
      conditions: ["browser", "production"],
    };
    const manifestSha256 = await Effect.runPromise(
      BrowserModulePayload.withPayload(request, (payload) => Effect.promise(() => serveAndExecute(payload))).pipe(
        Effect.provide(Layer.mergeAll(provider(), BorrowedOutput.CleanupReporter.layer, NodeServices.layer)),
      ) as Effect.Effect<string>,
    );
    expect(manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
    if (receiptPath !== undefined) {
      await mkdir(resolve(receiptPath, ".."), { recursive: true });
      await writeFile(
        receiptPath,
        `${
          JSON.stringify({
            providerGroup: providerId,
            browserEngine: `${browserId}@${browserRevision}`,
            certificationHost,
            hostPlatform: host.platform,
            hostArchitecture: host.architecture,
            hostLibc: host.libc,
            hostSystemTarget: host.systemTarget,
            manifestSha256,
            claim: "conditional-candidate-executed-no-profile-admission",
            profile: BrowserModulePayload.protocol,
          })
        }\n`,
        { flag: "wx" },
      );
    }
  }, 300_000);
});
