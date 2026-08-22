import { Crypto, Effect, FileSystem, Path } from "effect";
import * as esbuild from "esbuild";
import {
  type CapabilityObservation,
  type ContractObservation,
  type HostCoordinate,
  identityFailureReason,
  identityIncomplete,
  type InstalledEvidence,
  type LayerRefusal,
  type OperationCoordinate,
  type Participant,
  type ParticipantContent,
  type RelationObservation,
  toolProbeFailed,
} from "./compatibility.js";

interface HostProcess {
  readonly platform?: string;
  readonly arch?: string;
  readonly versions?: Readonly<Record<string, string | undefined>>;
}

interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
  readonly main?: string;
  readonly types?: string;
}

const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hostProcess = (): HostProcess | undefined => (globalThis as { process?: HostProcess }).process;

const operatingSystems: Readonly<Record<string, string>> = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

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

export const observeInstalled = (
  operation: OperationCoordinate,
  moduleUrl: string,
): Effect.Effect<InstalledEvidence, LayerRefusal, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const probe = (reason: string) => toolProbeFailed(operation, reason);

    const readBytes = (file: string): Effect.Effect<Uint8Array, LayerRefusal> =>
      fileSystem.readFile(file).pipe(Effect.mapError((error) => probe(`unreadable:${file}:${error.reason._tag}`)));

    const contentOf = (bytes: Uint8Array): Effect.Effect<ParticipantContent, LayerRefusal> =>
      crypto.digest("SHA-256", bytes).pipe(
        Effect.map((digest) => ({
          algorithm: "sha256" as const,
          value: `sha256:${hex(digest)}`,
          bytes: String(bytes.byteLength),
        })),
        Effect.mapError(() => probe("sha256-digest-unavailable")),
      );

    const readManifest = (file: string): Effect.Effect<PackageManifest, LayerRefusal> =>
      readBytes(file).pipe(
        Effect.flatMap((bytes) =>
          Effect.try({
            try: () => JSON.parse(new TextDecoder().decode(bytes)) as PackageManifest,
            catch: () => probe(`invalid-package-manifest:${file}`),
          })
        ),
      );

    const exists = (file: string): Effect.Effect<boolean, LayerRefusal> =>
      fileSystem.exists(file).pipe(Effect.mapError((error) => probe(`unprobeable:${file}:${error.reason._tag}`)));

    const realDirectory = (directory: string): Effect.Effect<string, LayerRefusal> =>
      fileSystem.realPath(directory).pipe(
        Effect.mapError((error) => probe(`unresolvable:${directory}:${error.reason._tag}`)),
      );

    const findInstalledPackage = (startDirectory: string, packageName: string) =>
      Effect.gen(function*() {
        let directory = startDirectory;
        for (;;) {
          const candidate = path.join(directory, "node_modules", ...packageName.split("/"));
          if (yield* exists(path.join(candidate, "package.json"))) return candidate;
          const parent = path.dirname(directory);
          if (parent === directory) return yield* Effect.fail(probe(`package-not-installed:${packageName}`));
          directory = parent;
        }
      });

    const findOwnPackage = (startDirectory: string) =>
      Effect.gen(function*() {
        let directory = startDirectory;
        for (;;) {
          const candidate = path.join(directory, "package.json");
          if (yield* exists(candidate)) {
            const manifest = yield* readManifest(candidate);
            if (manifest.name === "effect-build-esbuild") return { directory, manifest };
          }
          const parent = path.dirname(directory);
          if (parent === directory) return yield* Effect.fail(probe("own-package-manifest-not-found"));
          directory = parent;
        }
      });

    const modulePath = pathFromUrl(moduleUrl);
    if (modulePath === undefined) return yield* Effect.fail(probe("module-url-is-not-a-file-path"));
    const moduleDirectory = path.dirname(modulePath);

    const runtime = hostProcess();
    const runtimeVersions = runtime?.versions ?? {};
    const runtimeName = typeof runtimeVersions.bun === "string"
      ? "bun"
      : typeof runtimeVersions.node === "string"
      ? "node"
      : undefined;
    const runtimeVersion = runtimeName === "bun" ? runtimeVersions.bun : runtimeVersions.node;
    if (
      runtimeName === undefined
      || runtimeVersion === undefined
      || typeof runtime?.platform !== "string"
      || typeof runtime.arch !== "string"
    ) return yield* Effect.fail(probe("host-runtime-unidentified"));
    const host: HostCoordinate = {
      os: operatingSystems[runtime.platform] ?? runtime.platform,
      architecture: runtime.arch,
      runtime: runtimeName,
      runtimeVersion,
    };

    const packageDirectory = yield* realDirectory(yield* findInstalledPackage(moduleDirectory, "esbuild"));
    const manifest = yield* readManifest(path.join(packageDirectory, "package.json"));
    if (manifest.name !== "esbuild" || typeof manifest.version !== "string") {
      return yield* Effect.fail(probe("installed-esbuild-manifest-invalid"));
    }
    if (manifest.version !== esbuild.version) {
      return yield* Effect.fail(probe("loaded-module-version-differs-from-installed-package"));
    }
    const manifestBytes = yield* readBytes(path.join(packageDirectory, "package.json"));
    const manifestContent = yield* contentOf(manifestBytes);
    const revision = manifestContent.value;

    const mainRelative = typeof manifest.main === "string" ? manifest.main : "lib/main.js";
    const typesRelative = typeof manifest.types === "string" ? manifest.types : "lib/main.d.ts";
    const mainContent = yield* contentOf(yield* readBytes(path.join(packageDirectory, mainRelative)));
    const typesContent = yield* contentOf(yield* readBytes(path.join(packageDirectory, typesRelative)));

    const platformPackageName = `@esbuild/${runtime.platform}-${runtime.arch}`;
    const platformDirectory = yield* findInstalledPackage(packageDirectory, platformPackageName);
    const platformManifest = yield* readManifest(path.join(platformDirectory, "package.json"));
    if (platformManifest.name !== platformPackageName || typeof platformManifest.version !== "string") {
      return yield* Effect.fail(probe("installed-platform-manifest-invalid"));
    }
    const platformManifestBytes = yield* readBytes(path.join(platformDirectory, "package.json"));
    const platformContent = yield* contentOf(platformManifestBytes);
    const binaryPath = runtime.platform === "win32"
      ? path.join(platformDirectory, "esbuild.exe")
      : path.join(platformDirectory, "bin", "esbuild");
    const binaryContent = yield* contentOf(yield* readBytes(binaryPath));

    const hostDescriptor = new TextEncoder().encode(`host-runtime:${runtimeName}@${runtimeVersion}`);
    const hostContent = yield* contentOf(hostDescriptor);

    const participants: readonly Participant[] = [
      {
        role: "javascript-package",
        kind: "javascript-package",
        name: "esbuild",
        version: manifest.version,
        revision,
        channel: "npm",
        content: mainContent,
      },
      {
        role: "declarations",
        kind: "declarations",
        name: `esbuild/${typesRelative}`,
        version: manifest.version,
        revision,
        channel: "npm",
        content: typesContent,
      },
      {
        role: "platform-package",
        kind: "javascript-package",
        name: platformPackageName,
        version: platformManifest.version,
        revision: platformContent.value,
        channel: "npm",
        content: platformContent,
      },
      {
        role: "native-binary",
        kind: "native-binary",
        name: "esbuild",
        version: platformManifest.version,
        revision: binaryContent.value,
        channel: "npm",
        content: binaryContent,
      },
      {
        role: "host-runtime",
        kind: "host-runtime",
        name: runtimeName,
        version: runtimeVersion,
        revision: hostContent.value,
        channel: "host",
        content: hostContent,
      },
    ];

    const identity = {
      providerPackage: "effect-build-esbuild" as const,
      lane: "installed-library-api" as const,
      participants,
    };
    const identityFailure = identityFailureReason(identity);
    if (identityFailure !== undefined) return yield* Effect.fail(identityIncomplete(operation, identityFailure));

    const capabilities: readonly CapabilityObservation[] = [
      typeof esbuild.build === "function"
        ? { _tag: "Present", id: "build", evidence: "esbuild.build-function-present" }
        : { _tag: "Missing", id: "build", reason: "esbuild.build-is-not-a-function" },
      ...(["context", "cancel", "dispose"] as const).map((id): CapabilityObservation =>
        typeof esbuild.context === "function"
          ? {
            _tag: "Present",
            id,
            evidence: id === "context"
              ? "esbuild.context-function-present"
              : "esbuild.context-owner-method-contract",
          }
          : { _tag: "Missing", id, reason: "esbuild.context-is-not-a-function" }
      ),
    ];

    const relations: readonly RelationObservation[] = [{
      id: "esbuild-package-api-native",
      inputsKey:
        `package:${manifest.version}|platform:${platformPackageName}@${platformManifest.version}|binary:${binaryContent.value}`,
      state: platformManifest.version === manifest.version ? "Satisfied" : "Unsatisfied",
      reason: platformManifest.version === manifest.version
        ? "platform-package-version-matches-installed-package"
        : "platform-package-version-differs-from-installed-package",
    }];

    const own = yield* findOwnPackage(moduleDirectory);
    if (typeof own.manifest.version !== "string") return yield* Effect.fail(probe("own-package-version-missing"));
    const ownDirectory = yield* realDirectory(own.directory);
    const coreContract: ContractObservation = yield* Effect.gen(function*() {
      const coreDirectory = yield* findInstalledPackage(ownDirectory, "effect-build").pipe(
        Effect.orElseSucceed(() => undefined),
      );
      if (coreDirectory === undefined) {
        return {
          id: "effect-build-core",
          kind: "provider-core-peer",
          inputsKey: `effect-build:unresolved|provider@${own.manifest.version}`,
          state: "Indeterminate",
          reason: "core-package-not-resolved",
        } as const;
      }
      const coreManifest = yield* readManifest(path.join(coreDirectory, "package.json"));
      if (coreManifest.name !== "effect-build" || typeof coreManifest.version !== "string") {
        return {
          id: "effect-build-core",
          kind: "provider-core-peer",
          inputsKey: `effect-build:invalid|provider@${own.manifest.version}`,
          state: "Indeterminate",
          reason: "core-package-manifest-invalid",
        } as const;
      }
      const lockstep = coreManifest.version === own.manifest.version;
      return {
        id: "effect-build-core",
        kind: "provider-core-peer",
        inputsKey: `effect-build@${coreManifest.version}|provider@${own.manifest.version}`,
        state: lockstep ? "Compatible" : "Incompatible",
        reason: lockstep ? "core-and-provider-versions-are-lockstep" : "core-and-provider-versions-differ",
      } as const;
    });

    return { identity, host, capabilities, relations, contracts: [coreContract] };
  });
