import { NodeServices } from "@effect/platform-node";
import type { Crypto, FileSystem, Layer, Path } from "effect";
import { ConfigProvider, Effect } from "effect";
import type { ChildProcessSpawner as EffectChildProcessSpawner } from "effect/unstable/process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutableArtifact } from "../../packages/effect-build/src/standalone/Artifact.js";
import type {
  BuildError,
  ToolNotFound,
  ToolProbeFailed,
} from "../../packages/effect-build/src/standalone/BuildError.js";
import type { CompileExecutableMatrixInput } from "../../packages/effect-build/src/standalone/CompileExecutableMatrix.js";
import type { CompileExecutableInput } from "../../packages/effect-build/src/standalone/Driver.js";
import type { SystemTarget } from "../../packages/effect-build/src/standalone/Target.js";

const fixture = fileURLToPath(new URL("../fixtures/driver/fake-tool.mjs", import.meta.url));

export interface StandaloneDriverContractConfig<
  Self,
  Options,
  SupportedTarget extends SystemTarget,
  ProviderArtifact extends ExecutableArtifact & {
    readonly provider: "bun" | "deno";
    readonly target: SupportedTarget;
  },
> {
  readonly tool: "bun" | "deno";
  readonly layer: (options?: { readonly executable?: string }) => Layer.Layer<
    Self,
    ToolNotFound | ToolProbeFailed,
    EffectChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Crypto.Crypto
  >;
  readonly compileExecutable: (
    input: CompileExecutableInput<Options, SupportedTarget>,
  ) => Effect.Effect<ProviderArtifact, BuildError, Self>;
  readonly compileExecutableMatrix: (
    input: CompileExecutableMatrixInput<SupportedTarget, Options>,
  ) => Effect.Effect<
    readonly ProviderArtifact[],
    unknown,
    Self
  >;
  readonly matrixTarget: SupportedTarget;
  readonly probeFirstArg: string;
  readonly compileFirstArg: string;
  readonly invalidOptions: Options;
  readonly unsupportedTarget?: SystemTarget;
}

export const describeStandaloneDriverContract = <
  Self,
  Options,
  SupportedTarget extends SystemTarget,
  ProviderArtifact extends ExecutableArtifact & {
    readonly provider: "bun" | "deno";
    readonly target: SupportedTarget;
  },
