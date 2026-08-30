import { NodeServices } from "@effect/platform-node";
import { Cause, ConfigProvider, Effect, Exit, Schema } from "effect";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as Tool from "../../packages/effect-build/src/Author/Tool.js";
import * as SystemTarget from "../../packages/effect-build/src/SystemTarget.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-core-"));
  roots.push(root);
  return root;
};

const observation = <const Name extends string>(name: Name, candidate: Tool.Candidate<Name>): Tool.Observation<Name> =>
  Object.freeze({
    name,
    participants: [Object.freeze({
      role: "provider-cli",
      name,
      version: "1.0.0",
      revision: "fixture",
      channel: "test",
      content: candidate.content,
    })] as const,
    capabilities: [Object.freeze({ _tag: "Present" as const, id: "fixture", evidence: "unit" })] as const,
  });

describe("research-complete core vocabulary", () => {
  it("uses canonical scalar encodings and an exact eight-cell system target table", () => {
    expect(Artifact.decimalBytes("0")).toBe("0");
    expect(() => Artifact.decimalBytes("01")).toThrow(TypeError);
    expect(Artifact.sha256Digest("a".repeat(64))).toEqual({ algorithm: "sha256", value: "a".repeat(64) });
    expect(() => Artifact.sha256Digest("A".repeat(64))).toThrow(TypeError);
    expect(Schema.decodeUnknownSync(Artifact.FileModeSchema)(0o755)).toBe(0o755);
    expect(() => Schema.decodeUnknownSync(Artifact.FileModeSchema)(0o10_000)).toThrow();

    expect(SystemTarget.SystemTarget.literals).toHaveLength(8);
    for (const target of SystemTarget.SystemTarget.literals) {
      const descriptor = SystemTarget.describe(target);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(descriptor.target).toBe(target);
      expect(descriptor.nativeFormat).toBe(
        descriptor.os === "windows" ? "pe" : descriptor.os === "macos" ? "mach-o" : "elf",
      );
      expect(descriptor.executableSuffix).toBe(descriptor.os === "windows" ? ".exe" : "");
      expect(descriptor.os === "linux" ? descriptor.abi !== null : descriptor.abi === null).toBe(true);
      const originalOs = descriptor.os;
      expect(Reflect.set(descriptor, "os", "poisoned")).toBe(false);
      expect(SystemTarget.describe(target).os).toBe(originalOs);
    }
  });

  it("binds direct files, trees, and tree-file projections to honest publication protocols", () => {
    const shared = {
      path: "/tmp/effect-build-artifact" as Artifact.AbsolutePath,
      bytes: Artifact.decimalBytes("1"),
      digest: Artifact.sha256Digest("a".repeat(64)),
      provenance: Artifact.intrinsicProvenance("unit-test"),
    };
    const file = {
      _tag: "HashedFile",
      ...shared,
      publication: { scope: "file", commit: "same-parent-no-replace-link", committed: true },
    };
    expect(Artifact.isHashedFile(file)).toBe(true);
    expect(Artifact.isHashedFile({
      ...file,
      publication: { scope: "file", commit: "same-parent-rename", committed: true },
    })).toBe(false);

    const treeRoot = "/tmp/effect-build-tree" as Artifact.AbsolutePath;
    const relativePath = Artifact.portableRelativePath("artifact.bin");
    const treeManifestDigest = Artifact.sha256Digest("b".repeat(64));
    const projected = {
      ...file,
      path: `${treeRoot}/${relativePath}`,
      publication: {
        scope: "tree-file-projection",
        commit: "same-parent-rename",
        committed: true,
        treeRoot,
        relativePath,
        treeManifestDigest,
      },
    };
    expect(Artifact.isHashedFile(projected)).toBe(true);
    expect(Artifact.isHashedFile({ ...projected, path: "/tmp/other/artifact.bin" })).toBe(false);

    const tree = {
      _tag: "HashedTree",
      root: treeRoot,
      rootMode: Artifact.fileMode(0o755),
      entries: [],
      totalBytes: Artifact.decimalBytes("0"),
      manifestDigest: treeManifestDigest,
      provenance: Artifact.intrinsicProvenance("unit-test"),
      publication: { scope: "tree", commit: "same-parent-rename", committed: true },
    };
    expect(Artifact.isHashedTree(tree)).toBe(true);
    expect(Artifact.isHashedTree({
      ...tree,
      publication: projected.publication,
    })).toBe(false);
  });
});

