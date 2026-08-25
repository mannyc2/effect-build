# effect-build research-complete engineering charter

The authoritative product scope is `effect-build/research-complete-contract@1`
in `tooling/research-complete-contract.json`. It is generated from the complete
research ledger. `tooling/v05-contract.json` is a superseded implementation and
release-control snapshot; neither it nor the current public surface may narrow
the accepted research scope.

- Account for all 67 R1 operations: 5 mandatory, 22 positive proof-gated, 27
  valid conditional gates, 11 rejected, and 2 direct-SEA-superseded. Close every
  valid named gate and implement every passing result. Keep the portable Node
  and browser profiles as package-private candidates, run the separate
  IncrementalNodeMain and typed-watch gates, and keep the direct-Developer-ID operation family in
  `effect-build-apple`.
- Provider packages hard-cut to root `Api` and `Command` namespaces backed by
  operation-specific modules under `src/Api/*` and `src/Command/*`. Omit a lane
  only when no valid operation exists; do not manufacture mirrored twins. The
  old `Build`, `Bundle`, `CompileExecutable`, `Context`, `Profile`, `Raw`, and
  `Watch` subpaths are absent and must not return as aliases.
- Six admitted packages remain lockstep: `effect-build`, `effect-build-apple`,
  `effect-build-bun`, `effect-build-deno`, `effect-build-esbuild`, and
  `effect-build-node-sea`. Providers depend one way on core and never on a
  provider sibling. `effect-build-rolldown` is a package-private conditional
  candidate and has no release-coordinate or publication authority.
  Applications still select one explicit provider Layer; there is no registry,
  retry, fallback, substitution, or automatic install.
- The public `effect-build/Toolchain` callback kernel is deleted. Do not add
  uses, aliases, or a compatibility facade. Built-in and
  out-of-tree adapters use the role-specific Author protocols and must pass
  their laws.
- Treat provider-direct directory output as incremental and capable of leaving
  a mixed destination. The package-private durable path observes one quiescent
  regular-file tree, seals an immutable content-addressed generation, and
  atomically replaces only `current.json`. Never claim atomic replacement of an
  ordinary non-empty output directory or expose generation publication as
  public authority.
- The portable Node profile accepts one sealed CommonJS or ESM main, no assets,
  no plugins, no snapshots, and no code cache. It advertises only exact Node
  26.7.0 cells with authenticated bases, structural inspection, and target-run
  evidence. Cross-target finalization is the private, schema-bound
  `effect-build/node-target-finalizer@1` repository matrix capability, not a
  public callback or ordinary-library result. The current host-native operation
  is `Command.AssembleExecutable`; the legacy `Raw` lane is absent. Its macOS
  `codesign --sign -` step
  is only ad-hoc, no-timestamp runnable-Mach-O repair; it never owns a Developer
  ID identity, entitlements, hardened-runtime policy, Apple containers,
  notarization, stapling, or distribution assessment.
  Those portable-profile exclusions do not reject the separately gated
  provider-native Node asset/runtime lookup modes or the package-private direct
  SEA code-cache, startup-snapshot, and explicit execArgv-policy candidates.
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
  portable browser result. `BrowserModulePayload` owns explicit entries,
  provider-declared graph evidence, file roles and media types, and a scoped
  hashed borrowed tree. It never generates HTML, infers names, rewrites output,
  or publishes a durable generation.
- Hard interruption is promised only for schema-serializable portable jobs in
  an owned OS process tree. Native callbacks, plugins, and handles retain
  provider-specific cancellation. Interruption stays in Cause and is never
  rewritten as a typed build error.
- Native provider watchers retain their provider-specific ownership laws. The
  separate package-private typed-watch candidate accepts only typed host events,
  uses explicit input/output sets, bounded dirty coalescing, rename-boundary
  projection, and successful-build dependency updates. Preserve finalizer
  failures in Cause; never swallow them or parse CLI text into portable events.
- Compatibility claims name exact executed points. Installable dependency
  ranges are not execution evidence. The required points and all five
  construction/certification hosts live in the research-complete contract and
  later in generated compatibility manifests. Pin the Deno
  promotion lane to 2.9.5 and reject every present empty permission list before
  provider work. Execute every supported frozen Cartesian coordinate; record an
  unsupported cell as an explicit exclusion and never count it as a pass. Apple
  promotion additionally requires A0 through A9, the
  exact 14-cell credential-backed macOS x64/arm64 distribution matrix, and the
  exact eight-cell quarantined clean-host Gatekeeper matrix.
- Candidate construction may become automatic and read-only. Publication
  requires manual dispatch plus protected `npm` environment approval and the
  fixed ordered six-package convergence protocol. The environment admits only
  `refs/heads/main` and the exact recovery ref `refs/tags/v0.5.0`, has exactly one
  configured User reviewer entry, requires one non-self approval, disallows
  administrator bypass, and must be read back before unquarantine and every
  publication attempt. The release workflow remains quarantined until those
  controls and every external prerequisite are earned. A green main run, merge,
  or certification does not authorize publication. Certification is a separate
  post-candidate workflow and Actions artifact; protected release inputs bind its
  run ID, attempt, artifact ID, and REST digest. Its protected environment also
  owns distinct approved primary and clean-host certifier path/SHA-256 pairs;
  execute only an authenticated read-only temporary snapshot, authenticate and
  privately snapshot the exact prior-evidence dependency set, and accept only
  canonical category-specific Apple certification protocol `@2` evidence. Live
  same-UID runner isolation and certifier interpreter/toolchain identities remain
  external gates. Before npm, stage one exact
  tag/draft, one `effect-build/release-escrow@2` container holding the descriptor,
  payload, and certification wrappers, and eight final assets: the six tarballs,
  one `effect-build/release-manifest@2`, and the opaque
  `effect-build-v0.5.0-apple-certification.bin`. That is nine staged assets including
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
  not product scope. The research-complete contract maps each current export to
  a semantic owner and separately defines the target provider lanes. Regenerate
  and validate both projections in every API-changing stage.
- Use Bun 1.3.14. `bun run verify` is the local merge gate; the pinned CI and
  exact integration cells are the promotion gates.
- Do not introduce a generic build algebra, deployment manager, provider
  registry, release graph, or compatibility fallback. The closed
  `effect-build-apple` operation family is not a generic deployment manager.
- `plans/` and `research/` are immutable provenance inputs. Reconcile product
  authority through the generated research-complete contract, source, tests,
  and authoritative docs; never hand-edit the generated contract.
