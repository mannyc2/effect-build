import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { assertCertificationHost } from "./certification-host.mjs";
import { assertLockstepPackageManifest } from "./lockstep-package.mjs";
import {
  packedProviderRuntimeEvidence,
  researchCompleteContract,
  researchEvidenceAccountingForPackage,
} from "./research-evidence-accounting.mjs";

const execute = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packedReceiptSchema = "effect-build/packed-consumer-evidence-receipt@1";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const researchContract = researchCompleteContract;
const releasePackages = researchContract.releaseControl.orderedPackages;
const conditionalPackages = researchContract.releaseControl.conditionalPackageCandidates;
const allowedPackages = [...releasePackages, ...conditionalPackages];
const allowedEffects = ["4.0.0-beta.104", "4.0.0-rc.108"];

const args = Object.create(null);
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || value === undefined) throw new Error("expected --name value arguments");
  args[name.slice(2)] = value;
}
const packageName = args.package;
const admission = args.admission;
const effectVersion = args.effect;
const certificationHost = args.host;
const receipt = args.receipt;
if (
  !allowedPackages.includes(packageName)
  || !allowedEffects.includes(effectVersion)
  || certificationHost === undefined
  || (admission !== "release-train" && admission !== "conditional-provider-candidate")
) {
  throw new Error("package, admission, effect, and host must identify one frozen packed-consumer coordinate");
}
if (
  (admission === "release-train" && !releasePackages.includes(packageName))
  || (admission === "conditional-provider-candidate" && !conditionalPackages.includes(packageName))
) {
  throw new Error(`packed package ${packageName} is incompatible with admission ${admission}`);
}
const host = assertCertificationHost(certificationHost);

const packedManifest = async (tarball) => {
  const archive = gunzipSync(await readFile(tarball));
  const record = 512;
  for (let offset = 0; offset < archive.byteLength; offset += record) {
    const name = archive.subarray(offset, offset + 100).toString("utf8").split("\0", 1)[0];
    const size = Number.parseInt(archive.subarray(offset + 124, offset + 136).toString("utf8").trim() || "0", 8);
    if (name === "package/package.json") {
      return JSON.parse(archive.subarray(offset + record, offset + record + size).toString("utf8"));
    }
    offset += Math.ceil(size / record) * record;
  }
  throw new Error(`package/package.json not found in ${tarball}`);
};

const targetSubpaths = (name) => {
  if (name === "effect-build") return researchContract.targetPublicSurface.coreModules;
  if (name === "effect-build-apple") return researchContract.targetPublicSurface.appleModules;
  if (admission === "conditional-provider-candidate") return [];
  const provider = researchContract.targetPublicSurface.providerLanes.find(({ package: candidate }) => candidate === name);
  if (provider === undefined) throw new Error(`research-complete admitted target surface omits ${name}`);
  return provider.lanes.filter(({ requirement }) => requirement === "required").map(({ packageExport }) => packageExport);
};

const fixtureAccounting = Object.freeze({
  "effect-build": {
    tests: [
      "test/unit/core.test.ts",
      "test/unit/core-matrix.test.ts",
      "test/unit/core-author.test.ts",
      "test/unit/core-profile.test.ts",
      "test/unit/provider-command.test.ts",
    ],
  },
  "effect-build-apple": {
    tests: [
      "test/unit/apple-artifact-codesign.test.ts",
      "test/unit/apple-containers.test.ts",
      "test/unit/apple-notary-staple-assess.test.ts",
    ],
  },
  "effect-build-bun": {
    tests: [
      "test/unit/bun-bundle.test.ts",
      "test/unit/bun-compile-executable.test.ts",
    ],
    bunTests: [
      "test/integration/bun-bundle.test.ts",
      "test/integration/bun-compile-executable.test.ts",
    ],
  },
  "effect-build-deno": {
    tests: [
      "test/unit/deno-bundle.test.ts",
      "test/unit/deno-compile-executable.test.ts",
      "test/integration/deno-bundle.test.ts",
      "test/integration/deno-compile-executable.test.ts",
    ],
  },
  "effect-build-esbuild": {
    tests: ["test/unit/esbuild-build.test.ts", "test/unit/esbuild-context.test.ts"],
    filteredTest: { file: "test/integration/provider-command.test.ts", pattern: "esbuild" },
  },
  "effect-build-node-sea": {
    tests: ["test/unit/node-sea-assemble-executable.test.ts", "test/integration/node-sea-assemble-executable.test.ts"],
  },
  "effect-build-rolldown": {
    tests: ["test/unit/rolldown.test.ts", "test/unit/rolldown-api.test.ts"],
    filteredTest: { file: "test/integration/provider-command.test.ts", pattern: "Rolldown" },
  },
});

