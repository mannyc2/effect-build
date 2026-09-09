import { Crypto, Effect, Encoding, FileSystem, Path, Stream } from "effect";
import { Artifact, Commit, Target } from "effect-build";
import packageMetadata from "../package.json" with { type: "json" };
import { InputInvalid } from "./InputInvalid.js";
import { encodeZip, type Entry, utf8Order, zipLimit } from "./internal/zip.js";

export interface WheelMetadata {
  readonly name: string;
  readonly version: string;
  readonly summary?: string | undefined;
  readonly license?: string | undefined;
  readonly requiresPython?: string | undefined;
  readonly projectUrls?: Readonly<Record<string, string>> | undefined;
}
export interface WheelTags { readonly python: string; readonly abi: string; readonly platform: string; }
export interface WheelEntry { readonly artifact: Artifact.Regular; readonly path: string; readonly executable?: boolean; }
export type EntryPointGroups = Readonly<Record<string, Readonly<Record<string, string>>>>;
export interface WheelInput extends Commit.ProducerOptions {
  readonly metadata: WheelMetadata;
  readonly tags: WheelTags;
  readonly entries: readonly WheelEntry[];
  readonly outdir: string;
  readonly cwd?: string | undefined;
  readonly rootIsPurelib?: boolean | undefined;
  readonly entryPoints?: EntryPointGroups | undefined;
}

