import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { fileURLToPath } from "node:url";

import { bundleFromJSON, bundleToJSON } from "@sigstore/bundle";
import { describe, expect, it } from "vitest";

// @ts-expect-error Release producer helpers are intentionally unprotected Node modules.
import * as externalProducer from "../../scripts/release/external-evidence-producer.mjs";
// @ts-expect-error GitHub governance is an intentionally unprotected Node release module.
import * as githubGovernance from "../../scripts/release/produce-github-release-governance.mjs";
// @ts-expect-error npm authority is an intentionally unprotected Node release module.
import * as npmAuthority from "../../scripts/release/produce-npm-authority.mjs";
// @ts-expect-error Canonical release protocol is an intentionally unprotected Node module.
import { canonicalJson, sha256Digest } from "../../scripts/release/protocol.mjs";
// @ts-expect-error Readiness receipt validation is an intentionally unprotected Node module.
import { validateExternalReceiptForProducer } from "../../scripts/release/readiness-protocol.mjs";
// @ts-expect-error Sigstore signer is an intentionally unprotected Node release module.
import * as sigstoreSigner from "../../scripts/release/sigstore-dsse-signer.mjs";

const {
  assertExternalEvidenceProducerEnabled,
  buildCanonicalExternalEvidencePayload,
  buildCanonicalExternalObservationReference,
} = externalProducer;
const {
  assertGithubReleaseGovernanceObservationMechanismSupported,
  buildGithubReleaseGovernanceReceipt,
  collectGithubReleaseGovernanceReceipt,
  githubReleaseGovernanceObservationInterface,
} = githubGovernance;
const { assertNpmAuthorityObservationMechanismSupported, npmAuthorityCredentialInterface } = npmAuthority;
const {
  assertPinnedSigstoreSigningDependency,
  decodeStrictJwtSubject,
  exactSigstoreEndpointUrl,
  requestBoundedJsonNoRedirect,
  runOpaqueSigstoreSigningOperation,
  signCanonicalSigstoreDsse,
  sigstoreSignerPolicyFromContract,
  validateSigstoreSigningEnvironment,
} = sigstoreSigner;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const readiness = contract.releaseCertification.readiness;
const verifier = readiness.externalEvidenceAuthentication.verifier;
const sourceSha = "a".repeat(40);
const observedAt = "2026-09-01T01:00:00.000Z";
const expiresAt = "2026-09-01T05:00:00.000Z";
const role = "github-release-governance";
const definition = readiness.evidenceRoles.find((entry: { role: string }) => entry.role === role);
const receiptPolicy = readiness.externalReceipts.githubReleaseGovernance;
const workflow = "mannyc2/effect-build/.github/workflows/github-release-governance.yml@refs/heads/main";
const futureIdentity = {
  role,
  certificateIssuer: verifier.certificateIssuer,
  certificateIdentityURI: `https://github.com/${workflow}`,
  workflow,
  repository: "mannyc2/effect-build",
  ref: "refs/heads/main",
  sourceBinding: { kind: "release-source-sha" },
};

const governanceReceipt = (enabled = true) =>
  buildGithubReleaseGovernanceReceipt({
    contract,
    observedAt,
    response: { enabled, enforced_by_owner: false },
    sourceSha,
  });

const fakeBundleBytes = (payloadBytes: Uint8Array) =>
  Buffer.from(canonicalJson(bundleToJSON(bundleFromJSON({
    mediaType: verifier.bundleMediaType,
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
      payload: Buffer.from(payloadBytes).toString("base64"),
      payloadType: verifier.payloadType,
      signatures: [{ sig: Buffer.alloc(64, 5).toString("base64") }],
    },
  }))));

const distinctHeaders = (rawHeaders: ReadonlyArray<string>) => {
  const result: Record<string, Array<string>> = {};
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]!.toLowerCase();
    (result[name] ??= []).push(rawHeaders[index + 1]!);
  }
  return result;
};

interface FakeResponse {
  readonly statusCode?: number;
  readonly rawHeaders?: ReadonlyArray<string>;
  readonly headersDistinct?: Record<string, Array<string>>;
  readonly chunks?: ReadonlyArray<Uint8Array | string>;
  readonly complete?: boolean;
  readonly terminalEvent?: "aborted" | "error";
}

