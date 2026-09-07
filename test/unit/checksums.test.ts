import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Checksums } from "effect-build";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const execute = promisify(execFile);
const producer = { name: "fixture", version: "0.7.0" };
let root: string;
beforeEach(async () => {
  // Keep fixtures on the checkout's volume so Windows paths can be relative too.
  root = await mkdtemp(join(process.cwd(), ".effect-build-checksums-"));
  await mkdir(join(root, "dist", "arm64"), { recursive: true });
  await mkdir(join(root, "dist", "x64"), { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("checks files with the same basename in different directories from the producing working directory", async () => {
  const armPath = join(root, "dist", "arm64", "cli");
  const x64Path = join(root, "dist", "x64", "cli");
  await writeFile(armPath, "arm executable\n");
  await writeFile(x64Path, "x64 executable\n");
  const arm = await run(Artifact.file(armPath, producer));
  const x64 = await run(Artifact.file(x64Path, producer));
  const checksumPath = join(root, "dist", "SHA256SUMS");
  const sums = await run(Checksums.write({ artifacts: [x64, arm], outfile: checksumPath }));
  const prefix = `${basename(root)}/dist`;
  const contents = await readFile(sums.path, "utf8");
  expect(contents).toBe(`${arm.sha256}  ${prefix}/arm64/cli\n${x64.sha256}  ${prefix}/x64/cli\n`);
  expect(await run(Artifact.verify(sums))).toEqual(sums);

  if (process.platform === "win32") {
    for (const line of contents.trimEnd().split("\n")) {
      const hash = line.slice(0, 64);
      const path = line.slice(66);
      expect(createHash("sha256").update(await readFile(path)).digest("hex")).toBe(hash);
    }
  } else {
    const [command, args] = process.platform === "darwin"
      ? ["shasum", ["-a", "256", "-c", checksumPath]] as const
      : ["sha256sum", ["-c", checksumPath]] as const;
    const result = await execute(command, args, { cwd: process.cwd(), env: { ...process.env, LC_ALL: "C" } });
    expect(result.stdout).toContain(`${prefix}/arm64/cli: OK`);
    expect(result.stdout).toContain(`${prefix}/x64/cli: OK`);
  }

  const reordered = await run(Checksums.write({ artifacts: [arm, x64], outfile: join(root, "dist", "REORDERED") }));
  expect(await readFile(reordered.path, "utf8")).toBe(contents);
  expect(reordered.sha256).toBe(sums.sha256);
});
