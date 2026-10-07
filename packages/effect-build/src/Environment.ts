import { Redacted } from "effect";
import { dual } from "effect/Function";
import { ChildProcess } from "effect/process";

/** Environment values for a native command. `Redacted` values are revealed only into the command. */
export type Variables = Readonly<Record<string, string | Redacted.Redacted<string>>>;

/** Reveals `variables` for a command's `env`, and returns the `Redacted` ones for `Tool.RunOptions.redact`. */
export const reveal = (variables: Variables | undefined): {
  readonly env: Record<string, string> | undefined;
  readonly redact: ReadonlyArray<Redacted.Redacted<string>>;
} => {
  if (variables === undefined) return { env: undefined, redact: [] };
  const entries = Object.entries(variables);
  return {
    env: Object.fromEntries(
      entries.map(([name, value]) => [name, typeof value === "string" ? value : Redacted.value(value)]),
    ),
    redact: entries.flatMap(([, value]) => typeof value === "string" ? [] : [value]),
  };
};

/** Replaces the environment of every native command leaf with only the supplied values.
 * Obtain values through Config at the application edge; no host environment is merged. */
export const scrub: {
  (allowed: Readonly<Record<string, string>>): (command: ChildProcess.Command) => ChildProcess.Command;
  (command: ChildProcess.Command, allowed: Readonly<Record<string, string>>): ChildProcess.Command;
} = dual(2, (command: ChildProcess.Command, allowed: Readonly<Record<string, string>>): ChildProcess.Command => {
  switch (command._tag) {
    case "StandardCommand":
      return ChildProcess.make(command.command, command.args, {
        ...command.options,
        env: { ...allowed },
        extendEnv: false,
      });
    case "PipedCommand":
      return ChildProcess.pipeTo(scrub(command.left, allowed), scrub(command.right, allowed), command.options);
  }
});
