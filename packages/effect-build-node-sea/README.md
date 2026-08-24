# effect-build-node-sea

The `Raw` lane exposes provider-native Node SEA assembly through
`effect-build-node-sea/Raw`, driving `node --check` and
`node --build-sea` over a file or byte main and optional assets.

```ts
import * as Raw from "effect-build-node-sea/Raw";

Raw.assembleExecutable({
  main: { _tag: "File", path: "dist/main.cjs", format: "commonjs" },
  outfile: "dist/app",
});
```

This operation is provider-native only. Caller bytes, assets, an optional
separate base, and caller-asserted target cannot mint portable target evidence.
The separate `effect-build-node-sea/NodeMainExecutable` lane describes the
evidence-bearing result using one authenticated Node 26.7.0 base,
one sealed main, exact builder/base agreement, no assets, no snapshots, no code
cache, structural target inspection, and exact-runner evidence. Cross-target
finalization is confined to the private, schema-serializable repository
certification/release capability; ordinary library callers do not receive a
cross-target `AssembledExecutable` from that internal handoff; consequently the
public module exposes no finalizer callback or result constructor. On macOS this
lane owns only the ad-hoc, no-timestamp `codesign --sign -` repair required for
a runnable mutated Mach-O. Developer ID signing, entitlements and hardened
runtime, Apple containers, notarization, stapling, and distribution assessment
belong exclusively to the separate `effect-build-apple` operation family.
