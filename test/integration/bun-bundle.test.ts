import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import * as Bun from "effect-build-bun";
import * as esbuild from "esbuild";
import { execFile } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "effect-build-bun-bundle-real-"));
const selectedBun = process.env.EFFECT_BUILD_BUN_BIN;

afterAll(() => rmSync(root, { recursive: true, force: true }));

const requiredSelectedBun = (): string => {
  if (selectedBun === undefined || selectedBun.length === 0) {
    throw new Error("EFFECT_BUILD_BUN_BIN is required for the Bun bundle characterization cell");
  }
  if (!isAbsolute(selectedBun)) throw new Error("EFFECT_BUILD_BUN_BIN must be absolute");
  accessSync(selectedBun, constants.X_OK);
  return realpathSync(selectedBun);
};

const run = (executable: string, argv: readonly string[]) =>
  execFileAsync(executable, [...argv], {
    env: { ...process.env, LC_ALL: "C" },
    maxBuffer: 8 * 1024 * 1024,
  });

interface Observation {
  readonly metaMain?: boolean;
  readonly dependency: "commonjs-ok";
  readonly classicMain: false;
}

const parseObservation = (stdout: string): Observation => JSON.parse(stdout.trim()) as Observation;

const writeIdioms = (directory: string): string => {
  const dependency = join(directory, "legacy.cjs");
  const entrypoint = join(directory, "entry.mjs");
  writeFileSync(
    dependency,
    'const classicMain = require.main === module; module.exports = { dependency: "commonjs-ok", classicMain };\n',
  );
  writeFileSync(
    entrypoint,
    'import legacy from "./legacy.cjs"; console.log(JSON.stringify({ metaMain: import.meta.main, dependency: legacy.dependency, classicMain: legacy.classicMain }));\n',
  );
  return entrypoint;
};

const executeBundle = async (path: string, format: "esm" | "cjs") => {
  const direct = await run(process.execPath, [path]);
  const imported = format === "esm"
    ? await run(process.execPath, ["-e", "import(process.argv[1])", path])
    : await run(process.execPath, ["-e", "require(process.argv[1])", path]);
  return { direct: parseObservation(direct.stdout), imported: parseObservation(imported.stdout) };
};

describe("exact Bun 1.3.9 JavaScript bundle characterization", () => {
  it("pins the selected executable and freezes ESM/CJS direct-versus-imported behavior", async () => {
    const executable = requiredSelectedBun();
    expect((await run(executable, ["--version"])).stdout.trim()).toBe("1.3.9");
    const entrypoint = writeIdioms(root);

    for (const format of ["esm", "cjs"] as const) {
      let bundlePath = "";
      const observed = await Effect.runPromise(
        Bun.withJavaScriptBundle(
          { entrypoint, format, cwd: root },
          (main) =>
            Effect.promise(async () => {
              bundlePath = main.path;
              expect(main.observedExternalImports).toEqual([]);
              expect(main.stages).toEqual([{
                operation: "bundle-javascript",
                tool: { name: "bun", version: "1.3.9", path: executable },
              }]);
              return executeBundle(main.path, format);
            }),
        ).pipe(
          Effect.provide(Bun.layer({ executable })),
          Effect.provide(NodeServices.layer),
        ),
      );
      expect(observed.direct).toEqual({ metaMain: true, dependency: "commonjs-ok", classicMain: false });
      expect(observed.imported).toEqual({
        metaMain: format === "esm",
        dependency: "commonjs-ok",
        classicMain: false,
      });
      expect(existsSync(bundlePath)).toBe(false);
    }
  }, 120_000);

  it("keeps lexical entry identity across a symlink while tolerating canonical imported records", async () => {
    const executable = requiredSelectedBun();
    const actual = mkdtempSync(join(root, "actual-"));
    writeIdioms(actual);
    const linked = join(root, "linked-project");
    symlinkSync(actual, linked, "dir");
    const observation = await Effect.runPromise(
      Bun.withJavaScriptBundle(
        { entrypoint: "entry.mjs", format: "esm", cwd: linked },
        (main) => Effect.succeed(main.observedExternalImports),
      ).pipe(
        Effect.provide(Bun.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(observation).toEqual([]);
  }, 60_000);

  it("makes Bun's imported-ESM import.meta.main divergence visible beside Esbuild", async () => {
    const executable = requiredSelectedBun();
    const entrypoint = writeIdioms(root);
    const bunObservation = await Effect.runPromise(
      Bun.withJavaScriptBundle(
        { entrypoint, format: "esm", cwd: root },
        (main) => Effect.promise(() => executeBundle(main.path, "esm")),
      ).pipe(
        Effect.provide(Bun.layer({ executable })),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(bunObservation).toEqual({
      direct: { metaMain: true, dependency: "commonjs-ok", classicMain: false },
      imported: { metaMain: true, dependency: "commonjs-ok", classicMain: false },
    });

    for (const format of ["esm", "cjs"] as const) {
      const outfile = join(root, `esbuild.${format === "esm" ? "mjs" : "cjs"}`);
      const result = await esbuild.build({
        entryPoints: [entrypoint],
        outfile,
        bundle: true,
        platform: "node",
        packages: "bundle",
        format,
        target: "node26.7",
        logLevel: "silent",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(format === "esm" ? 0 : 1);
      const observation = await executeBundle(outfile, format);
      expect(observation.direct).toEqual(
        format === "esm"
          ? { metaMain: true, dependency: "commonjs-ok", classicMain: false }
          : { dependency: "commonjs-ok", classicMain: false },
      );
      expect(observation.imported).toEqual(
        format === "esm"
          ? { metaMain: false, dependency: "commonjs-ok", classicMain: false }
          : { dependency: "commonjs-ok", classicMain: false },
      );
    }
  }, 120_000);
});
