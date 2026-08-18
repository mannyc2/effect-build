# Maintainer decisions

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** List product and compatibility choices that evidence cannot decide automatically.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Architecture and API

1. **Approve C2 or choose provider-native-only.** The evidence supports C2, but product surface commitment is maintainer authority.
2. **Approve exact public subpaths and protocol names.** In particular: `BrowserModuleApplication` versus `BrowserApplication`, protocol version strategy, and package-root facade behavior.
3. **Approve hard-cut versus deprecation window.** Decide whether v0.4 removes `Integration`, `Provider`, `withJavaScriptBundle`, and ambiguous compiler names without aliases.
4. **Approve `Author/*` audience naming.** Evidence supports the invariants; naming remains product judgment.
5. **Decide whether a public `HostPath.Observed` is worthwhile** or should remain internal.

## Provider scope

6. **Bun:** decide which API/command operations and compile targets are v0.4 commitments, and whether command watch ships immediately.
7. **Deno:** choose supported experimental API/CLI versions, unstable-policy UX, declaration-generation process, and runtime-acquisition/permission documentation.
8. **Esbuild:** choose context serve/watch exposure and any provider-specific convenience helpers without narrowing native API.
9. **Node SEA:** choose initial CJS-only proven subset versus current CJS+ESM support; decide asset/code-cache/snapshot/signing scope.
10. **Research adapters:** decide whether `@yao-pkg/pkg` or Rolldown becomes a supported package; research conformance alone does not grant product status.

## Profiles

11. **Browser profile name and scope.** Decide whether manifests/icons/workers/service workers are in the first finite role.
12. **Source maps.** Define required modes, redaction/disclosure behavior, and provider-specific unsupported observations.
13. **Incremental Node main.** Defer, ship Esbuild-only as native context, or approve a second product adapter and publish a profile.
14. **External imports.** Define the portable Node-main import domain: built-ins only, package externals, dynamic imports, JSON, native addons, and failure policy.
15. **Transport.** Decide whether canonical Node main supports bytes and file in v0.4 or starts with one transport.

## Compatibility and versioning

16. **Provider supported ranges.** Maintainers own the initial complete ranges/disjoint sets and known-incompatible holes; boundary probes alone do not decide them.
17. **Prerelease policy.** Decide default rejection/admission and CI obligations per provider.
18. **Unknown override UX.** Approve Layer-level option name, warning channel, and telemetry observation.
19. **Independent package releases.** Evidence demonstrates bounded peer ranges, but release cadence is a product/operations decision.
20. **Protocol/npm relationship.** Approve protocol compatibility independent of npm version equality.

## Lifecycle and observability

21. **Provider-native watch exposure.** Decide which raw process handles/streams are public versus provider-local operation helpers.
22. **No typed watch events.** Confirm that telemetry or terminal parsing will not be promoted into correctness protocol.
23. **`SourceLocator`.** Publish only if a concrete authenticated/redacted multi-step invariant is approved; otherwise use Path/provider maps.
24. **Digest defaults.** Decide when digest is mandatory, optional, or omitted for cost.
25. **Signing/post-mutation.** Choose first supported platforms/providers and credential authority in a later design.

## Certification and release

26. **Required browser/OS matrix.** Approve minimum browsers and platform versions.
27. **Receipt retention.** Choose retention duration and which small JSON receipts are permanent release evidence.
28. **Research versus production workflow permissions.** Closure/research workflows should be read-only; any bot push workflow requires separate scrutiny.
29. **Exact-head PR body policy.** Decide whether PR evidence tables are generated from `certification.json`.
30. **Release authority.** Keep merge, publish, tag, release, trusted publisher, and settings changes under explicit maintainer control.
