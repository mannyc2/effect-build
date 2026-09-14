# effect-build design

## What it is

effect-build runs build tools as composable Effect programs. Producers return a plain,
verified, hashed record of their output; those records compose through compilers, archives,
installers, signing, and reports. The boundary is bytes: effect-build produces and describes
files; ts-release moves them. Signing stays here because a signature is bytes in a file.

The first README example includes runtime and platform layers. Queries decode values without
committing files. Remote actions return persistent typed references and outcomes when they
change or attest to bytes, as in Apple's notarization flow. Only local producers with declared
inputs use the input cache; remote actions need fresh side effects or a future expected-output contract.

## Core

| Module       | Exports                                                                                                                                                                               | Role                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Target`     | 8 literals (`linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `windows-x64`, `windows-arm64`), `parts`, `all`, `host`                   | Same names ts-release uses. Linux without suffix means glibc.                                                                                                                                                              |
| `Artifact`   | `File`, `Executable`, `Directory`, `Regular`, `Producer`; `file`, `executable`, `directory`, `verify`, `streamVerified`, `copyVerified`, `readVerified`, `sha256`, `ioError`, `encode`, `decode` | Observe what's on disk into a record. `Executable.target` comes from the header. `Directory.sha256` hashes the sorted manifest; symlinks recorded, not followed.                                                           |
| `Executable` | `parse`, `inspect`, `matches`, `resolveTarget`, `expectTarget`                                                                                                                        | ELF/Mach-O/PE header facts. A static Linux binary matches gnu and musl.                                                                                                                                                    |
| `Commit`     | `atomic(outfile, produce, { onExists, prefix, staging })`, `output(outfile, produce, ProducerOptions, staging?)`                                                                      | Stage with final path depth or basename, then commit with recovery. Checks run inside `produce` run before the rename. `output` is what producers do with `atomic`, `onExists` and `prefix`; the producer picks `staging`. |
| `Tool`       | `InputInvalid`, `argumentIssue`, `locate`, `resolve`, `run`, `redact`, `parseVersion`, `versionPattern`, `satisfies`, `requireVersion`, `check`, `provider`, `producedBy`                                                                                                 | Locate and resolve once, record path/version/hash. Nothing re-checks the binary later. Ranges use npm semver.                                                                                                              |
| `Layout`     | `Entry`, `Issue`, `pathIssue`, `validate`                                                                                                                                             | Shared normalized shipping paths: every explicit or implicit prefix has one NFC/case-folded spelling and only directories have descendants.                                                                                |
| `Checksums`  | `write`, `verify`                                                                                                                                                                               | `sha256sum -c` compatible writing and verification.                                                                                                                                                                                                 |

`Cache` owns declared keys, a `KeyValueStore` index, and streamed objects provided by
`Cache.objects(directory)`. `Cache.cached` composes with any artifact producer; `Cache.clear`
clears dedicated resources. `effect-build/testing` exports scoped process fakes, real-file
fixtures, fault injection, path layers, and the provider conformance suite.

## Providers

Every binary provider declares its service and supplies one spec:

```ts
class X extends Context.Service<X, Tool.Service>()("effect-build-x/X") {}
const { layer, supported, tested, constraints, resolved, testLayer } = Tool.provider(X, {
  name: "x",
  version: { supported: ">=1 <2", tested: ["1.0.0"] },
});
```

The spec owns version parsing, exact tested versions, constraints and host requirements.
`extend` is required when the service holds extra fields; Deno records its explicit runtime,
and Node SEA resolves `base` beside `tool`. Native bundlers retain their in-process APIs.

Operations verify their own output before the rename (executables: header vs
requested target) and commit through `Commit.output`, so `atomic: false` writes
directly and `onExists`/`prefix` reach the commit; staging depth is the operation's
own choice. Optional inputs accept `undefined`; callers forward `process.env` values
and their own optionals without spreading. Domain packages may refine core
types (`SignedApp = Artifact.Directory & { signature }`) but never replace them.

## Decided

- **One assembled directory owns combined outputs.** `Directory.assemble` merges explicitly mapped artifacts, preserving directory members and rejecting conflicting paths before commit. Omitted directory paths mean contents at root; files require paths. Archives accept a whole directory as root contents, so a mixed runtime ships without a wrapper directory. Application manifests, dependency installation and migration fingerprints stay with the application.

