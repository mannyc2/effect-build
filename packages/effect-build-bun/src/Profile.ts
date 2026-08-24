import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import * as NodeMain from "effect-build/Author/NodeMain";
import * as Tool from "effect-build/Author/Tool";
import * as TreeSnapshot from "effect-build/Author/TreeSnapshot";
import { PortableUnsupported, ProviderFailed } from "effect-build/BuildError";
import * as StaticBrowserApplication from "effect-build/Profile/StaticBrowserApplication";
import { ChildProcessSpawner } from "effect/unstable/process";
import { toPlatformMetadataPath } from "./internal/MetadataPath.js";

export interface LayerOptions {
  /** Explicit Bun 1.3.14 executable; otherwise one deterministic PATH search. */
  readonly executable?: string;
}

interface MetafileImport {
  readonly path: string;
  readonly external?: boolean;
}

interface MetafileInput {
  readonly imports?: readonly MetafileImport[];
}

interface MetafileOutput {
  readonly entryPoint?: string;
  readonly imports?: readonly MetafileImport[];
}

interface Metafile {
  readonly inputs: Readonly<Record<string, MetafileInput>>;
  readonly outputs: Readonly<Record<string, MetafileOutput>>;
}

const failed = (operation: string, cause: unknown): ProviderFailed =>
  new ProviderFailed({ provider: "effect-build-bun", operation, cause });

const parseMetafile = (bytes: Uint8Array, source: string): Effect.Effect<Metafile, ProviderFailed> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Metafile>;
      if (typeof parsed.inputs !== "object" || parsed.inputs === null) throw new Error("inputs are missing");
      if (typeof parsed.outputs !== "object" || parsed.outputs === null) throw new Error("outputs are missing");
      return parsed as Metafile;
    },
    catch: (cause) => failed(`decode-metafile:${source}`, cause),
  });

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

