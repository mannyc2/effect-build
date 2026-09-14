# effect-build

effect-build runs build tools as composable Effect programs. Producers return verified,
hashed artifact records; queries return values; remote operations return typed references
and outcomes when they change or attest to bytes. Publishing belongs to ts-release.

## Working here

- `bun install --frozen-lockfile`, then `bun run verify` (build, typecheck, lint,
  unit tests, examples). It must be green before you push.
- Real-tool tests: `bun run test:integration:*`. They need the tool installed;
  CI runs them on Linux. See `CONTRIBUTING.md` for the commands.
- Read `DESIGN.md` before changing a public signature. It's short.

## Rules

1. **One artifact type.** `Artifact.File | Artifact.Executable | Artifact.Directory`.
   Every producer returns one of these and composes through these records. No package defines its own
   identity, digest, path, or size type. `bytes` is a `number`.
2. **Defenses are combinators or options, never services.** `Commit.atomic`,
   `Executable.expectTarget`, `Tool.requireVersion`, `Artifact.verify`. If you need
   a service to hold a decision, make a combinator instead.
3. **Core is domain-free.** It knows files, executables, directories, tools, and
   rename. It does not know Bun, zip, wheels, or Apple. A concept enters core only
   when two packages need it for the same reason. A provider is core's shape for wrapping a tool;
   first-party providers are instances of it, not privileged.
4. **Provider edge cases stay in the provider.** Bun's `.exe` suffix, Deno's basename
   rule, Node SEA's temp tree: local, not core.
5. **Vocabulary.** Artifact, target, tool, build, compile, bundle, package, sign,
   commit, verify, provider, constraint, cache. Not: observation, admission, durable, borrowed, finalizer, claim,
   adoption, lane, publication, provenance (it's `producedBy`).
6. **Delete, don't deprecate.** No aliases, no compatibility exports, no `@deprecated`.
7. **Tests test behavior on real files.** Compile a real program, read the real
   header, rename a real file. No tests that assert the shape of an API or the
   contents of a workflow file.
8. **No plan documents.** A change is described by its commit message and, if it's a
   durable decision, one line under "Decided" in `DESIGN.md`. No document may be
   longer than the code it describes.

## Layout

`packages/effect-build` is core. Every other package wraps one external toolchain
or one domain and depends on core only. Binary providers declare a named `Context.Service` and pass it to
`Tool.provider(Service, spec)`: tool identity, version policy, tested versions, constraints,
host requirements, and an optional service extension. The factory owns resolution and layers;
operations own typed inputs, native options and output validation. In-process bundlers keep their
native APIs. Rejected input is `Tool.InputInvalid`; rejected versions are
`Tool.VersionUnsupported` naming the operation. Sections read in one order: service,
declaration, then operations. Provider conformance lives in `effect-build/testing`.
