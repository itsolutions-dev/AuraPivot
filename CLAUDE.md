# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@its/aura-pivot` — a React pivot-table library published as a drop-in replacement for `<Pivot>` from the legacy `@AuraPivot/react-AuraPivot` component. Shipped as an npm package (CJS + ESM bundles via Rollup). Peer deps: React 18+, `@mui/material` v9+, `@emotion/react`, `@emotion/styled`, `react-intl`. Host app referenced throughout the code is DBE-CRM / Databeasy.

## Build

```
npm run build     # rollup -c → dist/index.js (cjs) + dist/index.esm.js (esm)
```

No test suite, no lint script, no dev server. There is no type-check step — types are JSDoc typedefs in `pivot-core/types.js`. Rollup config reads `package.json` with an import assertion (`assert { type: "json" }`) so Node ≥ 18 is required.

Public entry: `index.js` re-exports `AuraPivot`, `AuraPivotProvider`/`useAuraPivot`, `useAuraPivotMatrix`, and the `mergeLocalization` helper. Locale dictionaries are NOT bundled — they ship as separate JSON files at `dist/locales/{it,en}.json`, exposed via package `exports` subpaths (`@its/aura-pivot/locales/it.json`, `…/en.json`). The rollup `copyLocales` plugin copies `localization/*.json` to `dist/locales/` on build.

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
6. `aggregation/Aggregator` — sum/count/distinctcount/avg/min/max plus the derived `ratioTotal`, `currentRatio`, and `formula` (calculated fields).
7. `format/CellFormatter` and `format/DateFormatter` — number / currency / percentage / date rendering, conditional styling.
8. `export/ExcelExporter.exportMatrixToExcel` — xlsx export of the already-computed matrix.

Dirty flag: every setter that affects the matrix sets `_dirty = true`; `processMatrix()` memoizes and returns `_matrix` when not dirty. The React layer relies on this — a re-render without a state change is free.

### React layer

- `AuraPivot.jsx` — `forwardRef` wrapper. Creates one `PivotEngine` per mount, pushes props into it via `useEffect`, and exposes the legacy API through `useImperativeHandle`:
  - `ref.AuraPivot.getReport()` / `ref.AuraPivot.setReport(report)` — AuraPivot-compatible
  - `ref.engine` — escape hatch to the raw engine
- `context/PivotContext.jsx` — shares `{ engine, localization, locale, options }` with descendant components. Export names reachable from the public surface are aliased in `index.js` (`AuraPivotProvider`, `useAuraPivot`).
- `hooks/usePivotMatrix.js` — subscribes to `datachange`/`reportchange`/`formatchange` and returns `{ matrix, loading }`. Above `WORKER_THRESHOLD = 5000` rows the recompute is deferred one microtask so the loader can paint first. The header comment mentions a Web Worker bridge — this is aspirational, the current implementation stays on the main thread.
- `components/` — UI: `PivotTable` (react-virtuoso virtualized grid), `Toolbar/PivotToolbar`, `FieldList`, `FormatDialog`, `FilterBar`, plus the `CalculatedFieldDialog`, `DimensionFilterDialog`, and `DrillThroughDialog` one-offs.

## Compatibility contract

The whole `AuraPivot.jsx` top comment is a spec — read it before changing anything that touches the public surface. Highlights that are easy to break:

- `setReport` must NOT emit `reportchange` (consumers call `setReport` from a `useEffect` that listens to their own report copy — re-emitting causes an infinite loop). `setFormat` inside `setReport` IS emitted on purpose so the grid's local format snapshot syncs.
- `global.dataSource.data` arrives in AuraPivot `[metadata, ...rows]` shape; `getReport()` round-trips in the same shape.
- The top-level `localization` prop carries the dictionary. No bundled fallback: if the consumer passes nothing, the engine receives `{}` and emits empty captions. Consumers either statically import a JSON file from `@its/aura-pivot/locales/<lang>.json` or load one at runtime (e.g. via i18next + i18next-http-backend) and pass the resulting object in. `mergeLocalization` from `localization/merge.js` is exposed for layering per-instance overrides — the component itself no longer merges. `locale` prop is BCP-47 and is threaded to every Intl call (`localeCompare`, `Intl.NumberFormat`, `Intl.DateTimeFormat`); `undefined` means "defer to browser default" and must stay `undefined` (not `""`).
- `format` accepts both `values` and the legacy alias `general` (read paths expose both for back-compat).
- Aggregation label localization: engine's internal key `avg` maps to the dictionary key `average` (see `AGG_LOCALE_KEY` in `PivotEngine.js`).
- `Measures` is a reserved `uniqueName` used as a pseudo-field to place the measure axis on rows or columns — filter it out before passing row/column fields to the tree builder.

## Conventions

- Plain JavaScript + JSX, no TypeScript. Types live in `pivot-core/types.js` as JSDoc typedefs.
- 2-space indent, single quotes in `.jsx` files, double quotes in plain `.js` files — follow whatever the file already uses.
- React 19 in devDependencies but peer range is `>=18`; do not use features that break on 18.
- MUI v9 theming — components read `theme.font?.primary`, the pastel palette, and dark-mode tokens from the ambient theme. Avoid hardcoded colors. Optional `theme` prop on `<AuraPivot>` wraps the subtree in `<ThemeProvider>` for scoped overrides.
