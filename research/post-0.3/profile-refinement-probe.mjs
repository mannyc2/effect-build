import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredPath = (name) => {
  const value = process.env[name];
  if (value === undefined || !isAbsolute(value)) throw new Error(`${name} must be absolute`);
  return value;
};
const selectedBun = requiredPath("EFFECT_BUILD_BUN_BIN");
const selectedDeno = requiredPath("EFFECT_BUILD_DENO_BIN");
const currentDeno = requiredPath("EFFECT_BUILD_DENO_CURRENT_BIN");
const externalRoot = requiredPath("RESEARCH_EXTERNAL_NODE_MODULES");
const run = async (executable, argv, options = {}) => {
  try {
    const result = await execFileAsync(executable, [...argv], {
      cwd: options.cwd,
      env: { ...process.env, LC_ALL: "C", ...options.env },
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout ?? 180_000,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
const walk = async (root) => {
  const values = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) values.push(path);
    }
  };
  await visit(root);
  return values.sort();
};
const describeFiles = async (root) => Promise.all((await walk(root)).map(async (path) => ({
  path: relative(root, path).replaceAll("\\", "/"),
  extension: extname(path),
  bytes: Number((await stat(path)).size),
})));
const referencesExist = async (root) => {
  const htmlPaths = (await walk(root)).filter((path) => path.endsWith(".html"));
  for (const htmlPath of htmlPaths) {
    const html = await readFile(htmlPath, "utf8");
    for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
      const reference = match[1];
      if (/^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
      const path = reference.startsWith("/")
        ? resolve(root, reference.slice(1))
        : resolve(dirname(htmlPath), reference);
      try {
        if (!(await stat(path)).isFile()) return false;
      } catch {
        return false;
      }
    }
  }
  return htmlPaths.length > 0;
};
const commandBuild = async ({ provider, executable, source, outdir, html }) => {
  await mkdir(outdir, { recursive: true });
  const entry = html ? "index.html" : "app.ts";
  const argv = provider === "bun"
    ? ["build", entry, "--outdir", outdir, "--target=browser", "--minify"]
    : ["bundle", "--outdir", outdir, "--platform=browser", "--minify", entry];
  const completion = await run(executable, argv, { cwd: source });
  if (!completion.ok) throw new Error(`${provider} browser refinement failed: ${completion.stderr || completion.message}`);
  const files = await describeFiles(outdir);
  return {
    files,
    hasJavaScript: files.some((file) => [".js", ".mjs", ".cjs"].includes(file.extension)),
    hasCss: files.some((file) => file.extension === ".css"),
    hasHtml: files.some((file) => file.extension === ".html"),
    referencesExist: html ? await referencesExist(outdir) : undefined,
    stderr: completion.stderr.slice(0, 4_096),
  };
};
const browserProfiles = async (root) => {
  const moduleSource = join(root, "browser-module");
  await mkdir(moduleSource, { recursive: true });
  await writeFile(join(moduleSource, "app.ts"), 'import "./style.css"; document.body.dataset.role = "browser-module";\n');
  await writeFile(join(moduleSource, "style.css"), "body { color: rebeccapurple; }\n");
  const moduleBun = await commandBuild({ provider: "bun", executable: selectedBun, source: moduleSource, outdir: join(root, "module-bun"), html: false });
  const moduleDeno = await commandBuild({ provider: "deno", executable: selectedDeno, source: moduleSource, outdir: join(root, "module-deno"), html: false });

  const htmlSource = join(root, "browser-html");
  await mkdir(htmlSource, { recursive: true });
  await writeFile(join(htmlSource, "index.html"), '<!doctype html><html><body><script type="module" src="./app.ts"></script></body></html>\n');
  await writeFile(join(htmlSource, "app.ts"), 'import "./style.css"; document.body.dataset.role = "browser-html";\n');
  await writeFile(join(htmlSource, "style.css"), "body { color: teal; }\n");
  const htmlBun = await commandBuild({ provider: "bun", executable: selectedBun, source: htmlSource, outdir: join(root, "html-bun"), html: true });
  const htmlDeno = await commandBuild({ provider: "deno", executable: selectedDeno, source: htmlSource, outdir: join(root, "html-deno"), html: true });

  return {
    browserModuleOutputSet: {
      bun: moduleBun,
      deno: moduleDeno,
      conforms: moduleBun.hasJavaScript && moduleBun.hasCss && moduleDeno.hasJavaScript && moduleDeno.hasCss,
      conclusion: moduleBun.hasJavaScript && moduleBun.hasCss && moduleDeno.hasJavaScript && moduleDeno.hasCss
        ? "narrow-browser-module-output-set-supported"
        : "browser-module-output-set-falsified",
    },
    htmlApplicationWithModuleOwnedCss: {
      bun: htmlBun,
      deno: htmlDeno,
      conforms: htmlBun.hasHtml && htmlBun.hasJavaScript && htmlBun.hasCss && htmlBun.referencesExist
        && htmlDeno.hasHtml && htmlDeno.hasJavaScript && htmlDeno.hasCss && htmlDeno.referencesExist,
      conclusion: htmlBun.hasHtml && htmlBun.hasJavaScript && htmlBun.hasCss && htmlBun.referencesExist
        && htmlDeno.hasHtml && htmlDeno.hasJavaScript && htmlDeno.hasCss && htmlDeno.referencesExist
        ? "narrow-html-module-graph-application-supported"
        : "html-module-graph-application-falsified",
    },
  };
};
const unresolvedDeclarationImports = async (outdir) => {
  const files = await walk(outdir);
  const known = new Set(files.map((path) => resolve(path)));
  const unresolved = [];
  for (const path of files.filter((value) => value.endsWith(".d.ts"))) {
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const specifier = match[1];
      const base = resolve(dirname(path), specifier);
      const candidates = [base, `${base}.d.ts`, base.replace(/\.ts$/, ".d.ts"), join(base, "index.d.ts")];
      if (!candidates.some((candidate) => known.has(candidate))) unresolved.push({ path: relative(outdir, path), specifier });
    }
  }
  return unresolved;
};
const denoDeclarations = async (root, executable, label) => {
  const outdir = join(root, `deno-declarations-${label}`);
  await mkdir(outdir, { recursive: true });
  const result = await run(executable, ["bundle", "--outdir", outdir, "--declaration", "index.ts"], { cwd: join(root, "declaration-source") });
  if (!result.ok) throw new Error(`Deno ${label} declaration failed: ${result.stderr || result.message}`);
  const files = await describeFiles(outdir);
  const contents = Object.fromEntries(await Promise.all(
    (await walk(outdir)).filter((path) => path.endsWith(".d.ts")).map(async (path) => [relative(outdir, path), await readFile(path, "utf8")]),
  ));
  return { files, contents, unresolvedImports: await unresolvedDeclarationImports(outdir) };
};
const rolldownDeclarations = async (root) => {
  const rolldown = await import(pathToFileURL(resolve(externalRoot, "rolldown/dist/index.mjs")).href);
  const plugin = await import(pathToFileURL(resolve(externalRoot, "rolldown-plugin-dts/dist/index.mjs")).href);
  const outdir = join(root, "rolldown-declarations");
  const build = await rolldown.rolldown({
    input: join(root, "declaration-source/index.ts"),
    plugins: plugin.dts(),
  });
  try {
    await build.write({ dir: outdir, format: "esm" });
  } finally {
    await build.close();
  }
  const files = await describeFiles(outdir);
  const contents = Object.fromEntries(await Promise.all(
    (await walk(outdir)).filter((path) => path.endsWith(".d.ts")).map(async (path) => [relative(outdir, path), await readFile(path, "utf8")]),
  ));
  return { files, contents, unresolvedImports: await unresolvedDeclarationImports(outdir) };
};
const declarationProfiles = async (root) => {
  const source = join(root, "declaration-source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "model.ts"), "export interface Model { readonly value: string }\n");
  await writeFile(join(source, "index.ts"), 'import type { Model } from "./model.ts"; export const make = (value: string): Model => ({ value });\n');
  const selected = await denoDeclarations(root, selectedDeno, "2.9.3");
  const current = await denoDeclarations(root, currentDeno, "current");
  const rolldown = await rolldownDeclarations(root);
  const selfContained = (value) => value.files.filter((file) => file.extension === ".d.ts").length === 1 && value.unresolvedImports.length === 0;
  return {
    selectedDeno: selected,
    currentDeno: current,
    rolldown,
    rolledUpDeclarationFile: {
      selectedDenoConforms: selfContained(selected),
      currentDenoConforms: selfContained(current),
      rolldownConforms: selfContained(rolldown),
      conclusion: selfContained(current) && selfContained(rolldown)
        ? "rolled-up-declaration-file-supported-by-current-deno-and-rolldown"
        : "rolled-up-declaration-file-not-yet-two-way-conformant",
    },
  };
};

const root = await mkdtemp(join(tmpdir(), "effect-build-profile-refinement-"));
try {
  await Promise.all([access(selectedBun), access(selectedDeno), access(currentDeno)]);
  const result = {
    browser: await browserProfiles(root),
    declarations: await declarationProfiles(root),
  };
  console.log(`EFFECT_BUILD_PROFILE_REFINEMENT_RECEIPT=${JSON.stringify(result)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
