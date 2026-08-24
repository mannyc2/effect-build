import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Tool from "../../packages/effect-build/src/Author/Tool.js";
import {
  ProviderFailed,
  PublishFailed,
  ToolFailed,
  ToolNotFound,
  UnsupportedTarget,
} from "../../packages/effect-build/src/BuildError.js";
import * as Target from "../../packages/effect-build/src/Target.js";

const selectedTool = (executablePath: string): Tool.SelectedTool => ({
  protocol: "effect-build/selected-tool@1",
  name: "tool",
  version: "1.0.0",
  executablePath,
  digest: { algorithm: "sha256", value: "0".repeat(64) },
});

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-core-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const runEffect = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromiseExit(effect);

describe("Target", () => {
  it("describes every target consistently with its name", () => {
    for (const target of Target.Target.literals) {
      const information = Target.info(target);
      const [os] = target.split("-");
      expect(information.os).toBe(os);
      expect(target.includes(information.architecture)).toBe(true);
      expect(information.executableSuffix).toBe(os === "windows" ? ".exe" : "");
      expect(information.nativeFormat).toBe(os === "windows" ? "pe" : os === "macos" ? "mach-o" : "elf");
      if (os === "linux") expect(information.abi === "gnu" || information.abi === "musl").toBe(true);
      else expect(information.abi).toBeUndefined();
    }
  });
});

describe("BuildError", () => {
  it("renders actionable messages", () => {
    expect(new ToolNotFound({ tool: "bun", command: "bun" }).message).toContain("bun");
    const failed = new ToolFailed({ tool: "deno", exitCode: 3, stdout: "", stderr: "boom" });
    expect(failed.message).toContain("exited with code 3");
    expect(failed.message).toContain("boom");
    expect(new ToolFailed({ tool: "deno", exitCode: -1, stdout: "", stderr: "" }).message)
      .toContain("could not be launched");
    expect(new UnsupportedTarget({ tool: "bun", requested: "plan9", available: ["linux-x64-gnu"] }).message)
      .toContain("plan9");
    expect(new PublishFailed({ destination: "/tmp/app", reason: "rename: busy" }).message).toContain("/tmp/app");
    expect(
      new ProviderFailed({
        provider: "effect-build-bun",
        operation: "bundle",
        cause: new ToolFailed({ tool: "bun", exitCode: 2, stdout: "", stderr: "invalid argument" }),
      }).message,
    ).toContain("invalid argument");
    const hostileCause = Object.create(null) as { [Symbol.toPrimitive]: () => never };
    hostileCause[Symbol.toPrimitive] = () => {
      throw new Error("must not escape");
    };
    expect(
      new ProviderFailed({
        provider: "effect-build-bun",
        operation: "bundle",
        cause: hostileCause,
      }).message,
    ).toBe("effect-build-bun bundle failed: unknown cause");
  });
});

describe.skipIf(process.platform === "win32")("Author Tool", () => {
  it("resolves an explicit executable and fails ToolNotFound otherwise", async () => {
    const tool = join(root, "tool-resolve");
    await writeFile(tool, "#!/bin/sh\nexit 0\n");
    await chmod(tool, 0o755);
    const resolved = await runEffect(
      Tool.resolveExecutable({ name: "tool", executable: tool }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(resolved)).toBe(true);
    const missing = await runEffect(
      Tool.resolveExecutable({ name: "tool", executable: join(root, "nope") }).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(Exit.isFailure(missing)).toBe(true);
  });

  it("captures output, exit codes, and probes versions", async () => {
    const tool = join(root, "tool-run");
    await writeFile(
      tool,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 2.5.0; exit 0; fi\necho out; echo err >&2; exit 9\n',
    );
    await chmod(tool, 0o755);
    const completion = await runEffect(
      Tool.run({ tool: "tool", executable: tool, args: [] }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(completion)).toBe(true);
    if (Exit.isSuccess(completion)) {
      expect(completion.value.exitCode).toBe(9);
      expect(completion.value.stdout.text.trim()).toBe("out");
      expect(completion.value.stderr.text.trim()).toBe("err");
    }
    const version = await runEffect(
      Tool.probeVersion({ tool: "tool", executable: tool, args: ["--version"] }).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(Exit.isSuccess(version)).toBe(true);
    if (Exit.isSuccess(version)) expect(version.value).toBe("2.5.0");
    const failure = await runEffect(
      Tool.runOrFail({ tool: "tool", executable: tool, args: [] }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(failure)).toBe(true);
  });

  it("always authenticates published executables", async () => {
    const artifact = await runEffect(
      Tool.publishExecutable({
        tool: selectedTool(join(root, "tool")),
        outfile: join(root, "published"),
        target: "linux-x64-gnu",
        produce: (stagedPath) =>
          Effect.promise(async () => {
            const bytes = new Uint8Array(8);
            bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
            await writeFile(stagedPath, bytes);
            await chmod(stagedPath, 0o755);
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) {
      expect(artifact.value.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.value.digest).toEqual({ algorithm: "sha256", value: artifact.value.sha256 });
      expect(artifact.value.bytes).toBe(8);
    }
  });

  it("rejects a produced binary whose format contradicts the target", async () => {
    const exit = await runEffect(
      Tool.publishExecutable({
        tool: selectedTool(join(root, "tool")),
        outfile: join(root, "mismatch"),
        target: "windows-x64",
        produce: (stagedPath) =>
          Effect.promise(async () => {
            const bytes = new Uint8Array(8);
            bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
            await writeFile(stagedPath, bytes);
            await chmod(stagedPath, 0o755);
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const rendered = String(exit.cause);
      expect(rendered).toContain("native format mismatch");
      expect(rendered).toContain("expected pe");
    }
  });
});
