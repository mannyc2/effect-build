import { Effect } from "effect";
import type { Author as BorrowedOutputAuthor } from "effect-build/Author/BorrowedOutput";
import type { Author as ExecutableAuthor } from "effect-build/Author/Executable";
import { decimalBytes, define, type Definition, sha256Digest } from "effect-build/Author/Tool";
import { ChildProcess } from "effect/unstable/process";

export interface FixtureRequest {
  readonly operation: string;
}

export interface FixtureRefusal {
  readonly _tag: "FixtureOperationRefused";
  readonly operation: string;
  readonly owner: "@fixture/plan039-external-author-adapter";
}

const unavailable = (): never => {
  throw new Error("the staged fixture exercises contract identity only");
};

const tool: Definition<"fixture-archive-tool", FixtureRequest, FixtureRefusal> = define({
  observation: {
    name: "fixture-archive-tool",
    participants: [{
      role: "selected-command",
      name: "fixture-archive",
      version: "7.2.0",
      revision: "fixture-r1",
      channel: "stable",
      content: {
        digest: sha256Digest("a".repeat(64)),
        bytes: decimalBytes("4096"),
      },
    }],
    capabilities: [{ _tag: "Present", id: "archive-tree", evidence: "plan039-fixture@1" }],
  },
  evaluate: (request) =>
    request.operation === "archive-tree"
      ? Effect.succeed({ _tag: "ReviewedAdmission", admissionKey: "fixture-archive@7.2.0/archive-tree" })
      : Effect.fail({
        _tag: "FixtureOperationRefused",
        operation: request.operation,
        owner: "@fixture/plan039-external-author-adapter",
      }),
  command: (argv, options) => ChildProcess.make("/fixture/bin/archive", argv, options),
});

const borrowedOutput: BorrowedOutputAuthor<FixtureRefusal> = Object.freeze({
  withFile: unavailable,
  withTree: unavailable,
});

const executable: ExecutableAuthor<FixtureRefusal> = Object.freeze({
  publish: unavailable,
});

export const externalAdapter = Object.freeze({
  contractSubpaths: Object.freeze(
    [
      "effect-build/Author/Tool",
      "effect-build/Author/BorrowedOutput",
      "effect-build/Author/Executable",
    ] as const,
  ),
  tool,
  borrowedOutput,
  executable,
});