const fakeRequestImplementation = (
  response: FakeResponse,
  calls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }>,
) =>
(url: URL, options: any, callback: (response: any) => void) => {
  const request = new EventEmitter() as any;
  request.destroy = () => request;
  request.setTimeout = () => request;
  request.end = (body?: Uint8Array) => {
    calls.push({ body: body === undefined ? Buffer.alloc(0) : Buffer.from(body), options, url });
    const chunks = response.chunks ?? [Buffer.from(canonicalJson({ ok: true }))];
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const rawHeaders = response.rawHeaders ?? [
      "Content-Type",
      "application/json",
      "Content-Length",
      `${bytes.byteLength}`,
    ];
    const message = new EventEmitter() as any;
    message.complete = response.complete ?? true;
    message.headersDistinct = response.headersDistinct ?? distinctHeaders(rawHeaders);
    message.rawHeaders = [...rawHeaders];
    message.resume = () => undefined;
    message.statusCode = response.statusCode ?? 200;
    callback(message);
    queueMicrotask(() => {
      for (const chunk of chunks) message.emit("data", chunk);
      if (response.terminalEvent === "aborted") message.emit("aborted");
      else if (response.terminalEvent === "error") message.emit("error", new Error("RESPONSE-LOSS-CANARY"));
      else message.emit("end");
    });
  };
  return request;
};

const exactTransportRequest = async (
  response: FakeResponse,
  calls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }>,
  overrides: Record<string, unknown> = {},
) =>
  requestBoundedJsonNoRedirect({
    url: new URL("https://fulcio.sigstore.dev/api/v2/signingCert"),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    bodyBytes: Buffer.from(canonicalJson({ oidcIdentityToken: "OIDC-JWT-CANARY" })),
    successStatus: 200,
    maximumRequestBytes: 32_768,
    maximumResponseBytes: 32_768,
    maximumJsonDepth: 64,
    minimumTlsVersion: "TLSv1.2",
    requestInactivityTimeoutMilliseconds: 1_000,
    sequenceTotalTimeoutMilliseconds: 1_000,
    requestImplementation: fakeRequestImplementation(response, calls),
    ...overrides,
  });

