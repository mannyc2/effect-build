import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Nfpm from "effect-build-nfpm";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { elf, pe, thinMacho } from "../fixtures/native-executable.js";

const producer = { name: "fixture", version: "0.7.0" };
const tool = { name: "nfpm", path: "/not-launched", version: "2.47.0", bytes: 0, sha256: "0".repeat(64) };
const run = <A, E>(effect: Effect.Effect<A, E, Nfpm.Nfpm | NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provideService(Nfpm.Nfpm, { tool }), Effect.provide(NodeServices.layer)));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "effect-build-nfpm-target-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each([
  { name: "Darwin program in Linux package", bytes: thinMacho(), arch: "arm64" },
  { name: "Windows program in Linux package", bytes: pe(), arch: "amd64" },
  { name: "x64 program in ARM package", bytes: elf(), arch: "arm64" },
  { name: "native program in architecture independent package", bytes: elf(), arch: "all" },
  { name: "Linux package declaring Darwin", bytes: elf(), arch: "amd64", platform: "darwin" },
])("rejects $name before touching output", async ({ bytes, arch, platform }) => {
  const path = join(root, "program");
  await writeFile(path, bytes);
  const artifact = await run(Artifact.executable(path, producer));
  const error = await run(
    Nfpm.package({
      format: "deb",
      config: { name: "fixture", version: "1.0.0", arch, ...(platform === undefined ? {} : { platform }) },
      contents: [{ artifact, dst: "/usr/bin/fixture" }],
      outfile: join(root, "output.deb"),
    }).pipe(Effect.flip),
  );
  expect(error).toBeInstanceOf(Nfpm.InputInvalid);
  expect(await readdir(root)).toEqual(["program"]);
});
