import { makeTargetTable } from "./TargetTable.js";

export const denoTargetTable = makeTargetTable(
  {
    "macos-x64": "x86_64-apple-darwin",
    "macos-aarch64": "aarch64-apple-darwin",
    "linux-x64-gnu": "x86_64-unknown-linux-gnu",
    "linux-aarch64-gnu": "aarch64-unknown-linux-gnu",
    "windows-x64": "x86_64-pc-windows-msvc",
    "windows-aarch64": "aarch64-pc-windows-msvc",
  } as const,
);

export type DenoTarget = typeof denoTargetTable.Target.Type;
