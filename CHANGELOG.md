# Changelog

## 0.3.0 (unreleased)

The `0.3.0` candidate is a hard package-boundary cut from the published `0.2`
surface. It has not been published yet.

- Replace `effect-build/bun` and `effect-build/deno` with the separate
  `effect-build-bun` and `effect-build-deno` packages. There is no compatibility
  subpath fallback.
- Reject malformed untyped scalar compiler requests deterministically while
  preserving the source contract for valid TypeScript callers.
- Add continuation-scoped Bun and Esbuild JavaScript-bundle producers and
  explicit application composition with `effect-build-node-sea`.
- Preserve caller failure, interruption, and defect Cause structure across
  owned bundle cleanup, and make native executable inspection total over
  malformed input.
- Certify one five-package candidate once, verify its exact tarball bytes in
  locked npm and Bun consumers, and hand those same bytes to the qualified
  ordered release coordinator.

`JavaScriptBundler`, `ExecutableBuilder`, and `ExecutableAssembler` are not
promoted by this release. Provider-specific direct operations and explicit
application composition remain the public model.
