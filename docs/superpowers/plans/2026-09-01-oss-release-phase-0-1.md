# AuraPivot OSS Release — Phases 0 and 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `Library/` from a private, obfuscated package into a repository that can be published under MIT with working CI, automated releases, and the community files an external contributor expects — without making it public yet.

**Architecture:** Phase 0 fixes the package itself: licence and metadata, the obfuscator removal, three undeclared or mis-declared runtime dependencies, the untyped entry points, and the rename from `@its/aura-pivot` to `aura-pivot` across all three sibling apps. Phase 1 adds the automation and documentation layer on top: coverage tooling, GitHub Actions, Changesets releases, and a rewritten README. Nothing here flips the repository to public — that is phase 4, gated behind the coverage work in phases 2 and 3.

**Tech Stack:** Rollup 4, Babel, TypeScript 7, Vitest 4 + happy-dom, React 19 (peer `>=18`), MUI v9, GitHub Actions, Changesets, ESLint flat config, Prettier.

**Spec:** `docs/superpowers/specs/2026-09-01-oss-mit-release-design.md`

## Global Constraints

- **Repository stays private for the whole of this plan.** Making it public is phase 4.
- **Copyright holder is exactly `IT Solutions S.r.l.`** Year is `2026`.
- **npm package name is exactly `aura-pivot`** (unscoped, no `@its` scope).
- **`engines.node` is `">=18"`**, never `">=20"`. Node 20 is a development-only requirement (the rollup config uses the `with { type: "json" }` import attribute) and is enforced through CI and `CONTRIBUTING.md`, not through `engines`.
- **React peer range stays `">=18"`.** Do not introduce React 19-only APIs.
- **No reference to WebDataRocks** may remain in the working tree. Commit history is out of scope (decision D3/D6).
- **Style:** 2-space indent, semicolons. Single quotes in `.ts`/`.tsx`, double quotes in `.js`/`.jsx`/`.mjs`. Match whatever the file already uses.
- **All paths in this plan are relative to `Library/`** unless prefixed with `../`.
- **Every task ends with a commit.** Never bundle two tasks into one commit.
- `npm run check` (which is `tsc --noEmit`) must pass at the end of every task.

---

## File Structure

**Created:**

| Path                                                                     | Responsibility                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `LICENSE`                                                                | MIT text, IT Solutions S.r.l.                                                |
| `scripts/third-party-notices.mjs`                                        | Walks the production dependency tree, emits attribution for anything bundled |
| `vitest.config.ts`                                                       | Test environment, coverage provider, per-glob thresholds                     |
| `eslint.config.js`                                                       | Flat config                                                                  |
| `.prettierrc.json`, `.prettierignore`, `.editorconfig`                   | Formatting                                                                   |
| `.github/workflows/ci.yml`                                               | Lint, typecheck, test, build on every push and PR                            |
| `.github/workflows/release.yml`                                          | Changesets version PR and npm publish                                        |
| `.github/workflows/codeql.yml`                                           | Static analysis                                                              |
| `.github/dependabot.yml`                                                 | npm + github-actions updates                                                 |
| `.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}` | Issue intake                                                                 |
| `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`                 | PR intake                                                                    |
| `.changeset/config.json`                                                 | Release configuration                                                        |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`                   | Community                                                                    |
| `.size-limit.json`                                                       | Bundle budget                                                                |

**Modified:**

| Path                                                                                                                                     | Change                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `package.json`                                                                                                                           | Licence and OSS metadata, name, dependency corrections, scripts |
| `rollup.config.js`                                                                                                                       | Obfuscator removal, externals, generated declarations           |
| `scripts/verify-dist.mjs`                                                                                                                | Drop the obfuscated branch, assert the public type surface      |
| `tsconfig.json`                                                                                                                          | `allowJs`, include the converted entry points                   |
| `index.js` → `index.ts`                                                                                                                  | Typed entry, `./theme` re-export restored                       |
| `AuraPivot.jsx` → `AuraPivot.tsx`                                                                                                        | Typed, PropTypes removed                                        |
| `components/PivotTable/PivotTable.tsx`                                                                                                   | PropTypes removed                                               |
| `README.md`                                                                                                                              | Full rewrite                                                    |
| `CLAUDE.md`                                                                                                                              | Refreshed to match the code                                     |
| `components/CalculatedFieldDialog/CalculatedFieldDialog.tsx`, `components/Toolbar/sanitizeSvg.ts`, `pivot-core/matrix/MatrixComputer.ts` | WebDataRocks comments reworded                                  |
| `../PresentationApp/vite.config.js`                                                                                                      | FREEPLAN branch removed, alias renamed                          |
| `../PresentationApp/src/preview.jsx`                                                                                                     | Import specifiers renamed                                       |
| `../GuideApp/src/pages/index.js`, `../GuideApp/README.md`                                                                                | Package name in prose                                           |

**Deleted:**

| Path                         | Reason                                     |
| ---------------------------- | ------------------------------------------ |
| `options/optionsPropType.ts` | PropTypes dropped in favour of TypeScript  |
| `index.d.ts`                 | Replaced by a generated declaration bundle |

---

# Phase 0 — the package

## Task 1: Licence and package metadata

**Files:**

- Create: `LICENSE`
- Modify: `package.json`

**Interfaces:**

- Produces: a `package.json` carrying `license: "MIT"` and the repository/homepage/bugs triple that Task 18's README badges and Task 16's release workflow both read.

- [ ] **Step 1: Write the licence file**

Create `LICENSE`:

```
MIT License

Copyright (c) 2026 IT Solutions S.r.l.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Add the metadata block to `package.json`**

Insert these keys after `"version"`. Do **not** touch `"name"` yet — the rename is Task 9 and needs to move in lockstep with the sibling apps.

```json
  "description": "React pivot table with virtualized rendering, automatic date hierarchies, calculated fields and Excel export.",
  "keywords": [
    "react",
    "pivot-table",
    "pivot",
    "data-grid",
    "mui",
    "typescript",
    "analytics",
    "virtualized",
    "excel-export"
  ],
  "license": "MIT",
  "author": "IT Solutions S.r.l.",
  "homepage": "https://aurapivot-docs.web.app",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/itsolutions-dev/AuraPivot.git"
  },
  "bugs": {
    "url": "https://github.com/itsolutions-dev/AuraPivot/issues"
  },
  "engines": {
    "node": ">=18"
  },
  "sideEffects": false,
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
```

`sideEffects: false` tells bundlers every module is safe to tree-shake. This is true here — the package has no import-time side effects — and it is what lets a consumer who imports only `usePivotMatrix` avoid pulling in the dialogs.

- [ ] **Step 3: Add `LICENSE` to the published tarball**

Change the `files` array in `package.json`:

```json
  "files": [
    "dist",
    "LICENSE"
  ],
```

npm always includes `LICENSE` automatically, but listing it makes the intent explicit and survives anyone later switching to a different packer.

- [ ] **Step 4: Verify the manifest parses and the tarball contains what it should**

Run: `npm pkg get license name version && npm pack --dry-run`
Expected: `license` prints `"MIT"`, and the file listing includes `LICENSE` and `dist/`.

- [ ] **Step 5: Commit**

```bash
git add LICENSE package.json
git commit -m "chore: license under MIT and add package metadata"
```

---

## Task 2: Remove the obfuscator

**Files:**

- Modify: `rollup.config.js`, `scripts/verify-dist.mjs`, `package.json`

**Interfaces:**

- Produces: a build that always emits sourcemaps and a `__AURA_PIVOT_BUILD__` stamp of shape `{version}` (the `obfuscated` key is gone). Task 3 re-baselines the size ceiling this task leaves in place.

- [ ] **Step 1: Strip the obfuscator from `rollup.config.js`**

