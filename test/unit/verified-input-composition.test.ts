import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Schema } from "effect";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import * as Archive from "../../packages/effect-build-archives/src/Archive.js";
import * as Nfpm from "../../packages/effect-build-nfpm/src/Package.js";
import * as Artifact from "../../packages/effect-build/src/Artifact.js";
import * as Executable from "../../packages/effect-build/src/Author/Executable.js";
import * as File from "../../packages/effect-build/src/Author/File.js";
import * as Tree from "../../packages/effect-build/src/Author/Tree.js";
import { installFixtureExecutable } from "../fixtures/tools/install-fixture-executable.js";

const roots: string[] = [];
afterEach(async () => {
  delete process.env.FAKE_NFPM_LOG;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const provenance = Artifact.intrinsicProvenance("composition-test");
const payload = new TextEncoder().encode("exact executable payload");
const fixture = fileURLToPath(new URL("../fixtures/tools/fake-nfpm-hard-cut.mjs", import.meta.url));
const makeRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-verified-input-"));
  roots.push(root);
  return root;
};
const finalize = (root: string, kind: "file" | "executable" | "tree") =>
  Effect.gen(function*() {
    const request = { destination: join(root, "input"), observation: "hashed", provenance } as const;
    const produce = (candidate: string) => Effect.promise(() => writeFile(candidate, payload));
    if (kind === "file") return yield* File.publish(request, produce);
    if (kind === "executable") {
      return yield* Executable.publish(request, produce, () =>
        Effect.succeed({
          nativeFormat: "elf",
          target: "linux-x64-gnu",
          runtime: { name: "fixture", version: "1" },
        }));
    }
    const tree = yield* Tree.publish({ outdir: request.destination, observation: "hashed", provenance }, (candidate) =>
      produce(join(candidate, "payload")));
    return yield* Tree.projectFile(tree, Artifact.portableRelativePath("payload"));
  });
const packageInput = (artifact: File.VerifiedInput, outfile: string) =>
  new Nfpm.PackageInput({
    metadata: new Nfpm.PackageMetadata({
      name: "composition",
      version: "1",
      architecture: "amd64",
      maintainer: "Test",
      description: "Verified input",
      contents: [new Nfpm.PackageContent({ artifact, dst: "/usr/bin/payload", mode: Artifact.fileMode(0o751) })],
    }),
    release: "1",
    mtime: "2009-11-10T23:00:00Z",
    outfile,
  });
const errorTag = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) throw new Error("expected failure");
  const found = Cause.findErrorOption(exit.cause);
  return found._tag === "Some" ? (found.value as { readonly _tag: string })._tag : undefined;
};

describe.sequential("verified artifact composition", () => {
  it.each(["file", "executable", "tree"] as const)(
    "packages the original %s identity and verifies before nFPM launch",
    async (kind) => {
      const root = await makeRoot();
      const artifact = await Effect.runPromise(finalize(root, kind).pipe(Effect.provide(NodeServices.layer)));
      const nfpm = await installFixtureExecutable({ fixture, root, name: "nfpm" });
      const log = join(root, "nfpm.log");
      process.env.FAKE_NFPM_LOG = log;
      const entry = new Archive.ArchiveEntry({ artifact, path: "bin/payload", executable: true });
      const input = packageInput(artifact, join(root, "package.deb"));
      expect(Schema.decodeUnknownSync(File.VerifiedInputSchema)(artifact)).toBe(artifact);
      expect(Schema.decodeUnknownSync(Archive.ArchiveEntry)(entry).artifact).toBe(artifact);
      expect(Schema.decodeUnknownSync(Nfpm.PackageInput)(input).metadata.contents[0].artifact).toBe(artifact);
      expect(artifact.provenance).toBe(provenance);
      await Effect.runPromise(
        Archive.archive(
          new Archive.ArchiveInput({ format: "zip", entries: [entry], outfile: join(root, "archive.zip") }),
        ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
      );
      await Effect.runPromise(
        Nfpm.buildDeb(input).pipe(Effect.provide(Nfpm.layer({ executable: nfpm })), Effect.provide(NodeServices.layer)),
      );
      const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      const packaged = invocations.find((call) => call.argv[0] === "package");
      expect(packaged.payloads).toEqual([{
        dst: "/usr/bin/payload",
        mode: 0o751,
        hex: Buffer.from(payload).toString("hex"),
      }]);
      expect(packaged.configuration.contents[0].src).not.toBe(artifact.path);
      await writeFile(artifact.path, "changed bytes");
      const archiveExit = await Effect.runPromiseExit(
        Archive.archive(
          new Archive.ArchiveInput({ format: "zip", entries: [entry], outfile: join(root, "changed.zip") }),
        ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
      );
      const packageExit = await Effect.runPromiseExit(
        Nfpm.buildDeb(packageInput(artifact, join(root, "changed.deb"))).pipe(
          Effect.provide(Nfpm.layer({ executable: nfpm })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(errorTag(archiveExit)).toBe("FileVerificationFailed");
      expect(errorTag(packageExit)).toBe("FileVerificationFailed");
      const after = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(after.filter((call) => call.argv[0] === "package")).toHaveLength(1);
      await expect(readFile(join(root, "changed.zip"))).rejects.toThrow();
      await expect(readFile(join(root, "changed.deb"))).rejects.toThrow();
    },
  );

  it("rejects observations, borrowed/unhashed values and malformed executable identities at both ingresses", async () => {
    const root = await makeRoot();
    const artifact = await Effect.runPromise(finalize(root, "executable").pipe(Effect.provide(NodeServices.layer)));
    const nfpm = await installFixtureExecutable({ fixture, root, name: "nfpm" });
    const log = join(root, "nfpm.log");
    process.env.FAKE_NFPM_LOG = log;
    const invalid = [
      { ...artifact, _tag: "UnhashedExecutable", digest: undefined },
      { ...artifact, _tag: "HashedFileObservation", kind: "file", publication: undefined },
      { ...artifact, publication: { scope: "borrowed" } },
      { ...artifact, runtime: { name: "", version: "1" } },
      { ...artifact, nativeFormat: "pe" },
      { ...artifact, digest: { algorithm: "sha256", value: "invalid" } },
    ];
    for (const candidate of invalid) {
      expect(() => Schema.decodeUnknownSync(File.VerifiedInputSchema)(candidate)).toThrow();
      const archiveExit = await Effect.runPromiseExit(
        Archive.archive(
          {
            format: "zip",
            entries: [{ artifact: candidate, path: "payload" }],
            outfile: join(root, "invalid.zip"),
          } as unknown as Archive.ArchiveInput,
        ).pipe(Effect.provide(Archive.layer), Effect.provide(NodeServices.layer)),
      );
      const valid = packageInput(artifact, join(root, "invalid.deb"));
      const packageExit = await Effect.runPromiseExit(
        Nfpm.buildDeb(
          {
            ...valid,
            metadata: { ...valid.metadata, contents: [{ ...valid.metadata.contents[0], artifact: candidate }] },
          } as unknown as Nfpm.PackageInput,
        ).pipe(Effect.provide(Nfpm.layer({ executable: nfpm })), Effect.provide(NodeServices.layer)),
      );
      expect(errorTag(archiveExit)).toBe("ArchiveFailed");
      expect(errorTag(packageExit)).toBe("NfpmConfigurationRejected");
    }
    const invocations = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(invocations.every((call) => call.argv[0] === "--version")).toBe(true);
    await expect(readFile(join(root, "invalid.zip"))).rejects.toThrow();
    await expect(readFile(join(root, "invalid.deb"))).rejects.toThrow();
  });
});
