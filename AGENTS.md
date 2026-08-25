# effect-build engineering charter

The authoritative v0.5 target is `effect-build/v0.5-contract@1` in
`tooling/v05-contract.json`. The current source is transitional until the
ordered hard cut is complete.

- Keep provider-native operations, add only the two closed portable
  profiles `effect-build/profile/node-main@1` and
  `effect-build/profile/static-browser-application@1`, and add the separate
  closed direct-Developer-ID operation family in `effect-build-apple`.
- Seven packages remain lockstep. Providers depend one way on core and never
  on a provider sibling. Applications still select one explicit provider
  Layer; there is no registry, retry, fallback, substitution, or automatic
  install.
- Delete the public `effect-build/Toolchain` callback kernel in the Stage 2
  cut. Do not add uses, aliases, or a compatibility facade. Built-in and
  out-of-tree adapters use the role-specific Author protocols and must pass
  their laws.
- Treat current `Artifact.Bundle` output as incremental and capable of leaving
  a mixed destination. The v0.5 durable path is exactly `TreeSnapshot` to
  immutable `DirectoryGeneration` to one atomically replaced
  `CurrentGeneration` reference. Never claim atomic replacement of an ordinary
  non-empty output directory.
- The portable Node profile accepts one sealed CommonJS or ESM main, no assets,
  no plugins, no snapshots, and no code cache. It advertises only exact Node
  26.7.0 cells with authenticated bases, structural inspection, and target-run
  evidence. Cross-target finalization is the private, schema-bound
  `effect-build/node-target-finalizer@1` repository matrix capability, not a
  public callback or ordinary-library result. Keep the current host-native
  operation under the truthful `Raw` lane. Its macOS `codesign --sign -` step
  is only ad-hoc, no-timestamp runnable-Mach-O repair; it never owns a Developer
  ID identity, entitlements, hardened-runtime policy, Apple containers,
  notarization, stapling, or distribution assessment.
- `effect-build-apple` exclusively owns direct Developer ID distribution
  mechanisms through its `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`,
  `InstallerPackage`, `Notary`, `Staple`, and `Assess`. Every mutator consumes
  authenticated immutable input, revalidates it immediately before work and
  staged output before publication, and returns new bytes, a new digest, and a
  provenance edge; Notary and assessment are digest-bound observations.
  The initial `InstallerPackage` form accepts exactly one authenticated `.app`,
  explicit identifier/version/install location, an exact Developer ID Installer
  identity, `pkgbuild` with a mandatory timestamp, and `pkgutil` verification.
  Do not add `productbuild`, `productsign`, multi-component packages, or
  installer scripts without a later explicitly funded API.
  Applications and release systems still own product form, channel, identity,
  entitlements, credentials, approval, retries, publication, and retention.
  Mac App Store distribution and universal-binary construction are separate and
  unsupported in v0.5. The Apple owning stage has frozen its selected
  operation/service names, non-Notary input/result structures, stored-data versus
  query-authority distinction, `Artifact.LifecycleError`, and tagged public error
  constructors. Only exact Notary provider JSON/status decoding and detailed
  Notary receipt/reconciliation-evidence shapes remain provisional through
  credential-backed A7 and may still break before release.
- A native Bun or Deno browser selector is provider-specific behavior, not a
  `StaticBrowserApplication`. The portable browser profile owns generated HTML,
  complete graph evidence, explicit resources and media types, relative
  generation-qualified URLs, and three-engine execution.
- Hard interruption is promised only for schema-serializable portable jobs in
  an owned OS process tree. Native callbacks, plugins, and handles retain
  provider-specific cancellation. Interruption stays in Cause and is never
  rewritten as a typed build error.
- Watch delivery has one pending completed result, coalesces to the latest with
  an explicit superseded count, and globally permits one live resource and one
  outstanding awaited close per build/watcher/result kind in each watch stream,
  three outstanding closes total. Preserve cleanup failures in Cause; never
  swallow them.
- Compatibility claims name exact executed points. Installable dependency
  ranges are not execution evidence. The required points and host cells live in
  the contract and later in the generated compatibility manifest. Pin the Deno
  promotion lane to 2.9.5 and reject every present empty permission list before
  provider work. Execute every frozen Cartesian coordinate; never prune a cell
  as “not applicable.” Apple promotion additionally requires A0 through A9, the
  exact 14-cell credential-backed macOS x64/arm64 distribution matrix, and the
  exact eight-cell quarantined clean-host Gatekeeper matrix.
- Candidate construction may become automatic and read-only. Publication
  requires manual dispatch plus protected `npm` environment approval and the
  fixed ordered seven-package convergence protocol. The environment admits only
  `refs/heads/main` and the exact recovery ref `refs/tags/v0.5.0`, has exactly one
  configured User reviewer entry, requires one non-self approval, disallows
  administrator bypass, and must be read back before unquarantine and every
  publication attempt. The release workflow remains quarantined until those
  controls and every external prerequisite are earned. A green main run, merge,
  or certification does not authorize publication. Certification is a separate
  post-candidate workflow and Actions artifact; protected release inputs bind its
  run ID, attempt, artifact ID, and REST digest. Before npm, stage one exact
  tag/draft, one `effect-build/release-escrow@2` container holding the descriptor,
  payload, and certification wrappers, and nine final assets: the seven tarballs,
  one `effect-build/release-manifest@2`, and the opaque
  `effect-build-v0.5.0-apple-certification.bin`. That is ten staged assets including
  escrow. The manifest embeds the canonical Apple certification index and exact
  certification-artifact subject. Candidate freshness is required through initial
  preflight; later expiry or Actions artifact deletion may use only identical
  wrapper bytes from the verified escrow. The coordinator treats A7 Notary
  provider JSON/status and detailed receipt/reconciliation-evidence bodies as
  opaque and provisional while authenticating their enclosing bytes.
- Keep library source Effect-platform-neutral: no `node:*` imports or
  `Effect.runPromise` under `packages/*/src`; applications provide one official
  platform Layer.
- `tooling/public-api.json` is generated evidence for the current built source,
  not the v0.5 target. Stage 0 freezes roots and subpaths only; each owning stage
  must freeze its exact symbols before first export. Regenerate the snapshot in
  every API-changing owning stage, beginning with the Stage 2 source cut.
- Use Bun 1.3.14. `bun run verify` is the local merge gate; the pinned CI and
  exact integration cells are the promotion gates.
- Do not introduce a generic build algebra, deployment manager, provider
  registry, release graph, or compatibility fallback. The closed
  `effect-build-apple` operation family is not a generic deployment manager.
- `plans/` and `research/` are historical records. Change the product through
  source, tests, authoritative docs, and reviewed machine contracts.