const encoder = new TextEncoder();
const reject = (reason: string): never => { throw new InputInvalid({ reason }); };
const number = (input: string | undefined): string => (input ?? "0").replace(/^0+(?=\d)/u, "");
// PEP 440 accepts spelling/separator variants; normalize numbers as strings to preserve arbitrary precision.
const versionPattern = /^v?(?:(?<epoch>[0-9]+)!)?(?<release>[0-9]+(?:\.[0-9]+)*)(?:[-_.]?(?<pre>alpha|beta|preview|pre|rc|a|b|c)[-_.]?(?<preN>[0-9]+)?)?(?:-(?<postShort>[0-9]+)|[-_.]?(?<post>post|rev|r)[-_.]?(?<postN>[0-9]+)?)?(?:[-_.]?(?<dev>dev)[-_.]?(?<devN>[0-9]+)?)?(?:\+(?<local>[a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/iu;
const normalizeVersion = (input: string): string => {
  const g = versionPattern.exec(input.trim())?.groups;
  if (g?.release === undefined) return reject("version must follow PEP 440");
  const pre = g.pre?.toLowerCase();
  const label = pre === "alpha" ? "a" : pre === "beta" ? "b" : pre !== undefined && ["c", "pre", "preview"].includes(pre) ? "rc" : pre;
  const local = g.local?.toLowerCase().split(/[-_.]/u).map((part) => /^[0-9]+$/u.test(part) ? number(part) : part).join(".");
  return `${number(g.epoch) === "0" ? "" : `${number(g.epoch)}!`}${g.release.split(".").map(number).join(".")}`
    + (label === undefined ? "" : `${label}${number(g.preN)}`)
    + (g.post === undefined && g.postShort === undefined ? "" : `.post${number(g.postN ?? g.postShort)}`)
    + (g.dev === undefined ? "" : `.dev${number(g.devN)}`) + (local === undefined ? "" : `+${local}`);
};
const singleLine = (input: string, field: string): string =>
  input.trim().length === 0 || input.includes("\0") || /[\r\n]/u.test(input) ? reject(`${field} must be a non-empty single line`) : input;
const tag = (input: string): string => /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/iu.test(input)
  ? [...new Set(input.toLowerCase().split("."))].sort(utf8Order).join(".") : reject("tags must contain dot-separated letters, numbers, or underscores");
const csv = (input: string): string => /[,"\r\n]/u.test(input) ? `"${input.replaceAll('"', '""')}"` : input;
const hexBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));

// Every advertised platform must be able to execute every embedded native artifact.
// OS deployment/libc version floors remain the caller's responsibility.
const matchesPlatform = (artifact: Artifact.Executable, platform: string): boolean => {
  const { os, arch, abi } = Target.parts(artifact.target);
  const machine = arch === "x64" ? "x86_64" : "aarch64";
  if (os === "windows") return platform === (arch === "x64" ? "win_amd64" : "win_arm64");
  if (os === "darwin") return new RegExp(`^macosx_[0-9]+_[0-9]+_${arch === "x64" ? "x86_64" : "arm64"}$`).test(platform);
  if (platform === `linux_${machine}`) return true;
  if (new RegExp(`^musllinux_[0-9]+_[0-9]+_${machine}$`).test(platform)) return abi === "musl";
  if (new RegExp(`^manylinux(?:1|2010|2014|_[0-9]+_[0-9]+)_${machine}$`).test(platform)) return abi === "gnu";
  return false;
};

interface Generated {
  readonly path: string;
  readonly contents: Uint8Array;
}
const metadataEntries = (input: WheelInput) => {
  const m = input.metadata;
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu.test(m.name)) reject("name must be a Python distribution name");
  if (input.outdir.length === 0 || input.entries.length === 0) reject("outdir and entries must be non-empty");
  const name = m.name.toLowerCase().replace(/[-_.]+/gu, "_"), version = normalizeVersion(m.version);
  const tags = { python: tag(input.tags.python), abi: tag(input.tags.abi), platform: tag(input.tags.platform) };
  for (const entry of input.entries) {
    if (entry.artifact.kind !== "executable") continue;
    for (const platform of tags.platform.split(".")) {
      if (!matchesPlatform(entry.artifact, platform)) reject(`wheel platform ${platform} does not support executable ${entry.path} (${entry.artifact.target})`);
    }
  }
  const stem = `${name}-${version}`, info = `${stem}.dist-info`;
  const metadata = [`Metadata-Version: 2.1`, `Name: ${m.name}`, `Version: ${version}`];
  for (const [key, value] of [["Summary", m.summary], ["License", m.license], ["Requires-Python", m.requiresPython]] as const) {
    if (value !== undefined) metadata.push(`${key}: ${singleLine(value, key)}`);
  }
  for (const [label, url] of Object.entries(m.projectUrls ?? {}).sort(([a], [b]) => utf8Order(a, b))) {
    if ([...label].length > 32 || label.includes(",") || !URL.canParse(url)) reject("projectUrls require labels up to 32 characters and absolute URLs");
    metadata.push(`Project-URL: ${singleLine(label, "project URL label")}, ${singleLine(url, "project URL")}`);
  }
  const triples = tags.python.split(".").flatMap((py) => tags.abi.split(".").flatMap((abi) => tags.platform.split(".").map((platform) => `${py}-${abi}-${platform}`)));
  const pure = input.rootIsPurelib ?? (tags.abi === "none" && tags.platform === "any");
  const generated: Generated[] = [
    { path: `${info}/METADATA`, contents: encoder.encode(`${metadata.join("\n")}\n\n`) },
    { path: `${info}/WHEEL`, contents: encoder.encode(`Wheel-Version: 1.0\nGenerator: ${packageMetadata.name} ${packageMetadata.version}\nRoot-Is-Purelib: ${pure}\n${triples.map((value) => `Tag: ${value}\n`).join("")}\n`) },
  ];
  if (input.entryPoints !== undefined) {
    const groups: string[] = [];
    for (const [group, points] of Object.entries(input.entryPoints).sort(([a], [b]) => utf8Order(a, b))) {
      if (!/^\w+(?:\.\w+)*$/u.test(group)) reject("entry-point groups must be dotted identifiers");
      groups.push(`[${group}]`);
      for (const [key, value] of Object.entries(points).sort(([a], [b]) => utf8Order(a, b))) {
        if (!/^[\w.-]+$/u.test(key) || !/^[_\p{ID_Start}][\p{ID_Continue}]*(?:\.[_\p{ID_Start}][\p{ID_Continue}]*)*(?::[_\p{ID_Start}][\p{ID_Continue}]*(?:\.[_\p{ID_Start}][\p{ID_Continue}]*)*)?$/u.test(value)) reject("entry points require a name and Python object reference");
        groups.push(`${key} = ${value}`);
      }
      groups.push("");
    }
    generated.push({ path: `${info}/entry_points.txt`, contents: encoder.encode(`${groups.join("\n")}\n`) });
  }
  const paths = new Set<string>();
  for (const entry of input.entries) {
    const parts = entry.path.split("/"), folded = entry.path.normalize("NFC").toLowerCase();
    if (/\p{Cc}/u.test(entry.path) || entry.path.includes("\\") || /^[a-z]:/iu.test(entry.path) || parts.some((part) => ["", ".", ".."].includes(part))) reject(`invalid wheel entry path: ${entry.path}`);
    if (parts[0]!.toLowerCase().endsWith(".dist-info")) reject("the wheel writer owns .dist-info entries");
    if (paths.has(folded)) reject(`duplicate, case, or Unicode collision: ${entry.path}`);
    paths.add(folded);
  }
  for (const path of paths) {
    const parts = path.split("/");
    for (let length = 1; length < parts.length; length++) if (paths.has(parts.slice(0, length).join("/"))) reject(`file used as a directory: ${path}`);
  }
  return { metadata: generated, record: `${info}/RECORD`, filename: `${stem}-${tags.python}-${tags.abi}-${tags.platform}.whl` };
};

export const wheel = Effect.fn("Python.wheel")((input: WheelInput): Effect.Effect<
  Artifact.File, InputInvalid | Artifact.ArtifactError | Commit.CommitError,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto
> => Effect.gen(function*() {
  const prepared = yield* Effect.try({ try: () => metadataEntries(input), catch: (error) => error instanceof InputInvalid ? error : new InputInvalid({ reason: String(error) }) });
  const fs = yield* FileSystem.FileSystem, p = yield* Path.Path, crypto = yield* Crypto.Crypto;
  const entries: Entry[] = [];
  const records: { readonly path: string; readonly line: string }[] = [];
  for (const entry of prepared.metadata) {
    const digest = yield* crypto.digest("SHA-256", entry.contents).pipe(Effect.orDie);
    entries.push({ path: entry.path, mode: 0o644, bytes: entry.contents.byteLength, contents: Stream.make(entry.contents) });
    records.push({ path: entry.path, line: `${csv(entry.path)},sha256=${Encoding.encodeBase64Url(digest)},${entry.contents.byteLength}` });
  }
  for (const entry of input.entries) {
    // The verified stream fails unless the wheel receives exactly the recorded bytes, so RECORD can cite the recorded digest.
    entries.push({ path: entry.path, mode: (entry.executable ?? entry.artifact.kind === "executable") ? 0o755 : 0o644, bytes: entry.artifact.bytes, contents: Artifact.streamVerified(entry.artifact) });
    records.push({ path: entry.path, line: `${csv(entry.path)},sha256=${Encoding.encodeBase64Url(hexBytes(entry.artifact.sha256))},${entry.artifact.bytes}` });
  }
  const record = encoder.encode(`${records.sort((a, b) => utf8Order(a.path, b.path)).map((entry) => entry.line).join("\n")}\n${csv(prepared.record)},,\n`);
  entries.push({ path: prepared.record, mode: 0o644, bytes: record.byteLength, contents: Stream.make(record) });
  const limit = zipLimit(entries);
  if (limit !== undefined) return yield* limit;
  const outfile = p.resolve(input.cwd ?? "", input.outdir, prepared.filename);
  const produce = (path: string) => Effect.gen(function*() {
    const failure = (error: unknown) => new Artifact.ArtifactError({ path, reason: "unreadable", detail: String(error) });
    yield* Effect.scoped(Effect.gen(function*() {
      const file = yield* fs.open(path, { flag: "w" }).pipe(Effect.mapError(failure));
      yield* encodeZip(entries, (chunk) => file.writeAll(chunk).pipe(Effect.mapError(failure)));
    }));
    return yield* Artifact.file(path, { name: packageMetadata.name, version: packageMetadata.version });
  });
  return yield* Commit.output(outfile, produce, input);
}));