describe("external evidence producer protocol", () => {
  it("keeps both same-repository producers inert under the exact generated blocker", () => {
    expect(readiness.externalEvidenceAuthentication.status).toBe("blocked");
    expect(readiness.externalEvidenceAuthentication.producerIdentities).toEqual([]);
    for (const producerRole of ["npm-authority", "github-release-governance"]) {
      expect(() => assertExternalEvidenceProducerEnabled({ contract, role: producerRole, sourceSha }))
        .toThrow(readiness.externalEvidenceAuthentication.blocker);
    }
  });

  it("blocks direct use before the signing dependency, OIDC, or network authority is touched", async () => {
    await expect(signCanonicalSigstoreDsse({
      contract,
      environment: {
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "MUST-NOT-BE-TOUCHED",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/token",
      },
      identity: futureIdentity,
      payloadBytes: Buffer.from(canonicalJson({})),
      sourceSha,
    })).rejects.toThrow(readiness.externalEvidenceAuthentication.blocker);
  });

  it("builds the exact closed GitHub governance receipt for either contract decision", async () => {
    const endpoints: Array<string> = [];
    const receipt = await collectGithubReleaseGovernanceReceipt({
      contract,
      sourceSha,
      observedAt,
      administrationReadBoundary: {
        readJson: async (endpoint: string) => {
          endpoints.push(endpoint);
          return { enabled: true, enforced_by_owner: false };
        },
      },
    });
    expect(endpoints).toEqual(["repos/mannyc2/effect-build/immutable-releases"]);
    expect(Object.keys(receipt).sort()).toEqual([...receiptPolicy.fields].sort());
    expect(receipt).toMatchObject({
      schema: definition.protocol,
      sourceSha,
      observedAt,
      terminal: "resolved",
      identity: receiptPolicy.identity,
      repository: "mannyc2/effect-build",
      endpoint: "repos/mannyc2/effect-build/immutable-releases",
      enabled: true,
      decision: "enabled-before-release",
      claims: ["future-release-assets-governed-by-github-release-immutability"],
    });
    expect(receipt.decisionReceiptDigest).toBe(sha256Digest(canonicalJson({
      endpoint: receipt.endpoint,
      enabled: true,
      enforcedByOwner: false,
    })));
    expect(
      buildGithubReleaseGovernanceReceipt({
        contract,
        observedAt,
        response: { enabled: true, enforced_by_owner: true },
        sourceSha,
      }).decisionReceiptDigest,
    ).not.toBe(receipt.decisionReceiptDigest);
    expect(() =>
      validateExternalReceiptForProducer({
        contract,
        observedAt,
        producerSourceSha: sourceSha,
        receiptBytes: Buffer.from(canonicalJson(receipt)),
        role,
        sourceSha,
      })
    ).not.toThrow();
    expect(governanceReceipt(false)).toMatchObject({
      enabled: false,
      decision: "accepted-disabled-release-assets-not-claimed-immutable",
      claims: ["github-release-assets-not-claimed-immutable", "candidate-and-npm-byte-identity-still-required"],
    });
  });

  it("rejects ambiguous endpoint state and receipt, source, validity, and bundle mutations", () => {
    for (
      const response of [
        { enabled: true },
        { enabled: "true", enforced_by_owner: false },
        { enabled: true, enforced_by_owner: false, fallback: true },
      ] as const
    ) {
      expect(() => buildGithubReleaseGovernanceReceipt({ contract, observedAt, response, sourceSha })).toThrow();
    }
    expect(() =>
      buildGithubReleaseGovernanceReceipt({
        contract,
        observedAt,
        response: { enabled: true, enforced_by_owner: false },
        sourceSha: sourceSha.toUpperCase(),
      })
    ).toThrow(/source SHA/u);
    expect(() =>
      buildGithubReleaseGovernanceReceipt({
        contract,
        observedAt: "2026-09-01T01:00:00Z",
        response: { enabled: true, enforced_by_owner: false },
        sourceSha,
      })
    ).toThrow(/observation time/u);

    const receipt = governanceReceipt();
    const payload = buildCanonicalExternalEvidencePayload({
      contract,
      definition,
      identity: futureIdentity,
      producerSourceSha: sourceSha,
      receiptBytes: Buffer.from(canonicalJson(receipt)),
      releaseSourceSha: sourceSha,
      observedAt,
      expiresAt,
    });
    expect(Object.keys(payload.payload).sort()).toEqual([...verifier.payloadFields].sort());
    expect(payload.payload).toMatchObject({
      schema: verifier.payloadProtocol,
      role,
      producerWorkflow: workflow,
      producerSourceSha: sourceSha,
      releaseSourceSha: sourceSha,
      receiptProtocol: definition.protocol,
      receiptDigest: sha256Digest(Buffer.from(canonicalJson(receipt))),
      observedAt,
      expiresAt,
    });
    const bundleBytes = fakeBundleBytes(payload.payloadBytes);
    const reference = buildCanonicalExternalObservationReference({
      bundleBytes,
      contract,
      definition,
      expiresAt,
      identity: futureIdentity,
      observedAt,
      receiptPolicy,
      sourceSha,
    });
    expect(Object.keys(reference.reference).sort()).toEqual(
      [...readiness.referenceShapes.externalObservation].sort(),
    );
    expect(reference.reference).toMatchObject({
      role,
      type: "externalObservation",
      protocol: definition.protocol,
      identity: receiptPolicy.identity,
      sourceSha,
      terminal: definition.terminal,
      observedAt,
      expiresAt,
      bytes: `${bundleBytes.byteLength}`,
      digest: sha256Digest(bundleBytes),
    });

    expect(() =>
      buildCanonicalExternalEvidencePayload({
        contract,
        definition,
        identity: futureIdentity,
        producerSourceSha: "b".repeat(40),
        receiptBytes: Buffer.from(canonicalJson(receipt)),
        releaseSourceSha: sourceSha,
        observedAt,
        expiresAt,
      })
    ).toThrow(/source/u);
    expect(() =>
      buildCanonicalExternalEvidencePayload({
        contract,
        definition,
        identity: futureIdentity,
        producerSourceSha: sourceSha,
        receiptBytes: Buffer.from(canonicalJson({ ...receipt, fallback: true })),
        releaseSourceSha: sourceSha,
        observedAt,
        expiresAt,
      })
    ).toThrow(/additional fields/u);
    expect(() =>
      buildCanonicalExternalEvidencePayload({
        contract,
        definition,
        identity: futureIdentity,
        producerSourceSha: sourceSha,
        receiptBytes: Buffer.from(canonicalJson(receipt)),
        releaseSourceSha: sourceSha,
        observedAt,
        expiresAt: "2026-09-01T05:00:00.001Z",
      })
    ).toThrow(/validity/u);
  });

  it("pins the complete signing package and rejects ambient credential, proxy, and identity drift", () => {
    const signerPolicy = sigstoreSignerPolicyFromContract(contract);
    expect(assertPinnedSigstoreSigningDependency({ contract, root })).toEqual(signerPolicy.dependency);
    expect(signerPolicy).toMatchObject({
      runtime: { executable: "node", version: "24.14.1" },
      activation: {
        topology: "observe-sign-upload-three-job-hard-cut",
        workflowPermissions: {},
        permissions: { observer: {}, signer: {}, upload: {} },
        observerCredentialedThirdPartyActions: "forbidden",
        signerThirdPartyActions: "forbidden",
        hostedBootstrap: { status: "unqualified-stop" },
      },
      oidc: {
        audience: "sigstore",
        request: {
          maximumRequestTokenBytes: 16_384,
          maximumRequestUrlBytes: 4_096,
          redirects: 0,
          retries: 0,
        },
      },
      transport: {
        redirects: 0,
        retries: 0,
        minimumTlsVersion: "TLSv1.2",
        maximumJsonDepth: 64,
        responseFraming: "exactly-one-content-length-or-chunked-transfer-encoding",
        fulcio: { successStatus: 200 },
        rekor: { successStatus: 201 },
      },
    });
    expect(signerPolicy.dependency).toMatchObject({
      package: "@sigstore/sign",
      version: "4.1.0",
      entrySource: "dist/bundler/dsse.js",
    });
    expect(signerPolicy.dependency.executedSources.map(({ path }: { path: string }) => path)).toEqual([
      "dist/bundler/dsse.js",
      "dist/bundler/base.js",
      "dist/bundler/bundle.js",
      "dist/util/index.js",
      "dist/util/oidc.js",
      "dist/util/ua.js",
    ]);
    for (
      const mutate of [
        (value: typeof contract) =>
          value.releaseCertification.readiness.externalEvidenceAuthentication.signer
            .transport.rekor.successStatus = 200,
        (value: typeof contract) =>
          value.releaseCertification.readiness.externalEvidenceAuthentication.signer
            .transport.responseFraming = "connection-delimited",
        (value: typeof contract) =>
          value.releaseCertification.readiness.externalEvidenceAuthentication.signer
            .activation.topology = "single-job",
        (value: typeof contract) =>
          value.releaseCertification.readiness.externalEvidenceAuthentication.signer
            .activation.permissions.signer = { "id-token": "write" },
        (value: typeof contract) =>
          value.releaseCertification.readiness.externalEvidenceAuthentication.signer
            .activation.hostedBootstrap.status = "qualified",
      ]
    ) {
      const changed = structuredClone(contract);
      mutate(changed);
      expect(() => sigstoreSignerPolicyFromContract(changed)).toThrow(/contract|transport/u);
    }
    const environment = {
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "OIDC-REQUEST-CANARY",
      ACTIONS_ID_TOKEN_REQUEST_URL:
        "https://pipelinesghubeus13.actions.githubusercontent.com/ABCDEFGHIJKLMNOPQRSTUVWX/12345678-1234-1234-1234-123456789abc/_apis/distributedtask/hubs/build/plans/ZYXWVUTSRQPONMLKJIHGFEDCBA987654/jobs/ABCDEFGHIJKLMNOPQRSTUVWX/idtoken?api-version=2.0",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_JOB: "sign",
      GITHUB_REF: futureIdentity.ref,
      GITHUB_REPOSITORY: futureIdentity.repository,
      GITHUB_SHA: sourceSha,
      GITHUB_WORKFLOW_REF: futureIdentity.workflow,
      GITHUB_WORKFLOW_SHA: sourceSha,
      SOURCE_SHA: sourceSha,
    };
    expect(validateSigstoreSigningEnvironment({ contract, environment, identity: futureIdentity, sourceSha }))
      .toMatchObject({ requestToken: "OIDC-REQUEST-CANARY" });
    for (
      const [name, value] of [
        ["SIGSTORE_ID_TOKEN", "JWT-CANARY"],
        ["NPM_TOKEN", "NPM-CANARY"],
        ["GITHUB_TOKEN", "GH-CANARY"],
        ["HTTPS_PROXY", "https://proxy.invalid"],
        ["NODE_EXTRA_CA_CERTS", "/tmp/ca.pem"],
        ["NODE_OPTIONS", "--require=/tmp/canary.js"],
        ["NODE_TLS_REJECT_UNAUTHORIZED", "0"],
        ["ACTIONS_RUNTIME_TOKEN", "ACTIONS-RUNTIME-CANARY"],
        ["GITHUB_ENV", "/tmp/github-env"],
        ["GITHUB_WORKFLOW_REF", `${futureIdentity.workflow}-peer`],
        ["GITHUB_JOB", "observe"],
        ["ACTIONS_ID_TOKEN_REQUEST_URL", "https://example.com/token"],
      ] as ReadonlyArray<readonly [string, string]>
    ) {
      expect(() =>
        validateSigstoreSigningEnvironment({
          contract,
          environment: { ...environment, [name]: value },
          identity: futureIdentity,
          sourceSha,
        })
      ).toThrow();
    }
    expect(() =>
      validateSigstoreSigningEnvironment({
        contract,
        environment: {
          ...environment,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "x".repeat(signerPolicy.oidc.request.maximumRequestTokenBytes + 1),
        },
        identity: futureIdentity,
        sourceSha,
      })
    ).toThrow();
    expect(() =>
      validateSigstoreSigningEnvironment({
        contract,
        environment: {
          ...environment,
          ACTIONS_ID_TOKEN_REQUEST_URL: environment.ACTIONS_ID_TOKEN_REQUEST_URL
            + "x".repeat(signerPolicy.oidc.request.maximumRequestUrlBytes),
        },
        identity: futureIdentity,
        sourceSha,
      })
    ).toThrow();
  });

  it("uses an exact TLS transport and never follows credential-bearing redirects", async () => {
    const successfulCalls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
    await expect(exactTransportRequest({}, successfulCalls)).resolves.toEqual({ ok: true });
    expect(successfulCalls).toHaveLength(1);
    expect(successfulCalls[0]!.url.href).toBe("https://fulcio.sigstore.dev/api/v2/signingCert");
    expect(successfulCalls[0]!.options).toMatchObject({
      agent: false,
      hostname: "fulcio.sigstore.dev",
      joinDuplicateHeaders: false,
      method: "POST",
      minVersion: "TLSv1.2",
      path: "/api/v2/signingCert",
      rejectUnauthorized: true,
      servername: "fulcio.sigstore.dev",
    });
    expect(successfulCalls[0]!.options.ca).toEqual(rootCertificates);
    expect(successfulCalls[0]!.options.headers).toMatchObject({
      Accept: "application/json",
      "Accept-Encoding": "identity",
      Connection: "close",
      "Content-Type": "application/json",
    });

    const rekorCalls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
    await expect(exactTransportRequest({ statusCode: 201 }, rekorCalls, {
      successStatus: 201,
      url: new URL("https://rekor.sigstore.dev/api/v2/log/entries"),
    })).resolves.toEqual({ ok: true });
    await expect(exactTransportRequest({ statusCode: 200 }, [], {
      successStatus: 201,
      url: new URL("https://rekor.sigstore.dev/api/v2/log/entries"),
    })).rejects.toThrow("Sigstore exact HTTPS transport failed");

    const responseLossCalls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
    const responseLoss = await exactTransportRequest({ statusCode: 201, terminalEvent: "error" }, responseLossCalls, {
      successStatus: 201,
      url: new URL("https://rekor.sigstore.dev/api/v2/log/entries"),
    }).catch((error: unknown) => error);
    expect(responseLoss).toBeInstanceOf(Error);
    expect((responseLoss as Error).message).toBe("Sigstore exact HTTPS transport failed");
    expect((responseLoss as Error).message).not.toContain("RESPONSE-LOSS-CANARY");
    expect(responseLossCalls).toHaveLength(1);

    for (const statusCode of [301, 302, 303, 307, 308]) {
      const calls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
      const failure = await exactTransportRequest({
        statusCode,
        rawHeaders: [
          "Content-Type",
          "application/json",
          "Content-Length",
          "2",
          "Location",
          "https://attacker.example/collect",
        ],
        chunks: ["{}"],
      }, calls).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("Sigstore exact HTTPS transport failed");
      expect((failure as Error).message).not.toContain("OIDC-JWT-CANARY");
      expect((failure as Error).cause).toBeUndefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url.origin).toBe("https://fulcio.sigstore.dev");
      expect(calls[0]!.body.toString()).toContain("OIDC-JWT-CANARY");
      expect(calls.some(({ url }) => url.origin === "https://attacker.example")).toBe(false);
    }
  });

  it("rejects duplicate, encoded, partial, truncated, and oversized terminal responses", async () => {
    const hostileResponses: ReadonlyArray<FakeResponse> = [
      {
        rawHeaders: [
          "Content-Type",
          "application/json",
          "Content-Type",
          "application/json",
          "Content-Length",
          "2",
        ],
        chunks: ["{}"],
      },
      {
        rawHeaders: [
          "Content-Type",
          "application/json",
          "Content-Length",
          "2",
          "X-Unrecognized",
          "one",
          "X-Unrecognized",
          "two",
        ],
        chunks: ["{}"],
      },
      {
        rawHeaders: ["Content-Type", "application/json"],
        chunks: ["{}"],
      },
      {
        rawHeaders: [
          "Content-Type",
          "application/json",
          "Content-Length",
          "2",
          "Transfer-Encoding",
          "chunked",
        ],
        chunks: ["{}"],
      },
      {
        rawHeaders: ["Content-Type", "application/json", "Content-Encoding", "gzip"],
        chunks: ["{}"],
      },
      {
        rawHeaders: ["Content-Type", "application/json", "Content-Length", "3"],
        chunks: ["{}"],
      },
      {
        rawHeaders: ["Content-Type", "application/json", "Content-Length", "1"],
        chunks: ["{}"],
      },
      {
        rawHeaders: ["Content-Type", "application/json", "Content-Length", "2"],
        chunks: ["{}"],
        complete: false,
      },
      {
        rawHeaders: ["Content-Type", "application/json", "Transfer-Encoding", "gzip, chunked"],
        chunks: ["{}"],
      },
    ];
    for (const response of hostileResponses) {
      const calls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
      await expect(exactTransportRequest(response, calls)).rejects.toThrow(
        "Sigstore exact HTTPS transport failed",
      );
      expect(calls).toHaveLength(1);
    }

    const oversizedCalls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
    await expect(exactTransportRequest({ chunks: ['{"oversized":true}'] }, oversizedCalls, {
      maximumResponseBytes: 2,
    })).rejects.toThrow("Sigstore exact HTTPS transport failed");
  });

  it("rejects duplicate JSON keys for OIDC, Fulcio, Rekor, and JWT payloads", async () => {
    for (
      const [url, response] of [
        [
          "https://pipelines.actions.githubusercontent.com/ABCDEFGHIJKLMNOPQRSTUVWX/12345678-1234-1234-1234-123456789abc/_apis/distributedtask/hubs/build/plans/ZYXWVUTSRQPONMLKJIHGFEDCBA987654/jobs/ABCDEFGHIJKLMNOPQRSTUVWX/idtoken?api-version=2.0&audience=sigstore",
          '{"value":"first","value":"second"}',
        ],
        [
          "https://fulcio.sigstore.dev/api/v2/signingCert",
          '{"signedCertificateEmbeddedSct":{"chain":{"certificates":[]},"chain":{"certificates":[]}}}',
        ],
        [
          "https://rekor.sigstore.dev/api/v2/log/entries",
          '{"logIndex":"1","logIndex":"2"}',
        ],
      ] as const
    ) {
      const calls: Array<{ readonly body: Buffer; readonly options: any; readonly url: URL }> = [];
      const body = Buffer.from(response);
      await expect(exactTransportRequest(
        {
          chunks: [body],
          rawHeaders: ["Content-Type", "application/json", "Content-Length", `${body.byteLength}`],
        },
        calls,
        { url: new URL(url) },
      )).rejects.toThrow("Sigstore exact HTTPS transport failed");
      expect(calls).toHaveLength(1);
    }

    const duplicateSubjectPayload = Buffer.from('{"sub":"first","sub":"second"}').toString("base64url");
    expect(() => decodeStrictJwtSubject(`header.${duplicateSubjectPayload}.signature`, 64)).toThrow(
      /OIDC identity token/u,
    );
  });

  it("rejects endpoint authority escape before any token-bearing network request", () => {
    const changed = structuredClone(contract);
    changed.releaseCertification.readiness.externalEvidenceAuthentication.signer.transport.fulcio.path =
      "//attacker.example/collect";
    expect(() => sigstoreSignerPolicyFromContract(changed)).toThrow(/transport/u);
    expect(() =>
      exactSigstoreEndpointUrl({
        origin: "https://fulcio.sigstore.dev",
        path: "//attacker.example/collect",
      })
    ).toThrow(/escaped/u);
  });

  it("does not propagate upstream signing errors that can contain identity tokens", async () => {
    const identityTokenCanary = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJjYW5hcnkifQ.signature";
    const failure = await runOpaqueSigstoreSigningOperation(() => {
      throw new Error(`invalid identity token: ${identityTokenCanary}`);
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Sigstore signing operation failed without credential details");
    expect((failure as Error).message).not.toContain(identityTokenCanary);
    expect((failure as Error).cause).toBeUndefined();
  });

  it("leaves the npm credential interface explicitly unprovisioned and non-ingestable", () => {
    expect(npmAuthorityCredentialInterface.status).toBe("unprovisioned-stop");
    expect(npmAuthorityCredentialInterface.requiredObservations).toContain(
      "authenticated-npm-trust-list-for-all-eleven-packages",
    );
    expect(npmAuthorityCredentialInterface.requiredObservations).toContain(
      "authenticated-empty-npm-access-token-inventory-at-registry-npmjs-org",
    );
    expect(npmAuthorityCredentialInterface.requiredObservations).toContain(
      "authenticated-publishing-access-require-two-factor-authentication-and-disallow-tokens-for-all-twelve-authority-packages",
    );
    expect(npmAuthorityCredentialInterface.credentialRequirements).toEqual([
      "ephemeral-observation-only-mannyc1-session",
      "npm-account-two-factor-authentication-required",
      "npm-package-write-permission-required-for-trust-observation",
      "not-a-github-secret-variable-workflow-input-or-artifact",
      "not-an-npm-token-environment-variable",
      "never-logged-hashed-signed-or-uploaded",
      "destroyed-before-sigstore-oidc-signing",
    ]);
    expect(() => assertNpmAuthorityObservationMechanismSupported())
      .toThrow(npmAuthorityCredentialInterface.blocker);
  });

  it("leaves the GitHub Administration-read interface explicitly unprovisioned and non-ingestable", () => {
    expect(githubReleaseGovernanceObservationInterface).toMatchObject({
      status: "unprovisioned-stop",
      endpoint: "repos/mannyc2/effect-build/immutable-releases",
      requiredPermission: "repository-administration-read",
    });
    expect(githubReleaseGovernanceObservationInterface.credentialRequirements).toEqual([
      "ephemeral-read-only-repository-administration-authority",
      "not-the-workflow-github-token",
      "not-a-github-secret-variable-workflow-input-or-artifact",
      "never-logged-hashed-signed-or-uploaded",
      "destroyed-before-sigstore-oidc-signing",
    ]);
    expect(() => assertGithubReleaseGovernanceObservationMechanismSupported())
      .toThrow(githubReleaseGovernanceObservationInterface.blocker);
  });

  it("runs both production CLIs only into the generated blocker and emits no files or credential text", async () => {
    const output = await mkdtemp(resolve(tmpdir(), "effect-build-producer-stop-"));
    try {
      for (const script of ["produce-npm-authority.mjs", "produce-github-release-governance.mjs"]) {
        const result = spawnSync(process.execPath, [resolve(root, "scripts/release", script)], {
          cwd: root,
          encoding: "utf8",
          env: {
            GITHUB_TOKEN: "REPOSITORY-TOKEN-CANARY",
            LANG: "C.UTF-8",
            OUTPUT_DIRECTORY: output,
            PATH: process.env.PATH,
            SOURCE_SHA: sourceSha,
          },
        });
        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain(readiness.externalEvidenceAuthentication.blocker);
        expect(`${result.stdout}${result.stderr}`).not.toContain("REPOSITORY-TOKEN-CANARY");
        expect(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8")).not.toContain(
          "REPOSITORY-TOKEN-CANARY",
        );
      }
    } finally {
      await rm(output, { force: true, recursive: true });
    }
  });
});
