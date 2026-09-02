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
// what gets asserted is exactly what a consumer resolves.
const cjsEntry = pkg.main;
const esmEntry = pkg.module;
const themeCjsEntry = pkg.exports["./theme"].require;
const themeEsmEntry = pkg.exports["./theme"].import;

const requiredFiles = [
  path.basename(cjsEntry),
  path.basename(esmEntry),
  "index.d.ts",
  "theme.cjs",
  "theme.esm.js",
  "theme.d.ts",
  "locales/en.json",
  "locales/it.json",
];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(outDir, f))) fail(`missing ${outDir}/${f}`);
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
const dtsPath = path.join(outDir, "index.d.ts");
if (fs.existsSync(dtsPath)) {
  const dts = fs.readFileSync(dtsPath, "utf8");
  for (const name of REQUIRED_TYPES) {
    if (!new RegExp(`\\b${name}\\b`).test(dts)) {
      fail(`${dtsPath}: public type '${name}' is no longer exported`);
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
