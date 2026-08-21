import { join } from "node:path";
import { assertion, repository, runRequired, sourceSha } from "./probe-runtime.mjs";
import { conclusion, writeReceipt } from "./receipt.mjs";

const { stdout } = await runRequired(process.execPath, [
  join(repository, "research/post-0.3/freeze/validate-freeze.mjs"),
  "--json",
]);
const report = JSON.parse(stdout);
conclusion(report.result === "FREEZE_OK", "exact surface freeze validator did not pass");
conclusion(report.migrationObservations === 155, "the released 0.3 public inventory is not exhaustively mapped");
conclusion(report.migrationBlockers === 0, "the migration retains a blocker");
conclusion(report.plan039 === "READY", "the active instruction and plan cutover is incomplete");
conclusion(report.productionImplementation === "not-started", "surface certification included production implementation");
conclusion(report.publicationAuthority === "NONE", "surface certification granted publication authority");

await writeReceipt({
  id: "surface-freeze",
  sourceSha,
  claims: [
    {
      id: "exact-public-surface",
      classification: "established",
      conclusion: "five-package-namespace-only-surface-with-five-admitted-and-two-derived-operations-is-frozen",
      assertions: [
        assertion("surface-generator-and-validator-pass"),
        assertion("exact-package-subpath-export-map"),
        assertion("exact-support-and-operation-map"),
        assertion("ordinary-and-release-quality-fetch-complete-history-with-no-other-v0.3-workflow-drift"),
        assertion("production-package-bytes-unchanged-from-v0.3.0"),
      ],
    },
    {
      id: "exhaustive-v03-hard-cut",
      classification: "established",
      conclusion: "all-155-v0.3-public-observations-have-one-resolved-exact-v0.4-disposition-with-zero-blockers",
      assertions: [
        assertion("complete-v0.3-runtime-declaration-namespace-and-documentation-inventory"),
        assertion("one-mapping-per-baseline-observation"),
        assertion("no-conditional-or-unknown-target"),
        assertion("no-alias-delegate-fallback-or-substitution"),
      ],
    },
    {
      id: "instruction-and-plan-cutover",
      classification: "established",
      conclusion: "active-instructions-and-rewritten-plans-039-through-044-match-the-frozen-authority",
      assertions: [
        assertion("active-instruction-names-surface-and-migration-authorities"),
        assertion("plan-039-ready-and-plans-040-through-044-sequenced"),
        assertion("single-coordinated-public-hard-cut"),
        assertion("one-shot-write-capable-closure-transport-retired"),
        assertion("no-production-merge-publication-tag-or-release-authority"),
      ],
    },
  ],
  evidence: report,
});
