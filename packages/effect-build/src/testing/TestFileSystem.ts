import { Effect, FileSystem, Layer, PlatformError } from "effect";

export interface Fault {
  /** One-based invocation to fail. Other invocations reach the real filesystem. */
  readonly call: number;
  readonly error?: string | undefined;
}
export type Operation = "rename" | "link" | "remove" | "makeTempDirectory" | "chmod";
export type Faults = Readonly<Partial<Record<Operation, Fault | readonly Fault[]>>>;

/** Fresh counters per layer build; an array can exercise commit failure followed by rollback failure. */
export const failing = (faults: Faults): Layer.Layer<FileSystem.FileSystem, never, FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) => {
      const wrap = <Args extends readonly unknown[], A, E, R>(
        operation: Operation,
        run: (...args: Args) => Effect.Effect<A, E, R>,
      ) => {
        let calls = 0;
        const configured = faults[operation];
        const failures: readonly Fault[] = configured === undefined
          ? []
          : Array.isArray(configured)
          ? configured
          : [configured as Fault];
        return (...args: Args): Effect.Effect<A, E | PlatformError.PlatformError, R> =>
          Effect.suspend<A, E | PlatformError.PlatformError, R>(() => {
            calls++;
            const fault = failures.find((failure) => failure.call === calls);
            return fault === undefined ? run(...args) : Effect.fail(PlatformError.systemError({
              _tag: "Unknown",
              module: "FileSystem",
              method: operation,
              description: fault.error ?? `injected ${operation} failure on call ${calls}`,
            }));
          });
      };
      return {
        ...fs,
        rename: wrap("rename", fs.rename),
        link: wrap("link", fs.link),
        remove: wrap("remove", fs.remove),
        makeTempDirectory: wrap("makeTempDirectory", fs.makeTempDirectory),
        chmod: wrap("chmod", fs.chmod),
      };
    }),
  );
