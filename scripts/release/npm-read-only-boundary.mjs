import { request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";
import { rootCertificates } from "node:tls";

const metadataMaximumBytes = 8 * 1024 * 1024;
const artifactMaximumBytes = 1024 * 1024 * 1024;
const requestInactivityTimeoutMilliseconds = 60_000;
const metadataTotalTimeoutMilliseconds = 60_000;
const artifactTotalTimeoutMilliseconds = 15 * 60_000;

const exactArtifactMaximumBytes = (value) => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > artifactMaximumBytes) {
    throw new Error("anonymous npm artifact byte bound is not canonical");
  }
  return value;
};

const responseHeader = (response, name) => {
  const distinct = response.headersDistinct?.[name];
  if (Array.isArray(distinct) && distinct.length > 1) {
    throw new Error(`anonymous npm response ${name} header is ambiguous`);
  }
  const value = response.headers[name];
  if (value === undefined || typeof value === "string") return value;
  throw new Error(`anonymous npm response ${name} header is ambiguous`);
};

const target = (registry, value) => {
  if (registry !== "https://registry.npmjs.org" || typeof value !== "string" || value.length > 4096) {
    throw new Error("anonymous npm boundary policy is not exact");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("anonymous npm boundary URL is invalid");
  }
  if (
    parsed.origin !== registry
    || parsed.protocol !== "https:"
    || parsed.hostname !== "registry.npmjs.org"
    || parsed.port !== ""
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || parsed.search !== ""
    || parsed.pathname.length <= 1
    || parsed.pathname.includes("//")
    || parsed.pathname.includes("/../")
    || /%(?:2e|2f|5c)/iu.test(parsed.pathname)
    || /[\\\r\n]/u.test(value)
  ) throw new Error("anonymous npm boundary URL is outside the exact registry origin");
  return parsed;
};

const read = ({ parsed, maximumBytes, totalTimeoutMilliseconds, expectedContentType, requestImplementation }) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (operation, error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve(value);
      else {
        operation?.destroy();
        reject(error);
      }
    };
    const deadline = performance.now() + totalTimeoutMilliseconds;
    const remaining = Math.ceil(deadline - performance.now());
    if (!Number.isSafeInteger(remaining) || remaining <= 0) {
      reject(new Error("anonymous npm boundary exceeded its total time bound"));
      return;
    }
    let operation;
    operation = requestImplementation({
      agent: false,
      ca: rootCertificates,
      headers: {
        Accept: expectedContentType === undefined ? "application/octet-stream" : "application/json",
        "User-Agent": "effect-build-anonymous-npm-boundary/1",
      },
      hostname: "registry.npmjs.org",
      joinDuplicateHeaders: false,
      method: "GET",
      minVersion: "TLSv1.2",
      path: parsed.pathname,
      port: 443,
      protocol: "https:",
      rejectUnauthorized: true,
      servername: "registry.npmjs.org",
      timeout: Math.min(requestInactivityTimeoutMilliseconds, remaining),
    }, (response) => {
      try {
        const contentLength = responseHeader(response, "content-length");
        const contentRange = responseHeader(response, "content-range");
        const contentEncoding = responseHeader(response, "content-encoding");
        const location = responseHeader(response, "location");
        if (
          response.statusCode !== 200
          || location !== undefined
          || contentRange !== undefined
          || (contentEncoding !== undefined && contentEncoding !== "identity")
          || (expectedContentType !== undefined
            && !expectedContentType.test(responseHeader(response, "content-type") ?? ""))
        ) {
          response.resume();
          finish(operation, new Error("anonymous npm boundary returned a nonterminal or partial response"));
          return;
        }
        const declaredLength = contentLength === undefined ? undefined : Number(contentLength);
        if (
          declaredLength !== undefined
          && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > maximumBytes)
        ) {
          response.resume();
          finish(operation, new Error("anonymous npm boundary declared an invalid byte length"));
          return;
        }
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.byteLength;
          if (total > maximumBytes) {
            response.destroy();
            finish(operation, new Error("anonymous npm boundary exceeded its byte bound"));
          } else {
            chunks.push(bytes);
          }
        });
        response.on("aborted", () => finish(operation, new Error("anonymous npm boundary was aborted")));
        response.on("error", () => finish(operation, new Error("anonymous npm boundary response failed")));
        response.on("end", () => {
          if (total === 0 || (declaredLength !== undefined && declaredLength !== total)) {
            finish(operation, new Error("anonymous npm boundary was empty or truncated"));
            return;
          }
          finish(operation, undefined, Buffer.concat(chunks, total));
        });
      } catch {
        response.resume();
        finish(operation, new Error("anonymous npm boundary returned ambiguous headers"));
      }
    });
    timer = setTimeout(
      () => finish(operation, new Error("anonymous npm boundary exceeded its total time bound")),
      remaining,
    );
    operation.on("timeout", () => finish(operation, new Error("anonymous npm boundary timed out")));
    operation.on("error", () => finish(operation, new Error("anonymous npm boundary request failed")));
    operation.end();
  });

export const createAnonymousNpmBoundary = ({
  registry,
  requestImplementation = httpsRequest,
}) => {
  if (typeof requestImplementation !== "function") throw new Error("anonymous npm HTTPS capability is absent");
  return Object.freeze({
    readTarball: async (url, maximumBytes) => await read({
      parsed: target(registry, url),
      maximumBytes: exactArtifactMaximumBytes(maximumBytes),
      totalTimeoutMilliseconds: artifactTotalTimeoutMilliseconds,
      requestImplementation,
    }),
    readJson: async (url) => {
      const bytes = await read({
        parsed: target(registry, url),
        maximumBytes: metadataMaximumBytes,
        totalTimeoutMilliseconds: metadataTotalTimeoutMilliseconds,
        expectedContentType: /^application\/(?:json|[^;]+\+json)(?:\s*;|$)/iu,
        requestImplementation,
      });
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw new Error("anonymous npm boundary returned non-JSON metadata");
      }
    },
  });
};
