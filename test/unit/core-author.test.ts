import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import * as Executable from "../../packages/effect-build/src/Author/Executable.js";

const layer = Layer.merge(NodeServices.layer, BorrowedOutput.CleanupReporter.layer);

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

const fileProducer = (contents: string): BorrowedOutput.Producer<never> => ({
  prefix: "effect-build-borrowed-file-",
  produce: (root) =>
    Effect.promise(async () => {
      const path = join(root, "output.bin");
      await writeFile(path, contents);
      return path;
    }),
});

describe("BorrowedOutput ownership laws", () => {
  it("rejects unknown file and tree observation modes before producer work", async () => {
    let produced = 0;
    const producer: BorrowedOutput.Producer<never> = {
      prefix: "effect-build-invalid-observation-mode-",
      produce: () => {
        produced += 1;
        return Effect.die("invalid observation mode reached producer work");
      },
    };
    const fileExit = await Effect.runPromiseExit(
      BorrowedOutput.withFile(
        producer,
        "digest" as unknown as "hashed",
        () => Effect.void,
      ).pipe(Effect.provide(layer)),
    );
    const treeExit = await Effect.runPromiseExit(
      BorrowedOutput.withTree(
        producer,
        "digest" as unknown as "unhashed",
        () => Effect.void,
      ).pipe(Effect.provide(layer)),
    );

    for (const exit of [fileExit, treeExit]) {
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.findErrorOption(exit.cause);
        expect(error._tag).toBe("Some");
        if (error._tag === "Some") {
          expect(error.value).toBeInstanceOf(BorrowedOutput.BorrowedOutputObservationFailed);
          expect((error.value as BorrowedOutput.BorrowedOutputObservationFailed).reason).toContain(
            "hashed or unhashed",
          );
        }
      }
    }
    expect(produced).toBe(0);
  });

  it("keeps authoritative observation inside one continuation and expires escaped handles deterministically", async () => {
    let escaped: BorrowedOutput.File<"hashed"> | undefined;
    let locator = "";
    const digest = await Effect.runPromise(
      BorrowedOutput.withFile(fileProducer("first"), "hashed", (file) =>
        Effect.gen(function*() {
          escaped = file;
          locator = file.path;
          const observed = yield* file.observe;
          return observed.digest.value;
        })).pipe(Effect.provide(layer)),
    );

    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(await exists(locator)).toBe(false);
    const expired = await Effect.runPromiseExit(escaped!.observe);
    expect(Exit.isFailure(expired)).toBe(true);
    if (Exit.isFailure(expired)) {
      const error = Cause.findErrorOption(expired.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBeInstanceOf(BorrowedOutput.BorrowedOutputExpired);
    }
  });

  it("detects same-size file and tree mutations even in unhashed public mode", async () => {
    const fileExit = await Effect.runPromiseExit(
      BorrowedOutput.withFile(
        fileProducer("first"),
        "unhashed",
        (file) => Effect.promise(() => writeFile(file.path, "other")).pipe(Effect.andThen(file.observe)),
      ).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(fileExit)).toBe(true);
    if (Exit.isFailure(fileExit)) {
      const error = Cause.findErrorOption(fileExit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBeInstanceOf(BorrowedOutput.BorrowedOutputChanged);
    }

    const treeExit = await Effect.runPromiseExit(
      BorrowedOutput.withTree(
        {
          prefix: "effect-build-borrowed-tree-",
          produce: (root) =>
            Effect.promise(async () => {
              await mkdir(join(root, "assets"));
              await writeFile(join(root, "assets", "app.js"), "first");
              return root;
            }),
        },
        "unhashed",
        (tree) =>
          Effect.promise(() => writeFile(join(tree.root, "assets", "app.js"), "other")).pipe(
            Effect.andThen(tree.observe),
          ),
      ).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(treeExit)).toBe(true);
    if (Exit.isFailure(treeExit)) {
      const error = Cause.findErrorOption(treeExit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBeInstanceOf(BorrowedOutput.BorrowedOutputChanged);
    }
  });

  it.skipIf(process.platform === "win32")("rejects symbolic-link aliases and portable-path hazards", async () => {
    const alias = await Effect.runPromiseExit(
      BorrowedOutput.withFile(
        {
          prefix: "effect-build-borrowed-alias-",
          produce: (root) =>
            Effect.promise(async () => {
              const target = join(root, "target.bin");
              const linked = join(root, "alias.bin");
              await writeFile(target, "bytes");
              await symlink(target, linked);
              return linked;
            }),
        },
        "hashed",
        () => Effect.void,
      ).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(alias)).toBe(true);
    if (Exit.isFailure(alias)) {
      const error = Cause.findErrorOption(alias.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBeInstanceOf(BorrowedOutput.BorrowedOutputEscaped);
    }

    const reserved = await Effect.runPromiseExit(
      BorrowedOutput.withTree(
        {
          prefix: "effect-build-borrowed-reserved-",
          produce: (root) =>
            Effect.promise(async () => {
              await writeFile(join(root, "CON.txt"), "reserved");
              return root;
            }),
        },
        "hashed",
        () => Effect.void,
      ).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(reserved)).toBe(true);
  });

  it("preserves the exact caller failure and interruption Cause while cleanup completes", async () => {
    const callerFailure = { _tag: "CallerFailure" as const, identity: Symbol("same-object") };
    const failed = await Effect.runPromiseExit(
      BorrowedOutput.withFile(fileProducer("bytes"), "hashed", () => Effect.fail(callerFailure)).pipe(
        Effect.provide(layer),
      ),
    );
    expect(Exit.isFailure(failed)).toBe(true);
    if (Exit.isFailure(failed)) {
      const error = Cause.findErrorOption(failed.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBe(callerFailure);
    }

    const interrupted = await Effect.runPromise(
      Effect.gen(function*() {
        const ready = yield* Deferred.make<string>();
        const fiber = yield* BorrowedOutput.withFile(
          fileProducer("bytes"),
          "hashed",
          (file) => Deferred.succeed(ready, file.path).pipe(Effect.andThen(Effect.never)),
        ).pipe(Effect.forkChild({ startImmediately: true }));
        const path = yield* Deferred.await(ready);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        return { exit, path };
      }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(interrupted.exit)).toBe(true);
    if (Exit.isFailure(interrupted.exit)) expect(Cause.hasInterrupts(interrupted.exit.cause)).toBe(true);
    expect(await exists(interrupted.path)).toBe(false);
  });
});

describe("Executable inspection and publication", () => {
  it("inspects authenticated private bytes before committing one hashed executable", async () => {
    const destination = join(tmpdir(), `effect-build-executable-${randomUUID()}`);
    let inspectedBeforeCommit = false;
    const artifact = await Effect.runPromise(
      Executable.publish(
        { destination, observation: "hashed" },
        (candidate) => Effect.promise(() => writeFile(candidate, Uint8Array.of(0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4))),
        (candidate) =>
          Effect.promise(async () => {
            inspectedBeforeCommit = !(await exists(destination));
            expect(candidate.digest.value).toMatch(/^[0-9a-f]{64}$/u);
            return {
              nativeFormat: "elf" as const,
              runtime: { name: "bun", version: "1.3.14" },
              target: "linux-x64-gnu" as const,
            };
          }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(inspectedBeforeCommit).toBe(true);
    expect(artifact._tag).toBe("HashedExecutable");
    expect(artifact.target).toBe("linux-x64-gnu");
    expect(artifact.publication).toEqual({ commit: "same-parent-rename", committed: true });
    expect([...await readFile(destination)]).toEqual([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);
    await rm(destination, { force: true });
  });

  it("rejects incoherent inspection and mutation without publishing the candidate", async () => {
    const mismatch = join(tmpdir(), `effect-build-mismatch-${randomUUID()}`);
    const mismatchExit = await Effect.runPromiseExit(
      Executable.publish(
        { destination: mismatch, observation: "unhashed" },
        (candidate) => Effect.promise(() => writeFile(candidate, "first")),
        () =>
          Effect.succeed({
            nativeFormat: "pe" as const,
            runtime: { name: "bun", version: "1.3.14" },
            target: "linux-x64-gnu" as const,
          }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(mismatchExit)).toBe(true);
    expect(await exists(mismatch)).toBe(false);

    const changed = join(tmpdir(), `effect-build-changed-${randomUUID()}`);
    const changedExit = await Effect.runPromiseExit(
      Executable.publish(
        { destination: changed, observation: "hashed" },
        (candidate) => Effect.promise(() => writeFile(candidate, "first")),
        (candidate) =>
          Effect.promise(async () => {
            await writeFile(candidate.path, "other");
            return {
              nativeFormat: "elf" as const,
              runtime: { name: "bun", version: "1.3.14" },
              target: "linux-x64-gnu" as const,
            };
          }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(changedExit)).toBe(true);
    expect(await exists(changed)).toBe(false);
  });

  it("preserves an old destination when production fails before commit", async () => {
    const destination = join(tmpdir(), `effect-build-old-${randomUUID()}`);
    await writeFile(destination, "old");
    const marker = { _tag: "ProducerFailure" as const };
    const exit = await Effect.runPromiseExit(
      Executable.publish(
        { destination, observation: "hashed" },
        () => Effect.fail(marker),
        () => Effect.die("inspector must not run"),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      expect(error._tag).toBe("Some");
      if (error._tag === "Some") expect(error.value).toBe(marker);
    }
    expect(await readFile(destination, "utf8")).toBe("old");
    await rm(destination, { force: true });
  });
});
