import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { conclusion, infrastructure } from "./receipt.mjs";
import { requiredPath } from "./probe-runtime.mjs";

const execFileAsync = promisify(execFile);
const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 600_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      code: typeof error.code === "number" ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const locate = async (name) => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, process.platform === "win32" ? `${name}.cmd` : name);
    const probe = await run(candidate, ["--version"], { timeout: 30_000 });
    if (probe.ok) return candidate;
  }
  throw new Error(`${name} is unavailable on absolute PATH entries`);
};

const npm = await locate("npm");
const bun = await requiredPath("EFFECT_BUILD_BUN_CURRENT_BIN");
const node = process.execPath;
const root = await mkdtemp(join(tmpdir(), "effect-build-packed-protocol-"));

const coreSource = (version, protocol) => ({
  package: {
    name: "@effect-build-research/core",
    version,
    type: "module",
    files: ["index.js"],
    exports: { ".": "./index.js" },
    peerDependencies: { effect: ">=4.0.0-beta.104 <4.1.0-0" },
  },
  index: `import { Effect } from "effect";
export const NodeMainProgramProtocol = ${JSON.stringify(protocol)};
export const validateProfileProtocol = (profile, expected, observed, providerPackage) =>
  observed === expected
    ? Effect.succeed(undefined)
    : Effect.fail({ _tag: "ProfileProtocolUnsupported", profile, expected, observed, providerPackage });
export const makeNodeMain = (providerPackage, request) => ({
  _tag: "NodeMain",
  profileProtocol: NodeMainProgramProtocol,
  providerPackage,
  moduleFormat: request.moduleFormat,
  runtimeTarget: request.runtimeTarget,
  content: {
    lifetime: "borrowed",
    identity: { algorithm: "sha256", digest: "sha256:packed", bytes: 6 },
    acquire: Effect.succeed({ algorithm: "sha256", digest: "sha256:packed", bytes: 6, contents: new TextEncoder().encode("packed") })
  },
  observations: [{ operation: "packed-provider-main", providerPackage, profileProtocol: NodeMainProgramProtocol }]
});
`,
});

const providerSource = {
  package: {
    name: "@effect-build-research/provider",
    version: "0.7.0",
    type: "module",
    files: ["index.js"],
    exports: { ".": "./index.js" },
    peerDependencies: {
      "@effect-build-research/core": ">=0.4.0 <0.5.0",
      effect: ">=4.0.0-beta.104 <4.1.0-0",
    },
  },
  index: `import { Effect } from "effect";
import * as Core from "@effect-build-research/core";
export const providerPackage = { name: "@effect-build-research/provider", version: "0.7.0" };
export const NodeMainProgramProtocol = "effect-build/profile/node-main-program@1";
export const service = {
  profile: "NodeMainProgram",
  protocol: NodeMainProgramProtocol,
  providerPackage,
  withMain(request, use) {
    return Effect.flatMap(
      Core.validateProfileProtocol(
        "NodeMainProgram",
        Core.NodeMainProgramProtocol,
        NodeMainProgramProtocol,
        providerPackage
      ),
      () => use(Core.makeNodeMain(providerPackage, request))
    );
  }
};
`,
};

const writePackage = async (directory, source) => {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), `${JSON.stringify(source.package, null, 2)}\n`);
  await writeFile(join(directory, "index.js"), source.index);
};

const pack = async (directory, tarballs) => {
  const result = await run(npm, ["pack", "--pack-destination", tarballs, "--json"], { cwd: directory });
  infrastructure(result.ok, `npm pack failed: ${result.stderr || result.message}`);
  const parsed = JSON.parse(result.stdout);
  infrastructure(Array.isArray(parsed) && parsed.length === 1, "npm pack did not return one package");
  return join(tarballs, parsed[0].filename);
};

