import { NodeServices } from "@effect/platform-node";
import { Context, Crypto, Effect, Exit, FileSystem, Layer, Path } from "effect";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";

const identity: NodeMain.ProviderIdentity = {
  package: "@fixture/external-author",
  version: "1.0.0",
  engine: "fixture",
  engineVersion: "1.0.0",
};

const offer: NodeMain.AssemblerOffer = {
  protocol: NodeMain.offerProtocol,
  agreementId: "node-26.7.0/linux-x64-gnu/sea-default",
  nodeVersion: "26.7.0",
  target: "linux-x64-gnu",
  formats: ["commonjs", "module"],
  builtins: ["node:assert", "node:path"],
  loader: "sea-default",
  assets: "none",
  snapshot: false,
  codeCache: false,
  dynamicImport: "bundled-only",
};

const executable = (request: NodeMain.AssembleRequest): Artifact.HashedExecutable => ({
  _tag: "HashedExecutable",
  path: request.outfile as Artifact.AbsolutePath,
  bytes: request.main.identity.bytes,
  digest: request.main.identity.digest,
  nativeFormat: "elf",
  runtime: { name: "node", version: request.main.nodeVersion },
  target: "linux-x64-gnu",
  publication: { commit: "same-parent-rename", committed: true },
});

const producerLayer = (
  events: string[],
  mutate?: (produced: NodeMain.ProducedMain) => NodeMain.ProducedMain,
): Layer.Layer<NodeMain.Producer> =>
  Layer.succeed(NodeMain.Producer, {
    produce: (request, assemblerOffer, ownedRoot) =>
      Effect.promise(async () => {
        events.push("produce");
        const output = join(ownedRoot, request.format === "module" ? "main.mjs" : "main.cjs");
        await writeFile(output, 'import { strictEqual } from "node:assert"; strictEqual(1, 1);\n');
        const produced: NodeMain.ProducedMain = {
          protocol: NodeMain.producedProtocol,
          agreementId: assemblerOffer.agreementId,
          format: request.format,
          path: output,
          builtins: ["node:assert"],
          sideOutputs: [],
          producer: identity,
          evidence: [{ operation: "fixture-build", exact: true }],
        };
        return mutate?.(produced) ?? produced;
      }),
  });

const assemblerLayer = (
  events: string[],
  offered: NodeMain.AssemblerOffer = offer,
): Layer.Layer<NodeMain.Assembler, never, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    NodeMain.Assembler,
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const services = Context.make(Crypto.Crypto, crypto).pipe(
        Context.add(FileSystem.FileSystem, fileSystem),
        Context.add(Path.Path, path),
      );
      return {
        offer: () =>
          Effect.sync(() => {
            events.push("offer");
            return offered;
          }),
        assemble: (request: NodeMain.AssembleRequest) =>
          Effect.gen(function*() {
            events.push("assemble");
            expect(Object.keys(request.main)).not.toContain("borrowed");
            expect(JSON.stringify(request.main)).not.toContain("effect-build-node-main-");
            const first = yield* NodeMain.acquire(request.main);
            const original = first.contents[0];
            first.contents[0] = original === 0 ? 1 : 0;
            const second = yield* NodeMain.acquire(request.main);
            expect(second.contents[0]).toBe(original);
            return executable(request);
          }).pipe(Effect.provide(services)),
      };
    }),
  );

const environment = (
  producer: Layer.Layer<NodeMain.Producer>,
  assembler: Layer.Layer<NodeMain.Assembler, never, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
) =>
  Layer.mergeAll(
    NodeServices.layer,
    BorrowedOutput.CleanupReporter.layer,
    producer,
    Layer.provide(assembler, NodeServices.layer),
  );

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | NodeMain.Producer
    | NodeMain.Assembler
    | BorrowedOutput.CleanupReporter
    | Crypto.Crypto
    | FileSystem.FileSystem
    | Path.Path
  >,
  layer: Layer.Layer<
    | NodeMain.Producer
    | NodeMain.Assembler
    | BorrowedOutput.CleanupReporter
    | Crypto.Crypto
    | FileSystem.FileSystem
    | Path.Path
  >,
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));

