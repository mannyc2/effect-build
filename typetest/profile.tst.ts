import type { Crypto, Effect, FileSystem, Layer, Path, Scope } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as BunProfile from "../packages/effect-build-bun/src/Profile.js";
import * as EsbuildProfile from "../packages/effect-build-esbuild/src/Profile.js";
import * as RolldownProfile from "../packages/effect-build-rolldown/src/Profile.js";
import * as NodeMain from "../packages/effect-build/src/Author/NodeMain.js";
import type * as BuildError from "../packages/effect-build/src/BuildError.js";
import * as StaticBrowserApplication from "../packages/effect-build/src/Profile/StaticBrowserApplication.js";

type Assert<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type PortableServices = NodeMain.Producer | StaticBrowserApplication.Provider;

const sealed = NodeMain.seal({
  protocol: NodeMain.profile,
  entrypoint: "main.ts",
  format: "module",
});
export type _NodeMain = Assert<
  Same<
    typeof sealed,
    Effect.Effect<
      NodeMain.SealedNodeMain,
      NodeMain.SealError,
      NodeMain.Producer | Scope.Scope | FileSystem.FileSystem | Path.Path | Crypto.Crypto
    >
  >
>;

const browser = StaticBrowserApplication.build({
  request: { protocol: StaticBrowserApplication.protocol, entrypoint: "main.ts", resources: [] },
  generationRoot: "dist/browser",
});
export type _Browser = Assert<
  Same<
    typeof browser,
    Effect.Effect<
      StaticBrowserApplication.StaticBrowserApplication,
      StaticBrowserApplication.BuildError,
      StaticBrowserApplication.Provider | Crypto.Crypto | FileSystem.FileSystem | Path.Path
    >
  >
>;

export type _BunLayer = Assert<
  Same<
    ReturnType<typeof BunProfile.layer>,
    Layer.Layer<
      PortableServices,
      | BuildError.ToolFailed
      | BuildError.ArtifactInvalid
      | BuildError.SelectedToolChanged
      | BuildError.ToolNotFound
      | BuildError.PortableUnsupported,
      Crypto.Crypto | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
    >
  >
>;
export type _EsbuildLayer = Assert<
  Same<typeof EsbuildProfile.layer, Layer.Layer<PortableServices, never, Path.Path | FileSystem.FileSystem>>
>;
export type _RolldownLayer = Assert<
  Same<typeof RolldownProfile.layer, Layer.Layer<PortableServices, never, Path.Path | FileSystem.FileSystem>>
>;

// @ts-expect-error! protocol majors are closed, literal contracts.
NodeMain.seal({ protocol: "effect-build/profile/node-main@2", entrypoint: "main.ts", format: "module" });
// @ts-expect-error! browser profile requests require the exact protocol.
StaticBrowserApplication.build({ request: { entrypoint: "main.ts", resources: [] }, generationRoot: "dist" });
