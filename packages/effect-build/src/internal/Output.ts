import { SchemaAST, SchemaIssue } from "effect";

// Messages that a schema author declared are kept. Messages built while parsing (filter results,
// JSON syntax errors) can quote the output, so they become the generic expectation instead.
const leafHook: SchemaIssue.LeafHook = (issue) => {
  switch (issue._tag) {
    case "InvalidValue": {
      const expected = issue.annotations?.expected;
      return typeof expected === "string" ? `Expected ${expected}` : "Expected a valid value";
    }
    case "Forbidden":
      return "Forbidden operation";
    default:
      return SchemaIssue.defaultLeafHook(issue);
  }
};

const checkHook: SchemaIssue.CheckHook = (issue) => {
  const message = issue.filter.annotations?.message;
  return typeof message === "string" ? message : undefined;
};

const format = SchemaIssue.makeFormatterStandardSchemaV1({ leafHook, checkHook });

const located = (issue: SchemaIssue.Issue, path: ReadonlyArray<string>) =>
  format(issue).issues.map((entry) => path.length === 0 ? entry.message : `${entry.message} at ${path.join(".")}`);

// Struct keys are declared by the schema; record keys come from the output.
const segment = (key: PropertyKey, declared: ReadonlySet<PropertyKey>) =>
  typeof key === "number" || declared.has(key) ? String(key) : "<key>";

const describe = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<string>,
  declared: ReadonlySet<PropertyKey>,
): Array<string> => {
  switch (issue._tag) {
    case "Pointer":
      return describe(issue.issue, [...path, ...issue.path.map((key) => segment(key, declared))], new Set());
    case "Composite": {
      const keys = SchemaAST.isObjects(issue.ast)
        ? new Set(issue.ast.propertySignatures.map((signature) => signature.name))
        : new Set<PropertyKey>();
      return issue.issues.flatMap((inner) => describe(inner, path, keys));
    }
    case "Encoding":
      return describe(issue.issue, path, declared);
    case "AnyOf":
      return issue.issues.length === 0
        ? located(issue, path)
        : issue.issues.flatMap((inner) => describe(inner, path, declared));
    case "Filter":
      return checkHook(issue) !== undefined || issue.issue._tag === "InvalidValue"
        ? located(issue, path)
        : describe(issue.issue, path, declared);
    default:
      return located(issue, path);
  }
};

/** A readable description of why output did not decode, without output values or output-derived keys. */
export const describeIssue = (issue: SchemaIssue.Issue): string => {
  const entries = describe(issue, [], new Set());
  const shown = entries.slice(0, 3).join("; ");
  return entries.length > 3 ? `${shown}; and ${entries.length - 3} more` : shown;
};
