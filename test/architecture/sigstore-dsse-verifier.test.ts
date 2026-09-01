import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { bundleFromJSON, bundleToJSON } from "@sigstore/bundle";

// @ts-expect-error The verifier is an intentionally unprotected Node script module.
import * as releaseProtocol from "../../scripts/release/protocol.mjs";
// @ts-expect-error The verifier is an intentionally unprotected Node script module.
import * as sigstoreVerifier from "../../scripts/release/sigstore-dsse-verifier.mjs";

const { canonicalJson, sha256Digest } = releaseProtocol;
const {
  validateIsolatedChildEnvironment,
  verifyExternalEvidenceEnvelope,
  verifySigstoreBundleIsolated,
  validateVerifierRuntime,
} = sigstoreVerifier;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const role = "npm-authority";
const definition = contract.releaseCertification.readiness.evidenceRoles.find(
  (entry: { role: string }) => entry.role === role,
);
const verifierPolicy = contract.releaseCertification.readiness.externalEvidenceAuthentication.verifier;
const trustedRootBytes = Buffer.from(await readFile(resolve(root, verifierPolicy.trustedRoot.path)));
const certificateIdentityURI =
  "https://github.com/mannyc2/effect-build-authority/.github/workflows/npm-authority.yml@refs/heads/main";
const producerWorkflow = certificateIdentityURI.slice("https://github.com/".length);
const sourceSha = "a".repeat(40);
const producerSourceSha = "b".repeat(40);
const producerIdentity = {
  role,
  certificateIssuer: verifierPolicy.certificateIssuer,
  certificateIdentityURI,
  workflow: producerWorkflow,
  repository: "mannyc2/effect-build-authority",
  ref: "refs/heads/main",
  sourceBinding: { kind: "exact-source-sha", sourceSha: producerSourceSha },
};
const observedAt = "2026-08-30T16:00:00.000Z";
const expiresAt = "2026-08-30T19:00:00.000Z";
const validationTime = "2026-08-30T16:30:00.000Z";
const signature = Buffer.alloc(64, 5).toString("base64");
const derUtf8 = (value: string) => {
  const payload = Buffer.from(value);
  if (payload.byteLength >= 128) throw new Error("fixture DER helper only admits one-octet lengths");
  return Buffer.concat([Buffer.from([0x0c, payload.byteLength]), payload]);
};
const verifiedSigner = () => ({
  identity: {
    subjectAlternativeName: certificateIdentityURI,
    extensions: { issuer: verifierPolicy.certificateIssuer },
    oids: [
      {
        oid: { id: verifierPolicy.certificateOids.buildSignerUri.split(".").map(Number) },
        value: derUtf8(certificateIdentityURI),
      },
      {
        oid: { id: verifierPolicy.certificateOids.sourceRepositoryUri.split(".").map(Number) },
        value: derUtf8("https://github.com/mannyc2/effect-build-authority"),
      },
      {
        oid: { id: verifierPolicy.certificateOids.sourceRepositoryDigest.split(".").map(Number) },
        value: derUtf8(producerSourceSha),
      },
    ],
  },
});

const authorizedContract = () => {
  const value = structuredClone(contract);
  value.releaseCertification.readiness.externalEvidenceAuthentication.producerIdentities = [producerIdentity];
  return value;
};

const authorityReceipt = () => {
  const policy = contract.releaseCertification.readiness.externalReceipts.npmAuthority;
  return {
    checks: policy.expectedCheckIds.map((id: string) => ({ id, status: "match" })),
    decision: definition.terminal,
    identity: policy.identity,
    issues: [],
    observedAt,
    schema: definition.protocol,
    sourceSha,
    summary: { match: policy.expectedCheckIds.length, mismatch: 0, unobserved: 0 },
  };
};

const serializedBundle = (payload: object, overrides: Record<string, unknown> = {}) => {
  const bundle = {
    mediaType: verifierPolicy.bundleMediaType,
    verificationMaterial: {
      certificate: { rawBytes: Buffer.from("fixture certificate").toString("base64") },
      tlogEntries: [{
        logIndex: "1",
        logId: { keyId: Buffer.alloc(32, 1).toString("base64") },
        kindVersion: { kind: "dsse", version: "0.0.1" },
        integratedTime: "1",
        inclusionPromise: { signedEntryTimestamp: Buffer.alloc(64, 2).toString("base64") },
        inclusionProof: {
          logIndex: "1",
          rootHash: Buffer.alloc(32, 3).toString("base64"),
          treeSize: "2",
          hashes: [Buffer.alloc(32, 4).toString("base64")],
          checkpoint: { envelope: "fixture checkpoint" },
        },
        canonicalizedBody: Buffer.from("{}").toString("base64"),
      }],
      timestampVerificationData: {},
    },
    dsseEnvelope: {
      payload: Buffer.from(canonicalJson(payload)).toString("base64"),
      payloadType: verifierPolicy.payloadType,
      signatures: [{ sig: signature }],
    },
    ...overrides,
  };
  // This fixture is produced through the exact installed v0.3 converter. It
  // catches media-type/default-field drift independently of our wrapper.
  return bundleToJSON(bundleFromJSON(bundle));
};

