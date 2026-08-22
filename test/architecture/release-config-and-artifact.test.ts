import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(new URL("../..", import.meta.url).pathname);
const source = "1".repeat(40);
const packageNames = [
  "effect-build",
  "effect-build-bun",
  "effect-build-deno",
  "effect-build-esbuild",
  "effect-build-node-sea",
] as const;
const consumerFixtures = [
  ...packageNames.map((name) => `npm-${name}`),
  "npm-esbuild-node-sea",
  "npm-bun-node-sea",
  ...packageNames.map((name) => `bun-${name}`),
  "bun-esbuild-node-sea",
  "bun-bun-node-sea",
] as const;

interface ReleaseConfigModule {
  readonly releasePackageNames: readonly string[];
  readonly generateReleaseConfig: (input: {
    readonly manifest: unknown;
    readonly candidateDirectory: string;
    readonly source: string;
  }) => Record<string, unknown>;
  readonly serializeReleaseConfig: (config: unknown) => string;
  readonly parseReleaseConfigArguments: (argv: readonly string[]) => Record<string, unknown>;
}

interface ReleaseArtifactModule {
  readonly rawCandidateArtifactName: string;
  readonly parsePreparedReference: (value: unknown) => {
    owner: string;
    repository: string;
    runId: string;
    attempt: string;
    artifactName: string;
    digest: string;
  };
  readonly prepareReportArtifactName: (attempt: string) => string;
  readonly verifyActionReport: (input: {
    readonly report: unknown;
    readonly command: "prepare" | "publish";
    readonly preparedRef: string;
  }) => unknown;
  readonly parseReleaseArtifactArguments: (argv: readonly string[]) => Record<string, unknown>;
  readonly verifyReleaseEvidence: (input: {
    readonly evidence: unknown;
    readonly source: string;
    readonly candidateRunId: string;
    readonly candidateArtifactId: string;
    readonly candidateArtifactDigest: string;
    readonly preparedRef: string;
  }) => Record<string, unknown>;
  readonly verifyReleaseArtifact: (
    input: {
      readonly evidence: unknown;
      readonly candidateDirectory: string;
      readonly source: string;
      readonly candidateRunId: string;
      readonly candidateArtifactId: string;
      readonly candidateArtifactDigest: string;
      readonly preparedRef: string;
    },
    dependencies?: {
      readonly verifyCandidate?: (input: { readonly directory: string; readonly source: string }) => Promise<unknown>;
    },
  ) => Promise<Record<string, unknown>>;
}

const loadScript = async <T>(name: string): Promise<T> =>
  await import(pathToFileURL(resolve(root, "scripts", name)).href) as T;

const dependencies = (name: string): Record<string, string> =>
  name === "effect-build"
    ? {}
    : name === "effect-build-esbuild"
    ? { "effect-build": "^0.3.0", esbuild: "0.28.2" }
    : { "effect-build": "^0.3.0" };

const manifestFixture = () => ({
  version: 2,
  source,
  packages: packageNames.map((name, index) => ({
    filename: `${name}-0.3.0.tgz`,
    name,
    version: "0.3.0",
    bytes: 100 + index,
    sha256: `${index + 1}`.repeat(64),
    dependencies: dependencies(name),
    peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
    optionalDependencies: {},
  })),
  consumers: consumerFixtures.map((fixture, index) => {
    const npm = fixture.startsWith("npm-");
    return {
      fixture,
      installer: npm ? "npm@11.11.0" : "bun@1.3.14",
      lockfile: npm ? "package-lock.json" : "bun.lock",
      lockSha256: `${(index % 6) + 4}`.repeat(64),
      treeSha256: `${(index % 6) + 4}`.repeat(64),
    };
  }),
});

const runId = "31880000001";
const attempt = "2";
const rawArtifactId = "9250000001";
const rawDigest = `sha256:${"8".repeat(64)}`;
const preparedDigest = "9".repeat(64);
const preparedArtifactName = `ts-release-prepared-${attempt}-${preparedDigest}`;
const preparedRef =
  `prepared:gha:mannyc2/effect-build/runs/${runId}/attempts/${attempt}/artifacts/${preparedArtifactName}#sha256-${preparedDigest}`;

