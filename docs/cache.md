# Cache

`Cache.cached` restores an artifact from declared inputs or runs the producer and stores its
output. The index is Effect's `KeyValueStore`; bytes live in the directory provided by
`Cache.objects`. Provide both once around a build. Use dedicated cache resources, outside
both the source input tree and output tree.

```ts
import { Effect } from "effect";
import { KeyValueStore } from "effect/unstable/persistence";
import { Artifact, Cache, Tool } from "effect-build";
import * as Bun from "effect-build-bun";

const build = Effect.gen(function*() {
  const source = yield* Artifact.directory("src", { name: "source", version: "1" }).pipe(
    Effect.flatMap(Artifact.withSha256),
  );
  const tool = yield* Bun.resolved.pipe(Effect.flatMap(Tool.withSha256));
  const input = { entrypoints: ["src/cli.ts"], target: "linux-x64" as const, outfile: "dist/cli" };
  return yield* Bun.compile(input).pipe(Cache.cached({
    key: { operation: "Bun.compile", tool, inputs: [source], options: { entrypoints: input.entrypoints, target: input.target } },
    outfile: input.outfile,
    schema: Artifact.Executable,
  }));
}).pipe(
  Effect.provide(Cache.objects(".effect-build/cache/objects")),
  Effect.provide(KeyValueStore.layerFileSystem(".effect-build/cache/keys")),
);
// Provide Bun.layer() and your platform services around build.
```

## What a key means

`Cache.key` hashes the operation, tool name/version and optional hash, ordered input artifact kinds and
hashes, executable targets, directory root modes, canonical options, host target, and format
version. Tool and artifact paths do not contribute. The key and its encoded components are
stored beside each result, so the index is inspectable. Inputs must be `Artifact.HashedArtifact`
records: add identity explicitly with `Artifact.withSha256`. Downstream keys use output hashes:
a rebuilt executable with unchanged bytes leaves an archive's key unchanged.

Tool name/version is a valid declared identity, including for an in-process implementation.
The example explicitly adds the resolved Bun binary's digest with `Tool.withSha256`; it becomes
part of the key when present. `Tool.resolve` itself only records metadata and probes the version.
Hashing a tool does not lock its executable against subsequent changes.

Declare the complete input closure. A source directory alone is enough only for programs
that read nothing else. Add lockfiles, configuration, dependencies, assets, tool runtimes,
and any environment values affecting the result. `Archive.source` records a committed Git
tree; it does not include uncommitted work, dependencies outside that tree, or ambient config.
Files must stay unchanged while the producer reads them.

Inherited environment, cwd, network responses, clock, and host services remain undeclared
unless you account for them. Operations expose `env`, `extendEnv`, and opt-in `scrubEnv`;
scrubbing is not a sandbox. Include path-sensitive options when paths change bytes: Deno's
output basename, relative bundle imports and source maps, for example. Include a revision in
`options` when the operation's implementation or defaults change. A cached producer is not
run on a hit, including its validation and remote side effects. Never input-cache notarization,
timestamped signing, or another operation whose fresh side effect is required.

Options are plain JSON data: sorted object keys, omitted undefined object values, ordered
dense arrays. Functions, symbols, bigint, accessors, cycles, sparse/undefined array elements,
non-finite numbers, and class instances are rejected as `InputInvalid`. Values such as Maps
and Dates must be explicitly converted to JSON data. Key components are stored as plaintext;
use fingerprints of secret inputs in keys instead of credentials themselves.

## Records and bytes

Caching opts into hashing and verifying stored output. Without `schema`, the result type is the
ordinary `Artifact.Artifact` union; caching does not add a digest field to that public result. Supply
`Artifact.File`, `Artifact.Executable`, or `Artifact.Directory` for a precise kind; supply
a provider schema such as `Apple.SignedApp` for a refined record. A producer that explicitly returns
a hashed record can use `Artifact.HashedFile`, `Artifact.HashedExecutable`, or
`Artifact.HashedDirectory`. The same codec encodes
misses and decodes hits, and codec services remain in the Effect environment. Core validation
always checks the artifact metadata before using paths or manifests. Provider-local paths in
extra fields remain the provider codec's responsibility; only the artifact's root `path` is
relocated.

