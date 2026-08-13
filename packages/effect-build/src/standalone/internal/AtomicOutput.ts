import { Effect, type FileSystem, type Path, type PlatformError, type Scope, Semaphore } from "effect";
import { OutputLocked, PublicationFailed } from "../BuildError.js";

export interface AtomicOutput {
  readonly destination: string;
  readonly staged: string;
  readonly commit: Effect.Effect<void, OutputLocked | PublicationFailed>;
}

export interface AcquireAtomicOutputOptions {
  readonly outfile: string;
  readonly cwd?: string;
  readonly executableSuffix?: "" | ".exe";
}

/** Rename failures with these reasons indicate the destination is locked, not broken. */
const lockedReasons = new Set(["Busy", "PermissionDenied", "WouldBlock"]);
const lockedErrnoCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
const publicationSemaphore = Semaphore.makeUnsafe(1);

const errnoCode = (error: PlatformError.PlatformError): string | undefined => {
  const cause = "cause" in error.reason ? error.reason.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
};

/** The Node adapter currently reports Windows rename EPERM as Unknown. */
export const isLockedRenameError = (error: PlatformError.PlatformError): boolean =>
  lockedReasons.has(error.reason._tag)
  || (error.reason._tag === "Unknown" && lockedErrnoCodes.has(errnoCode(error) ?? ""));

const publicationFailed =
  (path: string, operation: string) => (error: PlatformError.PlatformError): PublicationFailed =>
    new PublicationFailed({ path, operation, reason: error.message });

/** Windows executables must carry an `.exe` suffix for the staged artifact. */
const withExeSuffix = (basename: string, executableSuffix: "" | ".exe" | undefined): string =>
  executableSuffix === ".exe" && !basename.toLowerCase().endsWith(".exe")
    ? `${basename}.exe`
    : basename;

export const acquireAtomicOutput = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  options: AcquireAtomicOutputOptions,
): Effect.Effect<AtomicOutput, PublicationFailed, Scope.Scope> =>
  Effect.gen(function*() {
    const destination = path.normalize(path.resolve(options.cwd ?? "", options.outfile));
    const parent = path.dirname(destination);

    yield* fileSystem
      .makeDirectory(parent, { recursive: true })
      .pipe(Effect.mapError(publicationFailed(destination, "make-directory")));

    const stagingDirectory = yield* fileSystem
      .makeTempDirectoryScoped({ directory: parent, prefix: ".effect-build-" })
      .pipe(Effect.mapError(publicationFailed(destination, "make-staging")));

    const staged = path.join(
      stagingDirectory,
      withExeSuffix(path.basename(destination), options.executableSuffix),
    );

    const commit = publicationSemaphore.withPermit(fileSystem.rename(staged, destination)).pipe(
      Effect.mapError((error) =>
        isLockedRenameError(error)
          ? new OutputLocked({ path: destination })
          : publicationFailed(destination, "rename")(error)
      ),
    );

    return { destination, staged, commit };
  });
