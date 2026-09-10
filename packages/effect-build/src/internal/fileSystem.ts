import { Effect, FileSystem } from "effect";

/** A non-link is the expected EINVAL from readlink, not every failed filesystem operation. */
export const readLink = (path: string) => FileSystem.FileSystem.use((fs) => fs.readLink(path).pipe(
  Effect.catch((error) => {
    const cause = error.cause;
    return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EINVAL"
      ? Effect.succeed(undefined)
      : Effect.fail(error);
  }),
));
