import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import type * as Artifact from "effect-build/Artifact";
import { execFile, execFileSync } from "node:child_process";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Bundle from "../../packages/effect-build-deno/src/Command/Bundle.js";
import * as Transpile from "../../packages/effect-build-deno/src/Command/Transpile.js";
import * as Runtime from "../../packages/effect-build-deno/src/internal/Runtime.js";
import { observeProviderNativeEvidence } from "../evidence/provider-native.js";

const execute = promisify(execFile);
const selectedDeno = process.env.EFFECT_BUILD_DENO ?? (() => {
  try {
    return execFileSync("deno", ["eval", "console.log(Deno.execPath())"], { encoding: "utf8" }).trim();
  } catch {
    return "deno-unavailable";
  }
})();
const entrypoint = fileURLToPath(new URL("../fixtures/app/hello.ts", import.meta.url));

const exactDenoAvailable = (): boolean => {
  try {
    return /^deno 2\.9\.5\b/u.test(execFileSync(selectedDeno, ["--version"], { encoding: "utf8" }));
  } catch {
    return false;
  }
};

const exactDeno = exactDenoAvailable();
if (!exactDeno || (process.env.CI === "true" && process.env.EFFECT_BUILD_DENO === undefined)) {
  throw new Error("real Deno evidence requires exact Deno 2.9.5 and an explicit hosted EFFECT_BUILD_DENO binding");
}

const waitForFile = async (path: string): Promise<void> => {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
      await new Promise((resolveTick) => setTimeout(resolveTick, 25));
    }
  }
};

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-deno-api-real-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Runtime.layer({ executable: selectedDeno as Artifact.AbsolutePath })),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E>,
  );

