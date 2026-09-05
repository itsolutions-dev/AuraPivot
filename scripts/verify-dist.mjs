/**
 * Post-build assertion: the produced bundle is not degraded (stub
 * sourcemaps, bundled exceljs, missing types/locales).
 *
 * Usage: node scripts/verify-dist.mjs
 * Chained after rollup in the npm build script.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// This file is ESM, so the CommonJS half of the load check needs its own
// require.
const requireCjs = createRequire(import.meta.url);
const pkg = requireCjs("../package.json");

const outDir = "dist";
const problems = [];
const fail = (msg) => problems.push(msg);

// Entry paths are read from package.json rather than duplicated here, so
// what gets asserted is exactly what a consumer resolves. Each subpath now
// nests its target under the condition, so the JS lives at `.default` and
// the declarations that condition pairs with live at `.types`.
const conditionTarget = (subpath, condition) =>
  pkg.exports[subpath][condition].default;
const conditionTypes = (subpath, condition) =>
  pkg.exports[subpath][condition].types;

const cjsEntry = pkg.main;
const esmEntry = pkg.module;
const themeCjsEntry = conditionTarget("./theme", "require");
const themeEsmEntry = conditionTarget("./theme", "import");

const requiredFiles = [
  path.basename(cjsEntry),
  path.basename(esmEntry),
  "index.d.ts",
  "index.d.cts",
  "theme.cjs",
  "theme.esm.js",
  "theme.d.ts",
  "theme.d.cts",
  "locales/en.json",
  "locales/it.json",
];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(outDir, f))) fail(`missing ${outDir}/${f}`);
}

// Declarations must match the module format of the JavaScript their
// condition resolves to, or a node16/nodenext consumer gets types that
// masquerade as ESM over CommonJS and fails to compile. The extension is
// the only thing that carries that information, so assert it: `.d.cts`
// under `require`, `.d.ts` under `import`. Collapsing both back to a single
// top-level `types` key is exactly the regression this catches.
for (const subpath of [".", "./theme"]) {
  const requireTypes = conditionTypes(subpath, "require");
  const importTypes = conditionTypes(subpath, "import");
  if (!requireTypes.endsWith(".d.cts")) {
    fail(
      `exports["${subpath}"].require.types is '${requireTypes}' — a CommonJS condition needs .d.cts declarations`,
    );
  }
  if (!importTypes.endsWith(".d.ts")) {
    fail(
      `exports["${subpath}"].import.types is '${importTypes}' — an ESM condition needs .d.ts declarations`,
    );
  }
}

const STAMP_RE = /__AURA_PIVOT_BUILD__\s*=\s*\{version:"([^"]+)"/;

for (const name of [path.basename(cjsEntry), path.basename(esmEntry)]) {
  const p = path.join(outDir, name);
  if (!fs.existsSync(p)) continue;
  const code = fs.readFileSync(p, "utf8");

  if (!STAMP_RE.test(code)) {
    fail(`${p}: build stamp missing`);
    continue;
  }

  // The lazy exceljs import must survive as a literal specifier so the
  // consumer's bundler can resolve it.
  if (!code.includes("exceljs")) {
    fail(`${p}: literal 'exceljs' specifier missing — lazy import broken`);
  }

  const mapPath = `${p}.map`;
  if (!fs.existsSync(mapPath)) {
    fail(`${mapPath}: sourcemap missing`);
  } else {
    const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    if (!map.mappings || map.mappings.length === 0) {
      fail(`${mapPath}: sourcemap is an empty stub`);
    }
  }
}

// The public type surface is generated, so a refactor that stops exporting
// a consumer-facing type would otherwise reach npm silently.
const REQUIRED_TYPES = [
  "PivotOptions",
  "AuraPivotProps",
  "AuraPivotRef",
  "PivotEngine",
  "LocalizationDictionary",
];
// Both extensions are checked: the .d.cts is what CommonJS consumers read,
// so a build that emitted only one of the pair would go unnoticed here.
for (const name of ["index.d.ts", "index.d.cts"]) {
  const dtsPath = path.join(outDir, name);
  if (!fs.existsSync(dtsPath)) continue;
  const dts = fs.readFileSync(dtsPath, "utf8");
  for (const typeName of REQUIRED_TYPES) {
    if (!new RegExp(`\\b${typeName}\\b`).test(dts)) {
      fail(`${dtsPath}: public type '${typeName}' is no longer exported`);
    }
  }
}

// Existence is not loadability. `package.json` declares `type: module`, so
// a CommonJS bundle named `.js` was parsed as ESM and `require()` of it
// yielded an empty namespace with NO error — which is why checking only
// that the files are present let that ship from the initial commit. Both
// entries are therefore loaded for real, and the empty-namespace case is
// treated as a failure in its own right.
const PUBLIC_NAME = "Pivot";
const THEME_PUBLIC_NAME = "TONE_STOPS";

const loadChecks = [
  {
    entry: cjsEntry,
    kind: "CJS",
    publicName: PUBLIC_NAME,
    load: () => requireCjs(path.resolve(cjsEntry)),
  },
  {
    entry: esmEntry,
    kind: "ESM",
    publicName: PUBLIC_NAME,
    load: () => import(pathToFileURL(path.resolve(esmEntry)).href),
  },
  {
    entry: themeCjsEntry,
    kind: "theme CJS",
    publicName: THEME_PUBLIC_NAME,
    load: () => requireCjs(path.resolve(themeCjsEntry)),
  },
  {
    entry: themeEsmEntry,
    kind: "theme ESM",
    publicName: THEME_PUBLIC_NAME,
    load: () => import(pathToFileURL(path.resolve(themeEsmEntry)).href),
  },
];

for (const { entry, kind, publicName, load } of loadChecks) {
  if (!fs.existsSync(entry)) continue; // already reported as missing
  let ns;
  try {
    ns = await load();
  } catch (err) {
    fail(`${entry}: ${kind} entry failed to load — ${err.message}`);
    continue;
  }
  const keys = ns ? Object.keys(ns) : [];
  if (keys.length === 0) {
    fail(`${entry}: ${kind} entry loaded but exports nothing`);
    continue;
  }
  if (!keys.includes(publicName)) {
    fail(`${entry}: ${kind} entry does not export '${publicName}'`);
  }
}

if (problems.length > 0) {
  for (const msg of problems) console.error(`verify-dist FAIL: ${msg}`);
  process.exit(1);
}
console.log(`verify-dist OK — build in ${outDir}/`);
