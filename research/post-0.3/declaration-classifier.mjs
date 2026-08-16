export const isDeclarationFile = (path) => path.endsWith(".d.ts");

export const isSelfContainedDeclarationOutput = (value) =>
  value.files.filter((file) => isDeclarationFile(file.path)).length === 1
  && value.unresolvedImports.length === 0;
