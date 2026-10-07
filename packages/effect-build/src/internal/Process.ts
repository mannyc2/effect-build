import { Effect, PlatformError, Predicate } from "effect";
import type { ChildProcess } from "effect/process";

export const checkBound = Effect.fnUntraced(function*(bound: number, name: string) {
  if (!Number.isSafeInteger(bound) || bound < 0) {
    return yield* Effect.die(new RangeError(`${name} must be a non-negative safe integer`));
  }
});

const leaves = (command: ChildProcess.Command): ReadonlyArray<ChildProcess.StandardCommand> =>
  command._tag === "PipedCommand" ? [...leaves(command.left), ...leaves(command.right)] : [command];

export const lastCommand = (command: ChildProcess.Command): ChildProcess.StandardCommand =>
  command._tag === "PipedCommand" ? lastCommand(command.right) : command;

/** Only the last stage's descriptors are exposed by a native pipeline handle. */
export const commandOutputFds = (command: ChildProcess.Command): ReadonlyArray<number> =>
  Object.entries(lastCommand(command).options.additionalFds ?? {})
    .filter(([, config]) => config.type === "output")
    .map(([key]) => Number(key.slice(2)));

const escapeRegExp = (value: string) => value.replace(/[$()*+.?[\\\]^{|}]/gu, "\\$&");

/** Rebuild rather than retaining platform causes, which include spawnargs and command-line syscalls. */
export const sanitize = (command: ChildProcess.Command) => {
  const commands = leaves(command);
  const executables = new Set(commands.map((leaf) => leaf.command));
  const executable = [...executables].join(" | ");
  const values = commands.flatMap((leaf) => [...leaf.args, ...Object.values(leaf.options.env ?? {})])
    .filter(Predicate.isString).filter((value) => value.length > 0 && !executables.has(value))
    .sort((left, right) => right.length - left.length);
  // Whole tokens only: a short argument such as `in` must not rewrite the `bin` of an executable path.
  const tokens = values.map((value) =>
    new RegExp(`(^|[\\s"'\`=,(\\[])${escapeRegExp(value)}(?=$|[\\s"'\`,:;)\\]])`, "gu")
  );
  const scrub = (message: string): string =>
    tokens.reduce((text, token) => text.replace(token, "$1<redacted>"), message);
  return (error: PlatformError.PlatformError): PlatformError.PlatformError => {
    const reason = error.reason;
    // Native errno messages preserve useful signal names. The original cause and syscall never survive.
    let description = reason.description;
    if (Predicate.isError(reason.cause)) description = reason.cause.message;
    if (description !== undefined) description = scrub(description);
    const fields = { module: scrub(reason.module), method: scrub(reason.method), description };
    if (reason._tag === "BadArgument") return PlatformError.badArgument(fields);
    return PlatformError.systemError({ ...fields, _tag: reason._tag, pathOrDescriptor: executable });
  };
};
