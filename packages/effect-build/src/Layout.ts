import { Effect, Schema } from "effect";

export class InvalidPath extends Schema.TaggedError<InvalidPath>()("InvalidPath", {
  detail: Schema.String,
}) {}

export class Collision extends Schema.TaggedError<Collision>()("Collision", {
  previous: Schema.String,
}) {}

export class LayoutError extends Schema.TaggedError<LayoutError>()("LayoutError", {
  path: Schema.String,
  reason: Schema.Union([InvalidPath, Collision]),
}) {
  override get message(): string {
    switch (this.reason._tag) {
      case "InvalidPath":
        return `Invalid portable path ${this.path}: ${this.reason.detail}`;
      case "Collision":
        return `Portable path ${this.path} collides with ${this.reason.previous}`;
    }
  }
}

const pathIssue = (path: string): string | undefined => {
  if (path.startsWith("/") || /^[a-z]:/iu.test(path)) return "absolute paths are forbidden";
  if (path.includes("\\")) return "paths use '/' separators";
  for (const part of path.split("/")) {
    if (part === "" || part === "." || part === "..") return "empty and traversal segments are forbidden";
    if ([...part].some((character) => character.charCodeAt(0) < 32) || /[<>:"|?*]/u.test(part)) {
      return "control characters and Windows-reserved characters are forbidden";
    }
    if (/[ .]$/u.test(part)) return "segments cannot end with a dot or space";
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)) return "Windows device names are forbidden";
  }
  return undefined;
};

/** Validates relative leaf file/symlink paths; directories are implicit prefixes.
 * Rejects Windows device names and separators, and NFC/case/prefix collisions.
 * Empty directories have no representation in this operation. */
export const validatePortable = Effect.fn("Layout.validatePortable")(function*(paths: readonly string[]) {
  const indexed = new Map<string, { readonly path: string; readonly leaf: boolean }>();
  for (const path of paths) {
    const detail = pathIssue(path);
    if (detail !== undefined) return yield* LayoutError.make({ path, reason: InvalidPath.make({ detail }) });
    const segments = path.split("/");
    for (let length = 1; length <= segments.length; length++) {
      const prefix = segments.slice(0, length).join("/");
      const key = prefix.normalize("NFC").toLowerCase();
      const leaf = length === segments.length;
      const previous = indexed.get(key);
      if (previous !== undefined && (previous.path !== prefix || previous.leaf || leaf)) {
        return yield* LayoutError.make({ path, reason: Collision.make({ previous: previous.path }) });
      }
      indexed.set(key, { path: prefix, leaf });
    }
  }
});
