import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import * as Toolchain from "../../packages/effect-build/src/Toolchain.js";

const run = (script: string) =>
  Effect.runPromise(
    Toolchain.run({ tool: "immediate-child", executable: process.execPath, args: ["-e", script] }).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );

describe("Toolchain fast-child output hard cut", () => {
  it("drains immediate stdout and stderr before reading the exit status", async () => {
    const completion = await run(
      "require('node:fs').writeSync(1, 'immediate stdout'); require('node:fs').writeSync(2, 'immediate stderr')",
    );
    expect(completion).toEqual({
      exitCode: 0,
      stdout: { text: "immediate stdout", truncated: false },
      stderr: { text: "immediate stderr", truncated: false },
    });
  });

  it("drains large simultaneous streams while retaining the independent one-MiB bounds", async () => {
    const completion = await run(
      "const fs=require('node:fs'); fs.writeSync(1, Buffer.alloc(1048704, 111)); fs.writeSync(2, Buffer.alloc(1048832, 101))",
    );
    expect(completion.exitCode).toBe(0);
    expect(completion.stdout.text).toHaveLength(1024 * 1024);
    expect(completion.stderr.text).toHaveLength(1024 * 1024);
    expect(completion.stdout.text).toMatch(/^o+$/);
    expect(completion.stderr.text).toMatch(/^e+$/);
    expect(completion.stdout.truncated).toBe(true);
    expect(completion.stderr.truncated).toBe(true);
  });
});
