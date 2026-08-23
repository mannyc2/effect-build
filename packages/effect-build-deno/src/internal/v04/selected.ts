import { Cause, Config, Crypto, Effect, FileSystem, Option, Path, Stream } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import type { Admission, ContentIdentity, Definition } from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  type CapabilityObservation,
  type DenortOverride,
  type DenortRuntime,
  evaluateLaunch,
  evaluatePreflight,
  type IdentityIncomplete,
  identityIncomplete,
  type LaunchRefusal,
  type LayerRefusal,
  nativeTargetFor,
  operation,
  type PreflightRefusal,
  type RuntimeBinding,
  selectedCommandIndeterminate,
  type SelectedEvidence,
  type SupportedTarget,
  toolNotFound,
  toolProbeFailed,
} from "./compatibility.js";
import { inspectNativeExecutable, matchesNativeTarget } from "./executable.js";

export interface CommandOutput {
  readonly text: string;
  readonly truncated: boolean;
}

export interface CommandCompletion {
  readonly exitCode: number;
  readonly stdout: CommandOutput;
  readonly stderr: CommandOutput;
}

interface ProbeReport {
  readonly path: string;
  readonly version: string;
  readonly revision: string;
  readonly os: "macos" | "linux" | "windows";
  readonly architecture: "x64" | "aarch64";
  readonly distribution: "ubuntu-24.04" | "not-applicable" | "unknown";
  readonly denort?: string;
}

interface InfoReport {
  readonly denoDir: string;
}

export interface AdmissionRequest {
  readonly target: SupportedTarget;
  readonly allowUntestedVersion: boolean;
}

export interface Preflight {
  readonly admission: Admission;
  readonly binding: RuntimeBinding;
}

export interface SelectedTool {
  readonly evidence: SelectedEvidence;
  readonly preflight: (request: AdmissionRequest) => Effect.Effect<Preflight, PreflightRefusal>;
  readonly reauthenticateCommand: () => Effect.Effect<void, LaunchRefusal>;
  readonly reauthenticateRuntime: (binding: RuntimeBinding) => Effect.Effect<void, PreflightRefusal>;
  readonly execute: (
    argv: readonly string[],
    binding: RuntimeBinding,
    cwd?: string,
  ) => Effect.Effect<CommandCompletion, LaunchRefusal | PreflightRefusal>;
}

const outputLimit = 1024 * 1024;

interface OutputAccumulator {
  readonly chunks: Uint8Array[];
  readonly bytes: number;
  readonly truncated: boolean;
}

const collectOutput = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<CommandOutput, unknown> =>
  Stream.runFold(
    stream,
    (): OutputAccumulator => ({ chunks: [], bytes: 0, truncated: false }),
    (state, chunk) => {
      const remaining = outputLimit - state.bytes;
      if (remaining <= 0) return { ...state, truncated: true };
      const retained = chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
      return {
        chunks: [...state.chunks, retained],
        bytes: state.bytes + retained.byteLength,
        truncated: state.truncated || retained.byteLength !== chunk.byteLength,
      };
    },
  ).pipe(
    Effect.map((state) => {
      const bytes = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { text: new TextDecoder().decode(bytes), truncated: state.truncated };
    }),
  );

const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  mapError: (error: E) => E2,
): Effect.Effect<A, E2, R> => Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, mapError)));

