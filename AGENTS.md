## 1. Rules for this work

1. **One artifact type.** `Artifact.File | Artifact.Executable | Artifact.Directory`.
   Every operation accepts these and returns one of these. No package defines a
   second identity, digest, path, or byte-count type. `bytes` is a `number`.
2. **Defenses are combinators or options, never services.** `Commit.atomic`,
   `Executable.expectTarget`, `Tool.requireVersion`, `Artifact.verify`. There is no
   `Policy`, no admission, no reauthentication, no claim registry.
3. **Core stays domain-free.** Core knows about files, executables, directories,
   tools, and rename. It does not know about Bun, zip, wheels, or Apple. A concept
   enters core only when two packages need it for the same reason.
4. **An edge case in one provider is fixed in that provider.** Node SEA's temp tree,
   Bun's `.exe` suffix, Deno's basename rule: local, not core.
5. **Vocabulary.** Artifact, target, tool, build, compile, bundle, package, sign,
   commit, verify. Not: observation, admission, durable, borrowed, finalizer, claim,
   adoption, lane, provenance (it's `producedBy`), publication.
6. **Every PR description states one thing a user can do that they couldn't before,
   or one thing deleted.** No PR whose description is only "certify", "audit",
   "harden", or "establish".
7. **Delete, don't deprecate.** No aliases, no compatibility exports, no
   `@deprecated`. Version is 0.7.0 for every package.
8. **Tests test behavior on real files.** Compile a real hello.ts, read the real
   header, rename a real file. Unit-test the header parser with byte fixtures. No
   tests that assert the shape of the public API, the contents of a contract file,
   or the workflow YAML.

Read `DESIGN.md`.
