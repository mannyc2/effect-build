import type { Path } from "effect";

const cleanupRoots = new Set<string>();
const durableDestinations = new Set<string>();

const key = (path: Path.Path, value: string): string => path.sep === "\\" ? value.toLowerCase() : value;

export const contains = (path: Path.Path, root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
};

/** Process-local overlap defense; uniquely-created roots remain the cross-process strategy. */
export const claimCleanupRoot = (path: Path.Path, root: string): string | undefined => {
  const claimedRoot = key(path, root);
  for (const active of cleanupRoots) {
    if (contains(path, active, claimedRoot) || contains(path, claimedRoot, active)) {
      return "cleanup root overlaps an active lease";
    }
  }
  for (const destination of durableDestinations) {
    if (contains(path, claimedRoot, destination)) return "cleanup root contains an active durable destination";
  }
  cleanupRoots.add(claimedRoot);
  return undefined;
};

export const releaseCleanupRoot = (path: Path.Path, root: string): void => {
  cleanupRoots.delete(key(path, root));
};

export const claimDurableDestination = (path: Path.Path, destination: string): string | undefined => {
  const claimedDestination = key(path, destination);
  if (durableDestinations.has(claimedDestination)) return "destination is already being published";
  for (const root of cleanupRoots) {
    if (contains(path, root, claimedDestination)) {
      return "destination is inside an active borrowed-output cleanup root";
    }
  }
  durableDestinations.add(claimedDestination);
  return undefined;
};

export const releaseDurableDestination = (path: Path.Path, destination: string): void => {
  durableDestinations.delete(key(path, destination));
};
