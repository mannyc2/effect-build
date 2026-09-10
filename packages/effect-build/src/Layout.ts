/** A shipping path's filesystem role; payloads and provider metadata stay with their owner. */
export interface Entry {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink";
}

export interface Issue {
  readonly path: string;
  readonly reason: string;
}

/** Normalized relative shipping paths use '/', without traversal or a trailing separator. */
export const pathIssue = (path: string): string | undefined => {
  if (path.length === 0) return "path is empty";
  if (path.includes("\0")) return "NUL is forbidden";
  if (path.includes("\\")) return "backslashes are forbidden; shipping paths use '/'";
  if (path.startsWith("/") || /^[a-z]:/iu.test(path)) return "absolute paths are forbidden";
  const segments = path.split("/");
  if (segments.some((part) => part === "")) return "empty path segments are forbidden";
  if (segments.some((part) => part === "." || part === "..")) return "'.' and '..' path segments are forbidden";
  return undefined;
};

/**
 * Every explicit or implicit directory has one spelling under NFC/case folding,
 * and only directories may have descendants. Input order does not affect validity.
 * Local Artifact.directory observations remain free to record host-specific names.
 */
export const validate = (entries: readonly Entry[]): Issue | undefined => {
  const indexed = new Map<string, Entry & { readonly explicit: boolean }>();
  for (const entry of entries) {
    const reason = pathIssue(entry.path);
    if (reason !== undefined) return { path: entry.path, reason };
    const parts = entry.path.split("/");
    for (let length = 1; length <= parts.length; length++) {
      const path = parts.slice(0, length).join("/");
      const key = path.normalize("NFC").toLowerCase();
      const explicit = length === parts.length;
      const kind = explicit ? entry.kind : "directory";
      const previous = indexed.get(key);
      if (previous !== undefined) {
        if (previous.path !== path) {
          return {
            path: entry.path,
            reason: `case/Unicode-normalization collision with ${JSON.stringify(previous.path)}`,
          };
        }
        if (explicit && previous.explicit) return { path: entry.path, reason: `duplicates ${JSON.stringify(path)}` };
        if (previous.kind !== "directory" || kind !== "directory") {
          return { path: entry.path, reason: `non-directory entry ${JSON.stringify(path)} has descendants` };
        }
      }
      indexed.set(key, { path, kind, explicit: explicit || previous?.explicit === true });
    }
  }
  return undefined;
};
