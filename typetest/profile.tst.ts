import { type Crypto, Effect, type FileSystem, type Path } from "effect";
import type * as Artifact from "../packages/effect-build/src/Artifact.js";
import * as BorrowedOutput from "../packages/effect-build/src/Author/BorrowedOutput.js";
import type * as NodeMain from "../packages/effect-build/src/Author/NodeMain.js";
import * as BrowserModulePayload from "../packages/effect-build/src/Profile/BrowserModulePayload.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const payload = BrowserModulePayload.withPayload(
  {
    protocol: BrowserModulePayload.protocol,
    entries: [{ id: "application", source: "/source/application.ts" }],
    mode: "production",
    sourceMaps: "linked",
    minify: true,
    external: ["react"],
    conditions: ["browser"],
  },
  (borrowed) => Effect.succeed(borrowed.tree.initial.manifestDigest.value),
);

export type _BrowserModulePayload = Assert<
  Same<
    typeof payload,
    Effect.Effect<
      Artifact.Sha256Value,
      BrowserModulePayload.Error,
      | BrowserModulePayload.Provider
      | BorrowedOutput.CleanupReporter
      | Crypto.Crypto
      | FileSystem.FileSystem
      | Path.Path
    >
  >
>;

declare const borrowed: BrowserModulePayload.Borrowed;
export type _HashedTree = Assert<Same<typeof borrowed.tree, BorrowedOutput.Tree<"hashed">>>;
export type _ProducerIdentity = Assert<Same<typeof borrowed.producer, NodeMain.ProviderIdentity>>;
export type _EntryRole = Assert<
  Same<BrowserModulePayload.FileRole, "entry" | "chunk" | "style" | "asset" | "source-map" | "other">
>;
export type _NoGeneratedHtml = Assert<Same<"html" extends keyof BrowserModulePayload.Borrowed ? true : false, false>>;

BrowserModulePayload.withPayload({
  // @ts-expect-error! protocol majors are closed, literal contracts.
  protocol: "effect-build/profile/browser-module-payload@2",
  entries: [{ id: "application", source: "/source/application.ts" }],
  mode: "production",
  sourceMaps: "linked",
  minify: true,
}, () => Effect.void);

// @ts-expect-error! browser payload requests require explicit module entries and build semantics.
BrowserModulePayload.withPayload({ protocol: BrowserModulePayload.protocol }, () => Effect.void);
