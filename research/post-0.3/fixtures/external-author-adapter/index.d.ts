import type { Author as BorrowedOutputAuthor } from "effect-build/Author/BorrowedOutput";
import type { Author as ExecutableAuthor } from "effect-build/Author/Executable";
import type { Definition } from "effect-build/Author/Tool";

export interface FixtureRequest {
  readonly operation: string;
}

export interface FixtureRefusal {
  readonly _tag: "FixtureOperationRefused";
  readonly operation: string;
  readonly owner: "@fixture/external-author-adapter";
}

export declare const externalAdapter: Readonly<{
  contractSubpaths: readonly [
    "effect-build/Author/Tool",
    "effect-build/Author/BorrowedOutput",
    "effect-build/Author/Executable",
  ];
  tool: Definition<"fixture-archive-tool", FixtureRequest, FixtureRefusal>;
  borrowedOutput: BorrowedOutputAuthor<FixtureRefusal>;
  executable: ExecutableAuthor<FixtureRefusal>;
}>;
