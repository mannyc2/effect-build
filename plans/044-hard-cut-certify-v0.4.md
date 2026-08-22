# Plan 044: Hard-cut and certify the frozen 0.4 candidate

## Status

- Priority: P0 public API cut and certification
- Effort: XL
- Risk: CRITICAL export maps, declarations, consumers, and candidate bytes
- Depends on: completed Plans 039-043
- Status: TODO
- Publication authority: NONE

## Objective and authority

Perform one coordinated hard cut to the exact package/subpath/export/support
map in `research/post-0.3/freeze/SURFACE.json` and every retain/replace/remove
row in `research/post-0.3/freeze/MIGRATION.json`. Certify one exact unpublished
five-package 0.4.0 candidate. Do not publish, tag, merge, create a release, or
mutate npm/trusted-publisher state.

## Preconditions

1. Plans 039-043 each have an exact completion SHA and green plan-specific
   receipts, with their new implementation paths still export-inert and the
   released 0.3 export map unchanged.
2. Production ancestry descends from `v0.3.0`; no unrelated source overlaps
   the hard cut.
3. The freeze-time surface and migration validators are authenticated at the
   freeze SHA without regeneration drift. A separate candidate-conformance
   validator proves the production implementation matches those immutable
   artifacts; it must not restamp the freeze validator after production bytes
   change.
4. Every selected support cell has direct current execution; no range or host
   inference is used.
5. The successful research-only freeze certificate is authenticated at its
   exact immutable freeze SHA; it is not restamped on a production-changing
   candidate.
6. The workflow-only phase handoff required by Plan 039 is green, and freeze,
   implementation, and candidate-conformance receipt profiles are disjoint.
   Current-head candidate receipts must not contain `surface-freeze`; the
   historical freeze certificate and its receipts live only in a separately
   authenticated input section. Only `candidate-conformance` is reproduced at
   the candidate SHA.

## Required cut

1. Replace all package export maps and declaration allowlists in one commit.
   Roots contain only the frozen namespace re-exports; subpaths contain exactly
   the frozen members.
2. Apply every migration row exactly once. Delete removals and implement exact
   replacements without deprecated aliases, hidden proxy modules, dual root
   behavior, or legacy runtime fallback.
3. Update documentation, examples, type tests, architecture tests, and packed
   consumers to the new imports and matrix report.
4. Set all five packages to 0.4.0 with exact same-version core peers and
   one-way provider-to-core dependencies. Keep provider siblings independent.
5. Pack each package once. Generate the candidate manifest from those bytes;
   every consumer and certification job uses the exact same tarballs.
6. Produce a fail-closed exact-head candidate certificate that joins ordinary
   CI, the authenticated freeze-certificate SHA and artifact digest,
   plan-specific implementation receipts, candidate repository scope, fresh
   remote head, public API, migration completeness, and packed consumers.
7. Install the once-packed core tarball into the external Author adapter and
   rerun its duplicate-core rent/lifecycle suite against the exact candidate
   bytes, not a Plan 039 workspace build.

## Required verification

- `bun run verify`
- every Bun, Deno, Esbuild, Node SEA, target, Effect endpoint, and publication
  host job applicable to the frozen support cells
- negative runtime and declaration checks for every removed root/subpath/name
- fresh npm and Bun consumers of all five once-packed candidates
- the external Author adapter using the exact once-packed core candidate
- actual Windows open-image destination-lock and descendant-termination gates
- authentication of the complete research-only receipt set at the exact freeze
  SHA, plus complete implementation receipts at the exact candidate head
- a zero diff between tested tarballs and the candidate manifest subjects

Any failure blocks the candidate. It may trigger an explicit revision to the
frozen surface, but Plan 044 may not silently omit the failing operation or
support cell and certify the accidental remainder.

## Completion boundary

Completion means one exact unpublished candidate and its receipts exist. npm
publication, tags, GitHub Releases, merge, release-branch activation, and the
orphan evidence-ref writer each require separate explicit authorization.
