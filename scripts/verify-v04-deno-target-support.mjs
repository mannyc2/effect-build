import { verifyTargetSupport } from "./verify-target-support.mjs";

await verifyTargetSupport({ compiler: "deno", stagedDeno: true });
