import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Cache, Checksums, Commit, Directory } from "effect-build";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import { TestCache } from "effect-build/testing";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

const executable = process.env.EFFECT_BUILD_BUN;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_BUN to the exact Bun executable under test");

it("ships separately built Node and Bun programs with their shared dependency tree", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-runtime-")));
  const producer = { name: "runtime-fixture", version: "1" };
  try {
    await writeFile(join(root, "show.ts"), 'import value from "shared-fixture"; console.log(`node:${value}`);\n');
    await writeFile(join(root, "worker.ts"), 'import value from "shared-fixture"; console.log(`bun:${value}:${typeof Bun.file}`);\n');
    const dependencies = join(root, "dependencies");
    await mkdir(join(dependencies, "packages", "shared"), { recursive: true });
    await mkdir(join(dependencies, "node_modules"));
    await writeFile(join(dependencies, "package.json"), '{"type":"module"}\n');
    await writeFile(join(dependencies, "packages", "shared", "package.json"), '{"name":"shared-fixture","type":"module","exports":"./index.js"}\n');
    await writeFile(join(dependencies, "packages", "shared", "index.js"), 'export default "shared";\n');
    await symlink("../packages/shared", join(dependencies, "node_modules", "shared-fixture"));
    await writeFile(join(root, "main.wasm"), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const node = yield* Bun.bundle({ entrypoints: ["show.ts"], cwd: root, outdir: join(root, "node-build"), options: { target: "node", external: ["shared-fixture"], sourcemap: "linked" } });
      const worker = yield* Bun.bundle({ entrypoints: ["worker.ts"], cwd: root, outdir: join(root, "bun-build"), options: { target: "bun", packages: "external", sourcemap: "linked" } });
      const modules = yield* Artifact.directory(dependencies, producer);
      const wasm = yield* Artifact.file(join(root, "main.wasm"), producer);
      const output = join(root, "runtime");
      const cache = yield* TestCache.layer;
      const inputs = yield* Effect.forEach([node, worker, modules, wasm], Artifact.withSha256);
      let assemblies = 0;
      const assemble = Effect.suspend(() => {
        assemblies++;
        return Directory.assemble({ outdir: output, entries: [{ artifact: node }, { artifact: worker }, { artifact: modules }, { artifact: wasm, path: "signer/main.wasm" }] });
      }).pipe(Cache.cached({ key: { operation: "runtime.assemble", tool: producer, inputs }, outfile: output, schema: Artifact.Directory }));
      const release = yield* Effect.gen(function*() {
        const first = yield* assemble;
        const firstIdentity = yield* Artifact.withSha256(first);
        yield* Effect.promise(() => rm(output, { recursive: true }));
        const restored = yield* assemble;
        expect((yield* Artifact.withSha256(restored)).sha256).toBe(firstIdentity.sha256);
        expect(restored).not.toHaveProperty("sha256");
        expect(assemblies).toBe(1);
        return restored;
      }).pipe(Effect.provide(cache));
      yield* Commit.atomic(join(root, "delivery"), (staged) => Effect.gen(function*() {
        const archive = yield* Archive.tarGz({ directory: release, outfile: join(staged, "runtime.tar.gz") }).pipe(Effect.flatMap(Artifact.withSha256));
        const checksums = yield* Checksums.write({ artifacts: [archive], outfile: join(staged, "runtime.tar.gz.sha256") });
        yield* Checksums.verify(checksums);
        return yield* Artifact.directory(staged, producer);
      }), { staging: "sibling" });
    })).pipe(Effect.provide(Bun.layer({ executable })), Effect.provide(NodeServices.layer)));

    // Remove every source/build directory before executing the unpacked artifact.
    for (const name of ["dependencies", "node-build", "bun-build", "runtime"]) await rm(join(root, name), { recursive: true });
    const extracted = join(root, "extracted");
    await mkdir(extracted);
    execFileSync("tar", ["-xzf", join(root, "delivery", "runtime.tar.gz"), "-C", extracted]);
    expect(execFileSync(process.execPath, [join(extracted, "show.js")], { cwd: tmpdir(), encoding: "utf8" }).trim()).toBe("node:shared");
    expect(execFileSync(executable, ["--no-env-file", join(extracted, "worker.js")], { cwd: tmpdir(), encoding: "utf8" }).trim()).toBe("bun:shared:function");
    expect(await readlink(join(extracted, "node_modules", "shared-fixture"))).toBe("../packages/shared");
    expect(await readFile(join(extracted, "signer", "main.wasm"))).toEqual(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    expect(JSON.parse(await readFile(join(extracted, "show.js.map"), "utf8"))).toHaveProperty("sourcesContent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
