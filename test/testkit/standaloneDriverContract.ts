import { NodeServices } from "@effect/platform-node";
import type { Crypto, FileSystem, Layer, Path } from "effect";
import { Effect } from "effect";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Artifact } from "../../src/standalone/Artifact.js";
import type { BuildError, ToolNotFound, ToolProbeFailed } from "../../src/standalone/BuildError.js";
import type { CompileExecutableInput } from "../../src/standalone/Driver.js";
import type { ChildProcessSpawner } from "../../src/standalone/internal/Process.js";
import type { Target } from "../../src/standalone/Target.js";

const fixture = fileURLToPath(new URL("../fixtures/driver/fake-tool.mjs", import.meta.url));

export interface StandaloneDriverContractConfig<Self, Options> {
  readonly tool: "bun" | "deno";
  readonly layer: (options?: { readonly executable?: string }) => Layer.Layer<
    Self,
    ToolNotFound | ToolProbeFailed,
    ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
  >;
  readonly compileExecutable: (
    input: CompileExecutableInput<Options>,
  ) => Effect.Effect<Artifact, BuildError, Self>;
  readonly probeFirstArg: string;
  readonly compileFirstArg: string;
  readonly invalidOptions: Options;
  readonly unsupportedTarget?: Target;
}

export const describeStandaloneDriverContract = <Self, Options>(
  config: StandaloneDriverContractConfig<Self, Options>,
): void => {
  const roots: string[] = [];
  const restores: Array<() => void> = [];

  afterEach(() => {
    for (const restore of restores.splice(0)) restore();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const makeRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), "effect-build-driver-"));
    roots.push(root);
    return root;
  };

  const makeFakeTool = (root: string, behavior: "ok" | "garbage" = "ok"): { executable: string; log: string } => {
    const log = join(root, "spawns.log");
    writeFileSync(log, "");
    const executable = join(root, config.tool);
    const script = behavior === "ok"
      ? `#!/bin/sh\nEFFECT_BUILD_FAKE_TOOL_PATH="$0" exec "${process.execPath}" "${fixture}" ${config.tool} "${log}" "$@"\n`
      : `#!/bin/sh\nprintf 'not-json'\n`;
    writeFileSync(executable, script);
    chmodSync(executable, 0o755);
    return { executable, log };
  };

  const spawnLog = (log: string): string[] => readFileSync(log, "utf8").split("\n").filter((line) => line.length > 0);

  const prependPath = (root: string): void => {
    const previous = process.env.PATH;
    restores.push(() => {
      process.env.PATH = previous;
    });
    process.env.PATH = `${root}:${previous ?? ""}`;
  };

  const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
    Effect.runPromise(effect as Effect.Effect<A, never, never>);

  const compileOnce = (
    root: string,
    input: CompileExecutableInput<Options>,
    layerOptions?: { readonly executable?: string },
  ) =>
    run(
      config.compileExecutable(input).pipe(
        Effect.provide(config.layer(layerOptions)),
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<Artifact, unknown, never>,
    ).then((artifact) => ({ artifact, root }));

  describe(`${config.tool} standalone driver contract`, () => {
    it("discovers the tool on PATH with exactly one probe and one compile spawn", async () => {
      const root = makeRoot();
      const { log } = makeFakeTool(root);
      prependPath(root);
      const { artifact } = await compileOnce(root, {
        entrypoint: "main.ts",
        outfile: join(root, "out", "app"),
      });
      expect(artifact.path).toBe(join(root, "out", "app"));
      expect(artifact.tool.name).toBe(config.tool);
      expect(artifact.tool.version).toBe("9.9.9");
      expect(artifact.tool.path.startsWith("/")).toBe(true);
      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines).toHaveLength(2);
      expect(lines[0]?.[0]).toBe(config.probeFirstArg);
      expect(lines[1]?.[0]).toBe(config.compileFirstArg);
      const compileArgv = lines[1] ?? [];
      expect(compileArgv[compileArgv.length - 1]).toBe("main.ts");
      expect(compileArgv.some((value) => value.includes(".effect-build-"))).toBe(true);
    });

    it("does not spawn a compile for invalid driver options", async () => {
      const root = makeRoot();
      const { executable, log } = makeFakeTool(root);
      await expect(
        compileOnce(root, {
          entrypoint: "main.ts",
          outfile: join(root, "out", "app"),
          options: config.invalidOptions,
        }, { executable }),
      ).rejects.toMatchObject({ _tag: "InvalidDriverOptions" });
      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.[0]).toBe(config.probeFirstArg);
    });

    if (config.unsupportedTarget !== undefined) {
      const unsupported = config.unsupportedTarget;
      it("does not spawn a compile for an unsupported target", async () => {
        const root = makeRoot();
        const { executable, log } = makeFakeTool(root);
        await expect(
          compileOnce(root, {
            entrypoint: "main.ts",
            outfile: join(root, "out", "app"),
            target: unsupported,
          }, { executable }),
        ).rejects.toMatchObject({ _tag: "TargetUnsupported", requested: unsupported });
        const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
        expect(lines).toHaveLength(1);
      });
    }

    it("inherits the caller environment instead of replacing it", async () => {
      const root = makeRoot();
      const { executable, log } = makeFakeTool(root);
      const previous = process.env.EFFECT_BUILD_CONTRACT_ENV;
      restores.push(() => {
        if (previous === undefined) delete process.env.EFFECT_BUILD_CONTRACT_ENV;
        else process.env.EFFECT_BUILD_CONTRACT_ENV = previous;
      });
      process.env.EFFECT_BUILD_CONTRACT_ENV = "inherited-value";
      await compileOnce(root, { entrypoint: "main.ts", outfile: join(root, "out", "app") }, { executable });
      expect(spawnLog(log)).toContain("env:inherited-value");
    });

    it("returns bounded typed diagnostics for a non-zero compiler exit", async () => {
      const root = makeRoot();
      const { executable } = makeFakeTool(root);
      await expect(
        compileOnce(root, { entrypoint: "fail.ts", outfile: join(root, "out", "app") }, { executable }),
      ).rejects.toMatchObject({
        _tag: "ToolFailed",
        exitCode: 1,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ channel: "stderr", text: "error: missing import", truncated: false }),
        ]),
      });
    });

    it("fails layer construction with ToolNotFound when the command is absent", async () => {
      const root = makeRoot();
      prependPath(root);
      process.env.PATH = root;
      await expect(
        compileOnce(root, { entrypoint: "main.ts", outfile: join(root, "out", "app") }),
      ).rejects.toMatchObject({ _tag: "ToolNotFound", command: config.tool });
    });

    it("fails layer construction with ToolProbeFailed on malformed probe output", async () => {
      const root = makeRoot();
      const { executable } = makeFakeTool(root, "garbage");
      await expect(
        compileOnce(root, { entrypoint: "main.ts", outfile: join(root, "out", "app") }, { executable }),
      ).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
    });
  });
};
