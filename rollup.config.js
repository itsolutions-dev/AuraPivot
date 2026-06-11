import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import obfuscator from "rollup-plugin-obfuscator";
import pkg from "./package.json" with { type: "json" };

// FREEPLAN compile-time flag. Build with `npm run build:freeplan` or
// `FREEPLAN=1 rollup -c`. When active:
//   - __FREEPLAN__ token replaced with `true` (gates drillthrough + size check)
//   - __FREEPLAN_MAX_BYTES__ replaced with the byte limit from package.json
//   - __FREEPLAN_INFO_URL__ replaced with the upgrade link
//
// OBFUSCATOR=1 adds per-module javascript-obfuscator passes (heavy for UI /
// gating code, light for the hot compute paths — see HOT_PATHS); terser
// always runs as the output finalizer. Independent of FREEPLAN — run
// `FREEPLAN=1 OBFUSCATOR=0 rollup -c` for a fast non-obfuscated FREEPLAN
// build during development.
const FREEPLAN = process.env.FREEPLAN === "1";
const OBFUSCATOR = process.env.OBFUSCATOR === "1";

// Each variant gets its own output directory so a FREEPLAN build can never
// silently overwrite `dist/` and ship as the standard package. The package
// entries (`main` / `module` / `types`) point at `dist/`; publishing the
// free variant is an explicit copy from `dist-free/`.
const VARIANT = FREEPLAN ? "freeplan" : "standard";
const OUT_DIR = FREEPLAN ? "dist-free" : "dist";

const cleanOutDir = () => ({
  name: "clean-out-dir",
  buildStart() {
    // Stale artifacts (e.g. sourcemaps from a previous non-obfuscated
    // build) must not survive into the new output.
    fs.rmSync(path.resolve(OUT_DIR), { recursive: true, force: true });
  },
});

const copyLocales = () => ({
  name: "copy-locales",
  writeBundle() {
    const src = path.resolve("localization");
    const dest = path.resolve(OUT_DIR, "locales");
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      if (f.endsWith(".json")) {
        fs.copyFileSync(path.join(src, f), path.join(dest, f));
      }
    }
  },
});

// Hand-maintained public declarations (index.d.ts at the repo root) shipped
// next to the bundles — the `types` entry in package.json points there.
const copyTypes = () => ({
  name: "copy-types",
  writeBundle() {
    fs.copyFileSync(
      path.resolve("index.d.ts"),
      path.resolve(OUT_DIR, "index.d.ts"),
    );
  },
});
const FREEPLAN_MAX_BYTES =
  Number(process.env.FREEPLAN_MAX_BYTES) ||
  pkg.freeplan?.maxBytes ||
  1024 * 1024;
const FREEPLAN_INFO_URL =
  process.env.FREEPLAN_INFO_URL ||
  pkg.freeplan?.infoUrl ||
  "https://aurapivot.web.app";

