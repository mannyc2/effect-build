# Composition API candidates

## Evaluation criteria

A candidate is useful only if it:

1. states a domain that official producer and assembler contracts can actually satisfy;
2. makes important invalid combinations impossible through supported construction;
3. preserves provider semantics that affect correctness;
4. allows one unchanged consumer across conforming producers;
5. does not require unsound whole-program analysis;
6. keeps richer provider-native capabilities available;
7. separates semantic guarantees from observations and recorded executions.

## Candidate A — opaque path/bytes plus format

```text
NodeMain = File(path, format) | Bytes(contents, format)
```

### Strengths

- very small;
- maps directly to a Node SEA command input;
- convenient for direct provider APIs.

### Failures

- raw file and mutable-byte lifetime/TOCTOU branches;
- no content identity;
- no main role;
- no target relation;
- no import/resource closure;
- no assets/addon distinction;
- any syntactically valid JavaScript can be mislabeled;
- consumer must rediscover producer semantics.

**Decision: reject as canonical profile; retain as direct provider input.**

## Candidate B — current Candidate C2-style borrowed main plus observations

```text
protocol
executionRole = main
format
resolutionTarget = node
externalImportObservations[]
steps[]
borrowed file acquisition
```

### Strengths

- distinguishes main from importable module;
- handles borrowed lifetime and mutation;
- preserves producer observations and ordered steps;
- supports Bun/esbuild fixture comparison.

### Failures

- `resolutionTarget: "node"` is not an exact Node release/system agreement;
- a non-built-in external may be observed yet still inhabit the value, although default SEA cannot load it;
- no asset/chunk/addon/unresolved state law;
- format remains loosely related to assembler configuration;
- no separation between semantic guarantees and advisory provider metadata;
- a metafile and `node --check` can make a curated fixture look proven while computed loaders and implicit assets remain;
- consumer/assembler must branch over observation contents to decide whether the value is actually usable.

**Decision: reject unchanged.** Its useful pieces—main role, borrowed authenticated content, protocol, and ordered evidence—are retained in Candidate D.

## Candidate C — normalized module/resource graph

```text
entry
modules[]
staticEdges[]
dynamicEdges[]
assets[]
addons[]
externals[]
conditions
target constraints
```

### Strengths

- expressive;
- can model chunks, assets, JSON, addons, and richer assemblers;
- preserves more producer topology.

### Failures

- producer graphs differ: Bun/esbuild/Rolldown/Rollup/ncc report different abstractions and plugin knowledge;
- arbitrary JavaScript can construct loads dynamically, so a “complete” graph is not generally provable;
- SEA default-loader consumes one script, not this graph;
- normalized graph naming risks erasing plugin conditions, source-relative resource semantics, and execution-order changes;
- most fields are illegal for the strict SEA consumer, so every consumer regains a large validation matrix;
- asset/addon publication and target semantics dominate the representation.

**Decision: reject as the smallest canon.** A resource-graph artifact remains a plausible future profile for a different consumer.

## Candidate D — negotiated sealed main capability

```text
opaque NodeMain
  protocol/profile
  role = main
  format sum
  exact target agreement
  finite-literal-builtins-only closure
  authenticated borrowed content
  separate evidence envelope
```

### Strengths

- maps exactly to the strict default-loader SEA subset;
- eliminates package/local/JSON/addon/asset/chunk states rather than merely listing them;
- binds producer output to the assembler selected before production;
- unifies file and bytes transport behind authenticated acquisition;
- preserves producer evidence without making it the semantic proof;
- permits one unchanged consumer for Bun and esbuild;
- can be extended by new profile IDs instead of optional-field explosion.

### Costs

- adapters must be intentionally restrictive;
- closure sealing relies on trusted adapter laws and adversarial tests, not a magical general verifier;
- some valid Node applications remain provider-native;
- exact target negotiation adds a preliminary assembler capability step.

**Decision: recommend.**

## Candidate E — assembler-minted admissibility token

```text
OpaqueProducerOutput -> assembler.preflight -> SeaAdmissibleToken -> assemble
```

### Strengths

- assembler centrally owns its current acceptance rules;
- token can be unforgeable within one package instance;
- useful as an internal implementation stage.

### Failures