describe("real Deno 2.9.5 provider breadth", () => {
  it("executes every one-shot bundle and transpile command shape", async () => {
    const bundled = await run(Bundle.stdout({ entrypoint, noRemote: true }));
    expect(new TextDecoder().decode(bundled.output)).toContain("effect-build-ok");
    expect(bundled.tool.participants[0]).toMatchObject({ name: "deno", version: "2.9.5" });

    const bundleOut = join(root, "bundle.js");
    const directBundle = await run(Bundle.direct({
      entrypoints: [entrypoint],
      destination: { _tag: "Output", path: bundleOut },
      noRemote: true,
    }));
    expect(directBundle.publication).toBe("provider-direct-durable");
    await expect(access(bundleOut)).resolves.toBeUndefined();

    const invalidCheckedEntry = join(root, "bundle-check.ts");
    await writeFile(invalidCheckedEntry, "const invalid: string = 1; console.log(invalid);\n");
    const checked = await run(Effect.exit(Bundle.stdout({
      entrypoint: invalidCheckedEntry,
      check: true,
      noRemote: true,
    })));
    expect(Exit.isFailure(checked)).toBe(true);

    const bundleDeclarationDir = join(root, "bundle-declarations");
    const bundleDeclarations = await run(Bundle.declarations({
      entrypoints: [entrypoint],
      destination: { _tag: "Outdir", path: bundleDeclarationDir },
      noRemote: true,
    }));
    expect(bundleDeclarations.publication).toBe("provider-direct-durable");
    const bundleDeclarationFiles = await readdir(bundleDeclarationDir, { recursive: true });
    expect(bundleDeclarationFiles.some((path) => path.endsWith("hello.js"))).toBe(true);
    expect(bundleDeclarationFiles.some((path) => path.endsWith("hello.d.ts"))).toBe(true);

    const transpiled = await run(Transpile.transpile({ file: entrypoint, noRemote: true }));
    expect(new TextDecoder().decode(transpiled.output)).toContain("effect-build-ok");

    const transpileDir = join(root, "transpiled");
    const directTranspile = await run(Transpile.transpileToDirectory({
      files: [entrypoint],
      outdir: transpileDir,
      noRemote: true,
    }));
    expect(directTranspile.publication).toBe("provider-direct-durable");
    expect((await readdir(transpileDir, { recursive: true })).some((path) => path.endsWith("hello.js"))).toBe(true);

    const declarationDir = join(root, "declarations");
    const declarations = await run(Transpile.emitDeclarations({
      files: [entrypoint],
      outdir: declarationDir,
      noRemote: true,
    }));
    expect(declarations.publication).toBe("provider-direct-durable");
    expect((await readdir(declarationDir, { recursive: true })).some((path) => path.endsWith("hello.d.ts"))).toBe(true);
    await observeProviderNativeEvidence(
      "CAN-DENO-003",
      "CAN-DENO-004",
      "CAN-DENO-006",
      "CAN-DENO-007",
      "CAN-DENO-008",
      "CAN-DENO-009",
      "D06.1",
    );
  }, 120_000);

  it("executes bundle watch under Scope and interrupts the real provider child", async () => {
    const watchOut = join(root, "bundle-watch.js");
    const watchExit = await run(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function*() {
              const watch = yield* Bundle.watch({
                entrypoints: [entrypoint],
                destination: { _tag: "Output", path: watchOut },
                noRemote: true,
              });
              expect(watch).toMatchObject({
                _tag: "BundleWatch",
                stability: "experimental",
                publication: "provider-direct-durable",
              });
              expect(yield* watch.process.isRunning).toBe(true);
              return yield* Effect.never;
            }),
          ),
        );
        yield* Effect.promise(() => waitForFile(watchOut)).pipe(Effect.ensuring(Fiber.interrupt(fiber)));
        return yield* Fiber.await(fiber);
      }),
    );
    expect(Exit.isFailure(watchExit)).toBe(true);
    if (Exit.isFailure(watchExit)) expect(Cause.hasInterrupts(watchExit.cause)).toBe(true);
    await expect(access(watchOut)).resolves.toBeUndefined();
    await observeProviderNativeEvidence("CAN-DENO-005");
  }, 120_000);

  it("enforces explicit real-host allow-import and deny-import authority", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/typescript");
      response.end('export const permitted = "deno-import-permission-ok";\n');
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Deno permission fixture has no IPv4 address");
    const authority = `127.0.0.1:${address.port}`;
    const remoteEntrypoint = `http://${authority}/permission.ts`;
    try {
      const denied = await run(Effect.exit(Bundle.stdout({
        entrypoint: remoteEntrypoint,
        denyImport: [authority],
        lock: false,
      })));
      expect(Exit.isFailure(denied)).toBe(true);
      if (Exit.isFailure(denied)) {
        const failure = Cause.findErrorOption(denied.cause);
        expect(failure._tag).toBe("Some");
        if (failure._tag === "Some" && failure.value._tag === "DenoCommandFailed") {
          expect(new TextDecoder().decode(failure.value.stderr)).toContain("Requires import access");
        }
      }
      expect(requests).toBe(0);

      const allowed = await run(Bundle.stdout({
        entrypoint: remoteEntrypoint,
        allowImport: [authority],
        lock: false,
        reload: true,
      }));
      expect(new TextDecoder().decode(allowed.output)).toContain("deno-import-permission-ok");
      expect(requests).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
      });
    }
  }, 120_000);

  it("executes the gated host Bundle API under the caller permission container", async () => {
    const stable = await execute(selectedDeno, ["eval", "console.log(typeof Deno.bundle)"]);
    expect(stable.stdout).toBe("undefined\n");

    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/typescript");
      response.end('export const permitted = "deno-host-api-permission-ok";\n');
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Deno host API fixture has no IPv4 address");
    const authority = `127.0.0.1:${address.port}`;
    const memoryEntrypoint = `http://${authority}/memory.ts`;
    const directEntrypoint = `http://${authority}/direct.ts`;
    const apiOutput = join(root, "api-bundle.js");
    const apiScript = join(root, "api-bundle-permissions.ts");
    const apiModule = process.env.EFFECT_BUILD_DENO_API_MODULE
      ?? new URL("./packages/effect-build-deno/src/Api/Bundle.ts", new URL("../../", import.meta.url)).href;
    const script = String.raw`
      import { Effect } from "npm:effect@4.0.0-rc.108";
      import * as Bundle from ${JSON.stringify(apiModule)};
      const [mode, entrypoint, outputPath] = Deno.args;
      const operation = mode === "memory"
        ? Bundle.memory({ entrypoints: [entrypoint], write: false })
        : Bundle.direct({ entrypoints: [entrypoint], outputPath, write: true });
      const result = await Effect.runPromise(operation.pipe(Effect.provide(Bundle.layer)));
      console.log(JSON.stringify({
        version: Deno.version.deno,
        success: result.success,
        outputs: result.outputFiles?.length,
        errors: result.errors.map(({ text }) => text),
      }));
    `;
    await writeFile(apiScript, script);
    const executeApi = (permissions: readonly string[], mode: "memory" | "direct", apiEntrypoint: string) =>
      execute(selectedDeno, [
        "run",
        "--unstable-bundle",
        "--unstable-sloppy-imports",
        "--no-lock",
        "--node-modules-dir=manual",
        "--no-prompt",
        ...permissions,
        apiScript,
        mode,
        apiEntrypoint,
        apiOutput,
      ], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        maxBuffer: 10 * 1024 * 1024,
      });
    try {
      const deniedRead = await executeApi([`--deny-read=${entrypoint}`], "memory", entrypoint);
      expect(JSON.parse(deniedRead.stdout.trim())).toMatchObject({
        success: false,
        errors: [expect.stringContaining("Requires read access")],
      });
      const localMemory = await executeApi([`--allow-read=${entrypoint}`], "memory", entrypoint);
      expect(JSON.parse(localMemory.stdout.trim())).toMatchObject({
        version: "2.9.5",
        success: true,
        outputs: 1,
      });

      const deniedImport = await executeApi([`--deny-import=${authority}`], "memory", memoryEntrypoint);
      expect(JSON.parse(deniedImport.stdout.trim())).toMatchObject({
        success: false,
        errors: [expect.stringContaining("Requires import access")],
      });
      expect(requests).toBe(0);
      const remoteMemory = await executeApi([`--allow-import=${authority}`], "memory", memoryEntrypoint);
      expect(JSON.parse(remoteMemory.stdout.trim())).toMatchObject({ success: true, outputs: 1 });
      expect(requests).toBeGreaterThan(0);

      await expect(
        executeApi(
          [`--allow-import=${authority}`, `--deny-write=${apiOutput}`],
          "direct",
          directEntrypoint,
        ),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("Requires write access") });
      await expect(access(apiOutput)).rejects.toMatchObject({ code: "ENOENT" });
      const direct = await executeApi(
        [`--allow-import=${authority}`, `--allow-write=${apiOutput}`],
        "direct",
        directEntrypoint,
      );
      expect(JSON.parse(direct.stdout.trim())).toMatchObject({ success: true });
      await expect(access(apiOutput)).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
      });
    }
    await observeProviderNativeEvidence("CAN-DENO-001", "CAN-DENO-002", "D10.1");
  }, 120_000);
});
