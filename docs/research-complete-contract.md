# Research-complete product contract

Status: local hard-cut implementation accounted; external certification incomplete\
Machine contract: `effect-build/research-complete-contract@1` in
[`tooling/research-complete-contract.json`](../tooling/research-complete-contract.json)

The contract reconciles the complete accepted post-0.3 research program. It is
generated from the 67-row R1 operation register, the 46-row non-operation
register, the frozen adjudication record, the focused core/profile/Apple/release
policy, and the current generated public-surface inventory. The old
[`effect-build/v0.5-contract@1`](v0.5-contract.md) remains an implementation and
release-control snapshot; it no longer limits product scope.

The canonical provider-operation accounting is exact:

| Disposition           | Count | Meaning                                                                                               |
| --------------------- | ----: | ----------------------------------------------------------------------------------------------------- |
| Mandatory             |     5 | Frozen operations that remain required. Historical admission is not current certification.            |
| Positive proof-gated  |    22 | Research selected the operation; its named executable evidence gate remains part of the work.         |
| Conditional gate      |    27 | Run the named gate and implement a passing result; only a genuine falsifier may move it to rejection. |
| Rejected              |    11 | The semantic operation is prohibited and requires negative-surface coverage.                          |
| Superseded direct-SEA |     2 | The preparation-blob and injector route is replaced by direct Node `--build-sea`.                     |

Every operation, non-operation, and supplemental entry carries separate
`disposition`, `implementation`, `test`, and `evidence` records. Validation
rejects any remaining unassessed entry. Implemented source and local tests are
recorded without converting an open external gate into certification; a later
revision may not remove a row to make a gate disappear.

Provider-native compatibility receipts use
`effect-build/provider-native-evidence-receipt@2`. A receipt derives its sorted
expected `operationIds` and `atomIds` directly from this contract: live operations are
the mandatory, positive-proof-gated, and conditional-gate rows for that
provider, while applicable non-operation atoms are every non-rejected row for
that provider. `wrapperJobCount`, `operationCount`, and `atomCount` are separate
fields, so one matrix wrapper cannot be misreported as one exercised research
finding. Each successful test must also write a canonical, coordinate-bound
`effect-build/provider-native-operation-observation@1` marker after it exercises
the operation or atom. Receipt creation rejects a missing, extra, malformed, or
merely inferred marker. Conditional IDs in a successful receipt remain evidence candidates;
the receipt does not itself admit their public surface or package.

## Public ownership and provider lanes

`tooling/public-api.json` describes the current built surface only. The
research-complete contract maps every one of those exports to a semantic owner,
but marks the projection as implementation evidence rather than target scope.

The target provider surface is a hard cut:

- Bun exposes real `Api` and `Command` namespaces; esbuild does the same. Deno
  exposes only its real `Command` namespace. Rolldown remains a private package
  candidate because R6 did not admit it.
- Each live R1 operation belongs to exactly one operation-specific module under
  `src/Api/*` or `src/Command/*`.
- Node SEA exposes only `Command`; it has no accepted in-process operation, and
  the research rejects a synthetic mirrored `Api` lane.
- Required operation modules are public. All-conditional modules are compiled
  and tested package-private until their complete named gate closes.
- The former `Build`, `Bundle`, `CompileExecutable`, `Context`, `Profile`,
  `Raw`, and `Watch` provider subpaths are absent; they are neither aliases nor
  inherited target authority.
- Apple keeps its separately selected operation family rather than pretending
  to be a generic provider `Api`/`Command` pair.

## Regeneration and validation

```sh
bun run generate:research-contract
bun run validate:research-contract
bun run test:research-contract
```

Validation fails when an R1 row, non-operation atom, supplemental authority,
progress field, evidence gate, or public-export semantic owner disappears. It
also enforces the 5/22/27/11/2 terminal accounting, five certification hosts,
six admitted first-party packages, one conditional package candidate, exact
three-module public Author SPI, exact current
semantic-owner surface, required-public versus conditional-private lane policy,
and the absence of an earned external-certification claim.

Implementation, testing, certification, merge, release approval, publication,
and post-release verification remain separate authorities. This contract grants
no permission to publish and does not claim that external hosts, Apple
credentials, registry controls, or receipt archival are earned.
