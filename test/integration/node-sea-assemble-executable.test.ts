import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as AssembleExecutable from "../../packages/effect-build-node-sea/src/AssembleExecutable.js";
import { hostTarget } from "../host-target.js";

const execute = promisify(execFile);
const fixture = fileURLToPath(new URL("../fixtures/tools/node-sea/", import.meta.url));

const builder = process.env.EFFECT_BUILD_NODE ?? "node";
const seaCapable = (): boolean => {
  try {
    const version = execFileSync(builder, ["--version"], { encoding: "utf8" }).trim().replace(/^v/, "");
    const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
    return (major ?? 0) > 26 || ((major ?? 0) === 26 && (minor ?? 0) >= 7);
  } catch {
    return false;
  }
};
const enabled = seaCapable();
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-node-sea-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, AssembleExecutable.Assembler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(AssembleExecutable.layer(
        process.env.EFFECT_BUILD_NODE === undefined ? {} : { builderExecutable: process.env.EFFECT_BUILD_NODE },
      )),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.skipIf(!enabled).sequential("real Node SEA AssembleExecutable", () => {
  it("assembles, hashes, publishes, and executes a CJS file main", async () => {
    const outfile = join(root, "cjs-app");
    const target = hostTarget();
    const artifact = await run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: join(fixture, "main.cjs"), format: "commonjs" },
      outfile,
      target,
    }));
    const bytes = await readFile(artifact.path);
    expect(artifact).toMatchObject({
      _tag: "Executable",
      path: process.platform === "win32" ? `${outfile}.exe` : outfile,
      bytes: bytes.byteLength,
      target,
    });
    expect(artifact.tool.name).toBe("node");
    expect(artifact.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await execute(artifact.path, [])).stdout).toBe("node-sea-cjs-ok\n");
  }, 300_000);

  it("assembles an ESM main with embedded assets", async () => {
    const outfile = join(root, "esm-app");
    const artifact = await run(AssembleExecutable.assembleExecutable({
      main: { _tag: "File", path: join(fixture, "main.mjs"), format: "module" },
      outfile,
      target: hostTarget(),
      assets: { message: join(fixture, "message.txt") },
      disableExperimentalSEAWarning: true,
    }));
    expect(artifact.sha256).toHaveLength(64);
    const completion = await execute(artifact.path, []);
    expect(completion.stdout).toContain("node-sea-esm-ok");
    expect(completion.stdout).toContain("node-sea-asset-ok");
  }, 300_000);

  it("surfaces node diagnostics as ToolFailed for a broken main", async () => {
    await expect(run(AssembleExecutable.assembleExecutable({
      main: { _tag: "Bytes", contents: new TextEncoder().encode("this is not (javascript"), format: "commonjs" },
      outfile: join(root, "broken"),
      target: hostTarget(),
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "node" });
  }, 300_000);
});
