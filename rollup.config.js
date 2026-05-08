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

const OBFUSCATE = process.env.OBFUSCATE !== "0";

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

const finalizer =
  OBFUSCATE && 1 === 0
    ? obfuscator({ global: true, options: obfuscatorOptions })
    : terser({
        compress: { drop_console: false },
        mangle: true,
        format: { comments: false },
      });

export default {
  input: "index.js",
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: !OBFUSCATE,
    },
    {
      file: pkg.module,
      format: "esm",
      sourcemap: !OBFUSCATE,
    },
  ],
  plugins: [
    {
      name: "strip-use-client",
      transform(code) {
        return code.replace(/^['"]use client['"];?\n?/m, "");
      },
    },
    peerDepsExternal(),
    resolve({
      extensions: [".js", ".jsx", ".json"],
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
