import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export class ToolVersionUnsupported extends Error {
  constructor({
    tool,
    observed,
    tested,
    knownIncompatible = [],
    overrideAvailable = true,
    missingCapabilities = [],
  }) {
    const capabilitySuffix = missingCapabilities.length === 0
      ? ""
      : ` Missing required capabilities: ${missingCapabilities.join(", ")}.`;
    super(
      `${tool} ${observed} is outside the tested range ${tested.min}..${tested.max}. `
        + (overrideAvailable
          ? "Select a supported tool or enable allowUntestedVersion on the provider Layer."
          : "Select a supported tool version.")
        + capabilitySuffix,
    );
    this.name = "ToolVersionUnsupported";
    this.tool = tool;
    this.observed = observed;
    this.tested = Object.freeze({ ...tested });
    this.knownIncompatible = Object.freeze([...knownIncompatible]);
    this.overrideAvailable = overrideAvailable;
    this.missingCapabilities = Object.freeze([...missingCapabilities]);
  }
}

export const parseVersion = (value) => {
  const match = VERSION.exec(value.trim().replace(/^v/, ""));
  if (match === null) throw new Error(`invalid semantic version: ${value}`);
  return Object.freeze({ major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) });
};

export const compareVersion = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
};

export const assessCompatibility = ({
  tool,
  observed,
  tested,
  knownIncompatible = [],
  requiredCapabilities = [],
  observedCapabilities = [],
  allowUntestedVersion = false,
}) => {
  if (knownIncompatible.includes(observed)) {
    throw new ToolVersionUnsupported({ tool, observed, tested, knownIncompatible, overrideAvailable: false });
  }
  const missingCapabilities = requiredCapabilities.filter((capability) => !observedCapabilities.includes(capability));
  if (missingCapabilities.length > 0) {
    throw new ToolVersionUnsupported({ tool, observed, tested, knownIncompatible, missingCapabilities });
  }
  const testedVersion = compareVersion(observed, tested.min) >= 0 && compareVersion(observed, tested.max) <= 0;
  if (testedVersion) {
    return Object.freeze({ compatibility: "tested", observed, warning: undefined });
  }
  if (!allowUntestedVersion) {
    throw new ToolVersionUnsupported({ tool, observed, tested, knownIncompatible });
  }
  return Object.freeze({
    compatibility: "untested-override",
    observed,
    warning: Object.freeze({
      _tag: "ToolVersionUntestedOverride",
      tool,
      observed,
      tested: Object.freeze({ ...tested }),
    }),
  });
};

const sha256 = (contents) => `sha256:${createHash("sha256").update(contents).digest("hex")}`;

const observe = async (path) => {
  const canonical = await realpath(path);
  const information = await stat(canonical);
  if (!information.isFile()) throw new Error("borrowed output is not a regular file");
  const contents = await readFile(canonical);
  return Object.freeze({ path: canonical, bytes: contents.byteLength, digest: sha256(contents) });
};

export const verifyBorrowedFile = async (file) => {
  const current = await observe(file.path);
  if (current.bytes !== file.bytes) throw new Error("borrowed output byte count changed");
  if (current.digest !== file.digest) throw new Error("borrowed output digest changed");
  return file;
};

const acquireProgram = async (contents, suffix = ".mjs") => {
  const root = await mkdtemp(join(tmpdir(), "effect-build-research-program-"));
  const path = join(root, `main${suffix}`);
  await writeFile(path, contents);
  const file = await observe(path);
  const program = Object.freeze({
    file,
    format: suffix === ".cjs" ? "cjs" : "esm",
    resolutionTarget: "node",
  });
  return { root, program };
};

