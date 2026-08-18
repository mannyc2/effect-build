# Recorded execution audit

## Audit conclusion

**RECORDED-EXECUTION.** The current GitHub head is `96e53a27be4ef96fb47f1a745480e0c5382640f2`. At the observation time, current-head check data showed skipped `node-sea` jobs and failed `executable-research` and `quality` jobs. The `executable-research` annotations include two TypeScript contract failures, an exit-code failure, and no files at the architecture receipt upload path. [GH-CHECKS-HEAD] [GH-EXEC-ANNOTATIONS]

**GITHUB-DIRECT.** The workflow orders contract type-checking before final-contract compilation, compatibility execution, provider certification scripts, conclusion validation, and receipt upload. Therefore the current type-check failure prevents those later steps from furnishing a complete current-head certification receipt set. [GH-ARCH-WORKFLOW]

**Conclusion:** this repository contains substantial research source and expected-conclusion declarations, but the live state does not support a claim that the current head has a complete, green, current receipt set for the Node canon.

## Live GitHub state

- **GITHUB-DIRECT:** PR #4 is open and draft.
- **GITHUB-DIRECT:** live research branch head is `96e53a27be4ef96fb47f1a745480e0c5382640f2`.
- **GITHUB-DIRECT:** live base branch head is `15c811bb9904142a33d119766b62082f3c689f13`.
- **GITHUB-DIRECT:** the PR body states `af4887c36753a82c3c97fafc54b3c368cd98b34d` as “the final research head”; that claim is stale relative to the live ref.
- **GITHUB-DIRECT:** the live head commit message is `Document the canonical Node-main representation` and its GitHub signature verification is valid.
- **GITHUB-DIRECT:** direct PR REST data and an earlier connector summary returned different titles. The direct REST title is retained in `live-github-state.json`; the discrepancy is not treated as semantic evidence.

## What source exists

**GITHUB-DIRECT.** The branch contains:

- Candidate C2 plans and API declarations;
- Plan 043 for `NodeMainProgram`, `NodeMainExecutable`, and `NodeSourceExecutable`;
- `node-main-canon-probe.mjs` comparing candidate shapes and producer fixtures;
- version and SEA relation probes/certification scripts;
- an architecture workflow that pins multiple provider/tool versions;
- `expected-conclusions.json` declaring the intended conclusion set.

Source code and expected conclusions show what authors intended to run or establish. They are not themselves recorded execution outcomes.

## Current workflow ordering

The `executable-research` job, in order, selects Node 25.5.0 and 26.7.0 assembler binaries, a Node 24.14.1 host, Bun 1.3.14, Deno 2.9.5, Rolldown 1.2.4, `@yao-pkg/pkg` 6.22.0, esbuild 0.28.1/0.28.2, and TypeScript 6.0.3; builds the workspace; runs architecture tests; type-checks contract prototypes; compiles final contracts; runs compatibility laws; runs certification scripts; validates receipts; and uploads them. [GH-ARCH-WORKFLOW]

At the current failure, the job stopped in the contract type-check phase. The later current-head certification commands therefore were not reached in that run.

## Recorded current-head checks

The check API reported 27 check runs. Selected material results:

| Check | Recorded conclusion | What it proves |
|---|---|---|
| `node-sea` (two observed) | skipped | No current-head SEA result from those jobs. |
| `executable-research` (two observed) | failure | The current architecture-research path is not green. |
| `quality` (two observed) | failure | The overall head is not clean. |
| `esbuild` | success | The exact job named `esbuild` passed; scope must be read from its workflow/logs before broader claims. |
| `bun-bundle` | success | The exact job named `bun-bundle` passed; it does not establish the proposed canon alone. |
| `real-tools` | success | Its own workflow scope passed. |
| `source-export` | success | Source export passed; not provider conformance. |

**RECORDED-EXECUTION limitation:** a green narrowly named check is not automatically evidence for main-entry equivalence, SEA admissibility, mutation safety, target negotiation, or all versions. This package does not infer those broader claims from job names.

## Failure annotations

The current `executable-research` annotations report:

1. no files found at the architecture receipt path;
2. process exit code 2;
3. a `Stages` type failing the declared build-step constraint at `contracts.typecheck.ts:348`;
4. an Effect return-type mismatch at `contracts.typecheck.ts:111`.

**INFERENCE.** The missing upload files are downstream of the earlier type-check failure because the workflow initializes only an environment path before the failed step; certification scripts that write receipts run later. It is not accurate to describe this merely as an upload glitch.

## Audit of `node-main-canon-probe.mjs`

**GITHUB-DIRECT.** The committed probe:

- compares an importable-module candidate, a main-entry candidate, and a richer graph candidate;
- drives esbuild and Bun over curated fixtures;
- requests Node-targeted ESM/CJS output;
- disables splitting;
- uses provider metafiles;
- uses package externalization;
- invokes `node --check`;
- concludes in source that the main-entry candidate survives its matrix.

**INFERENCE — useful but insufficient for the general canon.** Its fixture/model does not establish complete handling of:

- computed `require` or dynamic import;
- aliased loaders;
- `module.createRequire()`;
- `eval`/`new Function` generated loads;
- source-relative `fs` asset reads;
- `process.dlopen()`/native addons;
- worker secondary entries;
- plugin-generated opaque loaders;
- all package export/import conditions;
- exact assembler Node target negotiation;
- SEA loader execution.

The probe's `packages: "external"` setting is especially important: a non-built-in external can be observed and still be unusable by the default SEA loader. The proposed strict profile changes that state from “recorded” to “rejected.”

## Expected conclusions are not receipts

`expected-conclusions.json` declares claims such as:

- Node main entry is portable while importable equivalence is not;
- Node SEA and pkg produced equivalent Node-main executables;
- matching Node 25.5.0/26.7.0 SEA relations work;
- a mismatched builder/base case fails.

These are **GITHUB-DIRECT declarations of expected outcomes**, not independently sufficient **RECORDED-EXECUTION** evidence. A current receipt with command, versions, host, fixture digests, stdout/stderr, exit status, source SHA, and artifact observations would be required to promote each outcome for the current head.

## Evidence that may still be historically valuable

The PR body and source record prior claimed executions. They may accurately describe earlier runs, but this assignment did not retrieve a preserved complete receipt set tied to `96e53a27be4ef96fb47f1a745480e0c5382640f2`. Therefore this package labels those claims as repository assertions or questions requiring future execution, not as executable certification.

## What this assignment executed

Only document/archive integrity operations were performed locally:

- write Markdown/JSON files;
- compute SHA-256 manifests;
- create ZIP;
- list and test ZIP structure;
- verify included file hashes.

No Bun, esbuild, Rolldown, Rollup, Node SEA, Deno, pkg, or project test command was executed. No GitHub workflow was dispatched. No repository content was modified.
