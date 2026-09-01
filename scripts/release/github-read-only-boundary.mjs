import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

const exactKeys = (value, expected, label) => {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) throw new Error(`${label} has missing or additional fields`);
  return value;
};

const responseHeader = (response, name) => {
  const distinct = response.headersDistinct?.[name];
  if (Array.isArray(distinct) && distinct.length > 1) {
    throw new Error(`GitHub response ${name} header is ambiguous`);
  }
  const value = response.headers[name];
  if (value === undefined || typeof value === "string") return value;
  throw new Error(`GitHub response ${name} header is ambiguous`);
};

const validateRepository = (repository) => {
  if (
    typeof repository !== "string"
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)
    || repository.includes("..")
  ) throw new Error("GitHub repository identity is not canonical");
  return repository;
};

const validateToken = (token) => {
  if (typeof token !== "string" || token.length === 0 || /[\r\n]/u.test(token)) {
    throw new Error("GitHub read-only token is absent or malformed");
  }
  return token;
};

const validateArtifactMaximumBytes = (value, transport, label) => {
  if (
    !Number.isSafeInteger(value)
    || value <= 0
    || value > transport.artifactMaximumBytes
  ) throw new Error(`${label} byte bound is not canonical`);
  return value;
};

const validateTransport = (transport) => {
  exactKeys(transport, [
    "apiOrigin",
    "apiVersion",
    "artifactRedirectHostPolicy",
    "releaseAssetRedirectHostPolicy",
    "metadataMaximumBytes",
    "artifactMaximumBytes",
    "requestInactivityTimeoutMilliseconds",
    "metadataTotalTimeoutMilliseconds",
    "artifactTotalTimeoutMilliseconds",
    "authorization",
    "tlsRootPolicy",
    "ambientConfiguration",
  ], "GitHub read-only transport policy");
  exactKeys(
    transport.artifactRedirectHostPolicy,
    ["suffixes", "match", "redirectStatuses", "maximumRedirects"],
    "GitHub artifact redirect-host policy",
  );
  exactKeys(
    transport.releaseAssetRedirectHostPolicy,
    ["hosts", "match", "directStatuses", "redirectStatuses", "maximumRedirects"],
    "GitHub Release-asset redirect-host policy",
  );
  if (
    transport.apiOrigin !== "https://api.github.com"
    || transport.apiVersion !== "2022-11-28"
    || JSON.stringify(transport.artifactRedirectHostPolicy) !== JSON.stringify({
      suffixes: ["blob.core.windows.net"],
      match: "dot-subdomain-only",
      redirectStatuses: [302],
      maximumRedirects: 1,
    })
    || JSON.stringify(transport.releaseAssetRedirectHostPolicy) !== JSON.stringify({
      hosts: ["release-assets.githubusercontent.com"],
      match: "exact",
      directStatuses: [200],
      redirectStatuses: [302],
      maximumRedirects: 1,
    })
    || transport.metadataMaximumBytes !== 8 * 1024 * 1024
    || transport.artifactMaximumBytes !== 1024 * 1024 * 1024
    || transport.requestInactivityTimeoutMilliseconds !== 60_000
    || transport.metadataTotalTimeoutMilliseconds !== 60_000
    || transport.artifactTotalTimeoutMilliseconds !== 15 * 60_000
    || transport.authorization !== "api-origin-first-request-only-stripped-before-redirect"
    || transport.tlsRootPolicy !== "node-bundled-root-certificates-only"
    || transport.ambientConfiguration !== "forbidden-home-gh-config-proxy-and-extra-ca"
  ) throw new Error("GitHub read-only transport policy is not the canonical hard cut");
  return transport;
};

