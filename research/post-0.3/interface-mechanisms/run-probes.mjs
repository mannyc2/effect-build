import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROBE_SCHEMA = "effect-build/interface-mechanism-probe@1";
const SUMMARY_SCHEMA = "effect-build/interface-mechanism-probe-summary@2";
const RUN_SCHEMA = "effect-build/interface-mechanism-probe-run@1";
const COHORT_SCHEMA = "effect-build/interface-mechanism-probe-cohort@1";
const COHORT = "effect-build/interface-mechanism-probes@1";
const WATCHDOG_GRACE_MS = 2_000;
const MAX_PROBE_OUTPUT_BYTES = 16 * 1024 * 1024;

const runnerPath = fileURLToPath(import.meta.url);
const here = dirname(runnerPath);
const repositoryRoot = join(here, "../../..");
const receipts = join(here, "receipts");
const expectedConclusionsPath = join(here, "EXPECTED-CONCLUSIONS.json");
const expectedConclusions = JSON.parse(await readFile(expectedConclusionsPath, "utf8"));
const expectedAssertionsById = expectedConclusions.requiredProbeAssertions;

const probes = [
  {
    id: "bun-sidecar",
    file: "bun-sidecar-probe.mjs",
    expectedProbe: "bun-transpiler-sidecar",
    expectedClassification: "research-prototype-not-product-code",
    timeoutMs: 60_000,
    sources: ["bun-sidecar-probe.mjs", "bun-sidecar-server.ts", "bun-direct-plugin.ts"],
    requiredEnvironment: ["BUN_EXE", "BUN_EXPECTED_VERSION", "BUN_EXPECTED_SHA256"],
    optionalEnvironment: [],
  },
  {
    id: "esbuild-js-service",
    file: "esbuild-js-service-probe.mjs",
    expectedProbe: "esbuild-js-native-service",
    expectedClassification: "current-provider-mechanism-trace",
    timeoutMs: 45_000,
    sources: ["esbuild-js-service-probe.mjs"],
    requiredEnvironment: [],
    optionalEnvironment: [],
  },
  {
    id: "esbuild-wasm-browser",
    file: "esbuild-wasm-browser-probe.mjs",
    expectedProbe: "esbuild-wasm-browser-worker",
    expectedClassification: "research-prototype-not-product-code",
    timeoutMs: 120_000,
    sources: ["esbuild-wasm-browser-probe.mjs"],
    requiredEnvironment: [],
    optionalEnvironment: ["CHROME_EXE"],
  },
  {
    id: "node-postject",
    file: "node-postject-probe.mjs",
    expectedProbe: "node-direct-sea-and-programmatic-postject",
    expectedClassification: "official-direct-baseline-plus-third-party-programmatic-alternative",
    timeoutMs: 120_000,
    sources: ["node-postject-probe.mjs"],
    requiredEnvironment: [
      "NODE_267_EXE",
      "NODE_267_EXPECTED_SHA256",
      "POSTJECT_ROOT",
      "POSTJECT_EXPECTED_API_SHA256",
    ],
    optionalEnvironment: [],
  },
];
if (JSON.stringify(Object.keys(expectedAssertionsById)) !== JSON.stringify(probes.map(({ id }) => id))) {
  throw new Error("EXPECTED-CONCLUSIONS probe IDs/order differ from the runner configuration");
}

// These are the only ambient variables forwarded to probe processes. Provider
// selection and content pins are added per probe below instead of inheriting the
// runner's complete environment.
const baseEnvironmentNames = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NPM_CONFIG_CACHE",
  "npm_config_cache",
  "NPM_CONFIG_REGISTRY",
  "npm_config_registry",
  "NPM_CONFIG_USERCONFIG",
  "npm_config_userconfig",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "CODESIGN_ALLOCATE",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceSetSha256 = (sources) => sha256(sources
  .map(({ path, sha256: digest }) => `${path}\0${digest}\n`)
  .join(""));
const repositoryPath = (path) => relative(repositoryRoot, path).split(sep).join("/");
const readSource = async (path) => ({
  path: repositoryPath(path),
  sha256: sha256(await readFile(path)),
});