const runCommand = (
  command: ChildProcess.Command,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
): Effect.Effect<CommandCompletion, unknown> =>
  Effect.scoped(
    Effect.gen(function*() {
      const handle = yield* command.pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collectOutput(handle.stdout), collectOutput(handle.stderr), handle.exitCode] as const,
        { concurrency: "unbounded" },
      );
      return { exitCode: Number(exitCode), stdout, stderr };
    }),
  );

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const observeContent = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  file: string,
): Effect.Effect<ContentIdentity, string> =>
  Effect.gen(function*() {
    const information = yield* fileSystem.stat(file).pipe(
      Effect.mapError((error) => "stat:" + error.reason._tag),
    );
    if (information.type !== "File") return yield* Effect.fail("not-regular-file");
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) return yield* Effect.fail("not-executable");
    if (information.size < 0n) return yield* Effect.fail("invalid-byte-count");
    const bytes = yield* fileSystem.readFile(file).pipe(
      Effect.mapError((error) => "read:" + error.reason._tag),
    );
    if (BigInt(bytes.byteLength) !== information.size) return yield* Effect.fail("file-size-changed-during-read");
    const digest = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError(() => "sha256-digest-unavailable"),
    );
    return {
      digest: { algorithm: "sha256", value: hex(digest) as ContentIdentity["digest"]["value"] },
      bytes: String(information.size) as ContentIdentity["bytes"],
    };
  });

const isNotFound = (error: { readonly reason: { readonly _tag: string } }): boolean => error.reason._tag === "NotFound";

const inspectPathCandidate = <A>(
  effect: Effect.Effect<A, { readonly reason: { readonly _tag: string } }>,
): Effect.Effect<Option.Option<A>, string> =>
  Effect.matchCauseEffect(effect, {
    onSuccess: (value) => Effect.succeed(Option.some(value)),
    onFailure: (cause) => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1
        && reason !== undefined
        && Cause.isFailReason(reason)
        && isNotFound(reason.error)
      ) return Effect.succeed(Option.none());
      return Effect.fail("path-candidate-inspection-failed");
    },
  });

const resolvePathCommand = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<string, LayerRefusal> =>
  Effect.gen(function*() {
    const value = yield* Config.string("PATH").pipe(Effect.mapError(() => toolNotFound("deno")));
    const names = path.sep === "\\" ? ["deno", "deno.exe"] : ["deno"];
    for (const entry of value.split(path.sep === "\\" ? ";" : ":")) {
      if (entry.length === 0 || !path.isAbsolute(entry)) continue;
      for (const name of names) {
        const candidate = path.normalize(path.join(entry, name));
        const canonical = yield* inspectPathCandidate(fileSystem.realPath(candidate)).pipe(
          Effect.mapError(toolProbeFailed),
        );
        if (Option.isNone(canonical)) continue;
        const information = yield* inspectPathCandidate(fileSystem.stat(canonical.value)).pipe(
          Effect.mapError(toolProbeFailed),
        );
        if (Option.isNone(information) || information.value.type !== "File") continue;
        if (path.sep !== "\\" && (information.value.mode & 0o111) === 0) continue;
        return path.normalize(canonical.value);
      }
    }
    return yield* Effect.fail(toolNotFound("deno"));
  });

const pathFromUrl = (url: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "file:") return undefined;
  const pathname = decodeURIComponent(parsed.pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
};

interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
}

