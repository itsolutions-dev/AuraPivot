import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import dts from "rollup-plugin-dts";
import pkg from "./package.json" with { type: "json" };

const OUT_DIR = "dist";

const cleanOutDir = () => ({
  name: "clean-out-dir",
  buildStart() {
    // Stale artifacts (e.g. sourcemaps from a previous build) must not
    // survive into the new output.
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

// Machine-readable build stamp. Lives in the intro (real code, not a
// comment) so terser cannot strip it; scripts/verify-dist.mjs asserts it
// after every build, and it is inspectable at runtime via
// globalThis.__AURA_PIVOT_BUILD__.
const buildStamp = `globalThis.__AURA_PIVOT_BUILD__={version:${JSON.stringify(
  pkg.version,
)}};`;

const intro = processShim + buildStamp;

const jsConfig = {
  input: "index.ts",
  // Nothing in `dependencies` is bundled. exceljs (~900 KB) is loaded by
  // ExcelExporter through a dynamic import() on the first export; the other
  // three are ordinary imports the consumer's bundler resolves and
  // deduplicates against its own copy. Inlining them would ship a second
  // react-virtuoso — with its own scroll observer — into apps that already
  // use one.
  external: ["exceljs", "react-virtuoso", /^@mui\/icons-material($|\/)/],
  output: [
    {
      file: `${OUT_DIR}/index.cjs`,
      format: "cjs",
      // Explicit named mode (the bundle mixes a default and named exports):
      // plain require() consumers read `.default` / `.Pivot`, interop-aware
      // tooling (TS esModuleInterop, babel) is unaffected.
      exports: "named",
      sourcemap: true,
      intro,
    },
    {
      file: `${OUT_DIR}/index.esm.js`,
      format: "esm",
      sourcemap: true,
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
    finalizer,
    copyLocales(),
  ],
};

// Declarations are bundled from source rather than hand-maintained: a
// contributor changing a prop type gets the shipped .d.ts updated for
// free, and cannot silently desynchronise it.
//
// The same declarations are written twice, under both extensions. Module
// format is resolved from the extension, and `package.json` declares
// `type: module`, so a lone `index.d.ts` is read as ESM declarations — while
// the `require` condition resolves to the CommonJS `index.cjs`. TypeScript
// consumers on moduleResolution node16/nodenext then get types claiming ESM
// over CJS JavaScript ("masquerading as ESM") and their build fails. Pairing
// each condition with declarations whose extension matches its format is the
// fix; the content is identical, only the extension carries meaning.
const dtsConfig = {
  input: "index.ts",
  output: [
    { file: `${OUT_DIR}/index.d.ts`, format: "es" },
    { file: `${OUT_DIR}/index.d.cts`, format: "es" },
  ],
  external: [/\.css$/, /^@mui\//, /^react/, "exceljs", "react-virtuoso"],
  plugins: [dts()],
};

const themeConfig = {
  input: "theme/swatches.ts",
  output: [
    {
      file: `${OUT_DIR}/theme.cjs`,
      format: "cjs",
      exports: "named",
      sourcemap: true,
    },
    { file: `${OUT_DIR}/theme.esm.js`, format: "esm", sourcemap: true },
  ],
  plugins: [
    resolve({ extensions: [".js", ".jsx", ".ts", ".tsx", ".json"] }),
    babel({
      exclude: "node_modules/**",
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs"],
      babelHelpers: "bundled",
      presets: ["@babel/preset-react", "@babel/preset-typescript"],
    }),
    finalizer,
  ],
};

const themeDtsConfig = {
  input: "theme/swatches.ts",
  output: [
    { file: `${OUT_DIR}/theme.d.ts`, format: "es" },
    { file: `${OUT_DIR}/theme.d.cts`, format: "es" },
  ],
  plugins: [dts()],
};

export default [jsConfig, dtsConfig, themeConfig, themeDtsConfig];
