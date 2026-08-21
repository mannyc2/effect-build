import { executeMatrixLawSuite } from "./r7-matrix-laws.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";

const result = await executeMatrixLawSuite();
for (const provider of ["bun", "deno"]) {
  const observation = result[provider];
  conclusion(observation.maximumActive === 2, `${provider} exceeded bounded concurrency`);
  conclusion(
    observation.orderedTags.join(",") === "Success,Failure,Success,Failure",
    `${provider} did not return every normal cell in input order`,
  );
  conclusion(Object.values(observation.calls).every((count) => count === 1), `${provider} repeated a scalar cell`);
  conclusion(observation.rollback === "none", `${provider} claimed rollback`);
  conclusion(observation.interruption.cause === "MatrixInterrupted", `${provider} translated interruption`);
  conclusion(observation.interruption.starts.length === 2, `${provider} started queued cells after interruption`);
  conclusion(observation.interruption.durable.length === 1, `${provider} erased or hid a committed cell`);
}

await writeReceipt({
  id: "r7-matrix-laws",
  sourceSha,
  claims: [{
    id: "independently-committing-executable-matrix",
    classification: "established",
    conclusion: "bun-and-deno-model-deterministic-bounded-complete-nontransactional-cell-reports",
    assertions: [
      assertion("deterministic-input-index-cell-identity"),
      assertion("bounded-concurrency"),
      assertion("exactly-one-scalar-call-per-cell"),
      assertion("ordered-success-and-typed-failure-results"),
      assertion("independent-publication-without-rollback"),
      assertion("defects-and-caller-interruption-remain-cause"),
      assertion("queued-cells-not-started-after-interruption"),
      assertion("committed-artifacts-survive-interruption"),
    ],
  }],
  evidence: result,
});
