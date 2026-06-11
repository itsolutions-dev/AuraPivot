# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@its/aura-pivot` — a React pivot-table library published as a drop-in replacement for `<Pivot>` from the legacy `@AuraPivot/react-AuraPivot` component. Shipped as an npm package (CJS + ESM bundles via Rollup). Peer deps: React 18+, `@mui/material` v9+, `@emotion/react`, `@emotion/styled`, `react-intl`.

## Build

```
npm run check           # tsc --noEmit (chained into every build script)
npm test                # vitest (FormulaEvaluator, sanitizeSvg, usePivotMatrix, ExcelExporter)
npm run build           # standard → dist/ (cjs + esm + index.d.ts + locales + sourcemaps)
npm run build:freeplan  # FREEPLAN=1 OBFUSCATOR=1 — obfuscated free build → dist-free/
npm run build:freeplan2 # FREEPLAN=1 OBFUSCATOR=0 — fast free build for development → dist-free/
```

No lint script, no dev server. Rollup config reads `package.json` with an import assertion (`assert { type: "json" }`) so Node ≥ 18 is required. `components/PivotTable/PivotTable.tsx` carries `@ts-nocheck` (pre-existing conversion debt) — do not add new `@ts-nocheck` files.

Variant hygiene: each variant builds into its own directory (`dist/` vs `dist-free/`, cleaned at build start) and the bundle intro carries a runtime stamp `globalThis.__AURA_PIVOT_BUILD__ = { variant, obfuscated, version }`. Every build script chains `scripts/verify-dist.mjs`, which asserts the stamp matches the expected variant, the lazy `import('exceljs')` specifier survived, sourcemaps are real (non-obfuscated builds) or absent (obfuscated), watermark presence/absence, and size ceilings. `npm publish` runs the standard build via `prepublishOnly`; only `dist/` is in `files`, so the free variant can never ship by accident.

exceljs is NOT bundled: `ExcelExporter` lazy-loads it with `import('exceljs')` on the first export and rollup marks it `external` — the consumer's bundler code-splits it from `dependencies`. The `'exceljs'` specifier is in the obfuscator's `reservedStrings` so string-array encoding cannot break resolution.

When `OBFUSCATOR=1`, obfuscation runs per-module after babel: heavy options for UI/gating code, a light set (no control-flow flattening / dead-code injection) for the hot compute paths listed in `HOT_PATHS`; terser always finalizes the bundle.

Public entry: `index.js` re-exports `Pivot` (default + named), `PivotProvider`/`usePivot`, `usePivotMatrix`, and the `mergeLocalization` helper. Public type declarations are hand-maintained in `index.d.ts` (root) and copied to `dist/index.d.ts` by the `copyTypes` rollup plugin — keep it in sync when the public surface changes. Locale dictionaries are NOT bundled — they ship as separate JSON files at `dist/locales/{it,en}.json`, exposed via package `exports` subpaths (`@its/aura-pivot/locales/it.json`, `…/en.json`). The rollup `copyLocales` plugin copies `localization/*.json` to `dist/locales/` on build.

## Architecture

Two distinct layers. Keep the boundary clean — the core is framework-agnostic on purpose.

### `pivot-core/` — pure-JS engine

Orchestrator is `pivot-core/PivotEngine.js`. It owns all mutable state (data, slice, options, format, calculated fields, date formats, localization, locale) and exposes an event bus (`on`/`off` for `datachange`, `reportchange`, `formatchange`). The React layer never mutates state directly; it calls engine methods and re-reads via events.

Pipeline inside `processMatrix()`:

1. `data/DataNormalizer.normalizeDataset` — accepts the AuraPivot `[metadata, ...rows]` shape; synthesizes metadata from the first row if the metadata header is missing.
2. `data/DateHierarchyExpander.expandHierarchies` — adds virtual `<field>.Year|Quarter|Month|Day|Weekday|Hour|Minute` columns for date fields, using the localized month/weekday names pushed in via `setDateLocalization`.
3. `slice/FilterEngine.applyFilters` — include/exclude member filtering.
4. `slice/TreeBuilder.buildTree` — builds the row and column trees. The special `Measures` pseudo-field is stripped from the tree fields and tracked separately via `hasMeasuresOnRows` / `hasMeasuresOnColumns`.
5. `matrix/MatrixComputer.computeMatrix` — produces the `PivotMatrix` (see `types.js` for the shape): `rowLeaves`, `colLeaves`, `cells` Map keyed by `"<rowKey>||<colKey>||<measureKey>"`, plus the enriched measures list.
6. `aggregation/Aggregator` — sum/count/distinctcount/avg/min/max plus the derived `ratioTotal`, `currentRatio`, and `formula` (calculated fields). Formula strings are evaluated by `matrix/FormulaEvaluator.ts` — a safe tokenizer/AST evaluator (no `Function()`/`eval`, CSP-friendly); the same module's `parseFormulaExpression` backs the CalculatedFieldDialog syntax validation.
7. `format/CellFormatter` and `format/DateFormatter` — number / currency / percentage / date rendering, conditional styling.
8. `export/ExcelExporter.exportMatrixToExcel` — xlsx export of the already-computed matrix.

