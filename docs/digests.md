# Digests and memoization

Digests are an explicit application choice. `Digest.sha256(path)` reads current file bytes
in 64 KiB chunks and returns a lowercase hexadecimal SHA-256 string. It requires the
application's `FileSystem` service and buffers no whole file.

`Digest.verifySha256(path, expected)` reads afresh and fails with
`DigestError/Mismatch` when the current bytes differ. Read failures use `DigestError/Read`.
The utility also supports the pipeable form `path.pipe(Digest.verifySha256(expected))`.

## Choose a lifetime

Use Effect's own caching operations when an application wants memoization. This excerpt from
the [typed utility example](../examples/tool-runs/src/Optins.ts) returns one reusable digest
Effect and an independent verification operation:

```ts
export const inspectFile = Effect.fn("Optins.inspectFile")(function*(file: string) {
  const digest = yield* Effect.cached(Digest.sha256(file));
  return { digest, verify: (expected: string) => Digest.verifySha256(file, expected) };
});
```

Runs of the returned `digest` share its memoized observation. Each call to `verify` reads
current bytes. Keep the returned Effect for the lifetime whose cached observation you want;
create a new one to choose another lifetime.

Hashing does not select a tool, prove a target, publish a file, or establish provenance.
If an application needs a persistent build cache, it owns the cache key, stored format,
restoration, and publication policy.

## Hash a published file

The same example chooses a portable relative path, publishes a text file, and records its
digest after publication:

```ts
export const publishText = Effect.fn("Optins.publishText")(
  function*(directory: string, relative: string, contents: string) {
    yield* Layout.validatePortable([relative]);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* Atomic.file(
      path.resolve(directory, relative),
      (staged) => fs.writeFileString(staged, contents),
    );
    return { path: file, sha256: yield* Digest.sha256(file) };
  },
);
```

The [complete module](../examples/tool-runs/src/Optins.ts) contains the imports and typechecks
with the workspace. The returned object belongs to this application example; bindings
return paths or native reports.
