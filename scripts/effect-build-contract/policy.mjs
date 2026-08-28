export const contractPath = "tooling/effect-build-contract.json";
export const operationRegisterPath = "research/post-0.3/reconciliation/r1/SHIP-DEFER-REJECT.csv";
export const nonOperationRegisterPath = "research/post-0.3/reconciliation/r1/NON-OPERATION-REGISTER.csv";
export const adjudicationPath = "research/post-0.3/freeze/SURFACE-ADJUDICATION.json";
export const publicApiPath = "tooling/public-api.json";

export const npmTrustedPublisher = {
  repository: "mannyc2/effect-build",
  workflow: "release.yml",
  environment: "npm",
  permission: "publish",
};

export const npmRegistryUrl = "https://registry.npmjs.org";
export const npmTrustedPublishClient = { node: "24.14.1", npm: "11.11.0" };

export const npmReleaseTarget = {
  version: "0.6.0",
  presenceAtHandoff: "absent-for-all-admitted-packages",
  expectedLatestBeforePublication: [
    { name: "effect-build", version: "0.3.0" },
    { name: "effect-build-apple", version: "0.0.0-reserved.0" },
    { name: "effect-build-archives", version: "0.0.0-reserved.0" },
    { name: "effect-build-bun", version: "0.3.0" },
    { name: "effect-build-deno", version: "0.3.0" },
    { name: "effect-build-esbuild", version: "0.3.0" },
    { name: "effect-build-nfpm", version: "0.0.0-reserved.0" },
    { name: "effect-build-node-sea", version: "0.3.0" },
    { name: "effect-build-python", version: "0.0.0-reserved.0" },
    { name: "effect-build-sbom", version: "0.0.0-reserved.0" },
    { name: "effect-build-windows", version: "0.0.0-reserved.0" },
  ],
};

