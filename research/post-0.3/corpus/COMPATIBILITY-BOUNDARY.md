# Minimum truthful compatibility boundary

Date: 2026-08-18.
Status: **official-source research plus reconciled architecture; provider probes open**.

## Finding

An exact tested version is an evidence point, not a complete provider identity and not a support
range. The minimum truthful evaluator can remain private and finite; a public matcher DSL is not
required.

Official upstream contracts expose the distinctions that a bare SemVer allowlist loses:

- Bun publishes version and revision information, canaries tied to commits, and executable target
  variants including platform/libc/CPU distinctions.
  Sources: [Bun installation](https://bun.com/docs/installation) and
  [Bun executable targets](https://bun.com/docs/bundler/executables).
- Deno stable and LTS channels may have distinct build identities even where a version number is
  insufficient to distinguish acquisition provenance.
  Source: [Deno stability and releases](https://docs.deno.com/runtime/fundamentals/stability_and_releases/).
- esbuild's JavaScript API coordinates a platform-specific native executable; package, API, and
  binary coherence matter independently of an arbitrary selected CLI.
  Sources: [esbuild getting started](https://esbuild.github.io/getting-started/) and
  [esbuild API](https://esbuild.github.io/api/).
- Node SEA legacy injection constrains the producing builder and receiving base executable;
  code-cache and snapshot modes add host/target restrictions. Direct `--build-sea` collapses some
  selection states but does not make relations conceptually disappear.
  Source: [Node SEA](https://nodejs.org/api/single-executable-applications.html).
- Deno compile may acquire or select a target runtime, including explicit `DENORT_BIN`, so runtime
  provenance and relation checks are operation-specific.
  Source: [Deno compile](https://docs.deno.com/runtime/reference/cli/compile/).
- SemVer ordering intentionally ignores build metadata and npm prerelease matching has its own
  tuple rules. SemVer is one possible policy matcher, not an artifact identity.
  Sources: [Semantic Versioning 2.0.0](https://semver.org/) and
  [node-semver](https://github.com/npm/node-semver).
- npm peers express package-graph compatibility, a different gate from selected-tool behavior.
  Source: [npm peer dependencies](https://docs.npmjs.com/cli/configuring-npm/package-json/#peerdependencies).

## Private provider evaluator

Each provider owns ordinary code/data for:

- complete implementation identity;
- exact observed evidence coordinates;
- separately reviewed support admissions and later reviewed ranges, if any;
- operation/lane/host/target deny holes;
- bounded required-capability probes;
- non-overridable relations;
- provider/core peer requirements; and
- portable-profile compatibility only where a portable profile is actually composed.

Core may own only shared decision vocabulary, typed wrapper-owned refusal fields, the
selection/replacement invariant, and concise compatibility observations carried into results and
receipts. Public `Author/Tool` construction laws let an independently versioned external adapter
supply its own finite identity, capability, relation, and refusal logic. Core does not own a
user-authored registry, matcher language, fallback chain, or automatic installer.

## Fail-closed phases and order

Release and packed-consumer CI prove package peer ranges and supported Effect declaration/runtime
endpoints. Installation enforces npm peers. Layer composition may check an actual runtime
core/profile identity where one exists; npm or Effect dependency graphs are not dynamically
re-inspected on every operation.

Provider execution then follows this order:

1. Layer acquisition selects exactly one implementation with no fallback or substitution, observes
   its complete identity, and rejects selection/global-identity failures.
2. Once the request supplies operation, lane, host, and target, operation preflight rejects known
   holes before positive admission.
3. Establish every bounded required capability; absence, timeout, or indeterminate evidence is not
   success.
4. Evaluate tool/target relations and any selected profile contract.
5. Compare the exact evidence and reviewed support policy.
6. If and only if policy is unknown, admit an explicit untested override after all prior gates pass.
7. Reauthenticate a replaceable selected command by full executable content identity, normally a
   digest, immediately before provider launch.
8. Create staging and begin provider work only after admission and reauthentication.

Operation-independent observations may be cached in a Layer. Target-dependent capabilities and
relations wait until the request supplies a target. Expensive probes need not repeat when their
authority/cache key cannot change. The complete cache key includes content identity, provider,
operation, lane, host, target, capability-schema revision, policy revision, and relation/profile
inputs.

The public escape remains one Layer option such as `allowUntestedVersion: true`. It grants policy
uncertainty authority only:

```text
unknown coordinate
  + required capabilities present
  + every relation and peer/profile requirement satisfied
  -> untested-override
```

It cannot override a known hole, missing/indeterminate capability, relation failure, peer/profile
failure, ambiguous selection, or changed selected bytes. The result emits one stable warning and
records the exact identity plus `untested-override` status.

## Remaining empirical work

- determine a reliable Deno channel/acquisition observation; if unavailable, retain binary digest
  and acquisition provenance rather than inferring channel from version;
- prove Bun revision/binary-variant observation on each applicable host;
- prove esbuild package/native coherence failures and selected-CLI distinction;
- execute Node SEA direct and legacy relation matrices;
- execute Deno/denort cold, cached, offline, explicit-base, and mismatch cases; and
- prove replacement detection between Layer acquisition and launch without redundant probing.
