import { NodeServices } from "@effect/platform-node";
import { Crypto, Effect, FileSystem, Path } from "effect";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as AssembleExecutable from "../../packages/effect-build-node-sea/src/Command/AssembleExecutable.js";
import * as Command from "../../packages/effect-build-node-sea/src/Command/index.js";
import * as AssembleModes from "../../packages/effect-build-node-sea/src/internal/AssembleModes.js";
import { Runtime } from "../../packages/effect-build-node-sea/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

const execute = promisify(execFile);
const fixture = fileURLToPath(new URL("../fixtures/tools/node-sea/", import.meta.url));
const builder = process.env.EFFECT_BUILD_NODE ?? "node";

const exactCell = (): { readonly enabled: boolean; readonly executable?: string } => {
  try {
    const executable = execFileSync(builder, ["-p", "process.execPath"], { encoding: "utf8" }).trim();
    const version = execFileSync(executable, ["--version"], { encoding: "utf8" }).trim();
    const help = execFileSync(executable, ["--help"], { encoding: "utf8" });
    const glibc = execFileSync(
      executable,
      ["-p", "Boolean(process.report?.getReport()?.header?.glibcVersionRuntime)"],
      { encoding: "utf8" },
    ).trim();
    return {
      enabled: version === "v26.7.0"
        && process.platform === "linux"
        && process.arch === "x64"
        && glibc === "true"
        && /(?:^|\s)--build-sea(?:[=\s]|$)/mu.test(help),
      executable,
    };
  } catch {
    return { enabled: false };
  }
};

const cell = exactCell();
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-node-sea-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(
  effect: Effect.Effect<A, E, Runtime | Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Command.layer({ builderExecutable: cell.executable as never })),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.skipIf(!cell.enabled).sequential("real Node SEA Command.AssembleExecutable exact cell", () => {
  it("assembles, hashes, atomically publishes, and executes a CJS file main", async () => {
    const outfile = join(root, "cjs-app");
    const artifact = await run(AssembleExecutable.assembleDirect({
      main: { _tag: "File", path: join(fixture, "main.cjs"), format: "commonjs" },
      outfile,
      observation: "hashed",
    }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "HashedExecutable",
      path: outfile,
      bytes: `${bytes.byteLength}`,
      nativeFormat: "elf",
      runtime: { name: "node", version: "26.7.0" },
      target: "linux-x64-gnu",
      publication: { commit: "same-parent-rename", committed: true },
    });
    expect(artifact.digest.value).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await execute(artifact.path, [])).stdout).toBe("node-sea-cjs-ok\n");
    await observeProviderNativeEvidence("CAN-NODE-001", "S02.1", "S09.1", "S10.1");
  }, 300_000);

  it("assembles an ESM main with embedded assets", async () => {
    const artifact = await run(AssembleExecutable.assembleDirect({
      main: { _tag: "File", path: join(fixture, "main.mjs"), format: "module" },
      outfile: join(root, "esm-app"),
      observation: "hashed",
      assets: [{ key: "message", path: join(fixture, "message.txt") }],
      disableExperimentalSEAWarning: true,
    }));
    expect(artifact.digest.value).toHaveLength(64);
    const completion = await execute(artifact.path, []);
    expect(completion.stdout).toContain("node-sea-esm-ok");
    expect(completion.stdout).toContain("node-sea-asset-ok");
    await observeProviderNativeEvidence("S03.1", "S04.1", "S04.2");
  }, 300_000);

  it("surfaces exact Node diagnostics for a broken main", async () => {
    await expect(run(AssembleExecutable.assembleDirect({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("this is not (javascript"), format: "commonjs" },
      outfile: join(root, "broken"),
      observation: "hashed",
    }))).rejects.toMatchObject({ _tag: "NodeSeaCommandFailed", operation: "check-main" });
  }, 300_000);

  it("executes the package-private CJS/ESM code-cache and CJS snapshot candidates", async () => {
    const cjsCache = await run(AssembleModes.assembleDirect({
      main: { _tag: "File", path: join(fixture, "main.cjs"), format: "commonjs" },
      outfile: join(root, "cjs-cache-app"),
      observation: "hashed",
      useCodeCache: true,
    }));
    expect((await execute(cjsCache.path, [])).stdout).toBe("node-sea-cjs-ok\n");

    const esmCache = await run(AssembleModes.assembleDirect({
      main: { _tag: "File", path: join(fixture, "main.mjs"), format: "module" },
      outfile: join(root, "esm-cache-app"),
      observation: "hashed",
      assets: [{ key: "message", path: join(fixture, "message.txt") }],
      useCodeCache: true,
    }));
    expect((await execute(esmCache.path, [])).stdout).toContain("node-sea-esm-ok");

    const snapshot = await run(AssembleModes.assembleDirect({
      main: {
        _tag: "Bytes",
        contents: new TextEncoder().encode([
          'const v8 = require("node:v8");',
          'v8.startupSnapshot.setDeserializeMainFunction(() => console.log("node-sea-snapshot-ok"));',
        ].join("\n")),
        format: "commonjs",
      },
      outfile: join(root, "snapshot-app"),
      observation: "hashed",
      useSnapshot: true,
    }));
    expect((await execute(snapshot.path, [])).stdout).toBe("node-sea-snapshot-ok\n");
    await observeProviderNativeEvidence("S05.1", "S06.1");
  }, 300_000);

  it("executes none, env, and cli embedded-argument extension policies", async () => {
    const main = {
      _tag: "Bytes" as const,
      contents: new TextEncoder().encode(
        "console.log(JSON.stringify({ execArgv: process.execArgv, argv: process.argv.slice(2) }))",
      ),
      format: "commonjs" as const,
    };
    const build = (name: string, execArgvExtension: "none" | "env" | "cli") =>
      run(AssembleModes.assembleDirect({
        main,
        outfile: join(root, `argv-${name}-app`),
        observation: "hashed",
        execArgv: ["--no-warnings"],
        execArgvExtension,
      }));

    const none = await build("none", "none");
    const noneOutput = JSON.parse(
      (await execute(none.path, ["script-value"], {
        env: { ...process.env, NODE_OPTIONS: "--trace-warnings" },
      })).stdout,
    ) as { readonly execArgv: readonly string[]; readonly argv: readonly string[] };
    expect(noneOutput.execArgv).toEqual(["--no-warnings"]);
    expect(noneOutput.argv).toEqual(["script-value"]);

    const env = await build("env", "env");
    const envOutput = JSON.parse(
      (await execute(env.path, ["script-value"], {
        env: { ...process.env, NODE_OPTIONS: "--trace-warnings" },
      })).stdout,
    ) as { readonly execArgv: readonly string[]; readonly argv: readonly string[] };
    expect(envOutput.execArgv).toEqual(expect.arrayContaining(["--no-warnings", "--trace-warnings"]));
    expect(envOutput.argv).toEqual(["script-value"]);

    const cli = await build("cli", "cli");
    const cliOutput = JSON.parse(
      (await execute(
        cli.path,
        ["--node-options=--trace-warnings", "script-value"],
      )).stdout,
    ) as { readonly execArgv: readonly string[]; readonly argv: readonly string[] };
    expect(cliOutput.execArgv).toEqual(expect.arrayContaining(["--no-warnings", "--trace-warnings"]));
    expect(cliOutput.argv).toEqual(["script-value"]);
    await observeProviderNativeEvidence("S07.1");
  }, 300_000);
});
