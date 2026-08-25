import { NodeServices } from "@effect/platform-node";
import { Cause, ConfigProvider, Effect, Exit } from "effect";
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

    expect(SystemTarget.SystemTarget.literals).toHaveLength(8);
    for (const target of SystemTarget.SystemTarget.literals) {
      const descriptor = SystemTarget.describe(target);
      expect(descriptor.target).toBe(target);
      expect(descriptor.nativeFormat).toBe(
        descriptor.os === "windows" ? "pe" : descriptor.os === "macos" ? "mach-o" : "elf",
      );
      expect(descriptor.executableSuffix).toBe(descriptor.os === "windows" ? ".exe" : "");
      expect(descriptor.os === "linux" ? descriptor.abi !== null : descriptor.abi === null).toBe(true);
    }
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
