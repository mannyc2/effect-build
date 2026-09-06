import { expect } from "tstyche";
import * as Archive from "../packages/effect-build-archives/src/Archive.js";
import * as Nfpm from "../packages/effect-build-nfpm/src/Package.js";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as File from "../packages/effect-build/src/Author/File.js";

declare const file: Artifact.HashedFile;
declare const executable: Artifact.HashedExecutable;
declare const unhashed: Artifact.UnhashedExecutable;
declare const candidate: Artifact.HashedFileObservation;
expect<File.VerifiedInput>().type.toBe<Artifact.HashedFile | Artifact.HashedExecutable>();
expect<Archive.ArchiveEntry["artifact"]>().type.toBe<File.VerifiedInput>();
expect<Nfpm.PackageContent["artifact"]>().type.toBe<File.VerifiedInput>();
new Archive.ArchiveEntry({ artifact: file, path: "payload" });
new Archive.ArchiveEntry({ artifact: executable, path: "tool", executable: true });
new Nfpm.PackageContent({ artifact: executable, dst: "/usr/bin/tool" });
// @ts-expect-error! Unhashed bytes cannot enter a verified consumer.
new Archive.ArchiveEntry({ artifact: unhashed, path: "tool" });
// @ts-expect-error! Candidate observations have no durable publication guarantee.
new Nfpm.PackageContent({ artifact: candidate, dst: "/usr/bin/tool" });
