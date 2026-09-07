import { InputInvalid } from "../InputInvalid.js";
import type { Entry } from "./archive.js";

const invalid = (path: string, reason: string): InputInvalid => new InputInvalid({ path, reason });

export const normalizeEntryPath = (candidate: string, kind: Entry["kind"]): string | InputInvalid => {
  if (candidate.length === 0) return invalid(candidate, "path is empty");
  if (candidate.includes("\0")) return invalid(candidate, "NUL is forbidden");
  if (candidate.includes("\\")) return invalid(candidate, "backslashes are forbidden; archive paths use '/'");
  if (candidate.startsWith("/") || /^[a-z]:/i.test(candidate)) return invalid(candidate, "absolute paths are forbidden");
  const path = kind === "directory" ? candidate.replace(/\/$/, "") : candidate;
  if (path.endsWith("/")) return invalid(candidate, "only directory entries may end in '/'");
  const segments = path.split("/");
  if (segments.some((segment) => segment === "")) return invalid(candidate, "empty path segments are forbidden");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return invalid(candidate, "'.' and '..' path segments are forbidden");
  }
  return path;
};

const canonical = (path: string): string => path.normalize("NFC").toLowerCase();

export const validateLayout = (entries: readonly Entry[]): readonly Entry[] | InputInvalid => {
  const indexed = new Map<string, Entry>();
  const normalized: Entry[] = [];
  for (const entry of entries) {
    const path = normalizeEntryPath(entry.path, entry.kind);
    if (typeof path !== "string") return path;
    const folded = canonical(path);
    const previous = indexed.get(folded);
    if (previous !== undefined) {
      return invalid(path, previous.path === path
        ? `duplicates ${JSON.stringify(previous.path)}`
        : `case/Unicode-normalization collision with ${JSON.stringify(previous.path)}`);
    }
    const normalizedEntry = { ...entry, path };
    indexed.set(folded, normalizedEntry);
    normalized.push(normalizedEntry);
  }
  for (const entry of normalized) {
    const segments = canonical(entry.path).split("/");
    for (let length = 1; length < segments.length; length++) {
      const parent = indexed.get(segments.slice(0, length).join("/"));
      if (parent !== undefined && parent.kind !== "directory") {
        return invalid(entry.path, `descends through non-directory entry ${JSON.stringify(parent.path)}`);
      }
    }
  }
  return normalized;
};
