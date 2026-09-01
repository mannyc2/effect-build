# Plan 046: Repair Apple native probe admission

- **Status**: COMPLETE LOCALLY; UNCOMMITTED
- **Owner repository**: `mannyc2/effect-build`
- **Baseline**: merge commit
  `dd39bd6104645d79fa52f40d0bbf291b5bf8f3dc`
- **Scope**: the Apple tool-selection boundary and its local/native tests only
- **Authority**: local implementation and verification only; this plan grants
  no commit, push, credential, Apple submission, workflow-dispatch,
  publication, tag, or GitHub Release authority

## Problem

The Apple adapters currently treat exit code zero as the universal success
condition for native help/version probes. That assumption is false for the
real Apple tools used by the public layers: several documented usage/version
commands prove tool availability while returning a stable nonzero status.
Consequently, real CodeSign, DiskImage, InstallerPackage, Notary, Staple, and
Assess layers can fail during construction even when their tools are present.

This is a release-blocking selection defect, not permission to accept arbitrary
nonzero exits. The repair must preserve deterministic resolution,
pre-launch reauthentication, bounded output, typed errors, and the absence of
fallbacks or automatic installation.

## Hard-cut design

1. Define one package-private canonical probe specification per admitted Apple
   tool. Each specification owns the exact argv and exact admitted exit status.
2. Remove probe argv from `selectAppleTool` and every call site. A caller may
   select an admitted tool and capability but cannot create a second probe
   policy or pass arbitrary probe arguments.
3. Admit only the following currently observed native probe coordinates:

       plutil       ["-help"]      -> 0
       codesign     ["--version"] -> 2
       productsign  ["--version"] -> 1
       hdiutil      ["help"]      -> 0
       pkgbuild     ["--version"] -> 1
       productbuild ["--version"] -> 1
       pkgutil      ["--help"]    -> 0
       spctl        ["--version"] -> 2
       notarytool   ["--version"] -> 0
       ditto        ["--help"]    -> 1
       stapler      ["-h"]        -> 64

   Any other exit status remains `AppleToolFailed`. No range, “any nonzero”,
   stderr substring, platform fallback, or retry is admitted.
4. Retain the exact admitted status in the tool observation's nonsecret
   capability evidence. Probe stdout/stderr are diagnostic only and are not a
   version or identity authority.
5. Keep immediate pre-launch reauthentication unchanged. Probe admission does
   not waive the content/path identity check performed before every real tool
   invocation.

## Verification

1. Fake-spawner tests execute all eleven exact probe coordinates and reject at
   least one nearby non-admitted status.
2. Architecture/source tests prove probe argv has one owner and call sites do
   not encode a second policy.
3. On an eligible macOS host, construct every public Apple layer against the
   real selected tools without using signing or Notary credentials. This is
   selection evidence only, not Apple distribution certification.
4. Run the Apple package tests, contract/architecture tests, and the full
   repository verification under exact Bun 1.3.14.

## Completion receipt

- Implementation commit: LOCAL-UNCOMMITTED on
  `codex/v060-release-readiness`
- Fake-spawner result: PASS, 30/30 Apple package tests including all eleven
  exact probe coordinates and unexpected-status rejection
- Real native layer-construction result: PASS on macOS arm64, 4/4 full native
  acceptance tests including construction of every release-facing layer
- Exact Bun 1.3.14 full verification: PASS; contract 8/8, type tests 16/16,
  unit 160/160, Apple 30/30, built consumer, architecture 31/31, lint, and
  format check
- Hosted arm64/x64 result for this uncommitted repair: NOT RUN
- Hosted/credentialed Apple certification: NOT AUTHORIZED AND NOT PERFORMED
