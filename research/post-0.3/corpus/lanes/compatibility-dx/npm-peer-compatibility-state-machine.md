# npm provider/core peer compatibility state machine

## Scope

This machine evaluates the installed package graph, not the selected provider tool. A provider binary may be perfect while the provider npm package is incompatible with the installed `effect-build` core.

## Inputs

```text
PackageGraphObservation@1 {
  packageManager { name, version }
  lockfileDigest?
  instances[] {
    packageName
    packageVersion
    packageLocationToken
    manifestDigest
    declaredPeers { name: range }
    resolvedPeerInstanceIds[]
  }
  rootOverridesDigest?
}
```

The evaluator must inspect the actual resolved instance visible to each provider package, not merely the root manifest. Duplicate core or Effect instances are observable graph facts.

## States

| State | Meaning | Result |
|---|---|---|
| `peer-exactly-observed-compatible` | exact packed/fresh graph has a receipt and all peers satisfy | success evidence |
| `peer-range-compatible-unobserved` | npm SemVer satisfies authored peer range, no exact graph receipt | policy success with lower evidence |
| `peer-missing` | required peer has no visible resolved instance | typed failure |
| `peer-range-incompatible` | resolved version does not satisfy authored range | typed failure |
| `peer-graph-ambiguous` | multiple visible instances make runtime ownership unclear | typed failure unless package architecture explicitly permits it |
| `peer-manifest-unparseable` | range/version cannot be evaluated strictly | typed failure |
| `peer-root-override-active` | root policy changed resolution; still evaluate actual graph | warning plus one of the above terminal states |

## Rules

1. Use a strict SemVer implementation with npm prerelease semantics; do not compare strings.
2. Preserve prerelease identity. The live peer `>=4.0.0-beta.104 <4.1.0-0` is intentionally different from a stable-only range.
3. Peer success is not tool success, Effect declaration success, or profile protocol success.
4. A root override is authority over package resolution, not an `effect-build` compatibility override. It cannot silence runtime/protocol checks.
5. Package-manager warnings are not sufficient evidence. Run `npm ls`/package-manager graph inspection or equivalent and evaluate each provider-visible edge.

## Recorded relational fixture

**RECORDED-EXECUTION:** the historical architecture receipt packed a synthetic provider `0.7.0` with core peer `>=0.4 <0.5`. Core `0.4.0` installed successfully; core `0.5.0` produced `ERESOLVE`. This establishes that provider/core compatibility is independently versioned. It does not establish released `effect-build` `0.4` policy.

## Current repository observation

All inspected packages are `0.3.0`; provider workspaces depend on `effect-build: workspace:^`, and all declare the same Effect peer. There is no released independent provider/core cadence in the inspected manifests. The future peer ranges are therefore a maintainer decision, not an inference from the research prototype.

## Remediation

- Install a core version inside the provider's declared peer range.
- Upgrade the provider package to one declaring/supporting the selected core.
- Remove duplicate instances or root overrides creating skew.
- Publish a corrected peer range only after packed-consumer and runtime tests.

There is no tool-version override for peer failure.
