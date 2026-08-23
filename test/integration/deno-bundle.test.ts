import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as DenoBundle from "../../packages/effect-build-deno/src/Bundle.js";

const execute = promisify(execFile);
const entrypoint = new URL("../fixtures/app/bundle-entry.ts", import.meta.url).pathname;

/** `deno bundle` exists from Deno 2.4. */
const denoBundleAvailable = (): boolean => {
  const executable = process.env.EFFECT_BUILD_DENO ?? "deno";
  try {
    const stdout = execFileSync(executable, ["--version"], { encoding: "utf8" });
    const version = /^deno (\d+)\.(\d+)/.exec(stdout.trim());
    if (version === null) return false;
    const [, major, minor] = version;
    return Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 4);
  } catch {
    return false;
  }
};
const enabled = denoBundleAvailable();
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-bundle-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const layerOptions: DenoBundle.LayerOptions = process.env.EFFECT_BUILD_DENO === undefined
  ? {}
  : { executable: process.env.EFFECT_BUILD_DENO };

const run = <A, E>(effect: Effect.Effect<A, E, DenoBundle.Bundler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(DenoBundle.layer(layerOptions)),
      Effect.provide(NodeServices.layer),
    ),
  );

describe.skipIf(!enabled)("real Deno Bundle", () => {
  it("bundles the import graph into one hashed file that node can execute", async () => {
    const outdir = join(root, "dist");
    const artifact = await run(DenoBundle.bundle({ entrypoints: [entrypoint], outdir }));
    expect(artifact._tag).toBe("Bundle");
    expect(artifact.outdir).toBe(outdir);
    expect(artifact.tool.name).toBe("deno");
    const entry = artifact.files.find((file) => file.path.endsWith("bundle-entry.js"));
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const bytes = await readFile(entry.path);
    expect(entry.bytes).toBe(bytes.byteLength);
    expect(entry.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(bytes.toString("utf8")).toContain("effect-build-bundle-ok");
    const completion = await execute(process.execPath, [entry.path]);
    expect(completion.stdout).toBe("effect-build-bundle-ok\n");
  }, 300_000);

  it("surfaces deno diagnostics as ToolFailed", async () => {
    await expect(run(DenoBundle.bundle({
      entrypoints: [join(root, "missing.ts")],
      outdir: join(root, "dist-failure"),
      hash: false,
    }))).rejects.toMatchObject({ _tag: "ToolFailed", tool: "deno" });
  }, 300_000);
});
