import { Crypto, Effect, Encoding, FileSystem, Path, Stream } from "effect";
import { Artifact, Commit, Layout, Target } from "effect-build";
import { type EntrySizeMismatch, type FormatLimit, Zip } from "effect-build-archives";
import packageMetadata from "../package.json" with { type: "json" };
import { InputInvalid } from "./InputInvalid.js";

export interface WheelMetadata {
  readonly name: string;
  readonly version: string;
  readonly summary?: string | undefined;
  readonly license?: string | undefined;
  readonly requiresPython?: string | undefined;
  readonly projectUrls?: Readonly<Record<string, string>> | undefined;
}
export interface WheelTags {
  readonly python: string;
  readonly abi: string;
  readonly platform: string;
}
export interface WheelEntry {
  readonly artifact: Artifact.Regular;
  readonly path: string;
  readonly executable?: boolean | undefined;
}
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
const utf8Order = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.byteLength, b.byteLength); index++) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) return delta;
  }
  return a.byteLength - b.byteLength;
};
const number = (input: string | undefined): string => (input ?? "0").replace(/^0+(?=\d)/u, "");
// PEP 440 accepts spelling/separator variants; normalize numbers as strings to preserve arbitrary precision.
const versionPattern =
  /^v?(?:(?<epoch>[0-9]+)!)?(?<release>[0-9]+(?:\.[0-9]+)*)(?:[-_.]?(?<pre>alpha|beta|preview|pre|rc|a|b|c)[-_.]?(?<preN>[0-9]+)?)?(?:-(?<postShort>[0-9]+)|[-_.]?(?<post>post|rev|r)[-_.]?(?<postN>[0-9]+)?)?(?:[-_.]?(?<dev>dev)[-_.]?(?<devN>[0-9]+)?)?(?:\+(?<local>[a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/iu;
const normalizeVersion = (input: string) =>
  Effect.gen(function*() {
    const g = versionPattern.exec(input.trim())?.groups;
    if (g?.release === undefined) return yield* new InputInvalid({ reason: "version must follow PEP 440" });
    const pre = g.pre?.toLowerCase();
    const label = pre === "alpha"
      ? "a"
      : pre === "beta"
      ? "b"
      : pre !== undefined && ["c", "pre", "preview"].includes(pre)
      ? "rc"
      : pre;
    const local = g.local?.toLowerCase().split(/[-_.]/u).map((part) => /^[0-9]+$/u.test(part) ? number(part) : part)
      .join(".");
    return `${number(g.epoch) === "0" ? "" : `${number(g.epoch)}!`}${g.release.split(".").map(number).join(".")}`
      + (label === undefined ? "" : `${label}${number(g.preN)}`)
      + (g.post === undefined && g.postShort === undefined ? "" : `.post${number(g.postN ?? g.postShort)}`)
      + (g.dev === undefined ? "" : `.dev${number(g.devN)}`) + (local === undefined ? "" : `+${local}`);
  });
const singleLine = (input: string, field: string): Effect.Effect<string, InputInvalid> =>
  input.trim().length === 0 || input.includes("\0") || /[\r\n]/u.test(input)
    ? Effect.fail(new InputInvalid({ reason: `${field} must be a non-empty single line` }))
    : Effect.succeed(input);
const tag = (input: string): Effect.Effect<string, InputInvalid> =>
  /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/iu.test(input)
    ? Effect.succeed([...new Set(input.toLowerCase().split("."))].sort(utf8Order).join("."))
    : Effect.fail(new InputInvalid({ reason: "tags must contain dot-separated letters, numbers, or underscores" }));
const csv = (input: string): string => /[,"\r\n]/u.test(input) ? `"${input.replaceAll('"', '""')}"` : input;
const hexBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));

/** Support a compiled executable promises: Windows tags carry no version floor;
 * Linux and macOS floors are the caller's declaration, never inferred. */
export type PlatformSupport =
  | { readonly target: Extract<Target.Target, `windows-${string}`> }
  | {
    readonly target: Extract<Target.Target, `darwin-${string}`>;
    readonly macos: readonly [major: number, minor: number];
  }
  | {
    readonly target: Exclude<Extract<Target.Target, `linux-${string}`>, `${string}-musl`>;
    readonly glibc: readonly [major: number, minor: number];
  }
  | {
    readonly target: Extract<Target.Target, `${string}-musl`>;
    readonly musl: readonly [major: number, minor: number];
  };

/** The PEP 425/600/656 platform tag naming exactly the declared support. */
export const platformTag = (support: PlatformSupport): string => {
  switch (support.target) {
    case "windows-x64":
      return "win_amd64";
    case "windows-arm64":
      return "win_arm64";
    case "darwin-x64":
      return `macosx_${support.macos[0]}_${support.macos[1]}_x86_64`;
    case "darwin-arm64":
      return `macosx_${support.macos[0]}_${support.macos[1]}_arm64`;
    case "linux-x64":
      return `manylinux_${support.glibc[0]}_${support.glibc[1]}_x86_64`;
    case "linux-arm64":
      return `manylinux_${support.glibc[0]}_${support.glibc[1]}_aarch64`;
    case "linux-x64-musl":
      return `musllinux_${support.musl[0]}_${support.musl[1]}_x86_64`;
    case "linux-arm64-musl":
      return `musllinux_${support.musl[0]}_${support.musl[1]}_aarch64`;
  }
};

/** Tags for a wheel that ships a compiled command: any Python 3, no Python ABI, one platform. */
export const executableTags = (support: PlatformSupport): WheelTags => ({
  python: "py3",
  abi: "none",
  platform: platformTag(support),
});

// Every advertised platform must be able to execute every embedded native artifact.
// OS deployment/libc version floors remain the caller's responsibility, declared
// through platformTag or spelled out by hand.
const matchesPlatform = (artifact: Artifact.Executable, platform: string): boolean => {
  const { os, arch, abi } = Target.parts(artifact.target);
  const machine = arch === "x64" ? "x86_64" : "aarch64";
  if (os === "windows") return platform === (arch === "x64" ? "win_amd64" : "win_arm64");
  if (os === "darwin") {
    return new RegExp(`^macosx_[0-9]+_[0-9]+_${arch === "x64" ? "x86_64" : "arm64"}$`).test(platform);
  }
  if (platform === `linux_${machine}`) return true;
  if (new RegExp(`^musllinux_[0-9]+_[0-9]+_${machine}$`).test(platform)) return abi === "musl";
  if (new RegExp(`^manylinux(?:1|2010|2014|_[0-9]+_[0-9]+)_${machine}$`).test(platform)) return abi === "gnu";
  return false;
};

interface Generated {
  readonly path: string;
  readonly contents: Uint8Array;
}
/** Validate provider inputs and prepare the wheel-owned filenames and metadata before touching output. */
const prepareWheel = (input: WheelInput) =>
  Effect.gen(function*() {
    const m = input.metadata;
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/iu.test(m.name)) {
      return yield* new InputInvalid({ reason: "name must be a Python distribution name" });
    }
    if (
      input.outdir.length === 0 || input.outdir.includes("\0") || (input.cwd !== undefined && input.cwd.includes("\0"))
      || input.entries.length === 0
    ) {
      return yield* new InputInvalid({ reason: "outdir and entries must be non-empty; paths must contain no NUL" });
    }
    const name = m.name.toLowerCase().replace(/[-_.]+/gu, "_");
    const version = yield* normalizeVersion(m.version);
    const tags = {
      python: yield* tag(input.tags.python),
      abi: yield* tag(input.tags.abi),
      platform: yield* tag(input.tags.platform),
    };
    for (const entry of input.entries) {
      if (entry.artifact.kind !== "executable") continue;
      for (const platform of tags.platform.split(".")) {
        if (!matchesPlatform(entry.artifact, platform)) {
          return yield* new InputInvalid({
            reason: `wheel platform ${platform} does not support executable ${entry.path} (${entry.artifact.target})`,
          });
        }
      }
    }
    const stem = `${name}-${version}`;
    const info = `${stem}.dist-info`;
    const metadata = [`Metadata-Version: 2.1`, `Name: ${m.name}`, `Version: ${version}`];
    for (
      const [key, value] of [["Summary", m.summary], ["License", m.license], [
        "Requires-Python",
        m.requiresPython,
      ]] as const
    ) {
      if (value !== undefined) metadata.push(`${key}: ${yield* singleLine(value, key)}`);
    }
    for (const [label, url] of Object.entries(m.projectUrls ?? {}).sort(([a], [b]) => utf8Order(a, b))) {
      if ([...label].length > 32 || label.includes(",") || !URL.canParse(url)) {
        return yield* new InputInvalid({ reason: "projectUrls require labels up to 32 characters and absolute URLs" });
      }
      metadata.push(
        `Project-URL: ${yield* singleLine(label, "project URL label")}, ${yield* singleLine(url, "project URL")}`,
      );
    }
    const triples = tags.python.split(".").flatMap((py) =>
      tags.abi.split(".").flatMap((abi) => tags.platform.split(".").map((platform) => `${py}-${abi}-${platform}`))
    );
    const pure = input.rootIsPurelib ?? (tags.abi === "none" && tags.platform === "any");
    const generated: Generated[] = [
      { path: `${info}/METADATA`, contents: encoder.encode(`${metadata.join("\n")}\n\n`) },
      {
        path: `${info}/WHEEL`,
        contents: encoder.encode(
          `Wheel-Version: 1.0\nGenerator: ${packageMetadata.name} ${packageMetadata.version}\nRoot-Is-Purelib: ${pure}\n${
            triples.map((value) => `Tag: ${value}\n`).join("")
          }\n`,
        ),
      },
    ];
    if (input.entryPoints !== undefined) {
      const groups: string[] = [];
      for (const [group, points] of Object.entries(input.entryPoints).sort(([a], [b]) => utf8Order(a, b))) {
        if (!/^\w+(?:\.\w+)*$/u.test(group)) {
          return yield* new InputInvalid({ reason: "entry-point groups must be dotted identifiers" });
        }
        groups.push(`[${group}]`);
        for (const [key, value] of Object.entries(points).sort(([a], [b]) => utf8Order(a, b))) {
          if (
            !/^[\w.-]+$/u.test(key)
            || !/^[_\p{ID_Start}][\p{ID_Continue}]*(?:\.[_\p{ID_Start}][\p{ID_Continue}]*)*(?::[_\p{ID_Start}][\p{ID_Continue}]*(?:\.[_\p{ID_Start}][\p{ID_Continue}]*)*)?$/u
              .test(value)
          ) return yield* new InputInvalid({ reason: "entry points require a name and Python object reference" });
          groups.push(`${key} = ${value}`);
        }
        groups.push("");
      }
      generated.push({ path: `${info}/entry_points.txt`, contents: encoder.encode(`${groups.join("\n")}\n`) });
    }
    for (const entry of input.entries) {
      if (/\p{Cc}/u.test(entry.path)) {
        return yield* new InputInvalid({
          reason: `control characters are forbidden in wheel entry paths: ${entry.path}`,
        });
      }
      if (entry.path.split("/")[0]!.toLowerCase().endsWith(".dist-info")) {
        return yield* new InputInvalid({ reason: "the wheel writer owns .dist-info entries" });
      }
    }
    const issue = Layout.validate(input.entries.map((entry) => ({ path: entry.path, kind: "file" })));
    if (issue !== undefined) return yield* new InputInvalid({ reason: `${issue.reason}: ${issue.path}` });
    return {
      metadata: generated,
      record: `${info}/RECORD`,
      filename: `${stem}-${tags.python}-${tags.abi}-${tags.platform}.whl`,
    };
  });

type Fs = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
export type WheelError = InputInvalid | FormatLimit | EntrySizeMismatch | Artifact.ArtifactError | Commit.CommitError;

export const wheel = Effect.fn("Python.wheel")((input: WheelInput): Effect.Effect<Artifact.File, WheelError, Fs> =>
  Effect.gen(function*() {
    const prepared = yield* prepareWheel(input);
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const entries: Zip.FileEntry<Artifact.ArtifactError, Fs>[] = [];
    const records: { readonly path: string; readonly line: string }[] = [];
    for (const entry of prepared.metadata) {
      const digest = yield* crypto.digest("SHA-256", entry.contents).pipe(Effect.orDie);
      entries.push({
        kind: "file",
        path: entry.path,
        mode: 0o644,
        bytes: entry.contents.byteLength,
        contents: Stream.make(entry.contents),
      });
      records.push({
        path: entry.path,
        line: `${csv(entry.path)},sha256=${Encoding.encodeBase64Url(digest)},${entry.contents.byteLength}`,
      });
    }
    for (const entry of input.entries) {
      // The verified stream fails unless the wheel receives exactly the recorded bytes, so RECORD can cite the recorded digest.
      entries.push({
        kind: "file",
        path: entry.path,
        mode: (entry.executable ?? entry.artifact.kind === "executable") ? 0o755 : 0o644,
        bytes: entry.artifact.bytes,
        contents: Artifact.streamVerified(entry.artifact),
      });
      records.push({
        path: entry.path,
        line: `${csv(entry.path)},sha256=${
          Encoding.encodeBase64Url(hexBytes(entry.artifact.sha256))
        },${entry.artifact.bytes}`,
      });
    }
    const record = encoder.encode(
      `${records.sort((a, b) => utf8Order(a.path, b.path)).map((entry) => entry.line).join("\n")}\n${
        csv(prepared.record)
      },,\n`,
    );
    entries.push({
      kind: "file",
      path: prepared.record,
      mode: 0o644,
      bytes: record.byteLength,
      contents: Stream.make(record),
    });
    const limit = Zip.limit(entries);
    if (limit !== undefined) return yield* limit;
    const outfile = p.resolve(input.cwd ?? "", input.outdir, prepared.filename);
    const produce = (path: string) =>
      Effect.gen(function*() {
        const failure = Artifact.ioError(path, "write");
        yield* Effect.scoped(Effect.gen(function*() {
          const file = yield* fs.open(path, { flag: "w" }).pipe(Effect.mapError(failure));
          yield* Stream.runForEach(Zip.encode(entries), (chunk) => file.writeAll(chunk).pipe(Effect.mapError(failure)));
        }));
        return yield* Artifact.file(path, { name: packageMetadata.name, version: packageMetadata.version });
      });
    return yield* Commit.output(outfile, produce, input);
  })
);