const consumerSource = `import { Effect } from "effect";
import * as Core from "@effect-build-research/core";
import { service } from "@effect-build-research/provider";
const request = {
  entrypoint: "main.ts",
  moduleFormat: "esm",
  runtimeTarget: { runtime: "node", version: "26.7.0", moduleResolution: "node" },
  minify: false,
  sourceMap: "none"
};
try {
  const result = await Effect.runPromise(service.withMain(request, (main) =>
    Effect.map(main.content.acquire, (snapshot) => ({
      serviceProtocol: service.protocol,
      coreProtocol: Core.NodeMainProgramProtocol,
      mainProtocol: main.profileProtocol,
      providerPackage: main.providerPackage,
      bytes: new TextDecoder().decode(snapshot.contents)
    }))
  ));
  console.log(JSON.stringify({ ok: true, result }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error }));
}
`;

const writeConsumer = async ({ directory, coreTarball, providerTarball, effectVersion = "4.0.0-rc.108" }) => {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@effect-build-research/core": `file:${coreTarball}`,
      "@effect-build-research/provider": `file:${providerTarball}`,
      effect: effectVersion,
    },
  }, null, 2)}\n`);
  await writeFile(join(directory, "consumer.mjs"), consumerSource);
};

const executeConsumer = async (directory, executable = node) => {
  const result = await run(executable, ["consumer.mjs"], { cwd: directory });
  infrastructure(result.ok, `consumer process failed: ${result.stderr || result.message}`);
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  infrastructure(line !== undefined, "consumer emitted no JSON");
  return JSON.parse(line);
};

const installNpm = (directory, extra = []) =>
  run(npm, ["install", "--no-audit", "--no-fund", "--strict-peer-deps", ...extra], { cwd: directory });
const installBun = (directory) => run(bun, ["install"], { cwd: directory });

const extractPackage = async (tarball, destination) => {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const tar = await locate("tar");
  const extracted = await run(tar, ["-xzf", tarball, "--strip-components=1", "-C", destination]);
  infrastructure(extracted.ok, `tar extraction failed: ${extracted.stderr || extracted.message}`);
};

export let packedProtocolGraphResult;
try {
  const packages = join(root, "packages");
  const tarballs = join(root, "tarballs");
  await mkdir(tarballs, { recursive: true });
  const core040Dir = join(packages, "core-0.4.0");
  const core042Dir = join(packages, "core-0.4.2");
  const core050Dir = join(packages, "core-0.5.0");
  const providerDir = join(packages, "provider-0.7.0");
  await writePackage(core040Dir, coreSource("0.4.0", "effect-build/profile/node-main-program@1"));
  await writePackage(core042Dir, coreSource("0.4.2", "effect-build/profile/node-main-program@1"));
  await writePackage(core050Dir, coreSource("0.5.0", "effect-build/profile/node-main-program@2"));
  await writePackage(providerDir, providerSource);
  const core040 = await pack(core040Dir, tarballs);
  const core042 = await pack(core042Dir, tarballs);
  const core050 = await pack(core050Dir, tarballs);
  const provider = await pack(providerDir, tarballs);

  const npmCompatible = join(root, "consumer-npm-compatible");
  await writeConsumer({ directory: npmCompatible, coreTarball: core040, providerTarball: provider });
  const npmCompatibleInstall = await installNpm(npmCompatible);
  conclusion(npmCompatibleInstall.ok, `npm compatible graph did not install: ${npmCompatibleInstall.stderr}`);
  const npmCompatibleRun = await executeConsumer(npmCompatible);
  conclusion(npmCompatibleRun.ok === true, "npm compatible profile execution failed");
  conclusion(npmCompatibleRun.result.bytes === "packed", "npm compatible profile returned wrong bytes");

  const npmAllowedSkew = join(root, "consumer-npm-skew");
  await writeConsumer({ directory: npmAllowedSkew, coreTarball: core042, providerTarball: provider });
  const npmSkewInstall = await installNpm(npmAllowedSkew);
  conclusion(npmSkewInstall.ok, `npm allowed core skew did not install: ${npmSkewInstall.stderr}`);
  const npmSkewRun = await executeConsumer(npmAllowedSkew);
  conclusion(npmSkewRun.ok === true && npmSkewRun.result.coreProtocol.endsWith("@1"), "npm allowed core skew did not execute profile @1");

  const bunCompatible = join(root, "consumer-bun-compatible");
  await writeConsumer({ directory: bunCompatible, coreTarball: core040, providerTarball: provider });
  const bunCompatibleInstall = await installBun(bunCompatible);
  conclusion(bunCompatibleInstall.ok, `Bun compatible graph did not install: ${bunCompatibleInstall.stderr}`);
  const bunCompatibleRun = await executeConsumer(bunCompatible, bun);
  conclusion(bunCompatibleRun.ok === true && bunCompatibleRun.result.bytes === "packed", "Bun compatible profile execution failed");

  const npmRejected = join(root, "consumer-npm-rejected");
  await writeConsumer({ directory: npmRejected, coreTarball: core050, providerTarball: provider });
  const npmRejectedInstall = await installNpm(npmRejected);
  conclusion(npmRejectedInstall.ok === false, "npm strict peer installation accepted core 0.5.0");

  const npmForced = join(root, "consumer-npm-forced");
  await writeConsumer({ directory: npmForced, coreTarball: core050, providerTarball: provider });
  const npmForcedInstall = await run(npm, ["install", "--no-audit", "--no-fund", "--force"], { cwd: npmForced });
  conclusion(npmForcedInstall.ok, `npm forced incompatible peer graph did not install: ${npmForcedInstall.stderr}`);
  const npmForcedRun = await executeConsumer(npmForced);
  conclusion(npmForcedRun.ok === false, "forced incompatible npm graph unexpectedly executed");
  conclusion(npmForcedRun.error?._tag === "ProfileProtocolUnsupported", "forced incompatible npm graph did not fail with ProfileProtocolUnsupported");

  const bunRejected = join(root, "consumer-bun-rejected");
  await writeConsumer({ directory: bunRejected, coreTarball: core050, providerTarball: provider });
  const bunRejectedInstall = await installBun(bunRejected);
  conclusion(bunRejectedInstall.ok, `Bun could not construct the forced skew fixture: ${bunRejectedInstall.stderr}`);
  const bunRejectedRun = await executeConsumer(bunRejected, bun);
  conclusion(bunRejectedRun.ok === false && bunRejectedRun.error?._tag === "ProfileProtocolUnsupported", "Bun incompatible core skew did not fail at protocol validation");

  const duplicate = join(root, "consumer-duplicates");
  await writeConsumer({ directory: duplicate, coreTarball: core042, providerTarball: provider });
  const duplicateInstall = await installNpm(duplicate);
  conclusion(duplicateInstall.ok, `duplicate graph base install failed: ${duplicateInstall.stderr}`);
  const providerNodeModules = join(
    duplicate,
    "node_modules",
    "@effect-build-research",
    "provider",
    "node_modules",
  );
  await extractPackage(core040, join(providerNodeModules, "@effect-build-research", "core"));
  const effectBetaRoot = join(root, "effect-beta");
  await mkdir(effectBetaRoot, { recursive: true });
  await writeFile(join(effectBetaRoot, "package.json"), `${JSON.stringify({ private: true, dependencies: { effect: "4.0.0-beta.104" } }, null, 2)}\n`);
  const effectBetaInstall = await run(npm, ["install", "--no-audit", "--no-fund"], { cwd: effectBetaRoot });
  conclusion(effectBetaInstall.ok, `Effect beta duplicate fixture install failed: ${effectBetaInstall.stderr}`);
  await cp(
    join(effectBetaRoot, "node_modules", "effect"),
    join(providerNodeModules, "effect"),
    { recursive: true, force: true },
  );
  const duplicateRun = await executeConsumer(duplicate);
  conclusion(duplicateRun.ok === true, "real duplicate core/Effect package graph did not execute the profile");
  conclusion(duplicateRun.result.serviceProtocol === duplicateRun.result.coreProtocol, "duplicate graph protocol equality changed");

  packedProtocolGraphResult = {
    packedOnce: {
      core040: basename(core040),
      core042: basename(core042),
      core050: basename(core050),
      provider: basename(provider),
    },
    npm: {
      compatible: npmCompatibleRun,
      allowedSkew: npmSkewRun,
      rejectedSkewInstallCode: npmRejectedInstall.code,
      forcedSkew: npmForcedRun,
    },
    bun: {
      compatible: bunCompatibleRun,
      forcedSkew: bunRejectedRun,
    },
    duplicates: duplicateRun,
  };
} finally {
  await rm(root, { recursive: true, force: true });
}
