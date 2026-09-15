# Recipes

Short programs for the things a release needs. Each one is an Effect you compose into your own
build; the [CLI example](../examples/cli) and the [artifact pipeline](../examples/artifact-pipeline)
run the same patterns end to end. The recipes assume these imports:

```ts
import { Context, Effect, FileSystem, Path, Schema } from "effect";
import { Artifact, Checksums, Commit, Directory, Target, Tool } from "effect-build";
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

Provide a provider layer once, around a program that uses it many times. The tool is located
and probed once; every operation inside runs against that record.

```ts
const build = Effect.gen(function*() {
  const cli = yield* Bun.compile({ entrypoints: ["src/cli.ts"], outfile: "dist/cli" });
  const worker = yield* Bun.compile({ entrypoints: ["src/worker.ts"], outfile: "dist/worker" });
  return [cli, worker];
}).pipe(Effect.provide(Bun.layer({ executable: process.env.EFFECT_BUILD_BUN })));
```

## Assemble Node and Bun applications with runtime assets

Each `Bun.bundle` owns and replaces its output directory. Build different targets into
separate directories, then assemble their artifacts once. This also keeps a later bundle
from deleting an earlier signer, native library, or worker.

```ts
const runtime = Effect.gen(function*() {
  const node = yield* Bun.bundle({
    entrypoints: ["src/show.ts"], outdir: "work/node",
    options: { target: "node", packages: "external", sourcemap: "linked" },
  });
  const worker = yield* Bun.bundle({
    entrypoints: ["src/worker.ts"], outdir: "work/bun",
    options: { target: "bun", packages: "external", sourcemap: "linked" },
  });
  const assets = yield* Artifact.directory("runtime-assets", { name: "app", version: "1" });
  return yield* Directory.assemble({
    outdir: "dist/runtime",
    entries: [{ artifact: node }, { artifact: worker }, { artifact: assets }],
  });
}).pipe(Effect.provide(Bun.layer()));
```

Omitting a directory entry's `path` merges its contents at the root; providing `path`
mounts it below that shipping path. Files require a path. Exact shared directories merge
when their modes agree; duplicate files and conflicting modes fail. Actual destination aliases
fail during exclusive member creation. `Layout.validatePortable` can reject case/Unicode
collisions before building when cross-filesystem portability is required.
File inputs use 0644 and executable inputs use 0755; directory members retain their modes,
empty directories and symlinks. Inputs must remain unchanged while assembly reads them.

Keep the application's file allowlist and frozen production dependency installation in its
own build script. External packages must be included in that tree with their workspace links.
After installation or other writes, record the complete tree again with `Artifact.directory`.
Its artifact can be passed to `Archive.tarGz({ directory, outfile })` or `Archive.zip` to
archive the contents at root, with no extra directory prefix. Stage the archive and its
checksum together using the release-directory pattern below.

The [runtime integration test](../test/integration/runtime-directory.test.ts) builds both
targets, restores the assembled directory from cache, removes the source/build trees, and
runs the extracted programs with a shared workspace dependency.

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
    const identities = yield* Effect.forEach(executables, Artifact.withSha256);
    yield* Checksums.write({ artifacts: identities, outfile: path.join(staged, "SHA256SUMS") });
    return yield* Artifact.directory(staged, { name: "cli", version: "1.0.0" });
  }), { staging: "sibling" }).pipe(Effect.provide(Bun.layer()));
```

Inside a staged directory, `atomic: false` lets each producer write its final path directly;
the outer commit provides the atomicity. `Artifact.withSha256` explicitly hashes each executable;
`Checksums.write` records those digests and paths relative to the checksum file, so
`sha256sum -c SHA256SUMS` keeps passing after the tree moves.

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
absolute paths in the package; the operation copies current bytes and checks that each
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
and is assessed directly because Apple cannot staple a ticket to a bare
binary. Bun-compiled executables need Bun's JIT entitlements. Identities are certificate SHA-1
fingerprints; credentials are a keychain profile, an App Store Connect API key, or an Apple ID.

```ts
const darwin = (executable: Artifact.Executable, certificateSha1: string, credential: Apple.Notary.Credential) =>
  Effect.gen(function*() {
    const signed = yield* Apple.sign({ artifact: executable, certificateSha1, entitlements: Bun.entitlements });
    yield* Apple.verifySignature({ artifact: signed });
    const submission = yield* Apple.Notary.notarize({ artifact: signed, credential, timeout: "30m" });
    yield* Apple.Notary.expectAccepted(submission);
    const assessed = yield* Apple.assess({ artifact: signed });
    return yield* Archive.tarGz({
      entries: [{ artifact: assessed, path: "hello" }],
      outfile: "dist/hello_darwin-arm64.tar.gz",
    });
  }).pipe(Effect.provide(Apple.layer()));
```

`Apple.Notary.notarize` uploads and waits; `expectAccepted` explicitly requires acceptance.
When a build might be interrupted, call `Apple.Notary.submit`, persist its submission ID,
and call `Apple.Notary.wait({ submissionId, credential })` later. App bundles, DMGs, and PKGs
can be stapled before assessment. `Apple.validateTicket` is the explicit ticket check.
Stapling changes the bytes and returns a fresh base product record. The
[signing module](../examples/artifact-pipeline/src/signing.ts) has both flows.

## Sign a Windows executable

`Windows.sign` takes a PE executable or an MSIX file, signs with SHA-256, adds an RFC 3161
timestamp, verifies the signature, and returns the same artifact kind with fresh metadata. The
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

Call `Artifact.withSha256` to record content identities, then persist them with the
`HashedArtifact` schema. `Artifact.verify` checks those recorded identities against the files
later. Base `Artifact.encode` and `Artifact.decode` project metadata only, dropping digests and
provider refinements; preserve richer signing records with their provider's schema.

