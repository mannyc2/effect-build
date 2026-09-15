import { NodePath } from "@effect/platform-node";

/** Path semantics independent of the test host. Requires the optional platform-node peer. */
export const win32 = NodePath.layerWin32;
export const posix = NodePath.layerPosix;
