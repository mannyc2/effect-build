# 0.4 surface-freeze product decisions

Date: 2026-08-21.
Status: **decided for the 0.4 surface-freeze program; implementation remains unauthorized until the freeze is complete**.

Authority: the maintainer directed the repository to execute steps 1-5 of the
research-to-freeze sequence. That direction authorizes resolving M1-M8 and,
after all evidence gates pass, replacing the active execution instructions at
the exact freeze commit. It does not authorize Plan 039 production changes,
merge, publication, tags, or a release.

These decisions adopt the recommended defaults from
`corpus/PRODUCT-DECISIONS-REMAINING.md` unless a named executable gate below
falsifies the corresponding candidate.

## M1 - execution-instruction cutover

Approved only at the exact surface-freeze commit. The cutover commit must also
contain the complete package/export/support/removal map, rewritten Plans
039-044, and deterministic checks proving that the instructions and freeze map
agree. Before that commit, the current instruction remains authoritative and
Plan 039 remains blocked.

## M2 - executable matrix product

Retain `compileExecutableMatrix`, but hard-cut its 0.3 result/error shape into
an independently committing matrix report.

The operation owns:

- homogeneous provider and operation identity;
- deterministic input-index cell identity;
- bounded concurrency;
- exactly one scalar `compileExecutable` invocation per cell;
- independent single-file publication per successful cell;
- a returned ordered result for every normally completed cell;
- success and typed failure as explicit cell-result variants; and
- an explicit statement that committed cells are not rolled back.

Defects and caller interruption remain Effect Cause and are never translated
into matrix cell failures. Scope closure interrupts active children and does
not start queued cells. An interrupted invocation may therefore leave already
committed artifacts; it does not return a misleading complete report and does
not claim transactionality.

R7 must prove these laws across Bun and Deno. If those unchanged laws cannot be
proved, the matrix is removed rather than retained in its 0.3 shape.

## M3 - compile operation names

Keep `compileExecutable` and `compileExecutableMatrix` for the Bun and Deno
selected-command operations. The names are truthful within provider packages
because each operation identifies its embedded runtime and provider-specific
request, target, diagnostics, and acquisition policy.

Do not create a runtime-neutral executable compiler service. Bun host-API
executable production remains a mode of Bun's native build operation. Node SEA
uses `assembleExecutable`, because it assembles an authenticated Node main and
base executable rather than compiling source through a Bun/Deno compiler.

## M4 - Apple distribution scope

0.4 includes only provider-specific candidate-correctness repair required
before executable publication, such as proven ad-hoc Mach-O repair after Node
SEA mutation. Developer ID signing, app/installer/disk-image construction,
notarization, stapling, Gatekeeper assessment, credentials, and Mac App Store
work are excluded from 0.4.

`effect-build-apple` is deferred until the credential-backed R9 program selects
and proves an exact operation subset. Distribution policy does not enter Bun,
Deno, or Node SEA assemblers.

## M5 - durable receipt writer

Adopt orphan ref `evidence/receipts-v1`. Archive every aggregate certification
selected as a release candidate and every terminal release attempt, including
partial or unknown external mutation outcomes. Do not archive exploratory PR
runs indefinitely.

Only a separately reviewed protected workflow or app may fast-forward the ref.
It must authenticate the producer through GitHub API metadata, treat downloaded
artifacts as hostile data, never execute candidate source, use deterministic
attempt-specific paths, reject conflicting bytes, and never force-push,
delete, amend, or blind-retry. M5 authorizes the design and future protected
writer configuration; it does not grant a current PR write permission.

## M6 - browser role stability

`BrowserModulePayload` ships under the normal public-author stability promise
only if the complete R5 unchanged-consumer and real-browser law matrix passes.
The Deno adapter remains explicitly experimental at admitted exact Deno
identities. If the core proof is too narrow, the core role is deferred; it is
not shipped under a weakened or vague experimental meaning.

## M7 - selected-command tool discovery

Support two deterministic authorities at Layer construction:

1. an explicit absolute executable path, which always wins; or
2. one deterministic PATH search when no path is supplied.

Selection must yield one unambiguous canonical executable, bind its full
content identity for the Layer lifetime, and fail on absence or ambiguity.
There is no installation, alternate-candidate retry, fallback after
incompatibility, or operation-time substitution. Launch-boundary
reauthentication detects replacement without repeating unrelated probes.

## M8 - package and export organization

Keep one first-party package per provider plus `effect-build` core. Package
roots are namespace-only discovery facades. Public modules are
operation-specific; `Api` and `Command` groupings may appear only where they
contain real operations and improve discovery. Providers do not publish empty
or synthetic transport twins.

The initial candidate package train is:

- `effect-build`;
- `effect-build-bun`;
- `effect-build-deno`;
- `effect-build-esbuild`;
- `effect-build-node-sea`; and
- `effect-build-rolldown`, only if the independent R6 package gate passes.

All admitted first-party packages release in exact lockstep and use exact
same-version peers. A failed Rolldown package gate removes only that candidate;
it does not change the five-package providers or decide any portable profile.
The exact subpath list is produced by the R1/R7 freeze map and is not inferred
from these package names.

## Closed decision boundary

M1-M8 are no longer open preference questions. Later work may change a
decision only by recording a new maintainer decision with the falsifying
evidence. Research findings still decide support cells, operation modes, and
whether ship-if-pass candidates actually enter the frozen surface.
