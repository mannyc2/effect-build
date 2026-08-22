# R5 portable-role verdicts

Date: 2026-08-21.
Status: **executed freeze research; both candidates deferred**.

These verdicts separate a coherent role from a sufficiently proved public
compatibility commitment. They do not weaken a role to make a provider pass,
and they do not infer a version range or an unexecuted host cell.

## Node sealed main: defer

The corrected unchanged-consumer probe uses one consumer and one assembler for
Bun, esbuild, and Rolldown producers. At the executed macOS arm64 coordinates it
passed 18 supported cells:

- CommonJS through Node 25.5.0 and 26.7.0;
- ESM through Node 26.7.0;
- byte and private-file acquisition;
- exact content identity and mutation rejection;
- builtin, bundled dynamic import, bundled JSON, package external, unresolved
  external, and native-addon classification;
- target mismatch before mutation; and
- interruption before and after the atomic publication point.

The probe corrected two prior false assumptions. Node 25.5.0 direct SEA does
not support an ESM main, so the three producer/Node-25 ESM cells are explicit
unsupported cells instead of passes. A macOS direct-SEA candidate also requires
ad-hoc signing after mutation before execution; this is target-specific
correctness repair, not distribution signing.

This is not the complete R5 proof. The exact-head Linux receipt and the local
macOS arm64 execution still leave Linux arm64, macOS x64, and Windows x64
unexecuted for this role, and no recurring five-host package/consumer matrix
exists. The role and adapter designs remain valid research, but no
`Profile/NodeSealedMain` export enters the 0.4 freeze.

## BrowserModulePayload: defer

The real-Chromium probe executed eight exact provider/version/minification
cells on macOS arm64. Both Bun versions loaded the JavaScript entry, dynamic
chunk, module-owned CSS, nested CSS, images, font, source maps, and MIME-served
resources without a failed browser request.

Both Deno 2.9.3 and 2.9.5 failed before browser execution because `deno bundle`
has no configured loader for SVG resources referenced by module CSS. The
historical fixture normalizer copies top-level resources and edits HTML only
after a successful provider build; it therefore cannot repair this provider
graph failure and is not a portable adapter proof.

The program also still lacks authoritative multi-entry/edge association,
query/fragment preservation, external-resource policy, and the complete host
matrix. `BrowserModulePayload` is deferred. The broader
`BrowserModuleApplication` claim remains falsified.

## Executable authority

`certify-node-sea-relations.mjs` and `certify-version-boundaries.mjs` emit
fail-closed R5 claims. The exact final source SHA is authoritative only when the
aggregate research workflow reproduces those claims from a clean checkout.
This document records the disposition; it is not a substitute receipt.