const makeServices = (options?: LayerOptions) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const selected = yield* Tool.select({
      name: "bun",
      executable: options?.executable,
      versionArgs: ["--version"],
    });
    if (selected.version !== "1.3.14") {
      return yield* new PortableUnsupported({
        profile: `${NodeMain.profile}|${StaticBrowserApplication.protocol}`,
        provider: "effect-build-bun",
        reason: `portable profiles require exact Bun 1.3.14, observed ${selected.version}`,
      });
    }
    const identity: NodeMain.ProviderIdentity = Object.freeze({
      package: "effect-build-bun",
      version: "0.5.0",
      engine: "bun",
      engineVersion: selected.version,
    });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(Crypto.Crypto, crypto),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const nodeProduce = Effect.fn("effect-build-bun/Profile.produceNodeMain")(
      function*(request: NodeMain.Request, staging: string) {
        return yield* Effect.scoped(Effect.gen(function*() {
          const outfile = path.join(staging, request.format === "module" ? "main.mjs" : "main.cjs");
          const metafilePath = yield* fileSystem.makeTempFileScoped({ prefix: "effect-build-bun-node-main-" }).pipe(
            Effect.mapError((cause) => failed("allocate-node-metafile", cause)),
          );
          yield* Tool.runOrFailSelected({
            selected,
            args: [
              "build",
              "--target=node",
              `--format=${request.format === "module" ? "esm" : "cjs"}`,
              `--outfile=${outfile}`,
              `--metafile=${metafilePath}`,
              request.entrypoint,
            ],
          }).pipe(Effect.mapError((cause) => failed("produce-node-main", cause)));
          const metadata = yield* fileSystem.readFile(metafilePath).pipe(
            Effect.mapError((cause) => failed("read-node-metafile", cause)),
            Effect.flatMap((bytes) => parseMetafile(bytes, metafilePath)),
          );
          const inputKeys = Object.keys(metadata.inputs);
          const inputs = inputKeys.length === 1 ? [request.entrypoint] : inputKeys;
          const output = Object.values(metadata.outputs).find(({ entryPoint }) => entryPoint !== undefined);
          const runtimeImports = output?.imports?.filter(({ external }) => external !== false).map(({ path }) => path)
            ?? [];
          return Object.freeze({
            protocol: NodeMain.producedProtocol,
            format: request.format,
            path: outfile,
            inputs: Object.freeze(inputs),
            runtimeImports: Object.freeze(runtimeImports),
          });
        })).pipe(Effect.provide(services));
      },
    );

    const browserProduce = Effect.fn("effect-build-bun/Profile.produceStaticBrowserApplication")(
      function*(request: StaticBrowserApplication.Request, staging: string) {
        const requestedEntrypoint = yield* fileSystem.realPath(request.entrypoint).pipe(
          Effect.mapError((cause) => failed("resolve-browser-entrypoint", cause)),
        );
        return yield* Effect.scoped(Effect.gen(function*() {
          const metafilePath = yield* fileSystem.makeTempFileScoped({ prefix: "effect-build-bun-browser-" }).pipe(
            Effect.mapError((cause) => failed("allocate-browser-metafile", cause)),
          );
          yield* Tool.runOrFailSelected({
            selected,
            args: [
              "build",
              `--outdir=${staging}`,
              "--target=browser",
              "--format=esm",
              "--splitting",
              "--entry-naming=assets/[name]-[hash].[ext]",
              "--chunk-naming=assets/chunk-[hash].[ext]",
              "--asset-naming=assets/[name]-[hash].[ext]",
              `--metafile=${metafilePath}`,
              request.entrypoint,
            ],
          }).pipe(Effect.mapError((cause) => failed("produce-static-browser-application", cause)));
          const metadata = yield* fileSystem.readFile(metafilePath).pipe(
            Effect.mapError((cause) => failed("read-browser-metafile", cause)),
            Effect.flatMap((bytes) => parseMetafile(bytes, metafilePath)),
          );
          const snapshot = yield* TreeSnapshot.observe(staging).pipe(
            Effect.mapError((cause) => failed("observe-browser-output", cause)),
          );
          const outputEntries = Object.entries(metadata.outputs);
          const relativeByMetadataPath = new Map<string, string>();
          for (const [metadataPath] of outputEntries) {
            const normalized = metadataPath.split("\\").join("/");
            const matches = snapshot.files.filter(({ relativePath }) =>
              normalized === relativePath || normalized.endsWith(`/${relativePath}`)
            );
            if (matches.length !== 1) {
              return yield* new PortableUnsupported({
                profile: StaticBrowserApplication.protocol,
                provider: identity.package,
                reason: `unable to bind metadata output ${metadataPath}`,
              });
            }
            relativeByMetadataPath.set(metadataPath, matches[0]!.relativePath);
          }
          const files: StaticBrowserApplication.ProducedFile[] = [];
          let entryModule: string | undefined;
          for (const [metadataPath, output] of outputEntries) {
            const relativePath = relativeByMetadataPath.get(metadataPath)!;
            const mediaType = mediaTypeOf(relativePath);
            if (mediaType === undefined) {
              return yield* new PortableUnsupported({
                profile: StaticBrowserApplication.protocol,
                provider: identity.package,
                reason: `unknown media type for ${relativePath}`,
              });
            }
            const imports: string[] = [];
            for (const imported of output.imports ?? []) {
              if (imported.external === true) {
                return yield* new PortableUnsupported({
                  profile: StaticBrowserApplication.protocol,
                  provider: identity.package,
                  reason: `external output edge in ${relativePath}: ${imported.path}`,
                });
              }
              const importedMetadataPath = [...relativeByMetadataPath.keys()].find((candidate) => {
                const resolved = path.normalize(path.resolve(path.dirname(metadataPath), imported.path));
                return path.normalize(path.resolve(candidate)) === resolved || candidate === imported.path;
              });
              if (importedMetadataPath === undefined) {
                return yield* new PortableUnsupported({
                  profile: StaticBrowserApplication.protocol,
                  provider: identity.package,
                  reason: `unknown output edge in ${relativePath}: ${imported.path}`,
                });
              }
              imports.push(relativeByMetadataPath.get(importedMetadataPath)!);
            }
            files.push(Object.freeze({ path: relativePath, mediaType, imports: Object.freeze(imports) }));
            if (output.entryPoint !== undefined) {
              const metadataEntrypoint = toPlatformMetadataPath(path, output.entryPoint);
              const observedEntrypoint = yield* fileSystem.realPath(metadataEntrypoint).pipe(
                Effect.mapError((cause) =>
                  failed(
                    `resolve-browser-metadata-entrypoint(${JSON.stringify(output.entryPoint)}=>${
                      JSON.stringify(metadataEntrypoint)
                    })`,
                    cause,
                  )
                ),
              );
              if (path.normalize(observedEntrypoint) === path.normalize(requestedEntrypoint)) {
                entryModule = relativePath;
              }
            }
          }
          if (entryModule === undefined) {
            return yield* new PortableUnsupported({
              profile: StaticBrowserApplication.protocol,
              provider: identity.package,
              reason: `no authoritative entry module among ${
                outputEntries.map(([, output]) => output.entryPoint ?? "<none>").join(", ")
              }`,
            });
          }
          files.sort((left, right) => TreeSnapshot.comparePortablePaths(left.path, right.path));
          return Object.freeze({
            protocol: StaticBrowserApplication.producedProtocol,
            entryModule,
            files: Object.freeze(files),
          });
        })).pipe(Effect.provide(services));
      },
    );

    return Context.make(NodeMain.Producer, { identity, produce: (request, staging) => nodeProduce(request, staging) })
      .pipe(
        Context.add(StaticBrowserApplication.Provider, {
          identity,
          produce: (request, staging) => browserProduce(request, staging),
        }),
      );
  });

/** One explicit exact-Bun provider Layer for both closed portable profiles. */
export const layer = (options?: LayerOptions) => Layer.effectContext(makeServices(options));
