import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The engine's event payloads are genuinely dynamic; the boundary is
      // typed, the interior is not worth fighting.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // This rule targets React Compiler readiness. Several dialogs
      // legitimately sync local state from an external, mutable PivotEngine
      // inside an effect (e.g. seeding filter/sort state from
      // engine.getSlice() on open) — that is external-store synchronization,
      // not a derivable-during-render reset, so it does not fit the pattern
      // the rule assumes. Findings stay visible as warnings for review.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // The only plain-JS files in the repo, all build tooling — they run
    // under Node, not the library's browser/React runtime.
    files: [
      "scripts/verify-dist.mjs",
      "scripts/third-party-notices.mjs",
      "rollup.config.js",
    ],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        global: "readonly",
        Buffer: "readonly",
      },
    },
  },
  prettier,
);
