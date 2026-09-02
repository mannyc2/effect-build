import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The verifier is an intentionally unprotected Node script module.
import * as sigstoreVerifier from "../../scripts/release/sigstore-dsse-verifier.mjs";
// @ts-expect-error The release protocol is an intentionally unprotected Node script module.
import { canonicalJson } from "../../scripts/release/protocol.mjs";

const {
  validateIsolatedChildEnvironment,
  validateTrustedRootBytes,
  validateVerifiedSignerIdentity,
  validateVerifierRuntime,
  verifySigstoreBundleIsolated,
} = sigstoreVerifier;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
const verifier = contract.releaseCertification.provenanceVerification;
const trustedRootBytes = Buffer.from(await readFile(resolve(root, verifier.trustedRoot.path)));
const sourceSha = "a".repeat(40);
const identity = {
  certificateIdentityURI: "https://github.com/mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
  certificateIssuer: verifier.certificateIssuer,
  repository: "mannyc2/effect-build",
};
const options = {
  certificateIssuer: identity.certificateIssuer,
  certificateIdentityURI: `^${identity.certificateIdentityURI.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
  ctLogThreshold: 1,
  tlogThreshold: 1,
};
const derUtf8 = (value: string) => {
  const payload = Buffer.from(value);
  return Buffer.concat([Buffer.from([0x0c, payload.byteLength]), payload]);
};
const signer = () => ({
  identity: {
    subjectAlternativeName: identity.certificateIdentityURI,
    extensions: { issuer: identity.certificateIssuer },
    oids: [
      {
        oid: { id: verifier.certificateOids.buildSignerUri.split(".").map(Number) },
        value: derUtf8(identity.certificateIdentityURI),
      },
      {
        oid: { id: verifier.certificateOids.sourceRepositoryUri.split(".").map(Number) },
        value: derUtf8(`https://github.com/${identity.repository}`),
      },
      {
        oid: { id: verifier.certificateOids.sourceRepositoryDigest.split(".").map(Number) },
        value: derUtf8(sourceSha),
      },
    ],
  },
});

describe("npm provenance Sigstore verifier", () => {
  it("uses the exact top-level npm provenance policy and vendored TUF target", async () => {
    expect(verifier.purpose).toBe("npm-publication-provenance-verification-only");
    expect(verifier.module).toBe("scripts/release/sigstore-dsse-verifier.mjs");
    expect(contract.releaseCertification.readiness).not.toHaveProperty("externalEvidenceAuthentication");
    expect(() => validateTrustedRootBytes({ trustedRootBytes, verifier })).not.toThrow();
    expect(validateVerifierRuntime({ runtime: verifier.runtime, observedVersion: "v24.14.1" })).toEqual({
      executable: "node",
      version: "24.14.1",
    });
    expect(() => validateVerifierRuntime({ runtime: verifier.runtime, observedVersion: "v24.14.0" }))
      .toThrow(/runtime differs/u);

    const mutated = Buffer.from(trustedRootBytes);
    const last = mutated.byteLength - 1;
    mutated[last] = mutated[last]! ^ 1;
    expect(() => validateTrustedRootBytes({ trustedRootBytes: mutated, verifier })).toThrow(/bytes differ/u);

    const source = await readFile(resolve(root, verifier.module), "utf8");
    expect(source).not.toContain("verifyExternalEvidenceEnvelope");
    expect(source).not.toContain("producerIdentities");
    expect(source).not.toContain("@sigstore/sign");
  });

  it("executes verification in one credential-free isolated child", async () => {
    const expectedSigner = signer();
    const projection = {
      identity: {
        extensions: expectedSigner.identity.extensions,
        oids: expectedSigner.identity.oids.map((entry) => ({
          oid: entry.oid,
          valueBase64: Buffer.from(entry.value).toString("base64"),
        })),
        subjectAlternativeName: expectedSigner.identity.subjectAlternativeName,
      },
    };
    const spawn = vi.fn((executable, argv, childOptions) => {
      expect(executable).toBe("node");
      expect(argv).toContain("--permission");
      expect(argv).toContain(`--require=${resolve(root, "scripts/release/deny-network.cjs")}`);
      expect(argv).toContain(resolve(root, "scripts/release/sigstore-dsse-verifier.mjs"));
      expect(Object.keys(childOptions.env).sort()).toEqual([
        "HOME",
        "LANG",
        "PATH",
        "TMPDIR",
        "__CF_USER_TEXT_ENCODING",
      ]);
      expect(JSON.stringify(childOptions.env)).not.toContain("SECRET-CANARY");
      expect(JSON.parse(childOptions.input).trustedRootBase64).toBe(trustedRootBytes.toString("base64"));
      expect(childOptions.timeout).toBe(120_000);
      expect(childOptions.shell).toBe(false);
      return { status: 0, stdout: canonicalJson(projection) };
    });
    const observed = await verifySigstoreBundleIsolated({ dsseEnvelope: {} }, options, {
      contract,
      environment: {
        GITHUB_TOKEN: "SECRET-CANARY",
        NPM_TOKEN: "SECRET-CANARY",
        LANG: "C.UTF-8",
        PATH: process.env.PATH,
      },
      spawn,
      trustedRootBytes,
    });
    expect(observed).toEqual(expectedSigner);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("admits only exact GitHub workflow signer OIDs", () => {
    expect(validateVerifiedSignerIdentity({
      signer: signer(),
      verifier,
      identity,
      producerSourceSha: sourceSha,
    })).toEqual(signer());
    const hostile = signer();
    hostile.identity.oids[2]!.value = derUtf8("b".repeat(40));
    expect(() =>
      validateVerifiedSignerIdentity({
        signer: hostile,
        verifier,
        identity,
        producerSourceSha: sourceSha,
      })
    ).toThrow(/OID/u);
  });

  it("admits only the minimal platform-specific child environment", () => {
    const linux = {
      HOME: "/tmp/home",
      LANG: "C.UTF-8",
      PATH: "/bin",
      TMPDIR: "/tmp",
      __CF_USER_TEXT_ENCODING: "0x0:0x0",
    };
    expect(validateIsolatedChildEnvironment(linux, "linux")).toBe(linux);
    expect(() => validateIsolatedChildEnvironment({ ...linux, NPM_TOKEN: "canary" }, "linux"))
      .toThrow(/non-allowlisted/u);
  });
});