const validateEndpoint = (repository, endpoint) => {
  const [route, query, ...additional] = typeof endpoint === "string" ? endpoint.split("?") : [];
  if (
    typeof endpoint !== "string"
    || endpoint.length === 0
    || endpoint.length > 4096
    || typeof route !== "string"
    || (route !== `repos/${repository}` && !route.startsWith(`repos/${repository}/`))
    || !/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)?$/u.test(route)
    || route.includes("//")
    || route.includes("/../")
    || route.endsWith("/..")
    || /%(?:2e|2f|5c)/iu.test(route)
    || additional.length !== 0
  ) throw new Error("GitHub endpoint is not one exact repository-scoped route");
  if (query !== undefined) {
    if (
      query.length === 0
      || !/^[A-Za-z0-9._~%=&-]+$/u.test(query)
      || query.includes("&&")
    ) throw new Error("GitHub endpoint query is not canonical");
    const parameters = new URLSearchParams(query);
    const names = [...parameters.keys()];
    if (
      names.length === 0
      || new Set(names).size !== names.length
      || [...parameters].some(([name, value]) =>
        !/^[a-z][a-z0-9_]*$/u.test(name)
        || value.length === 0
        || !/^[A-Za-z0-9._~-]+$/u.test(value)
      )
      || parameters.toString() !== query
    ) throw new Error("GitHub endpoint query is not canonical");
  }
  return `/${endpoint}`;
};

const validateRedirect = (location, hostPolicy) => {
  if (typeof location !== "string" || location.length === 0 || location.length > 16_384) {
    throw new Error("GitHub download redirect is absent or oversized");
  }
  let parsed;
  try {
    parsed = new URL(location);
  } catch {
    throw new Error("GitHub download redirect is not an absolute URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.port !== ""
    || parsed.hash !== ""
    || parsed.hostname.length === 0
    || parsed.hostname.endsWith(".")
    || !/^[a-z0-9.-]+$/u.test(parsed.hostname)
  ) throw new Error("GitHub download redirect is not canonical HTTPS");
  const allowed = hostPolicy.match === "dot-subdomain-only"
    ? hostPolicy.suffixes.some((suffix) => parsed.hostname.endsWith(`.${suffix}`))
    : hostPolicy.hosts.includes(parsed.hostname);
  if (!allowed) throw new Error("GitHub download redirect host is outside the closed allowlist");
  return parsed;
};

const createTotalDeadline = (timeoutMilliseconds, label) => {
  let expired = false;
  const listeners = new Set();
  const timer = setTimeout(() => {
    expired = true;
    for (const listener of listeners) listener();
    listeners.clear();
  }, timeoutMilliseconds);
  return Object.freeze({
    close: () => {
      clearTimeout(timer);
      listeners.clear();
    },
    subscribe: (listener) => {
      if (expired) {
        queueMicrotask(listener);
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    error: () => new Error(`${label} exceeded its total time bound`),
  });
};

const requestOptions = ({ parsed, headers, requestInactivityTimeoutMilliseconds }) => ({
  agent: false,
  ca: rootCertificates,
  headers,
  hostname: parsed.hostname,
  joinDuplicateHeaders: false,
  method: "GET",
  minVersion: "TLSv1.2",
  path: `${parsed.pathname}${parsed.search}`,
  port: 443,
  protocol: "https:",
  rejectUnauthorized: true,
  servername: parsed.hostname,
  timeout: requestInactivityTimeoutMilliseconds,
});

const readResponse = ({
  requestImplementation,
  parsed,
  headers,
  requestInactivityTimeoutMilliseconds,
  deadline,
  maximumBytes,
  expectedStatus,
  expectedContentType,
  label,
}) => new Promise((resolve, reject) => {
  let settled = false;
  let unsubscribe = () => {};
  const finish = (operation, error, bytes) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    if (error === undefined) resolve(bytes);
    else {
      operation?.destroy();
      reject(error);
    }
  };
  let operation;
  operation = requestImplementation(
    requestOptions({ parsed, headers, requestInactivityTimeoutMilliseconds }),
    (response) => {
      try {
        const contentLength = responseHeader(response, "content-length");
        const contentRange = responseHeader(response, "content-range");
        const contentEncoding = responseHeader(response, "content-encoding");
        const location = responseHeader(response, "location");
        if (
          response.statusCode !== expectedStatus
          || location !== undefined
          || contentRange !== undefined
          || (contentEncoding !== undefined && contentEncoding !== "identity")
        ) {
          response.resume();
          finish(operation, new Error(`${label} returned a nonterminal or partial response`));
          return;
        }
        if (
          expectedContentType !== undefined
          && !expectedContentType.test(responseHeader(response, "content-type") ?? "")
        ) {
          response.resume();
          finish(operation, new Error(`${label} returned an unexpected media type`));
          return;
        }
        const declaredLength = contentLength === undefined ? undefined : Number(contentLength);
        if (
          declaredLength !== undefined
          && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > maximumBytes)
        ) {
          response.resume();
          finish(operation, new Error(`${label} declared an invalid byte length`));
          return;
        }
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.byteLength;
          if (total > maximumBytes) {
            response.destroy();
            finish(operation, new Error(`${label} exceeded its byte bound`));
          } else {
            chunks.push(bytes);
          }
        });
        response.on("aborted", () => finish(operation, new Error(`${label} was aborted`)));
        response.on("error", () => finish(operation, new Error(`${label} response failed`)));
        response.on("end", () => {
          if (total === 0 || (declaredLength !== undefined && declaredLength !== total)) {
            finish(operation, new Error(`${label} was empty or truncated`));
            return;
          }
          finish(operation, undefined, Buffer.concat(chunks, total));
        });
      } catch {
        response.resume();
        finish(operation, new Error(`${label} returned ambiguous headers`));
      }
    },
  );
  if (!settled) unsubscribe = deadline.subscribe(() => finish(operation, deadline.error()));
  operation.on("timeout", () => finish(operation, new Error(`${label} timed out`)));
  operation.on("error", () => finish(operation, new Error(`${label} request failed`)));
  operation.end();
});

