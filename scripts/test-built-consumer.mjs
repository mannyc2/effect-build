import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const consumer = await mkdtemp(join(tmpdir(), "effect-build-consumer-"));

try {
  const { stdout } = await execFileAsync("npm", ["pack", "--pack-destination", consumer], {
    cwd: repository,
    env: { ...process.env, npm_config_cache: join(consumer, "npm-cache") },
  });
  const tarball = join(consumer, stdout.trim().split("\n").at(-1));
  await execFileAsync("tar", ["-xzf", tarball, "-C", consumer]);

  const modules = join(consumer, "node_modules");
  await mkdir(join(modules, "@effect"), { recursive: true });
  await mkdir(join(modules, "@types"), { recursive: true });
  await symlink(join(consumer, "package"), join(modules, "effect-build"), "dir");
  await symlink(join(repository, "node_modules", "effect"), join(modules, "effect"), "dir");
  await symlink(
    join(repository, "node_modules", "@effect", "platform-node"),
    join(modules, "@effect", "platform-node"),
    "dir",
  );
  await symlink(join(repository, "node_modules", "@types", "node"), join(modules, "@types", "node"), "dir");

  await mkdir(join(consumer, "examples"));
  for (const example of ["bun-compile.ts", "bun-matrix.ts", "deno-compile.ts"]) {
    await writeFile(
      join(consumer, "examples", example),
      await readFile(join(repository, "examples", example), "utf8"),
    );
  }

  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ name: "effect-build-consumer", private: true, type: "module" }, null, 2),
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["node"],
        },
        include: ["main.ts", "examples/**/*.ts"],
      },
      null,
      2,
    ),
  );

  const readme = await readFile(join(repository, "README.md"), "utf8");
  const readmeExample = /```ts\n(import \{ NodeServices \}[\s\S]*?)```/.exec(readme)?.[1];
  if (readmeExample === undefined) throw new Error("README must open with the NodeServices consumer example");
  const legacyBunSubpath = ["effect-build/bun/", "Bun", "Cli"].join("");
  const legacyDenoSubpath = ["effect-build/deno/", "Deno", "Cli"].join("");

  await writeFile(
    join(consumer, "main.ts"),
    [
      readmeExample,
      "",
      "export const readmeArtifact: unknown = artifact;",
      "",
      'import * as EffectBuild from "effect-build";',
      'import * as DenoCompiler from "effect-build/deno";',
      'import * as BunCompiler from "effect-build/bun";',
      "",
      "type Assert<T extends true> = T;",
      "type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
      "type SuccessOf<T> = T extends Effect.Effect<infer A, infer _E, infer _R> ? A : never;",
      "type ErrorOf<T> = T extends Effect.Effect<infer _A, infer E, infer _R> ? E : never;",
      "type ContextOf<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;",
      "type BunMatrix = ReturnType<typeof BunCompiler.compileExecutableMatrix>;",
      "type DenoMatrix = ReturnType<typeof DenoCompiler.compileExecutableMatrix>;",
      "export type BunMatrixSuccess = Assert<Same<SuccessOf<BunMatrix>, readonly BunCompiler.Artifact[]>>;",
      "export type DenoMatrixSuccess = Assert<Same<SuccessOf<DenoMatrix>, readonly DenoCompiler.Artifact[]>>;",
      "export type BunMatrixError = Assert<Same<ErrorOf<BunMatrix>, BunCompiler.MatrixError>>;",
      "export type DenoMatrixError = Assert<Same<ErrorOf<DenoMatrix>, DenoCompiler.MatrixError>>;",
      "export type BunMatrixContext = Assert<Same<ContextOf<BunMatrix>, BunCompiler.Compiler>>;",
      "export type DenoMatrixContext = Assert<Same<ContextOf<DenoMatrix>, DenoCompiler.Compiler>>;",
      "export type RootMatrixCompatibility = Assert<Same<BunCompiler.MatrixError | DenoCompiler.MatrixError extends EffectBuild.MatrixError.MatrixError ? true : false, true>>;",
      "export type BunArtifactTool = Assert<Same<BunCompiler.Artifact['tool']['name'], 'bun'>>;",
      "export type DenoArtifactTool = Assert<Same<DenoCompiler.Artifact['tool']['name'], 'deno'>>;",
      "",
      "export const bunTyped = BunCompiler.compileExecutable({",
      '  entrypoint: "src/main.ts",',
      '  outfile: "dist/app",',
      '  target: "linux-x64-musl",',
      "  digest: true,",
      "  options: { minify: true, sourcemap: \"inline\", bytecode: true },",
      "});",
      "",
      "export const denoTyped = DenoCompiler.compileExecutable({",
      '  entrypoint: "src/main.ts",',
      '  outfile: "dist/app",',
      "  options: { bundle: true, minify: true, permissions: { read: true } },",
      "});",
      "",
      "export const bunMatrixTyped = BunCompiler.compileExecutableMatrix({",
      '  entrypoint: "src/main.ts",',
      '  outdir: "dist",',
      '  name: "app",',
      '  targets: ["macos-aarch64", "linux-x64-musl", "windows-x64"],',
      "  concurrency: 2,",
      "  digest: true,",
      "  options: { minify: true },",
      "});",
      "",
      "export const denoMatrixTyped = DenoCompiler.compileExecutableMatrix({",
      '  entrypoint: "src/main.ts",',
      '  outdir: "dist",',
      '  name: "app",',
      '  targets: ["macos-x64", "linux-aarch64-gnu", "windows-aarch64"],',
      "  options: { bundle: true, minify: true, permissions: { read: true } },",
      "});",
      "",
      "export const bunRejectsEmptyMatrix = BunCompiler.compileExecutableMatrix({",
      '  entrypoint: "src/main.ts",',
      '  outdir: "dist",',
      '  name: "app",',
      "  // @ts-expect-error targets must be a non-empty tuple",
      "  targets: [],",
      "});",
      "",
      "export const denoRejectsMusl = DenoCompiler.compileExecutableMatrix({",
      '  entrypoint: "src/main.ts",',
      '  outdir: "dist",',
      '  name: "app",',
      "  // @ts-expect-error Deno does not support musl targets",
      '  targets: ["linux-x64-musl"],',
      "});",
      "",
      "export const denoRejectsBunOptions = DenoCompiler.compileExecutable({",
      '  entrypoint: "src/main.ts",',
      '  outfile: "dist/app",',
      "  // @ts-expect-error bytecode is a Bun option",
      "  options: { bytecode: true },",
      "});",
      "",
      "// @ts-expect-error the managed driver subpath no longer resolves",
      `import * as LegacyBun from ${JSON.stringify(legacyBunSubpath)};`,
      "// @ts-expect-error the managed driver subpath no longer resolves",
      `import * as LegacyDeno from ${JSON.stringify(legacyDenoSubpath)};`,
      "export const legacy = [LegacyBun, LegacyDeno];",
      "",
      "export const artifactShape: EffectBuild.Artifact.Artifact | undefined = undefined;",
      "export const matrixErrorShape: EffectBuild.MatrixError.MatrixError | undefined = undefined;",
    ].join("\n"),
  );

  await execFileAsync(process.execPath, [join(repository, "node_modules", "typescript", "bin", "tsc"), "-p", "."], {
    cwd: consumer,
  });

  await writeFile(
    join(consumer, "runtime.mjs"),
    [
      'import assert from "node:assert/strict";',
      'const api = await import("effect-build");',
      'assert.deepEqual(Object.keys(api), ["Artifact", "BuildError", "MatrixError", "Target"]);',
      'assert.equal(typeof api.Artifact.Artifact, "function");',
      'assert.equal(typeof api.MatrixError.MatrixError, "function");',
      'const bun = await import("effect-build/bun");',
      'assert.deepEqual(Object.keys(bun), ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]);',
      'assert.deepEqual(bun.Target.literals, ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-x64-musl", "linux-aarch64-gnu", "windows-x64"]);',
      'assert.equal(typeof bun.compileExecutableMatrix, "function");',
      'const deno = await import("effect-build/deno");',
      'assert.deepEqual(Object.keys(deno), ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"]);',
      'assert.deepEqual(deno.Target.literals, ["macos-x64", "macos-aarch64", "linux-x64-gnu", "linux-aarch64-gnu", "windows-x64", "windows-aarch64"]);',
      'assert.equal(typeof deno.compileExecutableMatrix, "function");',
      `await import(${JSON.stringify(legacyBunSubpath)}).then(() => { throw new Error("legacy bun subpath resolved"); }, () => undefined);`,
      `await import(${JSON.stringify(legacyDenoSubpath)}).then(() => { throw new Error("legacy deno subpath resolved"); }, () => undefined);`,
      'await import("effect-build/standalone/internal/Process.js").then(() => { throw new Error("internal subpath resolved"); }, () => undefined);',
    ].join("\n"),
  );
  await execFileAsync(process.execPath, [join(consumer, "runtime.mjs")], { cwd: consumer });
  console.log("packed consumer verified");
} finally {
  await rm(consumer, { recursive: true, force: true });
}
