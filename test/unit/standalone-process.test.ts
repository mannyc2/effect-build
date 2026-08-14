import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber } from "effect";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../../packages/effect-build/src/Integration.js";

const roots: string[] = [];
const fixture = fileURLToPath(new URL("../fixtures/process/interruptible-compiler.mjs", import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const run = (argv: readonly string[]) =>
  Effect.runPromise(executeCommand(process.execPath, argv).pipe(Effect.provide(NodeServices.layer)));

describe("standalone process", () => {
  it("captures normal and non-zero completion concurrently", async () => {
    const success = await run(["-e", "process.stdout.write('out');process.stderr.write('err')"]);
    expect(success).toMatchObject({ exitCode: 0, stdout: { text: "out" }, stderr: { text: "err" } });
    const failed = await run(["-e", "process.stderr.write('bad');process.exit(7)"]);
    expect(failed).toMatchObject({ exitCode: 7, stderr: { text: "bad", truncated: false } });
  });

  it("drains output beyond the retained cap", async () => {
    const completion = await run(["-e", "process.stdout.write('x'.repeat(1200000))"]);
    expect(completion.exitCode).toBe(0);
    expect(new TextEncoder().encode(completion.stdout.text).byteLength).toBe(1024 * 1024);
    expect(completion.stdout.truncated).toBe(true);
  });

  it("keeps fiber interruption as interruption and reaps the child", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-build-interrupt-"));
    roots.push(root);
    const sentinel = join(root, "pid");
    const fiber = Effect.runFork(
      executeCommand(process.execPath, [fixture, sentinel]).pipe(Effect.provide(NodeServices.layer)),
    );
    for (let index = 0; index < 200 && !existsSync(sentinel); index++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(existsSync(sentinel)).toBe(true);
    const pid = Number(readFileSync(sentinel, "utf8"));
    await Effect.runPromise(Fiber.interrupt(fiber));
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit) && Cause.interruptors(exit.cause).size > 0).toBe(true);
    for (let index = 0; index < 200; index++) {
      try {
        process.kill(pid, 0);
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch {
        break;
      }
    }
    expect(() => process.kill(pid, 0)).toThrow();
    expect(dirname(sentinel)).toBe(root);
  });
});
