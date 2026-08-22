import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredPath = (name) => {
  const value = process.env[name];
  if (value === undefined || !isAbsolute(value)) throw new Error(`${name} must be absolute`);
  return value;
};
const run = async (executable, argv) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
const root = await mkdtemp(join(tmpdir(), "effect-build-node-sea-version-"));
try {
  const oldNode = requiredPath("EFFECT_BUILD_NODE_OLD_BIN");
  const currentNode = requiredPath("EFFECT_BUILD_NODE_CURRENT_BIN");
  const main = join(root, "main.cjs");
  await writeFile(main, 'console.log(JSON.stringify({ runtime: process.version, role: "node-main" }));\n');
  const build = async (builder, label, executable) => {
    const output = join(root, `output-${label}`);
    const config = join(root, `config-${label}.json`);
    await writeFile(
      config,
      JSON.stringify({
        main,
        mainFormat: "commonjs",
        executable,
        output,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
      }),
    );
    const result = await run(builder, ["--build-sea", config]);
    const execution = result.ok ? await run(output, []) : undefined;
    return {
      label,
      builderVersion: (await run(builder, ["--version"])).stdout.trim(),
      targetVersion: (await run(executable, ["--version"])).stdout.trim(),
      buildSucceeded: result.ok,
      execution: execution === undefined
        ? undefined
        : {
          succeeded: execution.ok,
          output: execution.ok ? JSON.parse(execution.stdout.trim()) : undefined,
          stdout: execution.stdout.slice(0, 4_096),
          stderr: execution.stderr.slice(0, 4_096),
          message: execution.ok ? undefined : execution.message,
        },
      diagnostics: (result.stderr || result.stdout || result.message).slice(0, 4_096),
    };
  };
  const result = {
    oldest: await build(oldNode, "oldest", oldNode),
    current: await build(currentNode, "current", currentNode),
    mismatchedBuilderAndTarget: await build(currentNode, "mismatch", oldNode),
  };
  console.log(`EFFECT_BUILD_NODE_SEA_VERSION_RECEIPT=${JSON.stringify(result)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