const observeCoreContract = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  moduleUrl: string,
): Effect.Effect<SelectedEvidence["coreContract"], LayerRefusal> =>
  Effect.gen(function*() {
    const modulePath = pathFromUrl(moduleUrl);
    if (modulePath === undefined) return yield* Effect.fail(toolProbeFailed("module-url-is-not-a-file-path"));
    const readManifest = (file: string): Effect.Effect<PackageManifest, LayerRefusal> =>
      fileSystem.readFileString(file).pipe(
        Effect.mapError((error) => toolProbeFailed("package-manifest-read:" + error.reason._tag)),
        Effect.flatMap((source) =>
          Effect.try({
            try: () => JSON.parse(source) as PackageManifest,
            catch: () => toolProbeFailed("invalid-package-manifest"),
          })
        ),
      );
    const exists = (file: string): Effect.Effect<boolean, LayerRefusal> =>
      fileSystem.exists(file).pipe(
        Effect.mapError((error) => toolProbeFailed("package-manifest-probe:" + error.reason._tag)),
      );
    let ownDirectory = path.dirname(modulePath);
    let ownVersion: string | undefined;
    for (;;) {
      const manifestPath = path.join(ownDirectory, "package.json");
      if (yield* exists(manifestPath)) {
        const manifest = yield* readManifest(manifestPath);
        if (manifest.name === "effect-build-deno") {
          ownVersion = manifest.version;
          break;
        }
      }
      const parent = path.dirname(ownDirectory);
      if (parent === ownDirectory) break;
      ownDirectory = parent;
    }
    if (ownVersion === undefined) return yield* Effect.fail(identityIncomplete("own-package-version-missing"));
    let directory = ownDirectory;
    let coreManifest: PackageManifest | undefined;
    for (;;) {
      const candidate = path.join(directory, "node_modules", "effect-build", "package.json");
      if (yield* exists(candidate)) {
        coreManifest = yield* readManifest(candidate);
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    if (coreManifest === undefined) {
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: "effect-build:unresolved|provider@" + ownVersion,
        state: "Indeterminate",
        reason: "core-package-not-resolved",
      };
    }
    if (coreManifest.name !== "effect-build" || typeof coreManifest.version !== "string") {
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: "effect-build:invalid|provider@" + ownVersion,
        state: "Indeterminate",
        reason: "core-package-manifest-invalid",
      };
    }
    const lockstep = coreManifest.version === ownVersion;
    return {
      id: "effect-build-core",
      kind: "provider-core-peer",
      inputsKey: "effect-build@" + coreManifest.version + "|provider@" + ownVersion,
      state: lockstep ? "Compatible" : "Incompatible",
      reason: lockstep ? "core-and-provider-versions-are-lockstep" : "core-and-provider-versions-differ",
    };
  });

const parseProbe = (completion: CommandCompletion): Effect.Effect<ProbeReport, IdentityIncomplete | LayerRefusal> =>
  Effect.gen(function*() {
    if (completion.exitCode !== 0) {
      return yield* Effect.fail(toolProbeFailed(
        completion.stderr.text || "identity-probe-exited:" + completion.exitCode,
      ));
    }
    const raw = yield* Effect.try({
      try: () => JSON.parse(completion.stdout.text.trim()) as unknown,
      catch: () => identityIncomplete("identity-probe-returned-invalid-json"),
    });
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return yield* Effect.fail(identityIncomplete("identity-probe-returned-non-object"));
    }
    const value = raw as Readonly<Record<string, unknown>>;
    const os = value.os === "darwin" ? "macos" : value.os === "win32" ? "windows" : value.os;
    const architecture = value.architecture === "arm64"
      ? "aarch64"
      : value.architecture === "x86_64"
      ? "x64"
      : value.architecture;
    const distribution = value.distribution;
    if (
      typeof value.path !== "string"
      || value.path.length === 0
      || typeof value.version !== "string"
      || value.version.length === 0
      || typeof value.revision !== "string"
      || value.revision.length === 0
      || (os !== "macos" && os !== "linux" && os !== "windows")
      || (architecture !== "x64" && architecture !== "aarch64")
      || (distribution !== "ubuntu-24.04" && distribution !== "not-applicable" && distribution !== "unknown")
      || (value.denort !== undefined && value.denort !== null
        && (typeof value.denort !== "string" || value.denort.length === 0))
    ) return yield* Effect.fail(identityIncomplete("identity-probe-fields-are-incomplete"));
    return {
      path: value.path,
      version: value.version,
      revision: value.revision,
      os,
      architecture,
      distribution,
      ...(typeof value.denort === "string" ? { denort: value.denort } : {}),
    };
  });