- **Providers share a factory, not a registry.** `Tool.provider(Service, spec)` takes a named service class; declaration emit rejects an inferred returned subclass. `extend` covers extra service state; no `layerConfig` is needed in 0.8.
- **Version policy is declared once.** `tested` is exact versions satisfying `supported`; the provider table is generated. Operation constraints use `Tool.check` at the input-dependent call site and fail with `ToolVersionUnsupported`, never `InputInvalid`. Native Windows resource parsing stays effectful at the provider edge; semver ranges and full-version predicates retain their existing roles.
- **The accessor is `Tool.producedBy`.** Its name matches the artifact field; no aliases remain.
- **The provider contract is executable.** `effect-build/testing` uses Effect's scoped spawner constructors against real files; actual process launch and OS signals stay in integration tests. Conformance uses a fresh fixture, an output adapter, and an observed tool boundary; conditional restrictions require activating witnesses.
- **Declared-input cache, constructive storage.** Inputs, tool identity, host, canonical JSON options and format determine the key. No closure inference, sandbox, remote store, expected-output mode, TTL or pruning in 0.8. Provider signatures stay native; callers declare path/config/plugin/runtime dependencies. Scrubbed environments are optional; requirement metadata is descriptive, never a complete dependency closure.
- **Index and objects are separate resources.** Effect rc.113 `KeyValueStore` stores metadata; `PersistedCache` stores exits and TTL policy, which this cache does not need. Whole-file objects stream independently; directories reuse their manifest identity plus root mode. This retains the Action/result/CAS split of [REAPI](https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto) without claiming protocol compatibility.
- **Canonical JSON rejects ambiguous data.** Sorted object keys and omitted undefined properties; dense ordered arrays; no functions, accessors, cycles, non-finite numbers or class instances. Encoded components are retained for inspection; callers include implementation revisions and fingerprints of secret inputs where needed.
- **Cache hits copy verified bytes.** Private verification precedes destination writes, including direct output; committed output is rehashed. No hardlinks to mutable output; Effect FileSystem exposes no reflink option. Corrupt/unavailable cache entries are misses and failed ingest warns; destination failures and interruption remain visible. Concurrent index writes are last-writer-wins, not a claim of reproducible output.
- **Cached refinements need a codec.** The default returns the core union; an explicit schema retains the precise kind and provider fields with their services. Regular modes and directory roots survive restoration; only the root path is relocated. `Cache.clear` operates on dedicated stores while builds are stopped; format prefixes isolate incompatible schemas.
- **Whole files in 0.8.** A Bun 1.3.14 host pair changed 37 of 63,446,114 bytes; the five-target CLI sample saved only 1.32% with fixed 64 KiB block deduplication (441,366,250 total bytes). Chunking may help repeated same-target outputs but is not needed for the first store implementation.
- **Isolation is explicit and limited.** `env`/`extendEnv` and `scrubEnv` reach binary operations. Bun 1.3.14's `--compile-executable-path` and compile `--metafile` work in a real probe; an artifact-typed runtime option and reported-closure checks remain future provider features. Copying inputs into a temp cwd cannot confine undeclared absolute paths; no sandbox is claimed.
- **Cache comparisons informed scope.** [Tangram](https://www.tangram.dev/docs/introduction) locks dependencies and sandboxes; [Nix fixed-output derivations](https://nix.dev/manual/nix/2.27/store/derivation/outputs/) pin output identity; [Turborepo](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables) includes declared env values; [Build Systems à la Carte](https://www.microsoft.com/en-us/research/publication/build-systems-la-carte/) distinguishes constructive restoration from verifying existing output. effect-build ships declared inputs and constructive restoration only.

- Directory replacement retains a recoverable old tree; regular-file no-replace uses exclusive hard-link creation, while directory no-replace is unsupported.
- **Checksum paths are relative to their file's directory**, so a staged release tree can move without rewriting them.
- **Directory archive inputs preserve descendant modes and symlinks**; archive prefixes and sibling staging directories are newly created roots with mode `0755`, independent of the input directory artifact's recorded `rootMode`.

- **Replace on exists by default.** Every producer takes `onExists: "fail"` and `prefix`; `staging` stays
  the producer's, because files stage nested and import-bearing directories stage sibling. Direct sibling output
  starts from an empty destination, so a record never holds an earlier build's files.
- **No tool re-check before launch.** The hash at resolve time is a record, not a lock.
- **No overwrite guard on executables' inputs.** `Artifact.verify` is opt-in.
- **Inputs stream.** Hashing, verified copies, archives, wheels and Git source tars move 64 KiB at a
  time; `readVerified` is the explicit whole-buffer exception. A verified stream fails at EOF, so its
  output is provisional until then and only atomic staging makes that safe. The only size limits are
  ZIP32 and ustar field widths, typed as `Archive.FormatLimit`; there is no byte budget to tune.
- **Static Linux binaries report as glibc** when no target is requested.
- **One streaming ZIP encoder.** `Archive.Zip.encode` writes archives and wheels; `effect-build-python`
  depends on `effect-build-archives` for it, so both share the same limits and verified streams.
- **Bun forces lowercase `.exe` on Windows outputs**, so callers' `outfile` must end in `.exe`
  for Windows targets; the provider rejects otherwise rather than renaming.
- **Tested versions are evidence, not compatibility gates.** Bun 1.4.1 is rejected only for emitted builds; native APIs retain independent capability checks.
- **Deno 2.9.6 removed flags are checked per operation**; unrelated operations remain available.
- **Deno embeds the output basename**; Windows outputs require lowercase `.exe`
  so staging and the committed executable have the same name.
- **Explicit `denort` is hashed and recorded, not executed** to establish identity.
- **Git source archives fix host newline defaults to LF**; committed `.gitattributes` still controls file conversion.
- **Node SEA uses a CommonJS preparation blob and resource injection** across Node
  22–26; the tool and base executable must have matching Node versions. The target is read from the base's
  header, so a base running under emulation is recorded as itself.
- **SignTool reads its full SDK version from its binary resource**; string ranges select the first three
  components, while a caller predicate can pin the full four-component version. The Windows layer reads
  those bytes itself; `Tool.resolve` hashes incrementally and parses probe output only.
- **Errors name their tool in `tool`, never `name`**, so `Error.name` stays the `_tag` and every error
  prints as `Tag: message`.
- **Windows signing accepts MSIX files and PE executables**; signed executables must retain their input target before commit.
- **Apple resolves xcrun once**; active Xcode tools select its native commands, and copied app trees preserve framework symlinks.
- **Effect peers accept every 4.0 release candidate from rc.113.** The workspace tests rc.115,
  including Windows' fixed stat conversion; a required Show consumer keeps rc.113 compatibility.
  A non-gating consumer observes the `rc` tag.
- **bun-types is an optional peer of the Bun API subpath**; the package root references no Bun types.
- **esbuild is a peer, Rolldown a dependency.** esbuild's API is stable within a minor, so the consumer's
  install runs in process; the Rolldown wrapper uses `rolldown/experimental`, whose types move outside semver.
- **Standalone executables sign with the hardened runtime, notarize as ZIPs, and are assessed, never stapled**:
  Apple issues tickets for them but cannot attach one. Entitlements come from the caller; the Bun provider lists its own.
- **PKGs carry one signed app or one signed executable.** An executable's payload root installs to
  `/usr/local/bin` unless `installLocation` says otherwise; that is where a CLI belongs.
- **Trusted Signing credentials are two paths.** SignTool's client library reads Azure identity from the
  environment, so the library holds no Azure secret.

- **Core manifests project core fields only.** Provider schemas preserve richer signing/runtime/product/notary records.
- **Release retries consume retained exact tarballs** and verify registry bytes before skipping an existing version.
- **SHA-256 is the only digest.** Every artifact and directory entry carries one; there is no unhashed
  observation and no algorithm choice.
- **Layouts reject case-insensitive and NFC collisions at every path prefix on every host.** Core `Layout` owns this shipping guarantee for archives, wheels and app bundles, including implicit directories; local artifact observations still record host-specific names.
- **Archive and wheel bytes depend only on their inputs**: DEFLATE level 6, fixed ZIP timestamps, zero tar
  owners and times, zero gzip mtime. There are no timestamp, ownership, comment or compression options.
- **Windows signatures always carry an RFC3161 SHA-256 timestamp, and SignTool warnings fail.** Exit 2 means
  completed with warnings; a release signature with warnings is a failure here.
- **Signing identities are certificate fingerprints, never names or ad hoc.** Names are ambiguous and an ad hoc
  signature cannot be notarized; PFX files and Trusted Signing metadata name their certificate themselves.
- **No argv passthrough.** Operations expose typed options; anything else runs through `Tool.run` with the
  provider's resolved tool.
- **Source archives take a tree ID, not a ref**, so the bytes are fixed before Git runs; `excludes`, gitlinks
  and `.git` components are the only omissions.
- **Node SEA ad-hoc signs on Darwin.** Injection invalidates the base signature and an unsigned arm64 binary
  will not launch; `Apple.sign` replaces the ad hoc signature.

- **Filesystem failures name the operation**: reads distinguish absence from access/I/O failure, writes report `unwritable`, opaque native copies report both paths as `copy-failed`, and tool inspection never silently treats an inaccessible path as absent.
- **Commit recovery paths name retained output only.** Empty-backup cleanup can add diagnostic detail but cannot replace a failed rename. Failed destructive cleanup reports only observed remnants, which may be partial.
- **Tool owns failure redaction.** Providers supply secret values; argv and failed-process diagnostics are scrubbed together, while successful data and live output remain raw.
