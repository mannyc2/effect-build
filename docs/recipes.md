# Recipes

Short programs for the things a release needs. Each one is an Effect you compose into your own
build; the [CLI example](../examples/cli) and the [artifact pipeline](../examples/artifact-pipeline)
run the same patterns end to end. The recipes assume these imports:

```ts
import { Effect, FileSystem, Path } from "effect";
import { Artifact, Checksums, Commit, Target, Tool } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Esbuild from "effect-build-esbuild";
import * as Nfpm from "effect-build-nfpm";
import * as NodeSea from "effect-build-node-sea";
import * as Python from "effect-build-python";
import * as Sbom from "effect-build-sbom";
import * as Windows from "effect-build-windows";
```

Every program still needs platform services (`NodeServices.layer` from `@effect/platform-node`)
and a runtime (`NodeRuntime.runMain`), as in [getting started](getting-started.md).

## Share one compiler across operations

Provide a provider layer once, around a program that uses it many times. The tool is located,
hashed, and probed once; every operation inside runs against that record.

```ts
const build = Effect.gen(function*() {
  const cli = yield* Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
  const worker = yield* Bun.compile({ entrypoints: ["src/worker.ts"], outfile: "dist/worker" });
  return [cli, worker];
}).pipe(Effect.provide(Bun.layer({ executable: process.env.EFFECT_BUILD_BUN })));
```

## Cross-compile a target matrix

`Target.parts` gives each target its executable suffix. Bun downloads a runtime per target on
first use, so bound the concurrency.

```ts
const targets = ["linux-x64", "linux-arm64", "darwin-arm64", "windows-x64"] as const;

const matrix = Effect.forEach(targets, (target) =>
  Bun.compile({
    entrypoints: ["src/cli.ts"],
    outfile: `dist/${target}/cli${Target.parts(target).executableSuffix}`,
    target,
  }), { concurrency: 2 }).pipe(Effect.provide(Bun.layer()));
```

The provider reads each executable's header and fails with `ExecutableTargetMismatch` if it is
not what was requested. Omit `target` to build for the host.

## Commit a release directory as a whole

`Commit.atomic` stages a directory next to its destination, runs your producer inside it, and
renames the finished tree into place. `staging: "sibling"` builds at the final depth, which
keeps relative paths in bundles and checksum files valid. A failure anywhere leaves the previous
`dist/` untouched.

```ts
const release = Commit.atomic("dist", (staged) =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const executables = yield* Effect.forEach(targets, (target) =>
      Bun.compile({
        entrypoints: ["src/cli.ts"],
        outfile: path.join(staged, `cli-${target}${Target.parts(target).executableSuffix}`),
        target,
        atomic: false,
      }), { concurrency: 2 });
    yield* Checksums.write({ artifacts: executables, outfile: path.join(staged, "SHA256SUMS") });
    return yield* Artifact.directory(staged, { name: "cli", version: "1.0.0" });
  }), { staging: "sibling" }).pipe(Effect.provide(Bun.layer()));
```

Inside a staged directory, `atomic: false` lets each producer write its final path directly;
the outer commit provides the atomicity. `Checksums.write` records paths relative to the
checksum file, so `sha256sum -c SHA256SUMS` keeps passing after the tree moves.

## Archive per target

Archives take a list of entries: an artifact and the path it gets inside the archive. A whole
directory artifact expands beneath its path, keeping modes and symlinks. Bytes depend only on
the inputs, so rebuilding identical inputs gives identical archives.

```ts
const archive = (executable: Artifact.Executable) => {
  const { os, executableSuffix } = Target.parts(executable.target);
  const entries = [{ artifact: executable, path: `cli${executableSuffix}` }];
  const outfile = `dist/cli_1.0.0_${executable.target}`;
  return os === "windows"
    ? Archive.zip({ entries, outfile: `${outfile}.zip` })
    : Archive.tarGz({ entries, outfile: `${outfile}.tar.gz` });
};
```

## Bundle for Node and archive the bundle

esbuild runs in process from your own install; no layer is needed. `buildToDirectory` returns an
`Artifact.Directory` that archives like any other artifact.

```ts
const bundled = Effect.gen(function*() {
  const bundle = yield* Esbuild.buildToDirectory({
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: "dist/app",
  });
  return yield* Archive.tarGz({ entries: [{ artifact: bundle, path: "app" }], outfile: "dist/app.tar.gz" });
});
```

