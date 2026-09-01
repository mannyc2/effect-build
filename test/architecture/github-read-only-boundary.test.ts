import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { rootCertificates } from "node:tls";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The sealed GitHub boundary is an intentionally unprotected Node script module.
import { createGitHubReadOnlyBoundary } from "../../scripts/release/github-read-only-boundary.mjs";

const transport = {
  apiOrigin: "https://api.github.com",
  apiVersion: "2022-11-28",
  artifactRedirectHostPolicy: {
    suffixes: ["blob.core.windows.net"],
    match: "dot-subdomain-only",
    redirectStatuses: [302],
    maximumRedirects: 1,
  },
  releaseAssetRedirectHostPolicy: {
    hosts: ["release-assets.githubusercontent.com"],
    match: "exact",
    directStatuses: [200],
    redirectStatuses: [302],
    maximumRedirects: 1,
  },
  metadataMaximumBytes: 8 * 1024 * 1024,
  artifactMaximumBytes: 1024 * 1024 * 1024,
  requestInactivityTimeoutMilliseconds: 60_000,
  metadataTotalTimeoutMilliseconds: 60_000,
  artifactTotalTimeoutMilliseconds: 15 * 60_000,
  authorization: "api-origin-first-request-only-stripped-before-redirect",
  tlsRootPolicy: "node-bundled-root-certificates-only",
  ambientConfiguration: "forbidden-home-gh-config-proxy-and-extra-ca",
} as const;
const zipMaximumBytes = 64 * 1024 * 1024;

type ResponseStep = {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string | readonly string[]>>;
  readonly chunks?: ReadonlyArray<string | Buffer>;
  readonly timeout?: boolean;
};

const fakeHttps = (steps: ReadonlyArray<ResponseStep>) => {
  const requests: Array<Record<string, unknown>> = [];
  let index = 0;
  const request = vi.fn((options: Record<string, unknown>, callback: (response: Readable) => void) => {
    const operation = new EventEmitter() as EventEmitter & {
      destroy: ReturnType<typeof vi.fn>;
      end: () => void;
    };
    operation.destroy = vi.fn();
    operation.end = () => {
      queueMicrotask(() => {
        const step = steps[index++];
        if (step === undefined) {
          operation.emit("error", new Error("unexpected request"));
          return;
        }
        requests.push(options);
        if (step.timeout === true) {
          operation.emit("timeout");
          return;
        }
        const response = Readable.from(step.chunks ?? []);
        Object.assign(response, {
          statusCode: step.status ?? 200,
          headers: step.headers ?? {},
          headersDistinct: Object.fromEntries(
            Object.entries(step.headers ?? {}).map(([name, value]) => [
              name,
              Array.isArray(value) ? value : [value],
            ]),
          ),
        });
        callback(response);
      });
    };
    return operation;
  });
  return { request, requests };
};

const boundary = (requestImplementation: ReturnType<typeof fakeHttps>["request"]) =>
  createGitHubReadOnlyBoundary({
    repository: "mannyc2/effect-build",
    token: "test-only-token",
    transport,
    requestImplementation,
  });

