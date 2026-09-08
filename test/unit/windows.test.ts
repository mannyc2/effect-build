import { NodeServices } from "@effect/platform-node";
import { Effect, Redacted } from "effect";
import { Artifact, Tool } from "effect-build";
import * as Windows from "effect-build-windows";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const runLocal = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const password = "do-not-log:pfx-$42";
const unsigned = "unsigned msix payload\n";
const signed = `${unsigned}signed:SHA256\ntimestamp:RFC3161\n`;
const timestampUrl = "https://timestamp.example.test/rfc3161";
interface FixtureConfig {
  readonly probe: string;
  readonly source: string;
  readonly outfile: string;
  readonly log: string;
  readonly fail?: "sign" | "timestamp" | "verify" | "unsigned";
}
interface Invocation {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly source: string;
  readonly output: string | null;
}
let root: string;
let tool: string;
let configPath: string;
let config: FixtureConfig;
let artifact: Artifact.File;
let spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
let spawnFailure: boolean;

// Only the unavailable signer is scripted; Node's real process handles and filesystem exercise staging and failures.
const fixture = String.raw`
import { appendFileSync, existsSync, readFileSync } from "node:fs";
const [configPath, ...args] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (args.length === 1 && args[0] === '/?') { process.stdout.write(config.probe); process.exit(0); }
if (!['sign', 'verify'].includes(args[0])) throw new Error('unsupported signtool command');
appendFileSync(config.log, JSON.stringify({args, cwd: process.cwd(), source: readFileSync(config.source, 'utf8'), output: existsSync(config.outfile) ? readFileSync(config.outfile, 'utf8') : null}) + '\n');
const target = args.at(-1);
const fail = (phase, code) => { process.stderr.write(phase + ' failed; password=' + (args[args.indexOf('/p') + 1] ?? '')); process.exit(code); };
if (args[0] === 'sign') {
  if (readFileSync(target, 'utf8') !== 'unsigned msix payload\n') throw new Error('signer did not receive the source bytes');
  if (args[args.indexOf('/fd') + 1] !== 'SHA256' || args[args.indexOf('/td') + 1] !== 'SHA256' || !args.includes('/tr')) throw new Error('missing digest or timestamp options');
  appendFileSync(target, 'signed:SHA256\n');
  if (config.fail === 'sign') fail('sign', 31);
  if (config.fail === 'timestamp') fail('timestamp', 32);
  if (config.fail !== 'unsigned') appendFileSync(target, 'timestamp:RFC3161\n');
} else {
  if (!args.includes('/pa') || !args.includes('/all') || !args.includes('/tw')) throw new Error('incomplete verification');
  if (config.fail === 'verify') fail('verify', 33);
  if (!readFileSync(target, 'utf8').includes('timestamp:RFC3161')) fail('missing timestamp', 2);
}
`;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-windows-")));
  tool = join(root, "signtool.fixture");
  const script = join(root, "signtool.mjs");
  configPath = join(root, "config.json");
  config = { probe: "Microsoft (R) Sign Tool\nVersion: 10.0.26100.4188\n", source: join(root, "unsigned.msix"), outfile: join(root, "signed.msix"), log: join(root, "calls.jsonl") };
  await writeFile(tool, "signtool fixture bytes\n");
  await writeFile(script, fixture);
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(config.source, unsigned);
  await writeFile(join(root, "certificate.pfx"), "fixture certificate");
  artifact = await runLocal(Artifact.file(config.source, { name: "fixture", version: "0.7.0" }));
  const base = await runLocal(ChildProcessSpawner.ChildProcessSpawner);
  spawnFailure = false;
  spawner = ChildProcessSpawner.make((command) => {
    if (!ChildProcess.isStandardCommand(command)) return base.spawn(command);
    return base.spawn(ChildProcess.make(
      spawnFailure && command.args[0] === "sign" ? join(root, `missing-${password}`) : process.execPath,
      [script, configPath, ...command.args], command.options,
    ));
  });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const run = <A, E>(effect: Effect.Effect<A, E, Windows.Windows | NodeServices.NodeServices>, version?: string | ((value: string) => boolean)) =>
  Effect.runPromise(effect.pipe(
    Effect.provide(Windows.layer({ executable: tool, ...(version === undefined ? {} : { version }) })),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provide(NodeServices.layer),
  ));