export const npmPlaceholderLedger = [
  {
    name: "effect-build-apple",
    version: "0.0.0-reserved.0",
    bytes: 334,
    sha256: "07c5d7377a5ca1e741af7eda9e5c2743b6587d60014abb1f8c99bdf4bc9f3b3b",
    integrity: "sha512-T2F2RYz0N9Me48SDs8BEvbVeifxhElcVEvmwMd9zRyPJr9JxcTpRFM5CRasCGyExXYBsqobcn5d2CU22v110FQ==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-archives",
    version: "0.0.0-reserved.0",
    bytes: 334,
    sha256: "492062edd992a7a2942c095f0d6cd54c19f26dca1d1ac96a77f389f8dcf8872f",
    integrity: "sha512-9v/xjMJVBw3hzK0onHwR7m7tnL5YnUnOeIoxzuanAZ1v3v/7CUcMiqJKRFqt+5D4DUBn5XWUb1lnV6lYiAMnBQ==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-nfpm",
    version: "0.0.0-reserved.0",
    bytes: 332,
    sha256: "10ffdcf4a5dd69305bd6f9055b3022ef7290416879786236b4cd7d74c6f887da",
    integrity: "sha512-/TKk/e7Ng68RBNusrUpIreYFUvebu8/wERoZLUAmyVB7CTVxs2JfZFmxeIjedDSQqKplOoVW9QPyqnhIUcIXhQ==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-python",
    version: "0.0.0-reserved.0",
    bytes: 334,
    sha256: "a14369ae0eeb3fc17a020267c8887596a3879590ed4f51da8f41ed4c14bfd394",
    integrity: "sha512-3B6GEFCN9ixneGkIMGky4uE71TvT1iTyJVTkFNbtbZWRd+/TBAIKuyu8AgdbL0qS7sSGL70jM6ehiDEr4Z6UiQ==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-rolldown",
    version: "0.0.0-reserved.0",
    bytes: 334,
    sha256: "eda4638f7eaab55dede0ee5d34954efb88786a645396d91a2a9b04175fb103ff",
    integrity: "sha512-mkI+ekPBY2Y6CyEqXRjnHB2F7RWxn6nTcXuL4C+KoIXL5BFvUu73JY9/JWqGIHLlLdvy4wPm0vnlNIg77KxdAg==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-sbom",
    version: "0.0.0-reserved.0",
    bytes: 333,
    sha256: "5b463d54484692d39c70ddd5feb804ce3e8af03b4b7793da3e7fca8bb1fa773d",
    integrity: "sha512-BjY7ar/5gx2QGasd4mjm1UPKTMws4AY6b4OmqZRJg4dyd4WUap/R68sGMfHXgbyOGiyTiClEuvwPWfa6KrdhuA==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
  {
    name: "effect-build-windows",
    version: "0.0.0-reserved.0",
    bytes: 335,
    sha256: "2743a73f902e3ddc4fcf35ed7b902a79766f5b1ccbbfa80bb5588eeede2c2289",
    integrity: "sha512-s5zCwCD1hhO2+O8LniXoJjELfSnolJhxdDbQYZrwS9T82E6tclUy3yWikXW1XduYYvKxz+WThwvfHhMVQ7TX1A==",
    bootstrapTags: { reserved: "0.0.0-reserved.0", latest: "0.0.0-reserved.0" },
  },
];

export const npmRegistryBootstrap = {
  purpose: "namespace-and-trusted-publisher-bootstrap-only",
  architectureEvidence: false,
  placeholderVersion: "0.0.0-reserved.0",
  placeholderTag: "reserved",
  establishedPackages: [
    "effect-build",
    "effect-build-bun",
    "effect-build-deno",
    "effect-build-esbuild",
    "effect-build-node-sea",
  ],
  placeholderAtHandoffPackages: npmPlaceholderLedger.map(({ name }) => name),
  placeholderLedger: npmPlaceholderLedger,
};

export const expectedDispositionCounts = {
  mandatory: 5,
  "positive-proof-gated": 22,
  "conditional-private": 27,
  rejected: 11,
  superseded: 2,
};

export const exactToolEvidenceRegister = [
  {
    id: "EVIDENCE-BUN",
    kind: "provider",
    name: "bun",
    version: "1.3.14",
    executableBindings: ["EFFECT_BUILD_BUN", "EFFECT_BUILD_BUN_BIN"],
    evidenceCells: [
      "host-native",
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-x64-musl",
      "linux-aarch64-gnu",
      "windows-x64",
    ],
  },
  {
    id: "EVIDENCE-DENO",
    kind: "provider",
    name: "deno",
    version: "2.9.5",
    executableBindings: ["EFFECT_BUILD_DENO", "EFFECT_BUILD_DENO_BIN"],
    evidenceCells: [
      "host-native",
      "macos-x64",
      "macos-aarch64",
      "linux-x64-gnu",
      "linux-aarch64-gnu",
      "windows-x64",
      "windows-aarch64",
    ],
  },
  {
    id: "EVIDENCE-NODE-SEA",
    kind: "provider",
    name: "node",
    version: "26.7.0",
    executableBindings: ["EFFECT_BUILD_NODE"],
    evidenceCells: ["linux-x64-gnu"],
  },
  {
    id: "EVIDENCE-UV",
    kind: "producer",
    name: "uv",
    version: "0.12.0",
    executableBindings: ["EFFECT_BUILD_UV_BIN"],
    evidenceCells: ["uv-build", "poetry-core"],
  },
  {
    id: "EVIDENCE-NFPM",
    kind: "producer",
    name: "nfpm",
    version: "2.47.0",
    executableBindings: ["EFFECT_BUILD_NFPM_BIN"],
    evidenceCells: ["deb", "rpm", "apk", "archlinux", "msix"],
  },
  {
    id: "EVIDENCE-SYFT",
    kind: "producer",
    name: "syft",
    version: "1.50.0",
    executableBindings: ["EFFECT_BUILD_SYFT_BIN"],
    evidenceCells: ["spdx-json", "cyclonedx-json"],
  },
];

export const mandatoryOperationIds = new Set([
  "CAN-BUN-012",
  "CAN-DENO-010",
  "CAN-ESB-001",
  "CAN-ESB-011",
  "CAN-NODE-001",
]);

export const supersededOperationIds = new Set(["CAN-NODE-002", "CAN-NODE-003"]);

export const denoPrivateOperationIds = [
  "CAN-DENO-001",
  "CAN-DENO-002",
  "CAN-DENO-003",
  "CAN-DENO-004",
  "CAN-DENO-005",
  "CAN-DENO-006",
  "CAN-DENO-011",
];

export const rolldownRejectedOperationIds = ["CAN-ROL-021"];

export const operationTargets = Object.fromEntries([
  ["CAN-BUN-001", "Transpiler", "make"],
  ["CAN-BUN-002", "Transpiler", "transform"],
  ["CAN-BUN-003", "Transpiler", "transformSync"],
  ["CAN-BUN-004", "Transpiler", "scan"],
  ["CAN-BUN-005", "Transpiler", "scanImports"],
  ["CAN-BUN-006", "Build", "build"],
  ["CAN-BUN-007", "Build", "buildToDirectory"],
  ["CAN-BUN-008", "Build", "build"],
  ["CAN-BUN-009", "Build", "buildToDirectory"],
  ["CAN-BUN-010", "Watch", "watch"],
  ["CAN-BUN-011", "CompileExecutable", "compileExecutableDirect"],
  ["CAN-BUN-012", "CompileExecutable", "compileExecutable"],
  ["CAN-DENO-001", "Bundle", "memory"],
  ["CAN-DENO-002", "Bundle", "direct"],
  ["CAN-DENO-003", "Bundle", "stdout"],
  ["CAN-DENO-004", "Bundle", "direct"],
  ["CAN-DENO-005", "Bundle", "watch"],
  ["CAN-DENO-006", "Bundle", "declarations"],
  ["CAN-DENO-007", "Transpile", "transpile"],
  ["CAN-DENO-008", "Transpile", "transpileToDirectory"],
  ["CAN-DENO-009", "Transpile", "emitDeclarations"],
  ["CAN-DENO-010", "CompileExecutable", "compileExecutable"],
  ["CAN-DENO-011", "CompileWatch", "watch"],
  ["CAN-ESB-001", "Build", "build"],
  ["CAN-ESB-002", "BuildToDirectory", "buildToDirectory"],
  ["CAN-ESB-003", "Transform", "transform"],
  ["CAN-ESB-004", "AnalyzeMetafile", "analyzeMetafile"],
  ["CAN-ESB-005", "FormatMessages", "formatMessages"],
  ["CAN-ESB-011", "Context", "make"],
  ["CAN-ESB-012", "ContextToDirectory", "make"],
  ["CAN-ESB-015", "Build", "build"],
  ["CAN-ESB-016", "BuildToDirectory", "buildToDirectory"],
  ["CAN-ESB-017", "Watch", "watch"],
  ["CAN-ESB-018", "Serve", "serve"],
  ["CAN-NODE-001", "AssembleExecutable", "assembleDirect"],
  ["CAN-ROL-001", "Build", "make"],
  ["CAN-ROL-002", "Build", "generateScoped"],
  ["CAN-ROL-003", "Build", "writeScoped"],
  ["CAN-ROL-005", "Build", "generate"],
  ["CAN-ROL-006", "Build", "write"],
  ["CAN-ROL-007", "Watch", "direct"],
  ["CAN-ROL-008", "Watch", "skipWrite"],
  ["CAN-ROL-010", "Bundle", "bundle"],
  ["CAN-ROL-011", "BundleToDirectory", "bundleToDirectory"],
  ["CAN-ROL-012", "Watch", "watch"],
  ["CAN-ROL-013", "Transform", "transform"],
  ["CAN-ROL-014", "Parse", "parse"],
  ["CAN-ROL-015", "Minify", "minify"],
  ["CAN-ROL-016", "Resolve", "make"],
  ["CAN-ROL-017", "Scan", "scan"],
  ["CAN-ROL-018A", "DevEngine", "makeMemory"],
  ["CAN-ROL-018B", "DevEngine", "makeToDirectory"],
  ["CAN-ROL-020", "Declaration", "emit"],
  ["CAN-ROL-022", "Config", "load"],
].map(([id, module, exportName]) => [id, { module, exportName }]));

export const coreCapabilityRegister = [
  {
    id: "CORE-ARTIFACT-IDENTITY",
    module: "Artifact",
    visibility: "public",
    owns: ["logical-name", "digest", "immutable-file", "immutable-tree", "immutable-executable"],
  },
  {
    id: "CORE-BORROWED-OUTPUT",
    module: "Author/BorrowedOutput",
    visibility: "public",
    owns: ["scoped-file-observation", "scoped-tree-observation", "interruption-safe-cleanup"],
  },
  {
    id: "CORE-FINALIZE-FILE",
    module: "Author/File",
    visibility: "public",
    owns: [
      "same-parent-stage",
      "revalidation",
      "atomic-no-replace-file-commit",
      "undelivered-commit-rollback",
      "verified-byte-consumption",
    ],
  },
  {
    id: "CORE-FINALIZE-TREE",
    module: "Author/Tree",
    visibility: "public",
    owns: [
      "same-parent-stage",
      "revalidation",
      "process-local-destination-claim",
      "precommit-destination-rejection",
      "atomic-tree-rename",
      "undelivered-commit-rollback",
      "committed-file-projection",
      "verified-tree-consumption",
    ],
  },
  {
    id: "CORE-FINALIZE-EXECUTABLE",
    module: "Author/Executable",
    visibility: "public",
    owns: [
      "same-parent-stage",
      "native-inspection",
      "revalidation",
      "atomic-no-replace-executable-commit",
      "undelivered-commit-rollback",
    ],
  },
  {
    id: "CORE-SELECTED-TOOL",
    module: "Author/Tool",
    visibility: "public",
    owns: ["deterministic-selection", "content-identity", "authentication", "launch-reauthentication"],
  },
  {
    id: "CORE-MATRIX",
    module: "Matrix",
    visibility: "public",
    owns: ["explicit-coordinate-identity", "bounded-matrix-execution"],
  },
  {
    id: "CORE-SYSTEM-TARGET",
    module: "SystemTarget",
    visibility: "public",
    owns: ["artifact-target-identity"],
  },
];

/** Test/evidence-bearing implementations for conditional non-operation rows. */
export const privateSupportRegister = [
  {
    id: "PRIVATE-NODE-SEA-MODES",
    atomIds: ["S05.1", "S06.1", "S07.1"],
    package: "effect-build-node-sea",
    module: "internal/AssembleModes",
    path: "packages/effect-build-node-sea/src/internal/AssembleModes.ts",
    exports: ["assembleDirect"],
    visibility: "private",
  },
];

const finalized = (kind) => ({
  mode: "canonical-finalizing",
  artifactKind: kind,
  returnsDurableArtifact: true,
});

const nativeResult = {
  mode: "provider-native-result",
  artifactKind: null,
  returnsDurableArtifact: false,
};

export const producerCapabilityRegister = [
  {
    id: "PROD-ARCHIVES-001",
    family: "archives",
    package: "effect-build-archives",
    module: "Archive",
    exports: ["archive"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-ARCHIVES-002",
    family: "archives",
    package: "effect-build-archives",
    module: "SourceArchive",
    exports: ["sourceArchive"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-PYTHON-001",
    family: "python",
    package: "effect-build-python",
    module: "Build",
    exports: ["build"],
    visibility: "public",
    finalization: finalized("file-set"),
  },
  {
    id: "PROD-NFPM-001",
    family: "nfpm",
    package: "effect-build-nfpm",
    module: "Package",
    exports: ["buildPackage", "buildDeb", "buildRpm", "buildApk", "buildArchLinux", "buildMsix"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-APPLE-001",
    family: "apple",
    package: "effect-build-apple",
    module: "AppBundle",
    exports: ["buildAppBundles"],
    visibility: "public",
    finalization: finalized("tree-set"),
  },
  {
    id: "PROD-APPLE-002",
    family: "apple",
    package: "effect-build-apple",
    module: "CodeSign",
    exports: ["signApp"],
    visibility: "public",
    finalization: finalized("tree"),
  },
  {
    id: "PROD-APPLE-003",
    family: "apple",
    package: "effect-build-apple",
    module: "CodeSign",
    exports: ["signDiskImage"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-APPLE-004",
    family: "apple",
    package: "effect-build-apple",
    module: "CodeSign",
    exports: ["signInstallerPackage"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-APPLE-005",
    family: "apple",
    package: "effect-build-apple",
    module: "DiskImage",
    exports: ["createDiskImages"],
    visibility: "public",
    finalization: finalized("file-set"),
  },
  {
    id: "PROD-APPLE-006",
    family: "apple",
    package: "effect-build-apple",
    module: "InstallerPackage",
    exports: ["buildInstallerPackages"],
    visibility: "public",
    finalization: finalized("file-set"),
  },
  {
    id: "PROD-APPLE-007",
    family: "apple",
    package: "effect-build-apple",
    module: "Notary",
    exports: ["submit"],
    visibility: "public",
    finalization: nativeResult,
  },
  {
    id: "PROD-APPLE-008",
    family: "apple",
    package: "effect-build-apple",
    module: "Notary",
    exports: ["submitApp"],
    visibility: "public",
    finalization: nativeResult,
  },
  {
    id: "PROD-APPLE-009",
    family: "apple",
    package: "effect-build-apple",
    module: "Notary",
    exports: ["info"],
    visibility: "public",
    finalization: nativeResult,
  },
  {
    id: "PROD-APPLE-010",
    family: "apple",
    package: "effect-build-apple",
    module: "Notary",
    exports: ["log"],
    visibility: "public",
    finalization: nativeResult,
  },
  {
    id: "PROD-APPLE-011",
    family: "apple",
    package: "effect-build-apple",
    module: "Staple",
    exports: ["stapleApp"],
    visibility: "public",
    finalization: finalized("tree"),
  },
  {
    id: "PROD-APPLE-012",
    family: "apple",
    package: "effect-build-apple",
    module: "Staple",
    exports: ["stapleFile"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-APPLE-013",
    family: "apple",
    package: "effect-build-apple",
    module: "Assess",
    exports: ["assess"],
    visibility: "public",
    finalization: nativeResult,
  },
  {
    id: "PROD-WINDOWS-001",
    family: "windows",
    package: "effect-build-windows",
    module: "SignMsix",
    exports: ["signMsix"],
    visibility: "public",
    finalization: finalized("file"),
  },
  {
    id: "PROD-SBOM-001",
    family: "sbom",
    package: "effect-build-sbom",
    module: "Generate",
    exports: ["generate", "generateSpdxJson", "generateCycloneDxJson"],
    visibility: "public",
    finalization: finalized("file"),
  },
];

const appleCapabilityIds = producerCapabilityRegister
  .filter((entry) => entry.family === "apple")
  .map((entry) => entry.id);

export const fixedPublicSurface = {
  "effect-build": {
    rootNamespaces: ["Artifact", "BorrowedOutput", "Executable", "File", "Matrix", "SystemTarget", "Tool", "Tree"],
    subpaths: {
      "./Artifact": ["CORE-ARTIFACT-IDENTITY"],
      "./Author/BorrowedOutput": ["CORE-BORROWED-OUTPUT"],
      "./Author/Executable": ["CORE-FINALIZE-EXECUTABLE"],
      "./Author/File": ["CORE-FINALIZE-FILE"],
      "./Author/Tool": ["CORE-SELECTED-TOOL"],
      "./Author/Tree": ["CORE-FINALIZE-TREE"],
      "./Matrix": ["CORE-MATRIX"],
      "./SystemTarget": ["CORE-SYSTEM-TARGET"],
    },
  },
  "effect-build-apple": {
    rootNamespaces: ["AppBundle", "Assess", "CodeSign", "DiskImage", "InstallerPackage", "Model", "Notary", "Staple"],
    subpaths: {
      "./AppBundle": ["PROD-APPLE-001"],
      "./Assess": ["PROD-APPLE-013"],
      "./CodeSign": ["PROD-APPLE-002", "PROD-APPLE-003", "PROD-APPLE-004"],
      "./DiskImage": ["PROD-APPLE-005"],
      "./InstallerPackage": ["PROD-APPLE-006"],
      "./Model": appleCapabilityIds,
      "./Notary": ["PROD-APPLE-007", "PROD-APPLE-008", "PROD-APPLE-009", "PROD-APPLE-010"],
      "./Staple": ["PROD-APPLE-011", "PROD-APPLE-012"],
    },
  },
  "effect-build-archives": {
    rootNamespaces: ["Archive", "ArchiveError", "Model", "SourceArchive"],
    subpaths: {
      "./Archive": ["PROD-ARCHIVES-001"],
      "./ArchiveError": ["PROD-ARCHIVES-001", "PROD-ARCHIVES-002"],
      "./Model": ["PROD-ARCHIVES-001", "PROD-ARCHIVES-002"],
      "./SourceArchive": ["PROD-ARCHIVES-002"],
    },
  },
  "effect-build-nfpm": {
    rootNamespaces: ["NfpmConfigurationRejected", "Package"],
    subpaths: { "./Package": ["PROD-NFPM-001"] },
  },
  "effect-build-python": {
    rootNamespaces: ["Build", "PythonBuildError"],
    subpaths: {
      "./Build": ["PROD-PYTHON-001"],
      "./PythonBuildError": ["PROD-PYTHON-001"],
    },
  },
  "effect-build-sbom": {
    rootNamespaces: ["Generate"],
    subpaths: { "./Generate": ["PROD-SBOM-001"] },
  },
  "effect-build-windows": {
    rootNamespaces: ["SignMsix"],
    subpaths: { "./SignMsix": ["PROD-WINDOWS-001"] },
  },
};

export const providerSurfaceSupport = {
  Api: { runtime: [], declarations: [] },
  Command: { runtime: ["layer"], declarations: ["LayerError", "LayerOptions", "layer"] },
};
