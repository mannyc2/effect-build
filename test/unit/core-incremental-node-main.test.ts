import { NodeServices } from "@effect/platform-node";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Result, Scope } from "effect";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as Incremental from "../../packages/effect-build/src/Profile/internal/IncrementalNodeMain.js";

const program: NodeMain.Request = {
  protocol: NodeMain.profile,
  entrypoint: "src/main.ts",
  format: "module",
};

const digest = (value: string): Artifact.Digest => Artifact.sha256Digest(value.repeat(64));

const fakeExecutable: Artifact.Executable<"hashed"> = Object.freeze({
  _tag: "HashedExecutable",
  path: "/unused/final" as Artifact.AbsolutePath,
  bytes: Artifact.decimalBytes("1"),
  digest: digest("f"),
  nativeFormat: "elf",
  runtime: { name: "node", version: "26.7.0" },
  target: "linux-x64-gnu",
  publication: { commit: "same-parent-rename" as const, committed: true as const },
});

const offer: NodeMain.AssemblerOffer = Object.freeze({
  protocol: NodeMain.offerProtocol,
  agreementId: "incremental-fixture-agreement",
  nodeVersion: "26.7.0",
  target: "linux-x64-gnu",
  formats: ["module"] as const,
  builtins: [] as const,
  loader: "sea-default",
  assets: "none",
  snapshot: false,
  codeCache: false,
  dynamicImport: "bundled-only",
});

const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const failure = Cause.findErrorOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "None") throw new Error("expected typed failure");
  return failure.value;
};

const driver = (outputs: readonly string[], releases: { value: number }): Incremental.Driver<never> => ({
  rebuild: <A, UseFailure, UseRequirements>(
    revision: Incremental.SourceRevision,
    use: (main: NodeMain.SealedMain) => Effect.Effect<A, UseFailure, UseRequirements>,
  ): Effect.Effect<A, UseFailure, UseRequirements> => {
    const captured: { value: Exit.Exit<A, UseFailure> | undefined } = { value: undefined };
    const contents = outputs[revision.sequence - 1] ?? `generation-${revision.sequence}`;
    const producerLayer = Layer.succeed(NodeMain.Producer, {
      produce: (_request, assemblerOffer, root) =>
        Effect.promise(async () => {
          const path = join(root, "main.mjs");
          await writeFile(path, contents);
          return {
            protocol: NodeMain.producedProtocol,
            agreementId: assemblerOffer.agreementId,
            format: "module" as const,
            path,
            builtins: [],
            sideOutputs: [],
            producer: {
              package: "effect-build-fixture",
              version: "0.5.0",
              engine: "fixture",
              engineVersion: "1",
            },
            evidence: [{ revision: revision.sequence }],
          };
        }),
    });
    const assemblerLayer = Layer.succeed(NodeMain.Assembler, {
      offer: () => Effect.succeed(offer),
      assemble: ({ main }) =>
        Effect.exit(use(main) as Effect.Effect<A, UseFailure, never>).pipe(
          Effect.tap((exit) =>
            Effect.sync(() => {
              captured.value = exit;
            })
          ),
          Effect.as(fakeExecutable),
        ),
    });
    const layers = Layer.mergeAll(
      NodeServices.layer,
      BorrowedOutput.CleanupReporter.layer,
      producerLayer,
      assemblerLayer,
    );
    return Effect.gen(function*() {
      yield* NodeMain.assemble({ program, outfile: "/unused/final" }).pipe(
        Effect.provide(layers),
        Effect.orDie,
      );
      const exit = captured.value;
      if (exit === undefined) return yield* Effect.die("fixture assembler did not receive the sealed main");
      if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
      return exit.value;
    }) as Effect.Effect<A, UseFailure, UseRequirements>;
  },
  release: Effect.sync(() => {
    releases.value += 1;
  }),
});