The v3 index stores the caller's encoded record once, plus its root digest and, for directories,
a map of file digests. Paths, sizes, targets, modes, and producer metadata belong to the record.
The cache computes digests while ingesting output and reconstructs hashed records when decoding a
hit. Provider refinements and codec transformations survive either path.
Schema validation establishes valid metadata; it does not read or verify current file contents.

Files are streamed into private staging while their bytes are hashed, then atomically renamed
to the completed digest's object name. Ingestion makes one full pass over each file; it does not
hash the source first or reread the stored object afterward.
Directories store each file object once; their sorted manifest retains modes, empty directories
and symlinks. Regular file modes are retained in the index.

Atomic hits verify object bytes while copying directly into `Commit.output` staging, then publish
the completed output. They make one full read of each object. With `atomic: false`, a hit first
copies and verifies into private scratch, then copies into the destination: two full reads keep
cache corruption from touching an existing output. Neither path rereads completed copies for
another hash. Executable header checks still establish the recorded target.

Both paths honor `onExists` and `prefix`. The returned record keeps its original `producedBy`
and declared schema, and objects are never hardlinked to mutable output. Directory members are
created exclusively, so names that alias on the destination filesystem fail instead of overwriting.

The producer's output path must equal `outfile` after resolution. A mismatch is an
`InputInvalid` on a miss. Supply the same commit options to the producer and combinator so
hits and misses have the same destination behavior. Atomic directory `onExists: "fail"`
retains Commit's `directory-no-replace-unsupported` error.

## Failures and concurrency

Missing objects, corrupt bytes, undecodable entries, index read failures and failed cache
preparation cause a miss. Ingest failure logs a warning and returns the successful build.
Destination errors and commit failures remain typed failures; invalid cache inputs remain
`InputInvalid`. Interruptions remain interruptions, including during ingest. Failure to
construct a caller-provided storage layer is outside the combinator's recovery boundary.

Concurrent misses may both build. Object writers use separate staging and atomic replacement;
index writers are last-writer-wins. Declared inputs do not guarantee reproducibility: concurrent
producers can return different output hashes, and the last complete index value wins.
A torn filesystem index value decodes as a miss. No lock, remote sharing, pruning, TTL,
dependency inference, expected-output mode or sandbox is provided.

`Cache.clear` clears the dedicated index and removes the object directory. Do it while builds
are stopped. Format changes use a new key prefix; incompatible metadata decodes as a miss.
Tests can provide `TestCache.layer` from `effect-build/testing` for scoped temporary objects
and an in-memory index. Whole-file storage is deliberate in 0.8; object chunking and miss
explanations can be added independently of the caller's declared-input contract.

## Producer input inventory

The 0.8 source audit keeps provider-native inputs. No signature change derives a complete key.

| Operations | Inputs still needing declaration | Directory-input verdict |
| --- | --- | --- |
| Bun compile/bundle; Deno compile/bundle/transpile | Entrypoint paths, imports, config, includes, assets, package closure and runtime | Future directory plus relative entrypoint is useful; closure remains explicit. |
| esbuild/Rolldown buildToDirectory | Native options, path or stdin, plugin inputs | Keep native options; a directory cannot describe plugin dependencies. |
| Archive zip/tarGz; Python wheel; Checksums write | Artifact entries and format metadata | Already artifact-based. |
| Archive source | Repository, fixed Git tree, attributes, filters and local config | Keep the fixed tree identity. |
| Node SEA assemble | Main/assets, tool and base executable | Artifact-based; hash declared file inputs explicitly and choose the tool identity. |
| nFPM package | Artifact contents, native config, script paths and env substitutions | Keep native config; declare auxiliary files. |
| Python build | Project, backend, env and build dependency closure | A future directory input helps; current wheel/sdist composite needs an artifact adapter to cache. |
| SBOM generate | Source/subject artifact, cataloger/config/env | Already artifact-based; declare cataloger dependencies. |
| Apple appBundle/dmg/pkg/sign/staple | Product/resource/layout/entitlement artifacts, keychain or accepted reference | Already artifact-based; remote-derived signing needs fresh side effects. |
| Windows sign | Artifact, PFX/library/metadata paths or certificate store, timestamp service | Declare local auxiliary files; do not input-cache remote signing. |