## A Node single executable

Node SEA embeds one bundled CommonJS script into a copy of a Node binary. The layer's `executable`
is the Node that runs the SEA tooling and `baseExecutable` is the Node to embed into; both default
to the current process and must report the same version.

```ts
const sea = Effect.gen(function*() {
  const path = yield* Path.Path;
  const bundle = yield* Esbuild.buildToDirectory({
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outdir: "dist/sea",
  });
  const main = yield* Artifact.file(path.join(bundle.path, "main.js"), bundle.producedBy);
  return yield* NodeSea.assemble({ main, assets: {}, outfile: "dist/cli" });
}).pipe(Effect.provide(NodeSea.layer()));
```

## Debian and RPM packages

`config` is nFPM's own configuration, passed through as JSON. `contents` maps artifacts to
absolute paths in the package; the operation copies verified bytes and checks that each
executable's OS and architecture match the format and `arch`.

```ts
const packages = (executable: Artifact.Executable) =>
  Effect.forEach(["deb", "rpm"] as const, (format) =>
    Nfpm.package({
      format,
      config: {
        name: "hello",
        version: "1.0.0",
        arch: "amd64",
        maintainer: "Release Team <release@example.com>",
        description: "Hello CLI",
        depends: ["ca-certificates"],
      },
      contents: [{ artifact: executable, dst: "/usr/bin/hello" }],
      outfile: `dist/hello_1.0.0_amd64.${format}`,
    })).pipe(Effect.provide(Nfpm.layer()));
```

## A wheel that installs a native command

The wheel writer needs no Python. An entry under `<name>-<version>.data/scripts/` lands on the
installing environment's command path, so `pip install hello_cli-1.0.0-py3-none-manylinux_2_17_x86_64.whl`
gives the user a `hello` command with no Python wrapper. The platform tag is your promise about
where the binary runs; the writer checks that it can at least describe the executable's OS,
architecture, and libc.

```ts
const wheel = (executable: Artifact.Executable) =>
  Python.wheel({
    metadata: { name: "hello-cli", version: "1.0.0", summary: "Hello CLI", requiresPython: ">=3.9" },
    tags: { python: "py3", abi: "none", platform: "manylinux_2_17_x86_64" },
    entries: [{ artifact: executable, path: "hello_cli-1.0.0.data/scripts/hello" }],
    outdir: "dist/wheels",
  });
```

## Sign and notarize a macOS CLI

A bare executable signs with the hardened runtime and a secure timestamp, notarizes as a ZIP,
and is assessed with its accepted submission because Apple cannot staple a ticket to a bare
binary. Bun-compiled executables need Bun's JIT entitlements. Identities are certificate SHA-1
fingerprints; credentials are a keychain profile, an App Store Connect API key, or an Apple ID.

```ts
const darwin = (executable: Artifact.Executable, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const signed = yield* Apple.sign({ artifact: executable, certificateSha1, entitlements: Bun.entitlements });
    const submission = yield* Apple.notarize({ artifact: signed, credential, timeout: "30m" });
    const acceptance = yield* Apple.Notary.acceptedReference(submission);
    const assessed = yield* Apple.assess({ artifact: signed, acceptance });
    return yield* Archive.tarGz({
      entries: [{ artifact: assessed, path: "hello" }],
      outfile: "dist/hello_darwin-arm64.tar.gz",
    });
  }).pipe(Effect.provide(Apple.layer()));
```

`Apple.notarize` uploads and waits. When a build might be interrupted, call `Apple.Notary.submit`,
persist the returned reference with its schema, and `Apple.Notary.wait` for it later. App bundles,
DMGs, and PKGs follow the same path and are stapled instead of assessed with a reference; the
[signing module](../examples/artifact-pipeline/src/signing.ts) has both flows.

## Sign a Windows executable

`Windows.sign` takes a PE executable or an MSIX file, signs with SHA-256, adds an RFC 3161
timestamp, verifies the signature, and returns the same artifact kind with fresh hashes. The
credential is a certificate-store thumbprint, a PFX file, or Azure Trusted Signing.

```ts
const windows = (executable: Artifact.Executable) =>
  Effect.gen(function*() {
    const signed = yield* Windows.sign({
      artifact: executable,
      kind: "store",
      thumbprint: process.env.SIGNING_THUMBPRINT ?? "",
      timestampUrl: "http://timestamp.digicert.com",
    });
    return yield* Archive.zip({
      entries: [{ artifact: signed, path: "hello.exe" }],
      outfile: "dist/hello_windows-x64.zip",
    });
  }).pipe(Effect.provide(Windows.layer()));
```