Delete these, in order: the `import obfuscator from "rollup-plugin-obfuscator";` line, the `OBFUSCATOR` constant and its comment block, the whole `obfuscatorOptions` object, the `HOT_PATHS` array and its comment, the `lightObfuscatorOptions` object, the `SOURCE_GLOBS` constant, the `obfuscatorPlugins` ternary and its comment block, and the `...obfuscatorPlugins,` entry in the `plugins` array.

Then replace the build stamp definition:

```js
// Machine-readable build stamp. Lives in the intro (real code, not a
// comment) so terser cannot strip it; scripts/verify-dist.mjs asserts it
// after every build, and it is inspectable at runtime via
// globalThis.__AURA_PIVOT_BUILD__.
const buildStamp = `globalThis.__AURA_PIVOT_BUILD__={version:${JSON.stringify(
  pkg.version,
)}};`;
```

And make both output entries emit sourcemaps unconditionally — change `sourcemap: !OBFUSCATOR,` to `sourcemap: true,` in each of the two `output` objects.

- [ ] **Step 2: Update `scripts/verify-dist.mjs`**

Replace the size constants, the stamp regex and the per-file loop body. The new version:

```js
// Bundled exceljs (~900 KB minified) would push the bundle well past this;
// without it the library plus its inlined deps stays far below.
const MAX_BYTES = 700 * 1024;

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
```

Also update the file's header comment — drop the mention of obfuscation.

- [ ] **Step 3: Remove the devDependencies**

Run: `npm uninstall javascript-obfuscator rollup-plugin-obfuscator`

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: rollup completes, then `verify-dist OK — build in dist/`. Both `dist/index.js.map` and `dist/index.esm.js.map` exist.

- [ ] **Step 5: Confirm the stamp shape changed**

Run: `node -e "import('./dist/index.esm.js').then(()=>console.log(globalThis.__AURA_PIVOT_BUILD__))"`
Expected: an object with a `version` key and no `obfuscated` key.

If the import fails because of a missing peer (React, MUI), fall back to a text check instead: `grep -o '__AURA_PIVOT_BUILD__={[^}]*}' dist/index.esm.js`

- [ ] **Step 6: Commit**

```bash
git add rollup.config.js scripts/verify-dist.mjs package.json package-lock.json
git commit -m "build: remove the obfuscator

MIT source cannot be protected by obfuscation, and the transform made
stack traces from user bug reports unreadable. Sourcemaps are now
unconditional and the build stamp drops its obfuscated flag."
```

---

## Task 3: Correct the runtime dependencies and externalise them

**Files:**

- Modify: `package.json`, `rollup.config.js`, `scripts/verify-dist.mjs`

**Interfaces:**

- Consumes: the single `MAX_BYTES` constant introduced in Task 2.
- Produces: a `dist/` that no longer inlines `react-virtuoso`, `@mui/icons-material` or `file-saver`, and a re-baselined size ceiling that Task 17's `size-limit` budget will mirror.

`react-virtuoso` is imported at runtime by `components/PivotTable/PivotTable.tsx` but sits in `devDependencies` — it works today only because rollup inlines it. Bundling it is also wrong on the merits: a consumer already using `react-virtuoso` would ship two copies with two independent scroll observers.

- [ ] **Step 1: Move `react-virtuoso` to `dependencies`**

Run: `npm uninstall react-virtuoso && npm install react-virtuoso@^4.18.12`

Confirm it now appears under `dependencies` and not `devDependencies`:

Run: `npm pkg get dependencies.react-virtuoso devDependencies.react-virtuoso`
Expected: the first is a version string, the second is `{}` or undefined.

- [ ] **Step 2: Externalise the three bundled dependencies**

In `rollup.config.js`, replace the `external` entry:

```js
  // Nothing in `dependencies` is bundled. exceljs (~900 KB) is loaded by
  // ExcelExporter through a dynamic import() on the first export; the other
  // three are ordinary imports the consumer's bundler resolves and
  // deduplicates against its own copy. Inlining them would ship a second
  // react-virtuoso — with its own scroll observer — into apps that already
  // use one.
  external: [
    "exceljs",
    "react-virtuoso",
    "file-saver",
    /^@mui\/icons-material($|\/)/,
  ],
```

The `@mui/icons-material` entry is a regular expression because the package is imported through deep paths (`@mui/icons-material/Close`), and a bare string would only match the root specifier.

- [ ] **Step 3: Build and read the new size**

Run: `npm run build && node -e "const fs=require('fs');for(const f of ['index.js','index.esm.js'])console.log(f, Math.round(fs.statSync('dist/'+f).size/1024)+' KB')"`
Expected: both files are substantially smaller than before this task. Record the larger of the two numbers.

- [ ] **Step 4: Re-baseline the ceiling**

In `scripts/verify-dist.mjs`, set `MAX_BYTES` to the larger recorded size rounded up to the next 50 KB, with a comment stating the observed figure. For example, if the larger file is 214 KB:

```js
// Observed 214 KB after externalising react-virtuoso, file-saver and
// @mui/icons-material. The ceiling catches a dependency accidentally
// falling back into the bundle, not ordinary growth.
const MAX_BYTES = 250 * 1024;
```

- [ ] **Step 5: Prove the externals really left the bundle**

Run: `grep -c "VirtuosoMockContext\|react-virtuoso" dist/index.esm.js || true`
Expected: the bundle contains the _import specifier_ `react-virtuoso` but not the library's implementation. Confirm with `grep -o "from'react-virtuoso'\|from \"react-virtuoso\"" dist/index.esm.js` returning at least one match, and the total file size drop from step 3.

- [ ] **Step 6: Run the full check and test suite**

Run: `npm run check && npm test && npm run build`
Expected: all pass, `verify-dist OK`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json rollup.config.js scripts/verify-dist.mjs
git commit -m "fix: declare react-virtuoso as a runtime dependency and stop bundling deps

react-virtuoso is imported by PivotTable but was declared only as a
devDependency; it survived because rollup inlined it. Externalising it
along with file-saver and @mui/icons-material also stops consumers who
already use react-virtuoso from shipping a second copy."
```

---

## Task 4: Drop PropTypes

**Files:**

- Delete: `options/optionsPropType.ts`
- Modify: `AuraPivot.jsx`, `components/PivotTable/PivotTable.tsx`

**Interfaces:**

- Produces: a tree with no `prop-types` import, which Task 5 needs before it can convert the entry point cleanly.

`prop-types` is imported by three runtime files but declared in neither `dependencies` nor `devDependencies` — it resolves only as a transitive hoist. Rather than declare it, remove it: React 19 ignores `propTypes` on function components entirely, so on the primary development target this validation is already dead code. The generated declarations from Task 6 replace it with compile-time checking.

- [ ] **Step 1: Confirm the current usage before removing anything**

Run: `grep -rn "PropTypes\|propTypes" --include=*.ts --include=*.tsx --include=*.jsx --include=*.js . | grep -v node_modules | grep -v /dist/`
Expected: matches in `AuraPivot.jsx`, `components/PivotTable/PivotTable.tsx`, `options/optionsPropType.ts`. Note every line — the next steps must remove all of them.

- [ ] **Step 2: Remove the PropTypes usage from `AuraPivot.jsx`**

Delete the `import PropTypes from "prop-types";` line, the `import optionsPropType from "./options/optionsPropType";` line, and the entire `Pivot.propTypes = { … };` assignment block near the bottom of the file. Leave `Pivot.displayName` if present — that one is still useful in React DevTools.

- [ ] **Step 3: Remove the PropTypes usage from `PivotTable.tsx`**

Delete the `import PropTypes from "prop-types";` line and the `PivotTable.propTypes = { … };` assignment block.

- [ ] **Step 4: Delete the schema module**

Run: `git rm options/optionsPropType.ts`

- [ ] **Step 5: Verify nothing still references it**

Run: `grep -rn "PropTypes\|propTypes\|optionsPropType" --include=*.ts --include=*.tsx --include=*.jsx --include=*.js . | grep -v node_modules | grep -v /dist/`
Expected: no output.

- [ ] **Step 6: Typecheck, test and build**

Run: `npm run check && npm test && npm run build`
Expected: all pass. The test suite is the regression signal here — `AuraPivot.smoke.test.tsx` and `AuraPivot.grid-controls.test.tsx` render the component and would surface a broken import immediately.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: drop PropTypes in favour of the type declarations

prop-types was imported by three runtime modules but declared in neither
dependencies nor devDependencies, resolving only by transitive hoist.
React 19 ignores propTypes on function components, so the validation was
already inert on the development target; the shipped .d.ts gives
consumers a stronger guarantee at compile time."
```

