import { Effect, Redacted } from "effect";
import { Artifact } from "effect-build";
import * as Windows from "effect-build-windows";

// CI typechecks signing examples; running them requires the caller's signing credentials.
export const signWindowsPackage = (
  artifact: Artifact.File,
  pfxFile: string,
  password: Redacted.Redacted<string>,
  timestampUrl: string,
) => Windows.signMsix({
  artifact, outfile: "dist/signed.msix", kind: "pfx", file: pfxFile, password, timestampUrl,
}).pipe(Effect.provide(Windows.layer()));
