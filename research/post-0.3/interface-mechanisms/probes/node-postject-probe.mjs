import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const EXPECTED_NODE = "v26.7.0";
const EXPECTED_POSTJECT = "1.0.0-alpha.6";
const selectedNode = process.env.NODE_267_EXE;
const postjectRoot = process.env.POSTJECT_ROOT;
const expectedNodeSha256 = process.env.NODE_267_EXPECTED_SHA256;
const expectedPostjectApiSha256 = process.env.POSTJECT_EXPECTED_API_SHA256;
if (!selectedNode) throw new Error("NODE_267_EXE must select an exact Node 26.7.0 executable");
if (!postjectRoot) throw new Error("POSTJECT_ROOT must select an explicitly acquired postject 1.0.0-alpha.6 package");
if (!expectedNodeSha256) throw new Error("NODE_267_EXPECTED_SHA256 must content-bind the selected Node executable");
if (!expectedPostjectApiSha256) throw new Error("POSTJECT_EXPECTED_API_SHA256 must content-bind postject's programmatic entrypoint");

const run = (executable, argv, options = {}) => spawnSync(executable, argv, { encoding: "utf8", ...options });
const version = run(selectedNode, ["--version"]);
if (version.status !== 0 || version.stdout.trim() !== EXPECTED_NODE) {
  throw new Error(`expected ${EXPECTED_NODE}, observed ${version.stdout.trim() || version.stderr.trim()}`);
}
const postjectPackage = JSON.parse(await readFile(join(postjectRoot, "package.json"), "utf8"));
if (postjectPackage.version !== EXPECTED_POSTJECT) {
  throw new Error(`expected postject ${EXPECTED_POSTJECT}, observed ${postjectPackage.version}`);
}
const nodeSha256 = createHash("sha256").update(await readFile(selectedNode)).digest("hex");
if (nodeSha256 !== expectedNodeSha256) {
  throw new Error(`expected Node SHA-256 ${expectedNodeSha256}, observed ${nodeSha256}`);
}
const postjectApiPath = join(postjectRoot, "dist", "api.js");
const postjectApiSha256 = createHash("sha256").update(await readFile(postjectApiPath)).digest("hex");
if (postjectApiSha256 !== expectedPostjectApiSha256) {
  throw new Error(`expected postject API SHA-256 ${expectedPostjectApiSha256}, observed ${postjectApiSha256}`);
}
const require = createRequire(import.meta.url);
const { inject } = require(postjectApiPath);
const hostNodeSha256 = createHash("sha256").update(await readFile(process.execPath)).digest("hex");

const root = await mkdtemp(join(tmpdir(), "effect-build-node-postject-"));
const main = join(root, "main.cjs");
const asset = join(root, "message.txt");
const direct = join(root, "sea-direct");
const blob = join(root, "sea-prep.blob");
const legacy = join(root, "sea-legacy");
const directConfig = join(root, "direct.json");
const blobConfig = join(root, "blob.json");
const failureDirectory = join(root, "output-is-directory");
const failureConfig = join(root, "failure.json");
const sign = (path) => {
  if (process.platform !== "darwin") return { status: 0, stdout: "not-required-on-this-probe-host", stderr: "" };
  return run("codesign", ["--sign", "-", path]);
};

