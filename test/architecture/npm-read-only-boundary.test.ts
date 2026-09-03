import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { rootCertificates } from "node:tls";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The sealed npm boundary is an intentionally unprotected Node script module.
import { createAnonymousNpmBoundary } from "../../scripts/release/npm-read-only-boundary.mjs";

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
  createAnonymousNpmBoundary({
    registry: "https://registry.npmjs.org",
    requestImplementation,
  });

describe("pinned anonymous npm boundary", () => {
  it("uses only registry.npmjs.org, bundled roots, and no authorization or ambient routing", async () => {
    const fake = fakeHttps([{
      headers: { "content-length": "11", "content-type": "application/json; charset=utf-8" },
      chunks: ['{"ok":true}'],
    }]);
    const original = {
      HOME: process.env.HOME,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
      npm_config_registry: process.env.npm_config_registry,
    };
    Object.assign(process.env, {
      HOME: "/hostile/home",
      HTTPS_PROXY: "https://attacker.invalid:4443",
      NODE_EXTRA_CA_CERTS: "/hostile/ca.pem",
      npm_config_registry: "https://attacker.invalid",
    });
    try {
      await expect(boundary(fake.request).readJson("https://registry.npmjs.org/effect-build")).resolves.toEqual({
        ok: true,
      });
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
      hostname: "registry.npmjs.org",
      method: "GET",
      path: "/effect-build",
      port: 443,
      protocol: "https:",
      rejectUnauthorized: true,
      servername: "registry.npmjs.org",
      timeout: 60_000,
    });
    expect(fake.requests[0]?.headers).toEqual({
      Accept: "application/json",
      "User-Agent": "effect-build-anonymous-npm-boundary/1",
    });
    expect(JSON.stringify(fake.requests[0])).not.toMatch(/authorization|cookie|hostile/iu);
  });

  it("downloads bounded tarball bytes from the same exact origin", async () => {
    const fake = fakeHttps([{
      headers: { "content-length": "3", "content-type": "application/octet-stream" },
      chunks: [Buffer.from("tgz")],
    }]);
    await expect(
      boundary(fake.request).readTarball(
        "https://registry.npmjs.org/effect-build/-/effect-build-0.6.1.tgz",
        3,
      ),
    ).resolves.toEqual(Buffer.from("tgz"));
    expect(fake.requests[0]?.headers).toEqual({
      Accept: "application/octet-stream",
      "User-Agent": "effect-build-anonymous-npm-boundary/1",
    });
  });

  it.each([
    "http://registry.npmjs.org/effect-build",
    "https://registry.npmjs.org.attacker.invalid/effect-build",
    "https://fixture@registry.npmjs.org/effect-build",
    "https://registry.npmjs.org:4443/effect-build",
    "https://registry.npmjs.org/effect-build?write=true",
    "https://registry.npmjs.org/effect-build#fragment",
    "https://registry.npmjs.org/effect-build/%2f/secrets",
  ])("rejects a hostile registry URL before network access: %s", async (url) => {
    const fake = fakeHttps([]);
    await expect(boundary(fake.request).readJson(url)).rejects.toThrow();
    expect(fake.request).not.toHaveBeenCalled();
  });

  it("rejects redirects, partial responses, oversized declarations, truncation, and timeouts", async () => {
    const cases: ReadonlyArray<ReadonlyArray<ResponseStep>> = [
      [{ status: 302, headers: { location: "https://registry.npmjs.org/elsewhere" } }],
      [{ status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/4" }, chunks: ["abc"] }],
      [{ headers: { "content-length": `${1024 * 1024 * 1024 + 1}` } }],
      [{ headers: { "content-length": "4" }, chunks: ["abc"] }],
      [{ timeout: true }],
    ];
    for (const steps of cases) {
      const fake = fakeHttps(steps);
      await expect(
        boundary(fake.request).readTarball(
          "https://registry.npmjs.org/effect-build/-/effect-build-0.6.1.tgz",
          64 * 1024 * 1024,
        ),
      ).rejects.toThrow();
    }
  });

  it("enforces an exact caller byte bound before and during a tarball response", async () => {
    const declared = fakeHttps([{
      headers: { "content-length": "4" },
      chunks: ["data"],
    }]);
    await expect(
      boundary(declared.request).readTarball(
        "https://registry.npmjs.org/effect-build/-/effect-build-0.6.1.tgz",
        3,
      ),
    ).rejects.toThrow("declared an invalid byte length");

    const chunked = fakeHttps([{ headers: {}, chunks: ["ab", "cd"] }]);
    await expect(
      boundary(chunked.request).readTarball(
        "https://registry.npmjs.org/effect-build/-/effect-build-0.6.1.tgz",
        3,
      ),
    ).rejects.toThrow("exceeded its byte bound");

    const invalid = fakeHttps([]);
    for (const maximumBytes of [undefined, 0, 1.5, 1024 * 1024 * 1024 + 1]) {
      await expect(
        boundary(invalid.request).readTarball(
          "https://registry.npmjs.org/effect-build/-/effect-build-0.6.1.tgz",
          maximumBytes as number,
        ),
      ).rejects.toThrow("artifact byte bound is not canonical");
    }
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
      const result = createAnonymousNpmBoundary({
        registry: "https://registry.npmjs.org",
        requestImplementation: request,
      }).readJson("https://registry.npmjs.org/effect-build");
      const rejection = expect(result).rejects.toThrow("exceeded its total time bound");
      await vi.advanceTimersByTimeAsync(60_001);
      await rejection;
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      if (interval !== undefined) clearInterval(interval);
      vi.useRealTimers();
    }
  });

  it("rejects ambiguous response framing", async () => {
    const fake = fakeHttps([{
      headers: {
        "content-length": ["11", "12"],
        "content-type": "application/json",
      },
      chunks: ['{"ok":true}'],
    }]);
    await expect(
      boundary(fake.request).readJson("https://registry.npmjs.org/effect-build"),
    ).rejects.toThrow("ambiguous headers");
  });
});
