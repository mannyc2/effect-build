import { NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Redacted, Schema } from "effect";
import { Artifact, Executable, Tool } from "effect-build";
import * as Apple from "effect-build-apple";
import * as Bun from "effect-build-bun";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { elf, thinMacho } from "../fixtures/native-executable.js";

const local = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const producer = { name: "fixture", version: "0.7.0" };
const certificateSha1 = "A".repeat(40);
const password = "private-notary:$42";
const submissionId = "3f33f890-0cbf-4c1e-bb39-6fba74a594f0";
const credential: Apple.Notary.Credential = { kind: "apple-id", appleId: "fixture@example.test", teamId: "TEAMID1234", password: Redacted.make(password) };
interface Config {
  readonly log: string;
  readonly fail?: string;
  readonly guard?: string;
  readonly mutateDuringVerify?: string;
  readonly corruptTarget?: boolean;
  readonly submit?: unknown;
  readonly wait?: unknown;
  readonly waitForAbort?: boolean;
  readonly info?: unknown;
  readonly logResponse?: unknown;
  readonly rawResponse?: string;
}
interface Invocation { readonly tool: string; readonly args: readonly string[]; readonly guard: boolean; readonly payloadSha?: string; readonly plist?: string; }
interface PackedEntry { readonly path: string; readonly kind: string; readonly contents?: string; readonly target?: string; readonly mode: number; }
let root: string;
let tool: string;
let configPath: string;
let config: Config;
let spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
let executable: Artifact.Executable;
let resource: Artifact.File;