const captureSources = async () => {
  const runner = await readSource(runnerPath);
  const conclusions = await readSource(expectedConclusionsPath);
  const byProbe = {};
  const all = new Map([[runner.path, runner], [conclusions.path, conclusions]]);
  for (const probe of probes) {
    const sources = [];
    for (const file of probe.sources) {
      const source = await readSource(join(here, "probes", file));
      sources.push(source);
      all.set(source.path, source);
    }
    sources.sort((left, right) => left.path.localeCompare(right.path));
    byProbe[probe.id] = {
      sha256: sourceSetSha256(sources),
      files: sources,
    };
  }
  const files = [...all.values()].sort((left, right) => left.path.localeCompare(right.path));
  return {
    runner,
    probes: byProbe,
    sha256: sourceSetSha256(files),
    files,
  };
};

const selectedEnvironment = (names) => Object.fromEntries(names.flatMap((name) => {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? [[name, value]] : [];
}));

const missingEnvironment = [...new Set(probes.flatMap(({ requiredEnvironment }) => requiredEnvironment))]
  .filter((name) => !(typeof process.env[name] === "string" && process.env[name].length > 0));
if (missingEnvironment.length > 0) {
  throw new Error(`required probe environment is missing: ${missingEnvironment.join(", ")}`);
}
if (!process.env.PATH) throw new Error("PATH is required to run exact probe tool commands");

const baseEnvironment = selectedEnvironment(baseEnvironmentNames);
const environmentFor = (probe) => {
  const selectionNames = [...probe.requiredEnvironment, ...probe.optionalEnvironment]
    .filter((name) => typeof process.env[name] === "string" && process.env[name].length > 0);
  const environment = { ...baseEnvironment, ...selectedEnvironment(selectionNames) };
  return {
    environment,
    receipt: {
      required: [...probe.requiredEnvironment],
      optionalForwarded: probe.optionalEnvironment.filter((name) => name in environment),
      forwarded: Object.keys(environment).sort(),
      selectionSha256: sha256(JSON.stringify(selectedEnvironment(selectionNames))),
    },
  };
};

