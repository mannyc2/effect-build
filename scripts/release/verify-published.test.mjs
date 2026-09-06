import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyProvenance } from "./verify-published.mjs";

const repository = "mannyc2/effect-build";
const manifest = { version: "0.6.4", tag: "v0.6.4", sourceSha: "a".repeat(40) };
const digest = Buffer.alloc(64, 1);
const entry = { name: "effect-build", integrity: `sha512-${digest.toString("base64")}` };
const statement = () => ({
  _type: "https://in-toto.io/Statement/v1",
  predicateType: "https://slsa.dev/provenance/v1",
  subject: [{ name: "pkg:npm/effect-build@0.6.4", digest: { sha512: digest.toString("hex") } }],
  predicate: {
    buildDefinition: {
      externalParameters: {
        workflow: {
          repository: `https://github.com/${repository}`,
          path: ".github/workflows/release.yml",
          ref: "refs/tags/v0.6.4",
        },
      },
      resolvedDependencies: [{
        uri: `git+https://github.com/${repository}@refs/tags/v0.6.4`,
        digest: { gitCommit: manifest.sourceSha },
      }],
    },
  },
});
const bundleOf = (value) => ({ dsseEnvelope: { payload: Buffer.from(JSON.stringify(value)).toString("base64") } });

// This substitute checks the boundary and identity policy only. Authenticating real signatures,
// certificates, and transparency evidence belongs to the maintained Sigstore verifier.
test("candidate identity is accepted only after the supplied verifier authenticates that same bundle", async () => {
  const bundle = bundleOf(statement());
  let verified = false;
  const encoded = bundle.dsseEnvelope.payload;
  Object.defineProperty(bundle.dsseEnvelope, "payload", {
    get: () => {
      assert.equal(verified, true, "policy must inspect an authenticated bundle");
      return encoded;
    },
  });
  const verifier = {
    verify: async (received) => {
      assert.equal(received, bundle);
      await Promise.resolve();
      verified = true;
    },
  };
  await verifyProvenance({ bundle, verifier, entry, manifest, repository });
  assert.equal(verified, true);
});

const mismatches = [
  ["source commit", (value) => {
    value.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40);
  }],
  ["package subject", (value) => {
    value.subject[0].name = "pkg:npm/another-package@0.6.4";
  }],
  ["package bytes", (value) => {
    value.subject[0].digest.sha512 = Buffer.alloc(64, 2).toString("hex");
  }],
  ["workflow", (value) => {
    value.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/ci.yml";
  }],
  ["release tag", (value) => {
    value.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/v0.6.3";
  }],
];
for (const [label, change] of mismatches) {
  test(`an authenticated statement for a different ${label} cannot verify this candidate`, async () => {
    const value = statement();
    change(value);
    const bundle = bundleOf(value);
    let authenticated;
    const verifier = {
      verify: async (received) => {
        authenticated = received;
      },
    };
    await assert.rejects(verifyProvenance({ bundle, verifier, entry, manifest, repository }), {
      message: /authenticated provenance does not identify this candidate/u,
    });
    assert.equal(authenticated, bundle);
  });
}

test("matching claimed identity cannot override the cryptographic verifier's rejection", async () => {
  const rejected = new Error("signature verification rejected");
  const verifier = {
    verify: async () => {
      throw rejected;
    },
  };
  await assert.rejects(
    verifyProvenance({ bundle: bundleOf(statement()), verifier, entry, manifest, repository }),
    (error) => error === rejected,
  );
});