const artifact = (id: string, name: string, digest: string) => ({
  id: Number(id),
  name,
  expired: false,
  digest,
  workflow_run: {
    id: Number(runId),
    head_branch: "codex/granular-integration-program",
    head_sha: source,
  },
});

const evidenceFixture = () => ({
  run: {
    id: Number(runId),
    run_attempt: Number(attempt),
    name: "Release",
    path: ".github/workflows/release.yml",
    event: "workflow_dispatch",
    head_branch: "codex/granular-integration-program",
    head_sha: source,
    status: "completed",
    conclusion: "success",
    repository: { full_name: "mannyc2/effect-build" },
  },
  artifacts: {
    total_count: 3,
    artifacts: [
      artifact(rawArtifactId, "effect-build-0.3.0-candidate", rawDigest),
      artifact("9250000002", preparedArtifactName, `sha256:${"a".repeat(64)}`),
      artifact("9250000003", `effect-build-0.3.0-prepare-report-${attempt}`, `sha256:${"b".repeat(64)}`),
    ],
  },
  prepareReport: {
    schemaVersion: "ts-release-action-report/v2",
    command: "prepare",
    status: "complete",
    prepared: preparedRef,
  },
});

const verifyEvidence = async (evidence: unknown): Promise<Record<string, unknown>> => {
  const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
  return verifier.verifyReleaseEvidence({
    evidence,
    source,
    candidateRunId: runId,
    candidateArtifactId: rawArtifactId,
    candidateArtifactDigest: rawDigest,
    preparedRef,
  });
};

describe("Plan 037 release config", () => {
  it("keeps the exact private workspace identity observed by the qualified Action", async () => {
    expect(JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))).toMatchObject({
      name: "effect-build-workspace",
      version: "0.3.0",
      private: true,
    });
  });

  it("authors five exact prepacked npm subjects in dependency order followed by GitHub", async () => {
    const generator = await loadScript<ReleaseConfigModule>("write-release-config.mjs");
    expect(generator.releasePackageNames).toEqual(packageNames);

    const config = generator.generateReleaseConfig({
      manifest: manifestFixture(),
      candidateDirectory: "outputs/effect-build-candidate",
      source,
    });
    expect(config).toEqual({
      $schema:
        "https://raw.githubusercontent.com/mannyc2/ts-release/105b6b5cc39757f5284c30b082e7cfd71b9959b2/schema/release-config.schema.json",
      project: {
        name: "effect-build",
        repository: "mannyc2/effect-build",
        version: "0.3.0",
        tag: "v0.3.0",
      },
      publish: {
        prepackedNpm: packageNames.map((name, index) => ({
          id: name,
          path: `outputs/effect-build-candidate/${name}-0.3.0.tgz`,
          packageName: name,
          version: "0.3.0",
          sha256: `${index + 1}`.repeat(64),
          registry: "https://registry.npmjs.org/",
          distTag: "latest",
          access: "public",
          authentication: {
            strategy: "trusted-publishing",
            attestation: {
              provider: "github-actions",
              runner: "github-hosted",
              repository: "mannyc2/effect-build",
              workflow: "release.yml",
              workflowRef: "refs/heads/codex/granular-integration-program",
              allowedAction: "npm-publish-direct",
            },
          },
          provenance: "automatic",
        })),
        github: {
          repository: "mannyc2/effect-build",
          tokenEnv: "GITHUB_TOKEN",
          draft: false,
          prerelease: false,
          ids: packageNames.map((name) => `prepacked-npm:${name}`),
        },
      },
    });
    expect(generator.serializeReleaseConfig(config)).toBe(`${JSON.stringify(config, null, 2)}\n`);
    expect(Object.keys(config.publish as Record<string, unknown>)).toEqual(["prepackedNpm", "github"]);
    expect(JSON.stringify(config)).not.toMatch(/npmPackage|"npm"\s*:|strategy":"token"|adapter|source-pack/i);
  });

  it("fails closed on malformed, mixed, reordered, foreign, and hash-invalid manifest v2 input", async () => {
    const { generateReleaseConfig } = await loadScript<ReleaseConfigModule>("write-release-config.mjs");
    const valid = manifestFixture();
    const cases: Array<readonly [string, unknown, string]> = [
      ["schema", { ...valid, version: 1 }, "manifest"],
      ["source", { ...valid, source: "b".repeat(40) }, "source"],
      ["extra key", { ...valid, extra: true }, "keys"],
      ["mixed version", {
        ...valid,
        packages: valid.packages.map((item, index) => index === 1 ? { ...item, version: "0.3.1" } : item),
      }, "effect-build-bun"],
      ["foreign package", {
        ...valid,
        packages: valid.packages.map((item, index) => index === 2 ? { ...item, name: "foreign" } : item),
      }, "effect-build-deno"],
      ["reordered package", { ...valid, packages: [...valid.packages].reverse() }, "effect-build"],
      ["invalid hash", {
        ...valid,
        packages: valid.packages.map((item, index) => index === 3 ? { ...item, sha256: "A".repeat(64) } : item),
      }, "effect-build-esbuild"],
      ["missing consumer", { ...valid, consumers: valid.consumers.slice(1) }, "consumer"],
    ];
    for (const [label, manifest, message] of cases) {
      expect(
        () => generateReleaseConfig({ manifest, candidateDirectory: "outputs/effect-build-candidate", source }),
        label,
      ).toThrow(new RegExp(message, "i"));
    }
    for (const directory of ["/tmp/candidate", ".", "../candidate", "outputs//candidate", "outputs\\candidate"]) {
      expect(() => generateReleaseConfig({ manifest: valid, candidateDirectory: directory, source }), directory)
        .toThrow(/candidate directory/i);
    }
  });

  it("accepts only the fixed ignored candidate path and explicit deterministic CLI channels", async () => {
    const generator = await loadScript<ReleaseConfigModule>("write-release-config.mjs");
    expect(generator.parseReleaseConfigArguments([
      "--manifest",
      "/tmp/manifest.json",
      "--candidate-directory",
      "outputs/effect-build-candidate",
      "--source",
      source,
      "--output",
      "/tmp/release.config.json",
    ])).toEqual({
      manifest: "/tmp/manifest.json",
      candidateDirectory: "outputs/effect-build-candidate",
      source,
      output: "/tmp/release.config.json",
    });
    expect(() =>
      generator.parseReleaseConfigArguments([
        "--manifest",
        "manifest.json",
        "--candidate-directory",
        "outputs/effect-build-candidate",
        "--source",
        source,
        "--output",
        "/tmp/release.config.json",
      ])
    ).toThrow(/usage/i);
  });
});