try {
  await writeFile(main, [
    'const sea = require("node:sea");',
    'process.stdout.write(`sea:${sea.getAsset("message", "utf8")}\\n`);',
    "",
  ].join("\n"));
  await writeFile(asset, "effect-build-node-sea");
  await writeFile(directConfig, JSON.stringify({
    main,
    mainFormat: "commonjs",
    executable: selectedNode,
    output: direct,
    useSnapshot: false,
    useCodeCache: false,
    assets: { message: asset },
  }));
  const directBuild = run(selectedNode, ["--build-sea", directConfig], { cwd: root });
  if (directBuild.status !== 0) throw new Error(`direct SEA build failed: ${directBuild.stderr}`);
  const directSign = sign(direct);
  if (directSign.status !== 0) throw new Error(`direct SEA signing failed: ${directSign.stderr}`);
  const directRun = run(direct, []);

  await writeFile(blobConfig, JSON.stringify({
    main,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: { message: asset },
  }));
  const blobBuild = run(selectedNode, ["--experimental-sea-config", blobConfig], { cwd: root });
  if (blobBuild.status !== 0) throw new Error(`SEA blob build failed: ${blobBuild.stderr}`);
  await copyFile(selectedNode, legacy);
  await chmod(legacy, 0o755);
  if (process.platform === "darwin") {
    const removeSignature = run("codesign", ["--remove-signature", legacy]);
    if (removeSignature.status !== 0) throw new Error(`signature removal failed: ${removeSignature.stderr}`);
  }
  const blobBytes = await readFile(blob);
  await inject(legacy, "NODE_SEA_BLOB", blobBytes, {
    sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
  });
  const legacySign = sign(legacy);
  if (legacySign.status !== 0) throw new Error(`legacy SEA signing failed: ${legacySign.stderr}`);
  const legacyRun = run(legacy, []);
  const reinjection = await inject(legacy, "NODE_SEA_BLOB", blobBytes, {
    sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
  }).then(() => ({ rejected: false })).catch((error) => ({
    rejected: true,
    name: error instanceof Error ? error.name : null,
    message: error instanceof Error ? error.message : String(error),
  }));

  await mkdir(failureDirectory);
  await writeFile(failureConfig, JSON.stringify({
    main,
    mainFormat: "commonjs",
    executable: selectedNode,
    output: failureDirectory,
    useSnapshot: false,
    useCodeCache: false,
  }));
  const directFailure = run(selectedNode, ["--build-sea", failureConfig], { cwd: root });

  const assertions = {
    exactNodeVersionAndContent: version.stdout.trim() === EXPECTED_NODE && nodeSha256 === expectedNodeSha256,
    exactPostjectVersionAndApiEntrypoint: postjectPackage.version === EXPECTED_POSTJECT && postjectApiSha256 === expectedPostjectApiSha256,
    directSeaRuns: directRun.status === 0 && directRun.stdout.trim() === "sea:effect-build-node-sea",
    legacyProgrammaticSeaRuns: legacyRun.status === 0 && legacyRun.stdout.trim() === "sea:effect-build-node-sea",
    reinjectionFailsClosed: reinjection.rejected === true && reinjection.message.includes("already exists"),
    directWriteFailureIsNonzero: directFailure.status !== 0
      && /Couldn.t write output executable/i.test(`${directFailure.stdout}\n${directFailure.stderr}`)
      && /directory|illegal operation/i.test(`${directFailure.stdout}\n${directFailure.stderr}`),
    preexistingDirectoryPreserved: (await stat(failureDirectory)).isDirectory(),
  };
  if (Object.values(assertions).some((value) => value !== true)) {
    throw new Error(`Node/postject conclusion failure: ${JSON.stringify({ assertions, reinjection, directFailure })}`);
  }

  console.log(JSON.stringify({
    schema: "effect-build/interface-mechanism-probe@1",
    probe: "node-direct-sea-and-programmatic-postject",
    classification: "official-direct-baseline-plus-third-party-programmatic-alternative",
    hostNodeVersion: process.version.slice(1),
    hostNodeExecutable: process.execPath,
    hostNodeSha256,
    selectedSeaNodeVersion: EXPECTED_NODE.slice(1),
    selectedSeaNodeSha256: nodeSha256,
    postjectVersion: EXPECTED_POSTJECT,
    postjectApiSha256,
    assertions,
    observations: {
      directStdout: directRun.stdout.trim(),
      legacyStdout: legacyRun.stdout.trim(),
      preparationBlobBytes: blobBytes.length,
      preparationBlobPrefixHex: blobBytes.subarray(0, 16).toString("hex"),
      reinjection,
      directFailure: {
        exitCode: directFailure.status,
        stderr: directFailure.stderr.trim(),
      },
      platform: process.platform,
      architecture: process.arch,
    },
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