const parseInfo = (completion: CommandCompletion): Effect.Effect<InfoReport, LayerRefusal> =>
  Effect.gen(function*() {
    if (completion.exitCode !== 0) {
      return yield* Effect.fail(toolProbeFailed(
        completion.stderr.text || "deno-info-exited:" + completion.exitCode,
      ));
    }
    const raw = yield* Effect.try({
      try: () => JSON.parse(completion.stdout.text.trim()) as unknown,
      catch: () => toolProbeFailed("deno-info-returned-invalid-json"),
    });
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return yield* Effect.fail(toolProbeFailed("deno-info-returned-non-object"));
    }
    const denoDir = (raw as Readonly<Record<string, unknown>>).denoDir;
    if (typeof denoDir !== "string" || denoDir.length === 0) {
      return yield* Effect.fail(toolProbeFailed("deno-info-deno-dir-is-missing"));
    }
    return { denoDir };
  });

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.bytes === right.bytes
  && left.digest.algorithm === right.digest.algorithm
  && left.digest.value === right.digest.value;

const relationUnsatisfied = (reason: string): PreflightRefusal => ({
  _tag: "RelationUnsatisfied",
  relation: "deno-denort",
  operation,
  owner: "effect-build-deno",
  phase: "operation-preflight",
  reason,
});

const relationIndeterminate = (reason: string): PreflightRefusal => ({
  _tag: "RelationIndeterminate",
  relation: "deno-denort",
  operation,
  owner: "effect-build-deno",
  phase: "operation-preflight",
  reason,
});

interface FileContent {
  readonly content: ContentIdentity;
  readonly bytes: Uint8Array;
}

const observeRegularFile = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  file: string,
): Effect.Effect<FileContent, string> =>
  Effect.gen(function*() {
    const information = yield* fileSystem.stat(file).pipe(
      Effect.mapError((error) => "stat:" + error.reason._tag),
    );
    if (information.type !== "File") return yield* Effect.fail("not-regular-file");
    if (information.size < 0n) return yield* Effect.fail("invalid-byte-count");
    const bytes = yield* fileSystem.readFile(file).pipe(
      Effect.mapError((error) => "read:" + error.reason._tag),
    );
    if (BigInt(bytes.byteLength) !== information.size) return yield* Effect.fail("file-size-changed-during-read");
    const digest = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError(() => "sha256-digest-unavailable"),
    );
    return {
      content: {
        digest: { algorithm: "sha256", value: hex(digest) as ContentIdentity["digest"]["value"] },
        bytes: String(information.size) as ContentIdentity["bytes"],
      },
      bytes,
    };
  });

const u16 = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("truncated-zip");
  return bytes[offset]! | bytes[offset + 1]! << 8;
};

const u32 = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("truncated-zip");
  return (bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16 | bytes[offset + 3]! << 24) >>> 0;
};

const signatureAt = (bytes: Uint8Array, offset: number, signature: number): boolean =>
  offset >= 0 && offset + 4 <= bytes.byteLength && u32(bytes, offset) === signature;

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crc32Table[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream !== "function") throw new Error("deflate-raw-is-unavailable");
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const decompressor = new DecompressionStream("deflate-raw") as unknown as TransformStream<
    Uint8Array,
    Uint8Array
  >;
  const response = new Response(source.pipeThrough(decompressor));
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Deno caches the release archive, not an extracted runtime. Validate its
 * central directory, selected member, checksum, and native header here so a
 * corrupt or mismatched cache cannot first fail after candidate allocation.
 */
