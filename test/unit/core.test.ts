import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PublishFailed,
  ToolFailed,
  ToolNotFound,
  UnsupportedTarget,
} from "../../packages/effect-build/src/BuildError.js";
import * as Target from "../../packages/effect-build/src/Target.js";
import * as Toolchain from "../../packages/effect-build/src/Toolchain.js";

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

  it("derives a valid host target on supported platforms", () => {
    const host = Target.host();
    expect(host).toBeDefined();
    expect(Target.Target.literals).toContain(host);
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
  });
});

describe.skipIf(process.platform === "win32")("Toolchain", () => {
  it("resolves an explicit executable and fails ToolNotFound otherwise", async () => {
    const tool = join(root, "tool-resolve");
    await writeFile(tool, "#!/bin/sh\nexit 0\n");
    await chmod(tool, 0o755);
    const resolved = await runEffect(
      Toolchain.resolveExecutable({ name: "tool", executable: tool }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(resolved)).toBe(true);
    const missing = await runEffect(
      Toolchain.resolveExecutable({ name: "tool", executable: join(root, "nope") }).pipe(
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
      Toolchain.run({ tool: "tool", executable: tool, args: [] }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(completion)).toBe(true);
    if (Exit.isSuccess(completion)) {
      expect(completion.value.exitCode).toBe(9);
      expect(completion.value.stdout.text.trim()).toBe("out");
      expect(completion.value.stderr.text.trim()).toBe("err");
    }
    const version = await runEffect(
      Toolchain.probeVersion({ tool: "tool", executable: tool, args: ["--version"] }).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(Exit.isSuccess(version)).toBe(true);
    if (Exit.isSuccess(version)) expect(version.value).toBe("2.5.0");
    const failure = await runEffect(
      Toolchain.runOrFail({ tool: "tool", executable: tool, args: [] }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(failure)).toBe(true);
  });

  it("publishes without hashing via the magic sanity check alone", async () => {
    const artifact = await runEffect(
      Toolchain.publishExecutable({
        tool: { name: "tool", version: "1.0.0" },
        outfile: join(root, "published"),
        target: "linux-x64-gnu",
        hash: false,
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
      expect("sha256" in artifact.value).toBe(false);
      expect(artifact.value.bytes).toBe(8);
    }
  });

  it("publishes a nested bundle into an existing outdir, hashing and sorting the files", async () => {
    const outdir = join(root, "bundle-out");
    await mkdir(outdir, { recursive: true });
    await writeFile(join(outdir, "keep.txt"), "untouched");
    await writeFile(join(outdir, "entry.js"), "stale");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        hash: true,
        produce: (staged) =>
          Effect.promise(async () => {
            await mkdir(join(staged, "chunks"), { recursive: true });
            await writeFile(join(staged, "entry.js"), "export {};");
            await writeFile(join(staged, "chunks", "lib.js"), "export const lib = 1;");
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) {
      expect(artifact.value.outdir).toBe(outdir);
      expect(artifact.value.files.map((file) => file.path)).toEqual([
        join(outdir, "chunks", "lib.js"),
        join(outdir, "entry.js"),
      ]);
      for (const file of artifact.value.files) {
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(await readFile(join(outdir, "keep.txt"), "utf8")).toBe("untouched");
    expect(await readFile(join(outdir, "entry.js"), "utf8")).toBe("export {};");
  });

  it("publishes a bundle without hashing and fails when nothing was produced", async () => {
    const outdir = join(root, "bundle-plain");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        hash: false,
        produce: (staged) => Effect.promise(() => writeFile(join(staged, "only.js"), "export {};")),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) expect(artifact.value.files.some((file) => "sha256" in file)).toBe(false);
    const empty = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir: join(root, "bundle-empty"),
        hash: true,
        produce: () => Effect.void,
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(empty)).toBe(true);
    if (Exit.isFailure(empty)) expect(String(empty.cause)).toContain("did not produce any files");
  });

  it("rejects a produced binary whose format contradicts the target", async () => {
    const exit = await runEffect(
      Toolchain.publishExecutable({
        tool: { name: "tool", version: "1.0.0" },
        outfile: join(root, "mismatch"),
        target: "windows-x64",
        hash: true,
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
