import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface SurfaceSubpath {
  readonly runtime: readonly string[];
  readonly declarations: readonly string[];
}

interface SurfacePackage {
  readonly namespaces: readonly string[];
  readonly subpaths: Readonly<Record<string, SurfaceSubpath>>;
}

interface Surface {
  readonly packages: Readonly<Record<string, SurfacePackage>>;
}

type ScheduledDeletion =
  | { readonly kind: "rootNamespace"; readonly package: string; readonly name: string }
  | { readonly kind: "subpath"; readonly package: string; readonly name: string }
  | {
    readonly kind: "declaration" | "runtimeAndDeclaration";
    readonly package: string;
    readonly subpath: string;
    readonly name: string;
  };

interface DecisionRecord {
  readonly id: string;
  readonly lane: "portable" | "provider-native";
  readonly phase: "request" | "result";
  readonly disposition: string;
}

interface V05Contract {
  readonly schema: string;
  readonly source: {
    readonly candidate: string;
    readonly base: string;
    readonly integrationPullRequest: number;
  };
  readonly authority: {
    readonly decision: string;
    readonly status: string;
    readonly supersedes: readonly string[];
    readonly separateAuthorities: readonly string[];
  };
  readonly classifications: readonly string[];
  readonly classificationProtocol: readonly string[];
  readonly protocols: Readonly<Record<string, string>>;
  readonly profiles: {
    readonly nodeMainExecutable: {
      readonly id: string;
      readonly requestDecisions: readonly DecisionRecord[];
      readonly resultDecisions: readonly DecisionRecord[];
      readonly producerCells: readonly string[];
      readonly assemblerCell: string;
      readonly advertisementRule: string;
      readonly targetFinalization: unknown;
      readonly consumerContract: string;
      readonly unchangedConsumerProviderBranches: number;
      readonly nodeDistributionManifest: {
        readonly url: string;
        readonly sha256: string;
        readonly signatureUrl: string;
        readonly signatureSha256: string;
        readonly signerFingerprint: string;
        readonly releaseKeyRepositoryCommit: string;
        readonly releaseKeyUrl: string;
        readonly releaseKeySha256: string;
        readonly verification: string;
      };
      readonly intendedEvidenceCells: readonly {
        readonly target: string;
        readonly distribution: string;
        readonly sha256: string;
      }[];
    };
    readonly staticBrowserApplication: {
      readonly id: string;
      readonly requestDecisions: readonly DecisionRecord[];
      readonly resultDecisions: readonly DecisionRecord[];
      readonly consumerContract: string;
      readonly unchangedConsumerProviderBranches: number;
      readonly minimumIndependentPassingProviders: number;
      readonly requiredBrowserEngines: readonly {
        readonly name: string;
        readonly revision: string;
        readonly browserVersion: string;
      }[];
      readonly playwrightCell: string;
      readonly providerCells: readonly string[];
      readonly denoDisposition: string;
    };
  };
  readonly providerNativeHardening: {
    readonly denoCompile: {
      readonly version: string;
      readonly permissionKinds: readonly string[];
      readonly permissionValuePolicy: Readonly<Record<string, string>>;
    };
    readonly appleDistribution: unknown;
  };
  readonly generation: {
    readonly path: {
      readonly separator: string;
      readonly portableComponentGrammar: string;
      readonly unicodePolicy: string;
      readonly windowsReservedDeviceBasenames: readonly string[];
      readonly forbid: readonly string[];
      readonly ordering: string;
    };
    readonly manifestBytes: {
      readonly encoding: string;
      readonly unknownFields: string;
      readonly topLevelFieldOrder: readonly string[];
      readonly subject: {
        readonly unprofiledTreeFieldOrder: readonly string[];
        readonly unprofiledTreeProfile: string;
        readonly staticBrowserFieldOrder: readonly string[];
        readonly staticBrowserEntry: string;
        readonly staticBrowserMount: string;
        readonly staticBrowserHost: string;
      };
      readonly fileFieldOrder: readonly string[];
      readonly digestFieldOrder: readonly string[];
      readonly byteCount: string;
      readonly digest: string;
      readonly serialization: string;
      readonly mediaType: {
        readonly canonicalGrammar: string;
        readonly canonicalization: string;
        readonly staticBrowserNull: string;
        readonly unprofiledTreeNull: string;
      };
      readonly sample: string;
      readonly sampleSha256: string;
    };
    readonly currentReferenceBytes: {
      readonly encoding: string;
      readonly serialization: string;
      readonly unknownFields: string;
      readonly fieldOrder: readonly string[];
      readonly digestFieldOrder: readonly string[];
      readonly sample: string;
      readonly sampleSha256: string;
    };
    readonly activation: string;
    readonly readerProtocol: readonly string[];
    readonly layout: {
      readonly currentReference: string;
      readonly generationDirectory: string;
      readonly generationTree: string;
      readonly manifest: string;
      readonly automaticGarbageCollection: boolean;
    };
  };
  readonly lifecycle: {
    readonly portableCancellation: {
      readonly scope: string;
      readonly maxSerializedControlMessageBytes: number;
      readonly maxCapturedBytesPerOutputStream: number;
      readonly cooperativeGraceMilliseconds: number;
      readonly containment: {
        readonly unix: string;
        readonly windows: string;
      };
      readonly completion: string;
      readonly sequence: readonly string[];
      readonly lateWrites: string;
    };
    readonly providerNativeCancellation: string;
    readonly watch: {
      readonly pendingCompletedResults: number;
      readonly coalescing: string;
      readonly ownershipScope: string;
      readonly ownedNativeCloseKinds: readonly string[];
      readonly maxOutstandingClosesPerKind: number;
      readonly maxOutstandingClosesTotal: number;
      readonly maxLiveOwnedResourcesPerKind: number;
      readonly ownership: string;
      readonly cleanupFailure: string;
    };
  };
  readonly requiredCompatibilityEvidencePoints: {
    readonly status: string;
    readonly bun: readonly string[];
    readonly deno: readonly string[];
    readonly node: readonly string[];
    readonly esbuild: readonly string[];
    readonly rolldown: readonly string[];
    readonly appleDistribution: {
      readonly status: string;
      readonly systemTargets: readonly string[];
      readonly runnerBinding: string;
      readonly scenarioRule: string;
    };
    readonly effect: readonly string[];
    readonly effectInstallablePeerRange: string;
    readonly effectRepositoryDevelopmentPoint: string;
    readonly playwright: readonly string[];
    readonly certificationHosts: readonly {
      readonly id: string;
      readonly runner: string;
      readonly systemTarget: string;
    }[];
    readonly targetExecutionHosts: readonly { readonly target: string; readonly runner: string }[];
    readonly providerIndependenceGroups: readonly {
      readonly id: string;
      readonly package: string;
      readonly upstreamEngine: string;
      readonly executionBoundary: string;
    }[];
    readonly providerIndependenceRule: string;
    readonly coordinateRules: Readonly<
      Record<string, {
        readonly rule: string;
        readonly axes: Readonly<Record<string, readonly string[]>>;
        readonly expectedCoordinateCount: number;
        readonly operation: string;
        readonly targetExecutionHostRule?: string;
      }>
    >;
    readonly installableRangeIsExecutionEvidence: boolean;
  };
  readonly publicSurface: {
    readonly currentSnapshot: string;
    readonly currentSnapshotMeaning: string;
    readonly stage0FreezeScope: string;
    readonly exactTargetSymbolsStatus: string;
    readonly scheduledDeletions: readonly ScheduledDeletion[];
    readonly compatibilityAliases: readonly string[];
    readonly targetSymbolPolicy: string;
    readonly providerNativeBundleResultMigration: {
      readonly deletedCoreDeclarations: readonly string[];
      readonly replacementOwners: Readonly<Record<string, readonly string[]>>;
      readonly freezeStage: string;
    };
    readonly remainingSymbolFreezeStops: readonly string[];
    readonly authorPromotionGate: {
      readonly status: string;
      readonly adapter: string;
      readonly installation: string;
      readonly imports: string;
      readonly sharedAuthoringLaws: string;
      readonly duplicateCoreGraph: string;
      readonly unknownProtocolMajor: string;
      readonly consumerProviderBranches: number;
    };
    readonly targetRootNamespaces: Readonly<Record<string, readonly string[]>>;
    readonly targetPackageExports: Readonly<Record<string, readonly string[]>>;
  };
  readonly release: {
    readonly publicationTrigger: string;
    readonly approval: string;
    readonly concurrency: unknown;
    readonly desiredDistTag: string;
    readonly packageAccess: string;
    readonly candidateIdentity: {
      readonly schema: string;
      readonly sourceRepository: string;
      readonly sourceRef: string;
      readonly workflowRepository: string;
      readonly workflowPath: string;
      readonly workflowRef: string;
      readonly workflowEvent: string;
      readonly descriptorArtifactName: string;
      readonly descriptorFileName: string;
      readonly payloadArtifactName: string;
      readonly transportDigest: string;
      readonly descriptorContentDigest: string;
      readonly descriptorEncoding: string;
      readonly descriptorCanonicalization: unknown;
      readonly descriptorArtifactLayout: unknown;
      readonly payloadLayout: unknown;
      readonly timestampEncoding: string;
      readonly maximumAgeSeconds: number;
      readonly freshnessPolicy: unknown;
      readonly versionPolicy: unknown;
      readonly releaseInputFields: readonly string[];
      readonly releaseInputFieldTypes: unknown;
      readonly requiredDescriptorFields: readonly string[];
      readonly authentication: readonly string[];
    };
    readonly sourceShaConvergence: {
      readonly initialPublicationRequiredEqual: readonly string[];
      readonly initialReleaseRef: string;
      readonly initialMismatch: string;
      readonly privilegedRunAttemptPolicy: {
        readonly admittedRunAttempt: number;
        readonly runAttemptGreaterThanOne: string;
        readonly workflowReruns: string;
        readonly goldenCases: readonly {
          readonly runAttempt: number;
          readonly disposition: string;
        }[];
      };
      readonly resumption: {
        readonly trigger: string;
        readonly triggerAdmission: Readonly<Record<string, string>>;
        readonly preEscrowRecoveryGoldenCases: readonly {
          readonly releaseRef: string;
          readonly workflowRunRelation: string;
          readonly runAttempt: number;
          readonly disposition: string;
        }[];
        readonly required: readonly string[];
        readonly recoveryReleaseRef: string;
        readonly mainAdvanceAfterInitialMutation: string;
      };
    };
    readonly appleCertificationEvidence: unknown;
    readonly approvedPublisher: {
      readonly repository: string;
      readonly sourceRepository: string;
      readonly sourceRef: string;
      readonly recoverySourceRef: string;
      readonly workflowPath: string;
      readonly workflowRef: string;
      readonly recoveryWorkflowRef: string;
      readonly environment: string;
      readonly registry: string;
      readonly distTag: string;
      readonly access: string;
      readonly provenance: Readonly<Record<string, string | boolean | readonly string[]>>;
      readonly trustedPublisherPackageBindings: readonly string[];
    };
    readonly protectedEnvironmentPolicy: unknown;
    readonly namespaceBootstrap: unknown;
    readonly candidateGeneration: string;
    readonly orderedPackages: readonly string[];
    readonly orderedPackagePrerequisites: Readonly<Record<string, readonly string[]>>;
    readonly requiredEquivalentPrefixLengths: readonly number[];
    readonly observationStates: readonly string[];
    readonly reportOnlyStates: readonly string[];
    readonly automaticGreenMainPublication: boolean;
    readonly npmStagedPublishing: boolean;
    readonly genericReleaseGraph: boolean;
    readonly stateDefinitions: Readonly<Record<string, string>>;
    readonly candidatePackageRecordFields: readonly string[];
    readonly authenticationPrecedence: {
      readonly order: readonly string[];
      readonly goldenCases: readonly {
        readonly arm: string;
        readonly releaseRef: string;
        readonly runAttempt: number;
        readonly candidateAuthentication: string;
        readonly subjectAuthentication: string;
        readonly disposition: string;
      }[];
    };
    readonly protocol: readonly string[];
    readonly unknownPolicy: string;
    readonly registryObservationBounds: {
      readonly requestTimeoutMilliseconds: number;
      readonly attemptsPerObservation: number;
      readonly delayBeforeAttemptMilliseconds: readonly number[];
      readonly maximumObservationElapsedMilliseconds: number;
      readonly maximumResponseBytes: number;
      readonly retryableOutcomes: readonly string[];
      readonly publicationAttemptsPerCoordinate: number;
      readonly afterAmbiguousPublication: string;
    };
    readonly githubFinalization: unknown;
    readonly candidateTarballs: string;
    readonly privilegedJobMayCheckoutInstallBuildOrPack: boolean;
    readonly privilegedJobMayFrameVerifiedEscrowContainer: boolean;
    readonly externalMutationsAuthorizedByThisContract: readonly string[];
  };
  readonly exclusions: readonly string[];
}

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await readFile(resolve(root, path), "utf8")) as A;

const decisionKeys = (decisions: readonly DecisionRecord[]): readonly string[] =>
  decisions.map(({ phase, lane, disposition, id }) => `${phase}|${lane}|${disposition}|${id}`);

const isCanonicalSha512SRI = (value: string): boolean => {
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/.exec(value);
  if (match === null) return false;
  const encoded = match[1];
  if (encoded === undefined) return false;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length === 64 && bytes.toString("base64") === encoded;
};

