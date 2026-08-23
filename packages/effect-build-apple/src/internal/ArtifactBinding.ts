import type {
  Artifact,
  FileArtifact,
  FileArtifactKind,
  FileIdentity,
  TreeArtifact,
  TreeArtifactKind,
  TreeIdentity,
} from "../Artifact.js";

const authenticated = new WeakSet<object>();

export const file = <K extends FileArtifactKind>(
  kind: K,
  path: string,
  identity: FileIdentity,
): FileArtifact<K> => {
  const artifact = Object.freeze({ _tag: "FileArtifact" as const, kind, path, identity }) as FileArtifact<K>;
  authenticated.add(artifact);
  return artifact;
};

export const tree = <K extends TreeArtifactKind>(
  kind: K,
  path: string,
  identity: TreeIdentity,
): TreeArtifact<K> => {
  const artifact = Object.freeze({ _tag: "TreeArtifact" as const, kind, path, identity }) as TreeArtifact<K>;
  authenticated.add(artifact);
  return artifact;
};

export const relocate = <A extends Artifact>(artifact: A, path: string): A =>
  (artifact._tag === "FileArtifact"
    ? file(artifact.kind, path, artifact.identity)
    : tree(artifact.kind, path, artifact.identity)) as A;

export const has = (artifact: Artifact): boolean => authenticated.has(artifact);
