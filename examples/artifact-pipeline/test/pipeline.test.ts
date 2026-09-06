import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import * as Archive from "effect-build-archives/Archive";
import * as File from "effect-build/Author/File";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";
import { archiveReport, buildDistribution, prepareReport } from "../src/Pipeline.ts";

const execute = promisify(execFile);
const services = Archive.layer.pipe(Layer.provideMerge(NodeServices.layer));
const temporaryDirectory = async (context: TestContext) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-build-pipeline-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test("an independent ZIP reader extracts an app that runs without the source tree", async (context) => {
  const directory = await temporaryDirectory(context);
  const result = await Effect.runPromise(buildDistribution(join(directory, "output")).pipe(Effect.provide(services)));
  const bytes = await readFile(result.archive.path);
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries).sort(), ["inventory/USAGE.txt", "inventory/report.mjs"]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), result.adoption.digest.value);
  assert.equal(result.adoption.bytes, String(bytes.byteLength));
  assert.equal("path" in result.adoption, false);
  for (
    const [name, artifact] of [
      ["inventory/report.mjs", result.bundle],
      ["inventory/USAGE.txt", result.instructions],
    ] as const
  ) {
    const contents = entries[name];
    assert.ok(contents);
    assert.equal(createHash("sha256").update(contents).digest("hex"), artifact.digest.value);
    assert.equal(String(contents.byteLength), artifact.bytes);
  }

  const extracted = join(directory, "extracted");
  for (const [relativePath, contents] of Object.entries(entries)) {
    const destination = join(extracted, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  const { stdout } = await execute(process.execPath, [join(extracted, "inventory/report.mjs")], { cwd: extracted });
  assert.deepEqual(JSON.parse(stdout), { products: 3, units: 19, outOfStock: ["pen"] });
});

test("a repeated build preserves the existing bundle and archive", async (context) => {
  const directory = await temporaryDirectory(context);
  const result = await Effect.runPromise(buildDistribution(directory).pipe(Effect.provide(services)));
  const original = await readFile(result.archive.path);
  const failure = await Effect.runPromise(buildDistribution(directory).pipe(Effect.flip, Effect.provide(services)));
  assert.equal(failure._tag, "FileDestinationLocked");
  assert.deepEqual(await readFile(result.archive.path), original);
  const bundle = await Effect.runPromise(
    File.withVerifiedBytes(result.bundle, Effect.succeed).pipe(Effect.provide(services)),
  );
  assert.equal(createHash("sha256").update(bundle).digest("hex"), result.bundle.digest.value);
});

test("changed input bytes prevent the next archive from being committed", async (context) => {
  const directory = await temporaryDirectory(context);
  const files = await Effect.runPromise(prepareReport(directory).pipe(Effect.provide(services)));
  await writeFile(files.bundle.path, "changed after finalization\n");
  const outfile = join(directory, "rejected.zip");
  const failure = await Effect.runPromise(archiveReport(files, outfile).pipe(Effect.flip, Effect.provide(services)));
  assert.equal(failure._tag, "FileVerificationFailed");
  await assert.rejects(readFile(outfile), { code: "ENOENT" });
  assert.match(await readFile(files.instructions.path, "utf8"), /node report\.mjs/);
});
