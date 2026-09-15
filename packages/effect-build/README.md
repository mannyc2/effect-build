# effect-build

Effect programs for artifacts, targets, executable inspection, tool resolution, atomic commits,
and checksums. This is the core every effect-build provider builds on, and everything you need to
wrap a tool of your own. The [repository README](https://github.com/mannyc2/effect-build#readme)
shows how the providers fit together.

```sh
npm install --save-dev --save-exact effect-build@0.8.0 effect@4.0.0-rc.115 @effect/platform-node@4.0.0-rc.115 @effect/platform-node-shared@4.0.0-rc.115
```

```ts
import { Effect } from "effect";
import { Artifact, Checksums, Commit, Executable, Layout, Target, Tool } from "effect-build";
```

Each module is also a subpath export (`effect-build/Artifact`, `effect-build/Tool`, and so on).
Effects that access files or run tools need platform services: `NodeServices.layer` from `@effect/platform-node` or
`BunServices.layer` from `@effect/platform-bun`.

## Artifact

An artifact is a record of a file on disk. There are three kinds and every provider returns one
of them:

| Kind                  | Fields                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Artifact.File`       | `kind: "file"`, `path`, `bytes`, `producedBy`                                                                       |
| `Artifact.Executable` | the same plus `target` (read from the header) and `format` (`elf`, `mach-o`, `pe`)                                  |
| `Artifact.Directory`  | the same plus `rootMode` and `entries`: every file, directory, and symlink with `path`, `mode`, and for files `bytes` |

`bytes` is a number. These base records contain metadata without content digests: file observation
uses filesystem metadata, executable observation also reads the header, and directory observation
lists members and records their metadata. Symlinks are recorded, never followed. `producedBy`
names the producer (`name`, `version`) and may include a tool's `path` and an explicitly recorded
`sha256`. `Artifact.Regular` is `File | Executable`, the kinds backed by one regular file, and
`Artifact.isRegular` narrows to it.

```ts
const inputs = Effect.gen(function*() {
  const executable = yield* Artifact.executable(
    "target/release/tool",
    { name: "cargo", version: "1.85.0" },
    "linux-x64",
  );
  const notes = yield* Artifact.file("CHANGELOG.md", { name: "release", version: "1.0.0" });
  const tree = yield* Artifact.directory("dist", { name: "release", version: "1.0.0" });
  return [executable, notes, tree];
});
```

Hashing is an explicit Effect step:

```ts
const identified = Artifact.file("CHANGELOG.md", { name: "release", version: "1.0.0" }).pipe(
  Effect.flatMap(Artifact.withSha256),
);
// Effect<Artifact.HashedFile, ...>
```

`Artifact.HashedFile`, `Artifact.HashedExecutable`, and `Artifact.HashedDirectory` are required-field
schema refinements of the base records. They add `Artifact.Sha256`, a branded lowercase hex digest.
A hashed directory also has `HashedEntry` records: file members carry digests, and the root digest
hashes the sorted manifest, including modes and symlink targets. `HashedArtifact` is their union;
`HashedRegular` is `HashedFile | HashedExecutable`.

`withSha256` reads current bytes, refreshes filesystem metadata, and retains extra provider fields.
Its `WithSha256<A>` result widens refreshed core fields rather than retaining stale literal or nested
refinements. Compose these schemas with Effect's struct fields for application metadata. Decoding a
digest validates its representation; it does not establish that a file still matches it.

| Function                                  | Purpose                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file(path, producedBy)`                  | Record a regular file's metadata without reading its contents.                                                                                                                              |
| `executable(path, producedBy, expected?)` | Record a native executable, reading its header; fail with `ExecutableTargetMismatch` if it is not `expected`.                                                                                 |
| `directory(root, producedBy)`             | Record a tree's members and metadata without reading file contents.                                                                                                                          |
| `withSha256(artifact)`                    | Read current contents and add required SHA-256 identity; directories hash every file and the sorted manifest.                                                                                |
| `stream(artifact)`, `copy(artifact, destination)` | Stream or copy current regular-file bytes without requiring a digest.                                                                                                                |
| `verify(artifact)`                        | Require a `HashedArtifact`; re-read and fail with `ArtifactError` (`changed`) if it differs from the record.                                                                                   |
| `readVerified(artifact)`                  | Require a `HashedRegular`; return verified bytes, bounded to the recorded size.                                                                                                               |
| `streamVerified(artifact)`                | Require a `HashedRegular`; stream in 64 KiB chunks and fail at the end if bytes changed, so consume it inside staged output.                                                                   |
| `copyVerified(artifact, destination)`     | Require a `HashedRegular`; copy through `streamVerified` and remove incomplete output on failure.                                                                                             |
| `sha256(bytes)`                           | Hex SHA-256 of a buffer.                                                                                                                                                                      |
| `encode(artifacts)`, `decode(json)`       | Project base artifacts to plain JSON and validate them back. Digest and provider refinements are omitted; persist those with the corresponding hashed or provider schema.                    |

The base, hashed, and producer records are Effect schemas as well as types. Schema decoding never
performs filesystem I/O.

## Layout

`Layout.validate(entries)` checks relative shipping paths with `file`, `directory`, or `symlink`
roles. It returns `{ path, reason }` on failure or `undefined` on success. Every explicit or
implicit directory must have one spelling under NFC normalization and case folding, and only
directories may have descendants. `Layout.pathIssue(path)` checks one normalized relative path.
Archives, wheels and app resources use this check; `Artifact.directory` still records the names
present on the local filesystem. Format-specific requirements stay with each provider.

## Target

Eight targets, named the way Node and Bun name them: `linux-x64`, `linux-x64-musl`, `linux-arm64`,
`linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`. Linux without a
suffix means glibc. `Target.all` lists them, `Target.Target` is their schema, and
`Target.parts(target)` splits one into `os`, `arch`, `abi` (`gnu`, `musl`, or `undefined`),
`format`, and `executableSuffix` (`""` or `".exe"`). `Target.host()` returns the host's target when
the OS, architecture, and (on Linux) libc are established, and `undefined` otherwise.

`Artifact.ioError(path, "read" | "write")` maps a filesystem failure while retaining its
native detail. Reads distinguish `not-found` from `unreadable`; writes report `unwritable`.

## Executable

Header facts for ELF, Mach-O, and PE files, without loading or running them.

| Function                                | Purpose                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `inspect(path)`                         | Read `format`, `os`, `arch`, and for ELF the `abi` (undefined for static binaries) from a file, reading at most 16 MiB of metadata. |
| `parse(bytes)`                          | The same from a buffer.                                                                                                             |
| `matches(facts, target)`                | Whether the facts are consistent with a target. A static Linux binary matches both gnu and musl.                                    |
| `resolveTarget(path, facts, expected?)` | The target the facts describe; static Linux binaries default to glibc unless `expected` says musl.                                  |
| `expectTarget(target)`                  | A combinator for `Effect<Artifact.Executable>`: re-read the header and fail unless it is `target`. Use after signing or stripping.  |

Universal (fat) Mach-O files are rejected as `ambiguous-fat-binary`.

## Tool

An external executable, resolved once and used many times.

```ts
const compress = (executable: Artifact.Executable, outfile: string) =>
  Effect.gen(function*() {
    const upx = yield* Tool.resolve({
      name: "upx",
      executable: process.env.UPX,
      parseVersion: (probe) => /upx (\d+\.\d+\.\d+)/u.exec(new TextDecoder().decode(probe.stdout))?.[1],
    }).pipe(Tool.requireVersion(">=4.0.0"));
    return yield* Commit.output(outfile, (staged) =>
      Tool.run(upx, ["--best", "-o", staged, executable.path]).pipe(
        Effect.andThen(Artifact.executable(staged, Tool.producedBy(upx), executable.target)),
      ));
  });
```

| Function                                                      | Purpose                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `locate({ name, executable? })`                               | Find the binary without probing it: the explicit path, or the first runnable match on `PATH`, with symlinks resolved. Inspection failures retain their native detail as `Tool.ProbeFailed`.                                                                                        |
| `resolve({ name, executable?, versionArgs?, parseVersion? })` | Locate, record metadata, and probe once; returns `Tool.Resolved` with `name`, `path`, `version`, `bytes`. The default probe is `--version` and the default parser takes the first token of stdout.           |
| `withSha256(tool)`                                            | Explicitly read the executable's current bytes and add a branded digest, refreshing `path` and `bytes` while retaining other tool fields.                                                                   |
| `run(tool, args, options?)`                                   | Run it; `options` are `cwd`, `env`, `extendEnv`, `outputLimit` (8 MiB per stream by default), `stdoutLimit` (`null` to keep all stdout as data), `onOutput` for live chunks, and `redact` for secrets in failure diagnostics. Failure keeps both streams. |
| `parseVersion(text)`, `satisfies(range)`                      | Canonical `x.y.z` parsing and npm semver matching; invalid ranges never match.                                                                                                                               |
| `requireVersion(rangeOrPredicate)`                            | A combinator for `Effect<Tool.Resolved>`; fails with `ToolVersionUnsupported`.                                                                                                                               |
| `producedBy(tool)`                                            | The `producedBy` record for artifacts a tool made; includes a digest only when the tool has one.                                                                                                             |

Every option accepts `undefined`, so callers forward their own optional inputs without spreading.

## Commit

Staged, atomic output for anything that writes files.

```ts
const release = Commit.atomic("dist", (staged) => produceRelease(staged), { staging: "sibling" });
const compressed = Commit.output(outfile, (path) => compressInto(path), { atomic, onExists, prefix });
```

- `atomic(outfile, produce, { onExists?, prefix?, staging? })` creates a staging directory next
  to `outfile`, calls `produce` with the staged path, and renames the result into place. Checks
  inside `produce` finish before the rename. `staging: "nested"` (default) hands `produce` a path
  that does not exist yet, under `<staging>/<basename>`, so tools that embed the output name see
  the final one; `staging: "sibling"` hands it an existing 0755 directory at the final depth, so
  relative imports, source maps, and checksum paths stay valid.
- `output(outfile, produce, options?, staging?)` is what every producer calls with its
  `Commit.ProducerOptions` (`atomic`, `onExists`, `prefix`). With `atomic: false` it creates the
  parent and lets `produce` write the final path; a sibling-staged directory starts empty.
- File replacement is one rename. Directory replacement moves the old tree aside and restores it
  if the new rename fails; `CommitError.recoveryPath` names a retained tree when recovery itself
  fails. `onExists: "fail"` uses exclusive hard-link creation for files and is unsupported for
  directories.

The [errors reference](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md#atomic-output)
lists every `CommitError` reason.

## Checksums

`Checksums.write({ artifacts, outfile })` requires `Artifact.HashedRegular[]` and writes a
`sha256sum -c` compatible listing, returning an ordinary `Artifact.File`. Add input digests with
`Effect.flatMap(Artifact.withSha256)` before writing. `Checksums.verify(file)` reads an ordinary
listing and hashes each listed file against its recorded digest; the listing does not need a hash
of its own. Paths are relative to the checksum file's directory, so a release tree can move
without rewriting it:

```sh
(cd dist && sha256sum -c SHA256SUMS)
```

## Links

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) ·
[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) ·
[Design](https://github.com/mannyc2/effect-build/blob/main/DESIGN.md)

`Tool.provider(Service, spec)` is the shared binary-provider factory. `Cache.cached` adds
declared-input caching with Effect `KeyValueStore` and streamed object storage; pass a codec
for precise artifact or provider types. Cache inputs require hashed identities; tool identity is
name/version plus an optional hash. Cache v2 hashes output internally and stores that identity
separately, so ordinary and refined output records retain their declared shape on hits and misses.
The `effect-build/testing` subpath provides the
scripted spawner, real-file fixtures and conformance suite. Its path fixtures use the optional
`@effect/platform-node` peer. See [cache semantics](../../docs/cache.md) and
[provider recipes](../../docs/recipes.md#test-a-provider).