describe("v0.5 hard-cut contract", () => {
  it("freezes closed profile, protocol, lifecycle, and compatibility decisions", async () => {
    const contract = await readJson<V05Contract>("tooling/v05-contract.json");

    expect(contract.schema).toBe("effect-build/v0.5-contract@1");
    expect(contract.source).toEqual({
      candidate: "fef8e10304b65b12ae71da0b35722c38edc37d80",
      base: "d51f4c05f5956c584cf9795d2dfdf4350103cb4d",
      integrationPullRequest: 19,
    });
    expect(contract.authority).toEqual({
      decision: "portable-artifact-hard-cut",
      status: "target-not-yet-implemented",
      supersedes: ["mutable-partial-bundle-publication", "automatic-publication-after-green-main"],
      separateAuthorities: [
        "implementation",
        "certification",
        "merge",
        "release-approval",
        "publication",
        "post-release-verification",
      ],
    });
    expect(contract.protocols).toEqual({
      digest: "effect-build/digest@1",
      portableJob: "effect-build/portable-job@1",
      selectedTool: "effect-build/selected-tool@1",
      borrowedContent: "effect-build/borrowed-content@1",
      treeSnapshot: "effect-build/tree-snapshot@1",
      generationManifest: "effect-build/generation-manifest@1",
      directoryGeneration: "effect-build/directory-generation@1",
      currentGeneration: "effect-build/current-generation@1",
      assemblerOffer: "effect-build/assembler-offer@1",
      targetFinalizer: "effect-build/node-target-finalizer@1",
      targetFinalizerReceipt: "effect-build/node-target-finalizer-receipt@1",
      sealedNodeMain: "effect-build/sealed-node-main@1",
      releaseCandidate: "effect-build/release-candidate@1",
      appleCertificationIndex: "effect-build/apple-certification-index@1",
      releaseEscrow: "effect-build/release-escrow@2",
      releaseManifest: "effect-build/release-manifest@2",
    });
    expect(new Set(Object.values(contract.protocols)).size).toBe(Object.keys(contract.protocols).length);
    expect(contract.classifications).toEqual([
      "admitted",
      "rejected-before-provider-work",
      "rejected-post-analysis-pre-commit",
      "provider-native-only",
      "unsupported",
    ]);
    expect(contract.profiles.nodeMainExecutable.id).toBe("effect-build/profile/node-main@1");
    expect(contract.profiles.staticBrowserApplication.id).toBe(
      "effect-build/profile/static-browser-application@1",
    );
    expect(contract.profiles.nodeMainExecutable.unchangedConsumerProviderBranches).toBe(0);
    expect(contract.profiles.staticBrowserApplication.unchangedConsumerProviderBranches).toBe(0);
    expect(contract.profiles.nodeMainExecutable.consumerContract).toBe(
      "effect-build/consumer/node-main-to-sea@1",
    );
    expect(contract.profiles.staticBrowserApplication.consumerContract).toBe(
      "effect-build/consumer/static-browser-generation@1",
    );
    expect(contract.classificationProtocol).toEqual([
      "a-provider-native-entrypoint-is-provider-native-only",
      "a-portable-request-with-a-boundary-decidable-violation-is-rejected-before-provider-work",
      "a-well-formed-portable-request-without-required-provider-target-or-evidence-capability-is-unsupported",
      "a-well-formed-supported-portable-request-is-admitted-to-provider-work",
      "an-admitted-result-that-fails-authoritative-analysis-is-rejected-post-analysis-pre-commit",
      "only-an-admitted-result-that-passes-analysis-may-be-sealed-or-committed",
    ]);
    expect(contract.profiles.staticBrowserApplication.minimumIndependentPassingProviders).toBe(3);
    expect(contract.profiles.staticBrowserApplication.requiredBrowserEngines).toEqual([
      { name: "chromium", revision: "1234", browserVersion: "151.0.7922.34" },
      { name: "firefox", revision: "1538", browserVersion: "153.0" },
      { name: "webkit", revision: "2336", browserVersion: "26.5" },
    ]);
    expect(contract.profiles.staticBrowserApplication.playwrightCell).toBe("@playwright/test@1.62.1");
    const nodeCells = contract.profiles.nodeMainExecutable.intendedEvidenceCells;
    expect(nodeCells).toEqual([
      {
        target: "macos-x64",
        distribution: "node-v26.7.0-darwin-x64.tar.xz",
        sha256: "bd19c6b98d923fb049f64b547163b9f7d52ae73f16fdee09ecef9ab248c4d6ff",
      },
      {
        target: "macos-aarch64",
        distribution: "node-v26.7.0-darwin-arm64.tar.xz",
        sha256: "595d2f934e081b82961d1a5fd41c6dbd0c5a952d9e8be5b4566ab754426968d2",
      },
      {
        target: "linux-x64-gnu",
        distribution: "node-v26.7.0-linux-x64.tar.xz",
        sha256: "982aa24dd8be4c889c6a8ab337ddff3b0896645b20f4239356e80552c16277ee",
      },
      {
        target: "linux-aarch64-gnu",
        distribution: "node-v26.7.0-linux-arm64.tar.xz",
        sha256: "afc7a004018485092ac8985b817b0d5684472bd9472e0b57d2ab88737e50090d",
      },
      {
        target: "windows-x64",
        distribution: "node-v26.7.0-win-x64.zip",
        sha256: "d3bd72755141ed32bbcd841228ee81897c8a98d50dfa7dae2179399a0a7c90f8",
      },
      {
        target: "windows-aarch64",
        distribution: "node-v26.7.0-win-arm64.zip",
        sha256: "be8775204cfceca5a73c30f91bf0de5e85274c01b776dc13f16b91aa251ebb01",
      },
    ]);
    for (const { distribution } of nodeCells) expect(distribution).not.toContain("musl");
    for (const { sha256 } of nodeCells) expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(contract.profiles.nodeMainExecutable.nodeDistributionManifest).toEqual({
      url: "https://nodejs.org/dist/v26.7.0/SHASUMS256.txt",
      sha256: "4533f0a43b9ba7f78a48230a0511b9dd5c931f20c3b3cac281ff9b7a2080fb2e",
      signatureUrl: "https://nodejs.org/dist/v26.7.0/SHASUMS256.txt.sig",
      signatureSha256: "7bb1dfdce6e58b8659b3e7f3e148c8165ad715358fd4876be49aa656fc8b8224",
      signerFingerprint: "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356",
      releaseKeyRepositoryCommit: "b28073028e6d6855cfb53bf7fa0137599c01f967",
      releaseKeyUrl:
        "https://raw.githubusercontent.com/nodejs/release-keys/b28073028e6d6855cfb53bf7fa0137599c01f967/keys/5BE8A3F6C8A5C01D106C0AD820B1A390B168D356.asc",
      releaseKeySha256: "5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a",
      verification: "require-pinned-key-fingerprint-and-detached-signature-before-archive-digest-admission",
    });
    expect(contract.profiles.staticBrowserApplication.providerCells).toEqual([
      "bun@1.3.14",
      "esbuild@0.28.2",
      "rolldown@1.2.5",
    ]);
    expect(contract.profiles.nodeMainExecutable.producerCells).toEqual(
      contract.profiles.staticBrowserApplication.providerCells,
    );
    expect(contract.profiles.nodeMainExecutable.assemblerCell).toBe("node@26.7.0");
    expect(contract.profiles.nodeMainExecutable.advertisementRule).toBe(
      "authenticated-base-plus-structural-inspection-plus-exact-target-execution",
    );
    expect(contract.profiles.nodeMainExecutable.targetFinalization).toEqual({
      ownership: "exact-target-runner-finalizes-and-returns-bytes-before-executed-result",
      constructionIntermediate: "private-and-never-mints-assembled-executable",
      postFinalizationAssembly: "target-runner-rehashes-mints-and-returns-the-only-assembled-executable",
      capability: {
        protocol: contract.protocols.targetFinalizer,
        receiptProtocol: contract.protocols.targetFinalizerReceipt,
        scope: "repository-certification-and-release-artifact-jobs-only",
        publicExport: "none-in-v0.5",
        invocation: "one-exact-target-matrix-job-with-no-provider-choice-or-fallback",
        authority: {
          repository: "mannyc2/effect-build",
          workflowPath: ".github/workflows/ci.yml",
          workflowEvents: ["push", "pull_request", "workflow_dispatch"],
          restBindings:
            "authoritative-workflow-run-construction-job-input-artifact-finalizer-job-output-artifact-and-receipt-artifact-records",
        },
        coordinateEncoding:
          "node-main--<producerGroup>--<format>--from-<constructionHost>--to-<target>-with-each-placeholder-equal-to-the-corresponding-frozen-matrix-axis-token",
        constructionJobName: "construct--<coordinate>",
        finalizerJobName: "finalize--<coordinate>",
        inputArtifactName: "<coordinate>--constructed",
        outputArtifactName: "<coordinate>--finalized",
        encoding:
          "rfc8785-json-canonicalization-scheme-utf8-followed-by-one-lf-with-unknown-fields-and-json-numbers-forbidden",
        constructionOfferFileName: "<coordinate>--assembler-offer.json",
        constructionOfferTransport:
          "exact-canonical-assemblerOffer-bytes-as-the-second-coordinate-named-input-artifact-sidecar-entry-that-does-not-contain-or-bind-the-later-assigned-input-artifact-id-digest-expiry-or-wrapper-properties",
        constructionOfferFieldSet: [
          "protocol",
          "sourceSha",
          "workflowRepository",
          "workflowPath",
          "workflowRef",
          "workflowRunId",
          "workflowRunAttempt",
          "workflowRunHeadSha",
          "constructionJobName",
          "coordinate",
          "target",
          "format",
          "nodeVersion",
          "mainSha256",
          "baseArchiveName",
          "baseArchiveSha256",
          "constructionHost",
          "constructedFileName",
          "constructedBytes",
          "constructedSha256",
          "inputArtifactName",
        ],
        constructionOfferTypes: {
          protocol: "string-equal-assemblerOffer-protocol",
          sourceSha: "string-lowercase-40-hex",
          workflowRepository: "string-equal-authority-repository",
          workflowPath: "string-equal-authority-workflowPath",
          workflowRef: "string-equal-authoritative-workflow-run-workflow-ref-for-workflowPath",
          workflowRunId: "positive-decimal-string-without-leading-zero",
          workflowRunAttempt: "positive-decimal-string-without-leading-zero",
          workflowRunHeadSha: "string-equal-sourceSha-lowercase-40-hex",
          constructionJobName: "string-equal-constructionJobName-template-for-coordinate",
          coordinate: "string-equal-coordinateEncoding-for-one-frozen-node-matrix-coordinate",
          target: "string-equal-coordinate-target",
          format: "commonjs-or-module-equal-coordinate-format",
          nodeVersion: "string-equal-26.7.0",
          mainSha256: "string-lowercase-64-hex",
          baseArchiveName: "string-equal-target-intendedEvidenceCells-distribution",
          baseArchiveSha256: "string-equal-target-intendedEvidenceCells-sha256",
          constructionHost: "string-equal-coordinate-constructionHost",
          constructedFileName:
            "string-equal-coordinate-plus---constructed.exe-only-for-windows-targets-otherwise-coordinate-plus---constructed",
          constructedBytes: "positive-decimal-string-without-leading-zero",
          constructedSha256: "string-lowercase-64-hex",
          inputArtifactName: "string-equal-inputArtifactName-template-for-coordinate",
        },
        constructionOfferBinding:
          "after-authoritative-run-construction-job-and-input-artifact-rest-observation-download-and-reject-unless-the-exact-two-entry-inputArtifactLayout-holds-then-strictly-decode-only-constructionOfferFileName-require-exact-field-set-types-canonical-reencoding-source-run-coordinate-matrix-input-name-and-constructed-entry-equality-with-no-job-output-environment-file-or-fallback-source",
        requestConstruction:
          "the-finalizer-job-observes-the-authoritative-run-construction-job-and-input-artifact-record-admits-the-exact-target-host-downloads-and-strictly-validates-the-two-entry-inputArtifactLayout-and-construction-offer-then-combines-only-the-authenticated-offer-and-rest-values-into-the-local-canonical-request-before-any-finalization",
        requestTransport:
          "local-canonical-control-bytes-never-an-entry-in-the-input-artifact-whose-id-and-digest-they-bind",
        requestOfferEqualFields: [
          "sourceSha",
          "workflowRepository",
          "workflowPath",
          "workflowRef",
          "workflowRunId",
          "workflowRunAttempt",
          "workflowRunHeadSha",
          "constructionJobName",
          "coordinate",
          "target",
          "format",
          "nodeVersion",
          "mainSha256",
          "baseArchiveName",
          "baseArchiveSha256",
          "constructionHost",
          "constructedFileName",
          "constructedBytes",
          "constructedSha256",
          "inputArtifactName",
        ],
        receiptArtifactName: "<coordinate>--receipt",
        receiptFileName: "<coordinate>--target-finalizer-receipt.json",
        receiptTransport:
          "after-output-artifact-rest-observation-upload-the-exact-canonical-response-bytes-as-the-one-regular-file-in-the-coordinate-named-receipt-artifact-the-response-binds-the-output-artifact-but-does-not-contain-or-bind-its-own-later-assigned-receipt-artifact-id-digest-expiry-or-wrapper-properties",
        receiptPersistence:
          "one-dependent-aggregation-job-lists-and-downloads-each-coordinate-named-receipt-artifact-strictly-validates-its-rest-record-layout-canonical-response-and-the-authoritative-run-job-input-and-output-records-before-embedding-the-response-object-in-compatibility-evidence",
        requestFieldSet: [
          "protocol",
          "sourceSha",
          "workflowRepository",
          "workflowPath",
          "workflowRef",
          "workflowRunId",
          "workflowRunAttempt",
          "workflowRunHeadSha",
          "constructionJobId",
          "constructionJobName",
          "coordinate",
          "target",
          "format",
          "nodeVersion",
          "mainSha256",
          "baseArchiveName",
          "baseArchiveSha256",
          "constructionHost",
          "constructedFileName",
          "constructedBytes",
          "constructedSha256",
          "inputArtifactId",
          "inputArtifactName",
          "inputArtifactDigest",
          "inputArtifactExpired",
          "inputArtifactExpiresAt",
        ],
        requestTypes: {
          protocol: "string-equal-targetFinalizer-protocol",
          sourceSha: "string-lowercase-40-hex",
          workflowRepository: "string-equal-authority-repository",
          workflowPath: "string-equal-authority-workflowPath",
          workflowRef: "string-equal-authoritative-workflow-run-workflow-ref-for-workflowPath",
          workflowRunId: "positive-decimal-string-without-leading-zero",
          workflowRunAttempt: "positive-decimal-string-without-leading-zero",
          workflowRunHeadSha: "string-equal-sourceSha-lowercase-40-hex",
          constructionJobId: "positive-decimal-string-without-leading-zero",
          constructionJobName: "string-equal-constructionJobName-template-for-coordinate",
          coordinate: "string-equal-coordinateEncoding-for-one-frozen-node-matrix-coordinate",
          target: "string-equal-coordinate-target",
          format: "commonjs-or-module-equal-coordinate-format",
          nodeVersion: "string-equal-26.7.0",
          mainSha256: "string-equal-authenticated-construction-offer-mainSha256",
          baseArchiveName: "string-equal-target-intendedEvidenceCells-distribution",
          baseArchiveSha256: "string-equal-target-intendedEvidenceCells-sha256",
          constructionHost: "string-equal-coordinate-constructionHost",
          constructedFileName:
            "string-equal-authenticated-construction-offer-constructedFileName-and-coordinate-plus---constructed.exe-only-for-windows-targets-otherwise-coordinate-plus---constructed",
          constructedBytes: "string-equal-authenticated-construction-offer-constructedBytes",
          constructedSha256: "string-equal-authenticated-construction-offer-constructedSha256",
          inputArtifactId: "positive-decimal-string-without-leading-zero",
          inputArtifactName: "string-equal-inputArtifactName-template-for-coordinate",
          inputArtifactDigest: "string-github-rest-sha256-colon-lowercase-64-hex",
          inputArtifactExpired: "boolean-exact-false",
          inputArtifactExpiresAt: "string-canonical-timestampEncoding-strictly-in-the-future",
        },
        inputArtifactLayout: {
          entrySet: "exactly-two-top-level-regular-files",
          constructedEntry: {
            name: "exactly-authenticated-construction-offer-constructedFileName",
            bytes: "exactly-authenticated-construction-offer-constructedBytes",
            sha256: "exactly-authenticated-construction-offer-constructedSha256",
            modeSemantics: "bytes-only-github-artifact-mode-is-neither-preserved-nor-authoritative",
          },
          offerEntry: {
            name: "exactly-constructionOfferFileName-for-coordinate",
            bytes: "exactly-canonical-assemblerOffer-encoding",
            protocol: "exactly-assemblerOffer-protocol",
            selfReference: "forbidden-input-artifact-rest-properties",
          },
          directories: "forbidden",
          links: "forbidden",
          absoluteParentOrBackslashPaths: "forbidden",
          duplicates: "forbidden",
          unexpectedEntries: "forbidden",
        },
        responseFieldSet: [
          "protocol",
          "requestSha256",
          "sourceSha",
          "workflowRunId",
          "workflowRunAttempt",
          "workflowRunHeadSha",
          "constructionJobId",
          "constructionJobName",
          "finalizerJobId",
          "finalizerJobName",
          "coordinate",
          "target",
          "runner",
          "inputArtifactId",
          "inputArtifactName",
          "inputArtifactDigest",
          "inputArtifactExpired",
          "inputArtifactExpiresAt",
          "constructedFileName",
          "constructedBytes",
          "constructedSha256",
          "outputArtifactId",
          "outputArtifactName",
          "outputArtifactDigest",
          "outputArtifactExpired",
          "outputArtifactExpiresAt",
          "finalizedFileName",
          "finalizedMode",
          "finalizedBytes",
          "finalizedSha256",
          "nativeFormat",
          "inspectedArchitecture",
          "executionExitCode",
          "stdoutSha256",
          "stderrSha256",
        ],
        responseTypes: {
          protocol: "string-equal-targetFinalizerReceipt-protocol",
          requestSha256: "string-lowercase-64-hex-of-exact-canonical-request-bytes-including-final-lf",
          sourceSha: "string-equal-request-sourceSha",
          workflowRunId: "string-equal-request-workflowRunId",
          workflowRunAttempt: "string-equal-request-workflowRunAttempt",
          workflowRunHeadSha: "string-equal-request-workflowRunHeadSha",
          constructionJobId: "string-equal-request-constructionJobId",
          constructionJobName: "string-equal-request-constructionJobName",
          finalizerJobId: "positive-decimal-string-without-leading-zero",
          finalizerJobName: "string-equal-finalizerJobName-template-for-coordinate",
          coordinate: "string-equal-request-coordinate",
          target: "string-equal-request-target",
          runner: "string-equal-targetExecutionHosts-runner-for-target",
          inputArtifactId: "string-equal-request-inputArtifactId",
          inputArtifactName: "string-equal-request-inputArtifactName",
          inputArtifactDigest: "string-equal-request-inputArtifactDigest",
          inputArtifactExpired: "boolean-exact-false-equal-request-and-authoritative-rest-record",
          inputArtifactExpiresAt: "string-equal-request-and-authoritative-rest-record",
          constructedFileName: "string-equal-request-constructedFileName",
          constructedBytes: "string-equal-request-constructedBytes",
          constructedSha256: "string-equal-request-constructedSha256",
          outputArtifactId: "positive-decimal-string-without-leading-zero",
          outputArtifactName: "string-equal-outputArtifactName-template-for-coordinate",
          outputArtifactDigest: "string-github-rest-sha256-colon-lowercase-64-hex",
          outputArtifactExpired: "boolean-exact-false",
          outputArtifactExpiresAt: "string-canonical-timestampEncoding-strictly-in-the-future",
          finalizedFileName:
            "string-equal-coordinate-plus---finalized.exe-only-for-windows-targets-otherwise-coordinate-plus---finalized",
          finalizedMode: "literal-0755-for-linux-or-macos-targets-or-literal-not-applicable-for-windows-targets",
          finalizedBytes: "positive-decimal-string-without-leading-zero",
          finalizedSha256: "string-lowercase-64-hex-of-returned-final-file",
          nativeFormat: "mach-o-or-elf-or-pe-equal-request-target",
          inspectedArchitecture: "x64-or-aarch64-equal-request-target",
          executionExitCode: "string-exact-0",
          stdoutSha256: "string-lowercase-64-hex",
          stderrSha256: "string-lowercase-64-hex",
        },
        outputArtifactLayout: {
          entrySet: "exactly-one-top-level-regular-file",
          entryName: "exactly-response-finalizedFileName",
          entryBytes: "exactly-response-finalizedBytes",
          entrySha256: "exactly-response-finalizedSha256",
          modeSemantics: "bytes-only-github-artifact-mode-is-neither-preserved-nor-authoritative",
          directories: "forbidden",
          links: "forbidden",
          absoluteParentOrBackslashPaths: "forbidden",
          duplicates: "forbidden",
          unexpectedEntries: "forbidden",
        },
        receiptArtifactLayout: {
          entrySet: "exactly-one-top-level-regular-file",
          entryName: "exactly-receiptFileName-for-coordinate",
          entryBytes: "exactly-canonical-targetFinalizerReceipt-encoding",
          protocol: "exactly-targetFinalizerReceipt-protocol",
          selfReference: "forbidden-receipt-artifact-rest-properties",
          directories: "forbidden",
          links: "forbidden",
          absoluteParentOrBackslashPaths: "forbidden",
          duplicates: "forbidden",
          unexpectedEntries: "forbidden",
        },
        modeRestoration: {
          beforeFinalization:
            "after-strict-input-content-validation-set-0755-on-linux-and-macos-targets-and-do-nothing-on-windows-before-any-target-finalization-inspection-or-execution",
          receipt: "response-finalizedMode-binds-the-target-derived-mode-separately-from-finalizedSha256",
          afterOutputDownload:
            "a-dependent-consumer-must-validate-the-receipt-and-output-content-then-restore-and-verify-response-finalizedMode-before-execution-packaging-or-publication",
          digestBoundary: "sha256-authenticates-file-bytes-only-mode-is-a-separate-required-artifact-property",
        },
        transport:
          "one-coordinate-named-private-input-artifact-with-constructed-bytes-and-assembler-offer-sidecar-one-coordinate-named-private-output-artifact-with-finalized-bytes-and-one-coordinate-named-private-receipt-artifact-with-the-canonical-response-no-shared-matrix-job-output-key",
        hostAdmission: "runner-system-target-must-exactly-equal-request-target-before-download-or-finalization",
        restValidation:
          "require-authoritative-run-id-attempt-headSha-event-workflow-ref-and-repository-construction-and-finalizer-job-id-name-run-id-conclusion-and-input-output-receipt-artifact-id-name-digest-expired-expires_at-workflow_run-fields-to-match-the-canonical-request-receipt-and-coordinate-named-transports-and-bind-construction-produced-request-values-only-through-the-authenticated-assemblerOffer-sidecar",
        responseValidation:
          "strict-canonical-decode-requestSha256-and-every-echoed-request-field-native-format-architecture-zero-exit-target-derived-finalizedMode-exact-inputArtifactLayout-outputArtifactLayout-and-receiptArtifactLayout-content-byte-count-sha256-and-github-wrapper-digests",
        failure: "no-public-artifact-or-support-evidence-is-minted",
        consumerLimitation:
          "ordinary-library-callers-do-not-receive-a-cross-target-assembled-executable-outside-this-capability",
      },
      finalDigestPoint: "after-all-target-finalization-and-before-execution",
      receiptBinding:
        "executed-executable-wraps-the-exact-post-finalization-assembled-executable-digest-plus-target-derived-mode-target-runner-byte-count-native-inspection-exit-code-and-output",
      linux: {
        targets: ["linux-x64-gnu", "linux-aarch64-gnu"],
        mode: "0755",
        steps: ["set-executable-mode", "rehash", "inspect", "execute"],
      },
      macos: {
        targets: ["macos-x64", "macos-aarch64"],
        signing: "required-ad-hoc-no-timestamp",
        authority: "runnable-mach-o-correctness-repair-only-not-distribution-trust",
        forbidden: [
          "developer-id-identity",
          "distribution-entitlements-or-hardened-runtime-policy",
          "apple-container-construction",
          "notarization",
          "stapling",
          "distribution-assessment",
        ],
        signArgv: ["codesign", "--force", "--sign", "-", "--timestamp=none", "<staged-executable>"],
        verifyArgv: ["codesign", "--verify", "--strict", "<staged-executable>"],
        steps: [
          "set-executable-mode",
          "sign-on-exact-target-runner",
          "verify-signature",
          "rehash-signed-bytes",
          "inspect",
          "execute",
        ],
        macosX64: "release-blocking-despite-upstream-node-ci-skip",
      },
      windows: {
        targets: ["windows-x64", "windows-aarch64"],
        extension: ".exe",
        signing: "unsigned-no-authenticode-claim",
        steps: ["rehash", "inspect", "execute"],
      },
      resultMinting: "only-returned-post-finalization-bytes-may-mint-executed-executable-or-publication-artifact",
    });
    const finalizerCapability = (contract.profiles.nodeMainExecutable.targetFinalization as {
      readonly capability: {
        readonly constructionOfferFieldSet: readonly string[];
        readonly requestOfferEqualFields: readonly string[];
        readonly requestFieldSet: readonly string[];
        readonly responseFieldSet: readonly string[];
        readonly inputArtifactLayout: {
          readonly entrySet: string;
          readonly constructedEntry: Readonly<Record<string, string>>;
          readonly offerEntry: Readonly<Record<string, string>>;
          readonly directories: string;
          readonly links: string;
          readonly absoluteParentOrBackslashPaths: string;
          readonly duplicates: string;
          readonly unexpectedEntries: string;
        };
        readonly outputArtifactLayout: Readonly<Record<string, string>>;
        readonly receiptArtifactLayout: Readonly<Record<string, string>>;
      };
    }).capability;
    for (
      const fields of [
        finalizerCapability.constructionOfferFieldSet,
        finalizerCapability.requestOfferEqualFields,
        finalizerCapability.requestFieldSet,
        finalizerCapability.responseFieldSet,
      ]
    ) expect(new Set(fields).size).toBe(fields.length);
    expect(finalizerCapability.requestOfferEqualFields).toEqual(
      finalizerCapability.constructionOfferFieldSet.filter((field) => field !== "protocol"),
    );
    expect(finalizerCapability.inputArtifactLayout).toMatchObject({
      entrySet: "exactly-two-top-level-regular-files",
      constructedEntry: {
        modeSemantics: "bytes-only-github-artifact-mode-is-neither-preserved-nor-authoritative",
      },
      offerEntry: {
        protocol: "exactly-assemblerOffer-protocol",
        selfReference: "forbidden-input-artifact-rest-properties",
      },
      directories: "forbidden",
      links: "forbidden",
      absoluteParentOrBackslashPaths: "forbidden",
      duplicates: "forbidden",
      unexpectedEntries: "forbidden",
    });
    for (const layout of [finalizerCapability.outputArtifactLayout, finalizerCapability.receiptArtifactLayout]) {
      expect(layout).toMatchObject({
        entrySet: "exactly-one-top-level-regular-file",
        directories: "forbidden",
        links: "forbidden",
        absoluteParentOrBackslashPaths: "forbidden",
        duplicates: "forbidden",
        unexpectedEntries: "forbidden",
      });
    }
    expect(finalizerCapability.outputArtifactLayout.modeSemantics).toBe(
      "bytes-only-github-artifact-mode-is-neither-preserved-nor-authoritative",
    );
    expect(finalizerCapability.receiptArtifactLayout).toMatchObject({
      protocol: "exactly-targetFinalizerReceipt-protocol",
      selfReference: "forbidden-receipt-artifact-rest-properties",
    });
    const expectedFinalizedMode = (target: string): "0755" | "not-applicable" =>
      target.startsWith("windows-") ? "not-applicable" : "0755";
    expect([
      expectedFinalizedMode("linux-x64-gnu"),
      expectedFinalizedMode("macos-aarch64"),
      expectedFinalizedMode("windows-x64"),
    ]).toEqual(["0755", "0755", "not-applicable"]);
    expect(contract.profiles.staticBrowserApplication.denoDisposition).toBe(
      "unsupported-until-authoritative-metadata-completeness-is-proved",
    );
    expect(contract.providerNativeHardening.denoCompile).toEqual({
      version: "2.9.5",
      permissionKinds: ["read", "write", "net", "env", "run", "ffi", "sys", "import"],
      permissionValuePolicy: {
        true: "unrestricted-kind",
        nonEmptyStringList: "restricted-kind",
        emptyStringList: "rejected-before-provider-work",
        omitted: "not-granted",
      },
    });
    expect(contract.providerNativeHardening.appleDistribution).toEqual({
      package: "effect-build-apple",
      status: "implemented-locally-certification-not-earned",
      implementationRevision: "5718e83907e8e463a16c2dc186e70fa3f5ca90a1",
      scope: "direct-developer-id-distribution-only",
      macAppStore: "unsupported-separate-product-scope",
      universalBinaryConstruction: "unsupported-separate-product-scope",
      ownership: {
        nodeSea: "only-ad-hoc-no-timestamp-runnable-mach-o-repair-required-by-sea-construction",
        applePackage:
          "exclusive-owner-of-developer-id-signing-entitlements-hardened-runtime-apple-containers-notarization-stapling-and-assessment",
        releaseSystem:
          "owns-distribution-form-channel-identifiers-versions-resources-install-policy-credentials-approval-retry-publication-and-retention",
      },
      targetSubpaths: [
        "Artifact",
        "CodeSign",
        "AppBundle",
        "Zip",
        "DiskImage",
        "InstallerPackage",
        "Notary",
        "Staple",
        "Assess",
      ],
      symbolFreeze:
        "operation-service-names-and-non-notary-input-result-structures-frozen-by-the-owning-stage-exact-notary-provider-json-status-decoding-and-detailed-notary-receipt-reconciliation-evidence-shapes-remain-provisional-through-a7",
      selectedOperationInventory: {
        Artifact: [
          "observeFile",
          "observeTree",
          "observeExecutable",
          "isFileArtifact",
          "isTreeArtifact",
          "isKind",
          "reference",
          "revalidate",
          "sameIdentity",
        ],
        CodeSign: ["developerIdApplication", "sign", "Signer", "layer"],
        AppBundle: ["create", "Creator", "layer"],
        Zip: ["create", "Creator", "layer"],
        DiskImage: ["create", "Creator", "layer"],
        InstallerPackage: ["developerIdInstaller", "create", "Creator", "layer"],
        Notary: [
          "submit",
          "operatorReconciliationEvidence",
          "reconcile",
          "info",
          "wait",
          "log",
          "history",
          "readReceipt",
          "submittedReceiptPath",
          "Notarizer",
          "layer",
        ],
        Staple: ["staple", "Stapler", "layer"],
        Assess: ["assess", "Assessor", "layer"],
      },
      selectedTypeBoundaries: {
        artifactKinds:
          "file-mach-o-entitlements-resource-zip-disk-image-installer-package-or-tree-app-bundle-resource-with-sha256-identity-and-symlink-safe-tree-manifest",
        executableBridge:
          "observeExecutable-requires-a-hashed-macos-core-executable-binds-thin-mach-o-cputype-to-provider-target-and-rejects-fat-or-universal-input",
        codeSign:
          "SignableArtifact-is-mach-o-disk-image-or-app-bundle-DeveloperIdApplication-is-nominal-and-SignInput-SignResult-preserve-artifact-kind",
        containers:
          "AppBundle-Zip-and-DiskImage-each-consume-their-one-explicit-authenticated-product-shape-and-return-a-new-kind-preserving-authenticated-artifact",
        installerPackage:
          "CreateInput-is-exactly-one-app-explicit-identifier-version-absolute-install-location-and-distinct-nominal-DeveloperIdInstaller",
        notaryAuthority:
          "submit-or-reconcile-mints-nominal-Submission-query-authority-readReceipt-returns-stored-NotaryReceipt-or-SubmittedReceipt-data-that-cannot-typecheck-for-info-wait-or-log-before-explicit-reconciliation",
        staple:
          "requires-an-authenticated-AcceptedSubmissionObservation-bound-to-the-exact-unstapled-digest-and-preserves-artifact-kind",
        assess:
          "returns-digest-bound-local-signature-and-gatekeeper-observations-and-never-claims-clean-host-acceptance",
      },
      intentionalPublicRecoverySurface: {
        artifactLifecycleError: "public-shared-staging-and-publication-error-type",
        taggedErrorConstructors:
          "all-runtime-tagged-error-constructors-in-tooling-public-api-are-intentional-for-effect-tag-recovery",
      },
      operations: {
        CodeSign:
          "developer-id-application-signing-with-secure-timestamp-explicit-caller-owned-hardened-runtime-and-entitlements-and-inside-out-order-no-ad-hoc-mode",
        AppBundle:
          "construct-one-explicit-macos-app-bundle-with-caller-owned-identity-version-resources-and-launch-policy-without-signing-or-publication",
        Zip:
          "archive-explicit-signed-inputs-for-notary-or-distribution-transport-zip-is-not-a-code-signing-subject-and-cannot-be-stapled",
        DiskImage:
          "construct-one-explicit-udif-disk-image-from-authenticated-inputs-without-choosing-channel-layout-or-branding-policy",
        InstallerPackage:
          "construct-and-developer-id-installer-sign-one-flat-package-from-exactly-one-authenticated-app-component-with-explicit-identifier-version-and-install-location-using-pkgbuild-mandatory-timestamp-and-pkgutil-verification",
        Notary:
          "submit-or-resume-one-exact-input-digest-by-submission-id-and-return-a-digest-bound-observation-with-no-byte-mutation-and-no-blind-resubmission-exact-json-status-and-evidence-decoding-remains-provisional-through-a7",
        Staple:
          "mutate-only-a-notary-accepted-app-bundle-disk-image-or-flat-installer-package-zip-and-standalone-executable-are-rejected",
        Assess:
          "return-codesign-spctl-and-gatekeeper-relevant-host-observations-bound-to-the-exact-unchanged-input-digest",
      },
      mutationLaw: {
        mutatingOperations: ["CodeSign", "AppBundle", "Zip", "DiskImage", "InstallerPackage", "Staple"],
        observingOperations: ["Notary", "Assess"],
        input: "authenticated-immutable-never-mutated-in-place",
        revalidation:
          "revalidate-the-input-digest-immediately-before-work-and-revalidate-the-staged-output-before-publication",
        staging: "fresh-private-same-volume-when-required-by-the-final-commit",
        success: "new-artifact-new-digest-and-operation-input-output-tool-time-provenance-edge",
        failure: "no-caller-input-mutation-and-no-published-partial-output",
        notary:
          "unchanged-input-digest-plus-durable-submission-reference-and-observation-with-exact-json-status-log-and-evidence-shapes-provisional-through-a7",
        assessment: "unchanged-input-digest-plus-host-local-static-tool-observations-never-clean-host-acceptance",
      },
      installerPackageScope: {
        component: "exactly-one-digest-authenticated-app-bundle",
        metadata: "explicit-identifier-version-and-install-location",
        identity: "exact-developer-id-installer-certificate-sha1-and-class",
        construction: "pkgbuild-with-mandatory-timestamp-followed-by-pkgutil-verification",
        excluded: [
          "productbuild",
          "productsign",
          "multi-component-packages",
          "installer-scripts",
        ],
        expansion: "requires-a-later-explicitly-funded-api",
      },
      provisionalUntilA7: {
        operationAndServiceNames: "frozen-at-implementationRevision",
        nonNotaryInputAndResultStructures: "frozen-at-implementationRevision",
        submittedReceiptVsSubmissionAuthority:
          "frozen-stored-data-cannot-substitute-for-live-or-reconciled-query-authority",
        notaryJsonAndStatusDecoding:
          "provisional-until-credential-backed-fixtures-breaking-change-permitted-before-release",
        detailedNotaryReceiptAndReconciliationEvidenceShapes:
          "provisional-until-credential-backed-fixtures-breaking-change-permitted-before-release",
      },
      credentialLaw: {
        developerIdApplication: "distinct-required-class-for-code-and-app-distribution-signing",
        developerIdInstaller: "distinct-required-class-for-flat-installer-package-signing",
        identitySelection: "exact-certificate-sha1-and-class-never-display-name-alone",
        entitlements: "explicit-caller-authored-policy-never-inferred-from-provider-or-runtime",
        notaryAuthority:
          "one-explicit-caller-preprovisioned-notarytool-keychain-profile-never-api-reference-or-raw-secret-in-request-result-log-or-receipt",
        approval: "credential-provisioning-and-use-remain-consuming-release-system-authority",
      },
      certification: {
        systemTargets: ["macos-x64", "macos-aarch64"],
        toolchainPin:
          "release-blocking-freeze-exact-macos-xcode-codesign-pkgbuild-pkgutil-hdiutil-ditto-notarytool-stapler-and-spctl-versions-before-promotion",
        credentialBacked: true,
        currentDisposition: {
          sourceRevision: "5718e83907e8e463a16c2dc186e70fa3f5ca90a1",
          localVerification: [
            "bun-1.3.14-verify-13-typetest-files-111-unit-tests-built-packed-consumer-5-architecture-public-surface-tests-lint-format",
            "focused-apple-unit-55-of-55",
            "real-apple-noncredentialed-integration-2-of-2",
            "fresh-installed-consumer",
            "effect-build-apple-0.5.0-npm-pack-dry-run",
          ],
          locallyGreenNotFormallyEarned: ["A0", "A1", "A9"],
          notEarned: ["A2", "A3", "A4", "A5", "A6", "A7", "A8"],
          a7:
            "not-earned-exact-notary-provider-decoder-status-and-detailed-receipt-reconciliation-shapes-remain-provisional",
          cleanHostNotEarned: ["G-App", "G-ZIP", "G-DMG", "G-PKG"],
          formalReceiptIssued: false,
          developerIdCredentialUsed: false,
          notaryNetworkSubmission: false,
          cleanHostExercise: false,
        },
        requiredProofs: [
          "developer-id-sign-bun-deno-and-node-sea-executables-with-minimum-proven-entitlements",
          "exercise-every-runtime-feature-claimed-compatible-with-hardened-runtime-and-entitlements",
          "construct-sign-notarize-staple-and-locally-assess-one-app-bundle",
          "construct-sign-notarize-staple-mount-and-assess-one-disk-image",
          "construct-with-pkgbuild-and-developer-id-installer-sign-notarize-staple-install-run-remove-and-assess-one-flat-package-from-one-authenticated-app-component-with-explicit-identifier-version-install-location-mandatory-timestamp-and-pkgutil-verification",
          "notarize-and-assess-zip-transport-while-proving-zip-no-staple",
          "record-credential-backed-notary-success-non-success-service-and-unknown-outcome-resumption-fixtures-then-freeze-exact-json-status-and-evidence-decoding",
          "prove-credential-provenance-and-keychain-versus-notary-authority-boundary",
          "prove-every-mutator-preserves-input-bytes-and-every-observer-binds-the-unchanged-input-digest",
        ],
        cleanHostRequiredProofs: [
          "G-App-acquire-quarantined-app-transport-pass-gatekeeper-launch-and-exercise-runtime",
          "G-ZIP-acquire-and-extract-quarantined-zip-prove-no-zip-staple-pass-gatekeeper-on-inner-product-and-run",
          "G-DMG-acquire-quarantined-dmg-open-normal-user-flow-validate-stapled-product-copy-or-launch-and-run",
          "G-PKG-acquire-quarantined-package-open-with-installer-pass-gatekeeper-install-run-and-remove",
        ],
        promotionStop:
          "any-missing-target-scenario-credential-or-clean-host-proof-blocks-effect-build-apple-and-v0.5-release",
      },
    });

    const dispositions = new Set(contract.classifications);
    for (
      const profile of [
        contract.profiles.nodeMainExecutable,
        contract.profiles.staticBrowserApplication,
      ]
    ) {
      for (const decision of profile.requestDecisions) {
        expect(Object.keys(decision)).toEqual(["id", "lane", "phase", "disposition"]);
        expect(decision.phase).toBe("request");
        expect(dispositions.has(decision.disposition), decision.id).toBe(true);
      }
      for (const decision of profile.resultDecisions) {
        expect(Object.keys(decision)).toEqual(["id", "lane", "phase", "disposition"]);
        expect(decision.phase).toBe("result");
        expect(dispositions.has(decision.disposition), decision.id).toBe(true);
      }
      const decisions = [...profile.requestDecisions, ...profile.resultDecisions];
      expect(new Set(decisions.map(({ id }) => id)).size).toBe(decisions.length);
      expect(new Set(decisions.map(({ disposition }) => disposition))).toEqual(dispositions);
    }
    expect(decisionKeys(contract.profiles.nodeMainExecutable.requestDecisions)).toEqual([
      "request|portable|admitted|portable-valid-sealed-node-main-request",
      "request|portable|rejected-before-provider-work|portable-assets-request",
      "request|portable|rejected-before-provider-work|portable-plugin-or-callback-request",
      "request|portable|rejected-before-provider-work|portable-snapshot-or-code-cache-request",
      "request|portable|rejected-before-provider-work|portable-unverified-node-base-request",
      "request|portable|rejected-before-provider-work|portable-builder-base-or-agreement-mismatch-request",
      "request|portable|unsupported|portable-target-without-authenticated-base",
      "request|portable|unsupported|portable-target-without-structural-inspection",
      "request|portable|unsupported|portable-target-without-exact-runner-evidence",
      "request|provider-native|provider-native-only|raw-file-byte-or-assets-request",
      "request|provider-native|provider-native-only|raw-separate-builder-and-base-request",
      "request|provider-native|provider-native-only|provider-native-arbitrary-options-request",
    ]);
    expect(decisionKeys(contract.profiles.nodeMainExecutable.resultDecisions)).toEqual([
      "result|portable|admitted|sealed-node-main",
      "result|portable|admitted|assembled-executable",
      "result|portable|admitted|target-support-evidence",
      "result|portable|admitted|executed-executable",
      "result|portable|rejected-post-analysis-pre-commit|portable-multiple-output-files-or-chunks",
      "result|portable|rejected-post-analysis-pre-commit|portable-package-local-or-json-import",
      "result|portable|rejected-post-analysis-pre-commit|portable-dynamic-import",
      "result|portable|rejected-post-analysis-pre-commit|portable-create-require-or-computed-loader",
      "result|portable|rejected-post-analysis-pre-commit|portable-process-dlopen-or-native-addon",
      "result|portable|rejected-post-analysis-pre-commit|portable-eval-or-new-function-loading",
      "result|provider-native|provider-native-only|verified-node-base",
      "result|provider-native|provider-native-only|raw-host-native-executable",
    ]);
    expect(decisionKeys(contract.profiles.staticBrowserApplication.requestDecisions)).toEqual([
      "request|portable|admitted|portable-valid-static-browser-request",
      "request|portable|rejected-before-provider-work|portable-caller-authored-html-request",
      "request|portable|rejected-before-provider-work|portable-absolute-or-root-relative-mount-request",
      "request|portable|rejected-before-provider-work|portable-import-map-or-service-worker-request",
      "request|portable|rejected-before-provider-work|portable-inferred-public-directory-request",
      "request|portable|rejected-before-provider-work|portable-resource-traversal-link-or-collision-request",
      "request|portable|rejected-before-provider-work|portable-externals-request",
      "request|portable|unsupported|portable-provider-without-versioned-metadata-completeness",
      "request|portable|unsupported|portable-provider-requiring-filename-or-generated-code-guessing",
      "request|provider-native|provider-native-only|native-bun-or-deno-browser-selector-request",
      "request|provider-native|provider-native-only|native-plugin-callback-or-caller-output-request",
    ]);
    expect(decisionKeys(contract.profiles.staticBrowserApplication.resultDecisions)).toEqual([
      "result|portable|admitted|profiled-tree-snapshot",
      "result|portable|admitted|static-browser-application",
      "result|portable|admitted|directory-generation",
      "result|portable|admitted|activated-current-generation",
      "result|portable|rejected-post-analysis-pre-commit|portable-unknown-output-graph",
      "result|portable|rejected-post-analysis-pre-commit|portable-entry-without-one-authoritative-loadable-module",
      "result|portable|rejected-post-analysis-pre-commit|portable-unknown-module-css-asset-or-source-map-edge",
      "result|portable|rejected-post-analysis-pre-commit|portable-unknown-media-type-or-computed-runtime-import",
      "result|provider-native|provider-native-only|native-artifact-bundle",
      "result|provider-native|provider-native-only|native-build-result-or-rolldown-output",
    ]);
    for (
      const profile of [
        contract.profiles.nodeMainExecutable,
        contract.profiles.staticBrowserApplication,
      ]
    ) {
      for (const decision of [...profile.requestDecisions, ...profile.resultDecisions]) {
        expect(decision.lane === "provider-native").toBe(
          decision.disposition === "provider-native-only",
        );
      }
    }

    expect(contract.lifecycle.portableCancellation.scope).toBe("schema-serializable-portable-jobs-only");
    expect(contract.lifecycle.portableCancellation).toMatchObject({
      maxSerializedControlMessageBytes: 1_048_576,
      maxCapturedBytesPerOutputStream: 1_048_576,
      cooperativeGraceMilliseconds: 5_000,
      containment: {
        unix: "owned-process-group",
        windows: "owned-job-object-with-kill-on-close",
      },
      completion: "wait-for-known-process-tree-exit-and-private-staging-cleanup",
      sequence: [
        "send-cooperative-interruption",
        "wait-fixed-grace",
        "force-owned-process-tree",
        "await-confirmed-tree-exit",
        "clean-private-staging",
      ],
      lateWrites: "forbidden-after-interruption-completes",
    });
    expect(contract.lifecycle.providerNativeCancellation).toBe(
      "provider-specific-no-portable-hard-cancellation-claim",
    );
    expect(contract.lifecycle.watch).toEqual({
      pendingCompletedResults: 1,
      coalescing: "latest-completed-result-wins-and-surfaces-superseded-count",
      ownershipScope: "one-watch-stream-instance-global-across-superseded-events",
      ownedNativeCloseKinds: ["build", "watcher", "result"],
      maxOutstandingClosesPerKind: 1,
      maxOutstandingClosesTotal: 3,
      maxLiveOwnedResourcesPerKind: 1,
      ownership: "exactly-once-awaited-close",
      cleanupFailure: "preserve-in-effect-cause-with-primary-failure",
    });
    const compatibility = contract.requiredCompatibilityEvidencePoints;
    expect(Object.keys(compatibility)).toEqual([
      "status",
      "bun",
      "deno",
      "node",
      "esbuild",
      "rolldown",
      "appleDistribution",
      "appleCleanHost",
      "effect",
      "effectInstallablePeerRange",
      "effectRepositoryDevelopmentPoint",
      "playwright",
      "certificationHosts",
      "targetExecutionHosts",
      "providerIndependenceGroups",
      "providerIndependenceRule",
      "coordinateRules",
      "installableRangeIsExecutionEvidence",
    ]);
    expect(compatibility).toMatchObject({
      status: "required-not-yet-complete",
      bun: ["1.3.14"],
      deno: ["2.9.5"],
      node: ["26.7.0"],
      esbuild: ["0.28.2"],
      rolldown: ["1.2.5"],
      appleDistribution: {
        status: "credential-backed-exact-toolchain-evidence-required-not-yet-complete",
        systemTargets: ["macos-x64", "macos-aarch64"],
        runnerBinding: "requiredCompatibilityEvidencePoints-targetExecutionHosts",
        scenarioRule: "requiredCompatibilityEvidencePoints-coordinateRules-appleDistribution",
      },
      appleCleanHost: {
        status: "quarantined-clean-host-evidence-required-not-yet-complete",
        systemTargets: ["macos-x64", "macos-aarch64"],
        scenarioRule: "requiredCompatibilityEvidencePoints-coordinateRules-appleCleanHost",
      },
      effect: ["4.0.0-beta.104", "4.0.0-rc.108"],
      effectInstallablePeerRange: ">=4.0.0-beta.104 <4.1.0-0",
      effectRepositoryDevelopmentPoint: "4.0.0-rc.108",
      playwright: ["1.62.1"],
      installableRangeIsExecutionEvidence: false,
    });
    expect(compatibility.certificationHosts).toEqual([
      { id: "linux-x64-gnu", runner: "ubuntu-24.04", systemTarget: "linux-x64-gnu" },
      { id: "macos-aarch64", runner: "macos-15", systemTarget: "macos-aarch64" },
      { id: "windows-x64", runner: "windows-2025", systemTarget: "windows-x64" },
    ]);
    expect(compatibility.targetExecutionHosts).toEqual([
      { target: "macos-x64", runner: "macos-15-intel" },
      { target: "macos-aarch64", runner: "macos-15" },
      { target: "linux-x64-gnu", runner: "ubuntu-24.04" },
      { target: "linux-aarch64-gnu", runner: "ubuntu-24.04-arm" },
      { target: "windows-x64", runner: "windows-2025" },
      { target: "windows-aarch64", runner: "windows-11-arm" },
    ]);
    expect(compatibility.targetExecutionHosts.map(({ target }) => target)).toEqual(
      nodeCells.map(({ target }) => target),
    );
    expect(compatibility.providerIndependenceGroups).toEqual([
      {
        id: "bun-cli",
        package: "effect-build-bun",
        upstreamEngine: "oven-sh/bun",
        executionBoundary: "external-command",
      },
      {
        id: "esbuild-api",
        package: "effect-build-esbuild",
        upstreamEngine: "evanw/esbuild",
        executionBoundary: "in-process-api",
      },
      {
        id: "rolldown-api",
        package: "effect-build-rolldown",
        upstreamEngine: "rolldown/rolldown",
        executionBoundary: "in-process-api",
      },
    ]);
    expect(compatibility.providerIndependenceRule).toBe(
      "different-group-id-requires-distinct-package-upstream-engine-and-adapter-codepath",
    );
    expect(compatibility.coordinateRules).toEqual({
      staticBrowserApplication: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          providerGroup: ["bun-cli", "esbuild-api", "rolldown-api"],
          browserEngine: ["chromium@1234", "firefox@1538", "webkit@2336"],
          certificationHost: ["linux-x64-gnu", "macos-aarch64", "windows-x64"],
        },
        expectedCoordinateCount: 27,
        operation: "build-serve-and-exercise-generation-qualified-application",
      },
      nodeMainExecutable: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          producerGroup: ["bun-cli", "esbuild-api", "rolldown-api"],
          mainFormat: ["commonjs", "module"],
          constructionHost: ["linux-x64-gnu", "macos-aarch64", "windows-x64"],
          target: [
            "macos-x64",
            "macos-aarch64",
            "linux-x64-gnu",
            "linux-aarch64-gnu",
            "windows-x64",
            "windows-aarch64",
          ],
        },
        expectedCoordinateCount: 108,
        targetExecutionHostRule: "each-coordinate-executes-on-the-one-targetExecutionHost-with-the-same-target",
        operation: "produce-seal-cross-assemble-inspect-and-execute",
      },
      providerNativeLanes: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          toolCell: [
            "bun@1.3.14",
            "deno@2.9.5",
            "node@26.7.0",
            "esbuild@0.28.2",
            "rolldown@1.2.5",
          ],
          certificationHost: ["linux-x64-gnu", "macos-aarch64", "windows-x64"],
        },
        expectedCoordinateCount: 15,
        operation: "provider-native-public-contract-smoke",
      },
      appleDistribution: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          scenario: [
            "developer-id-sign-bun-executable",
            "developer-id-sign-deno-executable",
            "developer-id-sign-node-sea-executable",
            "notarized-stapled-app-bundle",
            "notarized-zip-transport",
            "notarized-stapled-disk-image",
            "notarized-stapled-installer-package",
          ],
          systemTarget: ["macos-x64", "macos-aarch64"],
        },
        expectedCoordinateCount: 14,
        operation: "credential-backed-build-sign-notarize-staple-where-supported-and-locally-assess",
      },
      appleCleanHost: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          product: ["G-App", "G-ZIP", "G-DMG", "G-PKG"],
          systemTarget: ["macos-x64", "macos-aarch64"],
        },
        expectedCoordinateCount: 8,
        operation: "acquire-the-exact-quarantined-release-transport-and-exercise-the-normal-clean-host-user-flow",
      },
      packedConsumers: {
        rule: "full-cartesian-product-no-pruning",
        axes: {
          package: contract.release.orderedPackages,
          effect: ["4.0.0-beta.104", "4.0.0-rc.108"],
          certificationHost: ["linux-x64-gnu", "macos-aarch64", "windows-x64"],
        },
        expectedCoordinateCount: 42,
        operation: "fresh-exact-packed-install-with-strict-peer-dependencies",
      },
    });
    const nodeRule = compatibility.coordinateRules.nodeMainExecutable;
    if (nodeRule === undefined) throw new Error("missing node-main compatibility rule");
    const nodeAxes = nodeRule.axes;
    const producerGroups = nodeAxes.producerGroup;
    const mainFormats = nodeAxes.mainFormat;
    const constructionHosts = nodeAxes.constructionHost;
    const targets = nodeAxes.target;
    if (
      producerGroups === undefined
      || mainFormats === undefined
      || constructionHosts === undefined
      || targets === undefined
    ) {
      throw new Error("missing node-main compatibility axis");
    }
    const targetFinalizerCoordinates = producerGroups.flatMap((producerGroup) =>
      mainFormats.flatMap((format) =>
        constructionHosts.flatMap((constructionHost) =>
          targets.map(
            (target) => `node-main--${producerGroup}--${format}--from-${constructionHost}--to-${target}`,
          )
        )
      )
    );
    expect(targetFinalizerCoordinates).toHaveLength(108);
    expect(new Set(targetFinalizerCoordinates).size).toBe(108);
    const targetFinalizerCoordinate = "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64";
    expect(targetFinalizerCoordinates).toContain(targetFinalizerCoordinate);
    expect(`construct--${targetFinalizerCoordinate}`).toBe(
      "construct--node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64",
    );
    expect(`finalize--${targetFinalizerCoordinate}`).toBe(
      "finalize--node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64",
    );
    expect(`${targetFinalizerCoordinate}--constructed`).toBe(
      "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64--constructed",
    );
    expect(`${targetFinalizerCoordinate}--finalized`).toBe(
      "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64--finalized",
    );
    expect(`${targetFinalizerCoordinate}--assembler-offer.json`).toBe(
      "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64--assembler-offer.json",
    );
    expect(`${targetFinalizerCoordinate}--receipt`).toBe(
      "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64--receipt",
    );
    expect(`${targetFinalizerCoordinate}--target-finalizer-receipt.json`).toBe(
      "node-main--bun-cli--commonjs--from-linux-x64-gnu--to-macos-x64--target-finalizer-receipt.json",
    );
    for (
      const suffix of [
        "--constructed",
        "--finalized",
        "--assembler-offer.json",
        "--receipt",
        "--target-finalizer-receipt.json",
      ]
    ) {
      const names = targetFinalizerCoordinates.map((coordinate) => `${coordinate}${suffix}`);
      expect(new Set(names).size, suffix).toBe(108);
    }
    for (const [name, rule] of Object.entries(compatibility.coordinateRules)) {
      const product = Object.values(rule.axes).reduce((count, axis) => count * axis.length, 1);
      expect(rule.rule, name).toBe("full-cartesian-product-no-pruning");
      expect(rule.expectedCoordinateCount, name).toBe(product);
    }
  });

  it("freezes canonical generation and current-reference bytes", async () => {
    const contract = await readJson<V05Contract>("tooling/v05-contract.json");
    const manifest = contract.generation.manifestBytes;
    const current = contract.generation.currentReferenceBytes;

    expect(contract.generation.layout).toEqual({
      currentReference: "current.json",
      generationDirectory: "generations/sha256-<lowercase-hex>/",
      generationTree: "generations/sha256-<lowercase-hex>/tree/",
      manifest: "manifest.json",
      automaticGarbageCollection: false,
    });
    expect(contract.generation.path).toMatchObject({
      separator: "/",
      unicodePolicy: "portable-generation-paths-are-ascii",
      ordering: "ascending-unsigned-utf8-byte-sequence",
    });
    expect(manifest.encoding).toBe("utf-8-without-bom");
    expect(manifest.unknownFields).toBe("reject");
    expect(manifest.topLevelFieldOrder).toEqual(["protocol", "subject", "files"]);
    expect(manifest.subject.unprofiledTreeFieldOrder).toEqual(["profile"]);
    expect(manifest.subject.unprofiledTreeProfile).toBe("effect-build/generation-subject/tree@1");
    expect(manifest.subject.staticBrowserFieldOrder).toEqual(["profile", "entry", "mount", "host"]);
    expect(manifest.fileFieldOrder).toEqual(["path", "bytes", "digest", "mediaType"]);
    expect(manifest.digestFieldOrder).toEqual(["algorithm", "value"]);
    expect(manifest.byteCount).toBe("canonical-unsigned-decimal-string");
    expect(manifest.digest).toBe("algorithm-sha256-plus-lowercase-64-hex-value");
    expect(manifest.serialization).toBe("compact-json-with-one-trailing-lf");
    expect(manifest.sampleSha256).toBe("211ead14e221092d32c78fd7c992d27aeb54753a837a89d1ac3b063d0aa28a3a");
    expect(manifest.sample.endsWith("\n")).toBe(true);
    expect(manifest.sample.endsWith("\n\n")).toBe(false);
    expect(createHash("sha256").update(manifest.sample).digest("hex")).toBe(manifest.sampleSha256);
    expect(JSON.stringify(JSON.parse(manifest.sample)) + "\n").toBe(manifest.sample);
    const manifestValue = JSON.parse(manifest.sample) as {
      readonly protocol: string;
      readonly subject: {
        readonly profile: string;
        readonly entry: string;
        readonly mount: string;
        readonly host: string;
      };
      readonly files: readonly {
        readonly path: string;
        readonly bytes: string;
        readonly digest: { readonly algorithm: string; readonly value: string };
        readonly mediaType: string | null;
      }[];
    };
    expect(Object.keys(manifestValue)).toEqual(manifest.topLevelFieldOrder);
    expect(manifestValue.protocol).toBe(contract.protocols.generationManifest);
    expect(Object.keys(manifestValue.subject)).toEqual(manifest.subject.staticBrowserFieldOrder);
    expect(manifestValue.subject).toEqual({
      profile: contract.profiles.staticBrowserApplication.id,
      entry: manifest.subject.staticBrowserEntry,
      mount: manifest.subject.staticBrowserMount,
      host: manifest.subject.staticBrowserHost,
    });
    expect(manifestValue.files.map(({ path }) => path)).toEqual(["assets/app.js", "index.html"]);
    for (const file of manifestValue.files) {
      expect(Object.keys(file)).toEqual(manifest.fileFieldOrder);
      expect(file.bytes).toMatch(/^(0|[1-9][0-9]*)$/);
      expect(Object.keys(file.digest)).toEqual(manifest.digestFieldOrder);
      expect(file.digest).toMatchObject({ algorithm: "sha256" });
      expect(file.digest.value).toMatch(/^[0-9a-f]{64}$/);
      expect(file).toHaveProperty("mediaType");
    }
    expect(manifest.mediaType).toEqual({
      canonicalGrammar: "[a-z0-9][a-z0-9!#$%&*+.^_~-]*/[a-z0-9][a-z0-9!#$%&*+.^_~-]*(?:; charset=utf-8)?",
      canonicalization: "reject-noncanonical-do-not-normalize",
      staticBrowserNull: "forbidden",
      unprofiledTreeNull: "allowed",
    });
    const mediaType = new RegExp(`^(?:${manifest.mediaType.canonicalGrammar})$`);
    for (const file of manifestValue.files) {
      expect(file.mediaType, file.path).not.toBeNull();
      if (file.mediaType !== null) expect(mediaType.test(file.mediaType), file.mediaType).toBe(true);
    }
    for (const value of ["Text/HTML", "text/html;charset=utf-8", "text/html; charset=UTF-8", "text/html "]) {
      expect(mediaType.test(value), value).toBe(false);
    }

    expect(current).toMatchObject({
      encoding: "utf-8-without-bom",
      serialization: "compact-json-with-one-trailing-lf",
      unknownFields: "reject",
      digestFieldOrder: ["algorithm", "value"],
    });
    expect(current.sampleSha256).toBe("6d7d3f6cc5b36918d08b0be1800ca5dd7f8bfb56ced3cf52b19bd347ea6f3a30");
    expect(current.sample.endsWith("\n")).toBe(true);
    expect(current.sample.endsWith("\n\n")).toBe(false);
    expect(JSON.stringify(JSON.parse(current.sample)) + "\n").toBe(current.sample);
    const currentValue = JSON.parse(current.sample) as {
      readonly protocol: string;
      readonly manifestDigest: { readonly algorithm: string; readonly value: string };
    };
    expect(Object.keys(currentValue)).toEqual(current.fieldOrder);
    expect(Object.keys(currentValue.manifestDigest)).toEqual(current.digestFieldOrder);
    expect(currentValue.protocol).toBe(contract.protocols.currentGeneration);
    expect(currentValue.manifestDigest).toEqual({ algorithm: "sha256", value: manifest.sampleSha256 });
    expect(createHash("sha256").update(current.sample).digest("hex")).toBe(current.sampleSha256);
    expect(contract.generation.activation).toBe("atomically-replace-current-reference-only");
    expect(contract.generation.layout.automaticGarbageCollection).toBe(false);
    expect(contract.generation.readerProtocol).toEqual([
      "read-and-strictly-decode-current-reference-once",
      "derive-and-pin-the-generation-name-from-the-one-manifest-digest-without-retry-or-fallback",
      "read-and-hash-the-named-manifest",
      "require-manifest-digest-to-match-the-reference-and-derived-generation-name",
      "serve-only-manifest-listed-contained-files-from-the-pinned-generation",
      "verify-byte-count-and-digest-before-lending-content",
      "resolve-new-root-navigation-through-current-and-redirect-to-a-generation-qualified-url",
    ]);

    const component = new RegExp(`^(?:${contract.generation.path.portableComponentGrammar})$`);
    expect(contract.generation.path.windowsReservedDeviceBasenames).toEqual([
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ]);
    const windowsDevice = new RegExp(
      `^(?:${contract.generation.path.windowsReservedDeviceBasenames.join("|")})(?:\\..*)?$`,
      "i",
    );
    const isPortableComponent = (value: string): boolean => component.test(value) && !windowsDevice.test(value);

    expect(contract.generation.path.forbid).toEqual([
      "absolute-path",
      "empty-component",
      "dot-component",
      "dot-dot-component",
      "backslash",
      "symlink-or-junction",
      "windows-reserved-device-basename-with-or-without-extension",
      "component-ending-dot-or-space",
      "ascii-case-insensitive-collision",
    ]);
    for (const value of ["CON", "con.txt", "NUL.js", "LPT1", "app.", "a/b?"]) {
      expect(isPortableComponent(value), value).toBe(false);
    }
    for (const value of ["assets", "app.js"]) expect(isPortableComponent(value), value).toBe(true);
  });

  it("records an exact hard cut from the current generated public surface", async () => {
    const contract = await readJson<V05Contract>("tooling/v05-contract.json");
    const current = await readJson<Surface>(contract.publicSurface.currentSnapshot);
    expect(contract.publicSurface.currentSnapshotMeaning).toBe(
      "stage-4-node-sea-public-hard-cut-applied-target-finalizer-evidence-pending",
    );
    const packages = current.packages;

    expect(Object.keys(packages)).toEqual([
      "effect-build",
      "effect-build-apple",
      "effect-build-bun",
      "effect-build-deno",
      "effect-build-esbuild",
      "effect-build-node-sea",
      "effect-build-rolldown",
    ]);
    expect(packages["effect-build-apple"]).toBeDefined();
    const currentApple = packages["effect-build-apple"];
    if (currentApple === undefined) throw new Error("missing integrated Apple public surface");
    expect(currentApple.namespaces).toEqual([
      "AppBundle",
      "Artifact",
      "Assess",
      "CodeSign",
      "DiskImage",
      "InstallerPackage",
      "Notary",
      "Staple",
      "Zip",
    ]);
    const appleContract = contract.providerNativeHardening.appleDistribution as {
      readonly selectedOperationInventory: Readonly<Record<string, readonly string[]>>;
      readonly intentionalPublicRecoverySurface: Readonly<Record<string, string>>;
    };
    for (const [subpath, selectedNames] of Object.entries(appleContract.selectedOperationInventory)) {
      expect(currentApple.subpaths[`./${subpath}`]?.runtime, subpath).toEqual(
        expect.arrayContaining([...selectedNames]),
      );
    }
    expect(currentApple.subpaths["./Artifact"]?.declarations).toContain("LifecycleError");
    expect(appleContract.intentionalPublicRecoverySurface).toEqual({
      artifactLifecycleError: "public-shared-staging-and-publication-error-type",
      taggedErrorConstructors:
        "all-runtime-tagged-error-constructors-in-tooling-public-api-are-intentional-for-effect-tag-recovery",
    });
    expect(Object.keys(contract.publicSurface.targetRootNamespaces)).toEqual(
      contract.release.orderedPackages,
    );
    expect(Object.keys(contract.publicSurface.targetPackageExports)).toEqual(
      contract.release.orderedPackages,
    );
    expect(contract.publicSurface.compatibilityAliases).toEqual([]);
    expect(contract.publicSurface.stage0FreezeScope).toBe(
      "exact-roots-subpaths-and-owning-stage-symbols-frozen-for-all-seven-packages",
    );
    expect(contract.publicSurface.exactTargetSymbolsStatus).toBe(
      "all-owning-stage-runtime-and-declaration-symbols-frozen-compatibility-evidence-remains-release-blocking",
    );
    expect(contract.publicSurface.targetRootNamespaces).toEqual({
      "effect-build": ["Artifact", "BuildError", "Target"],
      "effect-build-apple": [
        "Artifact",
        "CodeSign",
        "AppBundle",
        "Zip",
        "DiskImage",
        "InstallerPackage",
        "Notary",
        "Staple",
        "Assess",
      ],
      "effect-build-bun": ["Bundle", "CompileExecutable", "Profile"],
      "effect-build-deno": ["Bundle", "CompileExecutable"],
      "effect-build-esbuild": ["Build", "Context", "Profile", "Watch"],
      "effect-build-node-sea": ["NodeMainExecutable", "Raw"],
      "effect-build-rolldown": ["Build", "Profile", "Watch"],
    });
    expect(contract.publicSurface.targetPackageExports).toEqual({
      "effect-build": [
        ".",
        "./Artifact",
        "./Author/BorrowedContent",
        "./Author/Generation",
        "./Author/NodeMain",
        "./Author/Tool",
        "./Author/TreeSnapshot",
        "./BuildError",
        "./Profile/StaticBrowserApplication",
        "./Target",
      ],
      "effect-build-apple": [
        ".",
        "./Artifact",
        "./CodeSign",
        "./AppBundle",
        "./Zip",
        "./DiskImage",
        "./InstallerPackage",
        "./Notary",
        "./Staple",
        "./Assess",
      ],
      "effect-build-bun": [".", "./Bundle", "./CompileExecutable", "./Profile"],
      "effect-build-deno": [".", "./Bundle", "./CompileExecutable"],
      "effect-build-esbuild": [".", "./Build", "./Context", "./Profile", "./Watch"],
      "effect-build-node-sea": [".", "./NodeMainExecutable", "./Raw"],
      "effect-build-rolldown": [".", "./Build", "./Profile", "./Watch"],
    });
    const appleTargetSubpaths = (
      contract.providerNativeHardening.appleDistribution as {
        readonly targetSubpaths: readonly string[];
      }
    ).targetSubpaths;
    expect(contract.publicSurface.targetRootNamespaces["effect-build-apple"]).toEqual(
      appleTargetSubpaths,
    );
    expect(contract.publicSurface.targetPackageExports["effect-build-apple"]?.slice(1)).toEqual(
      appleTargetSubpaths.map((subpath) => `./${subpath}`),
    );
    expect(contract.publicSurface.targetSymbolPolicy).toBe(
      "apple-owning-stage-has-frozen-its-runtime-and-declaration-symbols-each-remaining-api-changing-stage-must-do-the-same-and-regenerate-public-api",
    );
    expect(contract.publicSurface.providerNativeBundleResultMigration).toEqual({
      deletedCoreDeclarations: ["effect-build/Artifact#Bundle", "effect-build/Artifact#BundleFile"],
      replacementOwners: {
        "effect-build-bun/Bundle": ["Bundle", "BundleFile"],
        "effect-build-deno/Bundle": ["Bundle", "BundleFile"],
      },
      freezeStage: "stage-2-before-core-deletion-and-provider-source-export",
    });
    expect(contract.publicSurface.remainingSymbolFreezeStops).toEqual([]);
    expect(contract.publicSurface.authorPromotionGate).toEqual({
      status: "passed-by-packed-external-adapter",
      adapter: "real-out-of-tree-non-monorepo-package",
      installation: "fresh-exact-packed-tarballs-with-strict-peer-dependencies",
      imports: "public-subpaths-only",
      sharedAuthoringLaws: "must-pass",
      duplicateCoreGraph: "must-be-exercised",
      unknownProtocolMajor: "reject-before-provider-work",
      consumerProviderBranches: 0,
    });
    expect(contract.publicSurface.scheduledDeletions).toEqual([
      { kind: "rootNamespace", package: "effect-build", name: "Toolchain" },
      { kind: "subpath", package: "effect-build", name: "./Toolchain" },
      { kind: "declaration", package: "effect-build", subpath: "./Artifact", name: "Bundle" },
      { kind: "declaration", package: "effect-build", subpath: "./Artifact", name: "BundleFile" },
      { kind: "declaration", package: "effect-build", subpath: "./Artifact", name: "Tool" },
      {
        kind: "runtimeAndDeclaration",
        package: "effect-build",
        subpath: "./Target",
        name: "host",
      },
      { kind: "rootNamespace", package: "effect-build-node-sea", name: "AssembleExecutable" },
      { kind: "subpath", package: "effect-build-node-sea", name: "./AssembleExecutable" },
    ]);

    for (const deletion of contract.publicSurface.scheduledDeletions) {
      const pkg = packages[deletion.package];
      expect(pkg, `${deletion.package} exists`).toBeDefined();
      if (pkg === undefined) throw new Error(`scheduled deletion names missing package: ${deletion.package}`);
      const applied = deletion.package === "effect-build" || deletion.package === "effect-build-node-sea";
      switch (deletion.kind) {
        case "rootNamespace":
          if (applied) expect(pkg.namespaces, `${deletion.package} root ${deletion.name}`).not.toContain(deletion.name);
          else expect(pkg.namespaces, `${deletion.package} root ${deletion.name}`).toContain(deletion.name);
          break;
        case "subpath":
          if (applied) expect(pkg.subpaths, `${deletion.package}${deletion.name}`).not.toHaveProperty(deletion.name);
          else expect(pkg.subpaths, `${deletion.package}${deletion.name}`).toHaveProperty(deletion.name);
          break;
        case "declaration":
          {
            const subpath = pkg.subpaths[deletion.subpath];
            if (subpath === undefined) throw new Error(`scheduled deletion names missing subpath: ${deletion.subpath}`);
            if (applied) {
              expect(subpath.declarations, `${deletion.package}${deletion.subpath}`).not.toContain(deletion.name);
            } else expect(subpath.declarations, `${deletion.package}${deletion.subpath}`).toContain(deletion.name);
          }
          break;
        case "runtimeAndDeclaration":
          {
            const subpath = pkg.subpaths[deletion.subpath];
            if (subpath === undefined) throw new Error(`scheduled deletion names missing subpath: ${deletion.subpath}`);
            if (applied) {
              expect(subpath.runtime, `${deletion.package}${deletion.subpath} runtime`).not.toContain(deletion.name);
              expect(subpath.declarations, `${deletion.package}${deletion.subpath} declarations`).not.toContain(
                deletion.name,
              );
            } else {
              expect(subpath.runtime, `${deletion.package}${deletion.subpath} runtime`).toContain(deletion.name);
              expect(subpath.declarations, `${deletion.package}${deletion.subpath} declarations`).toContain(
                deletion.name,
              );
            }
          }
          break;
      }
    }

    expect(contract.publicSurface.targetPackageExports["effect-build"]).not.toContain("./Toolchain");
    expect(contract.publicSurface.targetPackageExports["effect-build-node-sea"]).not.toContain(
      "./AssembleExecutable",
    );
    expect(JSON.stringify(contract.publicSurface.targetPackageExports)).not.toMatch(/Registry|Toolchain/);
  });

  it("freezes the fixed-seven manual release state machine and quarantines the broken publisher", async () => {
    const contract = await readJson<V05Contract>("tooling/v05-contract.json");
    const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    const cleanScript = await readFile(resolve(root, "scripts/clean-dist.mjs"), "utf8");

    expect(contract.release.orderedPackages).toEqual([
      "effect-build",
      "effect-build-apple",
      "effect-build-bun",
      "effect-build-deno",
      "effect-build-esbuild",
      "effect-build-node-sea",
      "effect-build-rolldown",
    ]);
    expect(contract.release.orderedPackagePrerequisites).toEqual({
      "effect-build": [],
      "effect-build-apple": ["effect-build"],
      "effect-build-bun": ["effect-build"],
      "effect-build-deno": ["effect-build"],
      "effect-build-esbuild": ["effect-build"],
      "effect-build-node-sea": ["effect-build"],
      "effect-build-rolldown": ["effect-build"],
    });
    expect(contract.release.concurrency).toEqual({
      scope:
        "workflow-level-across-main-initial-and-v0.5.0-tag-recovery-dispatches-from-first-observation-through-final-reobservation-or-preEscrowRollback",
      group: "effect-build-release-v0.5.0",
      cancelInProgress: false,
      singleWriter:
        "at-most-one-running-release-workflow-may-observe-for-mutation-stage-publish-rollback-delete-or-finalize",
      pendingOrder: "not-relied-upon-every-admitted-run-reobserves-all-subjects-after-acquiring-the-group",
      rollbackLease: "preEscrowRollback-must-hold-the-same-workflow-level-group-through-each-delete-and-reobservation",
      unquarantineGate:
        "parse-the-target-workflow-and-require-the-exact-group-and-literal-false-cancel-in-progress-before-any-write-capability",
    });
    expect(contract.release.requiredEquivalentPrefixLengths).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const [index, packageName] of contract.release.orderedPackages.entries()) {
      const prerequisites = contract.release.orderedPackagePrerequisites[packageName];
      expect(prerequisites, packageName).toBeDefined();
      for (const prerequisite of prerequisites ?? []) {
        expect(contract.release.orderedPackages.indexOf(prerequisite), `${packageName}->${prerequisite}`).toBeLessThan(
          index,
        );
      }
    }
    expect(contract.release.observationStates).toEqual(["Absent", "Equivalent", "Conflict", "Unknown"]);
    expect(contract.release.reportOnlyStates).toEqual(["NotReached"]);
    expect(contract.release.stateDefinitions).toEqual({
      Absent: "authoritative-exact-version-404",
      Equivalent:
        "registry-tarball-and-packed-identity-match-candidate-required-provenance-binds-approvedPublisher-workflow-source-and-sourceSha-and-desiredDistTag-is-present",
      Conflict:
        "coordinate-exists-with-different-bytes-packed-identity-required-approvedPublisher-provenance-or-desiredDistTag-policy",
      Unknown: "timeout-malformed-response-5xx-rate-limit-or-ambiguous-mutation",
    });
    expect(contract.release.candidatePackageRecordFields).toEqual([
      "name",
      "version",
      "filename",
      "dependencyPrerequisites",
      "bytes",
      "sha256",
      "sha1",
      "sha512SRI",
      "packedName",
      "packedVersion",
    ]);
    expect(contract.release.unknownPolicy).toBe("never-retry-publication-only-bounded-reobservation");
    expect(contract.release.registryObservationBounds).toEqual({
      requestTimeoutMilliseconds: 10_000,
      attemptsPerObservation: 3,
      delayBeforeAttemptMilliseconds: [0, 1_000, 3_000],
      maximumObservationElapsedMilliseconds: 35_000,
      maximumResponseBytes: 1_048_576,
      retryableOutcomes: ["network-error", "timeout", "http-429", "http-5xx"],
      publicationAttemptsPerCoordinate: 1,
      afterAmbiguousPublication: "reobserve-with-the-same-bounds-then-stop-unknown",
    });
    expect(
      contract.release.registryObservationBounds.attemptsPerObservation
          * contract.release.registryObservationBounds.requestTimeoutMilliseconds
        + contract.release.registryObservationBounds.delayBeforeAttemptMilliseconds.reduce(
          (total, delay) => total + delay,
          0,
        ),
    ).toBeLessThanOrEqual(contract.release.registryObservationBounds.maximumObservationElapsedMilliseconds);
    expect(contract.release.externalMutationsAuthorizedByThisContract).toEqual([]);
    for (const name of contract.release.orderedPackages) {
      expect(cleanScript, `${name} dist is removed before a build`).toContain(`packages/${name}/dist`);
    }
    expect(contract.release.automaticGreenMainPublication).toBe(false);
    expect(contract.release.npmStagedPublishing).toBe(false);
    expect(contract.release.genericReleaseGraph).toBe(false);
    expect(contract.release.candidateGeneration).toBe("automatic-read-only-is-allowed");
    expect(contract.release.candidateTarballs).toBe("build-once-pack-once-test-and-publish-identical-bytes");
    expect(contract.release.publicationTrigger).toBe("manual-workflow-dispatch");
    expect(contract.release.approval).toBe("protected-environment-npm");
    expect(contract.release.desiredDistTag).toBe("latest");
    expect(contract.release.packageAccess).toBe("public");
    expect(contract.release.candidateIdentity).toEqual({
      schema: contract.protocols.releaseCandidate,
      sourceRepository: "https://github.com/mannyc2/effect-build",
      sourceRef: "refs/heads/main",
      workflowRepository: "mannyc2/effect-build",
      workflowPath: ".github/workflows/candidate.yml",
      workflowRef: "refs/heads/main",
      workflowEvent: "push",
      descriptorArtifactName: "effect-build-release-candidate-descriptor",
      descriptorFileName: "release-candidate.json",
      payloadArtifactName: "effect-build-release-candidate-payload",
      transportDigest: "github-rest-sha256-colon-lowercase-64-hex",
      descriptorContentDigest: "sha256-of-exact-rfc8785-descriptor-file-bytes-including-the-one-final-lf",
      descriptorEncoding: "rfc8785-json-canonicalization-scheme-utf8-followed-by-one-lf",
      descriptorCanonicalization: {
        objectMemberOrder: "rfc8785-utf16-code-unit-lexicographic-at-every-depth",
        unknownFields: "rejected-at-every-object-level",
        topLevelFieldSet: "exactly-requiredDescriptorFields",
        packageOrder: "exactly-orderedPackages",
        packageFieldSet: "exactly-candidatePackageRecordFields",
        dependencyPrerequisites: "exactly-orderedPackagePrerequisites-for-record-name",
        integerEncoding: "positive-base10-integer-strings-without-leading-zero",
        integerFields: [
          "workflowRunId",
          "workflowRunAttempt",
          "payloadArtifactId",
          "packages[].bytes",
        ],
        jsonNumbers: "forbidden",
        arrayOrder: "semantic-and-field-specific",
        topLevelFieldTypes: {
          schema: "string-equal-releaseCandidate-protocol",
          version: "string-equal-0.5.0",
          sourceRepository: "string-equal-frozen-sourceRepository",
          sourceRef: "string-equal-refs/heads/main",
          sourceSha: "string-lowercase-40-hex",
          workflowRepository: "string-equal-frozen-workflowRepository",
          workflowPath: "string-equal-frozen-workflowPath",
          workflowRef: "string-equal-refs/heads/main",
          workflowRunId: "positive-decimal-string-without-leading-zero",
          workflowRunAttempt: "positive-decimal-string-without-leading-zero",
          workflowRunHeadSha: "string-lowercase-40-hex",
          checkedOutSourceSha: "string-lowercase-40-hex",
          payloadArtifactId: "positive-decimal-string-without-leading-zero",
          payloadArtifactName: "string-equal-frozen-payloadArtifactName",
          payloadArtifactDigest: "string-github-rest-sha256-colon-lowercase-64-hex",
          createdAt: "string-canonical-timestampEncoding",
          expiresAt: "string-canonical-timestampEncoding",
          packages: "array-of-exactly-seven-package-record-objects",
        },
        packageFieldTypes: {
          name: "string-equal-orderedPackages[index]",
          version: "string-equal-0.5.0",
          filename: "string-equal-orderedPackages[index]-0.5.0.tgz",
          dependencyPrerequisites: "array-exactly-orderedPackagePrerequisites-for-record-name",
          bytes: "positive-decimal-string-without-leading-zero",
          sha256: "string-lowercase-64-hex",
          sha1: "string-lowercase-40-hex",
          sha512SRI:
            "string-literal-sha512-prefix-followed-by-rfc4648-base64-of-exactly-64-digest-bytes-with-required-double-padding-and-reencode-equality",
          packedName: "string-equal-orderedPackages[index]",
          packedVersion: "string-equal-0.5.0",
        },
        packageIdentity:
          "for-every-index-name-equals-packedName-equals-orderedPackages[index]-and-filename-equals-orderedPackages[index]-0.5.0.tgz",
        sha512SRIGolden: {
          accepted: "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
          rejected: [
            "z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
            "sha256-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
            "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg",
            "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg_SpIdNs6c5H0NE8XYXysP-DGNKHfuwvY7kxvUdBeoGlODJ6-SfaPg==",
            "sha512- z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
          ],
        },
        digestFields: {
          payloadArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex",
          "packages[].sha256": "lowercase-64-hex",
          "packages[].sha1": "lowercase-40-hex",
          "packages[].sha512SRI":
            "literal-sha512-prefix-plus-rfc4648-standard-base64-of-64-digest-bytes-with-required-double-padding-and-decode-reencode-equality",
        },
      },
      descriptorArtifactLayout: {
        entrySet: "exactly-one-top-level-regular-file",
        entryName: "release-candidate.json",
        entryBytes: "exactly-descriptorEncoding",
        directories: "forbidden",
        links: "forbidden",
        absoluteParentOrBackslashPaths: "forbidden",
        duplicates: "forbidden",
        unexpectedEntries: "forbidden",
      },
      payloadLayout: {
        entrySet: "exactly-seven-top-level-regular-files",
        entryNames: "exactly-the-seven-candidate-package-record-filenames",
        entryBytes: "exactly-the-recorded-byte-count-sha256-sha1-and-sha512SRI",
        extension: ".tgz",
        directories: "forbidden",
        links: "forbidden",
        absoluteParentOrBackslashPaths: "forbidden",
        duplicates: "forbidden",
        descriptorInsidePayload: false,
        unexpectedEntries: "forbidden",
      },
      timestampEncoding: "valid-proleptic-gregorian-rfc3339-utc-exact-YYYY-MM-DDTHH:mm:ssZ-no-fraction-no-leap-second",
      maximumAgeSeconds: 86_400,
      freshnessPolicy: {
        initialMutation:
          "createdAt-not-in-future-expiresAt-not-past-and-expiresAt-minus-createdAt-at-most-maximumAgeSeconds-through-the-last-zero-mutation-preflight",
        postMutationEntry:
          "exactly-one-postMutationAdmission-closedUnion-arm-all-other-state-combinations-are-rejected-with-zero-further-mutations",
        postMutationAdmission: {
          closedUnion: [
            {
              arm: "same-attempt-pre-escrow-staging-continuation",
              expired: [false, true],
              githubCoordinatorStates: ["TagEquivalentReleaseAbsent", "DraftEquivalentEscrowAbsent"],
              coordinateReports: "exactly-seven-Absent",
              actionsArtifacts: "Available",
              releaseWorkflowOrigin:
                "same-workflowRunId-and-runAttempt-that-authenticated-the-fresh-candidate-observed-the-immediate-predecessor-state-performed-the-preceding-github-mutation-and-continuously-held-the-release-concurrency-group",
              recoveryEntry: "forbidden-for-rerun-new-workflow-run-or-tag-dispatch",
              disposition:
                "admitted-only-to-stage-the-next-github-subject-before-an-equivalent-escrow-candidate-binding",
            },
            {
              arm: "escrow-bound-final-assets-continuation",
              expired: [false, true],
              githubCoordinatorStates: [
                "DraftEquivalentEscrowCompleteFinalAssetsIncomplete",
              ],
              coordinateReports: "exactly-seven-Absent",
              actionsArtifacts: ["Available", "ExpiredOrDeleted"],
              wrapperSource: {
                Available: "admitted-using-the-authenticated-original-wrapper-bytes",
                ExpiredOrDeleted: "admitted-physical-artifact-recovery-from-the-equivalent-escrow",
              },
              candidateBinding:
                "the-equivalent-escrow-container-authenticates-the-exact-descriptor-payload-and-Apple-certification-wrappers-before-any-final-asset-continuation",
              disposition: "admitted-only-to-complete-the-nine-final-assets-before-any-npm-mutation",
            },
            {
              arm: "pre-escrow-staging-rollback",
              expired: [false, true],
              githubCoordinatorStates: [
                "TagRollbackEligible",
                "DraftRollbackEligibleEmpty",
                "DraftRollbackEligiblePartialStaging",
              ],
              coordinateReports: "exactly-seven-Absent",
              actionsArtifacts: {
                Available: "admitted-rollback-only-with-no-candidate-byte-use-or-equivalence-claim",
                ExpiredOrDeleted: "admitted-rollback-only-with-no-candidate-byte-use-or-equivalence-claim",
                Unknown: "admitted-rollback-only-because-actions-artifact-state-is-outside-the-rollback-proof-set",
              },
              releaseWorkflowOrigin:
                "new-workflowRunId-with-runAttempt-exactly-one-and-releaseRef-exact-refs/tags/v0.5.0",
              disposition: "admitted-only-to-preEscrowRollback-with-zero-npm-mutations",
            },
            {
              arm: "escrow-bound-final-assets-wait",
              expired: [false, true],
              githubCoordinatorStates: ["DraftEquivalentEscrowCompleteFinalAssetsIncomplete"],
              coordinateReports: "exactly-seven-Absent",
              actionsArtifacts: "Unknown",
              disposition: "await-authoritative-actions-state-with-zero-further-mutations",
            },
            {
              arm: "escrow-backed-npm-resumption",
              expired: [false, true],
              githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
              coordinateReports:
                "contiguous-Equivalent-prefix-length-zero-through-six-followed-only-by-Absent-with-every-Equivalent-record-and-approved-provenance-matching-the-escrowed-descriptor",
              equivalentPrefixLengths: [0, 1, 2, 3, 4, 5, 6],
              actionsArtifacts: {
                Available: "admitted-using-the-authenticated-original-wrapper-bytes",
                ExpiredOrDeleted: "admitted-physical-artifact-recovery-from-draft-escrow",
                Unknown: "rejected-with-zero-further-mutations",
              },
            },
            {
              arm: "escrow-present-github-finalization",
              expired: [false, true],
              githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
              coordinateReports:
                "exactly-seven-Equivalent-with-approved-provenance-matching-the-manifest-embedded-descriptor",
              actionsArtifacts: "irrelevant-not-in-the-terminal-proof-set",
              disposition: "admitted-github-finalization-only",
            },
            {
              arm: "escrow-deleted-draft-github-finalization",
              expired: [false, true],
              githubCoordinatorState: "DraftEquivalentPublicAssetsComplete",
              coordinateReports:
                "exactly-seven-Equivalent-with-approved-provenance-matching-the-manifest-embedded-descriptor",
              actionsArtifacts: "irrelevant-not-in-the-terminal-proof-set",
              authentication:
                "exact-equivalent-tag-and-draft-exact-nine-final-assets-canonical-manifest-embedded-descriptor-certification-index-certification-artifact-subject-and-escrowRun-plus-exact-certification-bundle-and-seven-authoritative-Equivalent-registry-records-with-approved-provenance",
              disposition: "admitted-github-finalization-only",
              forbidden: "actions-wrapper-recovery-npm-mutation-asset-mutation-or-candidate-substitution",
            },
            {
              arm: "already-public-observation-only-success",
              expired: [false, true],
              githubCoordinatorState: "Equivalent",
              coordinateReports:
                "exactly-seven-Equivalent-with-approved-provenance-matching-the-public-manifest-embedded-descriptor",
              actionsArtifacts: "irrelevant-not-in-the-terminal-proof-set",
              authentication:
                "exact-equivalent-tag-public-release-and-nine-final-assets-canonical-manifest-embedded-descriptor-certification-index-certification-artifact-subject-and-escrowRun-plus-exact-certification-bundle-and-seven-authoritative-Equivalent-registry-records-with-approved-provenance",
              disposition: "observation-only-success",
              forbidden: "all-mutations",
            },
          ],
          allOtherCombinations: "rejected-with-zero-further-mutations",
        },
        postMutationExpiryException:
          "after-the-first-equivalent-github-mutation-expiresAt-may-be-past-only-under-one-postMutationAdmission-arm-and-all-arm-specific-authentication-observation-approval-and-convergence-checks-remain-required",
        expiredAllAbsent:
          "admitted-only-for-same-attempt-pre-escrow-staging-continuation-escrow-bound-final-assets-continuation-preEscrowRollback-or-complete-draft-escrow-backed-publication",
        expiredGapConflictOrUnknownCoordinate: "rejected-with-zero-further-mutations",
        expiredCompleteEquivalentPrefix:
          "with-seven-Equivalent-coordinates-admitted-only-for-github-finalization-or-observation-only-success-under-postMutationAdmission",
        transitionCasesStatus:
          "representative-golden-cases-postMutationAdmission-closedUnion-is-authoritative-and-exhaustive",
        transitionCases: [
          {
            expired: false,
            actionsArtifacts: "Available",
            githubCoordinatorState: "TagAbsent",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-initial-escrow-staging",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "TagAbsent",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "rejected-with-zero-mutations",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "TagEquivalentReleaseAbsent",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            releaseWorkflowOrigin: "same-attempt-continuous-lease",
            disposition: "admitted-same-attempt-pre-escrow-staging-continuation",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAbsent",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            releaseWorkflowOrigin: "same-attempt-continuous-lease",
            disposition: "admitted-same-attempt-pre-escrow-staging-continuation",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "TagRollbackEligible",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftRollbackEligibleEmpty",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftRollbackEligiblePartialStaging",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowCompleteFinalAssetsIncomplete",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-escrow-bound-final-assets-continuation",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "TagRollbackEligible",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "DraftRollbackEligibleEmpty",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "DraftRollbackEligiblePartialStaging",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Unknown",
            githubCoordinatorState: "TagRollbackEligible",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Unknown",
            githubCoordinatorState: "DraftRollbackEligibleEmpty",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "Unknown",
            githubCoordinatorState: "DraftRollbackEligiblePartialStaging",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-pre-escrow-rollback-only",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "DraftEquivalentEscrowCompleteFinalAssetsIncomplete",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-escrow-bound-final-assets-continuation",
          },
          {
            expired: true,
            actionsArtifacts: "Unknown",
            githubCoordinatorState: "DraftEquivalentEscrowCompleteFinalAssetsIncomplete",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "await-authoritative-actions-state-with-zero-further-mutations",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-post-escrow-publication",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
            ],
            disposition: "admitted-post-mutation-resumption",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
            ],
            disposition: "admitted-github-finalization-only",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Absent",
              "Equivalent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
            ],
            disposition: "rejected-noncontiguous-prefix",
          },
          {
            expired: true,
            actionsArtifacts: "Available",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Unknown",
              "NotReached",
              "NotReached",
              "NotReached",
              "NotReached",
              "NotReached",
            ],
            disposition: "rejected-unknown",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: ["Absent", "Absent", "Absent", "Absent", "Absent", "Absent", "Absent"],
            disposition: "admitted-physical-artifact-recovery-from-draft-escrow",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
            ],
            disposition: "admitted-physical-artifact-recovery-from-draft-escrow",
          },
          {
            expired: true,
            actionsArtifacts: "ExpiredOrDeleted",
            githubCoordinatorState: "TagAbsent",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
            ],
            disposition: "rejected-missing-durable-escrow",
          },
          {
            expired: true,
            actionsArtifacts: "Unknown",
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
              "Absent",
            ],
            disposition: "rejected-unknown-actions-artifact-state",
          },
          ...(["ExpiredOrDeleted", "Unknown"] as const).map((actionsArtifacts) => ({
            expired: true,
            actionsArtifacts,
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
            ],
            disposition: "admitted-github-finalization-only",
          })),
          ...(["Available", "ExpiredOrDeleted", "Unknown"] as const).map((actionsArtifacts) => ({
            expired: true,
            actionsArtifacts,
            githubCoordinatorState: "DraftEquivalentPublicAssetsComplete",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
            ],
            disposition: "admitted-github-finalization-only",
          })),
          ...(["Available", "ExpiredOrDeleted", "Unknown"] as const).map((actionsArtifacts) => ({
            expired: true,
            actionsArtifacts,
            githubCoordinatorState: "Equivalent",
            coordinateReports: [
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
              "Equivalent",
            ],
            disposition: "observation-only-success",
          })),
        ],
        candidateBytes:
          "required-only-for-initial-staging-or-npm-mutation-before-escrow-use-the-original-three-actions-artifacts-after-actions-artifact-expiry-use-the-identical-wrapper-bytes-from-the-one-durable-escrow-container-never-rebuild-repack-recertify-or-substitute-terminal-finalization-and-observation-only-arms-never-require-or-recover-wrapper-bytes",
        actionsArtifactRestStates: {
          Available:
            "authoritative-200-id-name-digest-workflow_run-match-expired-literal-false-and-valid-expires_at-is-strictly-in-the-future",
          ExpiredOrDeleted:
            "authoritative-exact-id-fetch-is-404-or-authoritative-200-matching-record-has-expired-literal-true-or-valid-expires_at-at-or-before-observation-time-regardless-of-expired-flag",
          Unknown:
            "every-other-response-or-record-including-timeout-malformed-2xx-inconsistent-fields-non-404-4xx-5xx-or-rate-limit",
        },
        actionsArtifactSetAggregation: {
          members: ["descriptorArtifact", "payloadArtifact", "appleCertificationArtifact"],
          classification:
            "independently-classify-all-three-exact-ids-at-one-recorded-observation-time-then-apply-precedence-Unknown-over-ExpiredOrDeleted-over-Available",
          Available: "all-three-members-Available",
          ExpiredOrDeleted: "neither-member-Unknown-and-at-least-one-member-ExpiredOrDeleted",
          Unknown: "at-least-one-member-Unknown",
          mixedAvailableExpired: "ExpiredOrDeleted-because-the-authenticated-set-cannot-be-used",
          report: "persist-all-three-member-states-and-the-aggregate-state",
        },
        physicalArtifactRecovery: {
          requiredBeforeFirstNpmMutation:
            "githubFinalization-coordinator-state-DraftEquivalentEscrowAndFinalAssetsComplete",
          escrowContainer:
            "strictly-parse-the-one-equivalent-length-delimited-escrow-asset-and-recover-the-exact-original-descriptor-payload-and-apple-certification-artifact-zip-wrapper-bytes",
          manifest:
            "strictly-decode-the-canonical-final-manifest-asset-and-reconstruct-candidateDescriptor-and-appleCertificationIndex-canonical-bytes-plus-final-lf-to-their-declared-digests",
          descriptor:
            "the-recovered-descriptor-wrapper-has-the-frozen-layout-and-its-canonical-file-equals-the-manifest-embedded-candidateDescriptor",
          payload:
            "the-recovered-payload-wrapper-and-seven-final-tarball-assets-have-the-exact-candidateDescriptor-package-names-byte-counts-and-digests",
          appleCertification:
            "the-recovered-certification-wrapper-has-the-frozen-two-entry-layout-and-its-canonical-index-and-opaque-bundle-equal-the-manifest-embedded-index-and-ninth-final-bundle-asset",
          authority:
            "escrowRun-matches-an-authoritative-successful-protected-release-workflow-escrow-job-at-candidate-sourceSha-and-the-equivalent-lightweight-tag-and-draft-release",
          actionsArtifactStatus: "require-ExpiredOrDeleted-never-Unknown-before-using-escrow",
          disposition: "replace-only-the-actions-artifact-transport-with-identical-three-wrapper-escrowed-bytes",
          forbidden:
            "rebuild-repack-recertify-overwrite-or-different-candidate-descriptor-certification-index-or-bundle",
        },
        preEscrowRollback: {
          authority:
            "future-release-coordinator-protocol-only-and-still-requires-separate-explicit-release-execution-authority",
          preconditions:
            "candidate-after-first-github-mutation-before-an-equivalent-escrow-candidate-binding-actions-artifact-set-state-persisted-but-irrelevant-all-seven-registry-records-authoritatively-Absent-exact-nonpublic-githubCoordinatorState-TagRollbackEligible-DraftRollbackEligibleEmpty-or-DraftRollbackEligiblePartialStaging-no-conflict-or-unknown-github-subject-fresh-protected-environment-approval-and-release-concurrency-single-writer-held",
          subjectAuthentication: {
            releaseInputs:
              "exact-immutable-candidateWorkflowRunId-candidateWorkflowRunAttempt-descriptorArtifactId-descriptorArtifactDigest-payloadArtifactId-and-payloadArtifactDigest-from-the-protected-release-dispatch",
            candidateRun:
              "authoritative-successful-candidate-workflow-run-id-attempt-repository-workflowPath-event-push-ref-main-and-headSha-match-release-inputs-and-frozen-candidate-metadata",
            artifactDisposition:
              "persist-all-three-member-observations-and-the-actionsArtifactSetAggregation-state-but-do-not-use-artifact-bytes-state-or-Apple-certification-claims-for-rollback-authentication",
            sourceSha:
              "authoritative-candidate-run-headSha-equals-current-exact-lightweight-tag-target-and-release-workflow-github-sha-and-workflow-sha",
            githubSubjects:
              "classify-only-fixed-tag-target-nonpublic-draft-metadata-and-exact-fixed-escrow-plus-nine-final-asset-name-id-length-wrapper-digest-set-with-no-duplicate-or-unexpected-name-byte-equivalence-is-not-required-or-claimed",
            registry: "all-seven-authoritative-coordinate-observations-are-Absent",
            claimBoundary:
              "authenticates-only-the-exact-rollback-subject-and-zero-npm-precondition-never-the-candidate-descriptor-package-records-candidate-bytes-or-Apple-certification",
          },
          sequence: [
            "persist-the-exact-observed-tag-draft-and-asset-id-name-length-digest-state-in-the-workflow-report",
            "if-an-exact-draft-exists-delete-only-that-draft-release-by-authoritative-release-id-then-reobserve-TagRollbackEligible",
            "delete-only-the-exact-lightweight-refs-tags-v0.5.0-that-still-targets-candidate-sourceSha-then-reobserve-TagAbsent",
          ],
          forbidden:
            "npm-mutation-public-release-deletion-conflicting-or-unknown-subject-deletion-broad-asset-or-tag-selection-candidate-byte-reconstruction-or-candidate-descriptor-or-package-equivalence-claim",
          restart: "generate-and-authenticate-one-new-fresh-candidate-before-any-new-github-or-npm-mutation",
          actionsArtifactState:
            "Available-ExpiredOrDeleted-and-Unknown-all-admit-only-the-same-zero-npm-rollback-because-no-candidate-byte-or-equivalence-claim-is-made",
        },
      },
      versionPolicy: {
        exactVersion: "0.5.0",
        grammar: "exact-ascii-string-0.5.0",
        topLevelField: "version",
        packageFields: ["version", "packedVersion"],
        rule: "all-seven-package-version-and-packedVersion-fields-equal-the-one-top-level-version",
        dependencyPrerequisites:
          "every-package-record-exactly-matches-orderedPackagePrerequisites-and-every-named-package-is-earlier-at-the-exact-top-level-version",
        tagDerivation: "v0.5.0",
        mismatch: "reject-before-registry-or-github-observation",
      },
      releaseInputFields: [
        "candidateWorkflowRunId",
        "candidateWorkflowRunAttempt",
        "descriptorArtifactId",
        "descriptorArtifactDigest",
        "payloadArtifactId",
        "payloadArtifactDigest",
        "appleCertificationWorkflowRunId",
        "appleCertificationWorkflowRunAttempt",
        "appleCertificationArtifactId",
        "appleCertificationArtifactDigest",
      ],
      releaseInputFieldTypes: {
        candidateWorkflowRunId: "positive-decimal-string-without-leading-zero",
        candidateWorkflowRunAttempt: "positive-decimal-string-without-leading-zero",
        descriptorArtifactId: "positive-decimal-string-without-leading-zero",
        descriptorArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex",
        payloadArtifactId: "positive-decimal-string-without-leading-zero",
        payloadArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex",
        appleCertificationWorkflowRunId: "positive-decimal-string-without-leading-zero",
        appleCertificationWorkflowRunAttempt: "string-exact-1",
        appleCertificationArtifactId: "positive-decimal-string-without-leading-zero",
        appleCertificationArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex",
      },
      requiredDescriptorFields: [
        "schema",
        "version",
        "sourceRepository",
        "sourceRef",
        "sourceSha",
        "workflowRepository",
        "workflowPath",
        "workflowRef",
        "workflowRunId",
        "workflowRunAttempt",
        "workflowRunHeadSha",
        "checkedOutSourceSha",
        "payloadArtifactId",
        "payloadArtifactName",
        "payloadArtifactDigest",
        "createdAt",
        "expiresAt",
        "packages",
      ],
      authentication: [
        "select-exactly-one-freshnessPolicy-postMutationAdmission-arm-before-arm-specific-authentication",
        "for-initial-staging-or-Available-artifact-resumption-fetch-descriptor-by-exact-input-run-id-run-attempt-and-descriptor-artifact-id",
        "for-initial-staging-or-Available-artifact-resumption-require-api-workflow-run-id-attempt-event-ref-headSha-and-conclusion-to-equal-input-and-frozen-candidate-metadata-with-event-push-and-conclusion-success",
        "for-initial-staging-or-Available-artifact-resumption-require-api-descriptor-artifact-id-name-run-id-headSha-and-github-digest-to-equal-input-run-metadata-frozen-descriptorArtifactName-and-descriptorArtifactDigest",
        "for-initial-staging-or-Available-artifact-resumption-strictly-decode-the-canonical-detached-descriptor",
        "for-initial-staging-or-Available-artifact-resumption-require-descriptor-workflowRunId-workflowRunAttempt-workflowRunHeadSha-workflowRef-and-sourceRef-to-equal-the-authoritative-api-run-and-input-metadata",
        "for-initial-staging-or-Available-artifact-resumption-fetch-payload-by-the-exact-input-payloadArtifactId-from-the-same-run-and-attempt-and-require-it-to-equal-descriptor-payloadArtifactId",
        "for-initial-staging-or-Available-artifact-resumption-require-api-payload-artifact-id-name-run-id-headSha-and-github-digest-to-equal-release-inputs-descriptor-and-authoritative-run-metadata",
        "for-initial-staging-or-Available-artifact-resumption-authenticate-release-appleCertificationEvidence-against-the-exact-candidate-and-protected-certification-inputs",
        "for-escrow-bound-final-assets-continuation-authenticate-the-equivalent-escrow-container-and-require-its-embedded-descriptor-and-certification-index-to-equal-the-original-wrappers-when-actions-artifacts-are-Available-or-use-only-its-identical-three-wrapper-bytes-when-ExpiredOrDeleted",
        "for-ExpiredOrDeleted-escrow-backed-npm-resumption-strictly-authenticate-freshnessPolicy-physicalArtifactRecovery-without-fetching-the-deleted-actions-wrappers",
        "for-terminal-finalization-or-observation-only-strictly-authenticate-the-arm-specific-tag-release-phase-nine-final-assets-canonical-manifest-embedded-descriptor-certification-index-certification-artifact-subject-escrowRun-certification-bundle-and-seven-Equivalent-registry-records-with-approved-provenance-without-observing-or-recovering-actions-wrapper-bytes",
        "for-preEscrowRollback-authenticate-only-freshnessPolicy-preEscrowRollback-subjectAuthentication-and-make-no-candidate-descriptor-package-record-or-byte-equivalence-claim",
        "for-every-nonrollback-arm-require-source-and-workflow-fields-to-equal-the-frozen-candidate-and-Apple-certification-identities",
        "for-every-nonrollback-arm-require-candidate-and-certification-sourceSha-workflowRunHeadSha-and-checkedOutSourceSha-to-be-the-same-40-lowercase-hex-commit-on-sourceRef",
        "apply-freshnessPolicy-before-any-mutation-or-resumption",
        "for-every-nonrollback-arm-require-expiresAt-minus-createdAt-at-most-maximumAgeSeconds",
        "for-every-nonrollback-arm-require-exact-seven-package-records-and-payload-digests",
      ],
    });
    const sriGolden = (contract.release.candidateIdentity.descriptorCanonicalization as {
      readonly sha512SRIGolden: { readonly accepted: string; readonly rejected: readonly string[] };
    }).sha512SRIGolden;
    expect(isCanonicalSha512SRI(sriGolden.accepted)).toBe(true);
    for (const rejected of sriGolden.rejected) expect(isCanonicalSha512SRI(rejected), rejected).toBe(false);
    const freshnessCases = (contract.release.candidateIdentity.freshnessPolicy as {
      readonly transitionCases: readonly {
        readonly expired: boolean;
        readonly actionsArtifacts: string;
        readonly githubCoordinatorState: string;
        readonly coordinateReports: readonly string[];
        readonly disposition: string;
      }[];
    }).transitionCases;
    for (const transition of freshnessCases) expect(transition.coordinateReports).toHaveLength(7);
    expect(
      new Set(
        freshnessCases.map((transition) =>
          [
            transition.expired,
            transition.actionsArtifacts,
            transition.githubCoordinatorState,
            ...transition.coordinateReports,
          ].join("|")
        ),
      ).size,
    ).toBe(freshnessCases.length);
    const coordinatorStates = (contract.release.githubFinalization as {
      readonly coordinatorStates: readonly string[];
    }).coordinatorStates;
    for (const transition of freshnessCases) {
      expect(coordinatorStates, transition.githubCoordinatorState).toContain(transition.githubCoordinatorState);
    }
    expect(
      freshnessCases.find(({ expired, actionsArtifacts, githubCoordinatorState, coordinateReports }) =>
        expired
        && actionsArtifacts === "Available"
        && githubCoordinatorState === "DraftEquivalentEscrowAndFinalAssetsComplete"
        && coordinateReports.every((report) => report === "Absent")
      )?.disposition,
    ).toBe("admitted-post-escrow-publication");
    expect(
      freshnessCases.find(({ expired, actionsArtifacts, githubCoordinatorState, coordinateReports }) =>
        expired
        && actionsArtifacts === "ExpiredOrDeleted"
        && githubCoordinatorState === "DraftEquivalentEscrowAndFinalAssetsComplete"
        && coordinateReports.join(",") === "Equivalent,Equivalent,Absent,Absent,Absent,Absent,Absent"
      )?.disposition,
    ).toBe("admitted-physical-artifact-recovery-from-draft-escrow");
    const postMutationAdmission = (contract.release.candidateIdentity.freshnessPolicy as {
      readonly postMutationAdmission: {
        readonly closedUnion: readonly {
          readonly arm: string;
          readonly expired: readonly boolean[];
          readonly githubCoordinatorState?: string;
          readonly githubCoordinatorStates?: readonly string[];
          readonly equivalentPrefixLengths?: readonly number[];
          readonly actionsArtifacts: string | Readonly<Record<string, string>>;
          readonly disposition?: string;
        }[];
        readonly allOtherCombinations: string;
      };
    }).postMutationAdmission;
    expect(postMutationAdmission.allOtherCombinations).toBe("rejected-with-zero-further-mutations");
    for (const arm of postMutationAdmission.closedUnion) expect(arm.expired).toEqual([false, true]);
    const admissionArm = (name: string) => postMutationAdmission.closedUnion.find(({ arm }) => arm === name);
    const npmArm = admissionArm("escrow-backed-npm-resumption");
    expect(npmArm).toBeDefined();
    if (npmArm === undefined) throw new Error("missing escrow-backed-npm-resumption arm");
    expect(npmArm.githubCoordinatorState).toBe("DraftEquivalentEscrowAndFinalAssetsComplete");
    expect(npmArm.equivalentPrefixLengths).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(npmArm.actionsArtifacts).toEqual({
      Available: "admitted-using-the-authenticated-original-wrapper-bytes",
      ExpiredOrDeleted: "admitted-physical-artifact-recovery-from-draft-escrow",
      Unknown: "rejected-with-zero-further-mutations",
    });
    const terminalEscrowArm = admissionArm("escrow-present-github-finalization");
    for (const prefixLength of contract.release.requiredEquivalentPrefixLengths) {
      for (const actionsArtifacts of ["Available", "ExpiredOrDeleted"] as const) {
        if (prefixLength < 7) {
          expect(npmArm.equivalentPrefixLengths).toContain(prefixLength);
          expect((npmArm.actionsArtifacts as Readonly<Record<string, string>>)[actionsArtifacts]).toBe(
            actionsArtifacts === "Available"
              ? "admitted-using-the-authenticated-original-wrapper-bytes"
              : "admitted-physical-artifact-recovery-from-draft-escrow",
          );
        } else {
          expect(npmArm.equivalentPrefixLengths).not.toContain(prefixLength);
          expect(terminalEscrowArm).toMatchObject({
            githubCoordinatorState: "DraftEquivalentEscrowAndFinalAssetsComplete",
            actionsArtifacts: "irrelevant-not-in-the-terminal-proof-set",
            disposition: "admitted-github-finalization-only",
          });
        }
      }
    }
    const sameAttemptStates = ["TagEquivalentReleaseAbsent", "DraftEquivalentEscrowAbsent"];
    expect(admissionArm("same-attempt-pre-escrow-staging-continuation")).toMatchObject({
      expired: [false, true],
      githubCoordinatorStates: sameAttemptStates,
      actionsArtifacts: "Available",
      releaseWorkflowOrigin:
        "same-workflowRunId-and-runAttempt-that-authenticated-the-fresh-candidate-observed-the-immediate-predecessor-state-performed-the-preceding-github-mutation-and-continuously-held-the-release-concurrency-group",
      recoveryEntry: "forbidden-for-rerun-new-workflow-run-or-tag-dispatch",
    });
    for (const githubCoordinatorState of sameAttemptStates) {
      expect(
        freshnessCases.find((transition) =>
          transition.expired
          && transition.actionsArtifacts === "Available"
          && transition.githubCoordinatorState === githubCoordinatorState
          && transition.coordinateReports.every((report) => report === "Absent")
        )?.disposition,
      ).toBe("admitted-same-attempt-pre-escrow-staging-continuation");
    }
    const escrowBoundState = "DraftEquivalentEscrowCompleteFinalAssetsIncomplete";
    const rollbackStates = [
      "TagRollbackEligible",
      "DraftRollbackEligibleEmpty",
      "DraftRollbackEligiblePartialStaging",
    ];
    expect(admissionArm("escrow-bound-final-assets-continuation")).toMatchObject({
      expired: [false, true],
      githubCoordinatorStates: [escrowBoundState],
      actionsArtifacts: ["Available", "ExpiredOrDeleted"],
      wrapperSource: {
        Available: "admitted-using-the-authenticated-original-wrapper-bytes",
        ExpiredOrDeleted: "admitted-physical-artifact-recovery-from-the-equivalent-escrow",
      },
    });
    expect(admissionArm("pre-escrow-staging-rollback")).toMatchObject({
      expired: [false, true],
      githubCoordinatorStates: rollbackStates,
      actionsArtifacts: {
        Available: "admitted-rollback-only-with-no-candidate-byte-use-or-equivalence-claim",
        ExpiredOrDeleted: "admitted-rollback-only-with-no-candidate-byte-use-or-equivalence-claim",
        Unknown: "admitted-rollback-only-because-actions-artifact-state-is-outside-the-rollback-proof-set",
      },
      releaseWorkflowOrigin: "new-workflowRunId-with-runAttempt-exactly-one-and-releaseRef-exact-refs/tags/v0.5.0",
    });
    expect(admissionArm("escrow-bound-final-assets-wait")).toMatchObject({
      expired: [false, true],
      githubCoordinatorStates: [escrowBoundState],
      actionsArtifacts: "Unknown",
      disposition: "await-authoritative-actions-state-with-zero-further-mutations",
    });
    for (const rollbackState of rollbackStates) {
      for (const actionsArtifacts of ["Available", "ExpiredOrDeleted", "Unknown"] as const) {
        expect(
          freshnessCases.find((transition) =>
            transition.expired
            && transition.actionsArtifacts === actionsArtifacts
            && transition.githubCoordinatorState === rollbackState
            && transition.coordinateReports.every((report) => report === "Absent")
          )?.disposition,
        ).toBe("admitted-pre-escrow-rollback-only");
      }
    }
    for (
      const [actionsArtifacts, disposition] of [
        ["Available", "admitted-escrow-bound-final-assets-continuation"],
        ["ExpiredOrDeleted", "admitted-escrow-bound-final-assets-continuation"],
        ["Unknown", "await-authoritative-actions-state-with-zero-further-mutations"],
      ] as const
    ) {
      expect(
        freshnessCases.find((transition) =>
          transition.expired
          && transition.actionsArtifacts === actionsArtifacts
          && transition.githubCoordinatorState === escrowBoundState
          && transition.coordinateReports.every((report) => report === "Absent")
        )?.disposition,
      ).toBe(disposition);
    }
    for (
      const [githubCoordinatorState, disposition] of [
        ["DraftEquivalentPublicAssetsComplete", "admitted-github-finalization-only"],
        ["Equivalent", "observation-only-success"],
      ] as const
    ) {
      for (const actionsArtifacts of ["Available", "ExpiredOrDeleted", "Unknown"] as const) {
        expect(
          freshnessCases.find((transition) =>
            transition.expired
            && transition.actionsArtifacts === actionsArtifacts
            && transition.githubCoordinatorState === githubCoordinatorState
            && transition.coordinateReports.every((report) => report === "Equivalent")
          )?.disposition,
        ).toBe(disposition);
      }
    }
    for (const prefixLength of [0, 1, 2, 3, 4, 5, 6]) {
      const reports = Array.from({ length: 7 }, (_, index) => index < prefixLength ? "Equivalent" : "Absent");
      expect(
        postMutationAdmission.closedUnion.some((arm) =>
          arm.githubCoordinatorState === "TagAbsent"
          && arm.equivalentPrefixLengths?.includes(prefixLength)
        ),
        reports.join(","),
      ).toBe(false);
    }
    expect(contract.release.sourceShaConvergence).toEqual({
      initialPublicationRequiredEqual: [
        "candidate.sourceSha",
        "candidate.workflowRunHeadSha",
        "candidate.checkedOutSourceSha",
        "appleCertificationIndex.sourceSha",
        "appleCertificationIndex.certificationWorkflowRunHeadSha",
        "appleCertificationIndex.checkedOutSourceSha",
        "release.github.sha",
        "release.github.workflow_sha",
        "protected-main-head-after-environment-approval",
        "approvedPublisher.provenance.sourceSha",
      ],
      initialReleaseRef: "refs/heads/main",
      initialMismatch: "stop-with-zero-mutations",
      privilegedRunAttemptPolicy: {
        admittedRunAttempt: 1,
        runAttemptGreaterThanOne: "rejected-with-zero-mutations-before-subject-classification-or-rollback",
        workflowReruns: "forbidden-because-approval-history-cannot-correlate-a-review-record-to-an-attempt",
        goldenCases: [
          {
            runAttempt: 1,
            disposition: "eligible-for-arm-specific-classification",
          },
          {
            runAttempt: 2,
            disposition: "rejected-with-zero-mutations-before-subject-classification-or-rollback",
          },
        ],
      },
      resumption: {
        trigger: "new-manual-workflow-dispatch-at-refs/tags/v0.5.0-only-subject-to-triggerAdmission",
        triggerAdmission: {
          beforeEquivalentEscrow:
            "new-tag-dispatch-is-rollback-only-and-must-not-authenticate-or-continue-any-candidate",
          afterEquivalentEscrow:
            "new-tag-dispatch-may-resume-only-the-candidate-authenticated-from-the-equivalent-escrow-container",
          terminal:
            "new-tag-dispatch-may-finalize-or-observe-only-the-candidate-authenticated-from-the-canonical-final-manifest",
          candidateSubstitution: "forbidden-even-when-sourceSha-is-identical",
        },
        preEscrowRecoveryGoldenCases: [
          {
            releaseRef: "refs/heads/main",
            workflowRunRelation: "new",
            runAttempt: 1,
            disposition: "rejected-with-zero-mutations-before-rollback-classification",
          },
          {
            releaseRef: "refs/tags/v0.5.0",
            workflowRunRelation: "new",
            runAttempt: 1,
            disposition: "admitted-preEscrowRollback-only",
          },
        ],
        required: [
          "new-workflow-run-id-with-runAttempt-exactly-one-on-the-equivalent-v0.5.0-tag-admitted-only-by-triggerAdmission",
          "github-sha-and-workflow-sha-equal-candidate-sourceSha",
          "for-every-nonrollback-arm-the-same-candidate-descriptor-Apple-certification-index-artifact-subject-and-bundle-are-authenticated-from-the-equivalent-three-wrapper-escrow-for-final-asset-or-npm-resumption-or-reconstructed-and-authenticated-from-the-final-manifest-and-bundle-asset-for-terminal-only-paths-for-preEscrowRollback-use-only-freshnessPolicy-preEscrowRollback-subjectAuthentication-and-make-no-descriptor-package-byte-or-Apple-certification-claim",
          "for-npm-resumption-registry-coordinates-are-a-contiguous-Equivalent-prefix-length-zero-through-six-followed-only-by-Absent-for-terminal-only-paths-all-seven-are-Equivalent-with-approved-provenance-for-every-Equivalent",
          "candidate-expiry-may-be-past-only-under-candidateIdentity-freshnessPolicy-postMutationExpiryException",
          "fresh-protected-environment-approval-except-already-public-observation-only-success-requires-no-new-approval",
        ],
        recoveryReleaseRef: "refs/tags/v0.5.0",
        mainAdvanceAfterInitialMutation: "does-not-change-the-exact-candidate-convergence-subject",
      },
    });
    expect(contract.release.sourceShaConvergence.privilegedRunAttemptPolicy.runAttemptGreaterThanOne).toBe(
      "rejected-with-zero-mutations-before-subject-classification-or-rollback",
    );
    expect(
      contract.release.sourceShaConvergence.privilegedRunAttemptPolicy.goldenCases.find(({ runAttempt }) =>
        runAttempt === 2
      ),
    ).toEqual({
      runAttempt: 2,
      disposition: "rejected-with-zero-mutations-before-subject-classification-or-rollback",
    });
    expect(
      contract.release.sourceShaConvergence.resumption.preEscrowRecoveryGoldenCases.find(({ releaseRef }) =>
        releaseRef === "refs/heads/main"
      ),
    ).toEqual({
      releaseRef: "refs/heads/main",
      workflowRunRelation: "new",
      runAttempt: 1,
      disposition: "rejected-with-zero-mutations-before-rollback-classification",
    });
    const appleCertification = contract.release.appleCertificationEvidence as {
      readonly status: string;
      readonly workflowRepository: string;
      readonly workflowPath: string;
      readonly workflowRef: string;
      readonly workflowEvent: string;
      readonly releaseInputFields: readonly string[];
      readonly releaseInputFieldTypes: Readonly<Record<string, string>>;
      readonly artifactName: string;
      readonly indexFileName: string;
      readonly bundleFileName: string;
      readonly artifactLayout: string;
      readonly indexEncoding: string;
      readonly indexDigest: string;
      readonly indexFields: readonly string[];
      readonly indexCanonicalization: Readonly<Record<string, unknown>>;
      readonly certificationCells: readonly string[];
      readonly coordinateEncoding: string;
      readonly appleDistributionCoordinates: readonly string[];
      readonly appleCleanHostCoordinates: readonly string[];
      readonly verdict: string;
      readonly bundlePolicy: string;
      readonly a7Boundary: string;
      readonly authority: string;
      readonly forbiddenAuthority: readonly string[];
      readonly authentication: readonly string[];
      readonly initialAdmission: string;
      readonly escrowBinding: string;
      readonly finalAsset: string;
      readonly promotionStop: string;
    };
    expect(Object.keys(appleCertification)).toEqual([
      "status",
      "workflowRepository",
      "workflowPath",
      "workflowRef",
      "workflowEvent",
      "releaseInputFields",
      "releaseInputFieldTypes",
      "artifactName",
      "indexFileName",
      "bundleFileName",
      "artifactLayout",
      "indexEncoding",
      "indexDigest",
      "indexFields",
      "indexCanonicalization",
      "certificationCells",
      "coordinateEncoding",
      "appleDistributionCoordinates",
      "appleCleanHostCoordinates",
      "verdict",
      "bundlePolicy",
      "a7Boundary",
      "authority",
      "forbiddenAuthority",
      "authentication",
      "initialAdmission",
      "escrowBinding",
      "finalAsset",
      "promotionStop",
    ]);
    expect(appleCertification).toMatchObject({
      status: "required-before-unquarantine-currently-not-earned",
      workflowRepository: "mannyc2/effect-build",
      workflowPath: ".github/workflows/apple-certification.yml",
      workflowRef: "refs/heads/main",
      workflowEvent: "workflow_dispatch",
      releaseInputFields: [
        "appleCertificationWorkflowRunId",
        "appleCertificationWorkflowRunAttempt",
        "appleCertificationArtifactId",
        "appleCertificationArtifactDigest",
      ],
      releaseInputFieldTypes: {
        appleCertificationWorkflowRunId: "positive-decimal-string-without-leading-zero",
        appleCertificationWorkflowRunAttempt: "string-exact-1",
        appleCertificationArtifactId: "positive-decimal-string-without-leading-zero",
        appleCertificationArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex",
      },
      artifactName: "effect-build-v0.5.0-apple-certification",
      indexFileName: "apple-certification-index.json",
      bundleFileName: "effect-build-v0.5.0-apple-certification.bin",
      artifactLayout:
        "exactly-two-top-level-regular-files-no-directories-links-duplicates-unsafe-paths-or-unexpected-entries",
      indexEncoding: "rfc8785-json-canonicalization-scheme-utf8-followed-by-one-lf",
      indexDigest: "sha256-of-exact-canonical-index-file-bytes-including-final-lf",
      verdict: "certified",
      bundlePolicy: "opaque-to-release-coordinator-redacted-public-retained-byte-identity-only",
      a7Boundary: "release-never-decodes-notary-provider-json-status-receipt-or-reconciliation-fields",
      authority:
        "exact-successful-github-workflow-run-and-artifact-rest-observations-plus-canonical-index-and-bundle-bytes",
      forbiddenAuthority: [
        "environment-variable-certification-claim",
        "user-supplied-unverified-sha",
        "unverified-url",
        "ad-hoc-APPLE_RELEASE_CERTIFIED_SHA",
        "ad-hoc-APPLE_RELEASE_CERTIFICATION_RECEIPT_SHA256",
      ],
      initialAdmission:
        "missing-conflicting-unknown-expired-noncertified-incomplete-or-candidate-mismatched-certification-evidence-stops-with-zero-mutations",
      escrowBinding:
        "the-exact-actions-certification-artifact-zip-wrapper-is-the-third-length-delimited-escrow-body-and-its-index-and-opaque-public-bundle-bind-the-exact-candidate-before-final-asset-staging",
      finalAsset:
        "the-exact-opaque-public-redacted-bundle-file-is-the-ninth-final-release-asset-and-its-digest-index-and-actions-artifact-subject-are-embedded-in-the-canonical-release-manifest",
      promotionStop:
        "release-workflow-unquarantine-and-every-publication-arm-remain-blocked-until-A0-through-A9-all-fourteen-distribution-coordinates-and-all-eight-clean-host-coordinates-are-certified-for-the-exact-candidate",
    });
    expect(appleCertification.indexFields).toEqual([
      "schema",
      "version",
      "sourceSha",
      "candidateWorkflowRunId",
      "candidateWorkflowRunAttempt",
      "descriptorArtifactId",
      "descriptorArtifactDigest",
      "payloadArtifactId",
      "payloadArtifactDigest",
      "candidateDescriptorDigest",
      "certificationWorkflowRepository",
      "certificationWorkflowPath",
      "certificationWorkflowRef",
      "certificationWorkflowRunId",
      "certificationWorkflowRunAttempt",
      "certificationWorkflowRunHeadSha",
      "certificationWorkflowEvent",
      "checkedOutSourceSha",
      "bundleFileName",
      "bundleBytes",
      "bundleSha256",
      "verdict",
      "certificationCells",
      "appleDistributionCoordinates",
      "appleCleanHostCoordinates",
    ]);
    expect(appleCertification.indexCanonicalization).toEqual({
      objectMemberOrder: "rfc8785-utf16-code-unit-lexicographic-at-every-depth",
      unknownFields: "rejected-at-every-object-level",
      topLevelFieldSet: "exactly-indexFields",
      jsonNumbers: "forbidden",
      arrayOrder: "certificationCells-and-coordinate-arrays-exactly-the-frozen-orders",
      integerEncoding: "positive-base10-integer-strings-without-leading-zero",
      integerFields: [
        "candidateWorkflowRunId",
        "candidateWorkflowRunAttempt",
        "descriptorArtifactId",
        "payloadArtifactId",
        "certificationWorkflowRunId",
        "certificationWorkflowRunAttempt",
        "bundleBytes",
      ],
      topLevelFieldTypes: {
        schema: "string-equal-appleCertificationIndex-protocol",
        version: "string-equal-0.5.0",
        sourceSha: "string-lowercase-40-hex-equal-authenticated-candidate-sourceSha",
        candidateWorkflowRunId: "positive-decimal-string-without-leading-zero-equal-protected-release-input",
        candidateWorkflowRunAttempt: "positive-decimal-string-without-leading-zero-equal-protected-release-input",
        descriptorArtifactId: "positive-decimal-string-without-leading-zero-equal-protected-release-input",
        descriptorArtifactDigest: "github-rest-sha256-colon-lowercase-64-hex-equal-protected-release-input",
        payloadArtifactId:
          "positive-decimal-string-without-leading-zero-equal-protected-release-input-and-authenticated-candidate-descriptor",
        payloadArtifactDigest:
          "github-rest-sha256-colon-lowercase-64-hex-equal-protected-release-input-and-authenticated-candidate-descriptor",
        candidateDescriptorDigest:
          "string-lowercase-64-hex-of-exact-canonical-candidate-descriptor-file-bytes-including-final-lf",
        certificationWorkflowRepository: "string-equal-workflowRepository",
        certificationWorkflowPath: "string-equal-workflowPath",
        certificationWorkflowRef: "string-equal-workflowRef",
        certificationWorkflowRunId: "positive-decimal-string-without-leading-zero-equal-protected-release-input",
        certificationWorkflowRunAttempt: "string-exact-1-equal-protected-release-input",
        certificationWorkflowRunHeadSha: "string-lowercase-40-hex-equal-sourceSha",
        certificationWorkflowEvent: "string-equal-workflowEvent",
        checkedOutSourceSha: "string-lowercase-40-hex-equal-sourceSha",
        bundleFileName: "string-equal-frozen-bundleFileName",
        bundleBytes: "positive-decimal-string-without-leading-zero",
        bundleSha256: "string-lowercase-64-hex-of-exact-bundle-file-bytes",
        verdict: "string-exact-certified",
        certificationCells: "array-exactly-certificationCells",
        appleDistributionCoordinates: "array-exactly-appleDistributionCoordinates",
        appleCleanHostCoordinates: "array-exactly-appleCleanHostCoordinates",
      },
      digestFields: {
        candidateDescriptorDigest:
          "sha256-of-exact-canonical-candidate-descriptor-file-bytes-including-the-one-final-lf",
        bundleSha256: "sha256-of-exact-opaque-public-redacted-certification-bundle-bytes",
      },
    });
    expect(appleCertification.certificationCells).toEqual(
      Array.from({ length: 10 }, (_, index) => `A${index}`),
    );
    expect(new Set(appleCertification.certificationCells).size).toBe(10);
    const distributionRule = contract.requiredCompatibilityEvidencePoints.coordinateRules.appleDistribution;
    expect(distributionRule).toBeDefined();
    if (distributionRule === undefined) throw new Error("missing appleDistribution coordinate rule");
    const distributionAxes = distributionRule.axes;
    const expectedDistributionCoordinates = distributionAxes.scenario!.flatMap((scenario) =>
      distributionAxes.systemTarget!.map((systemTarget) => `${scenario}|${systemTarget}`)
    );
    expect(appleCertification.appleDistributionCoordinates).toEqual(expectedDistributionCoordinates);
    expect(appleCertification.appleDistributionCoordinates).toHaveLength(14);
    expect(new Set(appleCertification.appleDistributionCoordinates).size).toBe(14);
    const cleanHostRule = contract.requiredCompatibilityEvidencePoints.coordinateRules.appleCleanHost;
    expect(cleanHostRule).toBeDefined();
    if (cleanHostRule === undefined) throw new Error("missing appleCleanHost coordinate rule");
    const cleanHostAxes = cleanHostRule.axes;
    const expectedCleanHostCoordinates = cleanHostAxes.product!.flatMap((product) =>
      cleanHostAxes.systemTarget!.map((systemTarget) => `${product}|${systemTarget}`)
    );
    expect(appleCertification.appleCleanHostCoordinates).toEqual(expectedCleanHostCoordinates);
    expect(appleCertification.appleCleanHostCoordinates).toHaveLength(8);
    expect(new Set(appleCertification.appleCleanHostCoordinates).size).toBe(8);
    expect(appleCertification.coordinateEncoding).toBe(
      "axis-values-joined-by-literal-pipe-in-coordinateRules-axis-order",
    );
    expect(appleCertification.authentication).toEqual([
      "before-any-initial-github-or-npm-mutation-fetch-the-certification-artifact-by-exact-input-run-id-run-attempt-and-artifact-id",
      "require-authoritative-certification-workflow-run-repository-path-ref-event-headSha-attempt-one-and-conclusion-success-to-equal-frozen-authority-protected-release-inputs-and-authenticated-candidate-sourceSha",
      "require-authoritative-certification-artifact-id-name-run-id-headSha-digest-expired-false-and-expires_at-in-the-future-to-equal-protected-release-inputs-and-frozen-authority",
      "strictly-validate-the-two-entry-artifact-layout-canonical-index-exact-candidate-bindings-A0-through-A9-fourteen-distribution-coordinates-eight-clean-host-coordinates-and-whole-bundle-byte-count-and-sha256",
      "require-index-sourceSha-certificationWorkflowRunHeadSha-checkedOutSourceSha-and-candidateDescriptorDigest-to-equal-the-authenticated-candidate-and-verdict-certified",
      "after-an-equivalent-escrow-binding-use-only-the-identical-certification-artifact-wrapper-from-escrow-and-never-rebuild-recertify-or-substitute-it",
      "for-terminal-github-finalization-or-observation-authenticate-the-manifest-embedded-index-and-digest-certification-artifact-subject-and-exact-public-certification-bundle-asset-without-requiring-an-actions-artifact",
    ]);
    expect(contract.release.approvedPublisher).toEqual({
      repository: "mannyc2/effect-build",
      sourceRepository: "https://github.com/mannyc2/effect-build",
      sourceRef: "refs/heads/main",
      recoverySourceRef: "refs/tags/v0.5.0",
      workflowPath: ".github/workflows/release.yml",
      workflowRef: "refs/heads/main",
      recoveryWorkflowRef: "refs/tags/v0.5.0",
      environment: "npm",
      registry: "https://registry.npmjs.org",
      distTag: "latest",
      access: "public",
      provenance: {
        required: true,
        mechanism: "npm-trusted-publishing",
        oidcIssuer: "https://token.actions.githubusercontent.com",
        workflowIdentities: [
          "mannyc2/effect-build/.github/workflows/release.yml@refs/heads/main",
          "mannyc2/effect-build/.github/workflows/release.yml@refs/tags/v0.5.0",
        ],
        refPolicy: "main-for-initial-escrow-and-publication-or-the-equivalent-v0.5.0-tag-for-resumption-only",
        sourceSha: "must-equal-authenticated-candidate-sourceSha",
      },
      trustedPublisherPackageBindings: contract.release.orderedPackages,
    });
    expect(contract.release.protectedEnvironmentPolicy).toEqual({
      status: "release-blocking-external-configuration-not-yet-verified",
      repository: "mannyc2/effect-build",
      name: "npm",
      environmentIdentityStatus: "stage-9-must-freeze-the-read-back-npm-environment-id-before-unquarantine",
      configuredRequiredReviewerEntries: 1,
      configuredRequiredReviewerType: "User",
      reviewerIdentityStatus:
        "stage-9-must-freeze-one-exact-user-id-with-read-access-before-unquarantine-team-reviewers-are-forbidden",
      approvalsRequiredToProceed: 1,
      preventSelfReview: true,
      waitTimerMinutes: 0,
      customProtectionRules: [],
      adminBypassAllowed: false,
      approvalReviewHistory: {
        endpoint: "GET-/repos/{owner}/{repo}/actions/runs/{workflowRunId}/approvals",
        workflowAdmission:
          "exactly-one-job-references-the-npm-environment-and-all-release-mutation-occurs-in-that-one-protected-job",
        recordSelection:
          "response-array-has-exactly-one-record-with-state-approved-user-type-User-user-id-equal-the-frozen-reviewer-and-environments-exactly-one-entry-whose-id-and-name-equal-the-read-back-npm-environment",
        boundFields: ["state", "user.id", "environments[0].id", "environments[0].name"],
        unavailableFields: ["approval-timestamp", "deployment-id"],
        claimBoundary: "the-receipt-makes-no-approval-time-or-deployment-id-claim",
      },
      deploymentBranchPolicy: {
        mode: "selected-branches-and-tags",
        branches: ["main"],
        tags: ["v0.5.0"],
        allowedGithubRefs: ["refs/heads/main", "refs/tags/v0.5.0"],
      },
      readBackGates: [
        "before-release-workflow-unquarantine",
        "before-each-authorized-publication-attempt",
      ],
      mismatch: "release-blocking-stop-with-zero-mutations",
    });
    expect(contract.release.namespaceBootstrap).toEqual({
      status: "release-blocking-external-state-not-authorized-or-mutated-by-stage-0",
      requiredCoordinates: ["effect-build-apple", "effect-build-rolldown"],
      anonymousRegistryObservation: {
        observedAt: "2026-08-23T21:29:46Z",
        "effect-build-apple": "http-404-Absent",
        "effect-build-rolldown": "http-404-Absent",
      },
      precondition: "each-coordinate-must-exist-before-its-npm-trusted-publisher-binding-can-be-created-and-verified",
      reservationPublication:
        "requires-separate-explicit-bootstrap-publication-authority-and-audited-exact-reservation-bytes",
      stagedPublishing: "cannot-bootstrap-an-absent-package-coordinate",
      trustedPublisherReadBack:
        "after-bootstrap-require-exactly-one-approvedPublisher-binding-per-ordered-package-before-release-unquarantine",
      forbidden: "stage-0-does-not-reserve-publish-bind-replace-or-revoke-any-registry-coordinate",
    });
    expect(contract.release.githubFinalization).toEqual({
      initialStartsAfter:
        "authenticated-fresh-candidate-and-exact-Apple-certification-evidence-all-seven-npm-preflight-without-conflict-or-unknown-and-protected-environment-approval",
      resumptionStartsAfter:
        "exactly-one-candidateIdentity-freshnessPolicy-postMutationAdmission-arm-and-fresh-protected-environment-approval-except-already-public-observation-only-success-requires-no-new-approval-or-mutation",
      draftEscrowRequiredBefore: "the-first-npm-publication-attempt",
      publicReleaseStartsAfter: "all-seven-npm-coordinates-are-equivalent",
      tag: {
        name: "v0.5.0",
        ref: "refs/tags/v0.5.0",
        kind: "lightweight",
        target: "candidate.sourceSha",
      },
      release: {
        tagName: "v0.5.0",
        targetCommitish: "candidate.sourceSha",
        name: "effect-build v0.5.0",
        body: "exact-CHANGELOG-section-for-lockstep-version-with-one-trailing-lf",
        generateReleaseNotes: false,
        prerelease: false,
        makeLatest: true,
      },
      assets: {
        escrowName: "effect-build-v0.5.0-release-escrow.bin",
        escrowSchema: contract.protocols.releaseEscrow,
        escrowEncoding:
          "one-rfc8785-json-header-plus-one-lf-then-exact-descriptor-artifact-zip-bytes-then-exact-payload-artifact-zip-bytes-then-exact-apple-certification-artifact-zip-bytes-with-no-trailing-byte",
        escrowHeaderFieldSet: [
          "protocol",
          "descriptorArtifactBytes",
          "descriptorArtifactDigest",
          "payloadArtifactBytes",
          "payloadArtifactDigest",
          "certificationArtifactBytes",
          "certificationArtifactDigest",
        ],
        escrowHeaderFieldTypes: {
          protocol: "string-equal-releaseEscrow-protocol",
          descriptorArtifactBytes: "positive-decimal-string-without-leading-zero",
          descriptorArtifactDigest: "string-equal-release-input-descriptorArtifactDigest",
          payloadArtifactBytes: "positive-decimal-string-without-leading-zero",
          payloadArtifactDigest: "string-equal-candidateDescriptor-payloadArtifactDigest",
          certificationArtifactBytes: "positive-decimal-string-without-leading-zero",
          certificationArtifactDigest: "string-equal-release-input-appleCertificationArtifactDigest",
        },
        escrowValidation:
          "strict-header-canonicalization-exact-three-length-delimited-zip-wrappers-no-trailing-byte-wrapper-sha256-digests-and-the-frozen-descriptor-payload-and-certification-artifact-layouts",
        manifestName: "effect-build-v0.5.0-release-manifest.json",
        manifestSchema: contract.protocols.releaseManifest,
        manifestEncoding: "rfc8785-json-canonicalization-scheme-utf8-followed-by-one-lf",
        manifestFields: [
          "schema",
          "version",
          "tag",
          "candidateDescriptorDigest",
          "candidateDescriptor",
          "appleCertificationIndexDigest",
          "appleCertificationIndex",
          "appleCertificationArtifact",
          "escrowRun",
        ],
        manifestCanonicalization: {
          objectMemberOrder: "rfc8785-utf16-code-unit-lexicographic-at-every-depth",
          unknownFields: "rejected-at-every-object-level",
          topLevelFieldSet: "exactly-manifestFields",
          candidateDescriptor: "exactly-candidateIdentity-requiredDescriptorFields-types-ordering-and-semantics",
          appleCertificationIndex: "exactly-appleCertificationEvidence-indexFields-types-ordering-and-semantics",
          integerEncoding: "positive-base10-integer-strings-without-leading-zero",
          integerFields: [
            "candidateDescriptor.workflowRunId",
            "candidateDescriptor.workflowRunAttempt",
            "candidateDescriptor.payloadArtifactId",
            "candidateDescriptor.packages[].bytes",
            "appleCertificationIndex.candidateWorkflowRunId",
            "appleCertificationIndex.candidateWorkflowRunAttempt",
            "appleCertificationIndex.descriptorArtifactId",
            "appleCertificationIndex.payloadArtifactId",
            "appleCertificationIndex.certificationWorkflowRunId",
            "appleCertificationIndex.certificationWorkflowRunAttempt",
            "appleCertificationIndex.bundleBytes",
            "appleCertificationArtifact.workflowRunId",
            "appleCertificationArtifact.workflowRunAttempt",
            "appleCertificationArtifact.artifactId",
            "escrowRun.workflowRunId",
            "escrowRun.workflowRunAttempt",
            "escrowRun.escrowJobId",
            "escrowRun.approvalEnvironmentId",
            "escrowRun.approvedByReviewerId",
          ],
          jsonNumbers: "forbidden",
          arrayOrder: "semantic-and-field-specific",
          topLevelFieldTypes: {
            schema: "string-equal-releaseManifest-protocol",
            version: "string-equal-0.5.0",
            tag: "string-equal-v0.5.0",
            candidateDescriptorDigest:
              "string-lowercase-64-hex-of-exact-canonical-descriptor-file-bytes-including-final-lf",
            candidateDescriptor: "object-whose-rfc8785-canonical-bytes-plus-one-lf-hash-to-candidateDescriptorDigest",
            appleCertificationIndexDigest:
              "string-lowercase-64-hex-of-exact-canonical-appleCertificationIndex-bytes-including-final-lf",
            appleCertificationIndex:
              "object-whose-rfc8785-canonical-bytes-plus-one-lf-hash-to-appleCertificationIndexDigest",
            appleCertificationArtifact: "object-exactly-appleCertificationArtifactFieldSet",
            escrowRun: "object-exactly-escrowRunFieldSet",
          },
          appleCertificationArtifactFieldSet: [
            "workflowRunId",
            "workflowRunAttempt",
            "artifactId",
            "artifactName",
            "artifactDigest",
          ],
          appleCertificationArtifactFieldTypes: {
            workflowRunId:
              "positive-decimal-string-without-leading-zero-equal-release-input-appleCertificationWorkflowRunId",
            workflowRunAttempt: "string-exact-1-equal-release-input-appleCertificationWorkflowRunAttempt",
            artifactId: "positive-decimal-string-without-leading-zero-equal-release-input-appleCertificationArtifactId",
            artifactName: "string-equal-appleCertificationEvidence-artifactName",
            artifactDigest:
              "github-rest-sha256-colon-lowercase-64-hex-equal-release-input-appleCertificationArtifactDigest",
          },
          escrowRunFieldSet: [
            "repository",
            "workflowPath",
            "workflowRef",
            "workflowRunId",
            "workflowRunAttempt",
            "workflowRunHeadSha",
            "workflowEvent",
            "escrowJobId",
            "escrowJobName",
            "environment",
            "approvalEnvironmentId",
            "approvalEnvironmentName",
            "approvalState",
            "approvedByReviewerId",
            "escrowAssetId",
            "escrowAssetName",
            "escrowAssetBytes",
            "escrowAssetDigest",
          ],
          escrowRunFieldTypes: {
            repository: "string-equal-approvedPublisher-repository",
            workflowPath: "string-equal-approvedPublisher-workflowPath",
            workflowRef:
              "string-equal-approvedPublisher-workflowRef-or-recoveryWorkflowRef-with-the-recovery-ref-admitted-only-under-sourceShaConvergence-resumption",
            workflowRunId: "positive-decimal-string-without-leading-zero",
            workflowRunAttempt: "positive-decimal-string-without-leading-zero",
            workflowRunHeadSha: "string-equal-candidateDescriptor-sourceSha",
            workflowEvent: "string-exact-workflow_dispatch",
            escrowJobId: "positive-decimal-string-without-leading-zero",
            escrowJobName: "string-exact-stage-release-escrow",
            environment: "string-equal-protectedEnvironmentPolicy-name",
            approvalEnvironmentId:
              "positive-decimal-string-without-leading-zero-and-equal-the-npm-environment-id-in-the-selected-review-history-record-and-environment-read-back",
            approvalEnvironmentName:
              "string-equal-protectedEnvironmentPolicy-name-and-the-selected-review-history-record-environment-name",
            approvalState: "string-exact-approved",
            approvedByReviewerId: "positive-decimal-string-without-leading-zero-and-equal-stage-9-frozen-reviewer",
            escrowAssetId: "positive-decimal-string-without-leading-zero",
            escrowAssetName: "string-equal-assets-escrowName",
            escrowAssetBytes: "positive-decimal-string-without-leading-zero",
            escrowAssetDigest: "string-github-rest-sha256-colon-lowercase-64-hex",
          },
          digestFields: {
            candidateDescriptorDigest: "sha256-of-exact-canonical-descriptor-file-bytes-including-the-one-final-lf",
            appleCertificationIndexDigest:
              "sha256-of-exact-canonical-appleCertificationIndex-file-bytes-including-the-one-final-lf",
            "appleCertificationIndex.bundleSha256": "sha256-of-exact-opaque-certification-bundle-asset-bytes",
            "candidateDescriptor.packages[].sha256": "lowercase-64-hex",
            "candidateDescriptor.packages[].sha1": "lowercase-40-hex",
            "candidateDescriptor.packages[].sha512SRI":
              "literal-sha512-prefix-plus-rfc4648-standard-base64-of-64-digest-bytes-with-required-double-padding-and-decode-reencode-equality",
          },
        },
        packageAssetNames: "the-seven-candidateDescriptor-package-record-filenames-in-orderedPackages-order",
        certificationBundleName: "effect-build-v0.5.0-apple-certification.bin",
        stagedAssetCount: 10,
        publicAssetCount: 9,
        stagedEquivalence:
          "exact-escrow-plus-nine-final-name-set-with-exact-id-name-byte-length-github-sha256-digest-and-downloaded-bytes",
        publicEquivalence:
          "exact-nine-final-name-set-seven-tarballs-manifest-and-certification-bundle-with-exact-id-name-byte-length-github-sha256-digest-and-downloaded-bytes",
        unexpectedOrDuplicateAsset: "conflict-except-the-one-frozen-escrow-asset-is-required-only-before-publication",
        contentTypes: {
          escrow: "application/octet-stream",
          manifest: "application/json",
          package: "application/gzip",
          certificationBundle: "application/octet-stream",
        },
      },
      escrowAuthentication: {
        actionsArtifactAvailability:
          "initial-staging-requires-descriptor-payload-and-Apple-certification-artifacts-expired-false-and-expires_at-in-the-future",
        tagAndDraft: "exact-candidate-sourceSha-tag-draft-metadata-and-phase-correct-escrow-plus-nine-final-asset-set",
        manifest:
          "strict-canonical-releaseManifest-with-embedded-candidateDescriptor-appleCertificationIndex-appleCertificationArtifact-and-escrowRun",
        releaseRun:
          "authoritative-workflow-run-id-attempt-headSha-event-ref-repository-and-workflowPath-match-escrowRun",
        escrowJob: "authoritative-job-id-name-run-id-and-conclusion-success-match-escrowRun",
        approval:
          "authoritative-run-approval-history-selected-record-state-environment-id-environment-name-and-approving-user-id-match-escrowRun-and-protectedEnvironmentPolicy-with-no-approval-time-or-deployment-id-claim",
        physicalRecovery:
          "when-actions-artifacts-are-ExpiredOrDeleted-extract-only-the-exact-three-wrapper-bytes-from-the-equivalent-escrow-container-then-revalidate-the-embedded-descriptor-certification-index-certification-artifact-subject-seven-final-tarball-assets-and-certification-bundle",
        terminalWithoutEscrow:
          "when-all-seven-registry-records-are-Equivalent-and-the-coordinator-is-DraftEquivalentPublicAssetsComplete-or-Equivalent-authenticate-only-the-exact-phase-correct-tag-release-nine-final-assets-canonical-manifest-embedded-descriptor-certification-index-certification-artifact-subject-escrowRun-certification-bundle-and-registry-provenance-actions-artifact-state-is-irrelevant-and-wrapper-recovery-npm-or-asset-mutation-is-forbidden",
        mutationRule:
          "the-one-escrow-container-and-nine-final-assets-are-created-and-verified-before-the-first-npm-publication-attempt-never-overwritten-and-only-the-escrow-container-is-deleted-after-seven-npm-equivalents",
      },
      subjectObservationStates: ["Absent", "Equivalent", "Conflict", "Unknown"],
      subjectStateDefinitions: {
        Absent: "the-individual-tag-release-or-asset-name-does-not-exist",
        Equivalent: "the-individual-subject-matches-its-exact-candidate-derived-identity-and-bytes",
        Conflict: "the-individual-subject-or-an-unexpected-or-duplicate-asset-differs-from-policy",
        Unknown: "timeout-malformed-response-5xx-rate-limit-or-ambiguous-mutation",
      },
      coordinatorStates: [
        "TagAbsent",
        "TagEquivalentReleaseAbsent",
        "DraftEquivalentEscrowAbsent",
        "DraftEquivalentEscrowCompleteFinalAssetsIncomplete",
        "DraftEquivalentEscrowAndFinalAssetsComplete",
        "DraftEquivalentPublicAssetsComplete",
        "TagRollbackEligible",
        "DraftRollbackEligibleEmpty",
        "DraftRollbackEligiblePartialStaging",
        "Equivalent",
        "Conflict",
        "Unknown",
      ],
      coordinatorStateDefinitions: {
        TagAbsent: "tag-release-and-assets-are-all-absent",
        TagEquivalentReleaseAbsent: "tag-is-equivalent-and-release-and-assets-are-absent",
        DraftEquivalentEscrowAbsent: "tag-and-draft-metadata-are-equivalent-and-no-assets-exist",
        DraftEquivalentEscrowCompleteFinalAssetsIncomplete:
          "tag-draft-and-the-one-escrow-asset-are-equivalent-every-present-final-asset-is-equivalent-no-extra-or-duplicate-asset-exists-and-one-or-more-final-assets-are-absent",
        DraftEquivalentEscrowAndFinalAssetsComplete:
          "tag-draft-the-one-escrow-asset-and-the-exact-nine-final-assets-are-equivalent",
        DraftEquivalentPublicAssetsComplete:
          "tag-draft-and-the-exact-nine-final-assets-are-equivalent-and-the-escrow-asset-is-absent",
        TagRollbackEligible:
          "actions-artifact-set-state-is-persisted-but-irrelevant-tag-target-and-candidate-run-sourceSha-are-exact-release-and-assets-are-absent-and-no-candidate-descriptor-byte-equivalence-or-Apple-certification-is-claimed",
        DraftRollbackEligibleEmpty:
          "actions-artifact-set-state-is-persisted-but-irrelevant-tag-and-nonpublic-draft-fixed-metadata-and-candidate-run-sourceSha-are-exact-no-assets-exist-and-no-candidate-descriptor-byte-equivalence-or-Apple-certification-is-claimed",
        DraftRollbackEligiblePartialStaging:
          "actions-artifact-set-state-is-persisted-but-irrelevant-tag-and-nonpublic-draft-fixed-metadata-and-candidate-run-sourceSha-are-exact-present-assets-use-only-the-fixed-escrow-plus-nine-final-name-set-with-no-duplicate-or-unexpected-name-and-no-candidate-descriptor-byte-equivalence-or-Apple-certification-is-claimed",
        Equivalent: "tag-public-release-metadata-and-the-exact-nine-name-asset-set-are-equivalent",
        Conflict:
          "any-subject-is-conflict-a-release-exists-without-an-equivalent-tag-a-public-release-exists-before-seven-npm-equivalents-a-public-release-is-incomplete-the-escrow-asset-is-absent-after-npm-mutation-but-before-seven-npm-equivalents-or-any-phase-unexpected-or-duplicate-asset-exists",
        Unknown: "any-required-subject-observation-is-unknown",
      },
      observationBounds: "same-numeric-bounds-as-registryObservationBounds",
      protocol: [
        "require-the-workflow-level-release-concurrency-group-to-be-held-before-first-observation-through-terminal-reobservation",
        "observe-tag-release-the-one-escrow-name-and-all-nine-final-asset-names-before-classification-or-github-mutation",
        "stop-on-github-subject-or-registry-conflict-or-unknown-actions-artifact-Unknown-is-irrelevant-only-for-preEscrowRollback-escrow-present-github-finalization-escrow-deleted-draft-github-finalization-and-already-public-observation-only-success-waits-with-zero-further-mutations-during-escrow-bound-final-asset-staging-and-is-rejected-in-every-other-nonterminal-arm",
        "within-the-same-workflow-run-id-and-attempt-continuously-held-release-lease-advance-tag-then-draft-then-escrow-only-under-same-attempt-pre-escrow-staging-continuation-reject-any-runAttempt-greater-than-one-with-zero-mutations-before-classification-or-rollback-on-a-new-workflow-run-id-with-runAttempt-one-and-releaseRef-exact-refs/tags/v0.5.0-before-an-equivalent-escrow-candidate-binding-run-only-preEscrowRollback-with-zero-npm-mutations-reject-a-new-main-run-with-zero-mutations",
        "after-an-equivalent-escrow-binds-the-candidate-complete-final-asset-staging-from-authenticated-original-wrappers-when-Available-or-identical-escrowed-wrappers-when-ExpiredOrDeleted-and-wait-with-zero-further-mutations-when-Unknown",
        "from-TagAbsent-create-lightweight-tag-at-candidate-sourceSha-then-reobserve",
        "from-TagEquivalentReleaseAbsent-create-one-exact-draft-release-then-reobserve",
        "from-DraftEquivalentEscrowAbsent-frame-and-upload-the-one-exact-escrow-asset-then-reobserve-never-overwrite",
        "from-DraftEquivalentEscrowCompleteFinalAssetsIncomplete-upload-only-the-first-absent-final-asset-then-reobserve-never-overwrite",
        "advance-only-when-every-predecessor-is-equivalent",
        "require-DraftEquivalentEscrowAndFinalAssetsComplete-before-the-first-npm-publication-attempt",
        "use-the-escrow-container-as-durable-candidate-bytes-if-actions-artifacts-expire-or-are-deleted",
        "after-all-seven-npm-coordinates-are-equivalent-delete-only-the-exact-escrow-asset-then-reobserve-never-delete-a-final-asset",
        "from-DraftEquivalentPublicAssetsComplete-with-seven-Equivalent-registry-records-authenticate-the-terminal-proof-set-without-actions-wrapper-recovery-or-npm-or-asset-mutation-then-publish-the-draft-once-and-reobserve",
        "from-Equivalent-with-seven-Equivalent-registry-records-succeed-observation-only-independent-of-actions-artifact-state",
        "succeed-only-when-the-public-release-and-all-seven-registry-records-are-equivalent",
      ],
    });
    const finalAssets = (contract.release.githubFinalization as {
      readonly assets: {
        readonly escrowHeaderFieldSet: readonly string[];
        readonly manifestFields: readonly string[];
        readonly certificationBundleName: string;
        readonly stagedAssetCount: number;
        readonly publicAssetCount: number;
      };
    }).assets;
    expect(appleCertification.releaseInputFields).toEqual(
      contract.release.candidateIdentity.releaseInputFields.slice(-4),
    );
    expect(finalAssets.certificationBundleName).toBe(appleCertification.bundleFileName);
    expect(finalAssets.publicAssetCount).toBe(contract.release.orderedPackages.length + 2);
    expect(finalAssets.stagedAssetCount).toBe(finalAssets.publicAssetCount + 1);
    expect(finalAssets.escrowHeaderFieldSet).toEqual([
      "protocol",
      "descriptorArtifactBytes",
      "descriptorArtifactDigest",
      "payloadArtifactBytes",
      "payloadArtifactDigest",
      "certificationArtifactBytes",
      "certificationArtifactDigest",
    ]);
    expect(finalAssets.manifestFields).toEqual([
      "schema",
      "version",
      "tag",
      "candidateDescriptorDigest",
      "candidateDescriptor",
      "appleCertificationIndexDigest",
      "appleCertificationIndex",
      "appleCertificationArtifact",
      "escrowRun",
    ]);
    expect(contract.release.protocol).toEqual([
      "hold-the-workflow-level-release-concurrency-group-before-first-observation-through-final-reobservation-or-rollback",
      "validate-runAttempt-and-triggerAdmission-then-select-exactly-one-initial-or-postMutationAdmission-arm-before-authentication",
      "authenticate-only-the-selected-arm-subject-initial-staging-uses-the-fresh-seven-tarball-actions-candidate-plus-exact-Apple-certification-artifact-escrow-backed-nonrollback-arms-use-the-equivalent-three-wrapper-escrow-terminal-nonrollback-arms-use-the-final-manifest-certification-bundle-and-registry-proof-preEscrowRollback-uses-only-its-rollback-subject-and-never-candidate-descriptor-package-byte-equivalence-or-Apple-certification",
      "apply-the-selected-arm-specific-preflight-before-mutation",
      "stop-with-zero-mutations-on-initial-conflict-or-unknown",
      "reconcile-one-exact-tag-draft-one-escrow-container-and-nine-final-assets-before-first-npm-mutation",
      "publish-only-first-absent-coordinate-whose-predecessors-are-equivalent",
      "reobserve-after-every-response-including-response-loss",
      "advance-only-on-equivalent",
      "resume-an-all-Absent-set-or-equivalent-prefix-and-publish-only-the-absent-suffix",
      "publish-the-prestaged-github-draft-only-after-seven-coordinate-convergence",
    ]);
    expect(contract.release.authenticationPrecedence).toEqual({
      order: [
        "validate-runAttempt-and-triggerAdmission",
        "select-exactly-one-initial-or-postMutationAdmission-arm",
        "authenticate-only-the-selected-arm-subject",
      ],
      goldenCases: [
        {
          arm: "pre-escrow-staging-rollback",
          releaseRef: "refs/tags/v0.5.0",
          runAttempt: 1,
          candidateAuthentication: "forbidden",
          subjectAuthentication: "candidateIdentity.freshnessPolicy.preEscrowRollback.subjectAuthentication",
          disposition: "eligible-only-for-preEscrowRollback",
        },
        {
          arm: "initial-staging",
          releaseRef: "refs/heads/main",
          runAttempt: 1,
          candidateAuthentication: "fresh-actions-candidate-and-Apple-certification-required",
          subjectAuthentication: "candidateIdentity-plus-appleCertificationEvidence",
          disposition: "eligible-only-for-initial-preflight",
        },
      ],
    });
    expect(
      contract.release.authenticationPrecedence.goldenCases.find(({ arm }) => arm === "pre-escrow-staging-rollback"),
    ).toMatchObject({
      candidateAuthentication: "forbidden",
      subjectAuthentication: "candidateIdentity.freshnessPolicy.preEscrowRollback.subjectAuthentication",
      disposition: "eligible-only-for-preEscrowRollback",
    });
    expect(contract.release.privilegedJobMayCheckoutInstallBuildOrPack).toBe(false);
    expect(contract.release.privilegedJobMayFrameVerifiedEscrowContainer).toBe(true);
    expect(contract.exclusions).toEqual([
      "provider-registry",
      "generic-build-algebra",
      "generic-deployment-manager-not-the-closed-effect-build-apple-operation-family",
      "generic-release-transaction-framework",
      "automatic-tool-installation",
      "runtime-provider-fallback",
      "arbitrary-browser-application",
      "atomic-replacement-of-ordinary-non-empty-dist-directory",
      "universal-cancellation",
      "automatic-generation-garbage-collection",
      "continuous-compatibility-inferred-from-semver",
    ]);
    const parsedWorkflow = parseYaml(workflow) as {
      readonly name: string;
      readonly on: { readonly workflow_dispatch: { readonly inputs: Record<string, unknown> } };
      readonly concurrency: { readonly group: string; readonly "cancel-in-progress": boolean };
      readonly permissions: Record<string, string>;
      readonly jobs: Record<string, {
        readonly if?: boolean;
        readonly environment?: string;
        readonly permissions?: Record<string, string>;
        readonly steps: readonly unknown[];
      }>;
    };
    expect(parsedWorkflow.name).toBe("Release (quarantined)");
    expect(Object.keys(parsedWorkflow.on.workflow_dispatch.inputs)).toEqual(
      contract.release.candidateIdentity.releaseInputFields,
    );
    expect(parsedWorkflow.concurrency).toEqual({
      group: "effect-build-release-v0.5.0",
      "cancel-in-progress": false,
    });
    expect(parsedWorkflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(parsedWorkflow.jobs)).toEqual(["quarantine", "stage-release-escrow"]);
    const protectedJob = parsedWorkflow.jobs["stage-release-escrow"];
    expect(protectedJob).toMatchObject({
      if: false,
      environment: "npm",
      permissions: { actions: "read", contents: "write", "id-token": "write" },
    });
    const privilegedSource = JSON.stringify(protectedJob);
    expect(privilegedSource).not.toMatch(/actions\/checkout|setup-node|\binstall\b|\bbuild\b|\bpack\b/u);
    expect(
      Object.values(parsedWorkflow.jobs).filter(({ environment }) => environment === "npm"),
    ).toHaveLength(1);
  });

  it("materializes the exact candidate and Apple evidence workflows without matrix pruning", async () => {
    const contract = await readJson<V05Contract>("tooling/v05-contract.json");
    const candidateSource = await readFile(resolve(root, ".github/workflows/candidate.yml"), "utf8");
    const appleSource = await readFile(resolve(root, ".github/workflows/apple-certification.yml"), "utf8");
    const candidate = parseYaml(candidateSource) as {
      readonly on: { readonly push: { readonly branches: readonly string[] } };
      readonly jobs: Record<string, unknown>;
    };
    const apple = parseYaml(appleSource) as {
      readonly on: { readonly workflow_dispatch: { readonly inputs: Record<string, unknown> } };
      readonly jobs: {
        readonly distribution: {
          readonly strategy: {
            readonly matrix: {
              readonly scenario: readonly string[];
              readonly target: readonly { readonly token: string; readonly runner: string }[];
            };
          };
        };
        readonly "clean-host": {
          readonly strategy: {
            readonly matrix: {
              readonly product: readonly string[];
              readonly target: readonly { readonly token: string; readonly runner: string }[];
            };
          };
        };
        readonly "certification-cells": {
          readonly strategy: { readonly matrix: { readonly cell: readonly string[] } };
        };
      };
    };
    expect(candidate.on.push.branches).toEqual(["main"]);
    expect(Object.keys(candidate.jobs)).toEqual(["build-pack-test"]);
    expect(candidateSource).toContain("Pack the fixed seven exactly once");
    expect(candidateSource).toContain("--tarball-directory release-candidate-payload");
    expect(Object.keys(apple.on.workflow_dispatch.inputs)).toEqual(
      contract.release.candidateIdentity.releaseInputFields.slice(0, 6),
    );
    const evidence = contract.release.appleCertificationEvidence as {
      readonly certificationCells: readonly string[];
      readonly appleDistributionCoordinates: readonly string[];
      readonly appleCleanHostCoordinates: readonly string[];
    };
    const distributionMatrix = apple.jobs.distribution.strategy.matrix;
    const cleanHostMatrix = apple.jobs["clean-host"].strategy.matrix;
    expect(
      distributionMatrix.scenario.flatMap((scenario) =>
        distributionMatrix.target.map(({ token }) => `${scenario}|${token}`)
      ),
    ).toEqual(evidence.appleDistributionCoordinates);
    expect(
      cleanHostMatrix.product.flatMap((product) => cleanHostMatrix.target.map(({ token }) => `${product}|${token}`)),
    ).toEqual(evidence.appleCleanHostCoordinates);
    expect(apple.jobs["certification-cells"].strategy.matrix.cell).toEqual(evidence.certificationCells);
    expect(appleSource).toContain("effect-build-v0.5.0-apple-certification");
    expect(appleSource).not.toMatch(/APPLE_RELEASE_CERTIFIED_SHA|APPLE_RELEASE_CERTIFICATION_RECEIPT_SHA256/u);
  });

  it("keeps the authoritative docs on the same contract without stale guarantees", async () => {
    const files = [
      "AGENTS.md",
      "README.md",
      "docs/README.md",
      "docs/architecture.md",
      "docs/api.md",
      "docs/errors.md",
      "docs/drivers.md",
      "docs/release-security.md",
      "docs/v0.5-contract.md",
      "packages/effect-build/README.md",
      "packages/effect-build-bun/README.md",
      "packages/effect-build-deno/README.md",
      "packages/effect-build-esbuild/README.md",
      "packages/effect-build-node-sea/README.md",
      "packages/effect-build-rolldown/README.md",
    ];
    const text = (await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")))).join("\n");

    for (const file of ["AGENTS.md", "docs/architecture.md", "docs/api.md", "docs/release-security.md"]) {
      expect(await readFile(resolve(root, file), "utf8"), file).toContain("effect-build/v0.5-contract@1");
    }
    for (const file of ["AGENTS.md", "README.md", "docs/architecture.md", "docs/api.md", "docs/drivers.md"]) {
      expect(await readFile(resolve(root, file), "utf8"), file).toContain("effect-build-apple");
    }
    expect(await readFile(resolve(root, "docs/release-security.md"), "utf8")).toContain(
      "Fixed-seven convergence",
    );
    expect(await readFile(resolve(root, "packages/effect-build-node-sea/README.md"), "utf8")).toContain(
      "ad-hoc, no-timestamp",
    );
    expect(text).not.toContain("A failed or interrupted build never leaves a partial artifact at the destination");
    expect(text).not.toContain("Publication is automated");
    expect(text).not.toContain("publishes all five packages");
    expect(text).not.toContain("It is public so third-party provider authors");
    expect(text).not.toContain("releases publish from main with npm provenance when the matrix is green");
  });
});
