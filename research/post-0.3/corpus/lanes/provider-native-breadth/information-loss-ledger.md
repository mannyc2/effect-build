# Information-loss ledger

[FAL-001 · FALSIFIED] A generalized build algebra is not lossless across all providers.

| Generic candidate | Exact information lost | Resulting invalid states / consumer branches |
|---|---|---|
| Generic `BuildRequest` | Bun virtual files/plugin callbacks; Deno project/import-map/lock; esbuild transform vs graph; SEA builder/base/assets/cache/snapshot | Invalid combinations become runtime flags; consumers re-branch on provider |
| Generic `BuildResult` | Native artifact classes, metafile schemas, structured diagnostics, stdout framing, durable executable provenance | Metadata is dropped or hidden in escape hatches |
| Generic `OutputFile[]` | HTML entry identity, chunks/assets/maps, Deno stdout, SEA single executable/assets, direct-write ownership | Cannot express closure, publication or runtime embedding |
| Generic `Target` | Bun runtime/OS/arch/libc/CPU; Deno target/runtime/permissions; esbuild syntax engines/platform; SEA base Node version/format | False cross-target promises and invalid state combinations |
| Generic `cancel()` | No established Bun host cancellation; Deno CLI signals; esbuild context cancel; SEA multi-stage child/postprocessor/signing | Pretends a uniform point of interruption and cleanup |
| Generic `watch()` | Bun/Deno human CLI streams; esbuild context callbacks; different writes and restart semantics | Invents typed events or hides opaque process ownership |
| Generic `Executable` | Bun, Deno and Node runtime identity; SEA builder/base/signing; permissions and embedded assets | Runtime-neutral role already falsified |
| Generic `Api` service | One-shots without reusable state; arbitrary host callbacks; ambient authority | Adds service lifetime without an invariant |
| Generic `Command` service | Selected executable relation, cwd/env/project, signal and output framing differ per operation | Raw argv escape hatch or overpromised portability |

## Three false similarities

1. **“Build” means the same lifecycle.** Bun host build is a one-shot promise, esbuild context owns rebuild/watch/serve/cancel/dispose, and Deno watch is an experimental command process.
2. **“Target” means the same axis.** esbuild target is syntax/environment lowering; Bun executable target includes runtime/OS/arch/libc/CPU; Deno compile target selects a Deno runtime artifact and permissions; Node SEA is coupled to a base Node executable and version.
3. **“Output files” mean the same ownership.** Host memory bytes are borrowed values, `outdir` can be provider-direct durable writes, Deno may emit stdout, and SEA mutates/copies an executable and may then sign it.

Other false similarities include plugins versus project configuration, cancellation versus process signals, and an executable file versus a portable runtime-neutral product.

## Escape-hatch test

A generic candidate that must carry `provider: unknown`, raw argv, raw upstream options, native result blobs and provider-specific lifecycle callbacks has not eliminated branches; it has merely moved them behind a weaker type. That candidate should be withdrawn or kept private.
