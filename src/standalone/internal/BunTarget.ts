import { makeTargetTable } from "./TargetTable.js";

export const bunTargetTable = makeTargetTable(
  {
    "macos-x64": "bun-darwin-x64",
    "macos-aarch64": "bun-darwin-arm64",
    "linux-x64-gnu": "bun-linux-x64",
    "linux-x64-musl": "bun-linux-x64-musl",
    "linux-aarch64-gnu": "bun-linux-arm64",
    "windows-x64": "bun-windows-x64",
  } as const,
);

export type BunTarget = typeof bunTargetTable.Target.Type;
