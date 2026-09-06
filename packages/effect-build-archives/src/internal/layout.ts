import type { UnsafeArchiveLayout } from "../ArchiveError.js";
import { UnsafeArchiveLayout as UnsafeArchiveLayoutError } from "../ArchiveError.js";
import type { Entry } from "./archive.js";

const drive = /^[a-z]:/i;

const invalid = (path: string, reason: string): UnsafeArchiveLayout => new UnsafeArchiveLayoutError({ path, reason });

export const normalizeEntryPath = (
  candidate: string,
  kind: Entry["kind"],
): string | UnsafeArchiveLayout => {
  if (candidate.length === 0) return invalid(candidate, "path is empty");
  if (candidate.includes("\0")) return invalid(candidate, "NUL is forbidden");
  if (candidate.includes("\\")) return invalid(candidate, "backslashes are forbidden; archive paths use '/'");
  if (candidate.startsWith("/") || drive.test(candidate)) return invalid(candidate, "absolute paths are forbidden");
  const withoutDirectorySuffix = kind === "directory" ? candidate.replace(/\/$/, "") : candidate;
  if (withoutDirectorySuffix.endsWith("/")) return invalid(candidate, "only directory entries may end in '/'");
  const segments = withoutDirectorySuffix.split("/");
  if (segments.some((segment) => segment === "")) return invalid(candidate, "empty path segments are forbidden");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return invalid(candidate, "'.' and '..' path segments are forbidden");
  }
  return withoutDirectorySuffix;
};

const canonical = (path: string): string => path.normalize("NFC").toLowerCase();

export type LayoutValidation =
  | { readonly _tag: "Valid"; readonly entries: readonly Entry[] }
  | { readonly _tag: "Invalid"; readonly error: UnsafeArchiveLayout };

export const validateLayout = (entries: readonly Entry[]): LayoutValidation => {
  const indexed = new Map<string, Entry>();
  const normalized: Entry[] = [];
  for (const entry of entries) {
    const path = normalizeEntryPath(entry.path, entry.kind);
    if (typeof path !== "string") return { _tag: "Invalid", error: path };
    const folded = canonical(path);
    const previous = indexed.get(folded);
    if (previous !== undefined) {
      return {
        _tag: "Invalid",
        error: invalid(
          path,
          previous.path === path
            ? `duplicates ${JSON.stringify(previous.path)}`
            : `case/Unicode-normalization collision with ${JSON.stringify(previous.path)}`,
        ),
      };
    }
    const normalizedEntry = { ...entry, path };
    indexed.set(folded, normalizedEntry);
    normalized.push(normalizedEntry);
  }
  for (const entry of normalized) {
    const segments = canonical(entry.path).split("/");
    for (let length = 1; length < segments.length; length++) {
      const parent = segments.slice(0, length).join("/");
      const parentEntry = indexed.get(parent);
      if (parentEntry !== undefined && parentEntry.kind !== "directory") {
        return {
          _tag: "Invalid",
          error: invalid(entry.path, `descends through non-directory entry ${JSON.stringify(parentEntry.path)}`),
        };
      }
    }
  }
  return { _tag: "Valid", entries: normalized };
};

export const withoutPaths = (entries: readonly Entry[], excluded: ReadonlySet<string>): readonly Entry[] =>
  entries.filter((entry) => {
    for (const path of excluded) {
      if (entry.path === path || entry.path.startsWith(`${path}/`)) return false;
    }
    return true;
  });
