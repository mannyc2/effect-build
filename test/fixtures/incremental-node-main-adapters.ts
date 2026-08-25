import { Effect, FileSystem, Path } from "effect";
import type * as rolldown from "rolldown";
import * as EsbuildContextOwner from "../../packages/effect-build-esbuild/src/internal/ContextOwner.js";
import type { EsbuildFailed } from "../../packages/effect-build-esbuild/src/internal/error.js";
import * as RolldownBuildOwner from "../../packages/effect-build-rolldown/src/internal/BuildOwner.js";
import type { RolldownFailed } from "../../packages/effect-build-rolldown/src/internal/error.js";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import type * as Incremental from "../../packages/effect-build/src/Profile/internal/IncrementalNodeMain.js";

type AdapterRequirements = FileSystem.FileSystem | Path.Path;
type AdapterFailure<ProviderFailure> = ProviderFailure | NodeMain.PortableUnsupported | NodeMain.ProviderFailed;

const failed = (provider: string, operation: string, cause: unknown): NodeMain.ProviderFailed =>
  new NodeMain.ProviderFailed({ provider, operation, cause });

const canonicalBuiltins = (
  provider: string,
  retained: readonly string[],
): Effect.Effect<readonly string[], NodeMain.PortableUnsupported> => {
  const unsupported = retained.find((path) => !path.startsWith("node:"));
  if (unsupported !== undefined) {
    return Effect.fail(
      new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: `unbundled non-builtin runtime load ${unsupported}`,
      }),
    );
  }
  const canonical = [...new Set(retained)].sort((left, right) => left.localeCompare(right));
  return canonical.length === retained.length
    ? Effect.succeed(Object.freeze(canonical))
    : Effect.fail(
      new NodeMain.PortableUnsupported({
        profile: NodeMain.profile,
        provider,
        reason: "provider reported duplicate runtime loads",
      }),
    );
};

const writeMain = (
  provider: string,
  format: NodeMain.Format,
  ownedRoot: Artifact.AbsolutePath,
  contents: Uint8Array,
): Effect.Effect<string, NodeMain.ProviderFailed, AdapterRequirements> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const output = path.join(ownedRoot, format === "module" ? "main.mjs" : "main.cjs");
    yield* fileSystem.writeFile(output, contents).pipe(
      Effect.mapError((cause) => failed(provider, "write-incremental-main", cause)),
    );
    return output;
  });

/** Repository-private exact esbuild adapter; not a package export or support claim. */
export const openEsbuild = (
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
): Effect.Effect<Incremental.ProducerDriver<AdapterFailure<EsbuildFailed>, AdapterRequirements>, EsbuildFailed> =>
  Effect.map(
    EsbuildContextOwner.open({
      entryPoints: [program.entrypoint],
      bundle: true,
      platform: "node",
      format: program.format === "module" ? "esm" : "cjs",
      outfile: program.format === "module" ? "effect-build-incremental-main.mjs" : "effect-build-incremental-main.cjs",
      metafile: true,
      logLevel: "silent",
      sourcemap: false,
      splitting: false,
      write: false,
    }),
    ({ owner, release }) => ({
      rebuild: (revision: Incremental.SourceRevision, ownedRoot: Artifact.AbsolutePath) =>
        Effect.gen(function*() {
          const result = yield* owner.rebuild;
          if (result.outputFiles.length !== 1) {
            return yield* new NodeMain.PortableUnsupported({
              profile: NodeMain.profile,
              provider: "effect-build-esbuild",
              reason: `expected one esbuild output, observed ${result.outputFiles.length}`,
            });
          }
          const metadata = Object.values(result.metafile.outputs).find(({ entryPoint }) => entryPoint !== undefined);
          if (metadata === undefined) {
            return yield* new NodeMain.PortableUnsupported({
              profile: NodeMain.profile,
              provider: "effect-build-esbuild",
              reason: "esbuild returned no entry output metadata",
            });
          }
          const builtins = yield* canonicalBuiltins(
            "effect-build-esbuild",
            metadata.imports.filter(({ external }) => external).map(({ path }) => path),
          );
          const path = yield* writeMain(
            "effect-build-esbuild",
            program.format,
            ownedRoot,
            result.outputFiles[0]!.contents,
          );
          return Object.freeze({
            protocol: NodeMain.producedProtocol,
            agreementId: offer.agreementId,
            format: program.format,
            path,
            builtins,
            sideOutputs: Object.freeze([] as const),
            producer: Object.freeze({
              package: "effect-build-esbuild",
              version: "0.5.0",
              engine: "esbuild",
              engineVersion: "0.28.2",
            }),
            evidence: Object.freeze(
              [{
                source: "esbuild-context-metafile",
                sourceSequence: revision.sequence,
                sourceDigest: revision.digest.value,
              }] as const,
            ),
          });
        }),
      release,
    }),
  );

/** Repository-private exact Rolldown adapter; independent of package admission. */
export const openRolldown = (
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
): Effect.Effect<Incremental.ProducerDriver<AdapterFailure<RolldownFailed>, AdapterRequirements>, RolldownFailed> =>
  Effect.map(
    RolldownBuildOwner.open({ input: program.entrypoint, platform: "node" }),
    ({ owner, release }) => ({
      rebuild: (revision: Incremental.SourceRevision, ownedRoot: Artifact.AbsolutePath) =>
        Effect.gen(function*() {
          const result = yield* owner.generate({
            format: program.format === "module" ? "esm" : "cjs",
            sourcemap: false,
          });
          const chunks = result.output.filter((item): item is rolldown.OutputChunk => item.type === "chunk");
          if (chunks.length !== 1 || result.output.length !== 1) {
            return yield* new NodeMain.PortableUnsupported({
              profile: NodeMain.profile,
              provider: "effect-build-rolldown",
              reason: `expected one Rolldown chunk, observed ${result.output.length} outputs`,
            });
          }
          const chunk = chunks[0]!;
          const builtins = yield* canonicalBuiltins(
            "effect-build-rolldown",
            [...chunk.imports, ...chunk.dynamicImports],
          );
          const path = yield* writeMain(
            "effect-build-rolldown",
            program.format,
            ownedRoot,
            new TextEncoder().encode(chunk.code),
          );
          return Object.freeze({
            protocol: NodeMain.producedProtocol,
            agreementId: offer.agreementId,
            format: program.format,
            path,
            builtins,
            sideOutputs: Object.freeze([] as const),
            producer: Object.freeze({
              package: "effect-build-rolldown",
              version: "0.5.0",
              engine: "rolldown",
              engineVersion: "1.2.5",
            }),
            evidence: Object.freeze(
              [{
                source: "rolldown-build-generate-output-graph",
                sourceSequence: revision.sequence,
                sourceDigest: revision.digest.value,
              }] as const,
            ),
          });
        }),
      release,
    }),
  );
