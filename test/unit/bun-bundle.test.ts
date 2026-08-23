import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit } from "effect";
import { chmod, copyFile, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as BunBundle from "../../packages/effect-build-bun/src/Bundle.js";

const fixture = resolve(fileURLToPath(new URL("../fixtures/tools/fake-bun.mjs", import.meta.url)));
let root = "";
let executable = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-bun-bundle-"));
  executable = join(root, "bun");
  await copyFile(fixture, executable);
  await chmod(executable, 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, BunBundle.Bundler>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(BunBundle.layer({ executable })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  const found = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : undefined;
  expect(found?._tag).toBe("Some");
  return (found as { readonly value: E }).value;
};

const describeUnix = process.platform === "win32" ? describe.skip : describe.sequential;
describeUnix("Bun Bundle", () => {
  it("bundles multiple entrypoints with hashed, sorted files", async () => {
    const outdir = join(root, "dist-hashed");
    const exit = await run(
      BunBundle.bundle({ entrypoints: ["src/main.ts", "src/worker.ts"], outdir }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value._tag).toBe("Bundle");
      expect(exit.value.outdir).toBe(outdir);
      expect(exit.value.tool).toEqual({ name: "bun", version: "1.3.14" });
      expect(exit.value.files.map((file) => file.path)).toEqual([join(outdir, "main.js"), join(outdir, "worker.js")]);
      for (const file of exit.value.files) {
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("records split chunks and sourcemaps, without digests when hashing is disabled", async () => {
    const outdir = join(root, "dist-split");
    const exit = await run(
      BunBundle.bundle({
        entrypoints: ["src/main.ts"],
        outdir,
        hash: false,
        splitting: true,
        sourcemap: "linked",
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.files.map((file) => file.path)).toEqual([
        join(outdir, "chunks", "chunk-fake.js"),
        join(outdir, "main.js"),
        join(outdir, "main.js.map"),
      ]);
      expect(exit.value.files.some((file) => "sha256" in file)).toBe(false);
    }
  });

  it("preserves cwd and renders the closed bundle argv", async () => {
    const project = join(root, "project");
    const log = join(root, "project.log");
    await rm(project, { recursive: true, force: true });
    await writeFile(log, "");
    process.env.FAKE_BUN_LOG = log;
    try {
      const exit = await run(
        BunBundle.bundle({
          entrypoints: ["main.ts"],
          outdir: "dist",
          cwd: root,
          target: "node",
          format: "esm",
          minify: true,
          packages: "external",
          external: ["react", "effect"],
        }),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value.outdir).toBe(join(root, "dist"));
      const lines = (await readFile(log, "utf8")).trim().split("\n");
      const invocation = JSON.parse(lines.at(-1) ?? "") as { readonly argv: readonly string[]; readonly cwd: string };
      expect(invocation.cwd).toBe(await realpath(root));
      expect(invocation.argv[0]).toBe("build");
      expect(invocation.argv).not.toContain("--compile");
      expect(invocation.argv).toContain("--target=node");
      expect(invocation.argv).toContain("--format=esm");
      expect(invocation.argv).toContain("--minify");
      expect(invocation.argv).toContain("--packages=external");
      expect(invocation.argv).toContain("--external=react");
      expect(invocation.argv).toContain("--external=effect");
      expect(invocation.argv.at(-1)).toBe("main.ts");
    } finally {
      delete process.env.FAKE_BUN_LOG;
    }
  });

  it("surfaces tool failures and empty production as typed errors", async () => {
    process.env.FAKE_BUN_MODE = "fail";
    const failed = await run(BunBundle.bundle({ entrypoints: ["main.ts"], outdir: join(root, "dist-fail") }));
    const failure = failureOf(failed) as { readonly _tag: string; readonly exitCode: number };
    expect(failure._tag).toBe("ToolFailed");
    expect(failure.exitCode).toBe(17);
    process.env.FAKE_BUN_MODE = "missing";
    const missing = await run(BunBundle.bundle({ entrypoints: ["main.ts"], outdir: join(root, "dist-missing") }));
    const missingFailure = failureOf(missing) as { readonly _tag: string; readonly reason: string };
    expect(missingFailure._tag).toBe("PublishFailed");
    expect(missingFailure.reason).toContain("did not produce any files");
    delete process.env.FAKE_BUN_MODE;
  });
});
