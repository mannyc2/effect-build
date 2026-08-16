# Plan 044: Hard-cut and certify the 0.4 public architecture

## Status

- Priority: P0 public cut
- Effort: XL
- Risk: CRITICAL breaking package/API migration
- Depends on: Plans 039-043 and explicit maintainer approval for the public cut
- Planned at: `3c318072cec6debd7c5eae6de14b20c8df4b1842`
- Status: TODO

## Objective

Perform one coordinated pre-1.0 hard cut from the released 0.3 provider-first
surface to the selected native-capability architecture, then certify one exact
five-package 0.4 candidate without publishing it.

Plan 044 is the only plan that may delete the temporary 0.3 delegates, rename
public artifact fields, replace package export maps, rewrite canonical docs and
examples, and update repository governance.

It does not publish packages, create a tag or GitHub Release, or modify trusted
publishing. Release activation requires a separately approved release plan.

## Target public surface

### `effect-build`

```text
.
./Command
./TemporaryOutput
./Executable
./CommandCompiler
./Profile/SingleNodeProgram
```

Root application vocabulary:

```text
Artifact
BuildError
BuildStepObservation
Diagnostic
MatrixError
SystemTarget
```

### `effect-build-bun`

```text
.
./Api
./Command
./Profile/SingleNodeProgram
```

### `effect-build-deno`

```text
.
./Api              # only if Plan 042's upstream gate passed
./Command
```

### `effect-build-esbuild`

```text
.
./Api
./Profile/SingleNodeProgram
```

### `effect-build-node-sea`

```text
.
./Command
./Recipe/SingleNodeProgram
```

Package roots may re-export lane namespaces for discovery, but documentation
uses the canonical explicit subpaths.

## Required removals and renames

Delete without compatibility aliases:

```text
effect-build/Integration
effect-build/Provider
JavaScriptBundle.Artifact
withJavaScriptBundle
root-generic NodeProgramBundler proposal
ambiguous provider Compiler service names
```

Rename:

```text
StageObservation -> BuildStepObservation
stages           -> steps
artifact target  -> systemTarget
AbsolutePath     -> Artifact.LocalPath for observed durable outputs
```

Move:

```text
compileExecutable       -> provider Command module
compileExecutableMatrix -> provider Command module
```

Broaden:

```text
Node SEA direct input -> existing bundled main file plus supported SEA config
Esbuild -> build + transform + scoped context
Bun -> host API build/compile + command build/compile
Deno -> host API bundle where gated + command bundle/compile
```

Add:

```text
SingleNodeProgram portable profile
Bun and Esbuild profile Layers
Node SEA provider-neutral recipe
native Effect tracing/logging annotations
```

## Documentation cut

Rewrite the product documentation around this order:

1. provider-native APIs;
2. command versus host API lane selection;
3. durable artifacts and shared lifecycle guarantees;
4. optional portable profiles;
5. recipes and application composition;
6. integration authoring;
7. observability;
8. exact support and provider-version evidence.

The README must not lead with the Node SEA pipeline as the definition of the
library. It should present it as one recipe after provider-native examples.

Preserve historical Plans 001-043 and audits. Update `AGENTS.md`, the public API
lock, architecture tests, docs contracts, changelog, and examples in one cut.

## Migration guide

Document exact 0.3 to 0.4 replacements:

```ts
// 0.3
Bun.compileExecutable(input)

// 0.4
BunCommand.compileExecutable(input)
```

```ts
// 0.3
Esbuild.withJavaScriptBundle(request, use)

// 0.4 direct profile
EsbuildApi.withSingleNodeProgram(request, use)

// 0.4 portable profile
SingleNodeProgram.withProgram(request, use)
```

```ts
// 0.3
NodeSea.createExecutable({ main: liveArtifact, outfile })

// 0.4 direct provider
NodeSeaCommand.createExecutable({
  main: { path, format: "module" },
  outfile
})

// 0.4 recipe
NodeSeaSingleProgram.createExecutable({
  program: request,
  outfile
})
```

Explain why no automatic compatibility layer exists: preserving old roots would
create duplicate canonical representations and obscure the new lane/profile
boundaries.

## Certification matrix

### Deterministic source and type gates

- build all five packages;
- noEmit checks;
- exact runtime/declaration export lock;
- source ownership and one-way dependency tests;
- lint, format, and diff checks;
- exact Effect peer endpoint consumers.

