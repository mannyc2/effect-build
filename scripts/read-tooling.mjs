import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const exactKeys = (value, expected) =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

const targetRank = (target) => {
  if (typeof target !== "string") return undefined;
  const parts = target.split("-");
  const osRank = ["macos", "linux", "windows"].indexOf(parts[0]);
  const architectureRank = ["x64", "aarch64"].indexOf(parts[1]);
  if (osRank === -1 || architectureRank === -1) return undefined;
  if (parts[0] === "linux") {
    if (parts.length !== 3) return undefined;
    const abiRank = ["gnu", "musl"].indexOf(parts[2]);
    return abiRank === -1 ? undefined : osRank * 4 + architectureRank * 2 + abiRank;
  }
  return parts.length === 2 ? osRank * 4 + architectureRank * 2 : undefined;
};

export const validateSupportMatrix = (support) => {
  if (support === null || typeof support !== "object" || Array.isArray(support)) {
    throw new Error("support matrix must be an object");
  }
  if (!Array.isArray(support.supportedCells)) throw new Error("supportedCells must be an array");

  const compilerOrder = ["bun", "deno"];
  const pairs = new Set();
  let previousCompilerRank = -1;
  const previousTargetRank = new Map();
  for (const cell of support.supportedCells) {
    if (!exactKeys(cell, ["orchestrator", "runner", "target", "compiler"])) {
      throw new Error("supported cell must have exactly orchestrator, runner, target, and compiler");
    }
    const compilerRank = compilerOrder.indexOf(cell.compiler);
    if (compilerRank === -1) throw new Error(`unknown compiler: ${String(cell.compiler)}`);
    if (cell.orchestrator !== "node") throw new Error("supported cell orchestrator must be node");
    if (cell.runner !== "ubuntu-24.04") throw new Error("supported cell runner must be ubuntu-24.04");
    const rank = targetRank(cell.target);
    if (rank === undefined) throw new Error(`malformed canonical target: ${String(cell.target)}`);
    const pair = `${cell.compiler}\0${cell.target}`;
    if (pairs.has(pair)) throw new Error(`duplicate supported cell: ${cell.compiler}/${cell.target}`);
    pairs.add(pair);
    if (compilerRank < previousCompilerRank) throw new Error("supported cells must be ordered bun then deno");
    const prior = previousTargetRank.get(cell.compiler);
    if (prior !== undefined && rank <= prior) {
      throw new Error(`supported ${cell.compiler} cells must follow canonical target order`);
    }
    previousCompilerRank = compilerRank;
    previousTargetRank.set(cell.compiler, rank);
  }
  return support;
};

const expectedPublicApi = {
  version: 2,
  packages: {
    "effect-build": {
      subpaths: [".", "./Integration", "./Provider"],
      runtimeKeys: {
        ".": ["Artifact", "BuildError", "JavaScriptBundle", "MatrixError", "Target"],
        "./Integration": [
          "executeCommand",
          "inspectLiveJavaScriptBundle",
          "produceExecutable",
          "withOwnedJavaScriptBundle",
        ],
        "./Provider": ["define"],
      },
    },
    "effect-build-bun": {
      subpaths: ["."],
      runtimeKeys: {
        ".": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
      },
    },
    "effect-build-deno": {
      subpaths: ["."],
      runtimeKeys: {
        ".": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
      },
    },
    "effect-build-node-sea": {
      subpaths: ["."],
      runtimeKeys: {
        ".": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
      },
    },
  },
};

export const validatePublicApi = (api) => {
  if (!exactKeys(api, Object.keys(expectedPublicApi))) {
    throw new Error("public API manifest must have exactly version and packages");
  }
  for (const key of Object.keys(expectedPublicApi)) {
    if (JSON.stringify(api[key]) !== JSON.stringify(expectedPublicApi[key])) {
      throw new Error(`unexpected public API ${key}`);
    }
  }
  return api;
};

export const validateTooling = ({ pins, support, api }) => {
  if (pins.version !== 1 || support.version !== 1 || api.version !== 2) {
    throw new Error("unsupported tooling version");
  }
  if (new Set(pins.tools.map((entry) => entry.tool)).size !== pins.tools.length) {
    throw new Error("duplicate tool pin");
  }
  if (new Set(support.publicationHosts).size !== support.publicationHosts.length) {
    throw new Error("duplicate publication host");
  }
  validateSupportMatrix(support);
  validatePublicApi(api);
  return { pins, support, api };
};

export const readTooling = async () => {
  const load = async (name) => JSON.parse(await readFile(resolve(root, "tooling", name), "utf8"));
  const pins = await load("tool-pins.json");
  const support = await load("support-matrix.json");
  const api = await load("public-api.json");
  return validateTooling({ pins, support, api });
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await readTooling()));
}
