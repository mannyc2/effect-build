import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as Artifact from "./Artifact.js";
import * as Lifecycle from "./internal/Lifecycle.js";
import * as Tool from "./internal/Tool.js";

export interface Resource {
  readonly artifact: Artifact.FileArtifact<"resource"> | Artifact.TreeArtifact<"resource">;
  /** Relative path below `Contents/Resources`, using `/` separators. */
  readonly destination: string;
}

export interface CreateInput {
  readonly executable: Artifact.FileArtifact<"mach-o">;
  readonly resources?: readonly Resource[];
  /** Destination ending in `.app`, resolved against the current working directory. */
  readonly outfile: string;
  readonly bundleIdentifier: string;
  readonly bundleName: string;
  readonly executableName: string;
  readonly version: string;
  readonly shortVersion: string;
  readonly minimumSystemVersion: string;
}

export interface LayerOptions {
  readonly dittoPath?: string;
  readonly plutilPath?: string;
}

export type CreateResult = Artifact.MutationResult<Artifact.TreeArtifact<"app-bundle">>;
export type CreateError =
  | Artifact.UnsupportedArtifactKind
  | Artifact.AppleInputInvalid
  | Artifact.ArtifactPublishFailed
  | Artifact.ArtifactError
  | Lifecycle.LifecycleError
  | Artifact.ToolError;

interface Service {
  readonly create: (input: CreateInput) => Effect.Effect<CreateResult, CreateError>;
}

export class Creator extends Context.Service<Creator, Service>()("effect-build-apple/AppBundle/Creator") {}

const operation = "app-bundle.create";
const bundleIdentifierPattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u;
const bundleVersionPattern = /^(?:0|[1-9]\d{0,3})(?:\.(?:0|[1-9]\d?)){0,2}$/u;
const shortVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const systemVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/u;
const containsXmlControl = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d;
  });

const failInput = (field: string, reason: string): Artifact.AppleInputInvalid =>
  new Artifact.AppleInputInvalid({ operation, field, reason });
const actualKind = (value: unknown): string =>
  typeof value === "object" && value !== null && "kind" in value ? String(value.kind) : "unknown";

const validateText = (field: string, value: string): Effect.Effect<void, Artifact.AppleInputInvalid> => {
  if (value.length === 0) return Effect.fail(failInput(field, "must not be empty"));
  if (containsXmlControl(value)) {
    return Effect.fail(failInput(field, "contains a character XML property lists cannot encode"));
  }
  return Effect.void;
};

const validateRelativeResourcePath = (
  destination: string,
): Effect.Effect<void, Artifact.AppleInputInvalid> => {
  if (destination.length === 0) return Effect.fail(failInput("resources.destination", "must not be empty"));
  if (destination.startsWith("/") || destination.includes("\\")) {
    return Effect.fail(failInput("resources.destination", "must be a relative path using / separators"));
  }
  const segments = destination.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return Effect.fail(failInput("resources.destination", "must not contain empty, . or .. path segments"));
  }
  if (containsXmlControl(destination)) {
    return Effect.fail(failInput("resources.destination", "contains an unsupported control character"));
  }
  return Effect.void;
};

const validateResources = (resources: readonly Resource[]): Effect.Effect<void, Artifact.AppleInputInvalid> =>
  Effect.gen(function*() {
    const destinations: string[] = [];
    for (const resource of resources) {
      yield* validateRelativeResourcePath(resource.destination);
      const folded = resource.destination.toLocaleLowerCase("en-US");
      for (const existing of destinations) {
        if (folded === existing || folded.startsWith(`${existing}/`) || existing.startsWith(`${folded}/`)) {
          return yield* Effect.fail(
            failInput("resources.destination", `conflicts with another resource path: ${resource.destination}`),
          );
        }
      }
      destinations.push(folded);
    }
  });

const validateInput = (
  input: CreateInput,
): Effect.Effect<void, Artifact.UnsupportedArtifactKind | Artifact.AppleInputInvalid> =>
  Effect.gen(function*() {
    if (!Artifact.isFileArtifact(input.executable) || !Artifact.isKind(input.executable, "mach-o")) {
      return yield* Effect.fail(
        new Artifact.UnsupportedArtifactKind({
          operation,
          expected: ["mach-o file"],
          actual: actualKind(input.executable),
        }),
      );
    }
    if (!input.outfile.endsWith(".app")) yield* Effect.fail(failInput("outfile", "must end in .app"));
    yield* validateText("bundleIdentifier", input.bundleIdentifier);
    if (!bundleIdentifierPattern.test(input.bundleIdentifier)) {
      yield* Effect.fail(
        failInput("bundleIdentifier", "must be a period-separated identifier using letters, digits, or hyphens"),
      );
    }
    yield* validateText("bundleName", input.bundleName);
    yield* validateText("executableName", input.executableName);
    if (
      input.executableName === "." || input.executableName === ".." || input.executableName.includes("/")
      || input.executableName.includes("\\")
    ) {
      yield* Effect.fail(failInput("executableName", "must be one file name"));
    }
    yield* validateText("version", input.version);
    if (!bundleVersionPattern.test(input.version)) {
      yield* Effect.fail(failInput("version", "must be one to three release integers in Apple CFBundleVersion form"));
    }
    yield* validateText("shortVersion", input.shortVersion);
    if (!shortVersionPattern.test(input.shortVersion)) {
      yield* Effect.fail(failInput("shortVersion", "must be exactly three period-separated release integers"));
    }
    yield* validateText("minimumSystemVersion", input.minimumSystemVersion);
    if (!systemVersionPattern.test(input.minimumSystemVersion)) {
      yield* Effect.fail(
        failInput("minimumSystemVersion", "must be a two- or three-component macOS release version"),
      );
    }
    for (const resource of input.resources ?? []) {
      if (
        (!Artifact.isFileArtifact(resource.artifact) && !Artifact.isTreeArtifact(resource.artifact))
        || !Artifact.isKind(resource.artifact, "resource")
      ) {
        return yield* Effect.fail(
          new Artifact.UnsupportedArtifactKind({
            operation,
            expected: ["resource file or tree"],
            actual: actualKind(resource.artifact),
          }),
        );
      }
    }
    yield* validateResources(input.resources ?? []);
  });

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const plistEntry = (key: string, value: string): string =>
  `  <key>${key}</key>\n  <string>${escapeXml(value)}</string>\n`;