---

## Task 5: Convert the entry points to TypeScript

**Files:**

- Rename: `AuraPivot.jsx` → `AuraPivot.tsx`, `index.js` → `index.ts`
- Modify: `tsconfig.json`, `rollup.config.js`

**Interfaces:**

- Consumes: the PropTypes-free tree from Task 4.
- Produces: `AuraPivotProps` and `AuraPivotRef` exported as named types from `AuraPivot.tsx`, and an `index.ts` whose export list Task 6 turns into the generated declaration bundle. Both names are taken from the existing hand-written `index.d.ts` so the generated declarations keep the surface consumers already compile against.

`tsconfig.json` has no `allowJs`, so these two files — one of them the public entry point — have never been type checked.

- [ ] **Step 1: Rename with history preserved**

```bash
git mv AuraPivot.jsx AuraPivot.tsx
git mv index.js index.ts
```

- [ ] **Step 2: Point the rollup input at the new entry**

In `rollup.config.js`, change `input: "index.js",` to `input: "index.ts",`.

- [ ] **Step 3: See the full error list**

Run: `npm run check`
Expected: FAIL, with errors concentrated in `AuraPivot.tsx` — implicit `any` on the destructured props, on the `forwardRef` render function's parameters, and on the DOM fullscreen calls that reach for vendor-prefixed methods.

Record the error count. It is the progress metric for the next step.

- [ ] **Step 4: Type the component**

Declare the props interface at the top of `AuraPivot.tsx`, importing the existing option types rather than redefining them:

```ts
import type { Theme } from "@mui/material/styles";
import type { InternalOptions } from "./options/optionsSchema";
import type PivotEngineType from "./pivot-core";

export interface AuraPivotProps {
  options?: InternalOptions;
  dataSource?: Record<string, unknown>[];
  onOptionsChange?: (next: InternalOptions) => void;
  localization?: Record<string, unknown>;
  locale?: string;
  width?: string | number;
  height?: string | number;
  beforeToolbarCreated?: (api: { getTabs: () => unknown[] }) => void;
  theme?: Theme | ((outer: Theme) => Theme);
}

export interface AuraPivotRef {
  auraPivot: { getOptions: () => InternalOptions };
  engine: PivotEngineType;
}
```

Then type the `forwardRef` call site:

```ts
const Pivot = forwardRef<AuraPivotRef, AuraPivotProps>(function Pivot(
  props,
  ref,
) {
```

For the vendor-prefixed fullscreen properties, widen the element and document rather than reaching for `any` — the prefixed names are real on older Safari and IE and the cast documents that:

```ts
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};
```

Work the error list down to zero. Do not add `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` — the repository currently has none of these and that is worth keeping.

- [ ] **Step 5: Confirm the tree is clean**

Run: `npm run check`
Expected: PASS, no output.

Run: `grep -rn "@ts-nocheck\|@ts-ignore\|@ts-expect-error" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: no output.

- [ ] **Step 6: Confirm the component still behaves**

Run: `npm test`
Expected: all 114 cases pass. The two `AuraPivot.*.test.tsx` files mount the real component and are the regression signal for this conversion.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: `verify-dist OK`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: convert the entry points to TypeScript

tsconfig had no allowJs, so index.js and AuraPivot.jsx — the public
entry point among them — were the only files never type checked."
```

---

## Task 6: Generate the type declarations instead of hand-maintaining them

**Files:**

- Delete: `index.d.ts`, `AuraPivot.d.ts`
- Modify: `rollup.config.js`, `package.json`, `scripts/verify-dist.mjs`

**Interfaces:**

- Consumes: the exported types from Task 5 (`AuraPivotProps`, `AuraPivotHandle`).
- Produces: `dist/index.d.ts` generated by `rollup-plugin-dts`, asserted by `verify-dist`.

The hand-maintained `index.d.ts` is 285 lines that must be kept in sync by hand — exactly the kind of invisible obligation that turns an external contributor's correct patch into a broken release. `rollup-plugin-dts` is already in `devDependencies`.

- [ ] **Step 1: Record the current public surface before changing anything**

Run: `grep -n "^export\|^  export" index.d.ts | head -40`

Write the exported names down. Step 5 asserts the generated bundle still contains them, and this list is the reference.

- [ ] **Step 2: Add a declaration bundling pass to `rollup.config.js`**

The config currently exports a single object. Change it to export an array of two configs, the second producing declarations. Add the import at the top:

```js
import dts from "rollup-plugin-dts";
```

Change `export default {` to `const jsConfig = {` and, at the end of the file, add:

```js
// Declarations are bundled from source rather than hand-maintained: a
// contributor changing a prop type gets the shipped .d.ts updated for
// free, and cannot silently desynchronise it.
const dtsConfig = {
  input: "index.ts",
  output: { file: `${OUT_DIR}/index.d.ts`, format: "es" },
  external: [/\.css$/, /^@mui\//, /^react/, "exceljs", "react-virtuoso"],
  plugins: [dts()],
};

export default [jsConfig, dtsConfig];
```

- [ ] **Step 3: Remove the `copyTypes` plugin and the hand-written declarations**

Delete the `copyTypes` plugin definition from `rollup.config.js` and its `copyTypes(),` entry in the plugins array — the generated output now writes `dist/index.d.ts` directly, and leaving both would have the copy overwrite the generated file.

```bash
git rm index.d.ts AuraPivot.d.ts
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: rollup runs two configs; `dist/index.d.ts` exists and is generated, not copied.

- [ ] **Step 5: Compare the generated surface against the recorded list**

Run: `grep -n "^export\|declare" dist/index.d.ts`
Expected: every name recorded in step 1 appears. `PivotOptions`, `AuraPivotProps`, `AuraPivotRef` and the hook types must all be present.

If a name is missing, it was exported only by the hand-written file and never by the source. Add the missing export to `index.ts` rather than reintroducing a hand-maintained declaration.

- [ ] **Step 6: Add the assertion to `verify-dist.mjs`**

Append before the final `if (problems.length > 0)` block:

```js
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
```

Adjust `REQUIRED_TYPES` to match the names actually confirmed in step 5 — do not assert a name the generated bundle does not have.

- [ ] **Step 7: Verify the assertion works by breaking it deliberately**

Temporarily add a bogus entry (`"NoSuchType"`) to `REQUIRED_TYPES` and run `node scripts/verify-dist.mjs`.
Expected: FAIL with `public type 'NoSuchType' is no longer exported`. Remove the bogus entry and re-run — expected `verify-dist OK`.

An assertion nobody has seen fail is an assertion nobody knows works.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build: generate the type declarations from source

index.d.ts was 285 hand-maintained lines that had to be kept in sync
manually — a silent trap for anyone changing a prop type. verify-dist now
fails the build if a consumer-facing type stops being exported."
```

---

## Task 7: Expose the theme subpath the playground already imports

**Files:**

- Modify: `package.json`, `index.ts`, `rollup.config.js`

**Interfaces:**

- Produces: a working `aura-pivot/theme` entry point exporting `TONE_STOPS`, `buildSwatches` and `variantSwatches`. Task 9 renames the specifier the playground uses to reach it.

