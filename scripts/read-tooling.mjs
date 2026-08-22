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
        ".": [
          "BunBundleFailed",
          "BunBundleInvalid",
          "BunBundleMaterializationFailed",
          "BunBundleMaterializationOperation",
          "BunBundleSpawnFailed",
          "BunBundleVersionMismatch",
          "Compiler",
          "InvalidBundleInput",
          "Target",
          "compileExecutable",
          "compileExecutableMatrix",
          "layer",
          "withJavaScriptBundle",
        ],
      },
    },
    "effect-build-deno": {
      subpaths: ["."],
      runtimeKeys: {
        ".": ["Compiler", "Target", "compileExecutable", "compileExecutableMatrix", "layer"],
      },
    },
    "effect-build-esbuild": {
      subpaths: ["."],
      runtimeKeys: {
        ".": [
          "BundleMaterializationFailed",
          "BundleMaterializationOperation",
          "Esbuild",
          "EsbuildDiagnostic",
          "EsbuildFailed",
          "EsbuildVersionMismatch",
          "InvalidBundleInput",
          "JavaScriptBundleInvalid",
          "layer",
          "withJavaScriptBundle",
        ],
      },
    },
    "effect-build-node-sea": {
      subpaths: ["."],
      runtimeKeys: {
        ".": [
          "InvalidNodeSeaInput",
          "NodeSea",
          "NodeSeaFailed",
          "NodeSeaPreparationFailed",
          "NodeSeaPreparationOperation",
          "NodeSeaProbeFailed",
          "NodeSeaSpawnFailed",
          "NodeSeaSyntaxCheckFailed",
          "NodeSeaToolNotFound",
          "createExecutable",
          "layer",
        ],
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

const exactToolPins = {
  bun: {
    version: "1.3.9",
    archiveFormat: "zip",
    url: "https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip",
    sha256: "4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa",
    member: "bun-linux-x64/bun",
  },
  deno: {
    version: "2.9.3",
    archiveFormat: "zip",
    url: "https://github.com/denoland/deno/releases/download/v2.9.3/deno-x86_64-unknown-linux-gnu.zip",
    sha256: "8101865641cbede56f08ad19c0a67a87df84bce127fee0d3e3e1f7467717ffa6",
    member: "deno",
  },
  denort: {
    version: "2.9.3",
    archiveFormat: "zip",
    url: "https://github.com/denoland/deno/releases/download/v2.9.3/denort-x86_64-unknown-linux-gnu.zip",
    sha256: "9fd1ecebd84bfd99b406442f40176e32e948b00edb91221358ec44d25a2092bd",
    member: "denort",
  },
  node: {
    version: "26.7.0",
    archiveFormat: "tar.xz",
    url: "https://nodejs.org/dist/v26.7.0/node-v26.7.0-linux-x64.tar.xz",
    sha256: "982aa24dd8be4c889c6a8ab337ddff3b0896645b20f4239356e80552c16277ee",
    member: "node-v26.7.0-linux-x64/bin/node",
  },
};

export const validateToolPins = (pins) => {
  if (!exactKeys(pins, ["version", "tools"]) || pins.version !== 1 || !Array.isArray(pins.tools)) {
    throw new Error("tool pins must have exactly version and tools");
  }
  const expectedTools = Object.keys(exactToolPins);
  if (pins.tools.length !== expectedTools.length) throw new Error("tool pin count drifted");
  if (pins.tools.map((pin) => pin?.tool).join("\0") !== expectedTools.join("\0")) {
    throw new Error("tool pin order or membership drifted");
  }
  for (const pin of pins.tools) {
    if (!exactKeys(pin, ["tool", "version", "archiveFormat", "url", "sha256", "member", "target"])) {
      throw new Error(`tool pin shape drifted: ${String(pin?.tool)}`);
    }
    if (!exactKeys(pin.target, ["os", "architecture", "abi"])) {
      throw new Error(`tool pin target shape drifted: ${pin.tool}`);
    }
    const expected = exactToolPins[pin.tool];
    if (expected === undefined) throw new Error(`unknown tool pin: ${String(pin.tool)}`);
    for (const [key, value] of Object.entries(expected)) {
      if (pin[key] !== value) throw new Error(`tool pin drifted: ${pin.tool}/${key}`);
    }
    if (JSON.stringify(pin.target) !== JSON.stringify({ os: "linux", architecture: "x86_64", abi: "gnu" })) {
      throw new Error(`tool pin target drifted: ${pin.tool}`);
    }
    if (!/^[0-9a-f]{64}$/.test(pin.sha256)) throw new Error(`tool pin digest is malformed: ${pin.tool}`);
    const url = new URL(pin.url);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
      throw new Error(`tool pin URL is unsafe: ${pin.tool}`);
    }
  }
  return pins;
};

export const validateTooling = ({ pins, support, api }) => {
  if (support.version !== 1 || api.version !== 2) {
    throw new Error("unsupported tooling version");
  }
  validateToolPins(pins);
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
