# Plan 036: Bootstrap npm namespaces and one trusted publisher

> **Mandatory parent approval**: this plan performs irreversible public npm
> mutations. Before any login, reservation publish, ownership change, or
> `npm trust` command, send the parent task: current registry observations,
> chosen bootstrap alternative, exact package/version/files, npm account/org,
> workflow filename/environment, and rollback limits. Do not ask for or log
> tokens/OTPs. Continue independent work while waiting.

## Status

- Priority: P0 release blocker
- Effort: M plus operator interaction
- Risk: CRITICAL external state
- Depends on: 032, approved/qualified Plan 035 invocation, explicit approval
- Planned at: `e8c1557509a9236df8e5eb236293527c3f4fd21d`
- Completion: `DONE`

## Why a decision is unavoidable

`effect-build@0.2.0` exists. The four integration names currently return E404;
E404 proves neither reservation nor publish rights. npm trusted publishers and
`npm trust` require an existing package, while npm staged publishing cannot
create a package. Therefore the four names need one explicit bootstrap event
before the coordinated `0.3.0` OIDC release.

Recommended alternative: interactively publish a minimal public prerelease
`0.0.0-reserved.0` for each new package, then configure the same exact trusted
publisher on all five names. The visible reservation versions are the cost.
Alternative interactive publication of `0.3.0` is not a fallback: it forfeits
the coordinated first-release proof and requires a separate maintainer choice.

## Scope

External npm settings and, if needed, one minimal plan-owned reservation source
directory under a validated `mktemp -d`. effect-build source/tarballs are
read-only. Plan/README receipts may be updated. No tag or GitHub Release.

## Steps

1. Read-only preflight each name through both anonymous registry metadata and
   the authenticated account's access view. Record absent/equivalent/conflict,
   account 2FA state, organization scope, and exact maintainers. STOP on an
   unexpected owner/version.

2. Verify the approved trusted-publisher identity:

   - GitHub repository `mannyc2/effect-build` or the maintainer-confirmed owner;
   - exact workflow `.github/workflows/release.yml`;
   - exact protected environment, recommended `npm`;
   - GitHub-hosted runner;
   - npm/Node versions satisfying current trusted-publishing requirements;
   - `id-token: write` will exist only on the future publish job.

3. After approval, create each reservation tarball in a distinct `mktemp -d`.
   Its package.json contains only exact `name`, version
   `0.0.0-reserved.0`, `private:false`, public access, README explaining the
   reservation, and no lifecycle scripts/dependencies. Inspect `npm pack
   --dry-run --json`; then publish one name at a time with interactive 2FA.
   Never reuse or alter the certified 0.3 tarballs.

4. After each mutation, anonymously reobserve exact name/version/integrity and
   authenticated maintainers before proceeding. On unknown outcome, observe;
   never blindly retry. On conflict or unauthorized result, stop the whole
   bootstrap and message the parent.

5. Configure the exact same trusted publisher for all five existing packages
   using the npm UI or qualified `npm trust` CLI. Verify the resulting settings
   read-only. Remove/disable long-lived automation tokens only after the
   maintainer confirms no other release depends on them.

6. Produce a redacted receipt containing package names, reservation versions
   and public integrity, maintainer identities, workflow/environment identity,
   timestamp, and observation URLs. No session IDs, tokens, OTPs, or cookies.

## Verification / expected result

- all five package names resolve publicly;
- the four new names have exactly the approved reservation prerelease and no
  `latest` dist-tag pointed at it unless intentionally selected;
- all five show the same trusted GitHub workflow/environment;
- no `0.3.0` exists yet;
- no effect-build source or certified candidate changed.

## STOP conditions

- any name is owned by an unexpected principal;
- npm cannot keep the reservation off `latest` under the approved command;
- trust cannot be configured identically;
- the only available route is a long-lived broad automation token;
- the parent has not approved the exact irreversible mutation.

## Maintenance / compression ledger

Adds one visible bootstrap version per new namespace and one publisher identity
per package. It removes manual-token publication as an accepted release path.

## Receipt

- The authenticated bootstrap ran as npm account `mannyc1` with pinned
  Node `24.14.1` and npm `11.19.0`. npm's published tarball for npm 11.19.0
  matched the approved integrity
  `sha512-SDd/hHg3KqHE5Ht2NHWxNYNtqCQ2pXAPLl6OtQhPyED5PHsRfrOtO199MZTIG2cQoQ1ZRI9t28shrD+2cr3AAw==`.
  The isolated configuration and reservation roots were created under
  `/tmp/effect-build-plan036-phase-a.PE4qLN` with restrictive permissions;
  no token, OTP, cookie, raw userconfig, or session output was recorded.
