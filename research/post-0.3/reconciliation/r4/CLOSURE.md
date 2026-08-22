# R4 lifecycle laws and primitive-rent closure

Status: **research-closed by executable receipts**, with the host-certification
gaps named below. This report does not add production packages or exports.

The implementation choices were checked against official Effect source at
`436f10d1efccec308426532ff3f88df9a96434f3`: `Effect.acquireRelease`,
`Effect.forkScoped`, the official `ChildProcess.Command`/handle interfaces, and
the Node platform spawner's scoped termination and force-kill behavior.

## Exact public rent

The executable surface test permits exactly these proposed Author modules:

1. `Author/Tool` owns authenticated provider selection and returns an official
   Effect `ChildProcess.Command`; it does not rent a generic handle.
2. `Author/BorrowedOutput` owns revocable producer authority, containment,
   coherent observation, and mutation detection that Effect Scope and provider
   handles do not supply.
3. `Author/Executable` owns private same-parent staging, native-format
   inspection, optional observation cost as distinct hashed/unhashed variants,
   and single-file commit.

`r4-author-laws.test.mjs` rejects a fourth module and rejects optional digest
fields on unhashed variants. The packed external fixture imports only these
three proposed subpaths.

`Author/Tool` owns the shared scalar vocabulary: `DecimalBytes` is constructed
only from canonical non-negative unbounded base-10 text, and `Digest` is exactly
`{ algorithm: "sha256", value: Sha256Value }`, where the value is 64 lowercase
hex characters without a redundant prefix. BorrowedOutput re-exports those
types; Executable imports them. The packed adapter calls the public constructors
rather than fabricating a second grammar.

## Executed law table

| Owner | Law/falsifier executed | Result | Receipt claim |
|---|---|---|---|
| BorrowedOutput | acquisition wins before close, close rejects later acquisition, close drains winner once | established | `r4-author-laws:borrowed-output-laws` |
| BorrowedOutput | file/tree paths stay beneath the real root; traversal and symlinks fail | established | `r4-author-laws:borrowed-output-laws` |
| BorrowedOutput | same-size file/tree mutation is rejected | established | `r4-author-laws:borrowed-output-laws` |
| BorrowedOutput | hashed and unhashed scans use bounded chunks and never buffer a whole file | established | `r4-author-laws:borrowed-output-laws` |
| Executable | provider partial candidate failure leaves old destination and removes private candidate | established | `r4-author-laws:executable-publication-laws` |
| Executable | native format is inspected before same-parent rename; both hash modes stream | established | `r4-author-laws:executable-publication-laws` |
| Executable | injected Windows `EACCES`/`EBUSY`/`EPERM` lock fails closed and preserves destination | established model | `r4-author-laws:executable-publication-laws` |
| Tool/process | Effect scope interruption terminates and reaps direct child; Unix group kills descendant | established on executing host | `r4-author-laws:scoped-process-and-remnant-laws` |
| Tool/process | provider-direct complete and partial files remain durable after interruption | established | `r4-author-laws:scoped-process-and-remnant-laws` |
| esbuild 0.28.2 one-shot | Effect interruption stops waiting; blocked provider/plugin continues to onEnd and produces memory output | established | `r4-author-laws:esbuild-one-shot-interruption-law` |
| esbuild 0.28.2 | cancel rejects active rebuild, does not dispose, rebuild remains usable, post-dispose rejects | established | `r4-author-laws:provider-handle-laws` |
| esbuild 0.28.2 context | concurrent rebuilds coalesce; dispose drains active plugin; rebuild/watch/serve reject after dispose; dispose resolves before delayed async `onDispose` cleanup, which later finishes | established | `r4-author-laws:esbuild-context-lifecycle-matrix` |
| Rolldown 1.2.4 | two generate calls overlap; close resolves during active generate; active work fulfills; later generate rejects `ALREADY_CLOSED` | established | `r4-author-laws:provider-handle-laws` |
| external adapter | packed peer package typechecks/runs across core 0.4.0 and 0.4.1 using only proposed public contracts | established | `r4-external-author-adapter:packed-public-contract-only-adapter` |

The Rolldown result is the decisive generic-handle falsifier: its close does not
have the draining or cancellation meaning of the BorrowedOutput law, while
esbuild exposes a distinct cancel/dispose lifecycle. Provider methods therefore
remain native. A BorrowedOutput adapter that needs the stronger close law must
track winning observations itself; it cannot relabel `RolldownBuild.close()`.

## Reproduction

```sh
bun test research/post-0.3/r4-author-laws.test.mjs
RESEARCH_EXTERNAL_NODE_MODULES=/absolute/path/to/pinned/node_modules \
  node research/post-0.3/r4-runtime-probe.mjs
node research/post-0.3/external-author-adapter-probe.mjs
```

The portable suite has 13 tests and 103 assertions. The fail-closed producer is
`certify-r3-r4.mjs`; all eight R4 claim tuples are listed exactly in
`expected-conclusions.json`.

## Genuinely host-only follow-up

- The Windows lock classifier/state transition is executed on every host, but
  an actual open-image replacement must run on a Windows runner. A Unix host
  cannot reproduce the Windows loader's sharing violation.
- Direct-child termination/reaping and descendant process-group termination are
  reproduced on the executing Unix host. Windows descendant behavior is not
  claimed by this probe and needs a Windows-native tree test if it becomes a
  supported guarantee.
- The full support grid still needs exact-host receipts for each shipped
  OS/architecture/provider tuple. That is recurring release certification, not
  an unresolved R4 primitive law.

## R1 gate effect

- **Closed as an architecture/design gate:** R1's “exact public `Author/*`
  surface” has an executable rent result: exactly `Tool`, `BorrowedOutput`, and
  `Executable`; a generic command/handle primitive is rejected.
- **Partially closed at exact observed coordinates:** PF-2 now has real
  esbuild 0.28.2 cancel/dispose/post-release and Rolldown 1.2.4 concurrent
  generate/close/post-release schedules. The unexecuted PF-2 cases (write,
  watcher, onDispose window, coalescing, memory release, Bun Transpiler) remain
  open and no broad support admission follows.
- **Fully closed for the selected candidate gate:** `CAN-ESB-001` now has its
  exact one-shot continuation observation. Effect interruption stops the caller
  wait while the pinned esbuild 0.28.2 provider, delayed plugin, `onEnd`, and
  memory output complete.
- **Fully closed for the selected candidate gate:** `CAN-ESB-011` now has the
  required race matrix, post-dispose outcomes, and delayed-plugin-cleanup
  observation. The observed law is intentionally sharp: dispose waits for an
  active build plugin, but resolves before an async `onDispose` cleanup
  completes; that cleanup was observed finishing later. No stronger cleanup
  guarantee is implied.
- **Law closed, operation cells still open:** PF-1's distinction between
  private staged publication and provider-direct durable remnants is
  executable, including interruption, partial output, descendant termination,
  and the Windows lock state model. It does not replace the controlled-phase
  interruption receipts for every direct-write operation listed by R1.
- **Still open:** PF-3 watch lifecycles and PF-9's complete host matrix.