`../PresentationApp/src/preview.jsx:9` imports `{ variantSwatches } from "@its/aura-pivot/theme"`. The `exports` map has no `./theme` key and the re-export in `index.js` is commented out — the import resolves only through a Vite alias pointing at `Library/theme/swatches.js`, a path that does not even exist (the file is `swatches.ts`). Anyone installing from npm and following the playground gets `ERR_PACKAGE_PATH_NOT_EXPORTED`.

- [ ] **Step 1: Reproduce the failure**

Run: `node -e "require.resolve('aura-pivot/theme')" 2>&1 | head -3`

Expected: it fails. This is the bug; keep the output for the commit message.

- [ ] **Step 2: Build the theme entry as its own bundle**

In `rollup.config.js`, add a third config and include it in the default export array:

```js
const themeConfig = {
  input: "theme/swatches.ts",
  output: [
    {
      file: `${OUT_DIR}/theme.js`,
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
  output: { file: `${OUT_DIR}/theme.d.ts`, format: "es" },
  plugins: [dts()],
};

export default [jsConfig, dtsConfig, themeConfig, themeDtsConfig];
```

- [ ] **Step 3: Declare the subpath in `exports`**

```json
    "./theme": {
      "types": "./dist/theme.d.ts",
      "import": "./dist/theme.esm.js",
      "require": "./dist/theme.js"
    },
```

Place it after the `"."` entry and before the locales entries.

- [ ] **Step 4: Add the required files to `verify-dist.mjs`**

Extend the `requiredFiles` array:

```js
const requiredFiles = [
  "index.js",
  "index.esm.js",
  "index.d.ts",
  "theme.js",
  "theme.esm.js",
  "theme.d.ts",
  "locales/en.json",
  "locales/it.json",
];
```

- [ ] **Step 5: Build and confirm the subpath resolves**

Run: `npm run build && node -e "import('./dist/theme.esm.js').then(m=>console.log(Object.keys(m)))"`
Expected: `[ 'TONE_STOPS', 'buildSwatches', 'variantSwatches' ]`.

- [ ] **Step 6: Commit**

```bash
git add package.json rollup.config.js scripts/verify-dist.mjs
git commit -m "feat: expose the theme helpers as a package subpath

The playground imports variantSwatches from a /theme subpath the exports
map never declared; it worked only through a Vite alias pointing at the
source tree. An npm consumer following the same example hit
ERR_PACKAGE_PATH_NOT_EXPORTED."
```

---

## Task 8: Remove the dead FREEPLAN configuration

**Files:**

- Modify: `../PresentationApp/vite.config.js`

**Interfaces:**

- Produces: a Vite config whose alias always points at the Library source, which Task 9 then renames.

The `FREEPLAN` branch swaps the alias to an obfuscated, drill-through-disabled, 1 MB-capped bundle and instructs the reader to run `npm --prefix ../Library run build:freeplan` — a script that no longer exists. It is the last trace of the commercial gate that decision D1 removes.

- [ ] **Step 1: Confirm the script really is gone**

Run: `npm --prefix ../Library pkg get scripts`
Expected: `check`, `test`, `build`, `prepublishOnly`. No `build:freeplan`.

- [ ] **Step 2: Delete the branch**

In `../PresentationApp/vite.config.js`, remove the `FREEPLAN` comment block, the `const FREEPLAN = …` line, and the `libEntry` ternary. Replace with:

```js
const libEntry = path.resolve(libRoot, "AuraPivot.tsx");
```

Note the `.tsx` extension — Task 5 renamed the file.

- [ ] **Step 3: Update the now-stale polyfill comment**

The `nodePolyfills` comment block opens with "Library/dist (FREEPLAN build, OBFUSCATOR=0) leaves Node builtins…". Rewrite it so it describes the actual reason without referring to a build mode that no longer exists:

```js
// exceljs and jszip reference Node builtins (events, stream, crypto, …).
// Vite leaves them as external imports in the browser, which throws at
// runtime. This plugin injects polyfills for the builtins and the
// `process` global so the pivot's Excel export works in the playground.
```

- [ ] **Step 4: Confirm the playground still builds and runs**

Run: `npm --prefix ../PresentationApp run build`
Expected: build succeeds.

Then run `npm --prefix ../PresentationApp run dev`, open `http://localhost:8080`, and confirm the pivot renders with data. Stop the server afterwards.

- [ ] **Step 5: Commit in the PresentationApp repository**

```bash
cd ../PresentationApp && git add vite.config.js
git commit -m "chore: drop the dead FREEPLAN build branch

It aliased the pivot to an obfuscated, capped bundle produced by
build:freeplan — a script that no longer exists in Library."
```

---

## Task 9: Rename the package to `aura-pivot`

**Files:**

- Modify: `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-05-19-library-typescript-conversion.md`, `docs/superpowers/specs/2026-05-19-library-typescript-conversion-design.md`, `../PresentationApp/vite.config.js`, `../PresentationApp/src/preview.jsx`, `../GuideApp/src/pages/index.js`, `../GuideApp/README.md`, and three specs under `../docs/superpowers/`

**Interfaces:**

- Produces: the specifier `aura-pivot` everywhere. Task 18's README and Task 15's release workflow both assume this name.

This must land as one atomic change across both repositories. `PresentationApp` resolves the library through a Vite alias keyed on the old specifier; the moment the two sides disagree, its build fails.

- [ ] **Step 1: Enumerate every occurrence**

Run from the workspace root (`..`): `grep -rn "@its/aura-pivot" --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.json --include=*.md --include=*.mdx . | grep -v node_modules | grep -v /dist/ | grep -v /build/`

Expected: 14 files. Keep the list — step 5 verifies against it.

- [ ] **Step 2: Rename in `Library/`**

Change `package.json` `"name"` to `"aura-pivot"`. Then update every prose and code occurrence in `README.md`, `CLAUDE.md` and the two docs under `docs/superpowers/`.

Run: `npm install` to regenerate `package-lock.json` with the new name.

- [ ] **Step 3: Rename in `PresentationApp`**

In `vite.config.js`, update the three alias `find` regexes:

```js
      {
        find: /^aura-pivot\/locales\/(.*)$/,
        replacement: path.resolve(libRoot, "localization") + "/$1",
      },
      {
        find: /^aura-pivot\/theme$/,
        replacement: path.resolve(libRoot, "theme/swatches.ts"),
      },
      {
        find: /^aura-pivot$/,
        replacement: libEntry,
      },
```

Note the `theme/swatches.ts` extension correction — the old alias pointed at a `.js` file that does not exist.

In `src/preview.jsx`, update the four import specifiers on lines 4, 5, 6 and 9.

- [ ] **Step 4: Rename in `GuideApp` and the workspace docs**

Update the prose in `../GuideApp/src/pages/index.js:10`, `../GuideApp/README.md:3`, and the three specs under `../docs/superpowers/`.

- [ ] **Step 5: Verify nothing is left**

Run from the workspace root: `grep -rn "@its/aura-pivot" . | grep -v node_modules | grep -v /dist/ | grep -v /build/ | grep -v "\.git/"`
Expected: no output.

- [ ] **Step 6: Build all three apps**

Run:

```
npm --prefix Library run build
npm --prefix PresentationApp run build
npm --prefix GuideApp run build
```

Expected: all three succeed. This is the gate for phase 0 — if the playground builds, the alias rename is consistent.

- [ ] **Step 7: Commit in both repositories**

```bash
cd Library && git add -A && git commit -m "chore: rename the package to aura-pivot

The @its scope was never registered on npm and reads as a vendor package.
The unscoped name is available and shorter."

cd ../ && git add PresentationApp GuideApp docs && git commit -m "chore: follow the aura-pivot package rename"
```

---

## Task 10: Remove the WebDataRocks references

**Files:**

