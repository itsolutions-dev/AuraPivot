/**
 * Post-build assertion: the produced bundle is not degraded (stub
 * sourcemaps, bundled exceljs, missing types/locales).
 *
 * Usage: node scripts/verify-dist.mjs
 * Chained after rollup in the npm build script.
 */

import fs from "node:fs";
import path from "node:path";

const outDir = "dist";
const problems = [];
const fail = (msg) => problems.push(msg);

const requiredFiles = [
  "index.js",
  "index.esm.js",
  "index.d.ts",
  "locales/en.json",
  "locales/it.json",
];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(outDir, f))) fail(`missing ${outDir}/${f}`);
}

// Observed 206 KB after externalising react-virtuoso, file-saver and
// @mui/icons-material. The ceiling catches a dependency accidentally
// falling back into the bundle, not ordinary growth.
const MAX_BYTES = 250 * 1024;

const STAMP_RE = /__AURA_PIVOT_BUILD__\s*=\s*\{version:"([^"]+)"/;

for (const name of ["index.js", "index.esm.js"]) {
  const p = path.join(outDir, name);
  if (!fs.existsSync(p)) continue;
  const code = fs.readFileSync(p, "utf8");

  if (!STAMP_RE.test(code)) {
    fail(`${p}: build stamp missing`);
    continue;
  }

  if (code.length > MAX_BYTES) {
    fail(
      `${p}: ${Math.round(code.length / 1024)} KB exceeds ${Math.round(
        MAX_BYTES / 1024,
      )} KB — a heavy dependency probably got bundled`,
    );
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

if (problems.length > 0) {
  for (const msg of problems) console.error(`verify-dist FAIL: ${msg}`);
  process.exit(1);
}
console.log(`verify-dist OK — build in ${outDir}/`);
