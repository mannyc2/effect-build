# Decision table

## 1. Candidate disposition

| Candidate | Semantic boundary | Evidence at live head | Major falsifiers | Decision |
|---|---|---|---|---|
| `BrowserModuleApplication` as currently described | HTML plus vaguely “module-reachable” resources | One narrow receipt; broad top-level CSS counterexample; later unexecuted normalized v2 source | `<base>`, top-level resources, import maps, `srcset`, workers, CSP/SRI, multiple HTML | **Do not claim/publish as established.** |
| `BrowserModuleOutputSet` as file bag | JS/CSS files from module entries | One Bun/Deno JS+CSS fixture | Multiple entries, chunks, associations, externals, assets | **Refine, do not publish unchanged.** |
| `BrowserModulePayload` | Explicit module entries to borrowed provider-declared output closure | Standards-valid boundary; narrow intersection recorded; conformance incomplete | Multi-entry/splitting/CSS/assets/externals/runtime/ownership | **Recommended portable candidate; prove before conformance claim.** |
| `HtmlModuleGraphBuild` | One bounded HTML entry, provider-owned transform | Deno/Bun documented HTML centers; existing proof insufficient | Every admitted HTML construct, entry association, policy/mount | **Separate architecturally valid role; defer pending proof.** |
| Explicit static resource composition | Caller-enumerated files copied with ledger | V2 demonstrates fixture-specific need, not generic implementation | Collisions, escapes, unused/secrets, public-base | **Optional separate helper; never call discovery.** |
| Provider-native outputs only | Official full provider semantics | Directly supported by upstream APIs/docs | None from provider divergence | **Permanent canonical surface, even if portable roles ship.** |
| Durable multi-file browser artifact | Published directory | No common commit/rollback law | Partial writes, stale files, cross-volume, non-empty replacement | **Reject as portable build result.** |

## 2. Direct answers

| Question | Decision | Claim class |
|---|---|---|
| Portable substitution law | Consumer-owned host + returned entry/style observations; same readiness/result; all declared internal edges resolve; externals preserved. | PROPOSAL |
| HTML/CSS discovery | Provider-owned. Core validates observations; explicit copy helper only for caller-listed resources. | INFERENCE/PROPOSAL |
| General neutral discovery | Not feasible without becoming frontend framework and still excluding runtime-computed behavior. | INFERENCE |
| Output ownership | Borrowed isolated tree; no durable publication. | PROPOSAL |
| Atomicity | No portable non-empty directory transaction; separate versioned publication. | UPSTREAM-DIRECT/INFERENCE |
| Semantic exclusions | Runtime URL construction, service-worker scope, universal public base, CSP/SRI after rewrite, exact topology/URLs. | INFERENCE |
| Test-only limitations | Fixed names, one HTML, one image/browser/OS, no current consumer. | INFERENCE |
| Provider-native remainder | Rich requests/results, HTML, plugins, paths, workers, maps, manifests, watch, deployment, policy. | PROPOSAL |

## 3. Resource disposition summary

| Resource | Module payload | Strict HTML role | Native lane |
|---|---|---|---|
| Explicit module entries | Include | Rooted from admitted script | Full options |
| Static/nested imports | Provider-declared include/external | Same | Full graph/plugins |
| Literal dynamic imports | Include only with declared chunks | Same | Provider behavior |
| Computed dynamic imports | Reject from closure | Reject unless provider convention explicitly admitted | Full/provider runtime |
| Module-imported CSS/assets | Include when associated | Include | Full loaders |
| Top-level CSS/images/srcset | Host-owned | Admit only when enumerated and proved | Full HTML loader |
| Import maps | Host-owned | Exclude v1 | Native |
| Workers/service workers | Exclude/dedicated future role | Exclude v1 | Native |
| WASM | Include only provider-declared asset edge | Exclude unless admitted | Native loaders/glue |
| Remote/data/blob | Preserve external/runtime | Preserve under admitted semantics | Native vendor policy |
| Root-relative/public base | Reject relative v1 | Reject relative v1 | Native `publicPath`/base |
| Source maps | Optional associated observation | Same | Full modes/metadata |
| CSP/SRI | Consumer policy; no rewriting | Provider-generated only or explicit policy | Native |
| Provider-generated HTML | No | Yes, provider-owned | Full |
| Manifest/metafile | Portable projection + native observation | Same | Full schema |

## 4. Substitution observables

| Observable | Portable? | Reason |
|---|---:|---|
| Consumer readiness/result predicate | Yes | Application-level law chosen by consumer/profile. |
| Requested-entry association | Yes | Required to construct host and avoid filename guessing. |
| Declared internal edges resolve | Yes | Bounded closure law. |
| Declared externals remain external | Yes | Prevents semantic silent vendoring/internalization. |
| Correct MIME under test host | Yes for claimed browser behavior | Browser execution depends on type. |
| Output bytes/hash | Observation, not equal across providers | Minification/tool versions differ. |
| Filenames/chunk topology | No equality | Provider strategy. |
| `import.meta.url` exact value | No | Path/topology observable and provider-specific. |
| Stack/function source | No | Minifier/sourcemap/provider-specific. |
| Number/order of independent requests | No | Splitting/hints/browser scheduling differ. |
| Provider metadata | Native only | Different schemas and precision. |
| Provider-generated HTML | HTML role only; not equal bytes | Transform details differ. |
| Durable path | No | Borrowed role publishes nothing. |

## 5. Ownership decision

| Stage | Owner | Success law | Failure/interruption law |
|---|---|---|---|
| Provider build into staging | Adapter scope | Completed outputs inspected before lending | Partial staging may exist; cleanup attempted; no result tree. |
| Borrowed callback | Adapter retains cleanup; caller borrows | Contained snapshot available via closure | Caller failure identity preserved; cleanup follows. |
| Explicit copy/publication | Separate deployment operation | Copy verified, then platform commit | Reports committed/partial state honestly. |
| Provider direct outdir | Caller/provider-native | Provider result plus direct files | Partial durable destination possible. |

## 6. Priority versus validity

**[INFERENCE DEC-001]** A corrected `BrowserModulePayload` can be semantically valid without a current consumer. Lack of adoption can justify deferring implementation or release, but not declaring the abstraction invalid.

**[INFERENCE DEC-002]** Publishing the current `BrowserModuleApplication` because one fixture succeeded would make fixture/adoption evidence substitute for a semantic boundary—the opposite error.

## 7. Recommended status vocabulary

**[PROPOSAL DEC-003]** Use distinct statuses:

- `semantically-proposed`: law and falsifiers are coherent; no provider conformance claimed.
- `provider-demonstrated`: one provider has passed the required matrix at exact versions.
- `portable-demonstrated`: at least two providers pass the same role matrix and substitution oracles.
- `release-deferred`: valid role not scheduled for product reasons.
- `falsified`: admitted scenario violates the law.
- `withdrawn`: design no longer recommended for architectural reasons.

Do not use `established` for a role when the oracle covers only extension/file-existence predicates.

## 8. Final recommendation

**[PROPOSAL DEC-004]** Replace the planned public browser surface with this sequence:

1. Preserve provider-native Bun/Deno APIs permanently.
2. Specify `BrowserModulePayload` and its proof matrix.
3. Ship it only after portable-demonstrated status; otherwise retain as release-deferred architecture.
4. Research `HtmlModuleGraphBuild` independently with a finite admitted HTML language.
5. Keep explicit static resources and durable publication as separate composition/deployment operations.
6. Do not claim `BrowserModuleApplication` conformance from the existing probes.