const terminate = (child, signal) => {
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else if (child.pid !== undefined) {
      // Probes may own service or browser descendants. Each probe starts in a
      // fresh process group so a watchdog closes the complete probe topology.
      process.kill(-child.pid, signal);
    }
    return undefined;
  } catch (error) {
    if (error?.code === "ESRCH") return undefined;
    return String(error);
  }
};
const processGroupAlive = (child) => {
  if (process.platform === "win32" || child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
};
const waitForProcessGroupExit = async (child, timeoutMs) => {
  const started = Date.now();
  while (processGroupAlive(child) && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !processGroupAlive(child);
};

const run = (probe, environment) => new Promise((resolve, reject) => {
  const startedAt = new Date().toISOString();
  const startedNs = process.hrtime.bigint();
  const child = spawn(process.execPath, [join(here, "probes", probe.file)], {
    cwd: repositoryRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let stdout = "";
  let stderr = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputOverflow;
  let settled = false;
  let timedOut = false;
  let terminationError;
  let watchdog;
  let killTimer;
  let forceTimer;

  const clearWatchdog = () => {
    clearTimeout(watchdog);
    clearTimeout(killTimer);
    clearTimeout(forceTimer);
  };
  const finish = (action) => {
    if (settled) return;
    settled = true;
    clearWatchdog();
    action();
  };
  const timeoutMessage = (suffix = "") => `${probe.file} exceeded ${probe.timeoutMs}ms watchdog${suffix}`;

  const collect = (stream, chunk) => {
    const bytes = stream === "stdout" ? stdoutBytes += chunk.length : stderrBytes += chunk.length;
    if (bytes > MAX_PROBE_OUTPUT_BYTES) {
      if (outputOverflow === undefined) {
        outputOverflow = `${probe.file} ${stream} exceeded ${MAX_PROBE_OUTPUT_BYTES} bytes`;
        terminationError = terminate(child, "SIGTERM");
        killTimer = setTimeout(() => {
          terminationError ??= terminate(child, "SIGKILL");
        }, WATCHDOG_GRACE_MS);
      }
      return;
    }
    if (stream === "stdout") stdout += chunk.toString("utf8");
    else stderr += chunk.toString("utf8");
  };
  child.stdout.on("data", (chunk) => collect("stdout", chunk));
  child.stderr.on("data", (chunk) => collect("stderr", chunk));
  child.once("error", (error) => {
    finish(() => reject(new Error(`${probe.file} could not start: ${error}`)));
  });
  child.once("close", (code, signal) => {
    void (async () => {
      const descendantsSurvivedLeader = processGroupAlive(child);
      if (descendantsSurvivedLeader) {
        terminationError ??= terminate(child, "SIGTERM");
        if (!await waitForProcessGroupExit(child, WATCHDOG_GRACE_MS)) {
          terminationError ??= terminate(child, "SIGKILL");
          await waitForProcessGroupExit(child, WATCHDOG_GRACE_MS);
        }
      }
      const processGroupRemains = processGroupAlive(child);
      finish(() => {
      if (processGroupRemains) {
        reject(new Error(`${probe.file} left a live process-group descendant after SIGKILL`));
        return;
      }
      if (descendantsSurvivedLeader && !timedOut && outputOverflow === undefined) {
        reject(new Error(`${probe.file} exited while a descendant process remained; the runner reaped its process group`));
        return;
      }
      if (outputOverflow !== undefined) {
        reject(new Error(`${outputOverflow}; code=${code} signal=${signal}`));
        return;
      }
      if (timedOut) {
        const termination = terminationError ? `; termination error: ${terminationError}` : "";
        reject(new Error(`${timeoutMessage(`; code=${code} signal=${signal}${termination}`)}\n${stderr}\n${stdout}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${probe.file} failed code=${code} signal=${signal}\n${stderr}\n${stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new Error("top-level result must be an object");
        }
        if (result.schema !== PROBE_SCHEMA) {
          throw new Error(`schema ${JSON.stringify(result.schema)} does not equal ${PROBE_SCHEMA}`);
        }
        if (result.probe !== probe.expectedProbe) {
          throw new Error(`probe identity ${JSON.stringify(result.probe)} does not equal ${JSON.stringify(probe.expectedProbe)}`);
        }
        if (result.classification !== probe.expectedClassification) {
          throw new Error(`classification ${JSON.stringify(result.classification)} does not equal ${JSON.stringify(probe.expectedClassification)}`);
        }
        if (!result.assertions || typeof result.assertions !== "object" || Array.isArray(result.assertions)) {
          throw new Error("assertions must be an object");
        }
        const expectedAssertionNames = expectedAssertionsById[probe.id];
        const observedAssertionNames = Object.keys(result.assertions);
        if (JSON.stringify(observedAssertionNames) !== JSON.stringify(expectedAssertionNames)) {
          throw new Error(
            `assertion names/order ${JSON.stringify(observedAssertionNames)} do not equal ${JSON.stringify(expectedAssertionNames)}`,
          );
        }
        const failedAssertions = Object.entries(result.assertions)
          .filter(([, value]) => value !== true)
          .map(([name]) => name);
        if (failedAssertions.length > 0) {
          throw new Error(`assertions were not true: ${failedAssertions.join(", ")}`);
        }
        const completedAt = new Date().toISOString();
        const durationMs = Number(process.hrtime.bigint() - startedNs) / 1_000_000;
        resolve({ result, stderr, startedAt, completedAt, durationMs });
      } catch (error) {
        reject(new Error(`${probe.file} returned an invalid probe result: ${error}\n${stdout}\n${stderr}`));
      }
      });
    })().catch((error) => finish(() => reject(error)));
  });

  watchdog = setTimeout(() => {
    timedOut = true;
    terminationError = terminate(child, "SIGTERM");
    killTimer = setTimeout(() => {
      terminationError ??= terminate(child, "SIGKILL");
    }, WATCHDOG_GRACE_MS);
    forceTimer = setTimeout(() => {
      finish(() => reject(new Error(timeoutMessage("; process did not close after SIGKILL"))));
    }, WATCHDOG_GRACE_MS * 3);
  }, probe.timeoutMs);
});

const publish = async (files, runId) => {
  let staging = await mkdtemp(join(here, ".receipts-stage-"));
  const previous = join(here, `.receipts-previous-${runId}`);
  let movedPrevious = false;
  try {
    await Promise.all([...files].map(([name, contents]) => writeFile(join(staging, name), contents, {
      encoding: "utf8",
      flag: "wx",
    })));

    try {
      await rename(receipts, previous);
      movedPrevious = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    try {
      await rename(staging, receipts);
      staging = undefined;
    } catch (publicationError) {
      let rollbackError;
      if (movedPrevious) {
        try {
          await rename(previous, receipts);
          movedPrevious = false;
        } catch (error) {
          rollbackError = error;
        }
      }
      const rollback = rollbackError ? `; rollback failed: ${rollbackError}` : "";
      throw new Error(`receipt cohort publication failed: ${publicationError}${rollback}`);
    }

    if (movedPrevious) {
      try {
        await rm(previous, { recursive: true, force: true });
      } catch (error) {
        console.warn(`new receipt cohort published, but previous cohort cleanup failed: ${error}`);
      }
    }
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true });
  }
};

const lockPath = join(here, ".receipts.lock");
let lockHandle;
try {
  lockHandle = await open(lockPath, "wx");
  await lockHandle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
} catch (error) {
  if (error?.code === "EEXIST") throw new Error(`another receipt producer or stale lock owns ${lockPath}`);
  throw error;
}

try {
const runId = randomUUID();
const startedAt = new Date().toISOString();
const initialSources = await captureSources();
const probeEnvironments = Object.fromEntries(probes.map((probe) => [probe.id, environmentFor(probe)]));
const cohortRecord = {
  schema: COHORT_SCHEMA,
  id: COHORT,
  runId,
  startedAt,
  runner: initialSources.runner,
  sourceSha256: initialSources.sha256,
  sources: initialSources.files,
  probes: probes.map((probe) => ({
    id: probe.id,
    file: repositoryPath(join(here, "probes", probe.file)),
    timeoutMs: probe.timeoutMs,
    sourceSha256: initialSources.probes[probe.id].sha256,
    sources: initialSources.probes[probe.id].files,
    environment: probeEnvironments[probe.id].receipt,
  })),
};
const cohortSha256 = sha256(JSON.stringify(cohortRecord));

// Keep probes sequential so their process and memory observations retain the
// existing isolation semantics, but do not stop the cohort at the first error.
const outcomes = [];
for (const probe of probes) {
  try {
    outcomes.push({
      probe,
      status: "fulfilled",
      observation: await run(probe, probeEnvironments[probe.id].environment),
    });
  } catch (error) {
    outcomes.push({ probe, status: "rejected", error });
  }
}

const failures = outcomes.filter(({ status }) => status === "rejected");
if (failures.length > 0) {
  throw new AggregateError(
    failures.map(({ probe, error }) => new Error(`${probe.id}: ${error}`, { cause: error })),
    `${failures.length} of ${probes.length} probes failed; no receipts were published`,
  );
}

const finalSources = await captureSources();
if (JSON.stringify(finalSources) !== JSON.stringify(initialSources)) {
  throw new Error("probe or runner sources changed during the run; no receipts were published");
}

const receiptFiles = new Map();
const summaryProbes = [];
for (const { probe, observation } of outcomes) {
  const source = initialSources.probes[probe.id];
  const result = {
    ...observation.result,
    run: {
      schema: RUN_SCHEMA,
      cohort: COHORT,
      runId,
      cohortSha256,
      startedAt: observation.startedAt,
      completedAt: observation.completedAt,
      durationMs: observation.durationMs,
      timeoutMs: probe.timeoutMs,
      runner: initialSources.runner,
      sourceSha256: source.sha256,
      sources: source.files,
      environment: probeEnvironments[probe.id].receipt,
    },
  };
  const file = `${probe.id}.json`;
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  receiptFiles.set(file, serialized);
  summaryProbes.push({
    id: probe.id,
    file: repositoryPath(join(here, "probes", probe.file)),
    assertions: result.assertions,
    stderr: observation.stderr.trim(),
    startedAt: observation.startedAt,
    completedAt: observation.completedAt,
    durationMs: observation.durationMs,
    timeoutMs: probe.timeoutMs,
    sourceSha256: source.sha256,
    sources: source.files,
    environment: probeEnvironments[probe.id].receipt,
    receipt: { file, sha256: sha256(serialized) },
  });
}

const completedAt = new Date().toISOString();
const summary = {
  schema: SUMMARY_SCHEMA,
  generatedAt: completedAt,
  completedAt,
  cohort: cohortRecord,
  cohortSha256,
  probes: summaryProbes,
};
receiptFiles.set("summary.json", `${JSON.stringify(summary, null, 2)}\n`);
await publish(receiptFiles, runId);

console.log(JSON.stringify({
  receipts,
  runId,
  cohort: COHORT,
  cohortSha256,
  sourceSha256: initialSources.sha256,
  probes: summaryProbes.map(({ id, assertions, receipt }) => ({ id, assertions, receipt })),
}, null, 2));
} finally {
  await lockHandle.close();
  await rm(lockPath, { force: true });
}
