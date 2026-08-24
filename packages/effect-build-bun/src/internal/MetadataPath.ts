import type { Path } from "effect";

type PlatformPath = Pick<Path.Path, "isAbsolute" | "resolve">;

/** Converts Bun metafile path spellings into paths accepted by the host filesystem. */
export const toPlatformMetadataPath = (path: PlatformPath, metadataPath: string): string => {
  const windowsDrivePath = /^[\\/]?[A-Za-z]:[\\/]/u.test(metadataPath);
  const localPath = windowsDrivePath && /^[\\/]/u.test(metadataPath) ? metadataPath.slice(1) : metadataPath;
  if (windowsDrivePath) return localPath;
  return path.isAbsolute(localPath) ? localPath : path.resolve(localPath);
};
