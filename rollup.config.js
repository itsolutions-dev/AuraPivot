import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
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
    copyTypes(),
  ],
};