describe("package-private IncrementalNodeMain candidate", () => {
  it("rejects a non-26.7.0 producer offer before acquiring provider state", async () => {
    let acquisitions = 0;
    const producer: Incremental.ProducerDriver<never> = {
      rebuild: () => Effect.die("incompatible offer acquired the provider"),
      release: Effect.void,
    };
    const incompatible = { ...offer, nodeVersion: "25.0.0" } as unknown as NodeMain.AssemblerOffer;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Incremental.makeFromProducer(
          program,
          incompatible,
          Effect.sync(() => {
            acquisitions += 1;
            return producer;
          }),
        ),
      ).pipe(
        Effect.provide(BorrowedOutput.CleanupReporter.layer),
        Effect.provide(NodeServices.layer),
      ),
    );

    expect(failureOf(exit)).toBeInstanceOf(Incremental.IncrementalOfferRejected);
    expect(acquisitions).toBe(0);
  });

  it("rejects an unknown producer system target before acquiring provider state", async () => {
    let acquisitions = 0;
    const producer: Incremental.ProducerDriver<never> = {
      rebuild: () => Effect.die("unknown target acquired the provider"),
      release: Effect.void,
    };
    const incompatible = { ...offer, target: "plan9-x64" } as unknown as NodeMain.AssemblerOffer;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Incremental.makeFromProducer(
          program,
          incompatible,
          Effect.sync(() => {
            acquisitions += 1;
            return producer;
          }),
        ),
      ).pipe(
        Effect.provide(BorrowedOutput.CleanupReporter.layer),
        Effect.provide(NodeServices.layer),
      ),
    );

    expect(failureOf(exit)).toBeInstanceOf(Incremental.IncrementalOfferRejected);
    expect(acquisitions).toBe(0);
  });

  it("serializes authenticated borrowed snapshots and advances source/output identity", async () => {
    const releases = { value: 0 };
    const observations = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const handle = yield* Incremental.make(program, driver(["first-main", "second-main"], releases));
          const first = yield* handle.rebuild({ sequence: 1, digest: digest("1") }, (snapshot) =>
            Effect.succeed({
              generation: snapshot.generation,
              source: snapshot.source.digest.value,
              output: snapshot.main.identity.digest.value,
            }));
          const second = yield* handle.rebuild({ sequence: 2, digest: digest("2") }, (snapshot) =>
            Effect.succeed({
              generation: snapshot.generation,
              source: snapshot.source.digest.value,
              output: snapshot.main.identity.digest.value,
            }));
          return [first, second] as const;
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(observations.map(({ generation }) => generation)).toEqual([1, 2]);
    expect(observations[0].source).not.toBe(observations[1].source);
    expect(observations[0].output).not.toBe(observations[1].output);
    expect(releases.value).toBe(1);
  });

  it("rejects unchanged output identity and non-contiguous source authority", async () => {
    const releases = { value: 0 };
    const exits = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const handle = yield* Incremental.make(program, driver(["same-main", "same-main"], releases));
          yield* handle.rebuild({ sequence: 1, digest: digest("3") }, () => Effect.void);
          const unchanged = yield* Effect.exit(
            handle.rebuild({ sequence: 2, digest: digest("4") }, () => Effect.void),
          );
          const skipped = yield* Effect.exit(
            handle.rebuild({ sequence: 3, digest: digest("5") }, () => Effect.void),
          );
          return { unchanged, skipped };
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(failureOf(exits.unchanged)).toBeInstanceOf(Incremental.IncrementalSnapshotRejected);
    expect(failureOf(exits.skipped)).toBeInstanceOf(Incremental.SourceRevisionRejected);
    expect(releases.value).toBe(1);
  });

  it("gates new work before Scope close waits for the owned in-flight rebuild", async () => {
    let released = 0;
    let leaked: Incremental.Handle<"driver-failure"> | undefined;
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>();
        const finish = yield* Deferred.make<void>();
        const owner = yield* Scope.make();
        const blocking: Incremental.Driver<"driver-failure"> = {
          rebuild: <A, UseFailure, UseRequirements>(
            _revision: Incremental.SourceRevision,
            _use: (main: NodeMain.SealedMain) => Effect.Effect<A, UseFailure, UseRequirements>,
          ): Effect.Effect<A, "driver-failure" | UseFailure, UseRequirements> =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(finish)),
              Effect.andThen(Effect.fail("driver-failure" as const)),
            ),
          release: Effect.sync(() => {
            released += 1;
          }),
        };
        const handle = yield* Incremental.make(program, blocking).pipe(Scope.provide(owner));
        leaked = handle;
        const active = yield* handle.rebuild({ sequence: 1, digest: digest("6") }, () => Effect.void).pipe(
          Effect.exit,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(started);
        const closing = yield* Scope.close(owner, Exit.void).pipe(Effect.forkChild({ startImmediately: true }));
        yield* Effect.yieldNow;
        expect(released).toBe(0);
        yield* Deferred.succeed(finish, undefined);
        const activeExit = yield* Fiber.join(active);
        yield* Fiber.join(closing);
        const afterClose = yield* Effect.exit(
          leaked.rebuild({ sequence: 1, digest: digest("6") }, () => Effect.void),
        );
        return { activeExit, afterClose };
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    expect(failureOf(result.activeExit)).toBe("driver-failure");
    expect(failureOf(result.afterClose)).toBeInstanceOf(Incremental.IncrementalNodeMainClosed);
    expect(released).toBe(1);
  });

  it("preserves provider release failure as an observable Scope-close defect", async () => {
    const releaseFailure = { _tag: "FixtureReleaseFailed" as const };
    let leaked: Incremental.Handle<never> | undefined;
    const closeExit = await Effect.runPromise(
      Effect.gen(function*() {
        const owner = yield* Scope.make();
        const releases = { value: 0 };
        const base = driver(["unused"], releases);
        const fallible: Incremental.Driver<never, never, typeof releaseFailure> = {
          rebuild: base.rebuild,
          release: Effect.fail(releaseFailure),
        };
        leaked = yield* Incremental.make(program, fallible).pipe(Scope.provide(owner));
        return yield* Effect.exit(Scope.close(owner, Exit.void));
      }),
    );

    expect(Exit.isFailure(closeExit)).toBe(true);
    if (Exit.isFailure(closeExit)) {
      expect(Cause.hasDies(closeExit.cause)).toBe(true);
      const defect = Cause.findDefect(closeExit.cause);
      expect(Result.isSuccess(defect)).toBe(true);
      if (Result.isSuccess(defect)) expect(defect.success).toBe(releaseFailure);
    }
    const afterClose = await Effect.runPromiseExit(
      leaked!.rebuild({ sequence: 1, digest: digest("7") }, () => Effect.void).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(failureOf(afterClose)).toBeInstanceOf(Incremental.IncrementalNodeMainClosed);
  });
});