const readZipMember = async (archive: Uint8Array, member: string): Promise<Uint8Array> => {
  const minimumEnd = 22;
  if (archive.byteLength < minimumEnd) throw new Error("truncated-zip");
  const searchStart = Math.max(0, archive.byteLength - minimumEnd - 0xffff);
  let end = -1;
  for (let offset = archive.byteLength - minimumEnd; offset >= searchStart; offset--) {
    if (signatureAt(archive, offset, 0x06054b50)) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("zip-end-of-central-directory-missing");
  if (u16(archive, end + 4) !== 0 || u16(archive, end + 6) !== 0) throw new Error("multi-disk-zip-is-unsupported");
  const entries = u16(archive, end + 10);
  if (entries === 0 || entries !== u16(archive, end + 8)) throw new Error("invalid-zip-entry-count");
  const centralSize = u32(archive, end + 12);
  const centralOffset = u32(archive, end + 16);
  if (centralOffset + centralSize > end) throw new Error("invalid-zip-central-directory-range");
  const decoder = new TextDecoder();
  let cursor = centralOffset;
  let found:
    | {
      readonly flags: number;
      readonly compression: number;
      readonly crc: number;
      readonly compressedSize: number;
      readonly uncompressedSize: number;
      readonly localOffset: number;
    }
    | undefined;
  for (let index = 0; index < entries; index++) {
    if (!signatureAt(archive, cursor, 0x02014b50)) throw new Error("invalid-zip-central-directory-entry");
    const flags = u16(archive, cursor + 8);
    const compression = u16(archive, cursor + 10);
    const crc = u32(archive, cursor + 16);
    const compressedSize = u32(archive, cursor + 20);
    const uncompressedSize = u32(archive, cursor + 24);
    const nameLength = u16(archive, cursor + 28);
    const extraLength = u16(archive, cursor + 30);
    const commentLength = u16(archive, cursor + 32);
    const localOffset = u32(archive, cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize) throw new Error("truncated-zip-central-directory-entry");
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if ((flags & 1) !== 0) throw new Error("encrypted-zip-entry");
    if (name === member) {
      if (found !== undefined) throw new Error("duplicate-runtime-member");
      found = { flags, compression, crc, compressedSize, uncompressedSize, localOffset };
    }
    cursor = entryEnd;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("invalid-zip-central-directory-size");
  if (found === undefined) throw new Error("runtime-member-missing");
  if (!signatureAt(archive, found.localOffset, 0x04034b50)) throw new Error("invalid-zip-local-header");
  const flags = u16(archive, found.localOffset + 6);
  const compression = u16(archive, found.localOffset + 8);
  if (flags !== found.flags || compression !== found.compression) throw new Error("zip-header-metadata-mismatch");
  const nameLength = u16(archive, found.localOffset + 26);
  const extraLength = u16(archive, found.localOffset + 28);
  const localName = decoder.decode(
    archive.subarray(found.localOffset + 30, found.localOffset + 30 + nameLength),
  );
  if (localName !== member) throw new Error("zip-local-member-mismatch");
  const contentsStart = found.localOffset + 30 + nameLength + extraLength;
  const contentsEnd = contentsStart + found.compressedSize;
  if (contentsEnd > archive.byteLength) throw new Error("truncated-zip-member");
  if (found.uncompressedSize > 512 * 1024 * 1024) throw new Error("runtime-member-too-large");
  const compressed = archive.subarray(contentsStart, contentsEnd);
  const contents = found.compression === 0
    ? new Uint8Array(compressed)
    : found.compression === 8
    ? await inflateRaw(compressed)
    : (() => {
      throw new Error("unsupported-zip-compression");
    })();
  if (contents.byteLength !== found.uncompressedSize) throw new Error("zip-member-size-mismatch");
  if (crc32(contents) !== found.crc) throw new Error("zip-member-crc-mismatch");
  return contents;
};

const runtimeMember = (target: SupportedTarget): "denort" | "denort.exe" =>
  target === "windows-x64" || target === "windows-aarch64" ? "denort.exe" : "denort";

const validateNativeRuntime = (
  target: SupportedTarget,
  bytes: Uint8Array,
): Effect.Effect<void, PreflightRefusal> =>
  Effect.try({
    try: () => {
      const observed = inspectNativeExecutable(bytes);
      if (!matchesNativeTarget(target, observed)) throw new Error("native-target-does-not-match-requested-target");
    },
    catch: (error) =>
      relationUnsatisfied(
        "denort-native-validation:" + (error instanceof Error ? error.message : "invalid-native-runtime"),
      ),
  });

const validateCachedArchive = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  target: SupportedTarget,
  archivePath: AbsolutePath,
): Effect.Effect<DenortRuntime, PreflightRefusal> =>
  Effect.gen(function*() {
    const observed = yield* observeRegularFile(fileSystem, crypto, archivePath).pipe(
      Effect.mapError((reason) => relationUnsatisfied("denort-cache:" + reason)),
    );
    const member = yield* Effect.tryPromise({
      try: () => readZipMember(observed.bytes, runtimeMember(target)),
      catch: (error) =>
        relationUnsatisfied(
          "denort-cache:" + (error instanceof Error ? error.message : "invalid-runtime-archive"),
        ),
    });
    yield* validateNativeRuntime(target, member);
    return {
      source: "download-cache" as const,
      path: archivePath,
      content: observed.content,
      target,
      nativeTarget: nativeTargetFor(target),
    };
  });

const validateOverride = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  target: SupportedTarget,
  override: DenortOverride,
): Effect.Effect<DenortRuntime, PreflightRefusal> =>
  Effect.gen(function*() {
    const canonical = yield* fileSystem.realPath(override.path).pipe(
      Effect.mapError((error) => relationUnsatisfied("denort-override-realpath:" + error.reason._tag)),
    );
    const runtimePath = path.normalize(canonical) as AbsolutePath;
    if (runtimePath !== override.path) {
      return yield* Effect.fail(relationIndeterminate("denort-override-path-changed-since-layer"));
    }
    const observed = yield* observeRegularFile(fileSystem, crypto, runtimePath).pipe(
      Effect.mapError((reason) => relationUnsatisfied("denort-override:" + reason)),
    );
    if (!sameContent(observed.content, override.content)) {
      return yield* Effect.fail(relationIndeterminate("denort-override-content-changed-since-layer"));
    }
    yield* validateNativeRuntime(target, observed.bytes);
    return {
      source: "environment-override" as const,
      path: runtimePath,
      content: observed.content,
      target,
      nativeTarget: nativeTargetFor(target),
    };
  });