// Credential-dependent commands mutate real staged files; real Node process handles exercise tool failures and cleanup.
const fixture = String.raw`
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const [configPath, name, ...args] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (name === '--version' && args.length === 0) { process.stdout.write('xcrun version 70.\n'); process.exit(0); }
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
appendFileSync(config.log, JSON.stringify({tool:name, args, guard:config.guard ? existsSync(config.guard) : false, ...(name === 'notarytool' && args[0] === 'submit' ? {payloadSha:sha(args[1])} : {}), ...(name === 'plutil' ? {plist:readFileSync(args.at(-1), 'utf8')} : {})}) + '\n');
const fail = (phase) => { if (config.fail === phase) { process.stderr.write(phase + ' failed private-notary:$42'); process.exit(37); } };
const write = (path, contents) => { mkdirSync(dirname(path), {recursive:true}); writeFileSync(path, contents); };
const collect = (directory, prefix='') => readdirSync(directory).sort().flatMap((name) => {
  const path = join(directory, name), relative = prefix + name, info = lstatSync(path);
  if (info.isSymbolicLink()) return [{path:relative,kind:'symlink',mode:info.mode & 0o777,target:readlinkSync(path)}];
  if (info.isDirectory()) return [{path:relative,kind:'directory',mode:info.mode & 0o777}, ...collect(path, relative + '/')];
  return [{path:relative,kind:'file',mode:info.mode & 0o777,contents:readFileSync(path).toString('base64')}];
});
const signature = (target) => join(target, target.endsWith('.app') ? 'Contents/_CodeSignature' : '_CodeSignature', 'CodeResources');
const verifySignature = (target) => {
  if (lstatSync(target).isDirectory()) { if (!existsSync(signature(target))) throw new Error('missing app signature'); }
  else if (!readFileSync(target, 'utf8').includes(':signed')) throw new Error('missing file signature');
};
const target = args.at(-1);
switch (name) {
  case 'plutil':
    if (args[0] !== '-lint' || !readFileSync(target, 'utf8').includes('<plist')) throw new Error('invalid plist');
    fail('plutil'); break;
  case 'ditto':
    if (args[0] === '-c') { const src = args.at(-2); write(target, JSON.stringify({entries:lstatSync(src).isDirectory() ? collect(src) : [{path:basename(src),kind:'file',mode:lstatSync(src).mode & 0o777,contents:readFileSync(src).toString('base64')}],bundle:basename(src)})); }
    else { cpSync(args[0], args[1], {recursive:true,verbatimSymlinks:true,preserveTimestamps:true}); chmodSync(args[1], lstatSync(args[0]).mode & 0o777); }
    fail('ditto'); break;
  case 'codesign':
    if (args[0] === '--force') {
      if (!args.includes('--sign') || !args.includes('--timestamp')) throw new Error('missing signing options');
      if (lstatSync(target).isDirectory()) write(signature(target), 'signed resources'); else appendFileSync(target, ':signed');
      if (config.corruptTarget && !lstatSync(target).isDirectory()) { const bytes = readFileSync(target); bytes.writeUInt32LE(0x01000007, 4); writeFileSync(target, bytes); }
      fail('codesign.sign');
    } else if (args[0] === '--verify') { verifySignature(target); if (config.mutateDuringVerify) write(config.mutateDuringVerify,'changed original'); fail('codesign.verify'); }
    else throw new Error('unsupported codesign command');
    break;
  case 'hdiutil':
    if (args[0] === 'create') { write(target, JSON.stringify({entries:collect(args[args.indexOf('-srcfolder') + 1])})); fail('hdiutil.create'); }
    else if (args[0] === 'verify') { JSON.parse(readFileSync(target,'utf8')); fail('hdiutil.verify'); }
    else throw new Error('unsupported hdiutil command');
    break;
  case 'pkgbuild':
    if (args[0] !== '--component' && args[0] !== '--root') throw new Error('missing installer component or root');
    write(target, JSON.stringify({entries:collect(args[1]),bundle:args[0] === '--component' ? basename(args[1]) : '',location:args[args.indexOf('--install-location') + 1]})); fail('pkgbuild'); break;
  case 'productbuild':
    if (args[0] !== '--package') throw new Error('missing component package');
    write(target, readFileSync(args[1])); fail('productbuild'); break;
  case 'productsign':
    write(target, readFileSync(args.at(-2), 'utf8') + ':signed'); fail('productsign'); break;
  case 'pkgutil':
    if (args[0] === '--check-signature') verifySignature(target);
    else if (args[0] === '--payload-files') { const packed=JSON.parse(readFileSync(target,'utf8')); process.stdout.write(packed.entries.map((entry)=>(packed.bundle ? packed.bundle+'/' : '')+entry.path).join('\n')+'\n'); }
    else throw new Error('unsupported pkgutil command');
    fail('pkgutil'); break;
  case 'notarytool': {
    if (!['submit','wait','info','log'].includes(args[0]) || !args.includes('--output-format') || !args.includes('json')) throw new Error('unsupported notary command');
    if (args[0] === 'submit' && args.includes('--wait')) throw new Error('submission must return before waiting');
    fail('notarytool.' + args[0]);
    if (args[0] === 'wait' && config.waitForAbort) { setInterval(() => {}, 1000); await new Promise(() => {}); }
    const defaults = args[0] === 'log' ? {jobId:'3f33f890-0cbf-4c1e-bb39-6fba74a594f0',status:'Accepted',issues:null} : {id:'3f33f890-0cbf-4c1e-bb39-6fba74a594f0',status:'Accepted'};
    process.stdout.write(config.rawResponse ?? JSON.stringify(config[args[0] === 'log' ? 'logResponse' : args[0]] ?? (args[0] === 'wait' ? config.submit : undefined) ?? defaults));
    break;
  }
  case 'stapler':
    if (args[0] === 'staple') {
      if (lstatSync(target).isDirectory()) write(join(target,'Contents/_CodeSignature/NotaryTicket'), 'ticket'); else appendFileSync(target, ':ticket');
      fail('stapler.staple');
    } else if (args[0] === 'validate') {
      const ticket=lstatSync(target).isDirectory() ? existsSync(join(target,'Contents/_CodeSignature/NotaryTicket')) : readFileSync(target,'utf8').includes(':ticket');
      if (!ticket) throw new Error('missing notarization ticket');
      fail('stapler.validate');
    } else throw new Error('unsupported stapler command');
    break;
  case 'spctl':
    if (args[0] !== '--assess' || !args.includes('--type')) throw new Error('invalid assessment command');
    fail('spctl'); break;
  default: throw new Error('unsupported native tool ' + name);
}
`;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "effect-build-apple-")));
  tool = join(root, "xcrun.fixture");
  const script = join(root, "xcrun.mjs");
  configPath = join(root, "config.json");
  config = { log: join(root, "calls.jsonl") };
  await writeFile(tool, "xcrun fixture bytes\n");
  await writeFile(script, fixture);
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(root, "native"), thinMacho());
  await writeFile(join(root, "resource"), "resource bytes\n");
  executable = await local(Artifact.executable(join(root, "native"), producer, "darwin-arm64"));
  resource = await local(Artifact.file(join(root, "resource"), producer));
  const base = await local(ChildProcessSpawner.ChildProcessSpawner);
  spawner = ChildProcessSpawner.make((command) => !ChildProcess.isStandardCommand(command) ? base.spawn(command) :
    base.spawn(ChildProcess.make(process.execPath, [script, configPath, ...command.args], command.options)));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const run = <A, E>(effect: Effect.Effect<A, E, Apple.Apple | NodeServices.NodeServices>) => Effect.runPromise(effect.pipe(
  Effect.provide(Apple.layer({ executable: tool })), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner), Effect.provide(NodeServices.layer),
));
const configure = async (changes: Partial<Config>) => { config = { ...config, ...changes }; await writeFile(configPath, JSON.stringify(config)); };
const calls = async (): Promise<readonly Invocation[]> => (await readFile(config.log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Invocation);
const appInput = (): Apple.AppBundleInput => ({ executable, outdir: join(root, "Fixture.app"), bundleIdentifier: "dev.effect-build.fixture", bundleName: "Fixture", version: "42", shortVersion: "1.2.3", executableName: "fixture", resources: [{ artifact: resource, path: "Guide.txt" }] });
const app = () => run(Apple.appBundle(appInput()));
const signedApp = async () => run(Apple.sign({ artifact: await app(), certificateSha1, outdir: join(root, "Signed.app") }));
const unsignedFile = async (product: "dmg" | "pkg") => {
  const path = join(root, `unsigned.${product}`);
  await writeFile(path, `unsigned-${product}`);
  const file = await local(Artifact.file(path, producer));
  return product === "dmg" ? { ...file, product: "dmg" as const } : { ...file, product: "pkg" as const };
};
const signedFile = async (product: "dmg" | "pkg") => {
  const source = await unsignedFile(product), outfile = join(root, `signed.${product}`);
  return product === "dmg" ? run(Apple.sign({ artifact: { ...source, product: "dmg" }, certificateSha1, outfile }))
    : run(Apple.sign({ artifact: { ...source, product: "pkg" }, certificateSha1, outfile }));
};
const accepted = async (artifact: Apple.Signed) => local(Apple.Notary.acceptedReference(await run(Apple.notarize({ artifact, credential }))));
const signedExecutable = (outfile?: string) => run(Apple.sign({ artifact: executable, certificateSha1, ...(outfile === undefined ? {} : { outfile }), entitlements: Bun.entitlements }));

describe("Apple products on real files", () => {
  it.each([true, false])("copies executable/resources and writes escaped plist values with atomic=%s", async (atomic) => {
    const result = await run(Apple.appBundle({ ...appInput(), atomic, displayName: `Tools & <Things> 'quoted'`, minimumSystemVersion: "13.0", resources: [
      { artifact: resource, path: "Guide.txt" }, { artifact: executable, path: "bin/helper" }, { artifact: executable, path: "data/helper", executable: false },
    ] }));
    expect(await readFile(join(result.path, "Contents/MacOS/fixture"))).toEqual(await readFile(executable.path));
    expect(await readFile(join(result.path, "Contents/Resources/Guide.txt"), "utf8")).toBe("resource bytes\n");
    const plist = await readFile(join(result.path, "Contents/Info.plist"), "utf8");
    expect(plist).toContain("Tools &amp; &lt;Things&gt;");
    for (const value of ["dev.effect-build.fixture", "1.2.3", "13.0", "APPL"]) expect(plist).toContain(`<string>${value}</string>`);
    if (process.platform !== "win32") {
      expect((await stat(join(result.path, "Contents/MacOS/fixture"))).mode & 0o777).toBe(0o755);
      expect((await stat(join(result.path, "Contents/Resources/Guide.txt"))).mode & 0o777).toBe(0o644);
      expect((await stat(join(result.path, "Contents/Resources/bin/helper"))).mode & 0o777).toBe(0o755);
      expect((await stat(join(result.path, "Contents/Resources/data/helper"))).mode & 0o777).toBe(0o644);
    }
    expect(await local(Artifact.verify(result))).toEqual(result);
    expect((await calls()).filter((call) => call.tool === "plutil")).toHaveLength(1);
  });

  it.each([["../escape"], ["/absolute"], ["C:/drive"], ["back\\slash"], ["same", "same"], ["Readme", "README"], ["Guide", "guide/readme"], ["café", "cafe\u0301/file"]])("rejects resource layout %j before producing an app", async (...paths) => {
    const failure = await run(Apple.appBundle({ ...appInput(), resources: paths.map((path) => ({ artifact: resource, path })) }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Apple.InputInvalid);
    expect(await readdir(root)).not.toContain("Fixture.app");
  });

  it.each(["executable", "resource"])("rejects changed %s bytes", async (changed) => {
    await writeFile(changed === "executable" ? executable.path : resource.path, "changed input");
    expect(await run(Apple.appBundle(appInput()).pipe(Effect.flip))).toMatchObject({ _tag: "ArtifactError", reason: "changed" });
    expect(await readdir(root)).not.toContain("Fixture.app");
  });

  it("signs nested code before the app, preserves framework symlinks, and commits only verified bytes", async () => {
    const original = await app(), framework = join(original.path, "Contents/Frameworks/Fixture.framework");
    await mkdir(join(framework, "Versions/A/Resources"), { recursive: true });
    await writeFile(join(framework, "Versions/A/Fixture"), "framework binary");
    await chmod(join(framework, "Versions/A/Fixture"), 0o755);
    if (process.platform !== "win32") {
      await symlink("A", join(framework, "Versions/Current"));
      await symlink("Versions/Current/Fixture", join(framework, "Fixture"));
    }
    const source = { ...original, ...await local(Artifact.directory(original.path, producer)) };
    await writeFile(join(root, "entitlements.plist"), '<?xml version="1.0"?><plist version="1.0"><dict/></plist>');
    const entitlements = await local(Artifact.file(join(root, "entitlements.plist"), producer));
    const outdir = join(root, "Signed.app");
    await configure({ guard: outdir });
    const result = await run(Apple.sign({ artifact: source, certificateSha1, outdir, entitlements, nestedCode: [{ path: "Contents/Frameworks/Fixture.framework", entitlements }] }));
    const commands = (await calls()).filter((call) => call.tool === "codesign");
    expect(commands.map((call) => call.args[0])).toEqual(["--force", "--force", "--verify"]);
    expect(commands[0]!.args.at(-1)).toContain("Fixture.framework");
    expect(basename(commands[1]!.args.at(-1)!)).toBe("Signed.app");
    expect(commands.every((call) => !call.guard)).toBe(true);
    expect(commands[0]!.args).toContain("runtime");
    expect(commands[1]!.args).toContain("--entitlements");
    expect(await local(Artifact.verify(source))).toEqual(source);
    expect(await local(Artifact.verify(result))).toEqual(result);
    expect(result.sha256).not.toBe(source.sha256);
    expect(await readFile(join(result.path, "Contents/_CodeSignature/CodeResources"), "utf8")).toBe("signed resources");
    if (process.platform !== "win32") {
      expect(await readlink(join(result.path, "Contents/Frameworks/Fixture.framework/Versions/Current"))).toBe("A");
      expect(await readlink(join(result.path, "Contents/Frameworks/Fixture.framework/Fixture"))).toBe("Versions/Current/Fixture");
      expect((await stat(join(result.path, "Contents/Frameworks/Fixture.framework/Versions/A/Fixture"))).mode & 0o777).toBe(0o755);
    }
  });

  it.each(["codesign.sign", "codesign.verify"])("preserves source and destination apps after %s fails", async (fail) => {
    const source = await app(), outdir = join(root, "Previous.app");
    await mkdir(outdir); await writeFile(join(outdir, "keep"), "previous app");
    const previous = await local(Artifact.directory(outdir, producer));
    await configure({ fail });
    const before = (await readdir(root)).sort();
    expect(await run(Apple.sign({ artifact: source, certificateSha1, outdir }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await local(Artifact.verify(previous))).toEqual(previous);
    expect(await local(Artifact.verify(source))).toEqual(source);
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it.each(["same", "different"])("signs directly into the %s app directory without stale entries", async (destination) => {
    const source = await app(), outdir = destination === "same" ? source.path : join(root, "Existing.app");
    if (destination === "different") { await mkdir(outdir); await writeFile(join(outdir, "stale"), "old output"); }
    const result = await run(Apple.sign({ artifact: source, certificateSha1, outdir, atomic: false }));
    expect(await readdir(result.path)).toEqual(["Contents"]);
    expect(await readFile(join(result.path, "Contents/MacOS/fixture"))).toEqual(await readFile(executable.path));
    expect(await local(Artifact.verify(result))).toEqual(result);
    if (destination === "different") expect(await local(Artifact.verify(source))).toEqual(source);
  });

  it("packages one signed app into a disk image and installer with the requested contents", async () => {
    const source = await signedApp();
    const dmg = await run(Apple.dmg({ artifact: source, outfile: join(root, "fixture.dmg"), volumeName: "Fixture", ...(process.platform === "win32" ? {} : { applicationsLink: true }), layout: [{ artifact: resource, path: "Extras/Guide.txt" }] }));
    const installer = await run(Apple.pkg({ artifact: source, outfile: join(root, "fixture.pkg"), identifier: "dev.effect-build.fixture", version: "1.2.3" }));
    const packed = JSON.parse(await readFile(dmg.path, "utf8")) as { readonly entries: readonly PackedEntry[] };
    expect(packed.entries.find((entry) => entry.path === "Extras/Guide.txt")?.contents).toBe(Buffer.from("resource bytes\n").toString("base64"));
    expect(packed.entries.some((entry) => entry.path === "Signed.app/Contents/MacOS/fixture")).toBe(true);
    if (process.platform !== "win32") expect(packed.entries.find((entry) => entry.path === "Applications")?.target).toBe("/Applications");
    const pkg = JSON.parse(await readFile(installer.path, "utf8")) as { readonly entries: readonly PackedEntry[] };
    expect(pkg.entries.find((entry) => entry.path === "Contents/MacOS/fixture")?.contents).toBe(Buffer.from(await readFile(executable.path)).toString("base64"));
    expect(await local(Artifact.verify(dmg))).toEqual(dmg);
    expect(await local(Artifact.verify(installer))).toEqual(installer);
    expect(await local(Artifact.verify(source))).toEqual(source);
  });

  it("packages a signed executable into an installer that lands in a bin directory", async () => {
    const source = await signedExecutable(join(root, "cli"));
    const installer = await run(Apple.pkg({ artifact: source, outfile: join(root, "cli.pkg"), identifier: "dev.effect-build.cli", version: "1.2.3" }));
    const packed = JSON.parse(await readFile(installer.path, "utf8")) as { readonly entries: readonly PackedEntry[]; readonly location: string };
    expect(packed.location).toBe("/usr/local/bin");
    expect(packed.entries.map((entry) => [entry.path, entry.kind])).toEqual([["cli", "file"]]);
    expect(packed.entries[0]!.contents).toBe(Buffer.from(await readFile(source.path)).toString("base64"));
    if (process.platform !== "win32") expect(packed.entries[0]!.mode).toBe(0o755);
    const build = (await calls()).find((call) => call.tool === "pkgbuild")!;
    expect(build.args[0]).toBe("--root");
    expect((await calls()).filter((call) => call.tool === "codesign" && call.args[0] === "--verify").map((call) => call.args.at(-1))).toContain(join(build.args[1]!, "cli"));
    const custom = await run(Apple.pkg({ artifact: source, outfile: join(root, "custom.pkg"), identifier: "dev.effect-build.cli", version: "1.2.3", installLocation: "/opt/cli/bin" }));
    expect((JSON.parse(await readFile(custom.path, "utf8")) as { readonly location: string }).location).toBe("/opt/cli/bin");
    expect(await local(Artifact.verify(installer))).toEqual(installer);
    expect(await local(Artifact.verify(source))).toEqual(source);
  });

  it.each(["hdiutil.create", "hdiutil.verify", "pkgbuild", "productbuild"])("preserves an existing package and removes staging after %s fails", async (fail) => {
    const source = await signedApp(), diskImage = fail.startsWith("hdiutil"), outfile = join(root, diskImage ? "previous.dmg" : "previous.pkg");
    await writeFile(outfile, "previous product"); await configure({ fail });
    const before = (await readdir(root)).sort();
    const operation = diskImage
      ? Apple.dmg({ artifact: source, outfile, volumeName: "Fixture" }).pipe(Effect.asVoid)
      : Apple.pkg({ artifact: source, outfile, identifier: "dev.effect-build.fixture", version: "1.2.3" }).pipe(Effect.asVoid);
    expect(await run(operation.pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous product");
    expect((await readdir(root)).sort()).toEqual(before);
  });

  it.each(["dmg", "pkg"] as const)("signs %s copies and hashes the modified bytes", async (product) => {
    const source = await unsignedFile(product), outfile = join(root, `signed.${product}`);
    const result = source.product === "dmg" ? await run(Apple.sign({ artifact: source, certificateSha1, outfile }))
      : await run(Apple.sign({ artifact: source, certificateSha1, outfile }));
    expect(await readFile(source.path, "utf8")).toBe(`unsigned-${product}`);
    expect(await readFile(result.path, "utf8")).toBe(`unsigned-${product}:signed`);
    expect(result.sha256).not.toBe(source.sha256);
    expect(await local(Artifact.verify(result))).toEqual(result);
  });
});

describe("Standalone Darwin executables", () => {
  it("signs a verified copy with the hardened runtime and Bun's entitlements, retaining the target", async () => {
    const original = await readFile(executable.path);
    const result = await signedExecutable(join(root, "signed-cli"));
    expect(result).toMatchObject({ kind: "executable", target: "darwin-arm64", format: "mach-o", path: join(root, "signed-cli") });
    expect(result.signature).toEqual({ certificateSha1, secureTimestamp: true, hardenedRuntime: true });
    expect(await readFile(result.path)).toEqual(Buffer.concat([original, Buffer.from(":signed")]));
    expect(result.sha256).not.toBe(executable.sha256);
    expect(await readFile(executable.path)).toEqual(original);
    expect(await local(Artifact.verify(result))).toEqual(result);
    expect(await local(Artifact.verify(executable))).toEqual(executable);
    if (process.platform !== "win32") expect((await stat(result.path)).mode & 0o777).toBe(0o755);
    const plist = (await calls()).find((call) => call.tool === "plutil")!.plist!;
    for (const key of Bun.entitlements) expect(plist).toContain(`<key>${key}</key>\n  <true/>`);
    const commands = (await calls()).filter((call) => call.tool === "codesign");
    expect(commands.map((call) => call.args[0])).toEqual(["--force", "--verify"]);
    expect(commands[0]!.args.slice(0, 7)).toEqual(["--force", "--sign", certificateSha1, "--timestamp", "--options", "runtime", "--entitlements"]);
    expect(commands[0]!.args.at(-1)).not.toBe(result.path);
    expect(commands[1]!.args).toEqual(["--verify", "--strict", commands[0]!.args.at(-1)]);
    expect(Schema.decodeUnknownSync(Apple.SignedExecutable)(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("signs in place by default with a plist artifact", async () => {
    await writeFile(join(root, "entitlements.plist"), '<?xml version="1.0"?><plist version="1.0"><dict/></plist>');
    const entitlements = await local(Artifact.file(join(root, "entitlements.plist"), producer));
    const result = await run(Apple.sign({ artifact: executable, certificateSha1, entitlements }));
    expect(result.path).toBe(executable.path);
    expect(await readFile(result.path)).toEqual(Buffer.concat([thinMacho(), Buffer.from(":signed")]));
    expect(await local(Artifact.verify(result))).toEqual(result);
    expect((await calls()).find((call) => call.tool === "plutil")!.plist).toContain("<dict/>");
  });

  it("rejects non-Darwin executables and malformed entitlement keys before signing", async () => {
    await writeFile(join(root, "linux"), elf());
    const linux = await local(Artifact.executable(join(root, "linux"), producer));
    expect(await run(Apple.sign({ artifact: linux, certificateSha1, outfile: join(root, "never") }).pipe(Effect.flip))).toBeInstanceOf(Apple.InputInvalid);
    for (const entitlements of [[], [""], ["a", "a"], [" com.apple.security.cs.allow-jit"], ["bad\0key"]]) {
      expect(await run(Apple.sign({ artifact: executable, certificateSha1, outfile: join(root, "never"), entitlements }).pipe(Effect.flip))).toBeInstanceOf(Apple.InputInvalid);
    }
    expect(await readdir(root)).not.toContain("never");
    expect(await readdir(root)).not.toContain("calls.jsonl");
  });

  it.each(["codesign.sign", "codesign.verify", "plutil"])("preserves the input and an existing output after %s fails", async (fail) => {
    const outfile = join(root, "previous-cli");
    await writeFile(outfile, "previous executable");
    await configure({ fail });
    const listing = async () => (await readdir(root)).filter((name) => name !== "calls.jsonl").sort();
    const before = await listing();
    expect(await run(Apple.sign({ artifact: executable, certificateSha1, outfile, entitlements: Bun.entitlements }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous executable");
    expect(await local(Artifact.verify(executable))).toEqual(executable);
    expect(await listing()).toEqual(before);
  });

  it("rejects a signed binary whose header no longer matches the input target", async () => {
    await configure({ corruptTarget: true });
    const failure = await run(Apple.sign({ artifact: executable, certificateSha1, outfile: join(root, "never") }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Executable.TargetMismatch);
    expect(await local(Artifact.verify(executable))).toEqual(executable);
    expect(await readdir(root)).not.toContain("never");
  });

  it("notarizes a signed executable as a ZIP and assesses the accepted bytes without stapling", async () => {
    const signed = await signedExecutable(join(root, "signed-cli"));
    const acceptance = await accepted(signed);
    expect(acceptance.kind).toBe("zip");
    expect(acceptance.artifact).toEqual(signed);
    const submit = (await calls()).find((call) => call.tool === "notarytool" && call.args[0] === "submit")!;
    expect(submit.args[1]).toMatch(/\.zip$/u);
    expect(submit.payloadSha).not.toBe(signed.sha256);
    await expect(stat(submit.args[1]!)).rejects.toMatchObject({ code: "ENOENT" });
    const encoded = Schema.encodeSync(Apple.Notary.AcceptedReference)(acceptance);
    expect(Schema.decodeUnknownSync(Apple.Notary.AcceptedReference)(JSON.parse(JSON.stringify(encoded)))).toEqual(acceptance);
    expect(await run(Apple.assess({ artifact: signed, acceptance }))).toBe(signed);
    const assess = (await calls()).find((call) => call.tool === "spctl")!;
    expect(assess.args.slice(0, 4)).toEqual(["--assess", "--type", "execute", "--verbose=4"]);
    expect((await calls()).some((call) => call.tool === "stapler")).toBe(false);
  });

  it("refuses to assess an executable whose acceptance names different bytes", async () => {
    const signed = await signedExecutable(join(root, "signed-cli"));
    const acceptance = await accepted(signed);
    const before = await calls();
    for (const artifact of [{ ...signed, bytes: signed.bytes + 1 }, { ...signed, sha256: "0".repeat(64) }]) {
      const wrong: Apple.Notary.AcceptedReference = { ...acceptance, artifact };
      expect(await run(Apple.assess({ artifact: signed, acceptance: wrong }).pipe(Effect.flip))).toBeInstanceOf(Apple.InputInvalid);
    }
    expect(await calls()).toEqual(before);
  });
});

describe("Apple notarization and stapling", () => {
  it("submits once, waits separately, and persists a reference usable after the original file is gone", async () => {
    const source = await signedFile("dmg");
    await configure({ submit: { id: submissionId.toUpperCase(), status: "Accepted", message: `uploaded with ${password}` } });
    const submission = await run(Apple.notarize({ artifact: source, credential, timeout: "5m" }));
    expect(submission.submissionId).toBe(submissionId);
    expect(JSON.stringify(submission)).not.toContain(password);
    const encoded = Schema.encodeSync(Apple.Notary.SubmissionReference)(submission);
    const reference = Schema.decodeUnknownSync(Apple.Notary.SubmissionReference)(JSON.parse(JSON.stringify(encoded)));
    await rm(source.path);
    const info = await run(Apple.Notary.info({ reference, credential }));
    const log = await run(Apple.Notary.log({ reference, credential }));
    expect(info.submissionId).toBe(submissionId);
    expect(log.issues).toEqual([]);
    expect((await local(Apple.Notary.acceptedReference(info))).artifact).toEqual(source);
    const submits = (await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "submit");
    expect(submits).toHaveLength(1);
    expect(submits[0]!.args).not.toContain("--wait");
    const waits = (await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "wait");
    expect(waits).toHaveLength(1);
    expect(waits[0]!.args).toContain("5m");
    expect(submits[0]!.payloadSha).toBe(source.sha256);
  });

  it("persists an upload reference before waiting and recovers from a failed wait without resubmitting", async () => {
    const source = await signedFile("pkg");
    await configure({ submit: { id: submissionId, message: "Upload complete" } });
    const submitted = await run(Apple.Notary.submit({ artifact: source, credential }));
    expect((await calls()).filter((call) => call.tool === "notarytool").map((call) => call.args[0])).toEqual(["submit"]);
    const path = join(root, "submission.json");
    await writeFile(path, JSON.stringify(Schema.encodeSync(Apple.Notary.SubmissionReference)(submitted)));
    await rm(source.path);
    const reference = Schema.decodeUnknownSync(Apple.Notary.SubmissionReference)(JSON.parse(await readFile(path, "utf8")));
    await configure({ fail: "notarytool.wait" });
    expect(await run(Apple.Notary.wait({ reference, credential, timeout: "1s" }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    await configure({ fail: "none", wait: { id: submissionId, status: "Accepted" } });
    expect((await run(Apple.Notary.wait({ reference, credential }))).status._tag).toBe("Accepted");
    const notaryCalls = (await calls()).filter((call) => call.tool === "notarytool");
    expect(notaryCalls.map((call) => call.args[0])).toEqual(["submit", "wait", "wait"]);
    expect(notaryCalls[0]!.args).not.toContain("--wait");
  });

  it("keeps an interrupted wait as interruption and resumes from the persisted ID", async () => {
    const source = await signedFile("pkg"), reference = await run(Apple.Notary.submit({ artifact: source, credential }));
    await configure({ waitForAbort: true });
    const controller = new AbortController();
    const waiting = Effect.runPromiseExit(Apple.Notary.wait({ reference, credential }).pipe(
      Effect.provide(Apple.layer({ executable: tool })), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner), Effect.provide(NodeServices.layer),
    ), { signal: controller.signal });
    try {
      await expect.poll(async () => (await calls()).filter((call) => call.tool === "notarytool").map((call) => call.args[0])).toEqual(["submit", "wait"]);
    } finally { controller.abort(); }
    const exit = await waiting;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    await configure({ waitForAbort: false });
    expect((await run(Apple.Notary.wait({ reference, credential }))).status._tag).toBe("Accepted");
    expect((await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "submit")).toHaveLength(1);
  });

  it.each(["Invalid", "Rejected", "In Progress"])("retains native status %s and refuses acceptance", async (status) => {
    const source = await signedFile("dmg"); await configure({ submit: { id: submissionId, status } });
    const submission = await run(Apple.notarize({ artifact: source, credential }));
    expect(submission.status.providerStatus).toBe(status);
    expect(await local(Apple.Notary.acceptedReference(submission).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResultNotAccepted);
  });

  it("uploads the verified private snapshot when the original changes during native verification", async () => {
    const source = await signedFile("dmg");
    await configure({ mutateDuringVerify: source.path });
    const submission = await run(Apple.notarize({ artifact: source, credential }));
    const uploaded = (await calls()).find((call) => call.tool === "notarytool" && call.args[0] === "submit")!;
    expect(uploaded.args[1]).not.toBe(source.path);
    expect(uploaded.payloadSha).toBe(source.sha256);
    expect(submission.artifact).toEqual(source);
    expect(await readFile(source.path, "utf8")).toBe("changed original");
    await expect(stat(uploaded.args[1]!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects malformed responses, mismatched UUIDs and transport failure without retrying submit", async () => {
    const source = await signedFile("dmg");
    await configure({ rawResponse: "{not JSON" });
    expect(await run(Apple.notarize({ artifact: source, credential }).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResponseInvalid);
    expect((await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "submit")).toHaveLength(1);
    await configure({ rawResponse: JSON.stringify({ id: "not-a-uuid", status: "Accepted" }) });
    expect(await run(Apple.notarize({ artifact: source, credential }).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResponseInvalid);
    await configure({ rawResponse: JSON.stringify({ id: submissionId, status: "Accepted" }) });
    const reference = await accepted(source);
    await configure({ rawResponse: JSON.stringify({ id: "d53e8e0e-1ca7-4fc4-a587-17347c6023af", status: "Accepted" }) });
    expect(await run(Apple.Notary.info({ reference, credential }).pipe(Effect.flip))).toBeInstanceOf(Apple.Notary.ResponseInvalid);
    await configure({ fail: "notarytool.submit" });
    const count = (await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "submit").length;
    const failure = await run(Apple.notarize({ artifact: source, credential }).pipe(Effect.flip));
    expect(failure).toBeInstanceOf(Tool.Failed);
    expect(JSON.stringify(failure)).not.toContain(password);
    if (failure instanceof Tool.Failed) { expect(failure.args).toContain("<redacted>"); expect(failure.stderr).toContain("<redacted>"); }
    expect((await calls()).filter((call) => call.tool === "notarytool" && call.args[0] === "submit")).toHaveLength(count + 1);
  });

  it("decodes nullable log issues and preserves issue diagnostics through JSON", async () => {
    const reference = await accepted(await signedFile("pkg"));
    expect((await run(Apple.Notary.log({ reference, credential }))).issues).toEqual([]);
    await configure({ logResponse: { jobId: submissionId.toUpperCase(), status: "Invalid", statusCode: 4000, statusSummary: "Invalid signature", issues: [{ severity: "error", message: `problem ${password}`, path: "Fixture.app", architecture: "arm64", code: 123 }] } });
    const log = await run(Apple.Notary.log({ reference, credential }));
    expect(log.issues[0]).toMatchObject({ code: "123", architecture: "arm64", path: "Fixture.app" });
    expect(log.status.providerStatus).toBe("Invalid");
    expect(JSON.stringify(log)).not.toContain(password);
    expect(Schema.decodeUnknownSync(Apple.Notary.Log)(JSON.parse(JSON.stringify(Schema.encodeSync(Apple.Notary.Log)(log))))).toEqual(log);
  });

  it("submits an app ZIP while retaining the original signed directory in the reference", async () => {
    const source = await signedApp(), reference = await accepted(source);
    expect(reference.kind).toBe("zip");
    expect(reference.artifact).toEqual(source);
    const submit = (await calls()).find((call) => call.tool === "notarytool" && call.args[0] === "submit")!;
    expect(submit.args[1]).toMatch(/\.zip$/u);
    expect(submit.payloadSha).not.toBe(source.sha256);
    await expect(stat(submit.args[1]!)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await local(Artifact.verify(source))).toEqual(source);
  });

  it.each(["app", "dmg", "pkg"] as const)("staples a relocated %s and assesses its new hash while retaining the original accepted artifact", async (product) => {
    const source = product === "app" ? await signedApp() : await signedFile(product);
    const acceptance = await accepted(source), relocatedPath = join(root, `Relocated.${product}`);
    if (source.kind === "directory") await cp(source.path, relocatedPath, { recursive: true, verbatimSymlinks: true }); else await copyFile(source.path, relocatedPath);
    await rm(source.path, { recursive: true });
    const relocated = { ...source, path: relocatedPath };
    const stapled = relocated.product === "app"
      ? await run(Apple.staple({ artifact: relocated, acceptance, outdir: join(root, "Stapled.app") }))
      : await run(Apple.staple({ artifact: relocated, acceptance, outfile: join(root, `stapled.${product}`) }));
    expect(stapled.sha256).not.toBe(source.sha256);
    expect(stapled.ticket.artifact).toEqual(source);
    expect(await local(Artifact.verify(stapled))).toEqual(stapled);
    expect(await run(Apple.assess({ artifact: stapled }))).toBe(stapled);
    expect(await local(Artifact.verify(relocated))).toEqual(relocated);
    const assess = (await calls()).find((call) => call.tool === "spctl")!;
    expect(assess.args[assess.args.indexOf("--type") + 1]).toBe(product === "app" ? "execute" : product === "dmg" ? "open" : "install");
    if (product === "dmg") expect(assess.args).toContain("context:primary-signature");
  });

  it("rejects mismatched accepted product, size, or digest before invoking stapler", async () => {
    const source = await signedFile("dmg"), acceptance = await accepted(source), before = await calls();
    for (const artifact of [{ ...source, product: "pkg" as const }, { ...source, bytes: source.bytes + 1 }, { ...source, sha256: "0".repeat(64) }]) {
      const wrong: Apple.Notary.AcceptedReference = { ...acceptance, artifact };
      expect(await run(Apple.staple({ artifact: source, acceptance: wrong, outfile: join(root, "never.dmg") }).pipe(Effect.flip))).toBeInstanceOf(Apple.InputInvalid);
    }
    expect(await calls()).toEqual(before);
    expect(await readdir(root)).not.toContain("never.dmg");
  });

  it.each(["stapler.staple", "stapler.validate"])("preserves existing bytes after %s fails", async (fail) => {
    const source = await signedFile("dmg"), acceptance = await accepted(source), outfile = join(root, "previous.dmg");
    await writeFile(outfile, "previous bytes"); await configure({ fail });
    const before = (await readdir(root)).sort();
    expect(await run(Apple.staple({ artifact: source, acceptance, outfile }).pipe(Effect.flip))).toBeInstanceOf(Tool.Failed);
    expect(await readFile(outfile, "utf8")).toBe("previous bytes");
    expect(await local(Artifact.verify(source))).toEqual(source);
    expect((await readdir(root)).sort()).toEqual(before);
  });
});