- Modify: `components/CalculatedFieldDialog/CalculatedFieldDialog.tsx:26`, `components/Toolbar/sanitizeSvg.ts:4`, `pivot-core/matrix/MatrixComputer.ts:6`

**Interfaces:**

- Produces: a working tree with no reference to the product this library was originally modelled on.

- [ ] **Step 1: Locate all three**

Run: `grep -rn "WebDataRocks" --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.md . | grep -v node_modules | grep -v /dist/`
Expected: exactly three matches, in the files listed above.

- [ ] **Step 2: Reword each to state the behaviour directly**

In `components/CalculatedFieldDialog/CalculatedFieldDialog.tsx`, change `* Formula syntax (mirrors WebDataRocks):` to:

```
 * Formula syntax:
```

In `components/Toolbar/sanitizeSvg.ts`, the comment reads "Toolbar tabs accept raw `<svg>…</svg>` strings (legacy WebDataRocks…". Replace the parenthetical so it explains why the escape hatch exists on its own terms:

```
 * Toolbar tabs accept raw `<svg>…</svg>` strings, so a host can supply an
 * icon without importing a component. The markup is caller-supplied and
 * therefore untrusted — everything below exists to make it safe to inject.
```

In `pivot-core/matrix/MatrixComputer.ts`, the comment reads "row axis (analogous to WebDataRocks). When it appears on an axis, every…". Drop the parenthetical entirely; the sentence reads correctly without it.

- [ ] **Step 3: Verify**

Run: `grep -rni "webdatarocks" . | grep -v node_modules | grep -v /dist/ | grep -v "\.git/"`
Expected: no output.

- [ ] **Step 4: Typecheck and test**

Run: `npm run check && npm test`
Expected: PASS. These are comment-only edits, so a failure means an edit went into code.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: state behaviour directly instead of by analogy

Three comments explained a design by pointing at another product, which
stops helping the moment the reader has not used it."
```

---

## Task 11: Refresh `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

`CLAUDE.md` is the first file a contributor reads, and it currently describes a repository that no longer exists.

- [ ] **Step 1: List the claims to check**

The known drift:

- It states `components/PivotTable/PivotTable.tsx` carries `@ts-nocheck`. The repository has no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` anywhere.
- It refers to `PivotEngine.js`, `optionsAdapter.js`, `types.js` and `merge.js`; these are `.ts`.
- It documents the obfuscator, `OBFUSCATOR=1`, `HOT_PATHS` and `reservedStrings` — all removed in Task 2.
- It says declarations are "hand-maintained in `index.d.ts` (root) and copied by the `copyTypes` rollup plugin" — replaced in Task 6.
- It describes the package as private and names peer dependency `react-intl`, which is not in `peerDependencies`.
- It says the rollup config uses `assert { type: "json" }` and therefore needs Node ≥ 18. The config uses `with { type: "json" }`, which needs Node ≥ 20 — and that is a development requirement only, not the `engines` floor.
- It describes the package as a drop-in replacement for another component, phrased through a mangled find-and-replace. Delete the claim rather than repairing it (decision D6).

- [ ] **Step 2: Verify each claim against the code before rewriting**

Run:

```
grep -rn "@ts-nocheck" --include=*.tsx . | grep -v node_modules
grep -n "react-intl" package.json
ls pivot-core/PivotEngine.* options/optionsAdapter.* pivot-core/types.* localization/merge.*
```

Expected: no `@ts-nocheck`, no `react-intl`, and `.ts` extensions throughout. Fix the document to match what you observe, not what this plan predicts.

- [ ] **Step 3: Rewrite the affected sections**

Update the Project, Build, Architecture and Conventions sections. The library is now MIT and public-bound: say so, and point at `CONTRIBUTING.md` (created in Task 18) for contributor workflow.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: bring CLAUDE.md back in sync with the code

It described a @ts-nocheck that no longer exists, .js modules that are
now .ts, the removed obfuscator, and hand-maintained declarations."
```

---

## Task 12: Linting and formatting

**Files:**

- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`
- Modify: `package.json`

**Interfaces:**

- Produces: `npm run lint` and `npm run format:check`, both consumed by Task 14's CI workflow.

The existing style is encoded rather than changed. A lint rollout that reformats the whole repository would bury every subsequent diff.

- [ ] **Step 1: Install**

Run: `npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier eslint-config-prettier`

- [ ] **Step 2: Write `eslint.config.js`**

```js
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
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  prettier,
);
```

`eslint-config-prettier` comes last so it can switch off the stylistic rules Prettier owns. Without that ordering the two tools fight and every commit becomes a formatting argument.

- [ ] **Step 3: Write the Prettier configuration**

`.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "overrides": [
    {
      "files": ["*.ts", "*.tsx"],
      "options": { "singleQuote": true }
    }
  ]
}
```

This encodes the existing split — single quotes in TypeScript, double quotes elsewhere — rather than imposing one style on a repository that already made the choice.

`.prettierignore`:

```
dist
coverage
node_modules
package-lock.json
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Add the scripts**

```json
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
```

- [ ] **Step 5: See how far off the codebase is**

Run: `npm run lint`
Expected: some errors. Fix them, but do not silence a rule to make a real finding go away — unused variables and exhaustive-deps warnings on an 18 000-line codebase usually point at something.

If a rule turns out to be genuinely wrong for this codebase, downgrade it in `eslint.config.js` with a comment explaining why, in the same style as the `no-explicit-any` entry above.

- [ ] **Step 6: Apply formatting in its own commit**

Run: `npm run format`

Then run `npm run check && npm test` to confirm formatting changed nothing semantic.

- [ ] **Step 7: Commit as two separate commits**

```bash
git add eslint.config.js .prettierrc.json .prettierignore .editorconfig package.json package-lock.json
git commit -m "chore: add ESLint and Prettier

Encodes the conventions already in the codebase rather than imposing new
ones, so the rollout does not bury later diffs in reformatting."

git add -A
git commit -m "style: apply Prettier across the repository"
```

Keeping the mechanical reformatting in its own commit means `git blame` stays useful — a reviewer can skip it with a single `--ignore-rev`.

- [ ] **Step 8: Record the formatting commit for blame**

Create `.git-blame-ignore-revs`:

```
# Repository-wide Prettier run, no semantic change.
<sha of the style commit>
```

Then commit it:

```bash
git add .git-blame-ignore-revs
git commit -m "chore: ignore the formatting commit in git blame"
```

---

## Task 13: Third-party attribution

**Files:**

