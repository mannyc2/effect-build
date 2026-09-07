import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Transpile from "../../packages/effect-build-deno/src/Command/Transpile.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";
import { selectToolFixture } from "./helpers/exact-tool.js";

const fixture = selectToolFixture("deno");
const execute = promisify(execFile);
let root = "";
let entrypoint = "";
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-deno-transpile-")));
  entrypoint = join(root, "meaning.ts");
  await writeFile(entrypoint, "export const meaning: number = 42; console.log(meaning);\n");
});
afterAll(async () => rm(root, { recursive: true, force: true }));

const run = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime>) =>
  Effect.runPromise(effect.pipe(
    Effect.provide(Runtime.layer({ executable: fixture.executable as Artifact.AbsolutePath })),
    Effect.provide(NodeServices.layer),
  ));

describe(`real Deno ${fixture.version} public transpile`, () => {
  it.skipIf(!fixture.supports("transpileStdout"))(
    "executes stdout and directory programs with source maps and conditions",
    async () => {
      const stdout = await run(Transpile.transpile({
        file: entrypoint,
        cwd: root,
        noRemote: true,
        sourceMap: "inline",
        conditions: ["development"],
      }));
      const stdoutFile = join(root, "stdout.mjs");
      await writeFile(stdoutFile, stdout.output);
      expect((await execute(process.execPath, [stdoutFile])).stdout).toBe("42\n");
      await fixture.observe("transpile-stdout", stdout.tool, {
        operation: "transpileStdout",
        runner: `node-${process.versions.node}`,
      });

      const outdir = join(root, "direct");
      const direct = await run(Transpile.transpileToDirectory({
        files: [entrypoint],
        cwd: root,
        outdir,
        noRemote: true,
        conditions: ["development"],
      }));
      expect(direct.publication).toBe("provider-direct-durable");
      const files = await readdir(outdir, { recursive: true });
      const javascript = files.find((path) => path.endsWith("meaning.js"));
      expect(javascript).toBeDefined();
      expect((await execute(process.execPath, [join(outdir, javascript!)])).stdout).toBe("42\n");
      await fixture.observe("transpile-directory", direct.tool, {
        operation: "transpileDirect",
        runner: `node-${process.versions.node}`,
      });
      await observeProviderNativeEvidence("CAN-DENO-007", "CAN-DENO-008");
    },
    120_000,
  );

  it.skipIf(!fixture.supports("transpileDeclarations"))(
    "emits declarations consumed by the independent TypeScript checker",
    async () => {
      const outdir = join(root, "declarations");
      const result = await run(Transpile.emitDeclarations({
        files: [entrypoint],
        cwd: root,
        outdir,
        noRemote: true,
        conditions: ["development"],
      }));
      expect(result.publication).toBe("provider-direct-durable");
      const files = await readdir(outdir, { recursive: true });
      const declaration = files.find((path) => path.endsWith("meaning.d.ts"));
      expect(declaration).toBeDefined();
      const consumer = join(root, "consumer.ts");
      const module = join(outdir, declaration!).replace(/\.d\.ts$/u, ".js").replaceAll("\\", "/");
      await writeFile(consumer, `import { meaning } from ${JSON.stringify(module)};\nconst value: number = meaning;\n`);
      const program = ts.createProgram([consumer], {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      expect(
        ts.getPreEmitDiagnostics(program).map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        ),
      ).toEqual([]);
      await fixture.observe("transpile-declarations-consumer", result.tool, {
        operation: "transpileDeclarations",
        runner: `typescript-${ts.version}`,
      });
      await observeProviderNativeEvidence("CAN-DENO-009");
    },
    120_000,
  );

  it.skipIf(fixture.supports("transpileStdout"))(
    "rejects the real compiler whose transpile options are incompatible",
    async () => {
      await expect(run(Transpile.transpile({ file: entrypoint, conditions: ["development"] }))).rejects.toMatchObject({
        _tag: "DenoCommandUnsupported",
        operation: "transpileStdout",
        version: fixture.version,
      });
      await expect(run(Transpile.transpileToDirectory({ files: [entrypoint], outdir: join(root, "refused-direct") })))
        .rejects.toMatchObject({
          _tag: "DenoCommandUnsupported",
          operation: "transpileDirect",
          version: fixture.version,
        });
      await expect(run(Transpile.emitDeclarations({ files: [entrypoint], outdir: join(root, "refused-declarations") })))
        .rejects.toMatchObject({
          _tag: "DenoCommandUnsupported",
          operation: "transpileDeclarations",
          version: fixture.version,
        });
      const runtime = await run(Runtime.Runtime);
      for (const operation of ["transpileStdout", "transpileDirect", "transpileDeclarations"]) {
        await fixture.observe(`rejected-${operation}`, runtime.tool.observation, {
          operation,
          runner: "admission-only",
        });
      }
    },
  );
});
