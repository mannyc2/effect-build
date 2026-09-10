# effect-build

Effect programs for artifacts, targets, executable inspection, tool resolution, atomic commits,
and checksums. This is the core every effect-build provider builds on, and everything you need to
wrap a tool of your own. The [repository README](https://github.com/mannyc2/effect-build#readme)
shows how the providers fit together.

```sh
npm install --save-dev --save-exact effect-build@0.7.0 effect@4.0.0-rc.108 @effect/platform-node@4.0.0-rc.108 @effect/platform-node-shared@4.0.0-rc.108
```

```ts
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
| `Artifact.File`       | `kind: "file"`, `path`, `bytes`, `sha256`, `producedBy`                                                             |
| `Artifact.Executable` | the same plus `target` (read from the header) and `format` (`elf`, `mach-o`, `pe`)                                  |
| `Artifact.Directory`  | the same plus `entries`: every file, directory, and symlink with `path`, `mode`, and for files `bytes` and `sha256` |

`bytes` is a number and `sha256` is always present. A directory's `sha256` hashes its sorted entry
manifest, so it changes when a mode changes or a symlink is retargeted; symlinks are recorded,
never followed. `producedBy` names the producer (`name`, `version`) and, for external tools, the
tool's `path` and `sha256`. `Artifact.Regular` is `File | Executable`, the kinds backed by one
regular file, and `Artifact.isRegular` narrows to it.

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

| Function                                  | Purpose                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file(path, producedBy)`                  | Record a regular file.                                                                                                                                                                        |
| `executable(path, producedBy, expected?)` | Record a native executable, reading its header; fail with `ExecutableTargetMismatch` if it is not `expected`.                                                                                 |
| `directory(root, producedBy)`             | Record a tree.                                                                                                                                                                                |
| `verify(artifact)`                        | Re-read the artifact and fail with `ArtifactError` (`changed`) if it differs from the record.                                                                                                 |
| `readVerified(artifact)`                  | Return a regular file's bytes, bounded to the recorded size.                                                                                                                                  |
| `streamVerified(artifact)`                | Stream a regular file's bytes in 64 KiB chunks; the stream fails at the end if the bytes changed, so consume it inside staged output.                                                         |
| `copyVerified(artifact, destination)`     | Copy through `streamVerified`, so the destination holds exactly the recorded bytes or nothing.                                                                                                |
| `sha256(bytes)`                           | Hex SHA-256 of a buffer.                                                                                                                                                                      |
| `encode(artifacts)`, `decode(json)`       | Project a list of core artifacts to plain JSON and validate one back. Provider refinements (signatures, product types, notary tickets) are omitted; persist those with the provider's schema. |

`Artifact.File`, `Artifact.Executable`, `Artifact.Directory`, and `Artifact.Producer` are Effect
schemas as well as types.

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
        Effect.andThen(Artifact.executable(staged, Tool.producer(upx), executable.target)),
      ));
  });
```

| Function                                                      | Purpose                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `locate({ name, executable? })`                               | Find the binary without probing it: the explicit path, or the first runnable match on `PATH`, with symlinks resolved. Inspection failures retain their native detail as `Tool.ProbeFailed`.                                                                                        |
| `resolve({ name, executable?, versionArgs?, parseVersion? })` | Locate, hash, and probe once; returns `Tool.Resolved` with `name`, `path`, `version`, `bytes`, `sha256`. The default probe is `--version` and the default parser takes the first token of stdout.            |
| `run(tool, args, options?)`                                   | Run it; `options` are `cwd`, `env`, `extendEnv`, `outputLimit` (8 MiB per stream by default), `stdoutLimit` (`null` to keep all stdout as data), `onOutput` for live chunks, and `redact` for secrets in failure diagnostics. Failure keeps both streams. |
| `parseVersion(text)`, `satisfies(range)`                      | Canonical `x.y.z` parsing and npm semver matching; invalid ranges never match.                                                                                                                               |
| `requireVersion(rangeOrPredicate)`                            | A combinator for `Effect<Tool.Resolved>`; fails with `ToolVersionUnsupported`.                                                                                                                               |
| `producer(tool)`                                              | The `producedBy` record for artifacts a tool made.                                                                                                                                                           |

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

`Checksums.write({ artifacts, outfile })` writes a `sha256sum -c` compatible file for regular
artifacts and returns it as an `Artifact.File`. `Checksums.verify(file)` is its inverse for hosts
without a native checker: it re-verifies the checksum file, then every listed name against its
recorded digest. Paths are relative to the checksum file's directory, so a release tree can move
without rewriting it:

```sh
(cd dist && sha256sum -c SHA256SUMS)
```

## Links

[Getting started](https://github.com/mannyc2/effect-build/blob/main/docs/getting-started.md) ·
[Recipes](https://github.com/mannyc2/effect-build/blob/main/docs/recipes.md) ·
[Errors and checks](https://github.com/mannyc2/effect-build/blob/main/docs/errors.md) ·
[Design](https://github.com/mannyc2/effect-build/blob/main/DESIGN.md)