describe("pinned GitHub read-only HTTPS boundary", () => {
  it("uses only the exact API origin, bundled roots, and explicit in-memory authorization", async () => {
    const fake = fakeHttps([{
      headers: {
        "content-length": "11",
        "content-type": "application/json; charset=utf-8",
      },
      chunks: [Buffer.from('{"ok":true}')],
    }]);
    const original = {
      HOME: process.env.HOME,
      GH_CONFIG_DIR: process.env.GH_CONFIG_DIR,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
    };
    Object.assign(process.env, {
      HOME: "/hostile/home",
      GH_CONFIG_DIR: "/hostile/gh",
      HTTPS_PROXY: "https://attacker.invalid:4443",
      NODE_EXTRA_CA_CERTS: "/hostile/ca.pem",
    });
    try {
      await expect(boundary(fake.request).readJson("repos/mannyc2/effect-build")).resolves.toEqual({ ok: true });
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      agent: false,
      ca: rootCertificates,
      hostname: "api.github.com",
      method: "GET",
      path: "/repos/mannyc2/effect-build",
      port: 443,
      protocol: "https:",
      rejectUnauthorized: true,
      servername: "api.github.com",
      timeout: 60_000,
    });
    expect(fake.requests[0]?.headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer test-only-token",
      "User-Agent": "effect-build-read-only-release-boundary/1",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    expect(JSON.stringify(fake.requests[0])).not.toContain("hostile");
  });

  it("follows exactly one artifact redirect to a dot-subdomain and strips every credential", async () => {
    const fake = fakeHttps([
      {
        status: 302,
        headers: { location: "https://productionresultssa1.blob.core.windows.net/actions-results/a.zip?sig=x" },
      },
      {
        headers: { "content-length": "3", "content-type": "application/zip" },
        chunks: [Buffer.from("zip")],
      },
    ]);
    await expect(
      boundary(fake.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).resolves.toEqual(Buffer.from("zip"));
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]).toMatchObject({
      hostname: "productionresultssa1.blob.core.windows.net",
      path: "/actions-results/a.zip?sig=x",
      port: 443,
      servername: "productionresultssa1.blob.core.windows.net",
    });
    expect(fake.requests[1]?.headers).toEqual({
      Accept: "application/octet-stream",
      "User-Agent": "effect-build-read-only-release-boundary/1",
    });
    expect(JSON.stringify(fake.requests[1])).not.toContain("test-only-token");
    expect(JSON.stringify(fake.requests[1])).not.toMatch(/authorization|cookie/iu);
  });

  it("admits only the exact Release asset host for Release bytes", async () => {
    const fake = fakeHttps([
      {
        status: 302,
        headers: { location: "https://release-assets.githubusercontent.com/github-production-release-asset/file?sp=r" },
      },
      {
        headers: { "content-length": "5" },
        chunks: [Buffer.from("asset")],
      },
    ]);
    await expect(
      boundary(fake.request).readReleaseAsset("repos/mannyc2/effect-build/releases/assets/2", 5),
    ).resolves.toEqual(Buffer.from("asset"));
    expect(fake.requests[1]?.hostname).toBe("release-assets.githubusercontent.com");
  });

  it("admits GitHub's documented direct 200 Release-asset response without a second request", async () => {
    const fake = fakeHttps([{
      status: 200,
      headers: { "content-length": "5", "content-type": "application/octet-stream" },
      chunks: [Buffer.from("asset")],
    }]);
    await expect(
      boundary(fake.request).readReleaseAsset("repos/mannyc2/effect-build/releases/assets/2", 5),
    ).resolves.toEqual(Buffer.from("asset"));
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.hostname).toBe("api.github.com");
    expect(fake.requests[0]?.headers).toMatchObject({
      Authorization: "Bearer test-only-token",
    });
  });

  it.each([
    "https://blob.core.windows.net/container/file",
    "https://evilblob.core.windows.net/container/file",
    "https://production.blob.core.windows.net.attacker.invalid/container/file",
    "https://results-receiver.actions.githubusercontent.com/file",
    "https://release-assets.githubusercontent.com.attacker.invalid/file",
    "https://user:password@production.blob.core.windows.net/file",
    "https://production.blob.core.windows.net:4443/file",
    "http://production.blob.core.windows.net/file",
  ])("rejects a hostile artifact redirect: %s", async (location) => {
    const fake = fakeHttps([{ status: 302, headers: { location } }]);
    await expect(
      boundary(fake.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).rejects.toThrow();
    expect(fake.requests).toHaveLength(1);
  });

  it("rejects a direct download response and any second redirect", async () => {
    const direct = fakeHttps([{
      status: 200,
      headers: { "content-length": "3" },
      chunks: [Buffer.from("zip")],
    }]);
    await expect(
      boundary(direct.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).rejects.toThrow("exactly one allowed redirect");

    const undocumented = fakeHttps([{
      status: 307,
      headers: { location: "https://production.blob.core.windows.net/container/file" },
    }]);
    await expect(
      boundary(undocumented.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).rejects.toThrow("exactly one allowed redirect");

    const chain = fakeHttps([
      {
        status: 302,
        headers: { location: "https://production.blob.core.windows.net/container/first" },
      },
      {
        status: 302,
        headers: { location: "https://production.blob.core.windows.net/container/second" },
      },
    ]);
    await expect(
      boundary(chain.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).rejects.toThrow("nonterminal or partial");
    expect(chain.requests).toHaveLength(2);
  });

  it("rejects undocumented Release statuses, 200 plus Location, and a redirected second hop", async () => {
    const cases: ReadonlyArray<ReadonlyArray<ResponseStep>> = [
      [{ status: 307, headers: { location: "https://release-assets.githubusercontent.com/file" } }],
      [{
        status: 200,
        headers: {
          "content-length": "5",
          location: "https://release-assets.githubusercontent.com/file",
        },
        chunks: ["asset"],
      }],
      [
        { status: 302, headers: { location: "https://release-assets.githubusercontent.com/file" } },
        { status: 302, headers: { location: "https://release-assets.githubusercontent.com/second" } },
      ],
    ];
    for (const steps of cases) {
      const fake = fakeHttps(steps);
      await expect(
        boundary(fake.request).readReleaseAsset("repos/mannyc2/effect-build/releases/assets/2", 5),
      ).rejects.toThrow();
    }
  });

  it("rejects ambiguous redirect and terminal framing headers", async () => {
    const redirect = fakeHttps([{
      status: 302,
      headers: {
        location: [
          "https://production.blob.core.windows.net/container/one",
          "https://production.blob.core.windows.net/container/two",
        ],
      },
    }]);
    await expect(
      boundary(redirect.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        zipMaximumBytes,
      ),
    ).rejects.toThrow("ambiguous redirect headers");

    const terminal = fakeHttps([{
      headers: {
        "content-length": ["11", "12"],
        "content-type": "application/json",
      },
      chunks: ['{"ok":true}'],
    }]);
    await expect(
      boundary(terminal.request).readJson("repos/mannyc2/effect-build"),
    ).rejects.toThrow("ambiguous headers");
  });

  it("rejects partial, oversized, truncated, empty, and timed-out terminal responses", async () => {
    const cases: ReadonlyArray<ReadonlyArray<ResponseStep>> = [
      [
        { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
        { status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/4" }, chunks: ["abc"] },
      ],
      [
        { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
        { headers: { "content-length": `${1024 * 1024 * 1024 + 1}` } },
      ],
      [
        { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
        { headers: { "content-length": "4" }, chunks: ["abc"] },
      ],
      [
        { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
        { headers: {} },
      ],
      [{ timeout: true }],
    ];
    for (const steps of cases) {
      const fake = fakeHttps(steps);
      await expect(
        boundary(fake.request).readArtifactZip(
          "repos/mannyc2/effect-build/actions/artifacts/1/zip",
          zipMaximumBytes,
        ),
      ).rejects.toThrow();
    }
  });

  it("enforces the caller's smaller artifact bound while streaming and rejects invalid bounds", async () => {
    const declared = fakeHttps([
      { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
      { headers: { "content-length": "4" }, chunks: ["data"] },
    ]);
    await expect(
      boundary(declared.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        3,
      ),
    ).rejects.toThrow("declared an invalid byte length");

    const chunked = fakeHttps([
      { status: 302, headers: { location: "https://production.blob.core.windows.net/c/a" } },
      { headers: {}, chunks: ["ab", "cd"] },
    ]);
    await expect(
      boundary(chunked.request).readArtifactZip(
        "repos/mannyc2/effect-build/actions/artifacts/1/zip",
        3,
      ),
    ).rejects.toThrow("exceeded its byte bound");

    const invalid = fakeHttps([]);
    for (const maximumBytes of [undefined, 0, 1.5, transport.artifactMaximumBytes + 1]) {
      await expect(
        boundary(invalid.request).readArtifactZip(
          "repos/mannyc2/effect-build/actions/artifacts/1/zip",
          maximumBytes as number,
        ),
      ).rejects.toThrow("byte bound is not canonical");
    }
    await expect(
      boundary(invalid.request).readReleaseAsset(
        "repos/mannyc2/effect-build/releases/assets/2",
        0,
      ),
    ).rejects.toThrow("byte bound is not canonical");
    expect(invalid.request).not.toHaveBeenCalled();
  });

  it("enforces a total metadata deadline even while response bytes keep the socket active", async () => {
    vi.useFakeTimers();
    let interval: ReturnType<typeof setInterval> | undefined;
    const request = vi.fn((_: Record<string, unknown>, callback: (response: Readable) => void) => {
      const response = new EventEmitter() as EventEmitter & {
        destroy: ReturnType<typeof vi.fn>;
        headers: Record<string, string>;
        headersDistinct: Record<string, readonly string[]>;
        resume: ReturnType<typeof vi.fn>;
        statusCode: number;
      };
      Object.assign(response, {
        destroy: vi.fn(),
        headers: { "content-type": "application/json" },
        headersDistinct: { "content-type": ["application/json"] },
        resume: vi.fn(),
        statusCode: 200,
      });
      const operation = new EventEmitter() as EventEmitter & {
        destroy: ReturnType<typeof vi.fn>;
        end: () => void;
      };
      operation.destroy = vi.fn(() => clearInterval(interval));
      operation.end = () => {
        callback(response as unknown as Readable);
        interval = setInterval(() => response.emit("data", Buffer.from(" ")), 30_000);
      };
      return operation;
    });
    try {
      const result = createGitHubReadOnlyBoundary({
        repository: "mannyc2/effect-build",
        token: "test-only-token",
        transport,
        requestImplementation: request,
      }).readJson("repos/mannyc2/effect-build");
      const rejection = expect(result).rejects.toThrow("exceeded its total time bound");
      await vi.advanceTimersByTimeAsync(60_001);
      await rejection;
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      if (interval !== undefined) clearInterval(interval);
      vi.useRealTimers();
    }
  });

  it("shares one total artifact deadline across the API redirect and byte hop", async () => {
    vi.useFakeTimers();
    const requests: Array<Record<string, unknown>> = [];
    let secondInterval: ReturnType<typeof setInterval> | undefined;
    const request = vi.fn((options: Record<string, unknown>, callback: (response: Readable) => void) => {
      const operation = new EventEmitter() as EventEmitter & {
        destroy: ReturnType<typeof vi.fn>;
        end: () => void;
      };
      operation.destroy = vi.fn(() => clearInterval(secondInterval));
      operation.end = () => {
        requests.push(options);
        if (requests.length === 1) {
          const response = new EventEmitter() as EventEmitter & {
            headers: Record<string, string>;
            headersDistinct: Record<string, readonly string[]>;
            resume: ReturnType<typeof vi.fn>;
            statusCode: number;
          };
          Object.assign(response, {
            headers: { location: "https://production.blob.core.windows.net/c/a" },
            headersDistinct: { location: ["https://production.blob.core.windows.net/c/a"] },
            resume: vi.fn(),
            statusCode: 302,
          });
          callback(response as unknown as Readable);
          setTimeout(() => response.emit("end"), 14 * 60_000);
          return;
        }
        const response = new EventEmitter() as EventEmitter & {
          destroy: ReturnType<typeof vi.fn>;
          headers: Record<string, string>;
          headersDistinct: Record<string, readonly string[]>;
          resume: ReturnType<typeof vi.fn>;
          statusCode: number;
        };
        Object.assign(response, {
          destroy: vi.fn(),
          headers: {},
          headersDistinct: {},
          resume: vi.fn(),
          statusCode: 200,
        });
        callback(response as unknown as Readable);
        secondInterval = setInterval(() => response.emit("data", Buffer.from("x")), 30_000);
      };
      return operation;
    });
    try {
      const result = createGitHubReadOnlyBoundary({
        repository: "mannyc2/effect-build",
        token: "test-only-token",
        transport,
        requestImplementation: request,
      }).readArtifactZip("repos/mannyc2/effect-build/actions/artifacts/1/zip", zipMaximumBytes);
      const rejection = expect(result).rejects.toThrow("exceeded its total time bound");
      await vi.advanceTimersByTimeAsync(15 * 60_000 + 1);
      await rejection;
      expect(requests).toHaveLength(2);
      expect(requests[1]?.timeout).toBeLessThanOrEqual(60_000);
    } finally {
      if (secondInterval !== undefined) clearInterval(secondInterval);
      vi.useRealTimers();
    }
  });

  it("rejects non-repository routes, credential-shaped tokens, and transport-policy drift", async () => {
    const fake = fakeHttps([]);
    expect(() =>
      createGitHubReadOnlyBoundary({
        repository: "mannyc2/effect-build",
        token: "token\r\nInjected: yes",
        transport,
        requestImplementation: fake.request,
      })
    ).toThrow("token");
    const client = boundary(fake.request);
    await expect(client.readJson("repos/another/repository")).rejects.toThrow("repository-scoped");
    await expect(client.readJson("repos/mannyc2/effect-build/../secrets")).rejects.toThrow("repository-scoped");
    expect(() =>
      createGitHubReadOnlyBoundary({
        repository: "mannyc2/effect-build",
        token: "token",
        transport: { ...transport, apiOrigin: "https://github.example.invalid" },
        requestImplementation: fake.request,
      })
    ).toThrow("canonical hard cut");
    expect(fake.request).not.toHaveBeenCalled();
  });
});
