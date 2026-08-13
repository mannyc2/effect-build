import { execFile } from "node:child_process";
import { accessSync, constants, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { inspectNativeExecutable } from "../../src/standalone/internal/NativeExecutable.js";

const execFileAsync = promisify(execFile);
const fixtures = fileURLToPath(new URL("../fixtures/node-sea/", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "effect-build-node-sea-characterization-"));
const selectedNode = process.env.EFFECT_BUILD_NODE_SEA_BIN;
const expectedObservation = {
  format: "elf",
  os: "linux",
  architecture: "x64",
  abi: "gnu",
} as const;

afterAll(() => rmSync(root, { recursive: true, force: true }));

const requiredSelectedNode = (): string => {
  if (selectedNode === undefined || selectedNode.length === 0) {
    throw new Error("EFFECT_BUILD_NODE_SEA_BIN is required for the Node SEA characterization cell");
  }
  if (!isAbsolute(selectedNode)) throw new Error("EFFECT_BUILD_NODE_SEA_BIN must be absolute");
  accessSync(selectedNode, constants.X_OK);
  return selectedNode;
};

const run = async (executable: string, argv: readonly string[]) =>
  execFileAsync(executable, [...argv], {
    env: { ...process.env, LC_ALL: "C" },
    maxBuffer: 8 * 1024 * 1024,
  });

const buildSea = async (
  executable: string,
  format: "commonjs" | "module",
  main: string,
  output: string,
  asset: string,
) => {
  const configPath = join(root, `${format}.json`);
  const config = {
    main,
    mainFormat: format,
    executable,
    output,
    useSnapshot: false,
    useCodeCache: false,
    assets: { message: asset },
  } as const;
  writeFileSync(configPath, `${JSON.stringify(config, undefined, 2)}\n`);
  const argv = ["--build-sea", configPath] as const;
  expect(argv).toEqual(["--build-sea", configPath]);
  await run(executable, argv);
  expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual(config);
  return output;
};

describe("exact Node 26.7 direct SEA characterization", () => {
  it("pins direct capability and the selected builtin authority", async () => {
    const executable = requiredSelectedNode();
    expect((await run(executable, ["--version"])).stdout.trim()).toBe("v26.7.0");
    expect((await run(executable, ["--help"])).stdout).toContain("--build-sea");

    const probe = [
      "const { builtinModules, isBuiltin } = require('node:module');",
      "const names = new Set();",
      "for (const name of builtinModules) {",
      "  const bare = name.startsWith('node:') ? name.slice(5) : name;",
      "  if (isBuiltin(bare)) names.add(bare);",
      "  if (isBuiltin(`node:${bare}`)) names.add(`node:${bare}`);",
      "}",
      "process.stdout.write(JSON.stringify({",
      "  names: [...names].sort(),",
      "  samples: {",
      "    bare: isBuiltin('fs'),",
      "    prefixed: isBuiltin('node:fs'),",
      "    subpath: isBuiltin('fs/promises'),",
      "    prefixedSubpath: isBuiltin('node:fs/promises'),",
      "    invalid: isBuiltin('fs/not-a-real-builtin'),",
      "    invalidPrefixed: isBuiltin('node:fs/not-a-real-builtin')",
      "  }",
      "}));",
    ].join("\n");
    const decoded = JSON.parse((await run(executable, ["-e", probe])).stdout) as {
      names: string[];
      samples: Record<string, boolean>;
    };
    expect(decoded.samples).toEqual({
      bare: true,
      prefixed: true,
      subpath: true,
      prefixedSubpath: true,
      invalid: false,
      invalidPrefixed: false,
    });
    expect(decoded.names).toContain("fs");
    expect(decoded.names).toContain("node:fs");
    expect(decoded.names).toContain("fs/promises");
    expect(decoded.names).toContain("node:fs/promises");
    expect(decoded.names).not.toContain("fs/not-a-real-builtin");
    expect(decoded.names).toEqual([...decoded.names].sort());
  }, 60_000);

  it("builds CJS and ESM with exact config, assets, target, and replacement behavior", async () => {
    const executable = requiredSelectedNode();
    const asset = join(fixtures, "message.txt");
    const cjsOutput = join(root, "cjs-app");
    const esmOutput = join(root, "esm-app");

    copyFileSync(join(fixtures, "message.txt"), cjsOutput);
    const cjs = await buildSea(executable, "commonjs", join(fixtures, "main.cjs"), cjsOutput, asset);
    const esm = await buildSea(executable, "module", join(fixtures, "main.mjs"), esmOutput, asset);

    for (const output of [cjs, esm]) {
      accessSync(output, constants.X_OK);
      expect(inspectNativeExecutable(readFileSync(output))).toEqual(expectedObservation);
    }
    expect(inspectNativeExecutable(readFileSync(executable))).toEqual(expectedObservation);
    expect((await run(cjs, [])).stdout).toBe("cjs:effect-build-node-sea\n\n");
    expect((await run(esm, [])).stdout).toBe("esm:effect-build-node-sea\n\n");
  }, 180_000);

  it("rejects malformed configuration with nonzero diagnostics", async () => {
    const executable = requiredSelectedNode();
    const configPath = join(root, "malformed.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        main: join(root, "missing-main.cjs"),
        mainFormat: "commonjs",
        executable,
        output: join(root, "malformed-output"),
        useSnapshot: false,
        useCodeCache: false,
      }),
    );

    const failure = await run(executable, ["--build-sea", configPath]).then(
      () => undefined,
      (error: unknown) => error,
    ) as { code?: unknown; stdout?: unknown; stderr?: unknown } | undefined;
    expect(failure).toBeDefined();
    expect(failure?.code).toEqual(expect.any(Number));
    expect(failure?.code).not.toBe(0);
    expect(`${String(failure?.stdout ?? "")}${String(failure?.stderr ?? "")}`.trim()).not.toBe("");
  }, 60_000);
});
