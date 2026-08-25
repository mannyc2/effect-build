import { Effect, FileSystem, Layer, Path } from "effect";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as TreeSnapshot from "effect-build/Author/TreeSnapshot";
import { PortableUnsupported, ProviderFailed } from "effect-build/BuildError";
import * as StaticBrowserApplication from "effect-build/Profile/StaticBrowserApplication";
import * as rolldown from "rolldown";
import * as Build from "./Build.js";
import type { RolldownFailed } from "./internal/error.js";

export const identity: NodeMain.ProviderIdentity = Object.freeze({
  package: "effect-build-rolldown",
  version: "0.5.0",
  engine: "rolldown",
  engineVersion: rolldown.VERSION,
});

const failed = (operation: string, cause: unknown): ProviderFailed =>
  new ProviderFailed({ provider: identity.package, operation, cause });

const mapBuildError = <A, R>(
  operation: string,
  effect: Effect.Effect<A, RolldownFailed, R>,
): Effect.Effect<A, ProviderFailed, R> => Effect.mapError(effect, (cause) => failed(operation, cause));

const sourceBytes = (source: rolldown.OutputAsset["source"]): Uint8Array =>
  typeof source === "string" ? new TextEncoder().encode(source) : new Uint8Array(source);

const mediaTypeOf = (relativePath: string): string | undefined => {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json") || lower.endsWith(".map")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return undefined;
};

const nodeProducer = Layer.effect(
  NodeMain.Producer,
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rolldownService = yield* Build.Rolldown;
    const produce = Effect.fn("effect-build-rolldown/Profile.produceNodeMain")(
      function*(request: NodeMain.Request, staging: string) {
        const observedModules = new Set<string>();
        const output = yield* mapBuildError(
          "produce-node-main",
          Effect.scoped(
            Effect.flatMap(
              rolldownService.make({
                input: request.entrypoint,
                platform: "node",
                plugins: [{
                  name: "effect-build-node-main-graph",
                  moduleParsed(module) {
                    observedModules.add(module.id);
                  },
                }],
              }),
              (build) => build.generate({ format: request.format === "module" ? "esm" : "cjs" }),
            ),
          ),
        );
        const chunks = output.output.filter((item): item is rolldown.OutputChunk => item.type === "chunk");
        if (chunks.length !== 1 || output.output.length !== 1) {
          return yield* new PortableUnsupported({
            profile: NodeMain.profile,
            provider: identity.package,
            reason: `expected one output chunk, observed ${output.output.length} outputs`,
          });
        }
        const [chunk] = chunks;
        if (chunk === undefined) {
          return yield* new PortableUnsupported({
            profile: NodeMain.profile,
            provider: identity.package,
            reason: "rolldown returned no output chunk",
          });
        }
        const outfile = path.join(staging, request.format === "module" ? "main.mjs" : "main.cjs");
        yield* fileSystem.writeFileString(outfile, chunk.code, { flag: "wx" }).pipe(
          Effect.mapError((cause) => failed("write-node-main", cause)),
        );
        const moduleIds = [...observedModules];
        const inputs = moduleIds.length === 1 ? [request.entrypoint] : moduleIds;
        return Object.freeze({
          protocol: NodeMain.producedProtocol,
          format: request.format,
          path: outfile,
          inputs: Object.freeze(inputs),
          runtimeImports: Object.freeze([...chunk.imports, ...chunk.dynamicImports]),
        });
      },
    );
    return { identity, produce };
  }),
);

const browserProvider = Layer.effect(
  StaticBrowserApplication.Provider,
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rolldownService = yield* Build.Rolldown;
    const produce = Effect.fn("effect-build-rolldown/Profile.produceStaticBrowserApplication")(
      function*(request: StaticBrowserApplication.Request, staging: string) {
        const output = yield* mapBuildError(
          "produce-static-browser-application",
          Effect.scoped(
            Effect.flatMap(
              rolldownService.make({ input: request.entrypoint, platform: "browser" }),
              (build) =>
                build.generate({
                  format: "esm",
                  entryFileNames: "assets/[name]-[hash].js",
                  chunkFileNames: "assets/chunk-[hash].js",
                  assetFileNames: "assets/[name]-[hash][extname]",
                }),
            ),
          ),
        );
        const outputNames = new Set(output.output.map(({ fileName }) => fileName));
        const files: StaticBrowserApplication.ProducedFile[] = [];
        let entryModule: string | undefined;
        for (const item of output.output) {
          const relativePath = item.fileName.split("\\").join("/");
          const problem = TreeSnapshot.validatePortablePath(relativePath);
          if (problem !== undefined) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `non-portable output path ${relativePath}: ${problem}`,
            });
          }
          const mediaType = mediaTypeOf(relativePath);
          if (mediaType === undefined) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `unknown media type for ${relativePath}`,
            });
          }
          const imports = item.type === "chunk" ? [...item.imports, ...item.dynamicImports] : [];
          const unknown = imports.filter((specifier) => !outputNames.has(specifier));
          if (unknown.length > 0) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `external output edges in ${relativePath}: ${unknown.join(", ")}`,
            });
          }
          const outputPath = path.join(staging, ...relativePath.split("/"));
          yield* fileSystem.makeDirectory(path.dirname(outputPath), { recursive: true }).pipe(
            Effect.mapError((cause) => failed("make-browser-output-directory", cause)),
          );
          const bytes = item.type === "chunk" ? new TextEncoder().encode(item.code) : sourceBytes(item.source);
          yield* fileSystem.writeFile(outputPath, bytes, { flag: "wx" }).pipe(
            Effect.mapError((cause) => failed("write-browser-output", cause)),
          );
          files.push(Object.freeze({ path: relativePath, mediaType, imports: Object.freeze(imports) }));
          if (item.type === "chunk" && item.isEntry) entryModule = relativePath;
        }
        if (entryModule === undefined) {
          return yield* new PortableUnsupported({
            profile: StaticBrowserApplication.protocol,
            provider: identity.package,
            reason: "no authoritative entry module",
          });
        }
        files.sort((left, right) => TreeSnapshot.comparePortablePaths(left.path, right.path));
        return Object.freeze({
          protocol: StaticBrowserApplication.producedProtocol,
          entryModule,
          files: Object.freeze(files),
        });
      },
    );
    return { identity, produce };
  }),
);

const nativeLayer = Build.layer;

/** One explicit provider Layer for both closed portable profiles. */
export const layer = Layer.merge(nodeProducer, browserProvider).pipe(Layer.provide(nativeLayer));