```ts
const HashedManifest = Schema.Array(Artifact.HashedArtifact);

const writeManifest = (artifacts: readonly Artifact.Artifact[]) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const identities = yield* Effect.forEach(artifacts, Artifact.withSha256);
    const encoded = Schema.encodeSync(HashedManifest)(identities);
    yield* fs.writeFileString("dist/manifest.json", JSON.stringify(encoded, null, 2));
  });

const verifyManifest = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem;
  const artifacts = Schema.decodeUnknownSync(HashedManifest)(JSON.parse(yield* fs.readFileString("dist/manifest.json")));
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

`Tool.provider` resolves and records a tool once. `Tool.run` captures output and
`Commit.output` supplies the same staged output used by first-party providers.

```ts
class Upx extends Context.Service<Upx, Tool.Service>()("example/Upx") {}
const upx = Tool.provider(Upx, {
  name: "upx",
  version: { parse: Tool.versionPattern(/^upx (\d+\.\d+\.\d+)/u), supported: ">=4 <5", tested: ["4.2.0"] },
});
const compress = (input: { executable: Artifact.Executable; outfile: string } & Commit.ProducerOptions) =>
  Effect.gen(function*() {
    const issue = Tool.argumentIssue(input.outfile);
    if (issue !== undefined) return yield* new Tool.InputInvalid({ operation: "Upx.compress", reason: `outfile ${issue}` });
    const tool = yield* upx.resolved;
    return yield* Commit.output(input.outfile, (staged) =>
      Tool.run(tool, ["--best", "-o", staged, input.executable.path]).pipe(
        Effect.andThen(Artifact.executable(staged, Tool.producedBy(tool), input.executable.target)),
      ), input);
  });
```

Provide `upx.layer()` and platform services. The returned artifact names the final path;
output validation runs before commit. A provider can also declare version constraints and
host requirements; see [provider declarations](providers.md).

## Queries and stdout producers

A query decodes stdout into a value and does not commit a file. When stdout itself is the
artifact, write the bytes through `Commit.output` and return the file record instead.

```ts
const query = (tool: Tool.Resolved) => Tool.run(tool, ["--json"]).pipe(
  Effect.flatMap((reply) => Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ version: Schema.String })))(new TextDecoder().decode(reply.stdout))),
);
const report = (tool: Tool.Resolved, outfile: string) => Commit.output(outfile, (staged) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFile(staged, new Uint8Array());
    yield* Tool.run(tool, ["report"], {
      stdoutLimit: 0,
      onOutput: (output) => output.stream === "stdout"
        ? fs.writeFile(staged, output.chunk, { flag: "a" }).pipe(Effect.orDie)
        : Effect.void,
    });
    return yield* Artifact.file(staged, Tool.producedBy(tool));
  }));
```

The empty staged file handles tools that emit no bytes. `onOutput` is an
Effect callback with no typed failure channel; a failed write interrupts the command and its
scope discards staging. Queries with larger structured output can set `stdoutLimit: null`.

Remote operations return a schema-typed reference the caller can persist, then an outcome:
`Apple.Notary.submit`, `wait`, and `expectAccepted` demonstrate the pattern. Such operations
belong here when they change or attest to bytes; transferring the product belongs to ts-release.
They are never cached by declared inputs. [Cache](cache.md) applies to local producers whose
complete dependencies the caller can declare.

## Test a provider

`effect-build/testing` has real-file fixtures and an in-process scripted spawner. No compiler
installation is needed to exercise production, validation, interruption, and staging. The
conformance suite takes a fresh fixture and an output adapter, so `outfile`, `outdir`, and
in-process tools share the same guarantees. The observer must run inside the actual tool call.

```ts
import { Layer } from "effect";
import { TestArtifact, TestProvider, TestSpawner, TestTool } from "effect-build/testing";

const cases = TestProvider.conformance({
  operation: "Upx.compress", kind: "executable", outputName: "output.exe",
  make: (control) => Effect.gen(function*() {
    const executable = yield* TestArtifact.executable("windows-x64");
    const tool = TestTool.resolved("upx", "4.2.0");
    const fake = TestSpawner.layer(({ args }) => Effect.gen(function*() {
      const output = args[args.indexOf("-o") + 1]!;
      yield* Artifact.copy(executable, output).pipe(Effect.orDie);
      return { exitCode: (yield* control.enter(output)) ? 1 : 0 };
    }));
    const services = yield* Layer.build(Layer.merge(upx.testLayer({ tool }), fake));
    return {
      run: (outfile: string, options: Commit.ProducerOptions) =>
        compress({ executable, outfile, ...options }).pipe(Effect.provideContext(services)),
      calls: TestSpawner.Calls.use((calls) => calls.all).pipe(Effect.map((calls) => calls.length), Effect.provideContext(services)),
      provider: { tool, constraints: upx.constraints },
    };
  }),
});
for (const c of cases) it(c.name, () => Effect.runPromise(c.run.pipe(Effect.provide(NodeServices.layer))));
```

A conditional version restriction needs a witness with activating input and a rejected
version. The suite rejects missing witnesses instead of claiming the declaration is tested.
Directory records are verified against disk on every host. Exact POSIX root permissions
(0755 by default) are checked where supported; Windows still checks recorded modes, sorted
entries, and stable manifest hashes without requiring POSIX permission bits.
`TestFileSystem.failing` injects failures on named filesystem calls, `TestPlatform` exposes
POSIX/Windows paths, and `expectReproducible` compares independent real outputs. Platform
path fixtures use the optional `@effect/platform-node` peer. OS process launching, argv
quoting and real signals stay in integration tests; the fake does not establish them.

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
