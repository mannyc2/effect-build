import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL = "effect-build-research/bun-transpiler-sidecar@1";
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_SIDECAR_STDERR_BYTES = 64 * 1024;
const EXPECTED_BUN = process.env.BUN_EXPECTED_VERSION;
const EXPECTED_BUN_SHA256 = process.env.BUN_EXPECTED_SHA256;
const here = dirname(fileURLToPath(import.meta.url));
const bun = process.env.BUN_EXE;

if (!bun) throw new Error("BUN_EXE must name an explicitly selected Bun executable");
if (!EXPECTED_BUN) throw new Error("BUN_EXPECTED_VERSION must name the exact version under test");
if (!EXPECTED_BUN_SHA256) throw new Error("BUN_EXPECTED_SHA256 must content-bind the selected Bun executable");
const version = spawnSync(bun, ["--version"], { encoding: "utf8" });
if (version.status !== 0 || version.stdout.trim() !== EXPECTED_BUN) {
  throw new Error(`expected Bun ${EXPECTED_BUN}, observed ${version.stdout.trim() || version.stderr.trim()}`);
}
const bunDigest = createHash("sha256").update(await readFile(bun)).digest("hex");
if (bunDigest !== EXPECTED_BUN_SHA256) {
  throw new Error(`expected Bun SHA-256 ${EXPECTED_BUN_SHA256}, observed ${bunDigest}`);
}

const encode = (value) => {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (body.length === 0 || body.length > MAX_FRAME_BYTES) {
    throw new Error(`request frame length ${body.length} is outside 1..${MAX_FRAME_BYTES}`);
  }
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
};

const startSidecar = async () => {
  const child = spawn(bun, [join(here, "bun-sidecar-server.ts")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  let stderrBytes = 0;
  let stderrOverflow = false;
  child.stderr.on("data", (chunk) => {
    const remaining = MAX_SIDECAR_STDERR_BYTES - stderrBytes;
    if (remaining > 0) stderr += chunk.subarray(0, remaining).toString("utf8");
    stderrBytes += chunk.length;
    if (!stderrOverflow && stderrBytes > MAX_SIDECAR_STDERR_BYTES) {
      stderrOverflow = true;
      stderr += "\n[sidecar stderr exceeded 65536 bytes; terminating]";
      child.kill("SIGTERM");
    }
  });
  let input = Buffer.alloc(0);
  let sequence = 0;
  let writeBackpressureEvents = 0;
  let writeTail = Promise.resolve();
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    input = Buffer.concat([input, Buffer.from(chunk)]);
    while (input.length >= 4) {
      const length = input.readUInt32BE(0);
      if (length === 0 || length > MAX_FRAME_BYTES) {
        const error = new Error(`response frame length ${length} is outside 1..${MAX_FRAME_BYTES}`);
        for (const waiter of pending.values()) waiter.reject(error);
        pending.clear();
        child.kill("SIGTERM");
        return;
      }
      if (input.length < length + 4) break;
      const body = input.subarray(4, length + 4);
      input = input.subarray(length + 4);
      const response = JSON.parse(body.toString("utf8"));
      const waiter = pending.get(response.id);
      if (waiter) {
        pending.delete(response.id);
        waiter.resolve(response);
      }
    }
  });
  child.once("exit", (code, signal) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`sidecar exited code=${code} signal=${signal} stderr=${stderr}`));
    }
    pending.clear();
  });
  const call = async (op, fields = {}) => {
    const id = ++sequence;
    const request = { id, protocol: PROTOCOL, op, ...fields };
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    const frame = encode(request);
    writeTail = writeTail.then(async () => {
      if (!child.stdin.write(frame)) {
        writeBackpressureEvents += 1;
        await once(child.stdin, "drain");
      }
    });
    await writeTail;
    return promise;
  };
  return { child, call, stderr: () => stderr, writeBackpressureEvents: () => writeBackpressureEvents };
};

const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const psRssKiB = (pid) => {
  const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? Number(result.stdout.trim()) : null;
};
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const skewedSidecar = await startSidecar();
const operationBeforeHandshake = await skewedSidecar.call("create", {
  handle: "must-not-exist",
  options: { loader: "ts" },
});
const mismatch = await skewedSidecar.call("handshake", { bunVersion: "1.3.13" });
const operationAfterMismatch = await skewedSidecar.call("create", {
  handle: "still-must-not-exist",
  options: { loader: "ts" },
});
skewedSidecar.child.kill("SIGTERM");
await once(skewedSidecar.child, "exit");
const skewedRemnant = isAlive(skewedSidecar.child.pid);

const started = process.hrtime.bigint();
const sidecar = await startSidecar();
const handshake = await sidecar.call("handshake", { bunVersion: EXPECTED_BUN });
const coldHandshakeMs = elapsedMs(started);
const created = await sidecar.call("create", {
  handle: "typescript",
  options: { loader: "ts", target: "bun", trimUnusedImports: true },
});
const transform = await sidecar.call("transform", {
  handle: "typescript",
  source: "const value: number = 41 + 1; export default value;",
  loader: "ts",
});
const parseFailure = await sidecar.call("transform", {
  handle: "typescript",
  source: "export const = ;",
  loader: "ts",
});
const recovery = await sidecar.call("scan", {
  handle: "typescript",
  source: 'import type { A } from "a"; export const ok = 1;',
});

const warmDurationsMs = [];
for (let index = 0; index < 20; index += 1) {
  const start = process.hrtime.bigint();
  const response = await sidecar.call("transform", {
    handle: "typescript",
    source: `export const value${index}: number = ${index};`,
    loader: "ts",
  });
  if (!response.ok) throw new Error(`warm transform ${index} failed`);
  warmDurationsMs.push(elapsedMs(start));
}