## An SBOM for a release

Syft scans the `subject` by default. A compiled TypeScript executable exposes little to a
scanner, so pass the lockfile or source tree as `source`: Syft then inventories the dependencies
that went into the build, and the record still names the release artifact.

```ts
const sbom = (executable: Artifact.Executable) =>
  Effect.gen(function*() {
    const lockfile = yield* Artifact.file("package-lock.json", { name: "hello", version: "1.0.0" });
    return yield* Sbom.generate({
      subject: executable,
      source: lockfile,
      format: "cyclonedx-json",
      outfile: "dist/hello.cdx.json",
    });
  }).pipe(Effect.provide(Sbom.layer()));
```

## Keep the manifest and verify it later

`Artifact.encode` projects a list of artifacts to plain JSON; `Artifact.decode` validates JSON
back into records. Provider refinements such as signatures are left out on purpose; persist those
with the provider's own schema. Records describe files at a moment in time, so verify before a
later step trusts them.

```ts
const writeManifest = (artifacts: readonly Artifact.Artifact[]) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString("dist/manifest.json", JSON.stringify(Artifact.encode(artifacts), null, 2));
  });

const verifyManifest = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const artifacts = Artifact.decode(JSON.parse(yield* fs.readFileString("dist/manifest.json")));
  return yield* Effect.forEach(artifacts, Artifact.verify);
});
```

## Record files you did not build here

Anything on disk can become an artifact. `Artifact.executable` reads the header and checks it
against an expected target; `Artifact.file` and `Artifact.directory` record what is there.

```ts
const external = Effect.gen(function*() {
  const producer = { name: "cargo", version: "1.85.0" };
  const tool = yield* Artifact.executable("target/release/tool", producer, "linux-x64");
  const notes = yield* Artifact.file("CHANGELOG.md", producer);
  return yield* Archive.zip({
    entries: [{ artifact: tool, path: "tool" }, { artifact: notes, path: "CHANGELOG.md" }],
    outfile: "dist/tool_linux-x64.zip",
  });
});
```

## Wrap a tool that has no provider

The core package has what a provider is made of. `Tool.resolve` locates, hashes, and probes a
binary once; `Tool.run` runs it with captured output; `Commit.output` gives your producer the
same staged, atomic output as the built-in ones.

```ts
const compress = (executable: Artifact.Executable, outfile: string) =>
  Effect.gen(function*() {
    const upx = yield* Tool.resolve({
      name: "upx",
      parseVersion: (probe) => /upx (\d+\.\d+\.\d+)/u.exec(new TextDecoder().decode(probe.stdout))?.[1],
    }).pipe(Tool.requireVersion(">=4.0.0"));
    return yield* Commit.output(outfile, (staged) =>
      Tool.run(upx, ["--best", "-o", staged, executable.path]).pipe(
        Effect.andThen(Artifact.executable(staged, Tool.producer(upx), executable.target)),
      ));
  });
```

`Commit.output` stages a file under a temporary directory next to `outfile`, so the tool writes
to `staged` and never to the destination. Return the artifact recorded at the staged path; the
commit renames it and returns the record with the final path.

## Handle a failure

Errors are tagged values. Catch the ones you can do something about and let the rest end the
program with `Tag: message`.

```ts
const compile = Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" }).pipe(
  Effect.catchTag(
    "ToolFailed",
    (failure) =>
      Effect.logError(`bun exited ${failure.exitCode}\n${failure.stderr}`).pipe(Effect.andThen(Effect.fail(failure))),
  ),
  Effect.provide(Bun.layer()),
);
```

## Rebuild on change

Watch operations run while their scope is open and stop when it closes. Bun and Deno inherit
the child's output by default; pass `stdio: "pipe"` to read the streams yourself.

```ts
const dev = Effect.scoped(Effect.gen(function*() {
  const watcher = yield* Bun.watch({ entrypoints: ["src/main.ts"], outdir: "dist/dev" });
  yield* Effect.log(`watching with ${watcher.tool.name} ${watcher.tool.version}`);
  yield* Effect.never;
})).pipe(Effect.provide(Bun.layer()));
```

esbuild's `Esbuild.context` and Rolldown's `Rolldown.watch` stream do the same for bundles.