const fixture = (mutatePayload?: (payload: Record<string, unknown>) => void) => {
  const receiptBytes = Buffer.from(canonicalJson(authorityReceipt()));
  const payload: Record<string, unknown> = {
    schema: verifierPolicy.payloadProtocol,
    role,
    producerWorkflow,
    producerSourceSha,
    releaseSourceSha: sourceSha,
    receiptProtocol: definition.protocol,
    receiptBytes: `${receiptBytes.byteLength}`,
    receiptDigest: sha256Digest(receiptBytes),
    observedAt,
    expiresAt,
    receiptBase64: receiptBytes.toString("base64"),
  };
  mutatePayload?.(payload);
  const bundle = serializedBundle(payload);
  const bundleBytes = Buffer.from(canonicalJson(bundle));
  const reference = {
    role,
    type: definition.type,
    protocol: definition.protocol,
    identity: contract.releaseCertification.readiness.externalReceipts.npmAuthority.identity,
    sourceSha,
    terminal: definition.terminal,
    observedAt,
    expiresAt,
    bytes: `${bundleBytes.byteLength}`,
    digest: sha256Digest(bundleBytes),
  };
  return { bundle, bundleBytes, payload, receiptBytes, reference };
};

const expectedOptions = {
  certificateIssuer: verifierPolicy.certificateIssuer,
  certificateIdentityURI: `^${certificateIdentityURI.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
  ctLogThreshold: 1,
  tlogThreshold: 1,
};

describe("Sigstore DSSE external-evidence verifier", () => {
  it("admits only a real v0.3-shaped bundle through the two-argument identity-pinned API", async () => {
    const value = fixture();
    const verifyBundle = vi.fn(async (bundle, options) => {
      expect(bundle).toEqual(value.bundle);
      expect(options).toEqual(expectedOptions);
      return verifiedSigner();
    });
    const result = await verifyExternalEvidenceEnvelope({
      contract: authorizedContract(),
      definition,
      reference: value.reference,
      bundleBytes: value.bundleBytes,
      validationTime,
      environment: {},
      verifyBundle,
    });
    expect(verifyBundle).toHaveBeenCalledTimes(1);
    expect(verifyBundle.mock.calls[0]).toHaveLength(2);
    expect(result.receiptBytes).toEqual(value.receiptBytes);
  });

  it("rejects missing, duplicate, plain-text, and wrong DER Fulcio OID values", async () => {
    const mutations = [
      (signer: any) => signer.identity.oids.pop(),
      (signer: any) => signer.identity.oids.push(structuredClone(signer.identity.oids[0])),
      (signer: any) => signer.identity.oids[0].value = Buffer.from(certificateIdentityURI),
      (signer: any) => signer.identity.oids[2].value = derUtf8("c".repeat(40)),
    ];
    for (const mutate of mutations) {
      const value = fixture();
      const signer = verifiedSigner();
      mutate(signer);
      await expect(verifyExternalEvidenceEnvelope({
        contract: authorizedContract(),
        definition,
        reference: value.reference,
        bundleBytes: value.bundleBytes,
        validationTime,
        environment: {},
        verifyBundle: vi.fn(async () => signer),
      })).rejects.toThrow(/OID/u);
    }
  });

  it("stays blocked until exactly one producer identity is contract-pinned", async () => {
    const value = fixture();
    const verifyBundle = vi.fn();
    await expect(verifyExternalEvidenceEnvelope({
      contract,
      definition,
      reference: value.reference,
      bundleBytes: value.bundleBytes,
      validationTime,
      environment: {},
      verifyBundle,
    })).rejects.toThrow(/no unique contract-pinned producer identity/u);
    expect(verifyBundle).not.toHaveBeenCalled();
  });

  it("rejects signed-payload, role, source, time, shape, and environment mutations", async () => {
    const cases: Array<[string, () => Record<string, unknown>]> = [
      ["payload role", () => fixture((payload) => payload.role = "operational-journal")],
      ["release source", () => fixture((payload) => payload.releaseSourceSha = "c".repeat(40))],
      ["producer source", () => fixture((payload) => payload.producerSourceSha = "c".repeat(40))],
      ["producer workflow", () => fixture((payload) => payload.producerWorkflow = `${producerWorkflow}-peer`)],
      ["receipt digest", () => fixture((payload) => payload.receiptDigest = `sha256:${"0".repeat(64)}`)],
      ["extra payload field", () => fixture((payload) => payload.fallback = true)],
    ];
    for (const [, make] of cases) {
      const value = make() as ReturnType<typeof fixture>;
      await expect(verifyExternalEvidenceEnvelope({
        contract: authorizedContract(),
        definition,
        reference: value.reference,
        bundleBytes: value.bundleBytes,
        validationTime,
        environment: {},
        verifyBundle: vi.fn(),
      })).rejects.toThrow();
    }

    const value = fixture();
    const wrongDefinition = { ...definition, protocol: "effect-build/peer@1" };
    await expect(verifyExternalEvidenceEnvelope({
      contract: authorizedContract(),
      definition: wrongDefinition,
      reference: value.reference,
      bundleBytes: value.bundleBytes,
      validationTime,
      environment: {},
      verifyBundle: vi.fn(),
    })).rejects.toThrow(/definition is not canonical/u);
    await expect(verifyExternalEvidenceEnvelope({
      contract: authorizedContract(),
      definition,
      reference: value.reference,
      bundleBytes: value.bundleBytes,
      validationTime,
      environment: { NPM_TOKEN: "canary" },
      verifyBundle: vi.fn(),
    })).rejects.toThrow(/forbidden signing or registry authority/u);
  });

  it("rejects noncanonical v0.3 material and propagates cryptographic failure", async () => {
    const value = fixture();
    const changedSignature = structuredClone(value.bundle);
    changedSignature.dsseEnvelope!.signatures[0]!.sig = Buffer.alloc(64, 9).toString("base64");
    const changedBytes = Buffer.from(canonicalJson(changedSignature));
    const changedReference = {
      ...value.reference,
      bytes: `${changedBytes.byteLength}`,
      digest: sha256Digest(changedBytes),
    };
    const verifyBundle = vi.fn(async () => {
      throw new Error("cryptographic signature rejected");
    });
    await expect(verifyExternalEvidenceEnvelope({
      contract: authorizedContract(),
      definition,
      reference: changedReference,
      bundleBytes: changedBytes,
      validationTime,
      environment: {},
      verifyBundle,
    })).rejects.toThrow(/cryptographic signature rejected/u);
    expect(verifyBundle).toHaveBeenCalledTimes(1);

    for (
      const mutate of [
        (bundle: any) => bundle.verificationMaterial.timestampVerificationData = { fallback: true },
        (bundle: any) => bundle.dsseEnvelope.signatures.push({ sig: signature }),
        (bundle: any) => bundle.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.3",
        (bundle: any) => bundle.verificationMaterial.tlogEntries = [],
      ]
    ) {
      const changed = structuredClone(value.bundle);
      mutate(changed);
      const bytes = Buffer.from(canonicalJson(changed));
      await expect(verifyExternalEvidenceEnvelope({
        contract: authorizedContract(),
        definition,
        reference: { ...value.reference, bytes: `${bytes.byteLength}`, digest: sha256Digest(bytes) },
        bundleBytes: bytes,
        validationTime,
        environment: {},
        verifyBundle: vi.fn(),
      })).rejects.toThrow();
    }
  });

  it("executes the production verifier through one credential-free child environment", async () => {
    const signer = verifiedSigner();
    const projection = {
      identity: {
        extensions: signer.identity.extensions,
        oids: signer.identity.oids.map((entry: any) => ({
          oid: entry.oid,
          valueBase64: Buffer.from(entry.value).toString("base64"),
        })),
        subjectAlternativeName: signer.identity.subjectAlternativeName,
      },
    };
    const spawn = vi.fn((executable, argv, options) => {
      expect(executable).toBe("node");
      expect(argv).toEqual([
        "--permission",
        `--allow-fs-read=${fileURLToPath(new URL("../../", import.meta.url))}`,
        `--require=${resolve(root, "scripts/release/deny-network.cjs")}`,
        resolve(root, "scripts/release/sigstore-dsse-verifier.mjs"),
        "--verify-child",
      ]);
      expect(Object.keys(options.env).sort()).toEqual([
        "HOME",
        "LANG",
        "PATH",
        "TMPDIR",
        "__CF_USER_TEXT_ENCODING",
      ]);
      expect(JSON.stringify(options.env)).not.toContain("SECRET-CANARY");
      expect(options.input).not.toContain("SECRET-CANARY");
      expect(JSON.parse(options.input).trustedRootBase64).toBe(trustedRootBytes.toString("base64"));
      expect(options.timeout).toBe(120_000);
      expect(options.shell).toBe(false);
      return { status: 0, stdout: canonicalJson(projection) };
    });
    const result = await verifySigstoreBundleIsolated({ dsseEnvelope: {} }, expectedOptions, {
      contract,
      environment: {
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "SECRET-CANARY",
        GH_TOKEN: "SECRET-CANARY",
        GITHUB_TOKEN: "SECRET-CANARY",
        LANG: "C.UTF-8",
        PATH: process.env.PATH,
        UNRELATED_RUNNER_SECRET: "SECRET-CANARY",
      },
      spawn,
    });
    expect(result).toEqual(signer);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("admits only the exact libuv-required Windows environment additions", () => {
    const environment = Object.fromEntries([
      "HOME",
      "HOMEDRIVE",
      "HOMEPATH",
      "LANG",
      "LOGONSERVER",
      "PATH",
      "SYSTEMDRIVE",
      "SYSTEMROOT",
      "TEMP",
      "TMPDIR",
      "USERDOMAIN",
      "USERNAME",
      "USERPROFILE",
      "WINDIR",
      "__CF_USER_TEXT_ENCODING",
    ].map((name) => [name, "fixture-value"]));
    expect(validateIsolatedChildEnvironment(environment, "win32")).toBe(environment);
    expect(() => validateIsolatedChildEnvironment({ ...environment, NPM_TOKEN: "canary" }, "win32"))
      .toThrow(/non-allowlisted environment/u);
    expect(() => validateIsolatedChildEnvironment({ ...environment, Path: "duplicate" }, "win32"))
      .toThrow(/non-allowlisted environment/u);
    expect(() => validateIsolatedChildEnvironment(environment, "linux"))
      .toThrow(/non-allowlisted environment/u);
  });

  it("rejects a wrong Node version and an unavailable contract-pinned node command", async () => {
    expect(validateVerifierRuntime({
      runtime: verifierPolicy.runtime,
      observedVersion: "v24.14.1",
    })).toEqual({
      executable: "node",
      version: "24.14.1",
    });
    expect(() =>
      validateVerifierRuntime({
        runtime: verifierPolicy.runtime,
        observedVersion: "v24.14.0",
      })
    ).toThrow(/runtime differs/u);
    await expect(verifySigstoreBundleIsolated({}, expectedOptions, {
      contract,
      environment: { LANG: "C.UTF-8", PATH: "/effect-build-no-node" },
      trustedRootBytes,
    })).rejects.toThrow(/runtime unavailable/u);
  });

  it("verifies a real official Sigstore v0.3 DSSE fixture in the isolated Node child", async () => {
    const bundle = JSON.parse(
      await readFile(
        resolve(root, "test/fixtures/release/sigstore-js-v4.1.1-bundle-v03-dsse.sigstore"),
        "utf8",
      ),
    );
    const signer = await verifySigstoreBundleIsolated(bundle, {
      certificateIdentityURI: "^brian@dehamer\\.com$",
      certificateIssuer: "https://github.com/login/oauth",
      ctLogThreshold: 1,
      tlogThreshold: 1,
    }, {
      contract,
      trustedRootBytes,
    });
    expect(signer.identity?.subjectAlternativeName).toBe("brian@dehamer.com");
    expect(signer.identity?.extensions.issuer).toBe("https://github.com/login/oauth");
  });

  it("rejects a mutated root before spawning", async () => {
    const mutated = Buffer.from(trustedRootBytes);
    const last = mutated.byteLength - 1;
    mutated[last] = mutated[last]! ^ 1;
    const spawn = vi.fn();
    await expect(verifySigstoreBundleIsolated({}, expectedOptions, {
      contract,
      spawn,
      trustedRootBytes: mutated,
    })).rejects.toThrow(/trusted-root bytes differ/u);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("denies every retained standard socket, DNS, HTTP, and global acquisition surface in a real child", () => {
    const probe = `
      const surfaces = globalThis.__effectBuildNetworkSurfaces;
      const attempts = [
        () => fetch("https://example.com"),
        ...(["WebSocket", "EventSource"].filter((name) => typeof globalThis[name] === "function")
          .map((name) => () => new globalThis[name]("https://example.com"))),
        () => import("node:net").then((value) => value.createConnection(443, "example.com")),
        () => import("node:tls").then((value) => value.connect(443, "example.com")),
        () => import("node:http").then((value) => value.get("http://example.com")),
        () => import("node:https").then((value) => value.get("https://example.com")),
        () => import("node:http2").then((value) => value.connect("https://example.com")),
        () => import("node:dns/promises").then((value) => value.lookup("example.com")),
        () => import("node:dgram").then((value) => value.createSocket("udp4")),
        () => process.getBuiltinModule("net"),
        () => surfaces.net.connect(),
        () => surfaces.net.createConnection(),
        () => surfaces.net.createServer(),
        () => new surfaces.net.Socket(),
        () => new surfaces.net.Server(),
        () => surfaces.prototypes.netSocket.connect(),
        () => surfaces.prototypes.netServer.listen(),
        () => surfaces.tls.connect(),
        () => surfaces.tls.createServer(),
        () => new surfaces.tls.TLSSocket(),
        () => surfaces.prototypes.tlsSocket.connect(),
        () => surfaces.http.get(),
        () => surfaces.http.request(),
        () => surfaces.http.createServer(),
        () => new surfaces.http.Agent(),
        () => new surfaces.http.ClientRequest(),
        () => surfaces.prototypes.httpAgent.createConnection(),
        () => surfaces.prototypes.httpClientRequest.end(),
        () => surfaces.prototypes.httpClientRequest.write(),
        () => surfaces.https.get(),
        () => surfaces.https.request(),
        () => surfaces.https.createServer(),
        () => new surfaces.https.Agent(),
        () => surfaces.prototypes.httpsAgent.createConnection(),
        () => surfaces.http2.connect(),
        () => surfaces.http2.createServer(),
        () => surfaces.http2.createSecureServer(),
        () => surfaces.dgram.createSocket(),
        () => new surfaces.dgram.Socket(),
        () => surfaces.prototypes.dgramSocket.bind(),
        () => surfaces.prototypes.dgramSocket.connect(),
        () => surfaces.prototypes.dgramSocket.send(),
        ...[surfaces.dns, surfaces.dns.promises].flatMap((resolver) => [
          "getDefaultResultOrder", "getServers", "lookup", "lookupService", "resolve", "resolve4",
          "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr",
          "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse",
          "setDefaultResultOrder", "setServers",
        ].filter((name) => typeof resolver[name] === "function").map((name) => () => resolver[name]())),
        ...[surfaces.prototypes.dnsResolver, surfaces.prototypes.dnsPromisesResolver].flatMap((resolver) => [
          "cancel", "getDefaultResultOrder", "getServers", "resolve", "resolve4", "resolve6",
          "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs",
          "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse", "setLocalAddress", "setServers",
        ].filter((name) => typeof resolver[name] === "function").map((name) => () => resolver[name]())),
      ];
      for (const [index, attempt] of attempts.entries()) {
        let denied = false;
        try { await attempt(); } catch (error) {
          denied = error?.message === "network access is forbidden in the Sigstore verifier child";
        }
        if (!denied) throw new Error(\`network attempt \${index} was not denied\`);
      }
    `;
    const result = spawnSync("node", [
      "--permission",
      `--allow-fs-read=${root}`,
      `--require=${resolve(root, "test/fixtures/release/capture-network-surfaces.cjs")}`,
      `--require=${resolve(root, "scripts/release/deny-network.cjs")}`,
      "--input-type=module",
      "--eval",
      probe,
    ], {
      encoding: "utf8",
      env: { HOME: root, LANG: "C.UTF-8", PATH: process.env.PATH ?? "", TMPDIR: root },
      timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("pins the direct network-free verifier closure and contains no TUF or high-level client", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    expect(manifest.devDependencies.sigstore).toBeUndefined();
    expect(manifest.devDependencies["@sigstore/verify"]).toBe("3.1.1");
    expect(manifest.devDependencies["@sigstore/bundle"]).toBe("4.0.0");
    expect(manifest.devDependencies["@sigstore/protobuf-specs"]).toBe("0.5.2");
    const source = await readFile(resolve(root, "scripts/release/sigstore-dsse-verifier.mjs"), "utf8");
    expect(source).toContain("new Verifier(toTrustMaterial(trustedRoot)");
    expect(source).not.toContain("verifyBundle(bundle, undefined,");
    expect(source).not.toMatch(/\b(?:attest|sign)\s*\(/u);
    expect(source).not.toMatch(/\b(?:fetch|writeFile|appendFile|rename|unlink)\w*\s*\(/u);
    expect(source).toContain("env: {");
    expect(source).not.toMatch(/@sigstore\/tuf|tuf-js|from ["']sigstore["']|import\(["']sigstore["']\)/u);
  });
});
