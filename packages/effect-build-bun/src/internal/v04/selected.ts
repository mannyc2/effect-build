import { Cause, Config, Crypto, Effect, FileSystem, Option, Path, Stream } from "effect";
import type { AbsolutePath } from "effect-build/Artifact";
import type { ContentIdentity, Definition } from "effect-build/Author/Tool";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  type CapabilityObservation,
  evaluateLaunch,
  evaluatePreflight,
  type IdentityIncomplete,
  identityIncomplete,
  type LaunchRefusal,
  type LayerRefusal,
  type PreflightRefusal,
  selectedCommandIndeterminate,
  type SelectedEvidence,
  type SupportedTarget,
  toolNotFound,
  toolProbeFailed,
} from "./compatibility.js";

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
}

export interface AdmissionRequest {
  readonly target: SupportedTarget;
  readonly allowUntestedVersion: boolean;
}

export interface SelectedTool {
  readonly evidence: SelectedEvidence;
  readonly definition: Definition<"bun", AdmissionRequest, PreflightRefusal>;
  readonly execute: (
    argv: readonly string[],
    cwd?: string,
  ) => Effect.Effect<CommandCompletion, LaunchRefusal>;
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
      Effect.mapError((error) => `stat:${error.reason._tag}`),
    );
    if (information.type !== "File") return yield* Effect.fail("not-regular-file");
    if (path.sep !== "\\" && (information.mode & 0o111) === 0) return yield* Effect.fail("not-executable");
    if (information.size < 0n) return yield* Effect.fail("invalid-byte-count");
    const bytes = yield* fileSystem.readFile(file).pipe(
      Effect.mapError((error) => `read:${error.reason._tag}`),
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
    const value = yield* Config.string("PATH").pipe(Effect.mapError(() => toolNotFound("bun")));
    const names = path.sep === "\\" ? ["bun", "bun.exe"] : ["bun"];
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
    return yield* Effect.fail(toolNotFound("bun"));
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
        Effect.mapError((error) => toolProbeFailed(`package-manifest-read:${error.reason._tag}`)),
        Effect.flatMap((source) =>
          Effect.try({
            try: () => JSON.parse(source) as PackageManifest,
            catch: () => toolProbeFailed("invalid-package-manifest"),
          })
        ),
      );
    const exists = (file: string): Effect.Effect<boolean, LayerRefusal> =>
      fileSystem.exists(file).pipe(
        Effect.mapError((error) => toolProbeFailed(`package-manifest-probe:${error.reason._tag}`)),
      );
    let ownDirectory = path.dirname(modulePath);
    let ownVersion: string | undefined;
    for (;;) {
      const manifestPath = path.join(ownDirectory, "package.json");
      if (yield* exists(manifestPath)) {
        const manifest = yield* readManifest(manifestPath);
        if (manifest.name === "effect-build-bun") {
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
        inputsKey: `effect-build:unresolved|provider@${ownVersion}`,
        state: "Indeterminate",
        reason: "core-package-not-resolved",
      };
    }
    if (coreManifest.name !== "effect-build" || typeof coreManifest.version !== "string") {
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: `effect-build:invalid|provider@${ownVersion}`,
        state: "Indeterminate",
        reason: "core-package-manifest-invalid",
      };
    }
    const lockstep = coreManifest.version === ownVersion;
    return {
      id: "effect-build-core",
      kind: "provider-core-peer",
      inputsKey: `effect-build@${coreManifest.version}|provider@${ownVersion}`,
      state: lockstep ? "Compatible" : "Incompatible",
      reason: lockstep ? "core-and-provider-versions-are-lockstep" : "core-and-provider-versions-differ",
    };
  });