Dirty flag: every setter that affects the matrix sets `_dirty = true`; `processMatrix()` memoizes and returns `_matrix` when not dirty. The React layer relies on this — a re-render without a state change is free.

### React layer

- `AuraPivot.jsx` — `forwardRef` wrapper. Creates one `PivotEngine` per mount. Configured through the `options` prop (a structured schema — see `docs/options-guide.en.md`) plus a separate `dataSource` rows prop; in-component edits are emitted back via the `onOptionsChange` callback. The `options`↔engine mapping lives in `options/optionsAdapter.js`. Exposes via `useImperativeHandle`:
  - `ref.auraPivot.getOptions()` — the current `options` schema
  - `ref.engine` — escape hatch to the raw engine
- `context/PivotContext.tsx` — shares `{ engine, localization, locale, options, fullscreenRef, isFullscreen }` with descendant components. Exported from `index.js` as `PivotProvider`/`usePivot`.
- `hooks/usePivotMatrix.ts` — `useSyncExternalStore` over a per-engine shared store (WeakMap): subscribes to `dataChange`/`reportChange`/`formatChange` and returns `{ matrix, loading }`. Multiple consumers of one engine share a snapshot; engine listeners detach with the last subscriber. Above `WORKER_THRESHOLD = 5000` rows the recompute is deferred one macrotask (`setTimeout`) so the loader can paint first; everything stays on the main thread.
- `components/` — UI: `PivotTable` (react-virtuoso virtualized grid), `Toolbar/PivotToolbar`, `FieldList`, `FormatDialog`, `FilterBar`, plus the `CalculatedFieldDialog`, `DimensionFilterDialog`, and `DrillThroughDialog` one-offs.

## Public API contract

The `<AuraPivot>` component is configured through the structured `options` prop (plus a separate `dataSource` rows prop) and reports in-component edits via the `onOptionsChange` callback. The schema and the round-trip model are documented in `docs/options-guide.en.md` / `docs/options-guide.it.md`; the `options`↔engine mapping is `options/optionsAdapter.js`. Points that are easy to break:

- `options` is applied **seed-on-change**: re-applied only when the object reference changes. `onOptionsChange` hands the host the component's own emitted object — feeding it straight back is a no-op (loop guard in `AuraPivot.jsx`).
- `dataSource` is a plain rows array; the engine's `[metadata, ...rows]` shape is assembled inside `options/optionsAdapter.js` from `options.data.fields` + `dataSource`.
- The top-level `localization` prop carries the dictionary. No bundled fallback: if the consumer passes nothing, the engine receives `{}` and emits empty captions. Consumers either statically import a JSON file from `@its/aura-pivot/locales/<lang>.json` or load one at runtime (e.g. via i18next + i18next-http-backend) and pass the resulting object in. `mergeLocalization` from `localization/merge.js` is exposed for layering per-instance overrides — the component itself no longer merges. `locale` prop is BCP-47 and is threaded to every Intl call (`localeCompare`, `Intl.NumberFormat`, `Intl.DateTimeFormat`); `undefined` means "defer to browser default" and must stay `undefined` (not `""`).
- `format` accepts both `values` and the legacy alias `general` (read paths expose both for back-compat).
- Aggregation label localization: engine's internal key `avg` maps to the dictionary key `average` (see `AGG_LOCALE_KEY` in `PivotEngine.js`).
- `Measures` is a reserved `uniqueName` used as a pseudo-field to place the measure axis on rows or columns — filter it out before passing row/column fields to the tree builder.
- The engine still has `getReport()` / `setReport()` methods, used internally and reachable through the `ref.engine` escape hatch, but they are no longer part of the component's public prop/ref surface.

## Conventions

- TypeScript (strict) everywhere except the two JS entries `index.js` and `AuraPivot.jsx`. Shared engine types live in `pivot-core/types.ts`; the public consumer-facing declarations are the hand-maintained root `index.d.ts`.
- 2-space indent, single quotes in `.ts`/`.tsx` files, double quotes in the remaining `.js`/`.jsx` files — follow whatever the file already uses.
- React 19 in devDependencies but peer range is `>=18`; do not use features that break on 18.
- MUI v9 theming — components read `theme.font?.primary`, the pastel palette, and dark-mode tokens from the ambient theme. Avoid hardcoded colors. Optional `theme` prop on `<AuraPivot>` wraps the subtree in `<ThemeProvider>` for scoped overrides.
