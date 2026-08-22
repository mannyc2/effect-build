import { NodeServices } from "@effect/platform-node";
import { Effect, Fiber, FileSystem, Latch, Result, Schema } from "effect";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Core from "../../packages/effect-build/src/index.js";
import * as Integration from "../../packages/effect-build/src/Integration.js";

const decodeFile = Schema.decodeUnknownSync(Core.Artifact.FileArtifact, { onExcessProperty: "error" });
const decodeExecutable = Schema.decodeUnknownSync(Core.Artifact.ExecutableArtifact, {
  onExcessProperty: "error",
});

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "effect-build-core-artifact-"));
  roots.push(root);
  return root;
};

describe("core artifact vocabulary", () => {
  it("validates one durable file representation", () => {
    expect(decodeFile({ path: "/tmp/app", bytes: 0 })).toEqual({ path: "/tmp/app", bytes: 0 });
    expect(
      decodeFile({
        path: "/tmp/app",
        bytes: Number.MAX_SAFE_INTEGER,
        digest: `sha256:${"a".repeat(64)}`,
      }),
    ).toEqual({
      path: "/tmp/app",
      bytes: Number.MAX_SAFE_INTEGER,
      digest: `sha256:${"a".repeat(64)}`,
    });
    for (
      const value of [
        { path: "relative", bytes: 0 },
        { path: "/tmp/app", bytes: -1 },
        { path: "/tmp/app", bytes: Number.MAX_SAFE_INTEGER + 1 },
        { path: "/tmp/app", bytes: 0, digest: `sha256:${"A".repeat(64)}` },
        { path: "/tmp/app", bytes: 0, extra: true },
      ]
    ) {
      expect(() => decodeFile(value)).toThrow();
    }
  });

  it("requires a system target and a non-empty ordered stage list", () => {
    const value = {
      path: "/tmp/app",
      bytes: 1,
      target: "linux-x64-gnu",
      stages: [{ operation: "compile-executable", tool: { name: "bun", version: "1.3.9" } }],
    } as const;
    expect(decodeExecutable(value)).toEqual(value);
    expect(() => decodeExecutable({ ...value, stages: [] })).toThrow();
    expect(() => decodeExecutable({ ...value, target: "browser" })).toThrow();
    expect(() => decodeExecutable({ ...value, stages: [{ operation: "", tool: value.stages[0].tool }] })).toThrow();
    expect(() =>
      decodeExecutable({
        ...value,
        stages: [{ operation: "compile-executable", tool: { name: "", version: "1.3.9" } }],
      })
    ).toThrow();
  });

  it("exposes one native-system vocabulary and only the consumed resolution target", () => {
    expect(Core.Target.SystemTarget.literals).toEqual([
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "linux-aarch64-musl",
      "windows-x64",
      "windows-aarch64",
    ]);
    expect(Core.Target.ResolutionTarget.literals).toEqual(["node"]);
  });

  it("authenticates a borrowed bundle only for its callback and never deletes it", async () => {
    const root = makeRoot();
    const main = join(root, "main.mjs");
    writeFileSync(main, "export const answer = 42;\n");
    let escaped: Core.JavaScriptBundle.Artifact | undefined;

    const observed = await Effect.runPromise(
      Core.JavaScriptBundle.withFile(
        {
          path: main,
          format: "esm",
          resolutionTarget: "node",
          observedExternalImports: [],
          stages: [] as const,
        },
        (artifact) => {
          escaped = artifact;
          expect(Object.isFrozen(artifact)).toBe(true);
          expect(Object.isFrozen(artifact.observedExternalImports)).toBe(true);
          expect(Object.isFrozen(artifact.stages)).toBe(true);
          return Integration.inspectLiveJavaScriptBundle(artifact);
        },
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(observed.bytes).toBe(Buffer.byteLength("export const answer = 42;\n"));
    expect(observed.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(existsSync(main)).toBe(true);
    const stale = await Effect.runPromise(
      Integration.inspectLiveJavaScriptBundle(escaped!).pipe(
        Effect.provide(NodeServices.layer),
        Effect.flip,
      ),
    );
    expect(stale).toBeInstanceOf(Core.JavaScriptBundle.InvalidJavaScriptBundle);
    expect(stale.reason).toBe("artifact-not-live");
  });

  it("rejects forged handles and same-size content drift with finite reasons", async () => {
    const root = makeRoot();
    const main = join(root, "main.cjs");
    writeFileSync(main, "module.exports = 1;\n");
    const forged = {
      path: main,
      bytes: 20,
      digest: `sha256:${"0".repeat(64)}`,
      format: "cjs",
      resolutionTarget: "node",
      observedExternalImports: [],
      stages: [],
    } as unknown as Core.JavaScriptBundle.Artifact;
    const forgedError = await Effect.runPromise(
      Integration.inspectLiveJavaScriptBundle(forged).pipe(Effect.provide(NodeServices.layer), Effect.flip),
    );
    expect(forgedError.reason).toBe("artifact-not-live");

    const drift = await Effect.runPromise(
      Core.JavaScriptBundle.withFile(
        {
          path: main,
          format: "cjs",
          resolutionTarget: "node",
          observedExternalImports: [],
          stages: [] as const,
        },
        (artifact) =>
          Effect.sync(() => writeFileSync(main, "module.exports = 2;\n")).pipe(
            Effect.andThen(Integration.inspectLiveJavaScriptBundle(artifact)),
            Effect.flip,
          ),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(drift.reason).toBe("digest-changed");
  });

  it("maps malformed bundle descriptors to stable Result-owned reasons", async () => {
    const root = makeRoot();
    const main = join(root, "main.mjs");
    writeFileSync(main, "export {};\n");
    const invalid = async (input: unknown) =>
      Effect.runPromise(
        Core.JavaScriptBundle.withFile(input as Core.JavaScriptBundle.Input, () => Effect.void).pipe(
          Effect.provide(NodeServices.layer),
          Effect.flip,
        ),
      );
    expect((await invalid(null)).reason).toBe("expected-object");
    expect((await invalid({ path: main })).reason).toBe("missing-field");
    expect(
      (await invalid({
        path: main,
        format: "esm",
        resolutionTarget: "node",
        observedExternalImports: [],
        stages: [],
        extra: true,
      })).reason,
    ).toBe("unknown-field");
    expect(
      (await invalid({
        path: main,
        format: "cjs",
        resolutionTarget: "node",
        observedExternalImports: [],
        stages: [],
      })).reason,
    ).toBe("format-path-mismatch");
    expect(
      (await invalid({
        path: main,
        format: "esm",
        resolutionTarget: "node",
        observedExternalImports: ["node:zlib", "node:fs", "node:fs"],
        stages: [],
      })).reason,
    ).toBe("observed-external-imports-not-sorted-unique");
  });

  it("allocates, owns, and removes a producer root around the live callback", async () => {
    let cleanupRoot = "";
    const result = await Effect.runPromise(
      Integration.withOwnedJavaScriptBundle(
        {
          temporaryPrefix: "effect-build-core-test-",
          produce: (root) =>
            Effect.gen(function*() {
              cleanupRoot = root;
              const fileSystem = yield* FileSystem.FileSystem;
              const main = join(root, "main.mjs");
              yield* fileSystem.writeFileString(main, "export default 1;\n");
              return {
                path: main,
                format: "esm" as const,
                resolutionTarget: "node" as const,
                observedExternalImports: [],
                stages: [] as const,
              };
            }),
        },
        (artifact) => Effect.succeed({ path: artifact.path, live: existsSync(artifact.path) }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(result.live).toBe(true);
    expect(result.path.startsWith(cleanupRoot)).toBe(true);
    expect(existsSync(cleanupRoot)).toBe(false);
  });

  it("rejects every malformed descriptor field with the frozen finite reason vocabulary", async () => {
    const root = makeRoot();
    const main = join(root, "main.mjs");
    writeFileSync(main, "export {};\n");
    expect(Core.JavaScriptBundle.InvalidReason.literals).toEqual([
      "expected-object",
      "unknown-field",
      "missing-field",
      "invalid-path",
      "invalid-format",
      "invalid-resolution-target",
      "format-path-mismatch",
      "invalid-observed-external-import",
      "invalid-byte-count",
      "observed-external-imports-not-sorted-unique",
      "invalid-stages",
      "artifact-not-live",
      "file-not-regular",
      "byte-count-changed",
      "digest-changed",
      "temporary-prefix-invalid",
      "cleanup-root-not-absolute",
      "cleanup-root-not-directory",
      "cleanup-root-not-empty",
      "file-outside-cleanup-root",
      "active-publication-destination-unresolvable",
      "cleanup-root-contains-active-publication",
      "cleanup-root-overlaps-active-root",
    ]);
    const base = {
      path: main,
      format: "esm",
      resolutionTarget: "node",
      observedExternalImports: [],
      stages: [],
    };
    const cases = [
      [{ ...base, path: "relative.mjs" }, "invalid-path"],
      [{ ...base, format: "iife" }, "invalid-format"],
      [{ ...base, resolutionTarget: "browser" }, "invalid-resolution-target"],
      [{ ...base, observedExternalImports: [""] }, "invalid-observed-external-import"],
      [{ ...base, stages: [{ operation: "", tool: { name: "x", version: "1" } }] }, "invalid-stages"],
    ] as const;
    for (const [input, reason] of cases) {
      const error = await Effect.runPromise(
        Core.JavaScriptBundle.withFile(input as Core.JavaScriptBundle.Input, () => Effect.void).pipe(
          Effect.provide(NodeServices.layer),
          Effect.flip,
        ),
      );
      expect(error).toMatchObject({ reason });
    }
  });

  it("rejects an unsafe bigint byte count before reading or constructing a handle", async () => {
    const root = makeRoot();
    const main = join(root, "main.mjs");
    writeFileSync(main, "export {};\n");
    const host = await Effect.runPromise(FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)));
    const canonical = await Effect.runPromise(host.realPath(main));
    const observed = await Effect.runPromise(host.stat(canonical));
    let read = false;
    const fileSystem: FileSystem.FileSystem = {
      ...host,
      stat: (file) =>
        file === canonical
          ? Effect.succeed({
            ...observed,
            size: (BigInt(Number.MAX_SAFE_INTEGER) + 1n) as unknown as typeof observed.size,
          })
          : host.stat(file),
      readFile: (file) => {
        read = true;
        return host.readFile(file);
      },
    };
    const error = await Effect.runPromise(
      Core.JavaScriptBundle.withFile(
        {
          path: main,
          format: "esm",
          resolutionTarget: "node",
          observedExternalImports: [],
          stages: [] as const,
        },
        () => Effect.void,
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(NodeServices.layer),
        Effect.flip,
      ),
    );
    expect(error).toMatchObject({ reason: "invalid-byte-count" });
    expect(read).toBe(false);
  });

  it("rejects publication under a live owned root before prepare runs", async () => {
    let prepared = false;
    const error = await Effect.runPromise(
      Integration.withOwnedJavaScriptBundle(
        {
          temporaryPrefix: "effect-build-core-claim-",
          produce: (root) =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem;
              const main = join(root, "main.mjs");
              yield* fileSystem.writeFileString(main, "export {};\n");
              return {
                path: main,
                format: "esm" as const,
                resolutionTarget: "node" as const,
                observedExternalImports: [],
                stages: [] as const,
              };
            }),
        },
        (main) =>
          Integration.produceExecutable({
            outfile: join(dirname(main.path), "app"),
            prepare: () =>
              Effect.sync(() => {
                prepared = true;
              }),
            produce: () => Effect.succeed([]),
            decodeStages: () =>
              Result.succeed(
                [
                  { operation: "compile-executable", tool: { name: "bun", version: "1" } },
                ] as const,
              ),
            resolveTarget: () => Result.succeed("linux-x64-gnu"),
          }).pipe(Effect.flip),
      ).pipe(Effect.provide(NodeServices.layer)),
    );
    expect(error).toMatchObject({
      _tag: "OutputInvalid",
      reason: "destination-under-active-bundle-cleanup-root",
    });
    expect(prepared).toBe(false);
  });

  it("keeps a destination claim visible to overlapping root registration", async () => {
    const root = makeRoot();
    const destination = join(root, "app");
    const prepared = Latch.makeUnsafe();
    const release = Latch.makeUnsafe();
    const operation = Integration.produceExecutable({
      outfile: destination,
      prepare: () => prepared.open.pipe(Effect.andThen(release.await)),
      produce: () => Effect.succeed([]),
      decodeStages: () =>
        Result.succeed(
          [
            { operation: "compile-executable", tool: { name: "bun", version: "1" } },
          ] as const,
        ),
      resolveTarget: () => Result.succeed("linux-x64-gnu"),
    }).pipe(Effect.provide(NodeServices.layer));
    const fiber = Effect.runFork(operation);
    await Effect.runPromise(prepared.await);

    const host = await Effect.runPromise(FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)));
    const fileSystem: FileSystem.FileSystem = {
      ...host,
      makeTempDirectory: () => Effect.succeed(root),
    };
    const error = await Effect.runPromise(
      Integration.withOwnedJavaScriptBundle(
        {
          temporaryPrefix: "effect-build-core-conflict-",
          produce: () => Effect.die("producer must not run"),
        },
        () => Effect.die("callback must not run"),
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(NodeServices.layer),
        Effect.flip,
      ),
    );
    expect(error).toMatchObject({ reason: "cleanup-root-contains-active-publication" });
    expect(existsSync(root)).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
