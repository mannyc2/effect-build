import process from "node:process";

const PROTOCOL = "effect-build-research/bun-transpiler-sidecar@1";
const EXPECTED_BUN = process.env.BUN_EXPECTED_VERSION;
if (!EXPECTED_BUN) throw new Error("BUN_EXPECTED_VERSION is required");
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

type Request = Readonly<{
  id: number;
  protocol: string;
  op: string;
  [key: string]: unknown;
}>;

const transpilers = new Map<string, Bun.Transpiler>();
let input = Buffer.alloc(0);
let shuttingDown = false;
let handshaken = false;

const encode = (value: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  if (body.length === 0 || body.length > MAX_FRAME_BYTES) {
    throw new Error(`response frame length ${body.length} is outside 1..${MAX_FRAME_BYTES}`);
  }
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
};

const reply = (id: number, value: object): void => {
  process.stdout.write(encode({ id, ...value }));
};

const failure = (id: number, code: string, message: string): void => {
  reply(id, { ok: false, error: { code, message } });
};

const dispatch = async (request: Request): Promise<void> => {
  if (!Number.isSafeInteger(request.id)) {
    failure(-1, "INVALID_REQUEST", "request id must be a safe integer");
    return;
  }
  if (request.protocol !== PROTOCOL) {
    failure(request.id, "PROTOCOL_MISMATCH", `expected ${PROTOCOL}`);
    return;
  }
  if (request.op !== "handshake" && !handshaken) {
    failure(request.id, "HANDSHAKE_REQUIRED", "an exact version/capability handshake must succeed before operations");
    return;
  }

  try {
    switch (request.op) {
      case "handshake": {
        const requestedBun = request.bunVersion;
        if (requestedBun !== EXPECTED_BUN || Bun.version !== EXPECTED_BUN) {
          failure(
            request.id,
            "VERSION_MISMATCH",
            `client=${String(requestedBun)} server=${Bun.version} expected=${EXPECTED_BUN}`,
          );
          return;
        }
        handshaken = true;
        reply(request.id, {
          ok: true,
          value: {
            protocol: PROTOCOL,
            bunVersion: Bun.version,
            capabilities: ["create-transpiler", "transform", "scan", "scan-imports", "close"],
            callbackTransport: "unsupported",
          },
        });
        return;
      }
      case "create": {
        if (typeof request.handle !== "string" || request.handle.length === 0) {
          failure(request.id, "INVALID_HANDLE", "handle must be a non-empty string");
          return;
        }
        if (transpilers.has(request.handle)) {
          failure(request.id, "HANDLE_EXISTS", `handle ${request.handle} already exists`);
          return;
        }
        const options = request.options;
        if (options !== undefined && (typeof options !== "object" || options === null || Array.isArray(options))) {
          failure(request.id, "INVALID_OPTIONS", "options must be a JSON object");
          return;
        }
        transpilers.set(request.handle, new Bun.Transpiler(options as Bun.TranspilerOptions | undefined));
        reply(request.id, { ok: true, value: { handle: request.handle } });
        return;
      }
      case "transform": {
        if (typeof request.handle !== "string" || !transpilers.has(request.handle)) {
          failure(request.id, "UNKNOWN_HANDLE", `unknown handle ${String(request.handle)}`);
          return;
        }
        if (typeof request.source !== "string") {
          failure(request.id, "INVALID_SOURCE", "source must be a string");
          return;
        }
        const loader = request.loader;
        if (loader !== undefined && typeof loader !== "string") {
          failure(request.id, "INVALID_LOADER", "loader must be a string");
          return;
        }
        const output = await transpilers.get(request.handle)!.transform(
          request.source,
          loader as Bun.Loader | undefined,
        );
        reply(request.id, { ok: true, value: { output } });
        return;
      }
      case "scan": {
        if (typeof request.handle !== "string" || !transpilers.has(request.handle)) {
          failure(request.id, "UNKNOWN_HANDLE", `unknown handle ${String(request.handle)}`);
          return;
        }
        if (typeof request.source !== "string") {
          failure(request.id, "INVALID_SOURCE", "source must be a string");
          return;
        }
        const value = transpilers.get(request.handle)!.scan(request.source);
        reply(request.id, { ok: true, value });
        return;
      }
      case "scan-imports": {
        if (typeof request.handle !== "string" || !transpilers.has(request.handle)) {
          failure(request.id, "UNKNOWN_HANDLE", `unknown handle ${String(request.handle)}`);
          return;
        }
        if (typeof request.source !== "string") {
          failure(request.id, "INVALID_SOURCE", "source must be a string");
          return;
        }
        const value = transpilers.get(request.handle)!.scanImports(request.source);
        reply(request.id, { ok: true, value });
        return;
      }
      case "close": {
        if (typeof request.handle !== "string" || !transpilers.delete(request.handle)) {
          failure(request.id, "UNKNOWN_HANDLE", `unknown handle ${String(request.handle)}`);
          return;
        }
        reply(request.id, { ok: true, value: { handle: request.handle } });
        return;
      }
      case "build-with-plugin": {
        failure(
          request.id,
          "CALLBACK_TRANSPORT_UNSUPPORTED",
          "Bun.build plugin callbacks are executable host values and are not represented by this JSON protocol",
        );
        return;
      }
      case "sleep": {
        const milliseconds = request.milliseconds;
        if (typeof milliseconds !== "number" || milliseconds < 0 || milliseconds > 30_000) {
          failure(request.id, "INVALID_DURATION", "milliseconds must be between 0 and 30000");
          return;
        }
        await Bun.sleep(milliseconds);
        reply(request.id, { ok: true, value: { milliseconds } });
        return;
      }
      case "shutdown": {
        shuttingDown = true;
        transpilers.clear();
        reply(request.id, { ok: true, value: { handlesReleased: true } });
        setTimeout(() => process.exit(0), 0);
        return;
      }
      default:
        failure(request.id, "UNKNOWN_OPERATION", `unknown operation ${String(request.op)}`);
    }
  } catch (error) {
    failure(
      request.id,
      "PROVIDER_FAILURE",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
};

for await (const chunk of process.stdin) {
  if (shuttingDown) break;
  input = Buffer.concat([input, Buffer.from(chunk)]);
  while (input.length >= 4) {
    const length = input.readUInt32BE(0);
    if (length === 0 || length > MAX_FRAME_BYTES) {
      failure(-1, "INVALID_FRAME", `frame length ${length} is outside 1..${MAX_FRAME_BYTES}`);
      process.exit(64);
    }
    if (input.length < 4 + length) break;
    const body = input.subarray(4, 4 + length);
    input = input.subarray(4 + length);
    try {
      await dispatch(JSON.parse(body.toString("utf8")) as Request);
    } catch (error) {
      failure(-1, "INVALID_JSON", error instanceof Error ? error.message : String(error));
    }
  }
}