const readRedirect = ({
  requestImplementation,
  parsed,
  headers,
  requestInactivityTimeoutMilliseconds,
  deadline,
  redirectStatuses,
  label,
}) => new Promise((resolve, reject) => {
  let settled = false;
  let unsubscribe = () => {};
  const finish = (operation, error, location) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    if (error === undefined) resolve(location);
    else {
      operation?.destroy();
      reject(error);
    }
  };
  let operation;
  operation = requestImplementation(
    requestOptions({ parsed, headers, requestInactivityTimeoutMilliseconds }),
    (response) => {
      try {
        const location = responseHeader(response, "location");
        if (!redirectStatuses.includes(response.statusCode) || typeof location !== "string") {
          response.resume();
          finish(operation, new Error(`${label} did not return exactly one allowed redirect`));
          return;
        }
        let total = 0;
        response.on("data", (chunk) => {
          total += Buffer.byteLength(chunk);
          if (total > 64 * 1024) {
            response.destroy();
            finish(operation, new Error(`${label} redirect response exceeded its byte bound`));
          }
        });
        response.on("aborted", () => finish(operation, new Error(`${label} redirect was aborted`)));
        response.on("error", () => finish(operation, new Error(`${label} redirect failed`)));
        response.on("end", () => finish(operation, undefined, location));
      } catch {
        response.resume();
        finish(operation, new Error(`${label} returned ambiguous redirect headers`));
      }
    },
  );
  if (!settled) unsubscribe = deadline.subscribe(() => finish(operation, deadline.error()));
  operation.on("timeout", () => finish(operation, new Error(`${label} redirect timed out`)));
  operation.on("error", () => finish(operation, new Error(`${label} redirect request failed`)));
  operation.end();
});

