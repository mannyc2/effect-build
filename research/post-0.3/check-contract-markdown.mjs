import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { writeReceipt } from "./receipt.mjs";
import { assertion, sourceSha } from "./probe-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const sourcePath = resolve(root, "research/post-0.3/contracts.ts");
const markdownPath = resolve(root, "research/post-0.3/FINAL-CONTRACTS.md");
const sourceText = await readFile(sourcePath, "utf8");
const source = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const wantedInterfaces = [
  "BuildStepObservation",
  "ProfileProtocolUnsupported",
  "NodeMain",
  "NodeMainProgramRequest",
  "NodeMainProgramService",
  "NodeMainExecutableRequest",
  "NodeMainExecutableService",
  "BrowserModuleApplicationRequest",
  "BrowserModuleApplicationService",
  "ProfileAdapter",
];
const interfaceFields = new Map();
const protocols = new Map();

for (const statement of source.statements) {
  if (ts.isInterfaceDeclaration(statement) && wantedInterfaces.includes(statement.name.text)) {
    interfaceFields.set(
      statement.name.text,
      statement.members.map((member) => {
        if (member.name === undefined) throw new Error(`${statement.name.text} has an unnamed member`);
        return member.name.getText(source);
      }),
    );
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.name.text.endsWith("Protocol")
        && declaration.initializer !== undefined
        && ts.isStringLiteral(declaration.initializer)
      ) {
        protocols.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
}

for (const name of wantedInterfaces) {
  if (!interfaceFields.has(name)) throw new Error(`missing executable contract interface: ${name}`);
}
for (const name of [
  "NodeMainProgramProtocol",
  "NodeMainExecutableProtocol",
  "BrowserModuleApplicationProtocol",
]) {
  if (!protocols.has(name)) throw new Error(`missing executable protocol constant: ${name}`);
}

const lines = [
  "# Executable profile contracts",
  "",
  "This file is generated from `research/post-0.3/contracts.ts`. Edit the TypeScript declarations, then run:",
  "",
  "```text",
  "node research/post-0.3/check-contract-markdown.mjs --write",
  "```",
  "",
  "## Protocols",
  "",
  "| Constant | Protocol |",
  "| --- | --- |",
  ...[...protocols.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([name, protocol]) => `| \`${name}\` | \`${protocol}\` |`,
  ),
  "",
  "## Declared fields",
  "",
];
for (const name of wantedInterfaces) {
  lines.push(`### \`${name}\``, "", ...interfaceFields.get(name).map((field) => `- \`${field}\``), "");
}
const generated = `${lines.join("\n")}\n`;

if (invokedDirectly && process.argv.includes("--write")) {
  await writeFile(markdownPath, generated);
} else {
  const observed = await readFile(markdownPath, "utf8");
  if (observed !== generated) {
    throw new Error("FINAL-CONTRACTS.md is not synchronized with contracts.ts");
  }
  if (invokedDirectly && process.env.RESEARCH_RECEIPTS_DIR !== undefined) {
    await writeReceipt({
      id: "contract-declarations",
      sourceSha,
      claims: [{
        id: "contract-declarations",
        classification: "established",
        conclusion: "canonical-profile-declarations-and-generated-markdown-are-synchronized",
        assertions: [
          assertion("required-interfaces-present"),
          assertion("profile-protocols-present"),
          assertion("generated-markdown-equals-checked-in-markdown"),
        ],
      }],
      evidence: {
        protocols: Object.fromEntries(protocols),
        interfaces: Object.fromEntries(interfaceFields),
      },
    });
  }
}
