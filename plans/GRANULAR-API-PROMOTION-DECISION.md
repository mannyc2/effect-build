# Granular API promotion decision

**Decision date:** 2026-08-14 (America/New_York)
**Implementation source:** `2dda53151e877ab89708d0b0fbafa5f00d06ad58`
**Result:** five-package API cut certified; candidate verified; publication not
authorized and still blocked

This record closes Plan 026. It records observed evidence for one exact source
commit. It is not a build receipt, provenance object, hermeticity statement,
reproducibility claim, release, or authorization to publish.

## Certified evidence

The implementation descends from the verified main baseline
`60259f98a460b3d9b25b95221ca71b56c17d9d78` and exposes exactly five lockstep
`0.3.0` packages:

1. `effect-build`;
2. `effect-build-bun`;
3. `effect-build-deno`;
4. `effect-build-esbuild`;
5. `effect-build-node-sea`.

The exact-source push CI run is
[`31855513747`](https://github.com/mannyc2/effect-build/actions/runs/31855513747).
It is a completed successful `push` run whose `head_sha` is the implementation
source above. All twelve required jobs completed successfully:

| Job | Job ID | Conclusion |
|---|---:|---|
| `quality` | `94939416625` | success |
| `real-tools` | `94939416635` | success |
| `esbuild` | `94939416639` | success |
| `target-support (deno)` | `94939416650` | success; 6/6 cells |
| `node-sea` | `94939416653` | success |
| `bun-bundle` | `94939416660` | success |
| `effect-compatibility (4.0.0-rc.108)` | `94939416678` | success |
| `target-support (bun)` | `94939416688` | success; 6/6 cells |
| `publication-hosts (windows-2025)` | `94939416690` | success |
| `publication-hosts (ubuntu-24.04)` | `94939416691` | success |
| `effect-compatibility (4.0.0-beta.104)` | `94939416700` | success |
| `publication-hosts (macos-15)` | `94939416723` | success |

The Linux producer jobs captured Node 26.7.0 from `process.execPath`, restored
ambient Node 24.14.1, and proved the paths and versions were distinct. The
`bun-bundle` job separately selected compiler Bun 1.3.9 revision
`1.3.9+cf6cdbbba` while package-manager Bun remained 1.3.14. Its standalone Bun
bundle suite passed 3 tests, and its Bun-to-Node-SEA suite passed the required
idiom-heavy ESM/CJS integration case. The independent Esbuild and Node SEA jobs
also passed their public-package and composed-pipeline gates.

The non-mutating workflow-dispatch run is
[`31855652066`](https://github.com/mannyc2/effect-build/actions/runs/31855652066).
It is a completed successful `workflow_dispatch` run on the same branch and
exact `head_sha`. Its prerequisite `esbuild`, `node-sea`, and `bun-bundle` jobs
and final `candidate` job all succeeded. The candidate job re-ran the complete
deterministic suite, pinned real tools, 12/12 target cells, both Effect
endpoints, the fourteen consumers, and the independent candidate verifier
before upload.

The workflow had only `contents: read` permission. Checkout used the exact
input commit with persisted credentials disabled. No npm publish, tag, GitHub
Release, OIDC write, trusted-publisher mutation, or external distribution step
ran.

## Candidate bytes

GitHub Actions uploaded exactly one artifact:

- name: `effect-build-0.3.0-candidate`;
- artifact ID: `9239034521`;
- artifact API digest:
  `sha256:698a21b099f86623a110ae31e38752e4141bae6e76987ad0dd6a35a7028139f4`;
- expired at verification: `false`;
- recorded workflow source:
  `2dda53151e877ab89708d0b0fbafa5f00d06ad58`.

The downloaded artifact contained exactly five tarballs and `manifest.json`.
The local Plan 026 once-pack and the downloaded workflow artifact produced the
same observed file sizes and SHA-256 values:

| File | Bytes | SHA-256 |
|---|---:|---|
| `effect-build-0.3.0.tgz` | 47,704 | `f76e4e60b7c4e14837e811bb820929c0aa4d3dc328fe0b55eb2d793aff39f325` |
| `effect-build-bun-0.3.0.tgz` | 13,592 | `108ebe327a8067adaefbd46b2628737a1a364d437c5d93a2dddd4cd8cfa641f6` |
| `effect-build-deno-0.3.0.tgz` | 6,340 | `1bcb609545ab5d31cb90475a3e608a9764109e217847e0c5eea4361b73bbf915` |
| `effect-build-esbuild-0.3.0.tgz` | 11,297 | `3731347d4c509858cf747ca928641a902f6d71b3699dbda344683a0eef0b7994` |
| `effect-build-node-sea-0.3.0.tgz` | 17,305 | `f3b03725691c4647d8c1ba09d05f11b8e49e19d28aea0a4eec709cc56bc56b36` |
| `manifest.json` | observed manifest | `8b20e1198f6235fd00d1d7791fd31536c1ff11b878107c773ad7a11f654bada8` |

`scripts/verify-candidate.mjs` independently accepted both the preserved local
directory and the freshly downloaded directory for the exact implementation
source. It checked the six-file inventory, manifest schema, source, package
names and versions, byte sizes, SHA-256 values, dependencies, peers, export
maps, and packed dist entries.

Every integration tarball depends one way on `effect-build: ^0.3.0`.
`effect-build-esbuild` alone also depends on exact `esbuild: 0.28.2`. There are
no workspace, file, link, portal, absolute-path, integration-sibling, or
optional dependency leaks.

Fourteen packed consumers passed against the exact uploaded bytes: ten
isolated npm/Bun cases, two Esbuild-plus-Node-SEA cases, and two
Bun-plus-Node-SEA cases. Negative-resolution checks established that Node SEA
does not bring Esbuild, Bun, or raw `esbuild`; Esbuild and Bun do not bring Node
SEA or one another; and each composed application declares its producer and
Node SEA directly.

The matching local candidate remains in its owned temporary directory, as Plan
026 requires. The downloaded candidate remains in a separate owned temporary
directory. Neither directory is a release location.

## Local outcomes

- Exact package-manager Bun 1.3.14 revision `0d9b296af` passed the frozen
  install with no lock change.
- The graph/export audit, build, tooling reader, five type-test files, and 41
  architecture tests passed.
- `bun run verify` passed 175 unit tests with one intentional skip, 14/14 packed
  consumers, all architecture checks, and zero lint or format findings.
- `bun run verify:effect` passed both Effect `4.0.0-beta.104` and
  `4.0.0-rc.108`, each with the same 175-pass/one-skip unit result and 14/14
  packed consumers.
- The optional host lane passed under Bun 1.3.14 and installed Deno 2.9.5 on
  Darwin arm64.
- Exact compiler Bun 1.3.9, Deno 2.9.3/denort, Node 26.7.0 SEA, and 12-target
  evidence were unavailable locally solely because the required assets are
  Linux x64 GNU. They passed in the mandatory exact-SHA CI jobs; no PATH or
  ambient-tool substitution was used locally.
- `git diff --check` produced no output throughout certification.

## EARNED NOW

The evidence earns only the representations used as a real cross-package
language by the certified five-package cut:

- durable core file and executable artifact bases and the canonical
  `SystemTarget` vocabulary;
- the narrow JavaScript-bundle `node` resolution target, format, size, digest,
  and ordered stage/tool observations;
- one nominal scoped JavaScript-bundle capability whose lifetime is owned by a
  callback and whose invalid-reason authority remains in core;
- the narrow integration-author `executeCommand`, live-bundle inspection,
  owned-bundle bracket, and executable publication function;
- independent public Esbuild and Bun continuation services producing the core
  capability;
- public Node SEA assembly consuming that core capability without an
  integration sibling dependency;
- the command-provider author boundary needed for Bun and Deno to capture one
  selected compiler command while keeping it private from applications.

These promotions remove duplicate lifecycle, staging, validation, and
publication representations. They do not create a generic builder or backend
model.

## REMAINS INTEGRATION-SPECIFIC

- Esbuild diagnostics, options, build context, exact `esbuild@0.28.2`, and its
  fixed `node26.7` syntax target remain owned by `effect-build-esbuild`.
- Bun 1.3.9 discovery/version gating, fixed CLI argv, Node-resolution defaults,
  metafile interpretation, bounded observed externals, and differential
  `import.meta.main` behavior remain owned by `effect-build-bun`.
- Node 26.7.0 discovery/probing, private executable authentication and copy,
  syntax check, SEA configuration/assets, native inspection, and tagged errors
  remain owned by `effect-build-node-sea`.
- Bun and Deno executable target tables and compiler-specific diagnostics
  remain in their provider packages.

## REJECTED UNTIL EVIDENCE CHANGES

The certified cut does not earn any of the following product concepts:

- `ExecutionTarget` or another core target axis;
- a generic JavaScript bundler or executable packager;
- a public native executable inspector;
- a public manifest, receipt, provenance, or reproducibility model;
- a generic build plan, executor, task graph, or backend registry/fallback;
- an artifact store, cache, CAS, or durable scoped-bundle path;
- watch mode or a plugin protocol;
- remote/container execution, transport, or automatic tool download.

Two concrete local producers are not interchangeable backends. Adding any of
these concepts now would increase public state without removing a duplicated
workflow or making an invalid state unrepresentable.

## DEFERRED INTEGRATION FEATURES

- **Source maps:** deferred until a named debugging consumer requires them and
  mapping, external-source, cleanup, and materialization semantics are verified
  for the concrete producer. They do not become a neutral core option merely
  because both bundlers can emit some source-map form.
- **Node SEA snapshots and code cache:** remain fixed `false` until exact
  selected-Node evidence establishes which combinations are compatible with
  ESM/CJS bundles and the current private-copy/authentication path. They do not
  become public Boolean switches by anticipation.

## Observable promotion gates

The audit's gates remain evidence-based rather than calendar-based:

| Candidate | Status | Evidence decision |
|---|---|---|
| public executable inspection/validation | `NOT MET` | No named caller needs inspection independently of build/publication, and no standalone ranged-I/O/error contract has been earned without exposing candidate or rename state. |
| broader/durable artifact types | `NOT MET` beyond the promoted narrow file/executable bases | Scoped bundle paths must not be serialized, and no additional durable semantic kind has two integrations sharing lifecycle, materialization, Schema round-trip, digest, and replacement-cut evidence. |
| versioned receipts | `NOT MET` | There is no named audit/replay/transport consumer, canonical versioned encoding, unknown-version migration suite, or same-evolution test across two topologies. Workflow evidence stays external. |
| `SemanticPlan` | `REJECTED` | Inputs and toolchains are not closed/content-identified, cwd/PATH/environment/workspace facts remain operational, and two real binders do not consume one canonical request. |
| `BoundExecutionPlan` | `REJECTED` | The SemanticPlan gate is not met, and no separate binder representation has two real bindings preserving one acceptance contract. |
| replaceable executors | `REJECTED` | Bun and Esbuild are concrete local producers, not genuinely different backends; cancellation, workspace, transfer, retrieval, credential, and transport boundaries have not been proven twice. |

## Equivalence boundaries

The evidence keeps three claims separate:

1. The same semantic request would mean the same closed, canonical intent. This
   program has not defined that representation.
2. The same invocation would additionally require the same selected tool,
   workspace, argv/options, environment, backend, and execution. Bun and
   Esbuild deliberately do not have the same invocation.
3. The same output bytes is a still stronger observed fact. The local and
   remote npm tarball hashes happened to match for this exact cut, but that does
   not establish hermeticity, repeatability for arbitrary builds, semantic
   equivalence of Bun and Esbuild output, or a reproducibility contract.

Ordered stage/tool observations report what ran. They do not close hidden
inputs or convert an acceptance check into provenance.

## Public migration

The intentional v0.2 to v0.3 import migration is:

```text
effect-build/bun  -> effect-build-bun
effect-build/deno -> effect-build-deno
```

Scalar and matrix call semantics remain provider-local. Bun additively gains
`withJavaScriptBundle`. Esbuild and Node SEA are independent packages composed
by application Effect code. No legacy subpath alias, optional facade, combined
pipeline API, sibling dependency, fallback, or registry is retained.

## Release boundary

Read-only npm queries observed `effect-build` versions `0.1.0` and `0.2.0`,
with `0.2.0` still latest. The four new integration names returned E404. E404
proves only absence; it does not prove ownership or reservation.

The current public coordinator remains `@mannyc1/ts-release@0.2.2`, integrity
`sha512-FXVtZc1lRNqKDdbL5vmXPiGemZlokL4cRzhVpBGsVg2gxawq2pypotXBn1PFVHRFA7tzIT2Rrq6u+ws4ol7pRQ==`,
at lightweight tag/source commit
`528bdf9969985e2cb8238192d30c4a2f680ce8c3`. Its public peers remain on the
Effect beta.83 family, and its exact released schema still exposes singular
`npmPackage` and `publish.npm` objects. Its recorded executed evidence covers
one npm subject plus GitHub, not five npm subjects plus GitHub.

Plan 021 therefore remains `BLOCKED/SUPERSEDED`. A future restamped release
plan must prove ownership/reservation and trusted publishing for all five npm
subjects, then qualify one coordinator that preflights and orders core, Bun,
Deno, Esbuild, Node SEA, and GitHub; publishes the already-tested bytes once;
persists equivalent/conflict/failure/unknown/`NotReached` outcomes; and safely
resumes the same bundle. No fallback publisher is authorized.

**Final release status:** candidate verified; publication, tagging, GitHub
Release creation, and trusted-publisher mutation remain blocked and did not
occur.
