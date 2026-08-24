import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { nodeProfile, sha256, targetCell } from "./common.mjs";

const execute = promisify(execFile);

const argumentsOf = () => {
  const values = Object.create(null);
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error("expected --name value arguments");
    values[name.slice(2)] = value;
  }
  return values;
};

const download = async (url, maximumBytes) => {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`download ${url} returned ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) throw new Error(`download ${url} exceeds ${maximumBytes} bytes`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximumBytes) throw new Error(`download ${url} exceeds ${maximumBytes} bytes`);
  return bytes;
};

const requireDigest = (bytes, expected, subject) => {
  const observed = sha256(bytes);
  if (observed !== expected) throw new Error(`${subject} digest mismatch: ${observed}`);
};

const main = async () => {
  const args = argumentsOf();
  const target = args.target;
  const output = args.output;
  if (target === undefined || output === undefined) throw new Error("--target and --output are required");
  const cell = targetCell(target);
  const manifestPolicy = nodeProfile.nodeDistributionManifest;
  const scratch = await mkdtemp(join(tmpdir(), "effect-build-node-base-"));
  try {
    const [manifest, signature, key, archive] = await Promise.all([
      download(manifestPolicy.url, 1_048_576),
      download(manifestPolicy.signatureUrl, 1_048_576),
      download(manifestPolicy.releaseKeyUrl, 1_048_576),
      download(`https://nodejs.org/dist/v26.7.0/${cell.distribution}`, 209_715_200),
    ]);
    requireDigest(manifest, manifestPolicy.sha256, "Node distribution manifest");
    requireDigest(signature, manifestPolicy.signatureSha256, "Node distribution signature");
    requireDigest(key, manifestPolicy.releaseKeySha256, "Node release key");
    requireDigest(archive, cell.sha256, cell.distribution);
    const manifestLine = manifest.toString("utf8").split("\n").find((line) => line.endsWith(`  ${cell.distribution}`));
    if (manifestLine !== `${cell.sha256}  ${cell.distribution}`) throw new Error("archive is not exactly admitted by SHASUMS256.txt");

    const manifestPath = join(scratch, "SHASUMS256.txt");
    const signaturePath = join(scratch, "SHASUMS256.txt.sig");
    const keyPath = join(scratch, "release-key.asc");
    const archivePath = join(scratch, cell.distribution);
    const keyring = join(scratch, "release-key.gpg");
    await Promise.all([
      writeFile(manifestPath, manifest),
      writeFile(signaturePath, signature),
      writeFile(keyPath, key),
      writeFile(archivePath, archive),
    ]);
    const fingerprint = await execute(
      "gpg",
      ["--batch", "--no-autostart", "--with-colons", "--import-options", "show-only", "--import", keyPath],
      { timeout: 30_000 },
    );
    const fingerprints = fingerprint.stdout.split("\n").filter((line) => line.startsWith("fpr:")).map((line) => line.split(":")[9]);
    if (!fingerprints.includes(manifestPolicy.signerFingerprint)) throw new Error("pinned Node release-key fingerprint missing");
    await execute("gpg", ["--batch", "--no-autostart", "--yes", "--dearmor", "--output", keyring, keyPath], {
      timeout: 30_000,
    });
    await execute("gpgv", ["--keyring", keyring, signaturePath, manifestPath], { timeout: 30_000 });

    const extraction = join(scratch, "extract");
    await mkdir(extraction);
    if (cell.distribution.endsWith(".zip") && process.platform !== "win32") {
      await execute("unzip", ["-q", archivePath, "-d", extraction], { timeout: 120_000 });
    } else {
      await execute("tar", ["-xf", archivePath, "-C", extraction], { timeout: 120_000 });
    }
    const folder = cell.distribution.replace(/\.(?:tar\.xz|zip)$/u, "");
    const executable = cell.distribution.includes("-win-")
      ? join(extraction, folder, "node.exe")
      : join(extraction, folder, "bin", "node");
    const bytes = await readFile(executable);
    if (bytes.length === 0) throw new Error("authenticated Node executable is empty");
    const destination = resolve(output);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: process.platform === "win32" ? undefined : 0o755 });
    if (process.platform !== "win32") await chmod(destination, 0o755);
    process.stdout.write(`${JSON.stringify({ target, executable: destination, archiveName: cell.distribution, archiveSha256: cell.sha256 })}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

await main();
