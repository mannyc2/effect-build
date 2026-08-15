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