describe("Plan 037 exact release artifact evidence", () => {
  it("binds the successful candidate run, raw bytes, prepared artifact, and preparation report", async () => {
    const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
    expect(verifier.rawCandidateArtifactName).toBe("effect-build-0.3.0-candidate");
    expect(verifier.prepareReportArtifactName(attempt)).toBe(`effect-build-0.3.0-prepare-report-${attempt}`);
    expect(verifier.parsePreparedReference(preparedRef)).toEqual({
      owner: "mannyc2",
      repository: "effect-build",
      runId,
      attempt,
      artifactName: preparedArtifactName,
      digest: preparedDigest,
    });
    await expect(verifyEvidence(evidenceFixture())).resolves.toEqual({
      source,
      runId,
      attempt,
      rawArtifactId,
      rawArtifactDigest: rawDigest,
      preparedArtifactName,
      preparedDigest,
      prepareReportArtifactName: `effect-build-0.3.0-prepare-report-${attempt}`,
    });
  });

  it("rejects foreign workflow, event, path, branch, source, and non-successful runs", async () => {
    const mutations: Array<readonly [string, (evidence: ReturnType<typeof evidenceFixture>) => void]> = [
      ["repository", (value) => void (value.run.repository.full_name = "foreign/effect-build")],
      ["workflow", (value) => void (value.run.name = "CI")],
      ["path", (value) => void (value.run.path = ".github/workflows/other.yml")],
      ["event", (value) => void (value.run.event = "push")],
      ["branch", (value) => void (value.run.head_branch = "main")],
      ["head SHA", (value) => void (value.run.head_sha = "c".repeat(40))],
      ["status", (value) => void (value.run.status = "in_progress")],
      ["conclusion", (value) => void (value.run.conclusion = "failure")],
    ];
    for (const [field, mutate] of mutations) {
      const evidence = evidenceFixture();
      mutate(evidence);
      await expect(() => verifyEvidence(evidence), field).rejects.toThrow(
        new RegExp(field.replace("head SHA", "head"), "i"),
      );
    }
  });

  it("rejects wrong, duplicate, expired, and hash-mismatched raw artifacts", async () => {
    const wrongId = evidenceFixture();
    wrongId.artifacts.artifacts[0]!.id += 100;
    await expect(() => verifyEvidence(wrongId)).rejects.toThrow(/artifact id/i);

    const wrongDigest = evidenceFixture();
    wrongDigest.artifacts.artifacts[0]!.digest = `sha256:${"7".repeat(64)}`;
    await expect(() => verifyEvidence(wrongDigest)).rejects.toThrow(/digest/i);

    const expired = evidenceFixture();
    expired.artifacts.artifacts[0]!.expired = true;
    await expect(() => verifyEvidence(expired)).rejects.toThrow(/expired/i);

    const duplicateName = evidenceFixture();
    duplicateName.artifacts.artifacts.push({ ...duplicateName.artifacts.artifacts[0]!, id: 9250000999 });
    duplicateName.artifacts.total_count += 1;
    await expect(() => verifyEvidence(duplicateName)).rejects.toThrow(/duplicate.*name/i);

    const duplicateId = evidenceFixture();
    duplicateId.artifacts.artifacts[1]!.id = duplicateId.artifacts.artifacts[0]!.id;
    await expect(() => verifyEvidence(duplicateId)).rejects.toThrow(/duplicate.*id/i);

    const countMismatch = evidenceFixture();
    countMismatch.artifacts.total_count = 99;
    await expect(() => verifyEvidence(countMismatch)).rejects.toThrow(/total_count/i);

    const extra = evidenceFixture();
    extra.artifacts.artifacts.push(artifact("9250000997", "unclassified-release-output", `sha256:${"c".repeat(64)}`));
    extra.artifacts.total_count += 1;
    await expect(() => verifyEvidence(extra)).rejects.toThrow(/exactly three role artifacts/i);
  });

  it("rejects malformed, foreign, or wrong-identity prepared references and artifacts", async () => {
    const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
    for (
      const malformed of [
        "prepared:local:sha256-" + preparedDigest,
        preparedRef.replace("mannyc2/effect-build", "foreign/effect-build"),
        preparedRef.replace(`/attempts/${attempt}/`, "/attempts/1/"),
        preparedRef.replace(`ts-release-prepared-${attempt}-`, "prepared-"),
        preparedRef.replace(/#sha256-[0-9a-f]{64}$/, `#sha256-${"A".repeat(64)}`),
      ]
    ) {
      expect(() => verifier.parsePreparedReference(malformed)).toThrow(/prepared|reference|artifact|digest/i);
    }
    expect(() =>
      verifier.verifyReleaseEvidence({
        evidence: evidenceFixture(),
        source,
        candidateRunId: runId,
        candidateArtifactId: rawArtifactId,
        candidateArtifactDigest: rawDigest,
        preparedRef: preparedRef.replace(`/runs/${runId}/`, "/runs/1/"),
      })
    ).toThrow(/prepared reference run id/i);

    const missing = evidenceFixture();
    missing.artifacts.artifacts.splice(1, 1);
    missing.artifacts.total_count -= 1;
    await expect(() => verifyEvidence(missing)).rejects.toThrow(/exactly three role artifacts|prepared artifact/i);

    const expired = evidenceFixture();
    expired.artifacts.artifacts[1]!.expired = true;
    await expect(() => verifyEvidence(expired)).rejects.toThrow(/prepared artifact.*expired/i);
  });

  it("keeps prepared-content and REST transport digests as independent domains", async () => {
    const coincidentalDigest = evidenceFixture();
    coincidentalDigest.artifacts.artifacts[1]!.digest = `sha256:${preparedDigest}`;
    await expect(verifyEvidence(coincidentalDigest)).resolves.toMatchObject({ preparedDigest });
  });

  it("keeps preparation and publication report roles distinct and exact", async () => {
    const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
    const mutations: Array<readonly [string, (evidence: ReturnType<typeof evidenceFixture>) => void]> = [
      ["schema", (value) => void (value.prepareReport.schemaVersion = "other/v1")],
      ["command", (value) => void (value.prepareReport.command = "publish")],
      ["status", (value) => void (value.prepareReport.status = "blocked")],
      ["prepared", (value) => void (value.prepareReport.prepared = preparedRef.replace(`/runs/${runId}/`, "/runs/1/"))],
    ];
    for (const [field, mutate] of mutations) {
      const evidence = evidenceFixture();
      mutate(evidence);
      await expect(() => verifyEvidence(evidence), field).rejects.toThrow(new RegExp(field, "i"));
    }
    const extra = evidenceFixture() as ReturnType<typeof evidenceFixture> & { prepareReport: Record<string, unknown> };
    extra.prepareReport.report = { status: "complete" };
    await expect(() => verifyEvidence(extra)).rejects.toThrow(/prepare report.*keys/i);

    const duplicate = evidenceFixture();
    duplicate.artifacts.artifacts.push({ ...duplicate.artifacts.artifacts[2]!, id: 9250000998 });
    duplicate.artifacts.total_count += 1;
    await expect(() => verifyEvidence(duplicate)).rejects.toThrow(/duplicate.*name/i);

    const expired = evidenceFixture();
    expired.artifacts.artifacts[2]!.expired = true;
    await expect(() => verifyEvidence(expired)).rejects.toThrow(/prepare report artifact.*expired/i);

    expect(verifier.verifyActionReport({
      command: "publish",
      preparedRef,
      report: {
        schemaVersion: "ts-release-action-report/v2",
        command: "publish",
        status: "complete",
        prepared: preparedRef,
        report: { status: "complete", subjects: [] },
      },
    })).toBeDefined();
    expect(() =>
      verifier.verifyActionReport({
        command: "prepare",
        preparedRef,
        report: {
          schemaVersion: "ts-release-action-report/v2",
          command: "prepare",
          status: "complete",
          prepared: preparedRef,
          report: { status: "complete" },
        },
      })
    ).toThrow(/prepare report.*keys/i);
  });

  it("parses exactly the six publish dispatch identities and local evidence paths", async () => {
    const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
    const argv = [
      "--evidence",
      "/tmp/evidence.json",
      "--candidate-directory",
      "/tmp/effect-build-candidate",
      "--source",
      source,
      "--candidate-run-id",
      runId,
      "--candidate-artifact-id",
      rawArtifactId,
      "--candidate-artifact-digest",
      rawDigest,
      "--prepared-ref",
      preparedRef,
    ];
    expect(verifier.parseReleaseArtifactArguments(argv)).toEqual({
      evidence: "/tmp/evidence.json",
      candidateDirectory: "/tmp/effect-build-candidate",
      source,
      candidateRunId: runId,
      candidateArtifactId: rawArtifactId,
      candidateArtifactDigest: rawDigest,
      preparedRef,
    });
    expect(() =>
      verifier.parseReleaseArtifactArguments([
        ...argv.slice(0, 10),
        "--candidate-artifact-digest",
        "8".repeat(64),
        ...argv.slice(12),
      ])
    ).toThrow(/usage/i);
  });

  it("reuses the Plan 032 candidate verifier against the downloaded exact directory", async () => {
    const verifier = await loadScript<ReleaseArtifactModule>("verify-release-artifact.mjs");
    const calls: Array<{ directory: string; source: string }> = [];
    await expect(verifier.verifyReleaseArtifact({
      evidence: evidenceFixture(),
      candidateDirectory: "/tmp/effect-build-release-artifact",
      source,
      candidateRunId: runId,
      candidateArtifactId: rawArtifactId,
      candidateArtifactDigest: rawDigest,
      preparedRef,
    }, {
      verifyCandidate: async (input) => {
        calls.push(input);
        return { packages: 5, consumers: 14 };
      },
    })).resolves.toMatchObject({ source, runId, rawArtifactId });
    expect(calls).toEqual([{ directory: "/tmp/effect-build-release-artifact", source }]);

    await expect(verifier.verifyReleaseArtifact({
      evidence: evidenceFixture(),
      candidateDirectory: "/tmp/effect-build-release-artifact",
      source,
      candidateRunId: runId,
      candidateArtifactId: rawArtifactId,
      candidateArtifactDigest: rawDigest,
      preparedRef,
    }, {
      verifyCandidate: async () => {
        throw new Error("candidate SHA-256 does not match");
      },
    })).rejects.toThrow(/SHA-256 does not match/);
  });
});
