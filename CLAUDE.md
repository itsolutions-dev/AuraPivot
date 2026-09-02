# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`aura-pivot` — a React pivot-table library: a framework-agnostic compute core (`pivot-core/`, plain TypeScript, no React) wrapped by an MUI-based React presentation layer. Features: virtualized rendering, automatic date hierarchies, calculated fields (safe tokenizer/AST formula evaluator — no `eval`/`Function()`), conditional cell formatting, and Excel export (exceljs, lazy-loaded). Published to npm as `aura-pivot`, **MIT-licensed and public-bound** — treat the public surface (`exports`, prop/ref contracts) as something external consumers depend on, not an internal implementation detail. Shipped as CJS + ESM bundles via Rollup, with declarations generated from source. Peer deps: `react` ≥18, `react-dom` ≥18, `@mui/material` ≥9, `@emotion/react` ≥11.5, `@emotion/styled` ≥11.3. See `CONTRIBUTING.md` for the contributor workflow.

## Build

```
npm run check         # tsc --noEmit
npm test               # vitest run — 11 files / 135 tests (pivot-core, options, localization, hooks, components)
npm run test:coverage  # vitest run --coverage — thresholds in vitest.config.ts are a ratchet pinned to coverage measured 2026-09-01; a drop fails the run instead of passing quietly
npm run build          # npm run check && rollup -c && node scripts/third-party-notices.mjs && node scripts/verify-dist.mjs
npm run lint            # eslint .
npm run lint:fix        # eslint . --fix
npm run format          # prettier --write .
npm run format:check    # prettier --check .
npm run size            # size-limit — bundle-size budget on the built dist/ (see .size-limit.json)
npm run changeset       # changeset — record a pending release note
npm run version         # changeset version && npm install --package-lock-only — do not use `npm version` (see below)
npm run release         # npm run build && changeset publish — CI-only, never run locally
```

`prepublishOnly` runs `npm run build`. Only `dist/`, `LICENSE` and `THIRD-PARTY-NOTICES.md` are published (`files` in `package.json`). No dev server.

Releases are automated with [Changesets](https://github.com/changesets/changesets) (`.changeset/config.json`, `.github/workflows/release.yml`): a push to `master` opens/updates a version PR, and merging it publishes to npm with provenance (`id-token: write`, `NPM_CONFIG_PROVENANCE: true`) once the `NPM_TOKEN` repository secret exists. Every change with user-visible impact needs a changeset (`npx changeset`). The `version` script is registered as npm's `version` lifecycle hook, so **do not run `npm version`** in this repo — it would run `changeset version` instead of a plain bump; that is intentional, not a bug.

`rollup.config.js` imports `package.json` with `import pkg from "./package.json" with { type: "json" }` — this import-attribute syntax needs Node ≥ 20 _to build_; that is a development-time requirement only, not the published floor (`engines.node` is `>=18`). `dist/` is cleaned at the start of every build. The bundle intro carries a runtime stamp `globalThis.__AURA_PIVOT_BUILD__ = { version }` (version only — there is no obfuscation step and no `obfuscated` field). `scripts/verify-dist.mjs` runs after rollup and fails the build if: any required output file is missing (the CJS entry named by `main` in `package.json`, `index.esm.js`, `index.d.ts`, `theme.cjs`, `theme.esm.js`, `theme.d.ts`, `locales/en.json`, `locales/it.json`), either JS bundle lacks the build stamp, drops the literal `'exceljs'` specifier, or ships a missing/empty sourcemap; the generated `index.d.ts` no longer exports one of the required public type names (`PivotOptions`, `AuraPivotProps`, `AuraPivotRef`, `PivotEngine`, `LocalizationDictionary`); or either Node entry point does not actually load — it `require()`s the CJS entry (`main`) and `import()`s the ESM entry (`module`) and fails if either throws, exports an empty namespace, or is missing `Pivot`; the same require/import load check runs against the `"./theme"` entry's CJS/ESM pair (read from `exports["./theme"]` in `package.json`), failing if either throws, exports an empty namespace, or is missing `TONE_STOPS`. Existence is deliberately not treated as loadability: a CommonJS bundle named `.js` under `"type": "module"` is parsed as ESM and `require()` of it returns `{}` with no error at all, which is how a dead `main` survived from the initial commit — and it is exactly the gap that let the `"./theme"` entry ship existence-checked only until the load check above was extended to cover it too. The CommonJS outputs are `dist/index.cjs` and `dist/theme.cjs`: the explicit `.cjs` extension is what makes them loadable at all, since `package.json` declares `"type": "module"`. Do not rename them back to `.js`, and do not "fix" a CJS load failure with a `dist/package.json` containing `{"type":"commonjs"}` — that would make Node parse the genuine ES modules `dist/index.esm.js` / `dist/theme.esm.js` as CommonJS instead, trading one broken entry point for the other. The bundle-size ceiling itself lives in `.size-limit.json` (`npm run size`, `@size-limit/preset-small-lib`, minified+compressed size against `dist/index.esm.js` and `dist/theme.esm.js`, externals from `dependencies` and peers listed in `ignore` so they aren't measured) — one number to update instead of two.