const bindRuntime = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  evidence: SelectedEvidence,
  target: SupportedTarget,
): Effect.Effect<RuntimeBinding, PreflightRefusal> =>
  Effect.gen(function*() {
    if (evidence.denortOverride !== undefined) {
      const denort = yield* validateOverride(fileSystem, crypto, path, target, evidence.denortOverride);
      return {
        denort,
        environment: Object.freeze({ DENORT_BIN: denort.path }),
      };
    }
    if (evidence.denoDir === undefined) {
      return yield* Effect.fail(
        relationIndeterminate("deno-download-cache-root-was-not-observed-at-layer-acquisition"),
      );
    }
    const archive = path.join(
      evidence.denoDir,
      "dl",
      "release",
      "v" + evidence.version,
      "denort-" + nativeTargetFor(target) + ".zip",
    ) as AbsolutePath;
    const denort = yield* validateCachedArchive(fileSystem, crypto, target, archive);
    return {
      denort,
      // Freeze the exact cache root selected by Deno info and ensure a later
      // environment mutation cannot cause Deno to take its download path.
      environment: Object.freeze({ DENO_DIR: evidence.denoDir, DENORT_BIN: undefined }),
    };
  });

const reauthenticateRuntime = (
  fileSystem: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  path: Path.Path,
  evidence: SelectedEvidence,
  binding: RuntimeBinding,
): Effect.Effect<void, PreflightRefusal> =>
  Effect.gen(function*() {
    const current = yield* bindRuntime(fileSystem, crypto, path, evidence, binding.denort.target);
    if (
      current.denort.path !== binding.denort.path
      || current.denort.source !== binding.denort.source
      || !sameContent(current.denort.content, binding.denort.content)
    ) return yield* Effect.fail(relationIndeterminate("denort-runtime-changed-after-preflight"));
  });

