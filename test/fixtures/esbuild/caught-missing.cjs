try {
  require("./missing-dependency.js");
} catch {
  // The dependency is intentionally optional at runtime.
}
