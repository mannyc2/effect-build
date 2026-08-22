import { chmodSync, writeFileSync } from "node:fs";

const [, , outfile, mode = "success", sentinel] = process.argv;
if (mode === "fail") {
  process.stderr.write("compile failed");
  process.exit(7);
}
if (mode === "missing") process.exit(0);
if (mode === "hang") {
  writeFileSync(sentinel, String(process.pid));
  setInterval(() => {}, 1_000);
} else if (mode === "pe") {
  // Minimal PE: DOS "MZ" header, e_lfanew -> "PE\0\0", machine x86-64.
  const pe = new Uint8Array(72);
  pe.set([0x4d, 0x5a], 0);
  pe[60] = 64;
  pe.set([0x50, 0x45, 0x00, 0x00], 64);
  pe.set([0x64, 0x86], 68);
  writeFileSync(outfile, pe);
  chmodSync(outfile, 0o755);
} else {
  const header = new Uint8Array(64);
  // Little-endian 64-bit Mach-O, arm64.
  header.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  header.set([0x0c, 0x00, 0x00, 0x01], 4);
  header.set(new TextEncoder().encode("effect-build-fixture"), 32);
  writeFileSync(outfile, header);
  chmodSync(outfile, 0o755);
}
