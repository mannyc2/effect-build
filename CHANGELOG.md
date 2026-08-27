# Changelog

## 0.5.0

Research-complete hard cut. Breaking throughout; 0.4.0 was never published.

- Replaced inherited provider subpaths with provider-native root `Api` and
  `Command` lanes. Bun now exposes its host Transpiler, Build, and executable
  compilation APIs plus command build/watch/compile operations. Deno exposes
  command transpile and compile operations. esbuild exposes its selected API
  and command breadth. Node SEA exposes command direct assembly. Rolldown's
  selected conditional operations are implemented in a private package; R6 did
  not admit public lane roots.
- Rebuilt public core around exactly `Artifact`, `SystemTarget`, `Matrix`,
  `Author/Tool`, `Author/BorrowedOutput`, and `Author/Executable`. Implemented
  Node-main and browser profiles as package-private candidates. Removed the generic
  `BuildError`, `Target`, callback-toolchain, legacy borrowed/generation/browser
  surfaces, and compatibility aliases.
- Added exact tool selection and launch reauthentication, scoped borrowed
  output, executable inspection, bounded deterministic matrices, offer-first
  sealed Node mains, and explicit provider-declared browser module payloads.
- Implemented package-private conditional candidates for immutable directory
  generations, incremental Node-main ownership, and the product-owned typed
  watch protocol. Conditional implementation does not promote a public surface
  or close external evidence.
- Added `effect-build-apple` with nine explicit direct-Developer-ID modules:
  `Artifact`, `CodeSign`, `AppBundle`, `Zip`, `DiskImage`, `InstallerPackage`,
  `Notary`, `Staple`, and `Assess`.
- Restored finite compatibility and compile/finalizer control planes over the
  research-mandated five construction hosts, including independent target
  runners, packed consumers, explicit unsupported exclusions, and both Node and
  Bun host runtimes where required.
- Added the fixed-six admitted-package candidate controls and the hostile-input,
  append-only orphan receipt-archive control plane. Implementation, local test,
  certification, merge, release approval, publication, and post-release
  verification remain separate authorities.

The local candidate does not claim remote matrix receipts, Apple credentials,
registry/trusted-publisher configuration, merge, tag, release, or publication.

## 0.4.0 (unpublished candidate)

Replaced the 0.3 public surface behind a freeze process; never published.
