# AuraPivot — MIT open-source release

**Date:** 2026-09-01
**Status:** approved, pending implementation plan
**Scope:** publish `Library/` as `aura-pivot` on npm and make `itsolutions-dev/AuraPivot` a public MIT repository, with CI/CD, community infrastructure, and a test suite that supports external contribution.

---

## 1. Decisions

These were settled during brainstorming and are not open for re-litigation during implementation.

| #   | Decision                                                                                                                                                                            | Rationale                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D1  | **Pure MIT.** No open-core split, no dual license, no obfuscated build.                                                                                                             | Business model moves to support/consulting/sponsorship. The PresentationApp pricing section becomes donate/sponsor. |
| D2  | **npm name `aura-pivot`** (unscoped). Verified available 2026-09-01.                                                                                                                | Shorter, no scope registration, reads as a community project rather than a vendor package.                          |
| D3  | **Reuse `itsolutions-dev/AuraPivot`**, flipped to public. History preserved.                                                                                                        | A secret scan over all 51 commits came back clean, so there is nothing to purge.                                    |
| D4  | **Copyright holder: IT Solutions S.r.l.**                                                                                                                                           |                                                                                                                     |
| D5  | **Refactor-then-cover** (option B). Extract pure logic from the five monolith components, then drive coverage. Playwright component testing is a later phase, not a launch blocker. | 100% on a 2 809-line file measures lines, not behaviour, and produces tests that break on every external PR.        |
| D6  | **Zero WebDataRocks references** in the working tree and every published artifact.                                                                                                  | Owner's call. See §7 for the history caveat.                                                                        |
| D7  | **Go public after phase 3**, not earlier.                                                                                                                                           | Launching at ~30% coverage means external PRs land on untested code.                                                |
| D8  | The package rename is **in scope across all three sibling apps**.                                                                                                                   | `@its/aura-pivot` appears in 14 files outside the Library build output.                                             |

---

## 2. Current state

`Library/` is 18 337 lines of source across a clean two-layer architecture: `pivot-core/` (framework-agnostic engine) and `components/` (React/MUI UI). TypeScript strict everywhere except `index.js` and `AuraPivot.jsx`.

**Genuine strengths, unusual for a pre-launch OSS project:**

- `pivot-core/matrix/FormulaEvaluator.ts` is a hand-written tokenizer plus recursive-descent AST evaluator. No `Function()`, no `eval` — CSP-safe, and already the best-tested module in the repo (37 cases).
- `components/Toolbar/sanitizeSvg.ts` sanitizes caller-supplied raw SVG for custom toolbar tabs (11 cases).
- `scripts/verify-dist.mjs` asserts every build: build stamp present, the lazy `import('exceljs')` specifier survived bundling, sourcemap integrity, size ceilings.
- `exceljs` (~900 KB) is deliberately not bundled — dynamic `import()` on first export, marked external, code-split by the consumer's bundler.
- `docs/options-guide.{en,it}.md` already document the full `options` schema.
- A live playground (PresentationApp) and a docs site (GuideApp) already exist and are deployed.

