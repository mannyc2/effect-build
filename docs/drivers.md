# Integrations

## Provider-native lanes

**Bun** currently provides executable compilation and direct directory
bundling. Its native browser target, format, splitting, external, project
configuration, and diagnostics remain provider-specific. Direct bundle output
is incremental and does not create a portable browser application.

**Deno** currently provides executable compilation with typed permissions and
direct directory bundling with a native browser or Deno platform selector. The
required v0.5 promotion point is exactly Deno 2.9.5; `platform: "browser"` does not by
itself prove the portable profile. Empty permission arrays will be rejected in
the compatibility stage.

**esbuild** keeps one-shot in-memory build/transform/analyze operations and its
scoped native incremental context. Its provider-specific cancel/dispose
sequence is distinct from portable process-tree containment.

**Node SEA** currently drives `node --check` and `node --build-sea` over a file
or byte main, optional assets, and an inferred host. This becomes the truthfully
named `Raw` lane. The separate portable `NodeMainExecutable` lane uses one
authenticated Node 26.7.0 base, one exact assembler agreement, sealed staged
inputs, no assets, and evidence-backed targets. On macOS its exact-target
finalizer performs only ad-hoc, no-timestamp runnable-Mach-O repair. Developer
ID identity, entitlements, hardened runtime, containers, notarization, stapling,
and distribution assessment are expressly outside Node SEA.

**Rolldown** keeps scoped native Build operations. Watch delivery retains one
pending completed result and coalesces to the latest with an explicit
superseded count. The adapter closes each native result before delivery, awaits
the watcher close during stream shutdown, and preserves cleanup failures in
Effect Cause.

**Apple distribution** is the separate target-only `effect-build-apple`
package. Its closed direct-distribution subpaths are `Artifact`, `CodeSign`,
`AppBundle`, `Zip`, `DiskImage`, `InstallerPackage`, `Notary`, `Staple`, and
`Assess`. Mutating operations preserve immutable caller inputs and return new
digest-addressed artifacts after pre-work and pre-publication revalidation;
Notary resumes by submission ID without blind resubmission, and assessment
returns observations bound to unchanged bytes.
Developer ID Application and Installer identities remain distinct. The initial
installer package is one authenticated `.app` component with explicit
identifier, version, and install location, an exact Installer identity,
`pkgbuild` with a mandatory timestamp, and `pkgutil` verification.
`productbuild`, `productsign`, multi-component packages, and installer scripts
remain outside this API. Exact Notary JSON/status decoding and detailed receipt
and evidence shapes remain provisional through credential-backed A7 fixtures.
Exact
toolchain pins, credentials, both macOS architectures, product-form proofs, and
quarantined clean-host Gatekeeper exercises are release-blocking. Mac App Store
and universal-binary construction are separate unsupported scopes.

Selected-command native layers still prefer an explicit executable and
otherwise perform one deterministic PATH search. They never install or
substitute a tool. Native permissiveness does not admit a portable operation:
portable profile identity, exact evidence, and pre-commit analysis gates apply
separately.

## Portable adapters

Bun 1.3.14, esbuild 0.28.2, and Rolldown 1.2.5 are the intended Node-main
producer cells and the candidate static-browser provider cells. The portable
Node consumer and portable browser consumer each contain zero provider-name
branches. Deno remains native-only for browser work until authoritative
metadata completeness is proved through an explicit contract revision.