>(
  config: StandaloneDriverContractConfig<Self, Options, SupportedTarget, ProviderArtifact>,
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

  const makeFakeTool = (
    root: string,
    behavior: "ok" | "garbage" | "missing-path" | "empty-version" = "ok",
  ): { executable: string; log: string } => {
    const log = join(root, "spawns.log");
    writeFileSync(log, "");
    const executable = join(root, config.tool);
    const script = behavior === "garbage"
      ? `#!/bin/sh\nprintf 'not-json'\n`
      : behavior === "missing-path"
      ? `#!/bin/sh\nprintf '{"version":"9.9.9"}'\n`
      : behavior === "empty-version"
      ? `#!/bin/sh\nprintf '{"path":"%s","version":""}' "$0"\n`
      : `#!/bin/sh\nEFFECT_BUILD_FAKE_TOOL_PATH="$0" exec "${process.execPath}" "${fixture}" ${config.tool} "${log}" "$@"\n`;
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
    input: CompileExecutableInput<Options, SupportedTarget>,
    layerOptions?: { readonly executable?: string },
  ) =>
    run(
      config.compileExecutable(input).pipe(
        Effect.provide(config.layer(layerOptions)),
        Effect.provide(NodeServices.layer),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      ) as Effect.Effect<ExecutableArtifact, unknown, never>,
    ).then((artifact) => ({ artifact: artifact as ProviderArtifact, root }));

  const matrixInput = (
    root: string,
    outputDirectory: string,
  ): CompileExecutableMatrixInput<SupportedTarget, Options> => ({
    entrypoint: "main.ts",
    outdir: join(root, outputDirectory),
    name: "app",
    targets: [config.matrixTarget],
  });

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
      expect(artifact.provider).toBe(config.tool);
      expect(artifact.stages[0].tool.name).toBe(config.tool);
      expect(artifact.stages[0].tool.version).toBe("9.9.9");
      expect(artifact.stages[0].tool.path!.startsWith("/")).toBe(true);
      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines).toHaveLength(2);
      expect(lines[0]?.[0]).toBe(config.probeFirstArg);
      expect(lines[1]?.[0]).toBe(config.compileFirstArg);
      const compileArgv = lines[1] ?? [];
      expect(compileArgv[compileArgv.length - 1]).toBe("main.ts");
      expect(compileArgv.some((value) => value.includes(".effect-build-"))).toBe(true);
    });

    it("ignores empty and relative PATH entries while accepting a shim-reported canonical executable", async () => {
      const shimRoot = makeRoot();
      const toolRoot = makeRoot();
      const nonExecutableRoot = makeRoot();
      const nonRegularRoot = makeRoot();
      const { executable, log } = makeFakeTool(toolRoot);
      writeFileSync(join(nonExecutableRoot, config.tool), "not executable\n");
      chmodSync(join(nonExecutableRoot, config.tool), 0o644);
      mkdirSync(join(nonRegularRoot, config.tool));
      const shim = join(shimRoot, config.tool);
      writeFileSync(shim, `#!/bin/sh\nexec "${executable}" "$@"\n`);
      chmodSync(shim, 0o755);
      const previous = process.env.PATH;
      restores.push(() => {
        process.env.PATH = previous;
      });
      process.env.PATH = `:${nonExecutableRoot}:${nonRegularRoot}:relative:${shimRoot}`;

      const { artifact } = await compileOnce(toolRoot, {
        entrypoint: "main.ts",
        outfile: join(toolRoot, "out", "app"),
      });

      expect(artifact.stages[0].tool.path).toBe(realpathSync(executable));
      expect(spawnLog(log)).toHaveLength(2);
    });

    it("shares one discovery and probe across two matrix calls under one provided Layer", async () => {
      const root = makeRoot();
      const { executable, log } = makeFakeTool(root);
      const compilerLayer = config.layer({ executable });
      const artifacts = await run(
        Effect.gen(function*() {
          const first = yield* config.compileExecutableMatrix(matrixInput(root, "first"));
          const second = yield* config.compileExecutableMatrix(matrixInput(root, "second"));
          return [...first, ...second];
        }).pipe(
          Effect.provide(compilerLayer),
          Effect.provide(NodeServices.layer),
        ) as Effect.Effect<readonly ProviderArtifact[], unknown, never>,
      );

      expect(artifacts.map((artifact) => artifact.target)).toEqual([
        config.matrixTarget,
        config.matrixTarget,
      ]);
      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines.map((argv) => argv[0])).toEqual([
        config.probeFirstArg,
        config.compileFirstArg,
        config.compileFirstArg,
      ]);
    });

    it("acquires independently when callers build separate Layers", async () => {
      const root = makeRoot();
      const { executable, log } = makeFakeTool(root);
      const compileWithFreshLayer = (outputDirectory: string) =>
        config.compileExecutableMatrix(matrixInput(root, outputDirectory)).pipe(
          Effect.provide(config.layer({ executable })),
        );

      await run(
        Effect.gen(function*() {
          yield* compileWithFreshLayer("first");
          yield* compileWithFreshLayer("second");
        }).pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<void, unknown, never>,
      );

      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines.map((argv) => argv[0])).toEqual([
        config.probeFirstArg,
        config.compileFirstArg,
        config.probeFirstArg,
        config.compileFirstArg,
      ]);
    });

    it("completes whole-request matrix preflight before any build child starts", async () => {
      const root = makeRoot();
      const { executable, log } = makeFakeTool(root);
      const outputDirectory = join(root, "duplicate-targets");

      await expect(
        run(
          config.compileExecutableMatrix({
            entrypoint: "main.ts",
            outdir: outputDirectory,
            name: "app",
            targets: [config.matrixTarget, config.matrixTarget],
          }).pipe(
            Effect.provide(config.layer({ executable })),
            Effect.provide(NodeServices.layer),
          ) as Effect.Effect<readonly ProviderArtifact[], unknown, never>,
        ),
      ).rejects.toMatchObject({
        _tag: "InvalidMatrixInput",
        issues: [expect.objectContaining({ field: "targets", index: 1 })],
      });

      const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
      expect(lines.map((argv) => argv[0])).toEqual([config.probeFirstArg]);
      expect(existsSync(outputDirectory)).toBe(false);
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
      expect(existsSync(join(root, "out"))).toBe(false);
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
          } as CompileExecutableInput<Options, SupportedTarget>, { executable }),
        ).rejects.toMatchObject({ _tag: "TargetUnsupported", requested: unsupported });
        const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
        expect(lines).toHaveLength(1);
      });
    }

    it("rejects unknown and non-string runtime targets before staging or compile spawn", async () => {
      const hostile = {
        toString(): never {
          throw new Error("must not stringify user objects");
        },
      };
      const invalidTargets: ReadonlyArray<readonly [unknown, string]> = [
        ["not-a-canonical-target", "not-a-canonical-target"],
        [null, "<non-string:null>"],
        [[], "<non-string:array>"],
        [Symbol("target"), "<non-string:symbol>"],
        [hostile, "<non-string:object>"],
      ];

      for (const [target, requested] of invalidTargets) {
        const root = makeRoot();
        const { executable, log } = makeFakeTool(root);
        const outputDirectory = join(root, "out");
        await expect(
          compileOnce(root, {
            entrypoint: "main.ts",
            outfile: join(outputDirectory, "app"),
            target: target as never,
          } as CompileExecutableInput<Options, SupportedTarget>, { executable }),
        ).rejects.toMatchObject({ _tag: "TargetUnsupported", requested });
        const lines = spawnLog(log).map((line) => JSON.parse(line) as string[]);
        expect(lines).toHaveLength(1);
        expect(lines[0]?.[0]).toBe(config.probeFirstArg);
        expect(existsSync(outputDirectory)).toBe(false);
      }
    });

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
      for (const behavior of ["garbage", "missing-path", "empty-version"] as const) {
        const root = makeRoot();
        const { executable } = makeFakeTool(root, behavior);
        await expect(
          compileOnce(root, { entrypoint: "main.ts", outfile: join(root, "out", "app") }, { executable }),
        ).rejects.toMatchObject({ _tag: "ToolProbeFailed" });
      }
    });
  });
};