const definitionFor = (
  evidence: SelectedEvidence,
  binding: RuntimeBinding,
): Definition<"deno", AdmissionRequest, PreflightRefusal> =>
  Object.freeze({
    observation: {
      name: "deno" as const,
      participants: [
        {
          role: "deno",
          name: "deno",
          version: evidence.version,
          revision: evidence.revision,
          channel: "selected-command",
          content: evidence.content,
        },
        {
          role: "denort",
          name: "denort",
          version: evidence.version,
          revision: evidence.revision,
          channel: binding.denort.source,
          content: binding.denort.content,
        },
      ] as const,
      capabilities: [evidence.capability],
    },
    evaluate: (request: AdmissionRequest) => {
      const result = evaluatePreflight({ evidence, runtime: binding.denort, ...request });
      return result._tag === "Refused" ? Effect.fail(result.refusal) : Effect.succeed(result.admission);
    },
    command: (argv: readonly string[], commandOptions?: ChildProcess.CommandOptions) =>
      ChildProcess.make(evidence.path, argv, commandOptions),
  });

const probeSource = [
  "const release=Deno.build.os==='linux'?await Deno.readTextFile('/etc/os-release').catch(()=> ''):'';",
  "const lines=release.split('\\n');",
  "const field=(name)=>lines.find((line)=>line.startsWith(name+'='))?.slice(name.length+1).replaceAll('\"','');",
  "const distribution=Deno.build.os!=='linux'?'not-applicable':field('ID')==='ubuntu'&&field('VERSION_ID')==='24.04'?'ubuntu-24.04':'unknown';",
  "console.log(JSON.stringify({path:Deno.execPath(),version:Deno.version.deno,revision:'release:'+Deno.version.deno,os:Deno.build.os,architecture:Deno.build.arch,distribution,denort:Deno.env.get('DENORT_BIN')??null}));",
].join("");

// Deno 2.9 `eval` has implicit permissions and rejects `--allow-*` flags.
const probeArgv = [
  "eval",
  probeSource,
] as const;

