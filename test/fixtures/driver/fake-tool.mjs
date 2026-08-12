import { appendFileSync, chmodSync, writeFileSync } from "node:fs";

const [, , tool, logFile, ...argv] = process.argv;
appendFileSync(logFile, `${JSON.stringify(argv)}\n`);

const probeFirst = tool === "bun" ? "-e" : "eval";
if (argv[0] === probeFirst) {
  process.stdout.write(JSON.stringify({ path: process.env.EFFECT_BUILD_FAKE_TOOL_PATH, version: "9.9.9" }));
  process.exit(0);
}

const contractEnv = process.env.EFFECT_BUILD_CONTRACT_ENV;
if (contractEnv !== undefined) appendFileSync(logFile, `env:${contractEnv}\n`);

const entrypoint = argv[argv.length - 1];
if (entrypoint.endsWith("fail.ts")) {
  process.stderr.write("error: missing import");
  process.exit(1);
}

const outfileFlag = argv.find((value) => value.startsWith("--outfile="));
const outputIndex = argv.indexOf("--output");
const outfile = outfileFlag === undefined ? argv[outputIndex + 1] : outfileFlag.slice("--outfile=".length);
const header = new Uint8Array(64);
// Little-endian 64-bit Mach-O, arm64.
header.set([0xcf, 0xfa, 0xed, 0xfe], 0);
header.set([0x0c, 0x00, 0x00, 0x01], 4);
writeFileSync(outfile, header);
chmodSync(outfile, 0o755);
