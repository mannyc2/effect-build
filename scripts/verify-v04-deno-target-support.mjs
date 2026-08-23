import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTargetSupport } from "./verify-target-support.mjs";

const release = "v2.9.3";
const releaseDirectory = "v2.9.3";
const releaseBaseUrl = `https://github.com/denoland/deno/releases/download/${release}`;

export const denortArchives = [
  {
    triple: "x86_64-apple-darwin",
    size: 31_455_927,
    sha256: "19c5b64ea27524fb33380cb2b676e07b972f8c023514f9e8297119ffbaec1ab8",
  },
  {
    triple: "aarch64-apple-darwin",
    size: 28_693_550,
    sha256: "75146eb2630ac07976120d2a7d2e2f950c7a31bf4505ba985ac7b1484e7907e1",
  },
  {
    triple: "x86_64-unknown-linux-gnu",
    size: 36_531_946,
    sha256: "9fd1ecebd84bfd99b406442f40176e32e948b00edb91221358ec44d25a2092bd",
  },
  {
    triple: "aarch64-unknown-linux-gnu",
    size: 36_436_977,
    sha256: "38ea978dc575538f0779c62c2f1b7ab0306af2f918a449d1bf1af909d041a857",
  },
  {
    triple: "x86_64-pc-windows-msvc",
    size: 32_603_181,
    sha256: "c044e54b2cfa6f39e87b5cb98745d9cc5088273d3672a339a062b6a10b432653",
  },
  {
    triple: "aarch64-pc-windows-msvc",
    size: 31_117_493,
    sha256: "a48da86ee7f74c6aeca2eafe55e8bd7d72d56d187f3d7d6cb15dfe1954c0590f",
  },
].map((archive) => ({
  ...archive,
  file: `denort-${archive.triple}.zip`,
  url: `${releaseBaseUrl}/denort-${archive.triple}.zip`,
}));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const validateArchiveUrl = (archive) => {
  const url = new URL(archive.url);
  if (url.origin !== "https://github.com" || url.pathname !== `/denoland/deno/releases/download/${release}/${archive.file}`) {
    throw new Error(`denort archive URL escaped the exact Deno v2.9.3 release: ${archive.url}`);
  }
};

export const prewarmDenortArchives = async ({
  denoDir,
  archives = denortArchives,
  digest = sha256,
  fetchAsset = fetch,
  makeDirectory = (path) => mkdir(path, { recursive: true }),
  moveFile = rename,
  removeFile = (path) => rm(path, { force: true }),
  writeAsset = writeFile,
} = {}) => {
  if (typeof denoDir !== "string" || !isAbsolute(denoDir)) throw new Error("DENO_DIR must be absolute");
  const destinationDirectory = join(resolve(denoDir), "dl", "release", releaseDirectory);
  await makeDirectory(destinationDirectory);
  const paths = new Map();
  for (const [index, archive] of archives.entries()) {
    validateArchiveUrl(archive);
    const response = await fetchAsset(archive.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`denort archive download failed for ${archive.triple}: ${response.status}`);
    if (typeof response.url === "string" && new URL(response.url).protocol !== "https:") {
      throw new Error(`denort archive download left HTTPS for ${archive.triple}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== archive.size) {
      throw new Error(`denort archive size mismatch for ${archive.triple}: ${bytes.byteLength}`);
    }
    if (digest(bytes) !== archive.sha256) throw new Error(`denort archive checksum mismatch for ${archive.triple}`);
    const destination = join(destinationDirectory, archive.file);
    const partial = `${destination}.partial-${process.pid}-${index}`;
    try {
      await writeAsset(partial, bytes, { flag: "wx" });
      await moveFile(partial, destination);
    } finally {
      await removeFile(partial);
    }
    paths.set(archive.triple, destination);
  }
  return paths;
};

export const verifyPrewarmedDenoTargetSupport = async (environment = process.env) => {
  const denoDir = await mkdtemp(join(tmpdir(), "effect-build-plan042-denort-cache-"));
  const targetEnvironment = { ...environment, DENO_DIR: denoDir };
  delete targetEnvironment.DENORT_BIN;
  try {
    await prewarmDenortArchives({ denoDir });
    return await verifyTargetSupport({ compiler: "deno", environment: targetEnvironment });
  } finally {
    await rm(denoDir, { recursive: true, force: true });
  }
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await verifyPrewarmedDenoTargetSupport();