export const withProgramSingle = async (contents, use, suffix = ".mjs") => {
  const { root, program } = await acquireProgram(contents, suffix);
  try {
    return await use(program);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

export const withProgramDouble = async (contents, use, suffix = ".mjs") => {
  const { root, program } = await acquireProgram(contents, suffix);
  let live = true;
  const handle = Object.freeze({
    format: program.format,
    resolutionTarget: program.resolutionTarget,
    withFile: async (consume) => {
      if (!live) {
        const error = new Error("borrowed program expired");
        error.name = "BorrowedProgramExpired";
        throw error;
      }
      return consume(await verifyBorrowedFile(program.file));
    },
  });
  try {
    return await use(handle);
  } finally {
    live = false;
    await rm(root, { recursive: true, force: true });
  }
};

export const withProgramFileEffect = async (contents, use, suffix = ".mjs") => {
  const { root, program } = await acquireProgram(contents, suffix);
  let live = true;
  const handle = Object.freeze({
    format: program.format,
    resolutionTarget: program.resolutionTarget,
    file: async () => {
      if (!live) {
        const error = new Error("borrowed program expired");
        error.name = "BorrowedProgramExpired";
        throw error;
      }
      return verifyBorrowedFile(program.file);
    },
  });
  try {
    return await use(handle);
  } finally {
    live = false;
    await rm(root, { recursive: true, force: true });
  }
};

export const acquireProgramScoped = async (contents, suffix = ".mjs") => {
  const { root, program } = await acquireProgram(contents, suffix);
  let released = false;
  return Object.freeze({
    program,
    release: async () => {
      if (released) return;
      released = true;
      await rm(root, { recursive: true, force: true });
    },
  });
};

export const lifecycleFamilies = Object.freeze({
  oneShotHost: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["output-observed", "interrupted", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["output-observed", "interrupted", "failed-before-commit"]),
    }),
  }),
  oneShotCommand: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["output-observed", "interrupted", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["tool-selected", "failed-before-commit"]),
      "tool-selected": Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["output-observed", "cancellation-requested", "failed-before-commit"]),
      "cancellation-requested": Object.freeze(["interrupted", "failed-before-commit"]),
    }),
  }),
  scopedContext: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["released", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["ready", "cancellation-requested", "failed-before-commit"]),
      ready: Object.freeze(["rebuild", "cancellation-requested", "released"]),
      rebuild: Object.freeze(["ready", "cancellation-requested", "failed-before-commit"]),
      "cancellation-requested": Object.freeze(["released", "failed-before-commit"]),
    }),
  }),
  commandWatch: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["released", "unexpected-exit", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["tool-selected", "failed-before-commit"]),
      "tool-selected": Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["ready", "unexpected-exit", "cancellation-requested", "failed-before-commit"]),
      ready: Object.freeze(["rebuild", "unexpected-exit", "cancellation-requested"]),
      rebuild: Object.freeze(["ready", "unexpected-exit", "cancellation-requested"]),
      "cancellation-requested": Object.freeze(["released", "unexpected-exit"]),
    }),
  }),
  borrowedOutput: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["released", "interrupted", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["ready", "interrupted", "failed-before-commit"]),
      ready: Object.freeze(["output-observed", "released", "interrupted", "failed-before-commit"]),
      "output-observed": Object.freeze(["output-observed", "released", "interrupted", "failed-before-commit"]),
    }),
  }),
  durableSingleFile: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["publication-committed", "interrupted", "failed-before-commit"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["tool-selected", "failed-before-commit"]),
      "tool-selected": Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["output-observed", "cancellation-requested", "failed-before-commit"]),
      "output-observed": Object.freeze(["publication-committed", "failed-before-commit"]),
      "cancellation-requested": Object.freeze(["interrupted", "failed-before-commit"]),
    }),
  }),
  providerDirectWrite: Object.freeze({
    initial: "requested",
    terminal: Object.freeze([
      "output-observed",
      "interrupted",
      "failed-before-commit",
      "failed-after-durable-outcome",
    ]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze([
        "output-observed",
        "interrupted",
        "failed-before-commit",
        "failed-after-durable-outcome",
      ]),
      "output-observed": Object.freeze(["output-observed", "failed-after-durable-outcome"]),
    }),
  }),
  matrix: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["output-observed", "interrupted", "failed-before-commit", "failed-after-durable-outcome"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze([
        "output-observed",
        "cancellation-requested",
        "failed-before-commit",
        "failed-after-durable-outcome",
      ]),
      "cancellation-requested": Object.freeze(["interrupted", "failed-after-durable-outcome"]),
    }),
  }),
  postProductionMutation: Object.freeze({
    initial: "requested",
    terminal: Object.freeze(["publication-committed", "failed-before-commit", "failed-after-durable-outcome"]),
    transitions: Object.freeze({
      requested: Object.freeze(["validated", "failed-before-commit"]),
      validated: Object.freeze(["started", "failed-before-commit"]),
      started: Object.freeze(["output-observed", "failed-before-commit", "failed-after-durable-outcome"]),
      "output-observed": Object.freeze(["publication-committed", "failed-after-durable-outcome"]),
    }),
  }),
});

export const validateLifecycleTrace = (familyName, trace) => {
  const family = lifecycleFamilies[familyName];
  if (family === undefined) throw new Error(`unknown lifecycle family: ${familyName}`);
  if (!Array.isArray(trace) || trace[0] !== family.initial) return false;
  for (let index = 1; index < trace.length; index += 1) {
    const previous = trace[index - 1];
    const current = trace[index];
    if (!family.transitions[previous]?.includes(current)) return false;
  }
  return family.terminal.includes(trace.at(-1));
};

export const makeToolObservation = ({ name, version, path, compatibility }) => Object.freeze({
  name,
  version,
  path,
  compatibility,
});
