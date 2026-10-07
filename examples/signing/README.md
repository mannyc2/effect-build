# Credentialed signing examples

These application entry points compose the current native services. Normal verification
typechecks them; the manually dispatched [signing workflow](../../.github/workflows/signing.yml)
runs them on the native host with the caller's existing identities.

- [Apple](src/apple.ts) compiles a CLI inside an application-owned `.app` layout, applies
  Bun's documented engine entitlements and a hardened-runtime Developer ID signature,
  verifies and runs it, archives it with ditto, submits it with an App Store Connect API key,
  requires an accepted native status, staples and validates the app, and recreates the ZIP.
- [Windows](src/windows.ts) compiles a native executable, signs it with the selected Trusted
  Signing library and metadata, timestamps it, verifies it, and runs it.

Both leave final output under `examples/signing/dist`. Credentials and executable selections
come through Effect `Config`; the workflow retains temporary keychain import, API-key-file
handling, and Azure login. The example owns the bundle layout and notarization status policy.

The Apple permissions follow [Bun's signing guide](https://bun.sh/guides/runtime/codesign-macos-executable).
Archive and ticket steps follow [Apple's notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).
Neither entry point is run as a credential-free test.
