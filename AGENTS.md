# effect-build

effect-build compiles TypeScript into things you can ship — native executables,
bundles, archives, OS packages, wheels, signed Apple/Windows products, SBOMs — as
composable Effect programs, and returns a plain record of what it made. Publishing is
not its job; see `DESIGN.md` for the boundary and the reasoning.

## Working here

- `bun install --frozen-lockfile`, then `bun run verify` (build, typecheck, lint,
  unit tests, examples). It must be green before you push.
- Real-tool tests: `bun run test:integration:*`. They need the tool installed;
  CI runs them on Linux. See `CONTRIBUTING.md` for the commands.
- Read `DESIGN.md` before changing a public signature. It's short.

## Rules

1. **One artifact type.** `Artifact.File | Artifact.Executable | Artifact.Directory`.
   Every operation accepts these and returns one of these. No package defines its own
   identity, digest, path, or size type. `bytes` is a `number`.
2. **Defenses are combinators or options, never services.** `Commit.atomic`,
   `Executable.expectTarget`, `Tool.requireVersion`, `Artifact.verify`. If you need
   a service to hold a decision, make a combinator instead.
3. **Core is domain-free.** It knows files, executables, directories, tools, and
   rename. It does not know Bun, zip, wheels, or Apple. A concept enters core only
   when two packages need it for the same reason.
4. **Provider edge cases stay in the provider.** Bun's `.exe` suffix, Deno's basename
   rule, Node SEA's temp tree: local, not core.
5. **Vocabulary.** Artifact, target, tool, build, compile, bundle, package, sign,
   commit, verify. Not: observation, admission, durable, borrowed, finalizer, claim,
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
or one domain and depends on core only. Providers share a shape: a `Context.Service`
holding a `Tool.Resolved`, a `layer({ executable?, version? })`, and operations that
take `outfile`/`outdir` and return an `Artifact`.