exceljs is NOT bundled: `ExcelExporter` lazy-loads it with `import('exceljs')` on the first export. Rollup marks `exceljs`, `react-virtuoso`, `file-saver` and `@mui/icons-material` (regex) `external` — the consumer's bundler resolves and code-splits them from `dependencies`; inlining them would ship a second copy (e.g. a second `react-virtuoso` scroll observer) into apps that already use one. `file-saver` is `import FileSaver from 'file-saver'` (default), never `import { saveAs }`: it is minified CJS with no named exports, so a named import resolves under a bundler but throws `Named export 'saveAs' not found` in plain Node ESM, before any library code runs. Its `vi.mock` in `ExcelExporter.test.ts` has to mirror that shape (`{ default: { saveAs } }`) or it silently stops intercepting.

Public entry points, per `exports` in `package.json`:

- `"."` — the main bundle: `Pivot` (default + named), `PivotProvider`/`usePivot`, `usePivotMatrix`, `mergeLocalization`, plus the public type surface. Declarations are GENERATED by `rollup-plugin-dts` from `index.ts` — there is no hand-maintained root `index.d.ts` to keep in sync; a prop-type change flows through automatically.
- `"./theme"` — built separately from `theme/swatches.ts` (its own triple: `theme.cjs`/`theme.esm.js`/`theme.d.ts`). `typesVersions` maps this subpath to `dist/theme.d.ts` as well, so consumers on the legacy `moduleResolution: "node"` TypeScript algorithm resolve its types too — `exports` (which modern resolution reads first) already covers it; `typesVersions` is purely a fallback for the legacy algorithm, which ignores `exports` entirely.
- `"./locales/it.json"`, `"./locales/en.json"`, and the `"./locales/*"` wildcard — locale dictionaries. Not bundled into the main entry; the rollup `copyLocales` plugin copies `localization/*.json` to `dist/locales/` on `writeBundle`.
- `"./package.json"` — mapped straight to the real file so tooling that reads a dependency's own `package.json` (bundler plugins, version checks, `patch-package`) is not blocked by the `exports` map.

## Architecture

Two distinct layers. Keep the boundary clean — the core is framework-agnostic on purpose.

### `pivot-core/` — pure-TS engine

Orchestrator is `pivot-core/PivotEngine.ts`. It owns all mutable state (data, slice, options, format, calculated fields, date formats, localization, locale) and exposes an event bus (`on`/`off` for `datachange`, `reportchange`, `formatchange`). The React layer never mutates state directly; it calls engine methods and re-reads via events.

