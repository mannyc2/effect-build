import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const executable = process.env.EFFECT_BUILD_DENO;
if (executable === undefined) throw new Error("Set EFFECT_BUILD_DENO to the exact Deno executable under test");

it("bundles in memory and to disk with native Deno outputs and syntax diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-deno-api-"));
  try {
    const entry = join(root, "hello.ts");
    const bad = join(root, "bad.ts");
    const outfile = join(root, "bundle.js");
    const outdir = join(root, "bundle");
    await writeFile(entry, "export const answer: number = 42; console.log(answer);\n");
    await writeFile(bad, "const = ;\n");
    const script = String.raw`
      import { Effect } from "effect";
      import { Bundle, layer } from "effect-build-deno/api";
      const [entry, bad, outputPath, outputDir] = Deno.args;
      const result = await Effect.runPromise(Effect.gen(function*() {
        const memory = yield* Bundle.memory({ entrypoints: [entry], write: false });
        const direct = yield* Bundle.direct({ entrypoints: [entry], outputPath, write: true });
        const directory = yield* Bundle.direct({ entrypoints: [entry], outputDir, write: true });
        const failed = yield* Bundle.memory({ entrypoints: [bad], write: false });
        const output = memory.outputFiles[0];
        return {
          version: Deno.version.deno,
          memory: memory.success, direct: direct.success, directory: directory.success,
          text: output.text(), bytes: output.contents instanceof Uint8Array,
          hash: output.hash,
          failed: failed.success, errors: failed.errors.map(error => error.text)
        };
      }).pipe(Effect.provide(layer)));
      console.log(JSON.stringify(result));
    `;
    const completion = await execute(executable, [
      "eval", "--unstable-bundle", "--no-lock", "--node-modules-dir=manual", script, entry, bad, outfile, outdir,
    ], { cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 120_000 });
    const result = JSON.parse(completion.stdout.trim()) as Record<string, unknown>;
    expect(result).toMatchObject({ version: "2.9.5", memory: true, direct: true, directory: true, bytes: true, failed: false });
    expect(result.text).toContain("console.log(answer)");
    expect(result.hash).toEqual(expect.any(String));
    expect(result.errors).toEqual([expect.stringContaining("SyntaxError")]);
    expect(await readFile(outfile, "utf8")).toBe(result.text);
    expect(await readFile(join(outdir, "hello.js"), "utf8")).toBe(result.text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
