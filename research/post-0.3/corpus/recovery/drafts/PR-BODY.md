# Draft PR body

**Status:** reconstructed documentation; not recovered verbatim source.  
**Purpose:** Supply a proposed future PR description that reports recovery and architecture status honestly. It is not the current GitHub PR body and was not posted.  
**Observed remote head:** `96e53a27be4ef96fb47f1a745480e0c5382640f2`  
**Last substantive research head:** `49cd5e1be7917bf14e89068afb4fa47cf78488fb`  
**Last fully reproduced receipt boundary:** `9b0d2f59567a7684b62df932c67b7a96050b605f`

This document does not assert that the described API is implemented, remotely certified at the current head, or ready to merge.


## Purpose

Recover and approve the post-0.3 architecture decision before production implementation. This PR remains architecture research, executable evidence, and implementation planning only unless later commits explicitly enter an approved production plan.

## Current source coordinates

```text
release source:                  f06f96ca88b6278e5f23a898d758b99fa9322108
release-line base:               15c811bb9904142a33d119766b62082f3c689f13
last fully reproduced receipts:  9b0d2f59567a7684b62df932c67b7a96050b605f
last substantive research head:  49cd5e1be7917bf14e89068afb4fa47cf78488fb
current observed branch head:    96e53a27be4ef96fb47f1a745480e0c5382640f2
```

The current head contains transport scaffolding and only one truncated closure chunk. The closure patch was not applied. No claim is made that canonical source, final certification, or proposed PR prose survived remotely.

## Evidence status

- Structured receipts were preserved for successful runs through `9b0d2f59567a7684b62df932c67b7a96050b605f`.
- Later commits contain additional research/prose/expected conclusions.
- The final substantive run at `49cd5e1be7917bf14e89068afb4fa47cf78488fb` passed ten law tests but failed TypeScript contract checking, skipped later certification, and emitted no receipt artifact.
- Provider/watch/dependency/Windows claims added after the reproduced boundary remain repository-documented or unverified unless separately re-executed.
- Production package source and current export maps were unchanged on the research branch.

## Proposed architecture

Select C2:

```text
permanent provider-native Api/Command surfaces
+ finite law-tested portable profiles
+ ordinary Effect recipes
+ provider-owned compatibility
+ only three invariant-owning Author modules
```

Permanent native surfaces preserve Bun, Deno, Esbuild, and Node SEA breadth. Accepted profiles are `NodeMainProgram`, `NodeMainExecutable`, and a narrowed `BrowserModuleApplication`; `NodeSourceExecutable` composes the two Node roles. Incremental Node main is valid but deferred.

## Important falsifiers

- Node-main execution is portable; arbitrary importability is not.
- Bun and Deno standalone executables embed different runtimes.
- Broad static-web and generic declaration-output contracts failed.
- Typed cross-provider command-watch events failed; raw scoped provider watch remains valid.
- Node SEA builder/base mismatch is a non-overridable relation.
- No durable multi-file transaction law exists.

## Review order

1. `reconstruction/ARCHITECTURE-DECISION.md`
2. `reconstruction/CANONICAL-CONTRACT-SPEC.md`
3. `reconstruction/PROFILE-LAWS.md`
4. `reconstruction/LIFECYCLE-AND-OWNERSHIP.md`
5. `reconstruction/VERSION-COMPATIBILITY.md`
6. `reconstruction/BROWSER-APPLICATION-ROLE.md`
7. `reconstruction/CERTIFICATION-DESIGN.md`
8. Plans 039–044
9. Gap/contradiction/maintainer-decision registers

## Authority

This draft does not authorize merge, package publication, tags, releases, trusted-publisher changes, branch-protection/settings changes, or Plan 039 implementation. Those actions require separate maintainer approval and exact-head certification after implementation.
