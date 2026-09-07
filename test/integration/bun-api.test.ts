import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it("builds native Bun outputs and reuses a configured TypeScript transpiler", async () => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-bun-api-"));
  try {
    const entry = join(root, "hello.ts");
    const bad = join(root, "bad.ts");
    const outdir = join(root, "bundle");
    await writeFile(entry, 'const answer: number = 42; console.log(answer);\n');
    await writeFile(bad, "const = ;\n");
    const script = String.raw`
      import { Effect } from "effect";
      import { Build, Transpiler, layer } from "effect-build-bun/api";
      const result = await Effect.runPromise(Effect.gen(function*() {
        const transpiler = yield* Transpiler.make({ loader: "ts" });
        const transformed = yield* Transpiler.transform(transpiler, "const value: number = 42;");
        const sync = yield* Transpiler.transformSync(transpiler, "const value: number = 43;", {});
        const explicit = yield* Transpiler.transformSync(transpiler, "const value: number = 44;", "ts", {});
        const scan = yield* Transpiler.scan(transpiler, 'import value from "value"; export { value };');
        const imports = yield* Transpiler.scanImports(transpiler, 'import value from "value";');
        const memory = yield* Build.build({ entrypoints: [process.env.API_ENTRY] });
        const direct = yield* Build.buildToDirectory({ entrypoints: [process.env.API_ENTRY], outdir: process.env.API_OUTDIR });
        const failed = yield* Build.build({ entrypoints: [process.env.API_BAD], throw: false });
        const thrown = yield* Effect.flip(Build.build({ entrypoints: [process.env.API_BAD], throw: true }));
        const syntax = yield* Effect.flip(Transpiler.transform(transpiler, "const = ;"));
        const memoryText = yield* Effect.promise(() => memory.outputs[0].text());
        return {
          transformed, sync, explicit, memoryText,
          imports: imports.length, scanned: scan.imports.length,
          outputs: direct.outputs.length,
          failed: failed.success === false && failed.logs.length > 0,
          thrown: thrown._tag === "BunApiFailed" && thrown.cause instanceof AggregateError,
          syntax: syntax._tag === "BunApiFailed" && syntax.cause instanceof Error
        };
      }).pipe(Effect.provide(layer)));
      console.log(JSON.stringify(result));
    `;
    const completion = await execute(process.env.EFFECT_BUILD_BUN ?? "bun", ["-e", script], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, API_ENTRY: entry, API_BAD: bad, API_OUTDIR: outdir },
    });
    const result = JSON.parse(completion.stdout.trim()) as Record<string, unknown>;
    expect(result).toMatchObject({ imports: 1, scanned: 1, outputs: 1, failed: true, thrown: true, syntax: true });
    expect(result.transformed).toContain("const value = 42");
    expect(result.sync).toContain("const value = 43");
    expect(result.explicit).toContain("const value = 44");
    expect(result.memoryText).toContain("console.log(answer)");
    expect(await readFile(join(outdir, "hello.js"), "utf8")).toContain("console.log(answer)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
