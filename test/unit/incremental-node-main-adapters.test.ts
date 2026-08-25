import { NodeServices } from "@effect/platform-node";
import { Effect, type FileSystem, Layer, type Path } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as BorrowedOutput from "../../packages/effect-build/src/Author/BorrowedOutput.js";
import * as NodeMain from "../../packages/effect-build/src/Author/NodeMain.js";
import * as Incremental from "../../packages/effect-build/src/Profile/internal/IncrementalNodeMain.js";
import * as Adapters from "../fixtures/incremental-node-main-adapters.js";

type AdapterRequirements = FileSystem.FileSystem | Path.Path;
type Adapter = (
  program: NodeMain.Request,
  offer: NodeMain.AssemblerOffer,
) => Effect.Effect<Incremental.ProducerDriver<unknown, AdapterRequirements>, unknown>;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const revision = (sequence: number, character: string): Incremental.SourceRevision =>
  Object.freeze({
    sequence,
    digest: Artifact.sha256Digest(character.repeat(64)),
  });

const offer: NodeMain.AssemblerOffer = Object.freeze({
  protocol: NodeMain.offerProtocol,
  agreementId: "incremental-real-adapter-fixture",
  nodeVersion: "26.7.0",
  target: "macos-aarch64",
  formats: ["module"] as const,
  builtins: [],
  loader: "sea-default",
  assets: "none",
  snapshot: false,
  codeCache: false,
  dynamicImport: "bundled-only",
});

const providers = [
  ["esbuild", Adapters.openEsbuild as Adapter],
  ["Rolldown", Adapters.openRolldown as Adapter],
] as const;

describe.each(providers)("package-private %s IncrementalNodeMain adapter", (_provider, open) => {
  it("conforms to the same consumer across authenticated source mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-build-incremental-adapter-"));
    roots.push(root);
    const entrypoint = join(root, "entry.js");
    let leaked: Incremental.ProducerDriver<unknown, AdapterRequirements> | undefined;
    await writeFile(entrypoint, 'export const generation = "incremental-v1";\n');
    const program: NodeMain.Request = Object.freeze({
      protocol: NodeMain.profile,
      entrypoint,
      format: "module",
    });

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const acquire = open(program, offer).pipe(
            Effect.tap((producer) =>
              Effect.sync(() => {
                leaked = producer;
              })
            ),
          );
          const handle = yield* Incremental.makeFromProducer(program, offer, acquire);
          const consume = (source: Incremental.SourceRevision) =>
            handle.rebuild(source, ({ generation, main }) =>
              NodeMain.acquire(main).pipe(
                Effect.map(({ contents }) => ({
                  generation,
                  contents: new TextDecoder().decode(contents),
                  identity: main.identity.digest.value,
                  producer: main.producer.package,
                })),
              ));

          const first = yield* consume(revision(1, "1"));
          yield* Effect.promise(() => writeFile(entrypoint, 'export const generation = "incremental-v2";\n'));
          const second = yield* consume(revision(2, "2"));
          return { first, second };
        }),
      ).pipe(
        Effect.provide(Layer.merge(NodeServices.layer, BorrowedOutput.CleanupReporter.layer)),
      ),
    );

    expect(result.first.generation).toBe(1);
    expect(result.first.contents).toContain("incremental-v1");
    expect(result.second.generation).toBe(2);
    expect(result.second.contents).toContain("incremental-v2");
    expect(result.second.identity).not.toBe(result.first.identity);
    expect(result.second.producer).toBe(result.first.producer);

    const afterRelease = await Effect.runPromiseExit(
      leaked!.rebuild(revision(3, "3"), root as Artifact.AbsolutePath).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(afterRelease._tag).toBe("Failure");
  });
});