export const selectTool = (
  options: { readonly executable?: AbsolutePath },
  moduleUrl: string,
): Effect.Effect<
  SelectedTool,
  LayerRefusal,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    if (
      options.executable !== undefined
      && (!path.isAbsolute(options.executable) || path.normalize(options.executable) !== options.executable)
    ) return yield* Effect.fail(toolProbeFailed("explicit-executable-must-be-normalized-and-absolute"));
    const selected = options.executable ?? (yield* resolvePathCommand(fileSystem, path));
    const canonical = yield* fileSystem.realPath(selected).pipe(
      Effect.mapError((error) =>
        isNotFound(error) ? toolNotFound(selected) : toolProbeFailed("selected-realpath:" + error.reason._tag)
      ),
    );
    const commandPath = path.normalize(canonical) as AbsolutePath;
    const before = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
      Effect.mapError(toolProbeFailed),
    );
    const rawRun = (argv: readonly string[]) =>
      mapFailureCause(
        runCommand(ChildProcess.make(commandPath, argv, { shell: false, forceKillAfter: "2 seconds" }), spawner),
        () => toolProbeFailed("selected-command-probe-launch-failed"),
      );
    const report = yield* rawRun(probeArgv).pipe(Effect.flatMap(parseProbe));
    const reportedCanonical = yield* fileSystem.realPath(report.path).pipe(
      Effect.mapError((error) => toolProbeFailed("reported-realpath:" + error.reason._tag)),
    );
    if (path.normalize(reportedCanonical) !== commandPath) {
      return yield* Effect.fail(identityIncomplete("probe-reported-different-selected-command"));
    }
    let denortOverride: DenortOverride | undefined;
    if (report.denort !== undefined) {
      if (!path.isAbsolute(report.denort) || path.normalize(report.denort) !== report.denort) {
        return yield* Effect.fail(identityIncomplete("denort-override-must-be-normalized-and-absolute"));
      }
      const runtimePath = yield* fileSystem.realPath(report.denort).pipe(
        Effect.mapError((error) => toolProbeFailed("denort-override-realpath:" + error.reason._tag)),
      );
      const content = yield* observeContent(fileSystem, crypto, path, runtimePath).pipe(
        Effect.mapError(identityIncomplete),
      );
      denortOverride = { path: path.normalize(runtimePath) as AbsolutePath, content };
    }
    let denoDir: AbsolutePath | undefined;
    if (denortOverride === undefined) {
      const info = yield* rawRun(["info", "--json"]).pipe(Effect.flatMap(parseInfo));
      if (!path.isAbsolute(info.denoDir) || path.normalize(info.denoDir) !== info.denoDir) {
        return yield* Effect.fail(identityIncomplete("deno-info-reported-non-normalized-or-relative-cache-root"));
      }
      denoDir = info.denoDir as AbsolutePath;
    }
    const help = yield* rawRun(["compile", "--help"]);
    const helpText = help.stdout.text + "\n" + help.stderr.text;
    const capability: CapabilityObservation = help.exitCode !== 0
      ? { _tag: "Indeterminate", id: "compile", reason: "compile-help-exited:" + help.exitCode }
      : helpText.includes("--target")
      ? { _tag: "Present", id: "compile", evidence: "deno-compile-help-lists-target" }
      : { _tag: "Missing", id: "compile", reason: "deno-compile-help-omits-target" };
    const after = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
      Effect.mapError(toolProbeFailed),
    );
    if (!sameContent(before, after)) {
      return yield* Effect.fail(identityIncomplete("selected-command-changed-during-acquisition"));
    }
    const coreContract = yield* observeCoreContract(fileSystem, path, moduleUrl);
    const evidence: SelectedEvidence = Object.freeze({
      path: commandPath,
      version: report.version,
      revision: report.revision,
      host: { os: report.os, architecture: report.architecture, distribution: report.distribution },
      content: after,
      capability,
      coreContract,
      ...(denoDir === undefined ? {} : { denoDir }),
      ...(denortOverride === undefined ? {} : { denortOverride }),
    });
    const preflight: SelectedTool["preflight"] = (request) =>
      Effect.gen(function*() {
        const binding = yield* bindRuntime(fileSystem, crypto, path, evidence, request.target);
        const definition = definitionFor(evidence, binding);
        const admission = yield* definition.evaluate(request);
        return { admission, binding };
      });
    const reauthenticate: SelectedTool["reauthenticateRuntime"] = (binding) =>
      reauthenticateRuntime(fileSystem, crypto, path, evidence, binding);
    const reauthenticateCommand: SelectedTool["reauthenticateCommand"] = () =>
      Effect.gen(function*() {
        const launch = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
          Effect.mapError(selectedCommandIndeterminate),
        );
        const authentication = evaluateLaunch(evidence, launch);
        if (authentication._tag === "Refused") return yield* Effect.fail(authentication.refusal);
      });
    const execute: SelectedTool["execute"] = (argv, binding, cwd) =>
      Effect.gen(function*() {
        yield* reauthenticateCommand();
        yield* reauthenticate(binding);
        const definition = definitionFor(evidence, binding);
        return yield* mapFailureCause(
          runCommand(
            definition.command(argv, {
              ...(cwd === undefined ? {} : { cwd }),
              env: binding.environment,
              extendEnv: true,
              shell: false,
              forceKillAfter: "2 seconds",
            }),
            spawner,
          ),
          () => selectedCommandIndeterminate("selected-command-launch-failed-after-reauthentication"),
        );
      });
    return Object.freeze({
      evidence,
      preflight,
      reauthenticateCommand,
      reauthenticateRuntime: reauthenticate,
      execute,
    });
  });