- assembler cannot generally prove arbitrary dynamic load/resource closure from bytes;
- producer-specific metadata must still be interpreted or discarded;
- couples the canonical type to one assembler implementation/version;
- weakens the role of a producer adapter that should know its own output contract;
- duplicate-core/package boundaries complicate nominal token identity;
- does not naturally let multiple assemblers consume the same semantic main.

**Decision: do not make it the public canon.** Use an internal validated-stage token inside an assembler if useful.

## Comparison matrix

| Criterion | A: path/bytes | B: C2 observations | C: graph | D: sealed capability | E: assembler token |
|---|---:|---:|---:|---:|---:|
| Small | High | High | Low | High | Medium |
| Borrow/mutation truth | Low | High | Variable | High | Variable |
| Exact target negotiation | No | No | Possible | Yes | Yes |
| Excludes non-builtin externals | No | No | Lists them | Yes | Only if provable |
| Excludes assets/chunks | No | No | Lists them | Yes | Only if provable |
| Preserves producer semantics | Low | Medium | Risky normalization | Evidence envelope | Requires adapters |
| Unchanged Bun/esbuild consumer | Superficially | Conditional/branchy | Graph-heavy | Yes | Assembler-coupled |
| Matches default SEA input | Weakly | Partly | Poorly | Directly | Directly after preflight |
| Dynamic-analysis honesty | Low | Low/medium | Low | Explicitly restricted | Low/medium |
| Recommended | No | No | No | **Yes** | Internal only |

## Representations eliminated by Candidate D

The recommendation removes these public alternatives and optional branches:

- `File | Bytes` as a semantic distinction;
- optional/missing format;
- generic `resolutionTarget: "node"`;
- arbitrary `externalImportObservations` as an accepted semantic state;
- optional chunks, assets, addons, snapshots, and code cache;
- importable/main role union;
- runtime target range negotiated after production;
- consumer inspection of Bun/esbuild metadata;
- consumer-specific regex import scanning;
- direct mutation of the durable destination;
- producer-specific branches in the generic application.

## Validation branches eliminated

A strict assembler no longer needs to choose among:

- package installation versus bundling;
- local chunk copying versus injection;
- JSON file placement;
- asset key derivation;
- native-addon extraction/ABI;
- snapshot build-time execution;
- code-cache dynamic-import support;
- CJS filesystem `createRequire` roots;
- importable module semantics.

Those branches move to separate provider-native operations or future profiles with their own exact sums.

## `NodeSourceExecutable` naming

The composition is ordinary function application with scoped acquisition:

```text
assembler.offer
-> producer.produce(request, offer)
-> main.content.acquire
-> assembler.assemble(main)
-> durable executable
```

It is not a profile because it produces no new interchangeable semantic role. It is not a recipe algebra because there is no declarative plan, optimizer, interpreter, or independently versioned protocol.

Preferred names:

1. `NodeMainExecutable.fromProgram` — makes the consumer/producer relationship explicit.
2. `assembleNodeMainProgram` — ordinary action name.
3. `NodeSourceExecutable` — acceptable discoverability alias if documented as an ordinary function.

Avoid elevating `Recipe` into a public architectural layer unless other compositions demonstrate common invariants that ordinary Effect composition does not already provide.

## Provider-native compositions that remain first-class

- **Bun compile:** bundles with the Bun runtime and Bun target/cross-target semantics. [BUN-EXECUTABLES]
- **Deno compile:** owns module graph traversal, npm/node_modules embedding, include rules, VFS/self-extraction, workers, permissions, and cross-target behavior. [DENO-COMPILE]
- **Full Node SEA:** assets, native addons, snapshots, code cache, execution arguments, custom binary, signing. [NODE-SEA-26]
- **pkg:** standard/enhanced SEA modes, target triples, package/project traversal, ESM and addon handling. [PKG-GUIDES]
- **ncc:** Node-oriented bundling with asset relocation. [NCC-REPO]
- **Rollup/Rolldown applications:** plugin-defined resolution, multi-entry/multi-chunk/assets, library/package semantics. [ROLLUP-CONFIG] [ROLLDOWN-DOCS]
- **Importable Node packages:** exports/imports/conditions and module interop are a package publication domain, not main-executable assembly. [NODE-PACKAGES-26]