const parseProbe = (completion: CommandCompletion): Effect.Effect<ProbeReport, IdentityIncomplete | LayerRefusal> =>
  Effect.gen(function*() {
    if (completion.exitCode !== 0) {
      return yield* Effect.fail(toolProbeFailed(
        completion.stderr.text || `identity-probe-exited:${completion.exitCode}`,
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
    const architecture = value.architecture === "arm64" ? "aarch64" : value.architecture;
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
    ) return yield* Effect.fail(identityIncomplete("identity-probe-fields-are-incomplete"));
    return { path: value.path, version: value.version, revision: value.revision, os, architecture, distribution };
  });

const sameContent = (left: ContentIdentity, right: ContentIdentity): boolean =>
  left.bytes === right.bytes
  && left.digest.algorithm === right.digest.algorithm
  && left.digest.value === right.digest.value;

const probeArgv = [
  "-e",
  `const release=process.platform==="linux"?await Bun.file("/etc/os-release").text().catch(()=>""):"";
const id=/^ID=(?:"([^"]+)"|([^\\n]+))$/m.exec(release)?.slice(1).find(Boolean);
const version=/^VERSION_ID=(?:"([^"]+)"|([^\\n]+))$/m.exec(release)?.slice(1).find(Boolean);
const distribution=process.platform!=="linux"?"not-applicable":id==="ubuntu"&&version==="24.04"?"ubuntu-24.04":"unknown";
process.stdout.write(JSON.stringify({path:process.execPath,version:Bun.version,revision:Bun.revision,os:process.platform,architecture:process.arch,distribution}))`,
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
        isNotFound(error) ? toolNotFound(selected) : toolProbeFailed(`selected-realpath:${error.reason._tag}`)
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
      Effect.mapError((error) => toolProbeFailed(`reported-realpath:${error.reason._tag}`)),
    );
    if (path.normalize(reportedCanonical) !== commandPath) {
      return yield* Effect.fail(identityIncomplete("probe-reported-different-selected-command"));
    }
    const help = yield* rawRun(["build", "--help"]);
    const helpText = `${help.stdout.text}\n${help.stderr.text}`;
    const capability: CapabilityObservation = help.exitCode !== 0
      ? { _tag: "Indeterminate", id: "compile", reason: `build-help-exited:${help.exitCode}` }
      : helpText.includes("--compile")
      ? { _tag: "Present", id: "compile", evidence: "bun-build-help-lists-compile" }
      : { _tag: "Missing", id: "compile", reason: "bun-build-help-omits-compile" };
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
    });
    const definition: Definition<"bun", AdmissionRequest, PreflightRefusal> = Object.freeze({
      observation: {
        name: "bun" as const,
        participants: [{
          role: "builder",
          name: "bun",
          version: evidence.version,
          revision: evidence.revision,
          channel: "selected-command",
          content: evidence.content,
        }] as const,
        capabilities: [evidence.capability],
      },
      evaluate: (request: AdmissionRequest) => {
        const result = evaluatePreflight({ evidence, ...request });
        return result._tag === "Refused" ? Effect.fail(result.refusal) : Effect.succeed(result.admission);
      },
      command: (argv: readonly string[], commandOptions?: ChildProcess.CommandOptions) =>
        ChildProcess.make(commandPath, argv, commandOptions),
    });
    const execute: SelectedTool["execute"] = (argv, cwd) =>
      Effect.gen(function*() {
        const launch = yield* observeContent(fileSystem, crypto, path, commandPath).pipe(
          Effect.mapError(selectedCommandIndeterminate),
        );
        const authentication = evaluateLaunch(evidence, launch);
        if (authentication._tag === "Refused") return yield* Effect.fail(authentication.refusal);
        return yield* mapFailureCause(
          runCommand(
            definition.command(argv, {
              ...(cwd === undefined ? {} : { cwd }),
              shell: false,
              forceKillAfter: "2 seconds",
            }),
            spawner,
          ),
          () => selectedCommandIndeterminate("selected-command-launch-failed-after-reauthentication"),
        );
      });
    return Object.freeze({ evidence, definition, execute });
  });