Data path from raw dataset to rendered/exported output — only stages 3-6 run inside `processMatrix()`:

**At `setData()`/`setDateLocalization()` time:**

1. `data/DataNormalizer.normalizeDataset` — accepts the AuraPivot `[metadata, ...rows]` shape; synthesizes metadata from the first row if the metadata header is missing. Runs in `setData()` and again in `setDateLocalization()`, so a locale change re-normalizes without a fresh dataset.
2. `data/DateHierarchyExpander.expandHierarchies` — adds virtual `<field>.Year|Quarter|Month|Week|Day|Weekday|Hour|Minute` columns for date fields, using the localized month/weekday names pushed in via `setDateLocalization`. Runs alongside `normalizeDataset`, in `setData()` and `setDateLocalization()`.

**Inside `processMatrix()`:**

3. `slice/FilterEngine.applyFilters` — include/exclude member filtering.
4. `slice/TreeBuilder.buildTree` — builds the row tree and column tree, formatting dimension values via `_buildDimensionFormatter()`, which wraps `format/DateFormatter` for date fields. The special `Measures` pseudo-field (`uniqueName === "Measures"`) is a layout placeholder, not a real dimension; `PivotEngine` derives `hasMeasuresOnRows`/`hasMeasuresOnColumns` from where it appears and passes them to the matrix step separately.
5. `matrix/MatrixComputer.computeMatrix` — produces the `ComputedMatrix` (see `pivot-core/matrix/MatrixComputer.ts` for the shape, and `pivot-core/types.ts` for the shared engine types): `rowLeaves`, `colLeaves`, `cells` Map keyed by `"<rowKey>||<colKey>||<measureKey>"`, plus the enriched measures list.
6. `aggregation/Aggregator` — reached indirectly, through `computeMatrix` (`processMatrix()` never calls it directly) — sum/count/distinctcount/avg/min/max plus the derived `ratioTotal`, `currentRatio`, and `formula` (calculated fields). Formula strings are evaluated by `matrix/FormulaEvaluator.ts` — a safe tokenizer/AST evaluator (no `Function()`/`eval`, CSP-friendly); the same module's `parseFormulaExpression` backs the CalculatedFieldDialog syntax validation.

**Outside the compute path:**

7. `format/CellFormatter` — never called by the engine. `resolveCellStyle`/`formatNumberWithFormat` are imported by `components/PivotTable/PivotTable.tsx` and run at render time against the already-computed matrix; both are re-exported from `pivot-core/index.ts`.
8. `export/ExcelExporter.exportMatrixToExcel` — run from the separate async `exportExcel()` method, which calls `processMatrix()` first and then calls `exportMatrixToExcel`.

Dirty flag: every setter that affects the matrix sets `_dirty = true`; `processMatrix()` memoizes and returns `_matrix` when not dirty. The React layer relies on this — a re-render without a state change is free.

### React layer

- `AuraPivot.tsx` — `forwardRef` wrapper. Creates one `PivotEngine` per mount. Configured through the `options` prop (a structured schema — see `docs/options-guide.en.md`) plus a separate `dataSource` rows prop; in-component edits are emitted back via the `onOptionsChange` callback. The `options`↔engine mapping lives in `options/optionsAdapter.ts`. Exposes via `useImperativeHandle`:
  - `ref.auraPivot.getOptions()` — the current `options` schema
  - `ref.engine` — escape hatch to the raw engine
- `context/PivotContext.tsx` — shares `{ engine, localization, locale, options, fullscreenRef, isFullscreen }` with descendant components. Exported from `index.ts` as `PivotProvider`/`usePivot`.
- `hooks/usePivotMatrix.ts` — `useSyncExternalStore` over a per-engine shared store (WeakMap): subscribes to `dataChange`/`reportChange`/`formatChange` and returns `{ matrix, loading }`. Multiple consumers of one engine share a snapshot; engine listeners detach with the last subscriber. Above `WORKER_THRESHOLD = 5000` rows the recompute is deferred one macrotask (`setTimeout`) so the loader can paint first; everything stays on the main thread.
- `components/` — UI: `PivotTable` (react-virtuoso virtualized grid), `Toolbar/PivotToolbar`, `FieldList`, `FormatDialog`, `FilterBar`, `ErrorBoundary`, plus the `CalculatedFieldDialog`, `DimensionFilterDialog`, and `DrillThroughDialog` one-offs.

