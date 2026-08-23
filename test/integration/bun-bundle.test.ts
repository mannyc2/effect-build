import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunBundle from "../../packages/effect-build-bun/src/Bundle.js";

const execute = promisify(execFile);
const entrypoint = new URL("../fixtures/app/bundle-entry.ts", import.meta.url).pathname;
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-bundle-real-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const layerOptions: BunBundle.LayerOptions = process.env.EFFECT_BUILD_BUN === undefined
  ? {}
  : { executable: process.env.EFFECT_BUILD_BUN };

const run = <A, E>(effect: Effect.Effect<A, E, BunBundle.Bundler>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(BunBundle.layer(layerOptions)),
      Effect.provide(NodeServices.layer),
    ),
  );

describe("real Bun Bundle", () => {
  it("bundles the import graph into one hashed file that node can execute", async () => {
    const outdir = join(root, "dist");
    const artifact = await run(
      BunBundle.bundle({ entrypoints: [entrypoint], outdir, target: "node", format: "esm" }),
    );
    expect(artifact._tag).toBe("Bundle");
    expect(artifact.outdir).toBe(outdir);
    expect(artifact.tool.name).toBe("bun");
    expect(artifact.files).toHaveLength(1);
    const [file] = artifact.files;
    expect(file).toBeDefined();
    if (file === undefined) return;
    const bytes = await readFile(file.path);
    expect(file.bytes).toBe(bytes.byteLength);
    expect(file.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(bytes.toString("utf8")).toContain("effect-build-bundle-ok");
    const completion = await execute(process.execPath, [file.path]);
    expect(completion.stdout).toBe("effect-build-bundle-ok\n");
  }, 120_000);

  it("keeps requested externals unresolved and fails natively without them", async () => {
    const external = new URL("../fixtures/app/bundle-external.ts", import.meta.url).pathname;
    await expect(run(BunBundle.bundle({ entrypoints: [external], outdir: join(root, "dist-unresolved") })))
      .rejects.toMatchObject({ _tag: "ToolFailed", tool: "bun" });
    const artifact = await run(
      BunBundle.bundle({
        entrypoints: [external],
        outdir: join(root, "dist-external"),
        target: "node",
        external: ["an-unresolvable-external-for-effect-build"],
        hash: false,
      }),
    );
    const entry = artifact.files.find((file) => file.path.endsWith("bundle-external.js"));
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(await readFile(entry.path, "utf8")).toContain("an-unresolvable-external-for-effect-build");
  }, 120_000);
});
