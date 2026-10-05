import { dual } from "effect/Function";
import { ChildProcess } from "effect/process";

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
