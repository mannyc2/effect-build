import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
// Public evidence from the first 0.6.1 publication, whose real verifier rejected
// the missing signer.identity.oids projection. This fixture never needs network.
// https://registry.npmjs.org/-/npm/v1/attestations/effect-build@0.6.1
// https://github.com/mannyc2/effect-build/actions/runs/33986310546
const fixtureSourceSha = "3952abd1a31ab143c83f4a6c93e2c3a391e04859";
const fixture = JSON.parse(readFileSync(
  resolve(root, "test/fixtures/release/effect-build-0.6.1-provenance.json"),
  "utf8",
));
const identity = "https://github.com/mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main";

// The protected publisher runs only on Ubuntu and selects the POSIX npm executable.
describe.skipIf(process.platform === "win32")("real npm-bundled publication provenance verifier", () => {
  let nodeExecutable: string;
  let npmRoot: string;
  let verifierSource: string;

  beforeAll(() => {
    const node = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" });
    expect(node.status, node.stderr).toBe(0);
    nodeExecutable = node.stdout.trim();
    expect(spawnSync(nodeExecutable, ["--version"], { encoding: "utf8" }).stdout.trim())
      .toBe("v24.14.1");
    const npm = (process.env.PATH ?? "").split(delimiter)
      .map((directory) => resolve(directory, "npm"))
      .find(existsSync);
    if (npm === undefined) throw new Error("pinned npm executable is unavailable");
    npmRoot = resolve(dirname(realpathSync(npm)), "..");
    for (
      const [name, version] of [
        [".", "11.11.0"],
        ["node_modules/@sigstore/verify", "3.1.0"],
        ["node_modules/@sigstore/bundle", "4.0.0"],
        ["node_modules/@sigstore/protobuf-specs", "0.5.0"],
        ["node_modules/@sigstore/core", "3.1.0"],
      ]
    ) {
      const manifest = JSON.parse(readFileSync(resolve(npmRoot, name!, "package.json"), "utf8"));
      expect(manifest.version, name).toBe(version);
    }
    const workflow = parse(readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"));
    const publisher = workflow.jobs["protected-npm"].steps.find(
      (step: { name?: string }) => step.name === "Adopt, compare, and publish only certified bytes",
    ).run as string;
    const start = publisher.indexOf("const verifierSource = ");
    const end = publisher.indexOf("\nconst verifyProvenance = ", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const expression = publisher.slice(start + "const verifierSource = ".length, end).trim();
    verifierSource = runInNewContext(expression);
    expect(typeof verifierSource).toBe("string");
  });

  const verify = async (bundle: object, sourceSha = fixtureSourceSha) => {
    const scratch = await mkdtemp(join(tmpdir(), "effect-build-real-provenance-"));
    try {
      const bundlePath = resolve(scratch, "bundle.json");
      await writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });
      const contract = JSON.parse(readFileSync(resolve(root, "tooling/effect-build-contract.json"), "utf8"));
      const policy = contract.releaseCertification.provenanceVerification;
      const trustedRootPath = resolve(root, policy.trustedRoot.path);
      return spawnSync(nodeExecutable, [
        "--permission",
        `--allow-fs-read=${npmRoot}`,
        `--allow-fs-read=${bundlePath}`,
        `--allow-fs-read=${trustedRootPath}`,
        "--input-type=module",
        "--eval",
        verifierSource,
        ...["@sigstore/verify", "@sigstore/bundle", "@sigstore/protobuf-specs"].map((name) =>
          resolve(npmRoot, "node_modules", name, "dist/index.js")
        ),
        bundlePath,
        trustedRootPath,
        String(policy.trustedRoot.bytes),
        policy.trustedRoot.digest,
        policy.trustedRoot.mediaType,
        identity,
        "https://token.actions.githubusercontent.com",
        "mannyc2/effect-build",
        sourceSha,
        policy.certificateOids.buildSignerUri,
        policy.certificateOids.sourceRepositoryUri,
        policy.certificateOids.sourceRepositoryDigest,
      ], {
        cwd: root,
        encoding: "utf8",
        env: {
          HOME: scratch,
          LANG: "C.UTF-8",
          PATH: process.env.PATH,
          RUNNER_TEMP: scratch,
          TMPDIR: scratch,
          LC_ALL: "C",
        },
        shell: false,
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  };

  it("verifies the public bundle with npm 11.11.0's real verifier 3.1.0", async () => {
    const result = await verify(fixture);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("rejects a source SHA that differs from the verified certificate", async () => {
    const result = await verify(fixture, "2".repeat(40));
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("verified provenance signer OID changed: 1.3.6.1.4.1.57264.1.13");
  });

  it("rejects a tampered signed payload before accepting its certificate OIDs", async () => {
    const tampered = structuredClone(fixture);
    const payload = Buffer.from(tampered.dsseEnvelope.payload, "base64");
    payload[0] = payload[0]! ^ 1;
    tampered.dsseEnvelope.payload = payload.toString("base64");
    const result = await verify(tampered);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("verified provenance signer OID changed");
  });
});
