# Working in this repository

effect-build binds native command-line tools as ordinary Effect services. A binding's `make` resolves its executable
once with `Tool.make` and returns `Effect.fn` methods. Runs decode output and check exit; streams acquire lazily and
check exit before completion; sessions return the platform handle in the caller's Scope.

## Engineering charter

- Core owns the portable `Tool` kernel, explicit path-based opt-ins, and `effect-build/testing` defaults over the
  platform's spawner constructors. First-party binding packages depend only on core, never on a sibling.
- Native options and diagnostics stay native. An explicit executable is used as given; otherwise one deterministic
  PATH walk selects a runnable candidate. Never install, retry another candidate, fall back, or substitute at call time.
- Version checking is an optional, warn-only construction probe, with ignored stdin and an Effect deadline. Probe
  failure, timeout, or an untested version logs one warning and never rejects a tool.
- Atomic publication, native-header checking, digests, environment replacement, and portable layout checking are
  chosen explicitly. Files stage privately under the destination's parent and commit with one rename; directories
  commit each produced file with its own rename, preserving native overwrite behavior and unrelated files.
- A ToolError has five real tagged reason classes. It never stores argv, env, or stdout. Platform errors and decoder
  causes are rebuilt into safe diagnostics; bounded stderr removes every supplied Redacted value before tail trimming.
- Library source has no `node:*` imports, `process.*` reads, `Effect.run*`, casts, or `any`. Applications provide platform
  layers. Validate only at real public decoding boundaries; preserve interruption, defects, and separately observed
  cleanup causes.
- The public surface is asserted against `tooling/public-api.json`; regenerate deliberately with public changes.
- `bun run verify`, installed consumers, and affected real-tool tests must pass before merge. The supported OS and
  real-tool CI matrix is required before release. Prepare versions and release notes without publishing.

## Working rules

Read CONTRIBUTING.md and installed effect/AGENTS.md, ai-docs, declarations, and implementation for relevant APIs.
Use isolated worktrees for parallel work; agents own disjoint files and one integrator owns shared exports and errors.
Preserve other people's work. Stage only changed paths. Code, configuration, and Git record implementation; PRs record
validation and deliberate departures. Do not create plan documents, receipts, compatibility shims, or replacement
platform abstractions. Historical plans and research have no authority.

Use real Node on PATH and umask 022. Install with the frozen lockfile. Fix strict lint findings and remove obsolete
legacy exceptions; never add legacy entries or weaken policy. Keep credentials, generated media, tarballs, and build
output out of Git. Do not push to main, tag, publish, deploy, change provider selections, or spend money without explicit
authorization. Only the existing release workflow publishes.