const readDirectOrRedirect = ({
  requestImplementation,
  parsed,
  headers,
  requestInactivityTimeoutMilliseconds,
  deadline,
  maximumBytes,
  directStatuses,
  redirectStatuses,
  label,
}) => new Promise((resolve, reject) => {
  let settled = false;
  let unsubscribe = () => {};
  const finish = (operation, error, value) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    if (error === undefined) resolve(value);
    else {
      operation?.destroy();
      reject(error);
    }
  };
  let operation;
  operation = requestImplementation(
    requestOptions({ parsed, headers, requestInactivityTimeoutMilliseconds }),
    (response) => {
      try {
        const location = responseHeader(response, "location");
        if (directStatuses.includes(response.statusCode)) {
          const contentLength = responseHeader(response, "content-length");
          const contentRange = responseHeader(response, "content-range");
          const contentEncoding = responseHeader(response, "content-encoding");
          if (
            location !== undefined
            || contentRange !== undefined
            || (contentEncoding !== undefined && contentEncoding !== "identity")
          ) {
            response.resume();
            finish(operation, new Error(`${label} returned a nonterminal or partial direct response`));
            return;
          }
          const declaredLength = contentLength === undefined ? undefined : Number(contentLength);
          if (
            declaredLength !== undefined
            && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > maximumBytes)
          ) {
            response.resume();
            finish(operation, new Error(`${label} declared an invalid direct byte length`));
            return;
          }
          const chunks = [];
          let total = 0;
          response.on("data", (chunk) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += bytes.byteLength;
            if (total > maximumBytes) {
              response.destroy();
              finish(operation, new Error(`${label} direct response exceeded its byte bound`));
            } else {
              chunks.push(bytes);
            }
          });
          response.on("aborted", () => finish(operation, new Error(`${label} direct response was aborted`)));
          response.on("error", () => finish(operation, new Error(`${label} direct response failed`)));
          response.on("end", () => {
            if (total === 0 || (declaredLength !== undefined && declaredLength !== total)) {
              finish(operation, new Error(`${label} direct response was empty or truncated`));
              return;
            }
            finish(operation, undefined, { kind: "bytes", value: Buffer.concat(chunks, total) });
          });
          return;
        }
        if (!redirectStatuses.includes(response.statusCode) || typeof location !== "string") {
          response.resume();
          finish(operation, new Error(`${label} returned neither an allowed direct response nor one redirect`));
          return;
        }
        let total = 0;
        response.on("data", (chunk) => {
          total += Buffer.byteLength(chunk);
          if (total > 64 * 1024) {
            response.destroy();
            finish(operation, new Error(`${label} redirect response exceeded its byte bound`));
          }
        });
        response.on("aborted", () => finish(operation, new Error(`${label} redirect was aborted`)));
        response.on("error", () => finish(operation, new Error(`${label} redirect failed`)));
        response.on("end", () => finish(operation, undefined, { kind: "redirect", value: location }));
      } catch {
        response.resume();
        finish(operation, new Error(`${label} returned ambiguous direct-or-redirect headers`));
      }
    },
  );
  if (!settled) unsubscribe = deadline.subscribe(() => finish(operation, deadline.error()));
  operation.on("timeout", () => finish(operation, new Error(`${label} direct-or-redirect request timed out`)));
  operation.on("error", () => finish(operation, new Error(`${label} direct-or-redirect request failed`)));
  operation.end();
});

