import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact, Checksums } from "effect-build";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const execute = promisify(execFile);
const producer = { name: "fixture", version: "0.7.0" };
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), ".effect-build-checksums-"));
  await mkdir(join(root, "dist", "arm64"), { recursive: true });
  await mkdir(join(root, "dist", "x64"), { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("checks files with the same basename after moving the output tree", async () => {
  const armPath = join(root, "dist", "arm64", "cli");
  const x64Path = join(root, "dist", "x64", "cli");
  await writeFile(armPath, "arm executable\n");
  await writeFile(x64Path, "x64 executable\n");
  const arm = await run(Artifact.file(armPath, producer));
  const x64 = await run(Artifact.file(x64Path, producer));
  const checksumPath = join(root, "dist", "SHA256SUMS");
  const sums = await run(Checksums.write({ artifacts: [x64, arm], outfile: checksumPath }));
  const contents = await readFile(sums.path, "utf8");
  expect(contents).toBe(`${arm.sha256}  arm64/cli\n${x64.sha256}  x64/cli\n`);
  expect(await run(Artifact.verify(sums))).toEqual(sums);

  const reordered = await run(Checksums.write({ artifacts: [arm, x64], outfile: join(root, "dist", "REORDERED") }));
  expect(await readFile(reordered.path, "utf8")).toBe(contents);
  expect(reordered.sha256).toBe(sums.sha256);
  const moved = join(root, "release");
  await rename(join(root, "dist"), moved);
  if (process.platform === "win32") {
    for (const line of contents.trimEnd().split("\n")) {
      const hash = line.slice(0, 64);
      const path = line.slice(66);
      expect(createHash("sha256").update(await readFile(join(moved, path))).digest("hex")).toBe(hash);
    }
  } else {
    const [command, args] = process.platform === "darwin"
      ? ["shasum", ["-a", "256", "-c", "SHA256SUMS"]] as const
      : ["sha256sum", ["-c", "SHA256SUMS"]] as const;
    const result = await execute(command, args, { cwd: moved, env: { ...process.env, LC_ALL: "C" } });
    expect(result.stdout).toContain("arm64/cli: OK");
    expect(result.stdout).toContain("x64/cli: OK");
  }
});

it.skipIf(process.platform === "win32")("escapes newlines and backslashes exactly like native checksum tools", async () => {
  const paths = [join(root, "line\nbreak.txt"), join(root, "back\\slash.txt")].sort();
  const artifacts: Artifact.File[] = [];
  for (const path of paths) {
    await writeFile(path, "checksum payload\n");
    artifacts.push(await run(Artifact.file(path, producer)));
  }
  const checksum = await run(Checksums.write({ artifacts, outfile: join(root, "dist", "SHA256SUMS") }));
  const command = process.platform === "darwin" ? "shasum" : "sha256sum";
  const args = process.platform === "darwin" ? ["-a", "256"] : [];
  const options = { cwd: join(root, "dist"), env: { ...process.env, LC_ALL: "C", LC_CTYPE: "C", LANG: "C" } };
  const native = await execute(command, [...args, ...paths.map((path) => relative(options.cwd, path))], options);
  expect(await readFile(checksum.path, "utf8")).toBe(native.stdout);
  const checked = await execute(command, [...args, "-c", checksum.path], options);
  expect(checked.stdout.match(/: OK/g)).toHaveLength(2);
});
