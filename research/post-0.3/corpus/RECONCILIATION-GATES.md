# Cross-lane reconciliation gates

Status: **research inputs are durable; the architecture is not yet reconciled into one decision model**.

The breadth and compatibility archives are substantial research inputs, but they were produced without all required
prior archives. Their recommendations therefore cannot be combined mechanically or treated as maintainer decisions.

## Conclusions that currently agree

- Provider, operation, lane, host, target, and lifecycle distinctions are material.
- Exact execution observations are not automatically public support ranges.
- A flat transformation algebra erases provider semantics.
- `Api` and `Command` are not a universal pair that every provider operation must implement.
- Portable roles, implementation status, certification, and release priority are independent judgments.
- No-current-consumer is a priority fact, not an architectural falsifier.

## Required reconciliation

### Canonical operation identity

The breadth inventory has combined `API/command` rows while compatibility policy requires operation- and lane-specific
keys. Establish one key with provider, operation, lane, host, target, lifecycle, ownership, and evaluation phase before
making operation-specific decisions.

### Provider breadth supplement

The claimed breadth is incomplete. At minimum, reconcile Bun Transpiler and scan operations, Deno transpile and
declaration modes, esbuild host variants and service lifecycle, and Node SEA loader, asset, snapshot, cache, injection,
and signing semantics.

### Ownership vocabulary

Do not call returned `Blob`, `Uint8Array`, or in-memory buffers borrowed without producer-controlled expiry or scoped
invalidity. Distinguish caller-retained memory, scoped temporary outputs, provider-direct durable writes, atomically
published durable files, and long-lived watch or serve handles.

### Lifecycle-specific publication

The compatibility report's universal `stage -> verify -> atomic publish` sequence is not truthful for in-memory
results, provider-direct output trees, watch sessions, or serve handles. Select publication and interruption semantics
per canonical operation.

### Compatibility evaluation phases

Separate:

1. release certification;
2. package installation and peer resolution;
3. application composition or Layer acquisition;
4. tool selection and capability observation;
5. operation execution;
6. receipt or audit reporting.

Do not repeat release-only Effect declaration or package-graph checks before every provider operation.

### Compatibility primitive rent

Compare exact internal policies, internal rule sets with holes and relations, unknown-but-capable overrides, and the
proposed public five-machine protocol while holding unrelated concerns constant. The largest model must not win merely
because it contains every concern. Public policy schemas, executable hashing, runtime profile protocols, schema
digests, and adapter registries each need a demonstrated invariant and consumer.

### Public versus internal authorship

Decide whether third-party integration authors are part of the product. Fully private construction primitives imply a
closed first-party provider set; a public author SPI creates a durable compatibility commitment. Do not assume either
answer from the existing reports.

### Portable-profile proof programs

The Node and browser reports identify plausible roles but not a final public canon. Define exact legal states,
ownership, imports/assets, targets, observations, and adversarial unchanged-consumer substitutions. Missing empirical
proof should produce a bounded proof program, not rejection for lack of adopters.

### Evidence normalization

Keep claim provenance separate from disposition. Pin release-significant upstream claims to versioned source,
declarations, commits, or captured content hashes where possible; identify moving documentation explicitly.

## Decision-packet readiness

A maintainer decision packet may proceed only after it maps every proposed operation to:

```text
operation/lane/ownership key
-> lifecycle and publication path
-> compatibility owner and policy
-> public versus internal owner
-> evaluation phase
-> evidence provenance and disposition
```

The packet must be allowed to return `BLOCKED` or `UNKNOWN`. It must not force a maintainer choice between terms that
still denote different operations or ownership models.