const input = (): Windows.SignMsixInput => ({ artifact, outfile: config.outfile, kind: "pfx", file: "certificate.pfx", password: Redacted.make(password), cwd: root, timestampUrl });
const configure = async (changes: Partial<FixtureConfig>) => { config = { ...config, ...changes }; await writeFile(configPath, JSON.stringify(config)); };
const calls = async (): Promise<readonly Invocation[]> => (await readFile(config.log, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Invocation);

describe("Windows signing through real files and a scripted native tool", () => {
  it("signs and verifies a copy before committing its modified bytes", async () => {
    const result = await run(Windows.signMsix({ ...input(), description: "A fixture", descriptionUrl: "https://example.test/fixture" }));
    expect(await readFile(config.source, "utf8")).toBe(unsigned);
    expect(await readFile(result.path, "utf8")).toBe(signed);
    expect(result.sha256).toBe(createHash("sha256").update(signed).digest("hex"));
    expect(result.sha256).not.toBe(artifact.sha256);
    expect(await runLocal(Artifact.verify(result))).toEqual(result);
    expect(result.signature).toMatchObject({ fileDigest: "SHA256", timestampDigest: "SHA256", timestampProtocol: "RFC3161", timestampUrl, verification: "Authenticode" });
    expect(JSON.stringify(result)).not.toContain(password);
    const invocations = await calls();
    expect(invocations.map((call) => call.args[0])).toEqual(["sign", "verify"]);
    for (const invocation of invocations) {
      expect(invocation.cwd).toBe(root);
      expect(invocation.source).toBe(unsigned);
      expect(invocation.output).toBeNull();
      expect(invocation.args.at(-1)).not.toBe(config.source);
      expect(invocation.args.at(-1)).not.toBe(config.outfile);
      expect(basename(invocation.args.at(-1)!)).toBe("signed.msix");
    }
    expect(invocations[0]!.args).toContain(join(root, "certificate.pfx"));
    expect(invocations[0]!.args).toContain(password);
    expect(invocations[0]!.args).toContain("A fixture");
    expect(invocations[1]!.args.at(-1)).toBe(invocations[0]!.args.at(-1));
    expect((await readdir(root)).sort()).toEqual(["calls.jsonl", "certificate.pfx", "config.json", "signed.msix", "signtool.fixture", "signtool.mjs", "unsigned.msix"]);
  });

  it("defaults to an atomic replacement of the input file", async () => {
    await configure({ outfile: config.source });
    const { outfile: _outfile, ...options } = input();
    const result = await run(Windows.signMsix(options));
    expect(result.path).toBe(artifact.path);
    expect(await readFile(result.path, "utf8")).toBe(signed);
    expect((await calls()).every((call) => call.source === unsigned && call.output === unsigned)).toBe(true);
    expect(await runLocal(Artifact.verify(result))).toEqual(result);
  });

  it("passes explicit certificate-store selection to the signer", async () => {
    const result = await run(Windows.signMsix({
      artifact, outfile: config.outfile, cwd: root, kind: "store", thumbprint: "A".repeat(40), storeName: "TrustedPublisher", machineStore: true, timestampUrl,
    }));
    expect(await readFile(result.path, "utf8")).toBe(signed);
    const args = (await calls())[0]!.args;
    expect(args).toContain("/sm");
    expect(args[args.indexOf("/s") + 1]).toBe("TrustedPublisher");
    expect(args[args.indexOf("/sha1") + 1]).toBe("A".repeat(40));
    expect(args).not.toContain("/f");
    expect(args).not.toContain("/p");
  });

  it("writes directly when atomic is disabled", async () => {
    const result = await run(Windows.signMsix({ ...input(), atomic: false }));
    expect(await readFile(result.path, "utf8")).toBe(signed);
    expect((await calls()).every((call) => call.args.at(-1) === config.outfile)).toBe(true);
    expect(await readFile(config.source, "utf8")).toBe(unsigned);
  });

  it.each(["sign", "timestamp", "verify", "unsigned"] as const)("preserves an existing output and removes staging after %s failure", async (fail) => {
    await configure({ fail });
    await writeFile(config.outfile, "previous output");
    const before = (await readdir(root)).sort();
    const failure = await run(Windows.signMsix(input()).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(failure).toMatchObject({ exitCode: { sign: 31, timestamp: 32, verify: 33, unsigned: 2 }[fail] });
    expect(await readFile(config.outfile, "utf8")).toBe("previous output");
    expect(await readFile(config.source, "utf8")).toBe(unsigned);
    expect((await calls()).every((call) => call.output === "previous output")).toBe(true);
    expect((await readdir(root)).filter((name) => name !== "calls.jsonl").sort()).toEqual(before);
    expect(JSON.stringify(failure)).not.toContain(password);
    expect(String(failure)).not.toContain(password);
    if (failure instanceof Tool.Failed && (fail === "sign" || fail === "timestamp")) {
      expect(failure.args).toContain("<redacted>");
      expect(failure.stderr).toContain("<redacted>");
    }
  });

  it("preserves the input when default in-place signing fails", async () => {
    await configure({ fail: "verify", outfile: config.source });
    const { outfile: _outfile, ...options } = input();
    expect(await run(Windows.signMsix(options).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(artifact.path, "utf8")).toBe(unsigned);
    expect(await runLocal(Artifact.verify(artifact))).toEqual(artifact);
  });

  it.each(["bytes", "digest"])("rejects changed input %s before signing", async (changed) => {
    if (changed === "digest") await writeFile(artifact.path, "changed payload");
    const supplied = changed === "bytes" ? { ...artifact, bytes: artifact.bytes + 1 } : artifact;
    const failure = await run(Windows.signMsix({ ...input(), artifact: supplied }).pipe(Effect.flip));
    expect(failure).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
    expect(await readdir(root)).not.toContain("calls.jsonl");
    expect(await readdir(root)).not.toContain("signed.msix");
  });

  it("redacts passwords from native spawn failure details", async () => {
    spawnFailure = true;
    const failure = await run(Windows.signMsix(input()).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.SpawnFailed);
    if (failure instanceof Tool.SpawnFailed) expect(failure.detail).toContain("<redacted>");
    expect(JSON.stringify(failure)).not.toContain(password);
    expect(String(failure)).not.toContain(password);
    expect(await readFile(artifact.path, "utf8")).toBe(unsigned);
    expect(await readdir(root)).not.toContain("signed.msix");
  });

  it.each(["file:///timestamp", "https://user:password@example.test/", "https://example.test/?token=secret", "https://example.test/#fragment", "https://example.test/white space"])("rejects timestamp URL %s before signing", async (url) => {
    expect(await run(Windows.signMsix({ ...input(), timestampUrl: url }).pipe(Effect.flip))).toBeInstanceOf(Windows.InputInvalid);
    expect(await readdir(root)).not.toContain("calls.jsonl");
    expect(await readdir(root)).not.toContain("signed.msix");
  });

  it("rejects invalid certificate selection and unavailable passwords before signing", async () => {
    const unavailable = Redacted.make(password);
    Redacted.wipeUnsafe(unavailable);
    const invalid: readonly Windows.SignMsixInput[] = [
      { ...input(), outfile: join(root, "signed.zip") },
      { ...input(), descriptionUrl: "http://example.test/" },
      { ...input(), kind: "store", thumbprint: "not-a-certificate" },
      { ...input(), kind: "pfx", file: "" },
      { ...input(), kind: "pfx", file: "certificate.pfx", password: Redacted.make("invalid\0password") },
      { ...input(), kind: "pfx", file: "certificate.pfx", password: unavailable },
    ];
    for (const options of invalid) {
      expect(await run(Windows.signMsix(options).pipe(Effect.flip))).toBeInstanceOf(Windows.InputInvalid);
    }
    expect(await readdir(root)).not.toContain("calls.jsonl");
    expect(await readdir(root)).not.toContain("signed.msix");
  });

  it.each(["10.0.26100", "10.0.26100.4188"])("accepts native SDK version %s and preserves it on the output", async (version) => {
    await configure({ probe: `Version: ${version}\n` });
    const result = await run(Windows.signMsix(input()));
    expect(await readFile(result.path, "utf8")).toBe(signed);
    expect(result.producedBy.version).toBe(version);
  });

  it("applies a family range while giving custom predicates the full SDK version", async () => {
    const result = await run(Windows.signMsix(input()), "=10.0.26100");
    expect(result.producedBy.version).toBe("10.0.26100.4188");
    const second = await run(Windows.signMsix({ ...input(), outfile: join(root, "custom.msix") }), (version) => version === "10.0.26100.4188");
    expect(await readFile(second.path, "utf8")).toBe(signed);
  });

  it.each(["10.0.26000.1", "11.0.0.0"])("rejects unsupported SDK %s before signing", async (version) => {
    await configure({ probe: `Version: ${version}\n` });
    await expect(run(Windows.signMsix(input()))).rejects.toBeInstanceOf(Tool.VersionUnsupported);
    expect(await readdir(root)).not.toContain("calls.jsonl");
  });

  it.each(["10.0.26100.1-preview", "10.0.026100.1"])("rejects malformed SDK probe %s before signing", async (version) => {
    await configure({ probe: `Version: ${version}\n` });
    await expect(run(Windows.signMsix(input()))).rejects.toBeInstanceOf(Tool.ProbeFailed);
    expect(await readdir(root)).not.toContain("calls.jsonl");
  });
});