**Release blockers:**

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                               | Consequence                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B1  | Repo is private; `licenseInfo: null`; description empty.                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                     |
| B2  | No `LICENSE` file. `package.json` has no `license`, `repository`, `author`, `keywords`, `homepage`, `bugs`.                                                                                                                                                                                                                                                                                           | npm would publish it as `UNLICENSED`.                                                                                 |
| B3  | README closes with _"Private package — distributed under the terms of the host organization's internal license."_                                                                                                                                                                                                                                                                                     | Directly contradicts MIT.                                                                                             |
| B4  | Obfuscator in the build pipeline (`javascript-obfuscator`, `rollup-plugin-obfuscator`, `HOT_PATHS`, `reservedStrings`, ~90 lines of rollup config).                                                                                                                                                                                                                                                   | IP protection is meaningless under MIT and actively hostile to contributors.                                          |
| B5  | `react-virtuoso` sits in `devDependencies` but `components/PivotTable/PivotTable.tsx` imports it at runtime.                                                                                                                                                                                                                                                                                          | Wrong metadata. It currently survives only because rollup bundles it.                                                 |
| B6  | `dist/` bundles `react-virtuoso`, `@mui/icons-material` and `file-saver` with no attribution file.                                                                                                                                                                                                                                                                                                    | MIT requires retaining the copyright notice of bundled code. Currently non-compliant.                                 |
| B7  | `tsconfig.json` has no `allowJs`, so `index.js` and `AuraPivot.jsx` are never type-checked.                                                                                                                                                                                                                                                                                                           | The public entry point is the one unchecked file.                                                                     |
| B8  | `index.d.ts` (285 lines) is hand-maintained and must be kept in sync manually.                                                                                                                                                                                                                                                                                                                        | A silent trap for external contributors.                                                                              |
| B9  | The README comparison table compares the product against itself — a global find/replace overwrote the competitor name in both columns.                                                                                                                                                                                                                                                                | Reader-visible nonsense.                                                                                              |
| B11 | `PresentationApp/src/preview.jsx:9` imports `{ variantSwatches } from "@its/aura-pivot/theme"`, but the package `exports` map has no `./theme` subpath and the theme re-export in `index.js` is commented out. The import resolves only because a Vite alias rewrites it to `Library/theme/swatches.js` — a path that does not exist (the file is `swatches.ts`; Vite's extension probing covers it). | The playground demonstrates an import that fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` for anyone installing from npm. |
| B12 | `PresentationApp/vite.config.js` carries a `FREEPLAN` branch that swaps the alias to an obfuscated capped build and points at `npm --prefix ../Library run build:freeplan` — a script that no longer exists in `Library/package.json`.                                                                                                                                                                | Dead configuration for the commercial gate removed by D1.                                                             |
| B13 | `prop-types` is imported by `AuraPivot.jsx:9`, `components/PivotTable/PivotTable.tsx:9` and `options/optionsPropType.ts:5`, but appears in neither `dependencies` nor `devDependencies`. It resolves today only as a transitive hoist into the local `node_modules`.                                                                                                                                  | An install of the published package can fail depending on the consumer's tree layout. Same class of defect as B5.     |
| B10 | `CLAUDE.md` has drifted from the code. It states that `components/PivotTable/PivotTable.tsx` carries `@ts-nocheck` (it does not — the repo has no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` anywhere), and it refers to `PivotEngine.js`, `optionsAdapter.js`, `types.js` and `merge.js` for modules that are now `.ts`.                                                                      | The first document a contributor reads describes a repository that no longer exists.                                  |

**Missing OSS infrastructure:** no `.github/` at all (no CI, no issue or PR templates, no CODEOWNERS, no Dependabot), no ESLint, no Prettier, no `.editorconfig`, no coverage tooling or `vitest.config.ts`, no `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `CHANGELOG.md`, no release automation.

**Coverage baseline (structural estimate, to be measured in phase 2):** 11 test files, 114 cases. `pivot-core` orchestration, formula evaluation, tree building, localization, the options adapter and the hooks are covered. Roughly 10 700 lines of `components/` are not, and neither are `MatrixComputer` (733), `CellFormatter` (486), `DateHierarchyExpander` (249), `DateFormatter` (241), `FilterEngine` (114), `Aggregator` (70) and `DataNormalizer` (59). Estimated line coverage: 20–30%.

---

## 3. Identity and rename

`package.json` `name` becomes `aura-pivot`. Export subpaths follow: `aura-pivot/locales/it.json`, `aura-pivot/locales/en.json`.

The specifier `@its/aura-pivot` appears in 14 files. All must change in one atomic sequence, because `PresentationApp` resolves the library through a Vite alias and will fail to build the moment the two sides disagree.

**Inside `Library/`:** `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `index.d.ts`, `docs/superpowers/plans/2026-05-19-library-typescript-conversion.md`, `docs/superpowers/specs/2026-05-19-library-typescript-conversion-design.md`.

**Outside `Library/`:** `PresentationApp/src/preview.jsx`, `PresentationApp/vite.config.js` (the `resolve.alias` key), `GuideApp/src/pages/index.js`, `GuideApp/README.md`, and three specs under `docs/superpowers/`.

Historical spec and plan documents are rewritten too: leaving a stale package name in the repo's own documentation is the kind of small inconsistency that costs a newcomer twenty minutes.

GitHub repository metadata: description, topics (`react`, `pivot-table`, `data-grid`, `mui`, `typescript`, `analytics`, `virtualized`), homepage pointing at the GuideApp docs site.

---

## 4. Licence and legal hygiene

- **`LICENSE`** — MIT, `Copyright (c) 2026 IT Solutions S.r.l.`
- **`package.json` metadata** — `license: "MIT"`, `description`, `keywords`, `repository` (with `directory`), `bugs`, `homepage`, `author`, `sideEffects: false`, `publishConfig: { access: "public", provenance: true }`.
  `engines` declares `node: ">=18"`, not `>=20`. The `>=20` requirement belongs to the _build_ — `rollup.config.js` uses the `with { type: "json" }` import attribute, which Node 18 does not parse — and consumers never run it. Declaring `>=20` here would emit an install-time warning for every Node 18 user for no reason. Node 20 is stated as the development requirement in `CONTRIBUTING.md` and enforced by the CI matrix instead.
- **`THIRD-PARTY-NOTICES.md`** — generated at build time from the resolved dependency tree, listed in `files` so it ships inside the tarball. Required for whatever remains bundled after §5.
- **README licence section** — replaces the "Private package" line.

---

## 5. Build pipeline

**Remove the obfuscator.** Drop the `javascript-obfuscator` and `rollup-plugin-obfuscator` devDependencies, the `OBFUSCATOR` environment switch, `obfuscatorOptions`, `lightObfuscatorOptions`, `HOT_PATHS`, `reservedStrings` and the `obfuscatorPlugins` array. Sourcemaps become unconditional. `scripts/verify-dist.mjs` loses its obfuscated branch, and the runtime stamp `globalThis.__AURA_PIVOT_BUILD__` keeps `version` and drops `obfuscated`. Terser stays as the output finalizer.

The `reservedStrings: ['exceljs']` guard disappears along with the obfuscator, and with it the risk it was protecting against — but `verify-dist.mjs` keeps asserting that the `import('exceljs')` specifier survives, because terser is not the only thing that could break it.

**Fix and externalise the runtime dependencies.** Move `react-virtuoso` from `devDependencies` to `dependencies` (B5), then add `react-virtuoso`, `@mui/icons-material` and `file-saver` to rollup's `external` list alongside `exceljs`. This shrinks the bundle, stops a second copy of `react-virtuoso` from being pulled into consumer applications that already use it, and removes three attribution obligations at once. Size ceilings in `verify-dist.mjs` are re-baselined afterwards.

**Drop PropTypes rather than declaring it.** B13 could be fixed by adding `prop-types` to `dependencies`, but the right move is to delete it. React 19 — the version this library develops against — ignores the `propTypes` property on function components entirely, so the validation is already dead code on the primary target. Removing it deletes `options/optionsPropType.ts` (179 lines), three imports, and a dependency, and the generated `.d.ts` gives consumers stronger guarantees at compile time than PropTypes ever gave them at runtime. React 18 consumers lose a development-mode warning; they gain type errors instead.

**Close the type hole.** Convert `AuraPivot.jsx` to `AuraPivot.tsx` and `index.js` to `index.ts` (B7). With the whole public surface typed, `index.d.ts` can be generated by `rollup-plugin-dts` — already present in `devDependencies` — instead of hand-maintained (B8). `verify-dist.mjs` gains an assertion that the generated declarations still export `PivotOptions`, `AuraPivotProps`, `AuraPivotRef` and the hook types, so a regression in the public API surface fails the build rather than reaching npm.

**Add linting.** ESLint flat config with `@typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`; Prettier; `.editorconfig`. The existing convention — 2-space indent, single quotes in `.ts`/`.tsx`, double quotes in `.js`/`.jsx` — is encoded rather than changed, so the lint rollout does not produce a repo-wide reformatting diff that would bury the real work.

---

## 6. Testing and coverage

`vitest.config.ts` with the `happy-dom` environment and `@vitest/coverage-v8`, reporting `text`, `lcov` and `json-summary`.

**Step 1 — measure, then cover the untested core.** Establish the real baseline first. Then write pure unit tests for `MatrixComputer`, `CellFormatter`, `DateHierarchyExpander`, `DateFormatter`, `FilterEngine`, `Aggregator`, `DataNormalizer` and the untested remainder of `PivotEngine`. No refactoring, fast tests, roughly 1 900 lines of high-value logic. Target: `pivot-core/**` at 95%.

**Step 2 — build the safety net.** Characterisation tests over the five monoliths _before_ touching them. Their purpose is not coverage; it is catching regressions during step 3. Written with `@testing-library/react` plus `VirtuosoMockContext`.

**Step 3 — extract, then cover.** Each monolith yields its pure logic to a testable module; the `.tsx` file is left as a thin rendering shell.

| File                                | Extract                                                                                                                     | Shell |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| `PivotTable.tsx` (2 809)            | `usePivotTableModel` (row/column flattening, sticky offsets, column sizing), expand and selection reducers, `cellRenderers` | ~600  |
| `FormatDialog.tsx` (2 245)          | `formatModel.ts` (state reducer, validation), `conditionalRules.ts`                                                         | ~500  |
| `FieldList.tsx` (2 218)             | `fieldListModel.ts` (drag reorder, axis assignment, search/filter)                                                          | ~600  |
| `CalculatedFieldDialog.tsx` (1 076) | `calcFieldForm.ts` (form state; formula parsing already lives in `FormulaEvaluator`)                                        | ~500  |
| `DrillThroughDialog.tsx` (941)      | `drillThroughQuery.ts` (row selection from the matrix)                                                                      | ~400  |

Each extraction follows the test-driven cycle: characterisation test, extract, prove the shell still passes, then cover the extracted module directly.

**Thresholds**, enforced per glob in `vitest.config.ts` and in CI:

| Path                                                    | Line coverage |
| ------------------------------------------------------- | ------------- |
| `pivot-core/**`                                         | 95%           |
| `options/**`, `hooks/**`, `localization/**`, `utils/**` | 95%           |
| extracted `*Model.ts` / `*Query.ts` modules             | 90%           |
| `components/**/*.tsx`                                   | 70%           |
| global                                                  | 90%           |

The UI figure is deliberately lower than the rest. Above roughly 70%, coverage of a `.tsx` rendering shell is bought with assertions on markup structure, and those assertions are what make a test suite hostile to contributors.

**Phase 5 — Playwright component testing.** `react-virtuoso` under jsdom is a mock: `VirtuosoMockContext` renders the rows but simulates neither scrolling, nor resize observation, nor sticky positioning. Real-browser component tests cover the virtualised grid, fullscreen, and drag-and-drop in the field list. Valuable, but not a launch blocker.

---

## 7. Removing the WebDataRocks references

The library began as a drop-in replacement for WebDataRocks, and a global find/replace later overwrote the name with "AuraPivot" in the prose files — producing the self-comparing table in B9. Three source comments escaped that replacement:

- `components/CalculatedFieldDialog/CalculatedFieldDialog.tsx:26` — _"Formula syntax (mirrors WebDataRocks):"_
- `components/Toolbar/sanitizeSvg.ts:4` — _"…legacy WebDataRocks…"_
- `pivot-core/matrix/MatrixComputer.ts:6` — _"…(analogous to WebDataRocks)"_

Each is reworded to state the behaviour directly rather than by analogy. A comment that explains a design by pointing at another product stops being useful the moment the reader has not used that product.

The mangled prose in `README.md` (the comparison table and the "Full AuraPivot report compatibility" line) and in `CLAUDE.md` (the "drop-in replacement for `<Pivot>` from the legacy `@AuraPivot/react-AuraPivot`" sentence) is rewritten as part of §8.

**History caveat.** D3 preserves git history, and the name survives in two old commits (`3b86f3d`, `e83d468`). D6 therefore applies to the working tree and every published artifact — the npm tarball, the built site, the rendered docs — but not to the commit history. Scrubbing that too would require `git filter-repo` and a force-push, which contradicts D3. Recorded here as a conscious trade-off; reversing it means reopening D3.

---

## 8. README rewrite

**Diagnosis.** 18 KB that read as an internal API reference. It opens on a broken comparison table, contains no screenshot or animation, never states why a developer should choose it, and closes by declaring itself a private package. The deep reference material is good — it is simply in the wrong artifact, competing for attention with the thirty seconds a developer actually spends deciding.

**New structure**, targeting ~250 lines:

1. **Hero** — one sentence of real value proposition, an animated capture of the playground, badges (npm version, downloads, CI, coverage, bundle size, licence).
2. **Quickstart** — a copy-pasteable block that renders a working pivot. No prose between the reader and their first render.
3. **Why** — four concrete bullets with numbers, not adjectives: virtualised rendering with no row ceiling, automatic date hierarchies, calculated fields with a CSP-safe evaluator, built-in Excel export that stays out of the main bundle.
4. **Live demo and documentation** — links to the PresentationApp playground and the GuideApp site.
5. **Feature grid** — scannable, honest about what is not there yet.
6. **Contributing, licence.**

The full props table, the theming guide, the localization chapter and the hooks section move to GuideApp, which already exists to hold exactly this material.

**Register.** Second person, active voice, concrete numbers. Show rather than claim; a screenshot of the playground argues better than a paragraph asserting the component is powerful. No superlatives and no invented benchmarks. Where the library is weaker than an alternative, the README says so — a document that admits a limitation is the one whose other claims get believed.

---

## 9. Automation

**`ci.yml`** — on push and pull request. Matrix over Node 20/22/24 and React 18/19 peer versions. Steps: install, lint, `tsc --noEmit`, test with coverage, build, `verify-dist`. Coverage uploaded to Codecov; thresholds from §6 fail the job.

**`release.yml`** — Changesets. A merge to `master` opens or updates a version pull request; merging that publishes with `npm publish --provenance --access public` and cuts a GitHub Release from the generated changelog. Requires the `NPM_TOKEN` secret and `id-token: write` permission on the job.

**`codeql.yml`** — CodeQL for JavaScript/TypeScript, on pull requests and a weekly schedule.

**`size-limit`** — a bundle budget checked in CI, which reports the delta on every pull request. This replaces the hand-rolled size ceiling in `verify-dist.mjs`; keeping both would mean two numbers to update for one change.

**Dependabot** — npm and github-actions ecosystems, weekly, grouped minor and patch updates.

**Branch protection on `master`** — CI green plus one approving review, linear history.

---

## 10. Community surface

`CONTRIBUTING.md` (local setup, the `Library/` ↔ PresentationApp alias relationship, test and coverage expectations, commit and changeset conventions), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` with GitHub private vulnerability reporting enabled, `CHANGELOG.md` generated by Changesets, YAML issue templates for bugs and features, a pull request template, `CODEOWNERS`, and GitHub Discussions.

The playground and the documentation site are the strongest assets in this list. Most new OSS component libraries launch with neither. Both belong above the fold in the README, and a StackBlitz template gives a reader a running pivot without cloning anything.

---

## 11. Phasing

| Phase | Content                                                                                                                                                                                                | Estimate  | Gate                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------- |
| 0     | Licence, package metadata, de-obfuscation, dependency fixes, TS conversion of the entry points, generated declarations, rename across all three apps, lint and format setup, `CLAUDE.md` refresh (B10) | 3–4 days  | All three apps build            |
| 1     | CI, release automation, community files, README rewrite, third-party notices                                                                                                                           | 3–4 days  | CI green on a pull request      |
| 2     | Coverage step 1 — measured baseline, then the untested core                                                                                                                                            | ~1 week   | `pivot-core` at 95%             |
| 3     | Coverage steps 2 and 3 — safety net, extraction, per-module coverage                                                                                                                                   | 4–5 weeks | Global 90%, thresholds enforced |
| 4     | **Repository public, first npm publish**                                                                                                                                                               | 1 day     | —                               |
| 5     | Playwright component testing                                                                                                                                                                           | ~2 weeks  | Post-launch                     |

---

## 12. Prerequisites outside the codebase

1. npm account authenticated (`npm whoami` currently fails) and `aura-pivot` claimed.
2. `NPM_TOKEN` added to the repository secrets as an automation token.
3. GitHub private vulnerability reporting and Discussions enabled on the repository.
4. A Codecov token, if the repository is not using tokenless upload.
5. The PresentationApp pricing section reworked into sponsorship, per D1 — tracked separately, outside this spec.
