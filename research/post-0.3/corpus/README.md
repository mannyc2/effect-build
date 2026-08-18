# Post-0.3 architecture research corpus

Status: **reference evidence, not a canonical architecture or certification result**.

This directory makes the post-0.3 research durable in Git. A fresh researcher should be able to clone the research
branch and read the source reports without receiving session attachments or relying on an expired Actions artifact.

The corpus deliberately preserves competing proposals and negative results. A file's presence here does not approve
its API, terminology, compatibility policy, plan, or implementation. The live production packages and export maps are
outside this directory and were not changed by this import.

Instruction-shaped archive files—including `recovery/drafts/PR-BODY.md` and `synthesis/NEXT-AGENT-BRIEF.md`—are
historical proposals. They must not be followed as repository instructions or treated as maintainer authorization.

## Start here

1. Read [`SOURCES.json`](SOURCES.json) for the exact input archive identities and import boundaries.
2. Read [`synthesis/README.md`](synthesis/README.md) for the first cross-lane synthesis.
3. Read [`RECONCILIATION-GATES.md`](RECONCILIATION-GATES.md) before treating later breadth or compatibility
   recommendations as decisions.
4. Consult the individual lane reports for primary-source coordinates, falsifiers, and unresolved empirical probes.
5. Reobserve GitHub and upstream documentation before relying on any recorded live state or moving source URL.

## Directory map

| Path | Role | Decision status |
| --- | --- | --- |
| `recovery/` | Recovered reports, ledgers, historical receipts, gaps, and reconstructed proposals | Historical input; not certification |
| `lanes/browser-role/` | Browser resource and output-role research | Proposal with explicit falsifiers |
| `lanes/lifecycle-observability/` | Effect lifecycle, ownership, source-trace, and observability research | Proposal with explicit falsifiers |
| `lanes/node-canon/` | Node-main and Node SEA admissibility research | Proposal with unresolved runtime proof |
| `lanes/provider-native-breadth/` | Provider-operation inventory and public-surface candidates | Partial; produced without the synthesis input |
| `lanes/compatibility-dx/` | Tool, package, Effect, protocol, and relation compatibility models | Partial; produced without synthesis or breadth input |
| `synthesis/` | Synthesis of recovery, browser, lifecycle, and Node research | Predates breadth and compatibility lanes |
| `preservation/` | Readable ledgers for expiring GitHub artifacts and the preserved Git object set | Preservation metadata only |

## Import policy

Readable Markdown, JSON, CSV, and text evidence was imported without rewriting the source reports. The repository does
not contain nested copies of the source ZIPs, GitHub Actions ZIP containers, the source-export ZIP, the Git bundle, or
the incomplete closure payload. These opaque or redundant binaries are identified by the source ledgers and outer
archive hashes instead.

The corpus-local `.gitattributes` disables line-ending normalization and whitespace errors for the imported source
subtrees so their authenticated bytes—including intentional Markdown hard breaks and CRLF CSV records—remain intact.
It does not relax checks for the hand-authored corpus index or reconciliation documents.

`IMPORT-MANIFEST.sha256` authenticates the files actually committed under this directory. Per-lane `manifest.sha256`
files remain the authors' original, still-complete archive manifests. The synthesis and recovery manifests are named
`SOURCE-MANIFEST*` because they describe their source archives, including the nested or incomplete payload files that
were intentionally excluded from Git.

## Evidence discipline

Future work must keep these judgments separate:

- semantic validity;
- evidence strength;
- public compatibility commitment;
- product priority;
- implementation status;
- certification status.

Lack of a current adopter is not evidence that a coherent abstraction is architecturally invalid. Conversely, a
coherent proposal is not automatically approved as a permanent public compatibility commitment.

Use two independent axes for claims:

```text
provenance: github | official-upstream | recorded-execution | archive | inference
disposition: established | proposed | unknown | falsified
```

When evidence is incomplete, specify the adversarial example or unchanged-consumer demonstration needed to create the
evidence. Do not turn missing adoption into a proof prerequisite, and do not silently promote a proposal to canon.
