import { NodeServices } from "@effect/platform-node";
import { Cause, ConfigProvider, Effect, Exit, Fiber } from "effect";
import * as Tool from "effect-build/Tool";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const withPath = (value: string) => Effect.provideService(
  ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: value }),
);
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "effect-build-tool-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("tool resolution and execution", () => {
  it("uses an explicit executable, hashes its real bytes, and parses its version output", async () => {
    const tool = await run(Tool.resolve({
      name: "node-fixture",
      executable: process.execPath,
      versionArgs: ["-e", "process.stdout.write('fixture version 1.3.14\\n')"],
      parseVersion: (completion) => new TextDecoder().decode(completion.stdout).trim().split(" ").at(-1),
    }).pipe(withPath(root)));
    const contents = await readFile(process.execPath);
    expect(tool.path).toBe(await realpath(process.execPath));
    expect(tool.version).toBe("1.3.14");
    expect(tool.bytes).toBe(contents.byteLength);
    expect(tool.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    const completion = await run(Tool.run(tool, ["-e", "process.stdout.write('hello');process.stderr.write('warning')"]));
    expect(new TextDecoder().decode(completion.stdout)).toBe("hello");
    expect(new TextDecoder().decode(completion.stderr)).toBe("warning");
  });

  it("finds the first PATH hit and reads the first stdout token by default", async () => {
    const tool = await run(Tool.resolve({
      name: basename(process.execPath),
      versionArgs: ["-e", "process.stdout.write('1.3.14 fixture\\n')"],
    }).pipe(withPath([root, dirname(process.execPath)].join(delimiter))));
    expect(tool.path).toBe(await realpath(process.execPath));
    expect(tool.version).toBe("1.3.14");
  });

  it("reports a failed first PATH hit instead of trying another executable", async () => {
    const name = basename(process.execPath);
    const broken = join(root, name);
    await writeFile(broken, new Uint8Array([0x4d, 0x5a, 0, 0, 0, 0]), { mode: 0o755 });
    const failure = await run(Tool.resolve({ name }).pipe(
      withPath([root, dirname(process.execPath)].join(delimiter)), Effect.flip,
    ));
    expect(failure).toMatchObject({ _tag: "ToolProbeFailed", path: await realpath(broken), detail: expect.stringMatching(/\S/u) });
  });

  it("reports synchronous native argument rejection as a spawn failure", async () => {
    const tool = await run(Tool.resolve({ name: "node", executable: process.execPath }));
    const failure = await run(Tool.run(tool, ["\0"]).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ToolSpawnFailed", name: "node", detail: expect.stringContaining("null bytes") });
  });

  it("keeps interruption as interruption while stopping a real process", async () => {
    const tool = await run(Tool.resolve({ name: "node", executable: process.execPath }));
    const marker = join(root, "started");
    const fiber = Effect.runFork(Tool.run(tool, [
      "-e", "require('node:fs').writeFileSync(process.argv[1], 'ready'); setInterval(() => {}, 1000)", marker,
    ]).pipe(Effect.provide(NodeServices.layer)));
    try {
      await expect.poll(() => readFile(marker, "utf8"), { timeout: 10_000 }).toBe("ready");
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber));
    }
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
  });

  it("reports a missing explicit tool even when PATH contains a matching name", async () => {
    const executable = join(root, "missing");
    const failure = await run(Tool.resolve({ name: basename(process.execPath), executable }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ToolNotFound", searched: [executable] });
  });
});

describe("tool versions", () => {
  it.each(["0.0.0", "1.3.14", "26.1.2"])("parses canonical version %s", (version) => {
    expect(Tool.parseVersion(version)).toEqual(version.split(".").map(Number));
  });

  it.each(["1.3", "01.3.14", "1.03.14", "1.3.014", "v1.3.14", "1.3.14-canary", "1.3.14+build", " 1.3.14", ""])(
    "refuses noncanonical version %s", (version) => {
      expect(Tool.parseVersion(version)).toBeUndefined();
      expect(Tool.satisfies(">=0.0.0")(version)).toBe(false);
    },
  );

  it.each([
    ["1.3.13", false], ["1.3.14", true], ["1.3.99", true], ["1.4.0", false],
    ["1.4.1", false], ["1.4.2", true], ["1.4.99", true], ["1.5.0", false],
  ] as const)("checks the Bun tested range for %s", (version, expected) => {
    expect(Tool.satisfies(">=1.3.14 <1.4.0 || >=1.4.2 <1.5.0")(version)).toBe(expected);
  });

  it("supports exact, strict, and inclusive comparators", () => {
    expect(Tool.satisfies("2.9.5")("2.9.5")).toBe(true);
    expect(Tool.satisfies("=2.9.5")("2.9.6")).toBe(false);
    expect(Tool.satisfies(">1.0.0 <=2.0.0")("1.0.0")).toBe(false);
    expect(Tool.satisfies(">1.0.0 <=2.0.0")("2.0.0")).toBe(true);
  });

  it.each(["^1.3.14", ">=1.3", "1.3.x", ">=1.3.14,<1.4.0", "", " ", ">=1.3.14 ||", "|| =1.3.14"])(
    "rejects malformed range %s", (range) => {
      expect(() => Tool.satisfies(range)).toThrow("invalid version range");
    },
  );

  it("applies a range or caller predicate to a resolved version", async () => {
    const tool: Tool.Resolved = { name: "fixture", path: "/fixture", version: "1.3.14", bytes: 0, sha256: "" };
    expect(await Effect.runPromise(Effect.succeed(tool).pipe(Tool.requireVersion("=1.3.14")))).toBe(tool);
    expect(await Effect.runPromise(Effect.succeed(tool).pipe(Tool.requireVersion((v) => v.startsWith("1."))))).toBe(tool);
    const failure = await Effect.runPromise(Effect.succeed(tool).pipe(Tool.requireVersion("=1.4.2"), Effect.flip));
    expect(failure).toMatchObject({ _tag: "ToolVersionUnsupported", version: "1.3.14", supported: "=1.4.2" });
  });
});
