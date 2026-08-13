# Fable Max consultation: effect-build next-stage architecture

> **Status**: advisory input, independently vetted in
> `plans/NEXT-STAGE-ARCHITECTURE-AUDIT.md`. This is not an implementation plan
> or an authority override.
>
> **Repository baseline**: `e4257ccc84db70a6966c163700c9423659f9a4fc`
> (2026-08-13).

## Consultation protocol

- `claudey` was not present.
- Installed CLI used: `claude` resolved to the local Claude CLI.
- Command mode: `--safe-mode -p --model fable --effort max --tools ""`
  with no session persistence and JSON output.
- The completed initialization/result identified the model as
  `claude-fable-5`, used 19,897 thinking tokens, made no web/tool requests,
  and completed successfully.
- Context sent: a sanitized architecture brief and five bounded questions. No
  source excerpts, `.env` files, credentials, repository paths, or private
  code were transmitted.
- No different model was substituted.
- A later transcript-only retry of the same consultation ended in the upstream
  error `529 Overloaded`; it was not used as advice.
- The exact final answer from the successful run is preserved verbatim in
  [2026-08-13-fable-max-raw.md](./2026-08-13-fable-max-raw.md).

## Questions sent

1. What is the smallest internal `prepare -> execute -> validate -> publish`
   split that reduces state space without duplicating existing wrappers?
2. What is the minimal canonical scoped `JavaScriptBundleArtifact`, with facts
   classified as fixed, dynamically validated, durable, or scope-local?
3. How should one Effect Scope own bundle/config/blob/executable state across
   every exit mode while retaining atomic publication?
4. Which target distinctions and producer protocols are demanded by the two
   concrete operations?
5. How should multi-tool provenance and later inspection/artifact/receipt/plan/
   executor promotion evolve without overclaiming reproducibility?

## Vetting disposition

The complete accepted/corrected/rejected ledger is in
`plans/NEXT-STAGE-ARCHITECTURE-AUDIT.md#fable-max-recommendation-ledger`.
The most consequential dispositions are:

- accepted: cancel-before-dispose context ownership with Cause-level cleanup
  failure, Fable's distinction between structured API shape and OS-process
  topology, one internal publication owner, a narrow syntax-target fact,
  concrete operations rather than a universal adapter, ordered observed stages
  internally, and rejection of fail-fast/rollback/publish-mode switches;
- corrected: Effect Scope does not statically prevent a returned artifact from
  escaping, so the bundle operation owns a continuation; commit-bearing
  `AtomicOutput` must be replaced by an opaque staged-path-only candidate and
  adapters must lose final-destination visibility rather than merely being
  wrapped; a branded validated peer has no independent consumer; esbuild
  metadata cannot prove arbitrary source closure, so the
  artifact retains observed external specifiers for exact selected-Node
  validation; current direct Node SEA supports ESM and CommonJS and does not
  require postject/blob injection; assets belong to the Node SEA input;
  selected Node is operation state rather than a public `ExecutionTarget`;
  Artifact `bytes` is already a byte count; and esbuild context Scope does not
  own the exact package's unref'd process-global native service;
- rejected now: resolved esbuild options/entrypoint as durable bundle fields,
  immediate public plural provenance/versioned receipts, fake-only
  `BoundExecutionPlan` evidence, and semantic plans containing machine-local
  paths.

Every disposition was checked against live repository source/tests or official
Effect, esbuild, and Node documentation before it shaped Plans 016-019. In
particular, live Effect rc.108 and esbuild 0.28.2 probes overturned two of the
consultation's strongest premises instead of being subordinated to them.