export const createGitHubReadOnlyBoundary = ({
  repository,
  token,
  transport,
  requestImplementation = httpsRequest,
}) => {
  const exactRepository = validateRepository(repository);
  const exactToken = validateToken(token);
  const exactTransport = validateTransport(transport);
  if (typeof requestImplementation !== "function") throw new Error("GitHub HTTPS capability is absent");
  const apiOrigin = new URL(exactTransport.apiOrigin);
  const apiHeaders = (accept) => Object.freeze({
    Accept: accept,
    Authorization: `Bearer ${exactToken}`,
    "User-Agent": "effect-build-read-only-release-boundary/1",
    "X-GitHub-Api-Version": exactTransport.apiVersion,
  });
  const readJson = async (endpoint) => {
    const deadline = createTotalDeadline(
      exactTransport.metadataTotalTimeoutMilliseconds,
      "GitHub metadata boundary",
    );
    let bytes;
    try {
      bytes = await readResponse({
        requestImplementation,
        parsed: new URL(validateEndpoint(exactRepository, endpoint), apiOrigin),
        headers: apiHeaders("application/vnd.github+json"),
        requestInactivityTimeoutMilliseconds: exactTransport.requestInactivityTimeoutMilliseconds,
        deadline,
        maximumBytes: exactTransport.metadataMaximumBytes,
        expectedStatus: 200,
        expectedContentType: /^application\/(?:json|[^;]+\+json)(?:\s*;|$)/iu,
        label: "GitHub metadata boundary",
      });
    } finally {
      deadline.close();
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("GitHub metadata boundary returned non-JSON bytes");
    }
  };
  const readRedirectedBytes = async ({ endpoint, accept, hostPolicy, label, maximumBytes }) => {
    const deadline = createTotalDeadline(exactTransport.artifactTotalTimeoutMilliseconds, label);
    try {
      const location = await readRedirect({
        requestImplementation,
        parsed: new URL(validateEndpoint(exactRepository, endpoint), apiOrigin),
        headers: apiHeaders(accept),
        requestInactivityTimeoutMilliseconds: exactTransport.requestInactivityTimeoutMilliseconds,
        deadline,
        redirectStatuses: hostPolicy.redirectStatuses,
        label,
      });
      const redirected = validateRedirect(location, hostPolicy);
      return await readResponse({
        requestImplementation,
        parsed: redirected,
        headers: Object.freeze({
          Accept: "application/octet-stream",
          "User-Agent": "effect-build-read-only-release-boundary/1",
        }),
        requestInactivityTimeoutMilliseconds: exactTransport.requestInactivityTimeoutMilliseconds,
        deadline,
        maximumBytes,
        expectedStatus: 200,
        label,
      });
    } finally {
      deadline.close();
    }
  };
  const readReleaseAsset = async (endpoint, maximumBytes) => {
    const policy = exactTransport.releaseAssetRedirectHostPolicy;
    const label = "GitHub Release-asset boundary";
    const exactMaximumBytes = validateArtifactMaximumBytes(maximumBytes, exactTransport, label);
    const deadline = createTotalDeadline(exactTransport.artifactTotalTimeoutMilliseconds, label);
    try {
      const initial = await readDirectOrRedirect({
        requestImplementation,
        parsed: new URL(validateEndpoint(exactRepository, endpoint), apiOrigin),
        headers: apiHeaders("application/octet-stream"),
        requestInactivityTimeoutMilliseconds: exactTransport.requestInactivityTimeoutMilliseconds,
        deadline,
        maximumBytes: exactMaximumBytes,
        directStatuses: policy.directStatuses,
        redirectStatuses: policy.redirectStatuses,
        label,
      });
      if (initial.kind === "bytes") return initial.value;
      const redirected = validateRedirect(initial.value, policy);
      return await readResponse({
        requestImplementation,
        parsed: redirected,
        headers: Object.freeze({
          Accept: "application/octet-stream",
          "User-Agent": "effect-build-read-only-release-boundary/1",
        }),
        requestInactivityTimeoutMilliseconds: exactTransport.requestInactivityTimeoutMilliseconds,
        deadline,
        maximumBytes: exactMaximumBytes,
        expectedStatus: 200,
        label,
      });
    } finally {
      deadline.close();
    }
  };
  return Object.freeze({
    readJson,
    readArtifactZip: async (endpoint, maximumBytes) => await readRedirectedBytes({
      endpoint,
      accept: "application/vnd.github+json",
      hostPolicy: exactTransport.artifactRedirectHostPolicy,
      label: "GitHub artifact boundary",
      maximumBytes: validateArtifactMaximumBytes(
        maximumBytes,
        exactTransport,
        "GitHub artifact boundary",
      ),
    }),
    readReleaseAsset,
  });
};
