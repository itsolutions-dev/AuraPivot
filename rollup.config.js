import fs from "node:fs";
import path from "node:path";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import obfuscator from "rollup-plugin-obfuscator";
import pkg from "./package.json" with { type: "json" };

const copyLocales = () => ({
  name: "copy-locales",
  writeBundle() {
    const src = path.resolve("localization");
    const dest = path.resolve("dist/locales");
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      if (f.endsWith(".json")) {
        fs.copyFileSync(path.join(src, f), path.join(dest, f));
      }
    }
  },
});

// FREEPLAN compile-time flag. Build with `npm run build:freeplan` or
// `FREEPLAN=1 rollup -c`. When active:
//   - __FREEPLAN__ token replaced with `true` (gates drillthrough + size check)
//   - __FREEPLAN_MAX_BYTES__ replaced with the byte limit from package.json
//   - __FREEPLAN_INFO_URL__ replaced with the upgrade link
//
// OBFUSCATOR=1 toggles javascript-obfuscator (else terser). Independent
// of FREEPLAN — run `FREEPLAN=1 OBFUSCATOR=0 rollup -c` for a fast
// non-obfuscated FREEPLAN build during development.
const FREEPLAN = process.env.FREEPLAN === "1";
const OBFUSCATOR = process.env.OBFUSCATOR === "1";
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
      if (!/\.(jsx?|mjs)$/.test(id)) return null;
      if (!pattern.test(code)) return null;
      pattern.lastIndex = 0;
      return {
        code: code.replace(pattern, (m) => replacements[m]),
        map: null,
      };
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
  reservedStrings: ["use client"],
};

const finalizer = OBFUSCATOR
  ? obfuscator({ global: true, options: obfuscatorOptions })
  : terser({
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

export default {
  input: "index.js",
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: !OBFUSCATOR,
      intro: processShim,
    },
    {
      file: pkg.module,
      format: "esm",
      sourcemap: !OBFUSCATOR,
      intro: processShim,
    },
  ],
  plugins: [
    {
      name: "strip-use-client",
      transform(code) {
        return code.replace(/^['"]use client['"];?\n?/m, "");
      },
    },
    buildFlags(),
    peerDepsExternal(),
    resolve({
      extensions: [".js", ".jsx", ".json"],
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
      babelHelpers: "bundled",
      presets: ["@babel/preset-react"],
    }),
    finalizer,
    copyLocales(),
  ],
};
