import { NodeServices } from "@effect/platform-node";
import { Effect, Path, type Scope } from "effect";
import { Tool } from "effect-build";
import { TestArtifact, TestSpawner, TestTool } from "effect-build/testing";
import * as Apple from "effect-build-apple";
import * as Archive from "effect-build-archives";
import * as Bun from "effect-build-bun";
import * as Deno from "effect-build-deno";
import * as Nfpm from "effect-build-nfpm";
import * as NodeSea from "effect-build-node-sea";
import * as Python from "effect-build-python";
import * as Sbom from "effect-build-sbom";
import * as Windows from "effect-build-windows";
import { describe, expect, it } from "vitest";

describe("provider process environments", () => {
  it.each([false, true])("forwards explicit replacement environments through every binary provider and watch (scrub=%s)", (scrubEnv) => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const source = yield* TestArtifact.file("console.log('fixture');", "main.cjs");
    const linux = yield* TestArtifact.executable("linux-x64");
    const mac = yield* TestArtifact.executable("darwin-arm64");
    const windows = yield* TestArtifact.executable("windows-x64");
    const p = yield* Path.Path;
    const cwd = p.dirname(source.path);
    const outfile = p.join(cwd, "output.exe");
    const environment: Tool.EnvironmentOptions = { env: { EFFECT_BUILD_TEST: "forwarded" }, extendEnv: false, scrubEnv };
    const bun = TestTool.resolved("bun", "1.3.14");
    const deno = TestTool.resolved("deno", "2.9.5");
    const node = TestTool.resolved("node", "22.0.0");
    const cases: readonly [string, Effect.Effect<unknown, unknown, NodeServices.NodeServices | Scope.Scope>][] = [
      ["Bun.compile", Bun.compile({ entrypoints: [source.path], outfile, target: "linux-x64", ...environment }).pipe(Effect.provide(Bun.testLayer({ tool: bun })))],
      ["Bun.bundle", Bun.bundle({ entrypoints: [source.path], outdir: outfile, ...environment }).pipe(Effect.provide(Bun.testLayer({ tool: bun })))],
      ["Bun.build", Bun.build({ entrypoints: [source.path], ...environment }).pipe(Effect.provide(Bun.testLayer({ tool: bun })))],
      ["Bun.watch", Bun.watch({ entrypoints: [source.path], outdir: outfile, ...environment }).pipe(Effect.flatMap((watch) => watch.process.exitCode), Effect.provide(Bun.testLayer({ tool: bun })))],
      ["Deno.compile", Deno.compile({ entrypoint: source.path, outfile, target: "linux-x64", ...environment }).pipe(Effect.provide(Deno.testLayer({ tool: deno })))],
      ["Deno.bundle", Deno.bundle({ entrypoints: [source.path], outdir: outfile, ...environment }).pipe(Effect.provide(Deno.testLayer({ tool: deno })))],
      ["Deno.transpile", Deno.transpile({ files: [source.path], outdir: outfile, ...environment }).pipe(Effect.provide(Deno.testLayer({ tool: deno })))],
      ["Deno.watch", Deno.watch({ entrypoint: source.path, outfile, target: "linux-x64", ...environment }).pipe(Effect.flatMap((watch) => watch.process.exitCode), Effect.provide(Deno.testLayer({ tool: deno })))],
      ["Archive.source", Archive.source({ repository: cwd, tree: "a".repeat(40), project: "fixture", version: "1", format: "tar.gz", outfile, ...environment }).pipe(Effect.provide(Archive.testLayer({ tool: TestTool.resolved("git", "2.40.0") })))],
      ["Python.build", Python.build({ project: cwd, outdir: outfile, ...environment }).pipe(Effect.provide(Python.testLayer({ tool: TestTool.resolved("uv", "0.12.0") })))],
      ["Nfpm.package", Nfpm.package({ contents: [{ artifact: source, dst: "/usr/share/fixture" }], config: { name: "fixture", arch: "amd64", version: "1.0.0" }, format: "deb", outfile: p.join(cwd, "output.deb"), ...environment }).pipe(Effect.provide(Nfpm.testLayer({ tool: TestTool.resolved("nfpm", "2.47.0") })))],
      ["Sbom.generate", Sbom.generate({ subject: source, format: "spdx-json", outfile, ...environment }).pipe(Effect.provide(Sbom.testLayer({ tool: TestTool.resolved("syft", "1.50.0") })))],
      ["NodeSea.assemble", NodeSea.assemble({ main: source, outfile, ...environment }).pipe(Effect.provide(NodeSea.testLayer({ tool: node, base: { ...node, path: linux.path } })))],
      ["Windows.sign", Windows.sign({ artifact: windows, outfile, kind: "store", thumbprint: "a".repeat(40), timestampUrl: "https://timestamp.example", ...environment }).pipe(Effect.provide(Windows.testLayer({ tool: TestTool.resolved("signtool", "10.0.26100") })))],
      ["Apple.sign", Apple.sign({ artifact: mac, outfile, certificateSha1: "a".repeat(40), ...environment }).pipe(Effect.provide(Apple.testLayer({ tool: TestTool.resolved("xcrun", "70.0.0") })))],
    ];
    for (const [name, effect] of cases) {
      const calls: TestSpawner.Call[] = [];
      yield* effect.pipe(Effect.exit, Effect.provide(TestSpawner.layer((call) => Effect.sync(() => { calls.push(call); return { exitCode: 23 }; }))));
      expect(calls.length, name).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.env.EFFECT_BUILD_TEST, name).toBe("forwarded");
        if (scrubEnv) {
          expect(call.env.PATH, name).toBe(p.dirname(call.command));
          expect(call.env.HOME, name).toBe(call.env.TMPDIR);
          expect(call.env.HOME, name).not.toBe(process.env.HOME);
        } else expect(call.env, name).toEqual({ EFFECT_BUILD_TEST: "forwarded" });
      }
    }
  })).pipe(Effect.provide(NodeServices.layer))));
});
