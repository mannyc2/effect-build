import * as BorrowedOutput from "effect-build/Author/BorrowedOutput";
import * as Executable from "effect-build/Author/Executable";
import { decimalBytes, define, sha256Digest } from "effect-build/Author/Tool";

void BorrowedOutput;
void Executable;

const content = (value, bytes) => ({ digest: sha256Digest(value), bytes: decimalBytes(bytes) });

export const externalAdapter = Object.freeze({
  contractSubpaths: Object.freeze([
    "effect-build/Author/Tool",
    "effect-build/Author/BorrowedOutput",
    "effect-build/Author/Executable",
  ]),
  tool: define({
    observation: {
      name: "fixture-archive-tool",
      participants: [{
        role: "selected-command",
        name: "fixture-archive",
        version: "7.2.0",
        revision: "fixture-r1",
        channel: "stable",
        content: content("a".repeat(64), "4096"),
      }],
      capabilities: [{ _tag: "Present", id: "archive-tree", evidence: "fixture-probe@1" }],
    },
    evaluate(request) {
      return request.operation === "archive-tree"
        ? { _tag: "ReviewedAdmission", admissionKey: "fixture-archive@7.2.0/archive-tree" }
        : {
          _tag: "FixtureOperationRefused",
          operation: request.operation,
          owner: "@fixture/external-author-adapter",
        };
    },
    command(argv) {
      return Object.freeze({
        _tag: "FixtureCommand",
        executable: "/fixture/bin/archive",
        argv: [...argv],
      });
    },
  }),
  borrowedOutput: Object.freeze({
    withFile() {
      throw new Error("fixture typecheck surface only");
    },
    withTree() {
      throw new Error("fixture typecheck surface only");
    },
  }),
  executable: Object.freeze({
    publish() {
      throw new Error("fixture typecheck surface only");
    },
  }),
});
