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

// Bundled exceljs (~900 KB minified) would push the bundle well past these;
// without it the library plus inlined deps stays far below. Obfuscation
// legitimately inflates code ~3.5×, hence the split limits.
const MAX_PLAIN_BYTES = 700 * 1024;
const MAX_OBFUSCATED_BYTES = 1500 * 1024;

const STAMP_RE = /__AURA_PIVOT_BUILD__\s*=\s*\{obfuscated:"(yes|no)"/;

for (const name of ["index.js", "index.esm.js"]) {
  const p = path.join(outDir, name);
  if (!fs.existsSync(p)) continue;
  const code = fs.readFileSync(p, "utf8");

  const stamp = STAMP_RE.exec(code);
  if (!stamp) {
    fail(`${p}: build stamp missing`);
    continue;
  }
  const obfuscated = stamp[1] === "yes";

  const maxBytes = obfuscated ? MAX_OBFUSCATED_BYTES : MAX_PLAIN_BYTES;
  if (code.length > maxBytes) {
    fail(
      `${p}: ${Math.round(code.length / 1024)} KB exceeds ${Math.round(
        maxBytes / 1024,
      )} KB — exceljs probably got bundled`,
    );
  }

  // The lazy exceljs import must survive as a literal specifier so the
  // consumer's bundler can resolve it (reservedStrings guards it from the
  // obfuscator's string array).
  if (!code.includes("exceljs")) {
    fail(`${p}: literal 'exceljs' specifier missing — lazy import broken`);
  }

  const mapPath = `${p}.map`;
  if (obfuscated) {
    if (fs.existsSync(mapPath)) {
      fail(`${mapPath}: obfuscated builds must not ship sourcemaps`);
    }
  } else {
    if (!fs.existsSync(mapPath)) {
      fail(`${mapPath}: sourcemap missing`);
    } else {
      const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      if (!map.mappings || map.mappings.length === 0) {
        fail(`${mapPath}: sourcemap is an empty stub`);
      }
    }
  }
}

if (problems.length > 0) {
  for (const msg of problems) console.error(`verify-dist FAIL: ${msg}`);
  process.exit(1);
}
console.log(`verify-dist OK — build in ${outDir}/`);
