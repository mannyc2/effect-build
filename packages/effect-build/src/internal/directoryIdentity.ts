import { sha256 as incrementalSha256 } from "@noble/hashes/sha2.js";
import { Encoding } from "effect";
import type * as Artifact from "../Artifact.js";

const encoder = new TextEncoder();
// Directory identity is SHA-256 of UTF-8 JSON tuples in this exact field order.
// The root mode is carried beside the digest and verified separately.
export const manifestDigest = (entries: readonly Artifact.HashedEntry[]): Artifact.Sha256 => {
  const hash = incrementalSha256.create().update(encoder.encode("["));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (i > 0) hash.update(encoder.encode(","));
    hash.update(encoder.encode(JSON.stringify([e.kind, e.mode, e.bytes, e.kind === "file" ? e.sha256 : undefined, e.linkTarget, e.path])));
  }
  return Encoding.encodeHex(hash.update(encoder.encode("]")).digest()) as Artifact.Sha256;
};