## Public API contract

The `<AuraPivot>` component is configured through the structured `options` prop (plus a separate `dataSource` rows prop) and reports in-component edits via the `onOptionsChange` callback. The schema and the round-trip model are documented in `docs/options-guide.en.md` / `docs/options-guide.it.md`; the `options`↔engine mapping is `options/optionsAdapter.ts`. Points that are easy to break:

- `options` is applied **seed-on-change**: re-applied only when the object reference changes. `onOptionsChange` hands the host the component's own emitted object — feeding it straight back is a no-op (loop guard in `AuraPivot.tsx`).
- `dataSource` is a plain rows array; the engine's `[metadata, ...rows]` shape is assembled inside `options/optionsAdapter.ts` from `options.data.fields` + `dataSource`.
- The top-level `localization` prop carries the dictionary. **English fallbacks are built in** (proven by `PivotEngine.localization.test.ts` + the smoke test): engine-level defaults (`AGG_LABEL`, `"Total"`, the `"{agg} Total of {field}"` caption template, English month/weekday names in `DateHierarchyExpander`) plus inline literals in every component — a zero-config pivot renders fully in English. Dictionary JSONs are NOT bundled into the main entry: for other languages consumers statically import `aura-pivot/locales/<lang>.json` or load one at runtime (e.g. via i18next + i18next-http-backend) and pass the object in. `setLocalization` validates the dictionary in dev builds (console.warn + fall back to English on malformed input). `mergeLocalization` from `localization/merge.ts` is exposed for layering per-instance overrides — the component itself no longer merges. `locale` prop is BCP-47 and is threaded to every Intl call (`localeCompare`, `Intl.NumberFormat`, `Intl.DateTimeFormat`); `undefined` means "defer to browser default" and must stay `undefined` (not `""`).
- `format` accepts both `values` and the legacy alias `general` (read paths expose both for back-compat).
- Aggregation label localization: engine's internal key `avg` maps to the dictionary key `average` (see `AGG_LOCALE_KEY` in `PivotEngine.ts`).
- `Measures` is a reserved `uniqueName` used as a pseudo-field to place the measure axis on rows or columns — filter it out before passing row/column fields to the tree builder.
- The engine still has `getReport()` / `setReport()` methods, used internally and reachable through the `ref.engine` escape hatch, but they are no longer part of the component's public prop/ref surface.

## Conventions

- TypeScript strict everywhere in the library source (`tsconfig.json` has `"strict": true`). No `@ts-nocheck`/`@ts-ignore`/`@ts-expect-error` anywhere — do not add any. `rollup.config.js`, `scripts/verify-dist.mjs`, and `scripts/third-party-notices.mjs` are the only plain-JS files in the repo, all build tooling, not library source.
- 2-space indent. Formatting is enforced by Prettier, not by convention: `.prettierrc.json` sets double quotes as the base with a `singleQuote: true` override for `*.ts`/`*.tsx`, so library sources are single-quoted and the plain-JS build tooling is double-quoted. Run `npm run format` and let it decide; `npm run format:check` gates CI.
- React 19 in devDependencies but peer range is `>=18`; do not use features that break on 18.
- MUI v9 theming — components read `theme.font?.primary`, the pastel palette, and dark-mode tokens from the ambient theme. Avoid hardcoded colors. Optional `theme` prop on `<AuraPivot>` wraps the subtree in `<ThemeProvider>` for scoped overrides.