// Inline the sibling PresentationApp favicon as a data URL so the FREEPLAN
// watermark is self-contained in the bundle. Only read when FREEPLAN is on
// to avoid noise in standard builds.
const readWatermarkDataUrl = () => {
  if (!FREEPLAN) return "";
  const candidates = [path.resolve("./favicon.ico")];
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p);
      return `data:image/x-icon;base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
};
const FREEPLAN_WATERMARK_ICON = readWatermarkDataUrl();

const buildFlags = () => {
  const replacements = {
    __FREEPLAN__: String(FREEPLAN),
    __FREEPLAN_MAX_BYTES__: String(FREEPLAN_MAX_BYTES),
    __FREEPLAN_INFO_URL__: JSON.stringify(FREEPLAN_INFO_URL),
    __FREEPLAN_WATERMARK_ICON__: JSON.stringify(FREEPLAN_WATERMARK_ICON),
  };
  const pattern = new RegExp(
    `\\b(${Object.keys(replacements).join("|")})\\b`,
    "g",
  );
  return {
    name: "build-flags",
    transform(code, id) {
      if (id.includes("node_modules")) return null;
      if (!/\.([jt]sx?|mjs)$/.test(id)) return null;
      pattern.lastIndex = 0;
      if (!pattern.test(code)) return null;
      pattern.lastIndex = 0;
      // MagicString keeps the sourcemap chain intact — a bare string
      // replace here degrades every downstream map to an empty stub.
      const s = new MagicString(code);
      let m;
      while ((m = pattern.exec(code)) !== null) {
        s.overwrite(m.index, m.index + m[0].length, replacements[m[0]]);
      }
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
};

const obfuscatorOptions = {
  compact: true,
  simplify: true,
  target: "browser",
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 0.75,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: "function",
  splitStrings: true,
  splitStringsChunkLength: 5,
  transformObjectKeys: true,
  numbersToExpressions: true,
  unicodeEscapeSequence: false,
  identifierNamesGenerator: "mangled-shuffled",
  renameGlobals: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  // 'exceljs' must stay a literal: it is the specifier of the lazy
  // import('exceljs') in ExcelExporter — string-array-encoding it would
  // break static resolution in the consumer's bundler.
  reservedStrings: ["use client", "exceljs"],
};

// CPU-bound per-cell/per-row code: the matrix pipeline runs for every cell of
// every recompute, so control-flow flattening / dead-code injection there
// costs real render time. These files get a lighter pass (string protection
// + identifier mangling, none of the per-operation indirections).
const HOT_PATHS = [
  "**/pivot-core/matrix/**",
  "**/pivot-core/aggregation/**",
  "**/pivot-core/slice/**",
  "**/pivot-core/format/**",
  "**/pivot-core/data/**",
];

const lightObfuscatorOptions = {
  ...obfuscatorOptions,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  splitStrings: false,
};

const SOURCE_GLOBS = ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"];

// Obfuscation runs per-module (after babel strips JSX/TS) instead of on the
// whole bundle: our sources get protected, node_modules dependencies are
// skipped (huge build-time win), and the hot compute paths get the light
// option set. Terser always runs as the output finalizer — with per-module
// obfuscation it is what minifies the bundled dependencies.
const obfuscatorPlugins = OBFUSCATOR
  ? [
      obfuscator({
        global: false,
        include: SOURCE_GLOBS,
        exclude: ["node_modules/**", ...HOT_PATHS],
        options: obfuscatorOptions,
      }),
      obfuscator({
        global: false,
        include: HOT_PATHS,
        exclude: ["node_modules/**"],
        options: lightObfuscatorOptions,
      }),
    ]
  : [];

const finalizer = terser({
  compress: { drop_console: false },
  mangle: true,
  format: { comments: false },
});

// Browser shim for `process` — exceljs/jszip/readable-stream reference
// `process.env.NODE_DEBUG` etc. at runtime. Vite doesn't polyfill `process`
// in the browser, so without this the bundle throws
// `ReferenceError: process is not defined` on load. Assigned to globalThis
// (not declared as a local `var`) so terser's top-level mangling can't
// rename the binding and orphan downstream `process.*` references.
const processShim =
  'if(typeof globalThis.process==="undefined"){globalThis.process={env:{NODE_ENV:"production"},browser:true,version:"v20.0.0",versions:{node:"20.0.0"},platform:"browser",nextTick:function(cb){Promise.resolve().then(cb);}};}';

// Machine-readable variant stamp. Lives in the intro (real code, not a
// comment) so neither terser nor the obfuscator strips it; scripts/
// verify-dist.mjs asserts it after every build, and it is inspectable at
// runtime via globalThis.__AURA_PIVOT_BUILD__.
const buildStamp = `globalThis.__AURA_PIVOT_BUILD__={variant:${JSON.stringify(
  VARIANT,
)},obfuscated:${JSON.stringify(OBFUSCATOR ? "yes" : "no")},version:${JSON.stringify(pkg.version)}};`;

const intro = processShim + buildStamp;

export default {
  input: "index.js",
  // exceljs (~900 KB) is intentionally NOT bundled: ExcelExporter loads it
  // with a dynamic import() on the first export, and the consumer's bundler
  // resolves/code-splits it from this package's `dependencies`.
  external: ["exceljs"],
  output: [
    {
      file: `${OUT_DIR}/index.js`,
      format: "cjs",
      // Explicit named mode (the bundle mixes a default and named exports):
      // plain require() consumers read `.default` / `.Pivot`, interop-aware
      // tooling (TS esModuleInterop, babel) is unaffected.
      exports: "named",
      sourcemap: !OBFUSCATOR,
      intro,
    },
    {
      file: `${OUT_DIR}/index.esm.js`,
      format: "esm",
      sourcemap: !OBFUSCATOR,
      intro,
    },
  ],
  plugins: [
    cleanOutDir(),
    {
      name: "strip-use-client",
      transform(code) {
        const m = /^['"]use client['"];?\r?\n?/m.exec(code);
        if (!m) return null;
        const s = new MagicString(code);
        s.remove(m.index, m.index + m[0].length);
        return { code: s.toString(), map: s.generateMap({ hires: true }) };
      },
    },
    buildFlags(),
    peerDepsExternal(),
    resolve({
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      // Honor the `browser` field in package.json so deps like exceljs
      // resolve to their pre-built browser bundle instead of the Node
      // entry that pulls in graceful-fs / fs / stream and crashes at
      // load time in the browser.
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    babel({
      exclude: "node_modules/**",
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs"],
      babelHelpers: "bundled",
      presets: ["@babel/preset-react", "@babel/preset-typescript"],
    }),
    // Must come after babel: javascript-obfuscator cannot parse JSX/TS.
    ...obfuscatorPlugins,
    finalizer,
    copyLocales(),
    copyTypes(),
  ],
};
