import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem } from "effect";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ArtifactVerificationFailed,
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
    expect(new ArtifactVerificationFailed({ path: "/tmp/app", reason: "digest mismatch" }).message)
      .toContain("digest mismatch");
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

  it("always hashes executables while applying the native-magic sanity check", async () => {
    const artifact = await runEffect(
      Toolchain.publishExecutable({
        tool: { name: "tool", version: "1.0.0" },
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
      expect(artifact.value.bytes).toBe(8);
    }
  });

  it("publishes one finalized regular file with an exact size and digest", async () => {
    const destination = join(root, "finalized", "artifact.tar.gz");
    let validated = "";
    const artifact = await runEffect(
      Toolchain.publishFile({
        tool: { name: "fixture", version: "1.0.0" },
        outfile: destination,
        produce: (stagedPath) => Effect.promise(() => writeFile(stagedPath, "final bytes\n")),
        validate: (contents) =>
          Effect.sync(() => {
            validated = new TextDecoder("utf-8", { fatal: true }).decode(contents);
            contents.fill(0);
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) {
      expect(artifact.value).toMatchObject({
        _tag: "File",
        path: destination,
        bytes: 12,
        tool: { name: "fixture", version: "1.0.0" },
      });
      expect(artifact.value.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(await readFile(destination, "utf8")).toBe("final bytes\n");
      expect(validated).toBe("final bytes\n");
    }
  });

  it("rejects symbolic-link file and executable outputs before reading external bytes", async () => {
    const external = join(root, "external-link-target");
    const bytes = new Uint8Array(8);
    bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
    await writeFile(external, bytes);
    await chmod(external, 0o755);
    const fileDestination = join(root, "linked-file-output");
    const executableDestination = join(root, "linked-executable-output");
    const [fileExit, executableExit] = await Promise.all([
      runEffect(
        Toolchain.publishFile({
          tool: { name: "fixture", version: "1.0.0" },
          outfile: fileDestination,
          produce: (stagedPath) => Effect.promise(() => symlink(external, stagedPath)),
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
      runEffect(
        Toolchain.publishExecutable({
          tool: { name: "fixture", version: "1.0.0" },
          outfile: executableDestination,
          target: "linux-x64-gnu",
          produce: (stagedPath) => Effect.promise(() => symlink(external, stagedPath)),
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ]);
    expect(Exit.isFailure(fileExit)).toBe(true);
    if (Exit.isFailure(fileExit)) expect(String(fileExit.cause)).toContain("symbolic link");
    expect(Exit.isFailure(executableExit)).toBe(true);
    if (Exit.isFailure(executableExit)) expect(String(executableExit.cause)).toContain("symbolic link");
    await expect(readFile(fileDestination)).rejects.toThrow();
    await expect(readFile(executableDestination)).rejects.toThrow();
  });

  it("defers interruption through an indivisible file commit and leaves an exact complete destination", async () => {
    const destination = join(root, "interrupted-commit", "artifact.bin");
    const exit = await runEffect(
      Effect.scoped(
        Effect.gen(function*() {
          const fileSystem = yield* FileSystem.FileSystem;
          const renameEntered = yield* Deferred.make<void>();
          const delayedFileSystem = {
            ...fileSystem,
            rename: (oldPath: string, newPath: string) =>
              Effect.gen(function*() {
                yield* Deferred.succeed(renameEntered, undefined);
                yield* Effect.sleep("30 millis");
                yield* fileSystem.rename(oldPath, newPath);
              }),
          } satisfies FileSystem.FileSystem;
          const fiber = yield* Toolchain.publishFile({
            tool: { name: "fixture", version: "1.0.0" },
            outfile: destination,
            produce: (stagedPath) => Effect.promise(() => writeFile(stagedPath, "committed after interrupt\n")),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, delayedFileSystem),
            Effect.forkChild,
          );
          yield* Deferred.await(renameEntered);
          yield* Fiber.interrupt(fiber);
          return yield* Fiber.await(fiber);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isFailure(exit)) return;
    expect(Exit.isFailure(exit.value)).toBe(true);
    if (Exit.isFailure(exit.value)) expect(Cause.hasInterrupts(exit.value.cause)).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("committed after interrupt\n");
  });

  it("publishes one exact nested, symlink-aware bundle with a directory-level commit", async () => {
    const outdir = join(root, "bundle-out");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        produce: (staged) =>
          Effect.promise(async () => {
            await mkdir(join(staged, "chunks"), { recursive: true });
            await writeFile(join(staged, "entry.js"), "export {};");
            await writeFile(join(staged, "chunks", "lib.js"), "export const lib = 1;");
            await symlink("chunks", join(staged, "current"));
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) {
      expect(artifact.value.outdir).toBe(outdir);
      expect(artifact.value.entries.map((entry) => [entry._tag, entry.path])).toEqual([
        ["Directory", join(outdir, "chunks")],
        ["File", join(outdir, "chunks", "lib.js")],
        ["SymbolicLink", join(outdir, "current")],
        ["File", join(outdir, "entry.js")],
      ]);
      const files = artifact.value.entries.filter((entry) => entry._tag === "File");
      expect(files.map((file) => file.path)).toEqual([
        join(outdir, "chunks", "lib.js"),
        join(outdir, "entry.js"),
      ]);
      for (const file of files) {
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      const restored = await runEffect(
        Effect.scoped(
          Toolchain.materializeVerifiedBundle(artifact.value).pipe(
            Effect.flatMap((snapshot) =>
              Effect.promise(async () => ({
                link: await readlink(join(snapshot, "current")),
                contents: await readFile(join(snapshot, "current", "lib.js"), "utf8"),
              }))
            ),
          ),
        ).pipe(Effect.provide(NodeServices.layer)),
      );
      expect(Exit.isSuccess(restored)).toBe(true);
      if (Exit.isSuccess(restored)) {
        expect(restored.value.link).toBe("chunks");
        expect(restored.value.contents).toBe("export const lib = 1;");
      }
    }
    expect(await readlink(join(outdir, "current"))).toBe("chunks");
    expect(await readFile(join(outdir, "entry.js"), "utf8")).toBe("export {};");
  });

  it("always hashes bundle files and fails when nothing was produced", async () => {
    const outdir = join(root, "bundle-plain");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        produce: (staged) => Effect.promise(() => writeFile(join(staged, "only.js"), "export {};")),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isSuccess(artifact)) {
      expect(
        artifact.value.entries.filter((entry) => entry._tag === "File")
          .every((file) => /^[0-9a-f]{64}$/.test(file.sha256)),
      ).toBe(true);
    }
    const empty = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir: join(root, "bundle-empty"),
        produce: () => Effect.void,
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(empty)).toBe(true);
    if (Exit.isFailure(empty)) expect(String(empty.cause)).toContain("did not produce any entries");
  });

  it("materializes exact framework-style symlink chains and permission modes", async () => {
    const outdir = join(root, "framework-out");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        produce: (staged) =>
          Effect.promise(async () => {
            const version = join(staged, "Versions", "A");
            const resources = join(version, "Resources");
            await mkdir(resources, { recursive: true });
            await writeFile(join(version, "Example"), "exact executable bytes");
            await writeFile(join(resources, "Info.plist"), "exact metadata bytes");
            await mkdir(join(staged, "readonly"));
            await writeFile(join(staged, "readonly", "notice.txt"), "read-only tree");
            await chmod(join(staged, "readonly"), 0o555);
            await chmod(version, 0o750);
            await chmod(join(version, "Example"), 0o751);
            await symlink("A", join(staged, "Versions", "Current"));
            await symlink("Versions/Current/Example", join(staged, "Example"));
            await symlink("Versions/Current/Resources", join(staged, "Resources"));
          }),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(artifact)).toBe(true);
    if (Exit.isFailure(artifact)) return;

    const restored = await runEffect(
      Effect.scoped(
        Toolchain.materializeVerifiedBundle(artifact.value).pipe(
          Effect.flatMap((snapshot) =>
            Effect.promise(async () => ({
              executable: await readFile(join(snapshot, "Example"), "utf8"),
              metadata: await readFile(join(snapshot, "Resources", "Info.plist"), "utf8"),
              notice: await readFile(join(snapshot, "readonly", "notice.txt"), "utf8"),
              current: await readlink(join(snapshot, "Versions", "Current")),
              executableMode: (await stat(join(snapshot, "Versions", "A", "Example"))).mode & 0o777,
              versionMode: (await stat(join(snapshot, "Versions", "A"))).mode & 0o777,
              rootMode: (await stat(snapshot)).mode & 0o777,
              readonlyMode: (await stat(join(snapshot, "readonly"))).mode & 0o777,
            }))
          ),
        ),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(restored)).toBe(true);
    if (Exit.isSuccess(restored)) {
      expect(restored.value).toEqual({
        executable: "exact executable bytes",
        metadata: "exact metadata bytes",
        notice: "read-only tree",
        current: "A",
        executableMode: 0o751,
        versionMode: 0o750,
        rootMode: 0o755,
        readonlyMode: 0o555,
      });
    }
    expect((await stat(outdir)).mode & 0o777).toBe(0o755);
    await chmod(join(outdir, "readonly"), 0o755);
  });

  it("rejects broken and cyclic finalized bundle link graphs", async () => {
    for (
      const [name, entries] of [
        ["broken", [{ _tag: "SymbolicLink" as const, path: join(root, "broken", "a"), target: "missing" }]],
        [
          "cycle",
          [
            { _tag: "SymbolicLink" as const, path: join(root, "cycle", "a"), target: "b" },
            { _tag: "SymbolicLink" as const, path: join(root, "cycle", "b"), target: "a" },
          ],
        ],
      ] as const
    ) {
      const exit = await runEffect(
        Effect.scoped(
          Toolchain.materializeVerifiedBundle({
            _tag: "Bundle",
            outdir: join(root, name),
            entries,
            tool: { name: "fixture", version: "1.0.0" },
          }),
        ).pipe(Effect.provide(NodeServices.layer)),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("broken or cyclic");
    }
  });

  it("rejects bundle descendants whose directory ancestors are absent from the manifest", async () => {
    const outdir = join(root, "missing-ancestor");
    const exit = await runEffect(
      Effect.scoped(
        Toolchain.materializeVerifiedBundle({
          _tag: "Bundle",
          outdir,
          entries: [{ _tag: "SymbolicLink", path: join(outdir, "undeclared", "link"), target: "." }],
          tool: { name: "fixture", version: "1.0.0" },
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain("omits directory ancestor undeclared");
  });

  it("rejects a pre-existing bundle destination without retaining or changing stale bytes", async () => {
    const outdir = join(root, "bundle-existing");
    await mkdir(outdir);
    await writeFile(join(outdir, "stale.txt"), "stale");
    const artifact = await runEffect(
      Toolchain.publishBundle({
        tool: { name: "tool", version: "1.0.0" },
        outdir,
        produce: (staged) => Effect.promise(() => writeFile(join(staged, "new.txt"), "new")),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(artifact)).toBe(true);
    if (Exit.isFailure(artifact)) expect(String(artifact.cause)).toContain("never overlay");
    expect(await readFile(join(outdir, "stale.txt"), "utf8")).toBe("stale");
  });

  it("rejects a produced binary whose format contradicts the target", async () => {
    const exit = await runEffect(
      Toolchain.publishExecutable({
        tool: { name: "tool", version: "1.0.0" },
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

  it("returns exact verified bytes and rejects a path changed after finalization", async () => {
    const destination = join(root, "verified-input.bin");
    const published = await runEffect(
      Toolchain.publishFile({
        tool: { name: "fixture", version: "1.0.0" },
        outfile: destination,
        produce: (stagedPath) => Effect.promise(() => writeFile(stagedPath, "original bytes")),
      }).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(published)).toBe(true);
    if (Exit.isFailure(published)) return;
    const verified = await runEffect(
      Toolchain.readVerifiedFile(published.value).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isSuccess(verified)).toBe(true);
    if (Exit.isSuccess(verified)) expect(new TextDecoder().decode(verified.value)).toBe("original bytes");
    await writeFile(destination, "mutated bytes!");
    const changed = await runEffect(
      Toolchain.readVerifiedFile(published.value).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(changed)).toBe(true);
    if (Exit.isFailure(changed)) expect(String(changed.cause)).toContain("ArtifactVerificationFailed");

    const exactTarget = join(root, "verified-input-exact-target.bin");
    await writeFile(exactTarget, "original bytes");
    await rm(destination);
    await symlink(exactTarget, destination);
    const linked = await runEffect(
      Toolchain.readVerifiedFile(published.value).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(linked)).toBe(true);
    if (Exit.isFailure(linked)) expect(String(linked.cause)).toContain("symbolic link");
  });
});