### Host API lanes

- Bun host API build and compile;
- Deno host bundle if Plan 042 passed;
- Esbuild build, transform, and scoped context;
- provider API unavailable behavior under unsupported hosts.

### Command lanes

- Bun build, scalar compile, and matrix;
- Deno bundle, scalar compile, and matrix;
- Node SEA direct main-file assembly;
- active-child interruption and watch-resource cleanup;
- exact tool selection and no fallback.

### Provider capabilities

- multiple entries and outputs where supported;
- browser/Node/Bun/Deno targets where supported;
- HTML/CSS/assets;
- plugins/loaders;
- splitting;
- in-memory and written outputs;
- structured diagnostics and provider metadata;
- cross-target executables;
- current supported system-target matrix.

### Portable profile

- unchanged application under Bun and Esbuild Layers;
- ESM/CJS;
- direct provider escape hatches;
- borrowed expiry and duplicate-core tests;
- exact Cause preservation;
- real Bun/Esbuild -> Node SEA recipes.

### Publication lifecycle

- Linux, macOS, and Windows staging/atomic replacement;
- native ELF/Mach-O/PE inspection;
- target mismatch;
- locked destination;
- pre-rename interruption leaves destination unchanged;
- post-rename point-of-no-return behavior;
- optional digest cost remains explicit.

### Packed consumers

At minimum:

```text
core root
each core author subpath
Bun Api
Bun Command
Bun profile
Deno Api when present
Deno Command
Esbuild Api
Esbuild profile
Node SEA Command
Node SEA recipe
generic Bun recipe
generic Esbuild recipe
all direct compiler matrices
```

Exercise both npm and Bun installers from once-packed exact tarballs.

## Steps

1. Require explicit maintainer approval for the hard public cut.
2. Freeze one exact descendant source SHA with Plans 039-043 complete and green.
3. Replace package export maps and root namespaces atomically.
4. Delete 0.3 delegates, aliases, old declaration names, and stale examples.
5. Rename artifact fields/types and migrate every provider/test/example.
6. Update `AGENTS.md`, architecture docs, API docs, error docs, driver docs,
   README, package READMEs, and changelog.
7. Update exact public API and import-boundary fixtures.
8. Add the complete certification matrix above.
9. Pack all five packages once from the exact source SHA.
10. Install and run every isolated/composed consumer from those tarballs.
11. Observe all required GitHub Actions on that exact SHA.
12. Record a candidate manifest and hashes without publishing, tagging, or
    creating a release.
13. Present the certified candidate and any Deno API gate result for separate
    release approval.

## Invariants

- Exactly five lockstep public packages remain.
- No integration imports a sibling.
- Provider-native APIs remain direct and rich.
- Portable profile remains optional and narrow.
- No generic provider registry, fallback, executor, plan, cache, or CAS appears.
- No old and new canonical import paths coexist after the cut.
- Every advertised capability has a required non-skipping test at the stated
  host/tool boundary.
- The candidate tarballs tested are the exact bytes later eligible for release.
- This plan itself performs no external publication mutation.

## Verification

```sh
bun run build
bun run check
bun run test:types
bun run test:unit
bun run test:architecture
bun run verify
bun run verify:effect
bun run verify:real
git diff --check
```

Also require the repository's exact-candidate and packed-consumer workflows on
one source SHA. Record workflow IDs, job conclusions, candidate artifact hash,
and tarball hashes in the completion receipt.

## STOP conditions

Stop before the cut if:

- any Plan 039-043 implementation is incomplete or its required checks are not
  green;
- maintainer approval for the breaking public cut is absent;
- a provider-native operation is omitted merely to reduce export count;
- old aliases are proposed as a shipped compatibility tier;
- Deno `Api` is exported despite failing Plan 042's gate;
- the generic profile becomes a dependency of a provider's direct API;
- exact packed consumers do not use the once-packed candidate bytes;
- a release/tag/publish/trust mutation would be required to complete
  certification.

## Completion receipt

Record:

- exact source SHA;
- exact public runtime/declaration keys;
- removed and added import paths;
- Effect and provider versions;
- all required workflow runs/jobs;
- candidate archive and tarball hashes;
- packed consumer count and results;
- unresolved release-only decisions.

`DONE` means a certified unpublished 0.4 candidate, not a registry or GitHub
release.