const largeSource = `export const payload = ${JSON.stringify("x".repeat(1024 * 1024))};`;
const largeStart = process.hrtime.bigint();
const large = await sidecar.call("transform", {
  handle: "typescript",
  source: largeSource,
  loader: "ts",
});
const largeRoundTripMs = elapsedMs(largeStart);

const pipelined = await Promise.all(Array.from({ length: 16 }, (_, index) => sidecar.call("scan-imports", {
  handle: "typescript",
  source: `import value${index} from "module-${index}"; export { value${index} };`,
})));

const callback = () => "cannot-cross-json";
const serializedCallbackRequest = JSON.stringify({ op: "build-with-plugin", plugin: { callback } });
const callbackBoundary = await sidecar.call("build-with-plugin", {
  plugin: JSON.parse(serializedCallbackRequest).plugin,
});

const closed = await sidecar.call("close", { handle: "typescript" });
const staleHandle = await sidecar.call("scan", { handle: "typescript", source: "export {}" });
const rssKiB = psRssKiB(sidecar.child.pid);
const shutdown = await sidecar.call("shutdown");
await once(sidecar.child, "exit");
const gracefulRemnant = isAlive(sidecar.child.pid);

const crashSidecar = await startSidecar();
await crashSidecar.call("handshake", { bunVersion: EXPECTED_BUN });
const sleeping = crashSidecar.call("sleep", { milliseconds: 30_000 }).catch((error) => ({ error: error.message }));
const killStart = process.hrtime.bigint();
crashSidecar.child.kill("SIGTERM");
await once(crashSidecar.child, "exit");
await sleeping;
const forcedStopMs = elapsedMs(killStart);
const crashRemnant = isAlive(crashSidecar.child.pid);

const pluginRun = spawnSync(bun, [join(here, "bun-direct-plugin.ts")], { encoding: "utf8" });
if (pluginRun.status !== 0) throw new Error(`direct Bun plugin probe failed: ${pluginRun.stderr}`);
const directPlugin = JSON.parse(pluginRun.stdout.trim().split("\n").at(-1));

const serverDigest = spawnSync("shasum", ["-a", "256", join(here, "bun-sidecar-server.ts")], { encoding: "utf8" })
  .stdout.trim().split(/\s+/)[0];

const assertions = {
  exactVersionAndContentHandshake: handshake.ok === true
    && handshake.value.bunVersion === EXPECTED_BUN
    && handshake.value.protocol === PROTOCOL
    && JSON.stringify(handshake.value.capabilities)
      === JSON.stringify(["create-transpiler", "transform", "scan", "scan-imports", "close"])
    && handshake.value.callbackTransport === "unsupported"
    && bunDigest === EXPECTED_BUN_SHA256,
  mismatchFailsClosed: operationBeforeHandshake.ok === false
    && operationBeforeHandshake.error.code === "HANDSHAKE_REQUIRED"
    && mismatch.ok === false
    && mismatch.error.code === "VERSION_MISMATCH"
    && operationAfterMismatch.ok === false
    && operationAfterMismatch.error.code === "HANDSHAKE_REQUIRED"
    && skewedRemnant === false,
  reusableHandleWorks: created.ok === true
    && transform.ok === true
    && transform.value.output.includes("export default value"),
  providerFailureStructured: parseFailure.ok === false && parseFailure.error.code === "PROVIDER_FAILURE",
  sessionRecoversAfterFailure: recovery.ok === true && recovery.value.exports.some((item) => item === "ok"),
  largeFrameRoundTrip: large.ok === true
    && large.value.output.length > 1024 * 1024
    && Buffer.byteLength(JSON.stringify(large), "utf8") < MAX_FRAME_BYTES,
  pipelinedCorrelation: pipelined.length === 16 && pipelined.every((item, index) => item.ok === true
    && item.value.length === 1
    && item.value[0].path === `module-${index}`),
  transportBackpressureObserved: sidecar.writeBackpressureEvents() > 0,
  callbackLostByJson: !serializedCallbackRequest.includes("callback"),
  callbackBoundaryFailsClosed: callbackBoundary.ok === false && callbackBoundary.error.code === "CALLBACK_TRANSPORT_UNSUPPORTED",
  directHostCallbackWorks: directPlugin.success === true && directPlugin.resolveCalls === 1 && directPlugin.loadCalls === 1,
  staleHandleRejected: closed.ok === true && staleHandle.ok === false && staleHandle.error.code === "UNKNOWN_HANDLE",
  gracefulShutdownNoRemnant: shutdown.ok === true && gracefulRemnant === false,
  forcedStopNoRemnant: crashRemnant === false && forcedStopMs < 2_000,
};
if (Object.values(assertions).some((value) => value !== true)) {
  throw new Error(`Bun sidecar conclusion failure: ${JSON.stringify(assertions)}`);
}

console.log(JSON.stringify({
  schema: "effect-build/interface-mechanism-probe@1",
  probe: "bun-transpiler-sidecar",
  classification: "research-prototype-not-product-code",
  executable: basename(bun),
  bunVersion: EXPECTED_BUN,
  bunSha256: bunDigest,
  serverSha256: serverDigest,
  protocol: PROTOCOL,
  assertions,
  observations: {
    coldHandshakeMs,
    warmTransformMs: {
      minimum: Math.min(...warmDurationsMs),
      median: [...warmDurationsMs].sort((a, b) => a - b)[Math.floor(warmDurationsMs.length / 2)],
      maximum: Math.max(...warmDurationsMs),
    },
    largeRoundTripMs,
    transportBackpressureEvents: sidecar.writeBackpressureEvents(),
    rssKiB,
    forcedStopMs,
    directPlugin,
    callbackSerializedAs: serializedCallbackRequest,
  },
}, null, 2));