const renderInfoPlist = (input: CreateInput): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n`
  + `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n`
  + `<plist version="1.0">\n`
  + `<dict>\n`
  + plistEntry("CFBundleDisplayName", input.bundleName)
  + plistEntry("CFBundleExecutable", input.executableName)
  + plistEntry("CFBundleIdentifier", input.bundleIdentifier)
  + plistEntry("CFBundleInfoDictionaryVersion", "6.0")
  + plistEntry("CFBundleName", input.bundleName)
  + plistEntry("CFBundlePackageType", "APPL")
  + plistEntry("CFBundleShortVersionString", input.shortVersion)
  + plistEntry("CFBundleVersion", input.version)
  + plistEntry("LSMinimumSystemVersion", input.minimumSystemVersion)
  + `</dict>\n`
  + `</plist>\n`;

const fsFailure = (destination: string, action: string, error: unknown): Artifact.ArtifactPublishFailed =>
  new Artifact.ArtifactPublishFailed({
    destination,
    reason: `${action}: ${error instanceof Error ? error.message : String(error)}`,
  });

const makeService = (
  options: LayerOptions = {},
): Effect.Effect<
  Service,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const ditto = yield* Tool.select({ name: "ditto", path: options.dittoPath ?? "/usr/bin/ditto" });
    const plutil = yield* Tool.select({ name: "plutil", path: options.plutilPath ?? "/usr/bin/plutil" });
    const services = Context.make(FileSystem.FileSystem, fileSystem).pipe(
      Context.add(Path.Path, path),
      Context.add(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    const create = Effect.fn("effect-build-apple/AppBundle.create")(function*(input: CreateInput) {
      yield* validateInput(input);
      const resources = input.resources ?? [];
      const inputs: readonly Artifact.Artifact[] = [input.executable, ...resources.map(({ artifact }) => artifact)];
      return yield* Lifecycle.publishConstructedTree({
        operation,
        inputs,
        destination: input.outfile,
        kind: "app-bundle",
        copyTool: ditto,
        produce: ({ inputs: snapshots, stagedPath }) =>
          Effect.gen(function*() {
            const contents = path.join(stagedPath, "Contents");
            const macos = path.join(contents, "MacOS");
            const resourcesRoot = path.join(contents, "Resources");
            yield* fileSystem.makeDirectory(macos, { recursive: true }).pipe(
              Effect.mapError((error) => fsFailure(stagedPath, "create app bundle directories", error)),
            );
            if (resources.length > 0) {
              yield* fileSystem.makeDirectory(resourcesRoot, { recursive: true }).pipe(
                Effect.mapError((error) => fsFailure(stagedPath, "create resource directory", error)),
              );
            }

            const executableSnapshot = snapshots[0]!;
            const executableDestination = path.join(macos, input.executableName);
            const toolInvocations: Artifact.ToolInvocation[] = [];
            toolInvocations.push(
              yield* Tool.runOrFail({
                tool: ditto,
                args: ["--norsrc", "--noextattr", "--noacl", executableSnapshot.path, executableDestination],
              }),
            );
            const executableStat = yield* fileSystem.stat(executableDestination).pipe(
              Effect.mapError((error) => fsFailure(stagedPath, "stat copied executable", error)),
            );
            if ((executableStat.mode & 0o7777) !== input.executable.identity.mode) {
              return yield* Effect.fail(
                new Artifact.ArtifactPublishFailed({
                  destination: stagedPath,
                  reason: `executable mode changed from ${input.executable.identity.mode.toString(8)} to ${
                    (executableStat.mode & 0o7777).toString(8)
                  }`,
                }),
              );
            }

            for (let index = 0; index < resources.length; index += 1) {
              const resource = resources[index]!;
              const snapshot = snapshots[index + 1]!;
              const destination = path.join(resourcesRoot, ...resource.destination.split("/"));
              yield* fileSystem.makeDirectory(path.dirname(destination), { recursive: true }).pipe(
                Effect.mapError((error) => fsFailure(stagedPath, "create resource parent directory", error)),
              );
              toolInvocations.push(
                yield* Tool.runOrFail({
                  tool: ditto,
                  args: ["--norsrc", "--noextattr", "--noacl", snapshot.path, destination],
                }),
              );
            }

            const plist = path.join(contents, "Info.plist");
            yield* fileSystem.writeFileString(plist, renderInfoPlist(input)).pipe(
              Effect.mapError((error) => fsFailure(stagedPath, "write Info.plist", error)),
            );
            toolInvocations.push(yield* Tool.runOrFail({ tool: plutil, args: ["-lint", plist] }));
            return toolInvocations;
          }),
      });
    });

    return { create: (input) => create(input).pipe(Effect.provide(services)) };
  });

export const create = (input: CreateInput): Effect.Effect<CreateResult, CreateError, Creator> =>
  Creator.use((service) => service.create(input));

export const layer = (
  options?: LayerOptions,
): Layer.Layer<
  Creator,
  Artifact.ToolError,
  Artifact.ArtifactServices | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Creator, makeService(options));
