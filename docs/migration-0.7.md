# Migrating 0.6 to 0.7

0.7 is a breaking replacement. Update all effect-build packages together, install
Effect and its platform packages at one 4.0 release candidate (4.0.0-rc.108 is the
tested version), and use ESM. See [compatibility](compatibility.md)
and the complete [first build](getting-started.md). There are no compatibility aliases.

| 0.6 contract                                                 | 0.7 replacement                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun / Deno `Command/*` modules                               | Package-root `compile`, `bundle`, `watch` plus `layer({ executable?, version? })`; Bun adds `build` and Deno adds `transpile`.                            |
| Bun / Deno `Api/*` modules                                   | `effect-build-bun/api` and `effect-build-deno/api`; native result types remain native.                                                                      |
| esbuild `Api/*` and selected-command wrappers                | Package-root `build`, `buildToDirectory`, `transform`, and scoped native `context`. CLI wrappers removed.                                                               |
| Private Rolldown implementation                              | Public `effect-build-rolldown` package and scoped native builders/watch.                                                                                    |
| Hashed/unhashed identities and decimal byte strings          | `Artifact.File`, `Artifact.Executable`, `Artifact.Directory`; `bytes` is a number and SHA-256 is required.                                                  |
| Admission/finalization/adoption operations, `Author/*` types | `Artifact.file`, `Artifact.executable`, `Artifact.directory` observe real paths; `Artifact.verify` checks them later.                                       |
| Selected-command launch reauthentication                     | Resolve/hash/probe once through the provider layer; later launches use the resolved path.                                                                   |
| Producer-owned release orchestration                         | Compose operations with `Effect.gen`, `Effect.forEach`, `Commit.atomic`, checksums and artifact records. Publishing belongs to the caller's release system. |
| nFPM metadata fields at the top level                        | `Nfpm.package({ config: { name, version, arch, ...nativeConfig }, contents, format, outfile })`. Native lifecycle scripts/config keys are preserved.        |

Core targets are `linux-x64`, `linux-x64-musl`, `linux-arm64`, `linux-arm64-musl`,
`darwin-x64`, `darwin-arm64`, `windows-x64`, and `windows-arm64`. A Linux target
without `-musl` means glibc. Translate previous GNU/Linux descriptors or native
triples explicitly to these strings; Bun/Deno also accept their documented native
names. Windows executable output must already end in lowercase `.exe`.
`Target.host()` can return `undefined` when Linux ABI evidence is unavailable;
Bun's omitted target uses native compiler selection and inspects its output.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Bun from "effect-build-bun";

NodeRuntime.runMain(
  Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
    Effect.tap((artifact) => Effect.log(Artifact.encode([artifact]))),
    Effect.provide(Bun.layer()),
    Effect.provide(NodeServices.layer),
  ),
);
```

`Artifact.encode`/`decode` handle **arrays of core artifacts** synchronously. They
validate/project the core handoff and intentionally omit provider refinements:
Windows signatures, Deno runtime records, Apple product types and notary tickets.
Persist a richer result using its exported provider schema with Effect
`Schema.encodeSync`/`Schema.decodeUnknownSync`. Do not treat a decoded core file as
a signed or notarized product. Filesystem records can become stale; call
`Artifact.verify` before a later consumer needs byte equality.

File replacement uses atomic rename. Every producer accepts `atomic`, `onExists`, and
`prefix`. `onExists: "fail"` uses exclusive hard-link
creation for regular files and fails explicitly for directories, where the portable
filesystem API has no atomic no-replace operation. Directory replacement retains a
recoverable previous tree and restores it if the new rename fails, but readers can
see a brief absent destination between renames. `CommitError.recoveryPath` identifies
a retained old tree when restoration itself fails. See [errors](errors.md).

Use `Commit.atomic(..., { staging: "sibling" })` around a release directory containing
bundles: relative imports and source maps need the same depth as the final path.
Moving the complete tree later is safe only when its referenced sources/external
files move with the same relative layout. No staging strategy can preserve arbitrary
external paths after an unrelated ancestor relocation.
