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
  await symlink(join(consumer, "package"), join(modules, "effect-build"), "dir");
  await symlink(join(repository, "node_modules", "effect"), join(modules, "effect"), "dir");
  await symlink(
    join(repository, "node_modules", "@effect", "platform-node"),
    join(modules, "@effect", "platform-node"),
    "dir",
  );

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
          types: [],
        },
        include: ["main.ts"],
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
      'assert.deepEqual(Object.keys(api).sort(), ["Artifact", "BuildError", "Target"]);',
      'const bun = await import("effect-build/bun");',
      'assert.deepEqual(Object.keys(bun).sort(), ["Compiler", "compileExecutable", "layer"]);',
      'const deno = await import("effect-build/deno");',
      'assert.deepEqual(Object.keys(deno).sort(), ["Compiler", "compileExecutable", "layer"]);',
      `await import(${JSON.stringify(legacyBunSubpath)}).then(() => { throw new Error("legacy bun subpath resolved"); }, () => undefined);`,
      `await import(${JSON.stringify(legacyDenoSubpath)}).then(() => { throw new Error("legacy deno subpath resolved"); }, () => undefined);`,
      'await import("effect-build/standalone/internal/Process.js").then(() => { throw new Error("internal subpath resolved"); }, () => undefined);',
    ].join("\n"),
  );
  await execFileAsync(process.execPath, [join(consumer, "runtime.mjs")], { cwd: consumer });
  await execFileAsync(
    process.execPath,
    [join(repository, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.examples.json"],
    { cwd: repository },
  );

  console.log("packed consumer verified");
} finally {
  await rm(consumer, { recursive: true, force: true });
}