const assertFixtureCoverage = (packageName, fixture, accounting) => {
  const executedFiles = new Set([
    ...fixture.tests,
    ...(fixture.bunTests ?? []),
    ...(fixture.filteredTest === undefined ? [] : [fixture.filteredTest.file]),
  ]);
  const entries = [
    ...accounting.operationIds.map((id) =>
      researchContract.operationRegister.operations.find(({ operationId }) => operationId === id)
    ),
    ...accounting.atomIds.map((id) =>
      researchContract.nonOperationRegister.entries.find(({ atomId }) => atomId === id)
    ),
  ];
  for (const entry of entries) {
    if (entry === undefined) throw new Error(`${packageName} packed evidence identifier is absent from the contract`);
    const references = entry.test?.refs ?? [];
    if (!references.some((reference) => executedFiles.has(reference))) {
      const identifier = entry.operationId ?? entry.atomId;
      throw new Error(`${packageName} packed fixtures do not execute a contract test reference for ${identifier}`);
    }
  }
};

const work = await mkdtemp(join(tmpdir(), "effect-build-packed-coordinate-"));
try {
  const tarballRoot = join(work, "tarballs");
  await mkdir(tarballRoot);
  const names = packageName === "effect-build" ? [packageName] : ["effect-build", packageName];
  const tarballs = {};
  const tarballSha256 = {};
  for (const name of names) {
    const packed = await execute("bun", ["pm", "pack", "--destination", tarballRoot], {
      cwd: join(root, "packages", name),
    });
    const filename = packed.stdout.split("\n").find((line) => line.trim().endsWith(".tgz"));
    if (filename === undefined) throw new Error(`bun pm pack returned no tarball for ${name}`);
    const tarball = join(tarballRoot, filename.trim().split(/[\\/]/u).at(-1));
    const manifest = await packedManifest(tarball);
    assertLockstepPackageManifest({
      manifest,
      name,
      version: "0.5.0",
      firstPartyPackages: allowedPackages,
      prerequisites: name === "effect-build" ? [] : ["effect-build"],
    });
    tarballs[name] = tarball;
    tarballSha256[name] = sha256(await readFile(tarball));
  }
  const workspace = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await writeFile(join(work, "package.json"), `${JSON.stringify({
    name: "effect-build-packed-coordinate",
    private: true,
    type: "module",
    dependencies: {
      effect: effectVersion,
      "effect-build": tarballs["effect-build"],
      ...(packageName === "effect-build" ? {} : { [packageName]: tarballs[packageName] }),
    },
    devDependencies: {
      "@effect/platform-node": effectVersion,
      typescript: workspace.devDependencies.typescript,
    },
    overrides: {
      "@effect/platform-node-shared": effectVersion,
    },
  }, null, 2)}\n`);
  await writeFile(join(work, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      target: "es2022",
      lib: ["esnext"],
      strict: true,
      noEmit: false,
      outDir: "dist",
      skipLibCheck: true,
    },
    include: ["main.ts"],
  }, null, 2)}\n`);
  const subpaths = targetSubpaths(packageName);
  const imports = ["." , ...subpaths].map((subpath, index) => {
    const specifier = subpath === "." ? packageName : `${packageName}/${subpath.slice(2)}`;
    return `import * as Surface${index} from ${JSON.stringify(specifier)};`;
  });
  await writeFile(join(work, "main.ts"), `${imports.join("\n")}\nimport { Effect } from "effect";\nvoid Effect.succeed(undefined);\nvoid [${imports.map((_, index) => `Surface${index}`).join(", ")}];\n`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const options = {
    cwd: work,
    shell: process.platform === "win32",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  };
  await execute(npm, ["install", "--no-audit", "--no-fund", "--strict-peer-deps", "--install-strategy=nested"], options);
  const installedManifest = JSON.parse(await readFile(join(work, "node_modules", packageName, "package.json"), "utf8"));
  const actualExports = Object.keys(installedManifest.exports ?? {}).sort();
  const expectedExports = [".", ...subpaths].sort();
  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    throw new Error(`${packageName} packed public exports differ from research-complete target: ${actualExports.join(",")}`);
  }
  const installedEffect = JSON.parse(await readFile(join(work, "node_modules", "effect", "package.json"), "utf8"));
  if (installedEffect.version !== effectVersion) {
    throw new Error(`packed coordinate resolved Effect ${installedEffect.version}, expected ${effectVersion}`);
  }
  const observedEffectPaths = new Set(
    (await execute(npm, ["ls", "effect", "--all", "--parseable"], options)).stdout
      .split(/\r?\n/u)
      .filter((path) => /node_modules[\\/]effect$/u.test(path)),
  );
  if (observedEffectPaths.size !== 1) {
    throw new Error(`packed coordinate has ${observedEffectPaths.size} Effect runtime identities`);
  }
  await execute(npm, ["exec", "--no", "tsc", "--", "-p", "tsconfig.json"], options);
  await execute("node", [join(work, "dist", "main.js")], { cwd: work });
  const runtime = await execute(
    "node",
    ["--input-type=module", "-e", `import * as Candidate from "${packageName}"; process.stdout.write(JSON.stringify({ exports: Object.keys(Candidate).sort() }))`],
    { cwd: work },
  );
  const report = JSON.parse(runtime.stdout.trim());
  if (!Array.isArray(report.exports)) throw new Error("packed package root exports are not observable");
  if (admission === "release-train" && report.exports.length === 0) {
    throw new Error("admitted packed package root exports are empty");
  }
  if (admission === "conditional-provider-candidate" && report.exports.length !== 0) {
    throw new Error(`conditional package leaked public root exports: ${report.exports.join(",")}`);
  }
  const fixture = fixtureAccounting[packageName];
  if (fixture === undefined) throw new Error(`packed fixture accounting is missing for ${packageName}`);
  const evidenceAccounting = researchEvidenceAccountingForPackage(packageName);
  assertFixtureCoverage(packageName, fixture, evidenceAccounting);
  const packedEnvironment = {
    ...process.env,
    EFFECT_BUILD_PACKED_NODE_MODULES: join(work, "node_modules"),
    EFFECT_BUILD_PACKED_PACKAGE: packageName,
  };
  if (packageName === "effect-build-bun") {
    const selected = (await execute("bun", ["-e", "console.log(process.execPath)"])).stdout.trim();
    packedEnvironment.EFFECT_BUILD_BUN = selected;
  }
  if (packageName === "effect-build-deno") {
    const selected = (await execute("deno", ["eval", "console.log(Deno.execPath())"])).stdout.trim();
    packedEnvironment.EFFECT_BUILD_DENO = selected;
    packedEnvironment.EFFECT_BUILD_DENO_API_MODULE = new URL(
      "./Api/Bundle.js",
      pathToFileURL(join(work, "node_modules/effect-build-deno/dist/index.js")),
    ).href;
  }
  if (packageName === "effect-build-node-sea") {
    packedEnvironment.EFFECT_BUILD_NODE = process.execPath;
    if (certificationHost === "linux-x64" && process.version !== "v26.7.0") {
      throw new Error(`packed Node SEA exact cell requires Node v26.7.0, observed ${process.version}`);
    }
  }
  const vitest = join(root, "node_modules/vitest/vitest.mjs");
  await execute(process.execPath, [vitest, "run", ...fixture.tests], {
    cwd: root,
    env: packedEnvironment,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (fixture.bunTests !== undefined) {
    await execute(packedEnvironment.EFFECT_BUILD_BUN, ["--bun", vitest, "run", ...fixture.bunTests], {
      cwd: root,
      env: packedEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  if (fixture.filteredTest !== undefined) {
    await execute(process.execPath, [
      vitest,
      "run",
      fixture.filteredTest.file,
      "-t",
      fixture.filteredTest.pattern,
    ], {
      cwd: root,
      env: packedEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  if (receipt !== undefined) {
    const destination = resolve(receipt);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify({
      schema: packedReceiptSchema,
      package: packageName,
      admission,
      effect: effectVersion,
      certificationHost,
      hostPlatform: host.platform,
      hostArchitecture: host.architecture,
      hostLibc: host.libc,
      hostSystemTarget: host.systemTarget,
      claim: admission === "release-train"
        ? "packed-declaration-runtime-fixtures-executed-no-operation-admission"
        : "conditional-provider-packed-runtime-fixtures-executed-no-package-admission",
      scopeSchema: researchContract.schema,
      operationEvidenceClass: "contract-referenced-installed-dist-fixtures-not-operation-certification",
      exactProviderRuntimeEvidence: packedProviderRuntimeEvidence(packageName, certificationHost),
      wrapperJobCount: "1",
      publicSubpathCount: String(subpaths.length),
      coreTarballSha256: tarballSha256["effect-build"],
      packageTarballSha256: tarballSha256[packageName],
      packageLockSha256: sha256(await readFile(join(work, "package-lock.json"))),
      effectRuntimeIdentityCount: String(observedEffectPaths.size),
      operationCount: String(evidenceAccounting.operationIds.length),
      operationIds: evidenceAccounting.operationIds,
      atomCount: String(evidenceAccounting.atomIds.length),
      atomIds: evidenceAccounting.atomIds,
    })}\n`, {
      flag: "wx",
    });
  }
  process.stdout.write(`packed coordinate passed: ${packageName} / Effect ${effectVersion} / ${certificationHost}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