describe.skipIf(process.platform === "win32")("Author Tool exact selection", () => {
  it("binds exact bytes and constructs an official command without a public runner", async () => {
    const root = await makeRoot();
    const executable = join(root, "tool");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);

    const selected = await Effect.runPromise(
      Tool.select({
        name: "fixture",
        executable,
        observe: (candidate) => Effect.succeed(observation("fixture", candidate)),
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(selected.executablePath).toBe(await realpath(executable));
    expect(selected.content.digest.value).toMatch(/^[0-9a-f]{64}$/u);
    const command = selected.command(["--version"], { cwd: root });
    expect(command._tag).toBe("StandardCommand");
    if (command._tag === "StandardCommand") {
      expect(command.command).toBe(selected.executablePath);
      expect(command.args).toEqual(["--version"]);
      expect(command.options.shell).toBe(false);
    }
    expect("run" in Tool).toBe(false);
    expect("runOrFail" in Tool).toBe(false);
  });

  it("validates, copies, and recursively freezes observer-owned tool facts", async () => {
    const root = await makeRoot();
    const executable = join(root, "tool");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);
    let raw: {
      name: string;
      participants: Array<{
        role: string;
        name: string;
        version: string;
        revision: string;
        channel: string;
        content: { bytes: string; digest: { algorithm: string; value: string } };
      }>;
      capabilities: Array<{ _tag: string; id: string; evidence: string }>;
    } | undefined;

    const selected = await Effect.runPromise(
      Tool.select({
        name: "fixture",
        executable,
        observe: (candidate) => {
          raw = {
            name: "fixture",
            participants: [{
              role: "provider-cli",
              name: "fixture",
              version: "1.0.0",
              revision: "fixture",
              channel: "test",
              content: {
                bytes: candidate.content.bytes,
                digest: { algorithm: "sha256", value: candidate.content.digest.value },
              },
            }],
            capabilities: [{ _tag: "Present", id: "fixture", evidence: "unit" }],
          };
          return Effect.succeed(raw as unknown as Tool.Observation<"fixture">);
        },
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    if (raw === undefined) throw new Error("fixture observer did not run");
    raw.name = "mutated";
    raw.participants[0]!.version = "mutated";
    raw.participants[0]!.content.digest.value = "b".repeat(64);
    raw.capabilities[0]!.evidence = "mutated";
    raw.participants.push({ ...raw.participants[0]!, name: "extra" });
    raw.capabilities.push({ _tag: "Present", id: "extra", evidence: "mutated" });

    expect(selected.observation.name).toBe("fixture");
    expect(selected.observation.participants).toHaveLength(1);
    expect(selected.observation.participants[0].version).toBe("1.0.0");
    expect(selected.observation.participants[0].content.digest.value).toBe(selected.content.digest.value);
    expect(selected.observation.capabilities).toEqual([{ _tag: "Present", id: "fixture", evidence: "unit" }]);
    expect(Object.isFrozen(selected.observation)).toBe(true);
    expect(Object.isFrozen(selected.observation.participants)).toBe(true);
    expect(Object.isFrozen(selected.observation.participants[0])).toBe(true);
    expect(Object.isFrozen(selected.observation.participants[0].content)).toBe(true);
    expect(Object.isFrozen(selected.observation.participants[0].content.digest)).toBe(true);
    expect(Object.isFrozen(selected.observation.capabilities)).toBe(true);
    expect(Object.isFrozen(selected.observation.capabilities[0])).toBe(true);
  });

  it("fails closed on incomplete or malformed observer-owned tool facts", async () => {
    const root = await makeRoot();
    const executable = join(root, "tool");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);

    const invalidObservations: ReadonlyArray<(candidate: Tool.Candidate<"fixture">) => unknown> = [
      (candidate) => ({ ...observation("fixture", candidate), name: "other" }),
      (candidate) => ({ ...observation("fixture", candidate), participants: [] }),
      (candidate) => {
        const valid = observation("fixture", candidate);
        return { ...valid, participants: [{ ...valid.participants[0], version: "" }] };
      },
      (candidate) => {
        const valid = observation("fixture", candidate);
        return {
          ...valid,
          participants: [{
            ...valid.participants[0],
            content: { ...valid.participants[0].content, digest: { algorithm: "sha256", value: "invalid" } },
          }],
        };
      },
      (candidate) => {
        const valid = observation("fixture", candidate);
        return { ...valid, participants: [{ ...valid.participants[0], name: "other" }] };
      },
      (candidate) => {
        const valid = observation("fixture", candidate);
        return {
          ...valid,
          participants: [{
            ...valid.participants[0],
            content: {
              bytes: valid.participants[0].content.bytes,
              digest: Artifact.sha256Digest("a".repeat(64)),
            },
          }],
        };
      },
      (candidate) => ({
        ...observation("fixture", candidate),
        capabilities: [{ _tag: "Unknown", id: "fixture", evidence: "unit" }],
      }),
      (candidate) => ({
        ...observation("fixture", candidate),
        capabilities: [{ _tag: "Present", id: "fixture", evidence: "" }],
      }),
    ];

    for (const invalid of invalidObservations) {
      const exit = await Effect.runPromiseExit(
        Tool.select({
          name: "fixture",
          executable,
          observe: (candidate) => Effect.succeed(invalid(candidate) as Tool.Observation<"fixture">),
        }).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.findErrorOption(exit.cause);
        expect(error._tag).toBe("Some");
        if (error._tag === "Some") expect(error.value).toBeInstanceOf(Tool.ToolSelectionInvalid);
      }
    }
  });

  it("fails closed when PATH identifies more than one canonical executable", async () => {
    const root = await makeRoot();
    const first = join(root, "first");
    const second = join(root, "second");
    await Effect.runPromise(
      Effect.promise(async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(first);
        await mkdir(second);
      }),
    );
    for (const directory of [first, second]) {
      await writeFile(join(directory, "fixture"), "#!/bin/sh\nexit 0\n");
      await chmod(join(directory, "fixture"), 0o755);
    }
    const provider = ConfigProvider.fromUnknown({ PATH: `${first}${delimiter}${second}` });
    const exit = await Effect.runPromiseExit(
      Tool.select({
        name: "fixture",
        observe: (candidate) => Effect.succeed(observation("fixture", candidate)),
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value._tag).toBe("ToolSelectionAmbiguous");
    }
  });

  it("detects replacement during observation and again at the launch boundary", async () => {
    const root = await makeRoot();
    const executable = join(root, "tool");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);

    const changedDuringSelection = await Effect.runPromiseExit(
      Tool.select({
        name: "fixture",
        executable,
        observe: (candidate) =>
          Effect.promise(async () => {
            await writeFile(executable, "#!/bin/sh\nexit 1\n");
            return observation("fixture", candidate);
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(changedDuringSelection)).toBe(true);

    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    const selected = await Effect.runPromise(
      Tool.select({
        name: "fixture",
        executable,
        observe: (candidate) => Effect.succeed(observation("fixture", candidate)),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    await writeFile(executable, "#!/bin/sh\nexit 2\n");
    const launch = await Effect.runPromiseExit(selected.reauthenticate.pipe(Effect.provide(NodeServices.layer)));
    expect(Exit.isFailure(launch)).toBe(true);
    if (Exit.isFailure(launch)) {
      const error = Cause.findErrorOption(launch.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value._tag).toBe("SelectedToolChanged");
    }
  });
});
