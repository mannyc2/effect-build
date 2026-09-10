import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Executable, Tool } from "effect-build";
import * as NodeSea from "effect-build-node-sea";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_NODE;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_NODE to the exact Node executable under test");
const run = <A, E>(effect: Effect.Effect<A, E, NodeSea.NodeSea | NodeServices.NodeServices>, baseExecutable?: string) =>
  Effect.runPromise(effect.pipe(
    Effect.provide(NodeSea.layer({ executable, ...(baseExecutable === undefined ? {} : { baseExecutable }) })),
    Effect.provide(NodeServices.layer),
  ));
const observe = (path: string) => Effect.runPromise(Artifact.file(path, { name: "fixture", version: "0.7.0" }).pipe(
  Effect.provide(NodeServices.layer),
));
const name = (value: string) => `${value}${process.platform === "win32" ? ".exe" : ""}`;
let root: string;
let mainPath: string;
let assetPath: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-node-sea-")));
  mainPath = join(root, "main.cjs");
  assetPath = join(root, "message.txt");
  await writeFile(mainPath, "console.log('hello from SEA');\n");
  await writeFile(assetPath, "embedded message\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("real Node SEA executables", () => {
  it("embeds a CommonJS main and binary assets that run after their source files are removed", async () => {
    await writeFile(mainPath, [
      'const { getAsset } = require("node:sea");',
      'console.log("hello from SEA");',
      'process.stdout.write(getAsset("message", "utf8"));',
      'console.log(Buffer.from(getAsset("__proto__")).toString("hex"));',
    ].join("\n"));
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    const binaryPath = join(root, "binary.dat");
    await writeFile(binaryPath, bytes);
    const artifact = await run(NodeSea.assemble({
      main: await observe(mainPath),
      assets: { message: await observe(assetPath), ["__proto__"]: await observe(binaryPath) },
      outfile: `dist/${name("hello")}`, cwd: root,
    }));
    expect(artifact.path).toBe(join(root, "dist", name("hello")));
    const base = await run(Executable.inspect(executable).pipe(Effect.flatMap((facts) => Executable.resolveTarget(executable, facts))));
    expect(artifact.target).toBe(base);
    expect(Executable.matches(await run(Executable.inspect(artifact.path)), artifact.target)).toBe(true);
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    await Promise.all([rm(mainPath), rm(assetPath), rm(binaryPath)]);
    const completion = await execute(artifact.path, [], { timeout: 30_000 });
    expect(completion.stdout).toBe(`hello from SEA\nembedded message\n${Buffer.from(bytes).toString("hex")}\n`);
    expect(await readdir(join(root, "dist"))).toEqual([name("hello")]);
  }, 300_000);

  it.each(["main", "asset"] as const)("rejects changed %s bytes while preserving existing output", async (changed) => {
    const main = await observe(mainPath);
    const asset = await observe(assetPath);
    const outfile = join(root, name("existing"));
    await writeFile(outfile, "previous output");
    await writeFile(changed === "main" ? mainPath : assetPath, "changed input\n");
    const failure = await run(NodeSea.assemble({ main, assets: { message: asset }, outfile }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed", path: changed === "main" ? mainPath : assetPath });
    expect(await readFile(outfile, "utf8")).toBe("previous output");
    expect((await readdir(root)).sort()).toEqual([name("existing"), "main.cjs", "message.txt"].sort());
  });

  it("preserves existing output and removes staging files when Node rejects malformed source", async () => {
    await writeFile(mainPath, "const = ;\n");
    const outfile = join(root, name("existing"));
    await writeFile(outfile, "previous output");
    const failure = await run(NodeSea.assemble({ main: await observe(mainPath), outfile }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    if (failure instanceof Tool.Failed) expect(failure.stderr).toContain("SyntaxError");
    expect(await readFile(outfile, "utf8")).toBe("previous output");
    expect((await readdir(root)).sort()).toEqual([name("existing"), "main.cjs", "message.txt"].sort());
  }, 30_000);

  it("writes directly with an explicit base executable and keeps preparation files separate", async () => {
    const base = join(root, name("base-node"));
    await copyFile(executable, base);
    await chmod(base, 0o755);
    const main = await observe(mainPath);
    const { service, artifact } = await run(Effect.gen(function*() {
      const service = yield* NodeSea.NodeSea;
      const artifact = yield* NodeSea.assemble({ main, outfile: name("explicit-base"), cwd: root, atomic: false });
      return { service, artifact };
    }), base);
    expect(service.builder.path).toBe(await realpath(executable));
    expect(service.base.path).toBe(await realpath(base));
    expect(service.base.sha256).toBe(createHash("sha256").update(await readFile(base)).digest("hex"));
    expect(service.builder.sha256).toBe(service.base.sha256);
    expect((await execute(artifact.path, [], { timeout: 30_000 })).stdout).toBe("hello from SEA\n");
    expect(await run(Artifact.verify(artifact))).toEqual(artifact);
    expect((await readdir(root)).sort()).toEqual([name("base-node"), name("explicit-base"), "main.cjs", "message.txt"].sort());
  }, 300_000);
});
