# effect-build engineering charter

- effect-build turns an Effect application into deployable artifacts — native executables and bundles via Bun, Deno, esbuild, and Node SEA — as composable Effect programs. Build capability users actually want; prefer shipping a reviewed increment over deferring it.
- Five lockstep packages: `effect-build` (core) owns `Target`, `Artifact`, `BuildError`, and the `Toolchain` kernel; each provider depends one way on core and never on a provider sibling.
- Provider options and diagnostics stay native to their tool. Tool selection is resolve-once: an explicit path wins, otherwise one deterministic PATH walk. Never install, retry another candidate, fall back, or substitute at operation time.
- Version policy is warn-only: probe the tool once at layer construction, log one warning outside the CI-tested range, and let real failures surface as `ToolFailed` with the tool's own diagnostics. No admission gates, no host gates, no fail-closed ceremonies.
- Validate at the public boundary only; never re-validate values TypeScript already guarantees. Errors are the small closed set in `effect-build/BuildError` plus provider-native wrappers; give every error real fields and a readable `message`.
- Publication is stage in a private same-parent temp dir → produce → 4-byte native-magic sanity check → one atomic rename. No double observation, no re-hashing of tools, no TOCTOU defenses.
- Library source must not import `node:*` or call `Effect.runPromise` under `packages/*/src`; applications provide the platform layer.
- The public surface is asserted against `tooling/public-api.json`; regenerate it deliberately in the same change as the code.
- `bun run verify` green is the bar for merging. The CI matrix (ubuntu/macos/windows plus real-tool integration) is the bar for releasing; releases publish from main with npm provenance when the matrix is green and the version is new.
- `plans/` and `research/` are historical records with no authority over current work. Propose changes as PRs with tests, not plan documents or receipts.
