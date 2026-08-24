import { Effect, FileSystem, Layer, Path } from "effect";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as TreeSnapshot from "effect-build/Author/TreeSnapshot";
import { PortableUnsupported, ProviderFailed } from "effect-build/BuildError";
import * as StaticBrowserApplication from "effect-build/Profile/StaticBrowserApplication";
import * as esbuild from "esbuild";
import * as Build from "./Build.js";
import type { EsbuildFailed } from "./internal/error.js";

export const identity: NodeMain.ProviderIdentity = Object.freeze({
  package: "effect-build-esbuild",
  version: "0.5.0",
  engine: "esbuild",
  engineVersion: esbuild.version,
});

const failed = (operation: string, cause: unknown): ProviderFailed =>
  new ProviderFailed({ provider: identity.package, operation, cause });

const mapBuildError = <A, R>(
  operation: string,
  effect: Effect.Effect<A, EsbuildFailed, R>,
): Effect.Effect<A, ProviderFailed, R> => Effect.mapError(effect, (cause) => failed(operation, cause));

const portablePath = (path: Path.Path, root: string, output: string): string =>
  path.relative(root, output).split(path.sep).join("/");

const mediaTypeOf = (relativePath: string): string | undefined => {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".map") || lower.endsWith(".json")) return "application/json; charset=utf-8";
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
    const esbuildService = yield* Build.Esbuild;
    const produce = Effect.fn("effect-build-esbuild/Profile.produceNodeMain")(
      function*(request: NodeMain.Request, staging: string) {
        const outfile = path.join(staging, request.format === "module" ? "main.mjs" : "main.cjs");
        const result = yield* mapBuildError(
          "produce-node-main",
          esbuildService.build({
            entryPoints: [request.entrypoint],
            bundle: true,
            platform: "node",
            format: request.format === "module" ? "esm" : "cjs",
            outfile,
            metafile: true,
            logLevel: "silent",
            write: false,
          }),
        );
        if (result.outputFiles.length !== 1) {
          return yield* new PortableUnsupported({
            profile: NodeMain.profile,
            provider: identity.package,
            reason: `expected one output file, observed ${result.outputFiles.length}`,
          });
        }
        const [output] = result.outputFiles;
        if (output === undefined) {
          return yield* new PortableUnsupported({
            profile: NodeMain.profile,
            provider: identity.package,
            reason: "esbuild returned no output file",
          });
        }
        yield* fileSystem.writeFile(outfile, output.contents, { flag: "wx" }).pipe(
          Effect.mapError((cause) => failed("write-node-main", cause)),
        );
        const inputKeys = Object.keys(result.metafile.inputs);
        const inputs = inputKeys.length === 1 ? [request.entrypoint] : inputKeys;
        const outputMetadata = Object.values(result.metafile.outputs).find((metadata) =>
          metadata.entryPoint !== undefined
        );
        const runtimeImports = outputMetadata?.imports.filter(({ external }) => external).map(({ path }) => path) ?? [];
        return Object.freeze({
          protocol: NodeMain.producedProtocol,
          format: request.format,
          path: outfile,
          inputs: Object.freeze(inputs),
          runtimeImports: Object.freeze(runtimeImports),
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
    const esbuildService = yield* Build.Esbuild;
    const produce = Effect.fn("effect-build-esbuild/Profile.produceStaticBrowserApplication")(
      function*(request: StaticBrowserApplication.Request, staging: string) {
        const workingDirectory = path.dirname(path.resolve(request.entrypoint));
        const requestedEntrypoint = path.normalize(path.resolve(request.entrypoint));
        const result = yield* mapBuildError(
          "produce-static-browser-application",
          esbuildService.build({
            entryPoints: [request.entrypoint],
            absWorkingDir: workingDirectory,
            bundle: true,
            platform: "browser",
            format: "esm",
            splitting: true,
            outdir: staging,
            entryNames: "assets/[name]-[hash]",
            chunkNames: "assets/chunk-[hash]",
            assetNames: "assets/[name]-[hash]",
            metafile: true,
            logLevel: "silent",
            write: false,
          }),
        );
        const outputByPortablePath = new Map<string, esbuild.OutputFile>();
        for (const output of result.outputFiles) {
          const relativePath = portablePath(path, staging, output.path);
          const problem = TreeSnapshot.validatePortablePath(relativePath);
          if (problem !== undefined) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `non-portable output path ${relativePath}: ${problem}`,
            });
          }
          outputByPortablePath.set(relativePath, output);
        }
        const metadataByPortablePath = new Map<string, esbuild.Metafile["outputs"][string]>();
        const metafileCandidates = (metafilePath: string): ReadonlySet<string> =>
          new Set(
            [path.resolve(metafilePath), path.resolve(workingDirectory, metafilePath)]
              .map((candidate) => portablePath(path, staging, candidate))
              .filter((candidate) => TreeSnapshot.validatePortablePath(candidate) === undefined),
          );
        for (const [outputPath, metadata] of Object.entries(result.metafile.outputs)) {
          // esbuild documents metafile paths relative to absWorkingDir, but on
          // macOS a realpath-spelled /private/var output can instead be emitted
          // relative to the process directory while OutputFile keeps /var.
          // Admit exactly one candidate that lands inside this private staging
          // tree; never guess between two valid spellings.
          const candidates = metafileCandidates(outputPath);
          if (candidates.size !== 1) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `metafile output path is outside staging or ambiguous: ${outputPath}`,
            });
          }
          const [relativePath] = candidates;
          if (relativePath === undefined || metadataByPortablePath.has(relativePath)) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `duplicate metafile output path ${relativePath ?? outputPath}`,
            });
          }
          metadataByPortablePath.set(relativePath, metadata);
        }
        if (metadataByPortablePath.size !== outputByPortablePath.size) {
          return yield* new PortableUnsupported({
            profile: StaticBrowserApplication.protocol,
            provider: identity.package,
            reason: "metafile and output file sets differ",
          });
        }
        const files: StaticBrowserApplication.ProducedFile[] = [];
        let entryModule: string | undefined;
        for (const [relativePath, output] of outputByPortablePath) {
          const metadata = metadataByPortablePath.get(relativePath);
          if (metadata === undefined) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `metadata is missing for ${relativePath}`,
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
          const outputPath = path.join(staging, ...relativePath.split("/"));
          yield* fileSystem.makeDirectory(path.dirname(outputPath), { recursive: true }).pipe(
            Effect.mapError((cause) => failed("make-browser-output-directory", cause)),
          );
          yield* fileSystem.writeFile(outputPath, output.contents, { flag: "wx" }).pipe(
            Effect.mapError((cause) => failed("write-browser-output", cause)),
          );
          if (metadata.imports.some(({ external }) => external)) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `external output edge in ${relativePath}`,
            });
          }
          const imports: string[] = [];
          for (const { path: imported } of metadata.imports) {
            const candidates = metafileCandidates(imported);
            if (candidates.size !== 1) {
              return yield* new PortableUnsupported({
                profile: StaticBrowserApplication.protocol,
                provider: identity.package,
                reason: `metafile import path is outside staging or ambiguous: ${imported}`,
              });
            }
            const [target] = candidates;
            if (target === undefined) {
              return yield* new PortableUnsupported({
                profile: StaticBrowserApplication.protocol,
                provider: identity.package,
                reason: `metafile import path is missing: ${imported}`,
              });
            }
            imports.push(target);
          }
          files.push(Object.freeze({ path: relativePath, mediaType, imports: Object.freeze(imports) }));
          if (
            metadata.entryPoint !== undefined
            && path.normalize(path.resolve(workingDirectory, metadata.entryPoint)) === requestedEntrypoint
          ) entryModule = relativePath;
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