describe("NodeMain offer-first portable author boundary", () => {
  it("negotiates before provider work, produces once, and exposes no transport path", async () => {
    const events: string[] = [];
    const result = await run(
      NodeMain.assemble({
        program: { protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "module" },
        outfile: "/tmp/effect-build-node-main-fixture",
      }),
      environment(producerLayer(events), assemblerLayer(events)),
    );
    expect(Exit.isSuccess(result)).toBe(true);
    expect(events).toEqual(["offer", "produce", "assemble"]);
    if (Exit.isSuccess(result)) {
      expect(result.value).toMatchObject({
        _tag: "HashedExecutable",
        runtime: { name: "node", version: "26.7.0" },
        target: "linux-x64-gnu",
      });
    }
  });

  it("rejects an unknown protocol before negotiation or provider work", async () => {
    const events: string[] = [];
    const result = await run(
      NodeMain.assemble({
        program: {
          protocol: "effect-build/profile/node-main/unknown" as typeof NodeMain.profile,
          entrypoint: "src/main.ts",
          format: "module",
        },
        outfile: "/tmp/effect-build-node-main-fixture",
      }),
      environment(producerLayer(events), assemblerLayer(events)),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(events).toEqual([]);
  });

  it("rejects an incompatible offer before provider work", async () => {
    const events: string[] = [];
    const incompatible: NodeMain.AssemblerOffer = { ...offer, formats: ["commonjs"] };
    const result = await run(
      NodeMain.assemble({
        program: { protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "module" },
        outfile: "/tmp/effect-build-node-main-fixture",
      }),
      environment(producerLayer(events), assemblerLayer(events, incompatible)),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(events).toEqual(["offer"]);
  });

  it("rejects a non-26.7.0 assembler offer before provider work", async () => {
    const events: string[] = [];
    const incompatible = { ...offer, nodeVersion: "25.0.0" } as unknown as NodeMain.AssemblerOffer;
    const result = await run(
      NodeMain.assemble({
        program: { protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "module" },
        outfile: "/tmp/effect-build-node-main-fixture",
      }),
      environment(producerLayer(events), assemblerLayer(events, incompatible)),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(events).toEqual(["offer"]);
  });

  it("rejects producer metadata outside the agreement before assembler consumption", async () => {
    const events: string[] = [];
    const result = await run(
      NodeMain.assemble({
        program: { protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "commonjs" },
        outfile: "/tmp/effect-build-node-main-fixture",
      }),
      environment(
        producerLayer(events, (produced) => ({ ...produced, builtins: ["node:fs", "node:assert"] })),
        assemblerLayer(events),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(events).toEqual(["offer", "produce"]);
  });

  for (const field of ["package", "version", "engine", "engineVersion"] as const) {
    it(`rejects an empty producer ${field} before assembler consumption`, async () => {
      const events: string[] = [];
      const result = await run(
        NodeMain.assemble({
          program: { protocol: NodeMain.profile, entrypoint: "src/main.ts", format: "commonjs" },
          outfile: "/tmp/effect-build-node-main-fixture",
        }),
        environment(
          producerLayer(events, (produced) => ({
            ...produced,
            producer: { ...produced.producer, [field]: "" },
          })),
          assemblerLayer(events),
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(events).toEqual(["offer", "produce"]);
    });
  }

  it("rejects structurally forged sealed-main values", async () => {
    const forged = {
      profile: NodeMain.profile,
      agreementId: offer.agreementId,
      nodeVersion: offer.nodeVersion,
    } as unknown as NodeMain.SealedMain;
    const result = await Effect.runPromiseExit(NodeMain.acquire(forged).pipe(Effect.provide(NodeServices.layer)));
    expect(Exit.isFailure(result)).toBe(true);
  });
});