- Each reservation root contained only `package/package.json` and
  `package/README.md`, with no lifecycle script or dependency. The four
  once-packed and published `0.0.0-reserved.0` tarballs were:

  | Package | Bytes | SHA-1 | SHA-256 | SHA-512 |
  |---|---:|---|---|---|
  | `effect-build-bun` | 346 | `0df747c6f72976d887166e292a5e8f4e70f8ef62` | `10546f3bbf0d619b7c5d7e38020fad95cb82185866c5b1a09bafe3c8d78ef15b` | `f0acb71c4dcbfa2babeca60b62cbf8ac34d877af22eba8b371f2eb36838607d526a1cf94527a7c83cfc44e7d67ca0500f58dc89f404c25360419ca10c4e1373f` |
  | `effect-build-deno` | 347 | `60c0f80eddf3470db26833eb5bccc4f4a083e65d` | `ed03701dfd0e316bc27ebda31b8a3ecc037e942c19db069c85b0d7871c23a47a` | `71399d934a9556dc08dcf65cd8b893634a985a1a42156e05fc8cfa36a84ebafc8d0e7923ee4b12d09c3411a9491b3045a34d29f8712801d39aaa43f01faa4195` |
  | `effect-build-esbuild` | 346 | `4ca211af17926e7b1437648b1a10a41ed9ac4f66` | `9a30344312dd6817ad75e9ca768418a96a4a132ad910aee73f90b6d31724dc63` | `d65059d44b2945de31dc32e6d9ccce7839edd71d510e8a2475bc54face81c60fabe462c2585645e1963c8fa1af80938ef876bdcdf6e65df203561a05508c46d2` |
  | `effect-build-node-sea` | 349 | `77482f437e83aa10a9a12b99bbe803a7ec805cdb` | `ea79995e3528e7cdf3bd4e670695a44e58a07ca425a3397e8c8e8fd26c1e5350` | `f00f997fc0f9c8307ae5586cfeb2a96bd0369a94f5d0b0ad1e25914124e3326c62b49a77089bc0e283cb8c62b62ac8a2c25ebf52eb3580678cc477fbd15de606` |

  Anonymous registry reads reproduced the exact SHA-1/SHA-512 values and
  two-file inventories. npm necessarily assigned `latest` during each first
  publication; the parent explicitly approved that temporary behavior after
  observation. Plan 037 subsequently moved every `latest` tag to `0.3.0` and
  left `reserved` on each integration reservation. All five packages resolve
  publicly and list only maintainer `mannyc1`.
- GitHub environment `npm` was created with required reviewer `mannyc2`
  (user id `126291407`), `prevent_self_review=false`, and one custom exact
  branch policy `codex/granular-integration-program`. Five npm trusted
  publishers were authenticated and independently read back as type `github`,
  repository `mannyc2/effect-build`, workflow `release.yml`, environment
  `npm`, and permissions `[createPackage]`:

  | Package | Trust id |
  |---|---|
  | `effect-build` | `48a728c5-a42b-45f8-8713-dd52e9b6a16e` |
  | `effect-build-bun` | `26336ea3-9c56-41e8-b235-aff8aa521f61` |
  | `effect-build-deno` | `81d4ceca-4c49-47f9-8188-eeb5e6e9eebd` |
  | `effect-build-esbuild` | `10e9270b-6f66-41a8-b19e-7801b79522ea` |
  | `effect-build-node-sea` | `48550345-c34f-4d80-aaff-114a6276debe` |

- The temporary `effect-build` granular access token remains remotely active
  at the maintainer's explicit direction, with expiry
  `2026-08-19T09:58:45.796Z`; its later revocation is non-blocking
  housekeeping. Its local staged file and isolated auth configuration were
  discarded. It was not used by the functional release and remains forbidden
  as a manual or fallback publisher. Plan 037 used only the verified OIDC
  workload identities and qualified coordinator.
- The bootstrap changed no effect-build source, package manifest, certified
  `0.3.0` tarball, tag, or GitHub Release. Unknown outcomes were observed
  before continuation; no blind retry occurred.