- Create: `scripts/third-party-notices.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `THIRD-PARTY-NOTICES.md`, generated at build time and shipped in the tarball.

After Task 3 the bundle inlines far less, but rollup still inlines whatever is neither a peer dependency nor listed in `external`. MIT requires retaining the copyright notice of any code redistributed, and the current tarball carries none.

- [ ] **Step 1: Write the generator**

Create `scripts/third-party-notices.mjs`:

```js
/**
 * Emits THIRD-PARTY-NOTICES.md from the production dependency tree.
 *
 * MIT and BSD both require retaining the copyright notice of redistributed
 * code. Anything rollup inlines into dist/ is redistributed by us, so its
 * notice has to travel with the tarball.
 *
 * Usage: node scripts/third-party-notices.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const OUT = "THIRD-PARTY-NOTICES.md";
const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"];

const tree = JSON.parse(
  execSync("npm ls --omit=dev --json --all", { encoding: "utf8" }),
);

const seen = new Map();
const walk = (node) => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (!seen.has(name) && dep.path) seen.set(name, dep.path);
    walk(dep);
  }
};
walk(tree);

const sections = [];
for (const [name, dir] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  let text = "";
  for (const f of LICENSE_FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      text = fs.readFileSync(p, "utf8").trim();
      break;
    }
  }

  sections.push(
    `## ${name}@${pkg.version}\n\n` +
      `License: ${pkg.license ?? "see below"}\n` +
      (pkg.homepage ? `Homepage: ${pkg.homepage}\n` : "") +
      (text ? `\n\`\`\`\n${text}\n\`\`\`\n` : "\n"),
  );
}

const header =
  "# Third-party notices\n\n" +
  "aura-pivot redistributes portions of the packages below. Each is\n" +
  "reproduced with its own licence and copyright notice, as those licences\n" +
  "require.\n\n---\n\n";

fs.writeFileSync(OUT, header + sections.join("\n---\n\n"));
console.log(`third-party-notices: wrote ${OUT} (${sections.length} packages)`);
```

- [ ] **Step 2: Chain it into the build and ship it**

In `package.json`, extend the build script and the `files` array:

```json
    "build": "npm run check && rollup -c && node scripts/third-party-notices.mjs && node scripts/verify-dist.mjs",
```

```json
  "files": [
    "dist",
    "LICENSE",
    "THIRD-PARTY-NOTICES.md"
  ],
```

- [ ] **Step 3: Generate and read it**

Run: `node scripts/third-party-notices.mjs && head -40 THIRD-PARTY-NOTICES.md`
Expected: a section per production dependency, each with a licence body. Confirm `exceljs`, `file-saver`, `react-virtuoso` and `@mui/icons-material` appear.

- [ ] **Step 4: Confirm it reaches the tarball**

Run: `npm pack --dry-run 2>&1 | grep -i "third-party\|LICENSE"`
Expected: both files listed.

- [ ] **Step 5: Ignore the generated file in git**

Add to `.gitignore`:

```
THIRD-PARTY-NOTICES.md
```

It is a build artifact regenerated from the lockfile; committing it means reviewing a large mechanical diff on every dependency bump.

- [ ] **Step 6: Commit**

```bash
git add scripts/third-party-notices.mjs package.json .gitignore
git commit -m "build: generate third-party attribution

The tarball redistributes code from its dependencies and shipped no
copyright notices, which their MIT and BSD licences require."
```

---

# Phase 1 — automation and documentation

## Task 14: Coverage tooling and a measured baseline

**Files:**

- Create: `vitest.config.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**

- Produces: `npm run test:coverage`, consumed by Task 15's CI workflow. The thresholds set here are the floor phases 2 and 3 ratchet upward.

- [ ] **Step 1: Install the coverage provider**

Run: `npm install -D @vitest/coverage-v8`

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "pivot-core/**",
        "components/**",
        "options/**",
        "hooks/**",
        "localization/**",
        "utils/**",
        "context/**",
        "theme/**",
        "AuraPivot.tsx",
        "index.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      // Thresholds are a ratchet: they record what is covered today so a
      // change cannot quietly reduce it. Phases 2 and 3 raise them toward
      // the targets in the spec (pivot-core 95, global 90).
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
```

- [ ] **Step 3: Add the script**

```json
    "test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Measure the real baseline**

Run: `npm run test:coverage`
Expected: a coverage table. Record the global `lines`, `functions`, `branches` and `statements` percentages, and the per-directory figures for `pivot-core/`.

The spec estimates 20–30% lines from a structural reading. Whatever the real number is, that is the number — write it down and use it.

- [ ] **Step 5: Set the thresholds to the measured values, rounded down**

Replace the zeros with the measured percentages rounded down to the nearest whole number. Add a comment recording the measurement date.

- [ ] **Step 6: Prove the ratchet bites**

Temporarily raise `lines` by 10 points and run `npm run test:coverage`.
Expected: FAIL with a coverage threshold error. Restore the correct value and re-run — expected PASS.

- [ ] **Step 7: Ignore the coverage output**

`coverage/` is already in `.gitignore`. Confirm with `grep -n coverage .gitignore`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add coverage reporting with a ratcheting threshold

Thresholds record today's measured coverage so it cannot silently drop.
Phases 2 and 3 raise them toward 95% on pivot-core and 90% globally."
```

---

## Task 15: Continuous integration

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `npm run lint`, `npm run format:check` (Task 12), `npm run check`, `npm run test:coverage` (Task 14), `npm run build`.

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint and typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run check

  test:
    name: Test (Node ${{ matrix.node }}, React ${{ matrix.react }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22, 24]
        react: [18, 19]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      # The peer range is >=18, so both majors have to actually be exercised.
      # Installing React 18 over the React 19 devDependency is the only way
      # to find out whether a 19-only API slipped in.
      - name: Install React ${{ matrix.react }}
        if: matrix.react == 18
        run: npm install --no-save react@18 react-dom@18 @testing-library/react@14
      - run: npm run test:coverage

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Upload dist
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7
```

`build` runs `verify-dist` as part of `npm run build`, so the bundle assertions gate every pull request.

- [ ] **Step 2: Verify the workflow parses**

Run: `npx --yes yaml-lint .github/workflows/ci.yml` or, if the network is unavailable, `node -e "require('js-yaml')" ` and parse it manually.

A cheaper check that catches most mistakes: `gh workflow view` after pushing.

- [ ] **Step 3: Push to a branch and confirm CI runs green**

```bash
git checkout -b ci/bootstrap
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck, test and build on every push"
git push -u origin ci/bootstrap
gh pr create --fill
gh pr checks --watch
```

Expected: every job green. If the React 18 matrix leg fails, that is a real finding — a React 19-only API reached the source and the peer range is a lie. Fix the source, not the matrix.

- [ ] **Step 4: Merge**

```bash
gh pr merge --squash
```

---

## Task 16: Release automation with Changesets

**Files:**

- Create: `.changeset/config.json`, `.github/workflows/release.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: the `publishConfig` block from Task 1 and the package name from Task 9.

- [ ] **Step 1: Install and initialise**

Run: `npm install -D @changesets/cli && npx changeset init`

- [ ] **Step 2: Configure**

Replace `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "itsolutions-dev/AuraPivot" }
  ],
  "commit": false,
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Run: `npm install -D @changesets/changelog-github`

- [ ] **Step 3: Add the scripts**

```json
    "changeset": "changeset",
    "version": "changeset version && npm install --package-lock-only",
    "release": "npm run build && changeset publish"
```

`version` regenerates the lockfile so the version bump and the lockfile land in the same version PR.

- [ ] **Step 4: Write the release workflow**

```yaml
name: Release

on:
  push:
    branches: [master]

concurrency:
  group: release-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      # Opens or updates a version PR when changesets are pending; publishes
      # when that PR is merged and the changesets have been consumed.
      - name: Create version PR or publish
        uses: changesets/action@v1
        with:
          version: npm run version
          publish: npm run release
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

`id-token: write` is what makes npm provenance work — without it, `NPM_CONFIG_PROVENANCE` fails the publish rather than being ignored.

- [ ] **Step 5: Document the prerequisite**

The workflow needs an `NPM_TOKEN` repository secret holding an npm **automation** token (a granular token will not work with provenance). It cannot be created from this plan — record it in `CONTRIBUTING.md` in Task 18 and in the phase 4 checklist.

Until the secret exists the workflow will open version PRs correctly and fail only at the publish step, which is the safe failure mode while the repository is still private.

- [ ] **Step 6: Add a changeset for the work done so far**

Run: `npx changeset`

Choose a **minor** bump and describe the release:

```
Relicensed under MIT and renamed to `aura-pivot`. The build no longer
obfuscates its output and ships sourcemaps. Type declarations are now
generated from source. `react-virtuoso` is declared as a runtime
dependency and, along with `file-saver` and `@mui/icons-material`, is no
longer bundled. New `aura-pivot/theme` entry point. PropTypes removed in
favour of the shipped declarations.
```

- [ ] **Step 7: Commit**

```bash
git add .changeset .github/workflows/release.yml package.json package-lock.json
git commit -m "ci: automate releases with Changesets"
```

---

## Task 17: Supply-chain and bundle-size automation

**Files:**

- Create: `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `.size-limit.json`
- Modify: `package.json`, `.github/workflows/ci.yml`

- [ ] **Step 1: CodeQL**

`.github/workflows/codeql.yml`:

```yaml
name: CodeQL

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: "0 6 * * 1"

permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

- [ ] **Step 2: Dependabot**

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      # One PR per week for the routine bumps; majors stay separate so they
      # get read rather than rubber-stamped.
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 3: Bundle budget**

Run: `npm install -D size-limit @size-limit/preset-small-lib`

`.size-limit.json` — set `limit` to roughly 15% above the sizes observed in Task 3:

```json
[
  {
    "name": "ESM bundle",
    "path": "dist/index.esm.js",
    "limit": "250 KB"
  },
  {
    "name": "theme entry",
    "path": "dist/theme.esm.js",
    "limit": "10 KB"
  }
]
```

Add the script:

```json
    "size": "size-limit"
```

- [ ] **Step 4: Wire size-limit into CI**

Append to the `build` job in `.github/workflows/ci.yml`, after the `npm run build` step:

```yaml
- run: npm run size
```

- [ ] **Step 5: Remove the now-duplicated ceiling**

`verify-dist.mjs` and `size-limit` would otherwise both police bundle size, meaning two numbers to update for one change. Delete the `MAX_BYTES` constant and its check from `scripts/verify-dist.mjs`, leaving the artifact-completeness, stamp, exceljs-specifier, sourcemap and type-surface assertions — the things size-limit does not cover.

- [ ] **Step 6: Verify locally**

Run: `npm run build && npm run size`
Expected: both entries under their limits.

- [ ] **Step 7: Commit**

```bash
git add .github .size-limit.json package.json package-lock.json scripts/verify-dist.mjs
git commit -m "ci: add CodeQL, Dependabot and a bundle budget

size-limit takes over the bundle ceiling from verify-dist, which keeps
the assertions size-limit cannot make."
```

---

## Task 18: Community files

**Files:**

- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`

- [ ] **Step 1: `CONTRIBUTING.md`**

````markdown
# Contributing

## The thing that trips everyone up first

This repository has no dev server of its own. The way you see a change is
through the playground, which lives in a **separate repository** and
resolves `aura-pivot` through a Vite alias pointing at a sibling directory
on disk. Both repositories have to be checked out next to each other:

```
your-workspace/
  AuraPivot/         ← this repository
  AuraPivotApp/      ← the playground and docs site
```

If the playground reports that it cannot resolve `aura-pivot`, the two
directories are not siblings.

## Setup

```bash
git clone https://github.com/itsolutions-dev/AuraPivot.git
cd AuraPivot
npm install
```

**Node 20 or later** is required for development. The `engines` field says
`>=18` because that is what the _published package_ needs at runtime; the
build itself uses the `with { type: "json" }` import attribute, which Node
18 does not support. Installing on 18 works. Building on 18 does not.

## Seeing your change

```bash
cd ../AuraPivotApp
npm --prefix PresentationApp run dev     # http://localhost:8080
```

The playground reads the library source directly, so a save reloads the
page. There is no build step in the loop.

## Before you open a pull request

```bash
npm run check          # tsc --noEmit
npm run lint
npm run format
npm test
npm run build          # includes the dist assertions
```

CI runs all of these plus a React 18 / React 19 matrix. The peer range is
`>=18`, so a React 19-only API is a bug even if your editor does not flag it.

## Tests

New code arrives with tests. Coverage thresholds in `vitest.config.ts` are a
ratchet — they are set to what is covered today and only ever go up, so a
change that lowers coverage fails CI rather than passing quietly.

The engine (`pivot-core/`) is pure and framework-agnostic; test it directly
with plain unit tests, not through a rendered component. Reach for
`@testing-library/react` only for behaviour that genuinely needs the DOM.

The virtualized grid renders nothing under a headless DOM unless it is
wrapped in `VirtuosoMockContext` with an explicit viewport height — see the
existing `PivotTable` tests for the pattern.

## Changesets

Every change a consumer could notice needs one:

```bash
npx changeset
```

Pick the bump, write a sentence a user of the library would understand.
Releases are cut automatically from these, so a missing changeset means
your fix ships without a version and without a changelog entry.

Internal-only changes — CI, tests, docs — do not need one.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`test:`, `build:`, `ci:`). The body should say why, not what — the diff
already says what.

## Style

2-space indent, semicolons. Single quotes in `.ts` and `.tsx`, double quotes
in `.js`, `.jsx` and `.mjs`. Prettier enforces this; `npm run format` before
committing saves a CI round trip.

Do not add `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. The repository
has none, and that is worth keeping.

## Releasing (maintainers)

Merging to `master` opens a version pull request. Merging _that_ publishes to
npm with provenance, using the `NPM_TOKEN` repository secret. Nothing
publishes from a local machine.
````

- [ ] **Step 2: `CODE_OF_CONDUCT.md`**

Contributor Covenant 2.1 verbatim, with the enforcement contact set to a real monitored address.

- [ ] **Step 3: `SECURITY.md`**

```markdown
# Security policy

## Reporting a vulnerability

Report privately through GitHub's [security advisory
form](https://github.com/itsolutions-dev/AuraPivot/security/advisories/new).
Do not open a public issue.

Expect an acknowledgement within three working days and an assessment
within ten.

## Scope

The parts of this library that process untrusted input are the places a
vulnerability is most likely to live:

- **`pivot-core/matrix/FormulaEvaluator.ts`** evaluates calculated-field
  formulas. It is a hand-written tokenizer and AST walker specifically to
  avoid `Function()` and `eval`. A formula that escapes the evaluator, reads
  outside its scope, or causes unbounded computation is in scope.
- **`components/Toolbar/sanitizeSvg.ts`** sanitizes caller-supplied SVG for
  custom toolbar icons. Markup that survives sanitization and executes is in
  scope.
- **Dataset handling.** Field names and cell values come from the host
  application's data and are rendered as text; anything that escapes into
  markup is in scope.

## Supported versions

The latest minor release receives security fixes.
```

- [ ] **Step 4: Issue templates**

`.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug report
description: Something behaves differently from what the documentation says
labels: [bug]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened
      description: What you saw, and what you expected instead.
    validations:
      required: true
  - type: input
    id: reproduction
    attributes:
      label: Reproduction
      description: A StackBlitz or a minimal repository. Bugs with a reproduction get fixed; bugs without one usually do not.
    validations:
      required: true
  - type: textarea
    id: options
    attributes:
      label: Your options object
      description: The configuration passed to the component, with any confidential data replaced.
      render: json
  - type: input
    id: version
    attributes:
      label: aura-pivot version
    validations:
      required: true
  - type: input
    id: react-version
    attributes:
      label: React and MUI versions
    validations:
      required: true
```

`.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature request
description: Suggest a capability the library does not have
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem are you solving
      description: Describe the situation, not the solution. The most useful requests explain what you were trying to build when you hit the wall.
    validations:
      required: true
  - type: textarea
    id: workaround
    attributes:
      label: What you are doing instead today
  - type: textarea
    id: proposal
    attributes:
      label: What you would like the API to look like
```

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Question or idea
    url: https://github.com/itsolutions-dev/AuraPivot/discussions
    about: Ask in Discussions — questions get answered faster there than in issues.
  - name: Documentation
    url: https://aurapivot-docs.web.app
    about: The full options reference and tutorials.
```

- [ ] **Step 5: PR template and CODEOWNERS**

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What was wrong or missing. -->

## Checklist

- [ ] Tests cover the change
- [ ] `npm run check`, `npm run lint` and `npm test` pass
- [ ] `npx changeset` run, if this affects consumers
- [ ] Documentation updated, if this changes the `options` schema
```

`.github/CODEOWNERS`:

```
* @itsolutions-dev/maintainers
```

- [ ] **Step 6: Commit**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github
git commit -m "docs: add the contributor and security documentation"
```

---

## Task 19: Rewrite the README

**Files:**

- Modify: `README.md`
- Create: `docs/assets/` capture referenced by the README hero

**Interfaces:**

- Consumes: the package name from Task 9, the badges enabled by Tasks 1, 15 and 17, and the `aura-pivot/theme` subpath from Task 7.

The current README is 18 KB that read as an internal API reference. It opens on a comparison table that compares the product against itself, has no screenshot, never says why anyone should choose it, and closes by declaring itself private.

- [ ] **Step 1: Capture the hero image**

Run `npm --prefix ../PresentationApp run dev`, open `http://localhost:8080`, and record a short screen capture of the playground: a pivot with data, then a drag of a field between axes, then a measure change. Save as `docs/assets/aura-pivot.gif` (under 3 MB — GitHub does not lazy-load README images, and a heavy hero is the first thing a visitor waits for).

If a GIF is impractical, a PNG of the pivot with real data is a fine substitute and loads faster. A still that shows the product beats an animation nobody waits for.

- [ ] **Step 2: Write the new README**

Replace the file entirely with the following. Verify the numbers in "What you get" against reality before committing — the row count in the first bullet must be one you have actually scrolled in the playground, and the bundle figure must match what `npm run size` reports.

````markdown
# aura-pivot

A React pivot table that stays responsive when the dataset stops being small.

[![npm](https://img.shields.io/npm/v/aura-pivot.svg)](https://www.npmjs.com/package/aura-pivot)
[![CI](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml/badge.svg)](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aura-pivot.svg)](https://github.com/itsolutions-dev/AuraPivot/blob/master/LICENSE)

![A pivot table with fields being dragged between the row and column axes](https://raw.githubusercontent.com/itsolutions-dev/AuraPivot/master/docs/assets/aura-pivot.gif)

**[Live playground](https://aurapivot.web.app)** · **[Documentation](https://aurapivot-docs.web.app)**

## Install

```bash
npm install aura-pivot
npm install react react-dom @mui/material @emotion/react @emotion/styled
```

The second line is peer dependencies. If you are already using MUI — and the
reason to pick this library is usually that you are — you have them.

## Quickstart

```jsx
import { useState } from "react";
import AuraPivot from "aura-pivot";

const rows = [
  { agent: "Rossi", region: "North", revenue: 1200 },
  { agent: "Bianchi", region: "South", revenue: 950 },
  { agent: "Rossi", region: "South", revenue: 430 },
];

export default function Report() {
  const [options, setOptions] = useState({
    data: {
      fields: [
        { uniqueName: "agent", dataType: "string", caption: "Agent" },
        { uniqueName: "region", dataType: "string", caption: "Region" },
        { uniqueName: "revenue", dataType: "number", caption: "Revenue" },
      ],
      dimensions: [
        { axis: "row", uniqueName: "agent" },
        { axis: "column", uniqueName: "region" },
      ],
      measures: [{ uniqueName: "revenue", aggregation: "sum" }],
    },
  });

  return (
    <AuraPivot
      height={600}
      options={options}
      dataSource={rows}
      onOptionsChange={setOptions}
    />
  );
}
```

That is a working pivot with a toolbar, a field list, filtering, sorting and
Excel export. `onOptionsChange` hands you the full configuration back every
time the user changes something, so persisting a report is `JSON.stringify`
and restoring it is passing the object back in.

## What you get

- **Rows are virtualized.** The grid renders the visible window, not the
  dataset. Scrolling a few hundred thousand rows does not stall the main
  thread.
- **Date fields expand themselves.** Give the pivot a date column and you get
  Year, Quarter, Month, Day, Weekday, Hour and Minute as drillable levels,
  with month and weekday names in the user's language.
- **Calculated fields without `eval`.** Formulas go through a hand-written
  tokenizer and AST evaluator, so the library runs under a strict
  Content-Security-Policy that forbids `unsafe-eval`.
- **Excel export that is not in your bundle.** `exceljs` is a dynamic import
  loaded the first time someone clicks export. Users who never export never
  download it.
- **It looks like the rest of your app.** Theming is MUI: the pivot inherits
  your palette, typography and dark mode from the ambient theme, or takes a
  scoped one through the `theme` prop.
- **Fully typed.** Declarations are generated from source, so they cannot
  drift from the implementation.

## Requirements

React 18 or 19, MUI v9, and the Emotion peers MUI already needs. Node 18 or
later on the server side, if you render there.

## Documentation

The [documentation site](https://aurapivot-docs.web.app) covers every key of
the `options` schema with a screenshot of what it does, plus video
walkthroughs. The [playground](https://aurapivot.web.app) lets you build a
configuration by clicking and copy the resulting `options` object out.

## Limitations

- Aggregation runs on the main thread. A dataset in the millions of rows will
  produce a visible pause on the first compute and on every slice change.
- There is no server-side aggregation mode. The pivot works on data you have
  already loaded into the browser.
- MUI v9 is a hard requirement, not an adapter. There is no headless build.

## Contributing

Bug reports with a reproduction get fixed. See
[CONTRIBUTING.md](https://github.com/itsolutions-dev/AuraPivot/blob/master/CONTRIBUTING.md) for the setup — note that the dev loop
runs through a playground in a sibling repository, which is the one
non-obvious part.

## License

MIT © IT Solutions S.r.l.
````

- [ ] **Step 3: Move the reference material rather than deleting it**

The props table, the theming chapter, the localization chapter and the hooks section are good documentation in the wrong artifact. Before removing them from the README, confirm each has an equivalent page in `GuideApp/docs/`. Where one does not, port it there first — this step deletes nothing that does not already exist elsewhere.

- [ ] **Step 4: Check the register**

Read the draft once for these specifically:

- Every claim has a mechanism or a number behind it. Delete any sentence that would still be true if it described a different library.
- No superlatives, no invented benchmarks.
- Second person, active voice.
- The limitations section is honest. A document that admits a limitation is the one whose other claims get believed.

- [ ] **Step 5: Verify every link and code block**

Run the quickstart block in a scratch Vite app against the built `dist/`, not against the source alias. The alias hides exactly the packaging bugs Tasks 3 and 7 fixed, so testing through it would prove nothing.

Check every link resolves, including the badge image URLs.

Every link and image in the draft is an absolute URL on purpose. npm renders the README outside the repository, so a relative `./docs/assets/…` path shows a broken image on the package page — and the package page is where most people meet the library.

Note that the badges will 404 until the repository is public (phase 4) and the package is published. That is expected; check the URLs are correct, not that they render today.

- [ ] **Step 6: Confirm no stale references survive**

Run: `grep -ni "webdatarocks\|@its/aura-pivot\|private package\|internal license" README.md`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/assets
git commit -m "docs: rewrite the README for a developer deciding in 30 seconds

It opened on a comparison table that compared the product against itself,
had no screenshot, never said why to choose it, and closed by declaring
itself a private package. The reference material moves to the docs site,
which exists for exactly that."
```

---

## Phase gate

Phase 0 and 1 are complete when all of the following hold:

- [ ] `npm run lint && npm run format:check && npm run check && npm test && npm run build && npm run size` passes in `Library/`
- [ ] `npm --prefix ../PresentationApp run build` and `npm --prefix ../GuideApp run build` both pass
- [ ] CI is green on a pull request, including both React matrix legs
- [ ] `grep -rni "webdatarocks\|@its/aura-pivot"` over the working trees of both repositories returns nothing
- [ ] `npm pack --dry-run` lists `dist/`, `LICENSE` and `THIRD-PARTY-NOTICES.md`
- [ ] The repository is still **private** — publishing is phase 4

The next plan covers phase 2: measuring the real coverage baseline and covering the untested engine modules.
