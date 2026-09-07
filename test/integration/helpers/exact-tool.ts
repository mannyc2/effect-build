import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

type Provider = "bun" | "deno" | "esbuild";
interface FixtureRow {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly operations?: readonly string[];
  readonly expectation?: "admitted" | "rejected";
  readonly denortFixtures?: { readonly matched: string; readonly mismatched: string };
}

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const contract = JSON.parse(readFileSync(join(repository, "tooling/effect-build-contract.json"), "utf8")) as {
  readonly exactToolEvidenceRegister: { readonly tools: readonly FixtureRow[] };
};

/** Matrix callers must bind both coordinates; an explicit fixture never selects another executable. */
export const selectToolFixture = (name: Provider, explicitExecutable?: string) => {
  const id = process.env.EFFECT_BUILD_TOOL_FIXTURE ?? `EVIDENCE-${name.toUpperCase()}`;
  const row = contract.exactToolEvidenceRegister.tools.find((candidate) => candidate.id === id);
  if (row === undefined || row.name !== name) throw new Error(`no exact ${name} fixture named ${id}`);
  if (process.env.CI === "true" && process.env.EFFECT_BUILD_TOOL_FIXTURE === undefined) {
    throw new Error("hosted provider evidence requires EFFECT_BUILD_TOOL_FIXTURE");
  }
  const binding = `EFFECT_BUILD_${name.toUpperCase()}`;
  const requested = explicitExecutable ?? process.env[binding];
  if (requested === undefined || !isAbsolute(requested)) {
    throw new Error(`${id} requires an absolute ${binding} executable path`);
  }
  const executable = realpathSync(requested);
  const banner = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10_000 }).trim();
  const version = name === "deno" ? /^deno (\S+)(?: |$)/u.exec(banner.split("\n")[0] ?? "")?.[1] : banner;
  if (version !== row.version) throw new Error(`${id} expected ${row.version}, received ${banner}`);
  const sha256 = createHash("sha256").update(readFileSync(executable)).digest("hex");
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  const workingTreeDirty =
    execFileSync("git", ["status", "--porcelain"], { cwd: repository, encoding: "utf8" }).trim().length > 0;
  return {
    id,
    version: row.version,
    executable,
    expectation: row.expectation ?? "admitted",
    supports: (operation: string): boolean =>
      row.expectation !== "rejected" && (row.operations?.includes(operation) ?? true),
    denort(kind: "matched" | "mismatched") {
      const runtimeId = row.denortFixtures?.[kind];
      const runtime = contract.exactToolEvidenceRegister.tools.find((candidate) => candidate.id === runtimeId);
      const binding = `EFFECT_BUILD_DENORT_${kind.toUpperCase()}`;
      const requestedRuntime = process.env[binding];
      if (runtime === undefined || requestedRuntime === undefined || !isAbsolute(requestedRuntime)) {
        throw new Error(`${id} requires its declared ${kind} runtime fixture at ${binding}`);
      }
      const path = realpathSync(requestedRuntime);
      return {
        id: runtime.id,
        version: runtime.version,
        executable: path,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      };
    },
    async observe(
      scenario: string,
      observation: { readonly participants: readonly unknown[] },
      coordinates: {
        readonly operation: string;
        readonly target?: string;
        readonly runner?: string;
        readonly runtime?: { readonly fixture: string; readonly observation: unknown };
      },
    ): Promise<void> {
      expect(observation.participants[0]).toMatchObject({
        name,
        version: row.version,
        content: { digest: { value: sha256 } },
      });
      if (row.operations !== undefined) expect(row.operations).toContain(coordinates.operation);
      const receipt = {
        schema: "effect-build/exact-provider-fixture@1",
        fixture: id,
        provider: name,
        version: row.version,
        expectation: row.expectation ?? "admitted",
        executable,
        sha256,
        banner,
        sourceRevision,
        workingTreeDirty,
        host: `${process.platform}-${process.arch}`,
        scenario,
        ...coordinates,
        result: "passed",
        observation,
      };
      console.log(`EFFECT_BUILD_EXACT_FIXTURE=${JSON.stringify(receipt)}`);
      const directory = process.env.EFFECT_BUILD_EXACT_EVIDENCE_DIRECTORY;
      if (directory !== undefined) {
        const destination = join(directory, id, `${process.platform}-${process.arch}`);
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, `${scenario}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
      }
    },
  };
};
