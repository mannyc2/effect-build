import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";

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

const PortableSegment = Schema.String.check(
  Schema.makeFilter((part) =>
    (part !== "" && part !== "." && part !== "..") || "empty and traversal segments are forbidden"
  ),
  Schema.makeFilter((part) =>
    (![...part].some((character) => character.charCodeAt(0) < 32) && !/[<>:"|?*]/u.test(part))
    || "control characters and Windows-reserved characters are forbidden"
  ),
  Schema.makeFilter((part) => !/[ .]$/u.test(part) || "segments cannot end with a dot or space"),
  Schema.makeFilter((part) =>
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)
    || "Windows device names are forbidden"
  ),
);

// Decode segments in order so the first invalid segment determines the diagnostic.
const PortablePath = Schema.String.check(
  Schema.makeFilter((path) => (!path.startsWith("/") && !/^[a-z]:/iu.test(path)) || "absolute paths are forbidden"),
  Schema.makeFilter((path) => !path.includes("\\") || "paths use '/' separators"),
).pipe(Schema.decodeTo(
  Schema.Array(PortableSegment),
  SchemaTransformation.transform<readonly string[], string>({
    decode: (path) => path.split("/"),
    encode: (segments) => segments.join("/"),
  }),
));

const decodePortablePath = Schema.decodeEffect(PortablePath);
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

/** Validates relative leaf file/symlink paths; directories are implicit prefixes.
 * Rejects Windows device names and separators, and NFC/case/prefix collisions.
 * Empty directories have no representation in this operation. */
export const validatePortable = Effect.fn("Layout.validatePortable")(function*(paths: readonly string[]) {
  const indexed = new Map<string, { readonly path: string; readonly leaf: boolean }>();
  for (const path of paths) {
    const segments = yield* decodePortablePath(path).pipe(Effect.mapError((error) =>
      LayoutError.make({
        path,
        reason: InvalidPath.make({ detail: formatIssue(error.issue).issues[0]?.message ?? error.message }),
      })
    ));
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
