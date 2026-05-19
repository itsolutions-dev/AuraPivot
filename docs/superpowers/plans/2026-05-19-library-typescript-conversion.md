# Library TypeScript Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `@its/aura-pivot` package (`Library/`) from plain JS/JSX to strict TypeScript, emitting a real `dist/index.d.ts` for consumers.

**Architecture:** Big-bang conversion of all 30 source files to `.ts`/`.tsx`, ordered bottom-up by the import graph so `tsc --noEmit` stays green after every task (no `allowJs`). Babel keeps producing the JS bundle (`@babel/preset-typescript` strips types); a separate `tsc` pass typechecks and emits declarations, bundled into one `dist/index.d.ts` via `rollup-plugin-dts`.

**Tech Stack:** TypeScript 6 (`^6.0.3`), Rollup, Babel (`@babel/preset-react` + `@babel/preset-typescript`), `rollup-plugin-dts`, React 18/19, MUI v9.

---

## Working directory

All paths are relative to `C:\My\Dev\AuraPivotApp\Library`. **`Library/` is its own git repository** (gitignored from the parent `AuraPivotApp` repo). All commits in Tasks 1–10 and 12 happen in the `Library` repo. Task 11 commits in the parent `AuraPivotApp` repo.

## Conversion rules (apply to every file-conversion task)

1. **Rename with history:** `git mv old.js old.ts` (or `.jsx` → `.tsx` for files containing JSX). Never delete-and-recreate — `git mv` preserves blame.
2. **Bottom-up order:** a converted `.ts` file may only import already-converted `.ts`/`.tsx` files or typed npm packages. If `tsc` reports an import of a still-`.jsx` sibling, that sibling belongs in the same task — convert it too.
3. **No `any` except** at the two dynamic boundaries named in the spec: raw `dataSource` rows before normalization, the raw `options` object before validation. Every `any` carries an inline `// dynamic boundary: <reason>` comment.
4. **Imports stay extensionless** (`import x from "./PivotEngine"`). `moduleResolution: "bundler"` resolves them.
5. **Verification after every task:** `npx tsc --noEmit` must pass, and `npm run build` must still succeed (Babel ignores types, so the JS bundle keeps building throughout).

## File structure (final state)

| Path | Responsibility | Converts to |
|------|----------------|-------------|
| `tsconfig.json` | strict TS config | new |
| `global.d.ts` | ambient FREEPLAN build tokens | new |
| `rollup.config.dts.js` | bundles per-file `.d.ts` → one `index.d.ts` | new |
| `pivot-core/types.ts` | all shared interfaces + public API types + MUI augmentation | from `types.js` |
| `pivot-core/*.ts` (10 files) | framework-agnostic engine | from `.js` |
| `context/`, `hooks/`, `theme/`, `localization/` | React infra | from `.js`/`.jsx` |
| `options/*.ts` | options schema + adapter + prop-types validator | from `.js` |
| `components/**/*.tsx` (9 files) | MUI UI | from `.jsx` |
| `AuraPivot.tsx`, `index.ts` | public entry | from `.jsx`/`.js` |
| `rollup.config.js` | stays `.js` — edited, not converted | edited |

---

## Task 1: Tooling — deps, tsconfig, ambient declarations, rollup wiring

**Files:**
- Create: `tsconfig.json`
- Create: `global.d.ts`
- Modify: `package.json` (devDependencies)
- Modify: `rollup.config.js`

- [ ] **Step 1: Install TypeScript toolchain**

Run:
```bash
npm install --save-dev typescript @babel/preset-typescript rollup-plugin-dts @types/react @types/react-dom @types/file-saver
```
Expected: the six packages appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["**/*.ts", "**/*.tsx", "global.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Notes for the engineer:
- `noEmit` is intentionally **absent** — it conflicts with `--emitDeclarationOnly` used at build time. Emit mode is picked per-script on the CLI.
- `isolatedModules: true` matches Babel's file-by-file transpile; it forces `export type` for type-only re-exports (relevant in Task 2 and Task 4).
- `include` only matches `.ts`/`.tsx`, so the still-`.jsx`/`.js` files are invisible to `tsc` until converted — that is what keeps `tsc --noEmit` green after each task.

- [ ] **Step 3: Create `global.d.ts`**

The FREEPLAN tokens are bare identifiers that the rollup `build-flags` plugin string-replaces at build time. `tsc` never sees the replacement, so it needs ambient declarations or it errors `TS2304: Cannot find name '__FREEPLAN__'`.

```typescript
// Build-time tokens replaced by the rollup `build-flags` plugin.
// Declared so `tsc` accepts the source in its pre-replacement form.
declare const __FREEPLAN__: boolean;
declare const __FREEPLAN_MAX_BYTES__: number;
declare const __FREEPLAN_INFO_URL__: string;
declare const __FREEPLAN_WATERMARK_ICON__: string;
```

- [ ] **Step 4: Wire `.ts`/`.tsx` into `rollup.config.js`**

Three edits — the rollup config file itself stays `.js`.

Edit A — `buildFlags()` `transform`, extend the extension filter (around line 78):
```javascript
    if (!/\.([jt]sx?|mjs)$/.test(id)) return null;
```

Edit B — `resolve()` plugin `extensions` (around line 160):
```javascript
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
```

Edit C — `babel()` plugin call (around line 169). Add `@babel/preset-typescript` AND an explicit `extensions` array — `@rollup/plugin-babel` defaults to `.js,.jsx,.mjs` and will silently skip `.ts`/`.tsx` without it:
```javascript
    babel({
      exclude: "node_modules/**",
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs"],
      babelHelpers: "bundled",
      presets: ["@babel/preset-react", "@babel/preset-typescript"],
    }),
```

Leave `input: "index.js"` unchanged — `index.js` becomes `index.ts` in Task 9.

- [ ] **Step 5: Verify the build still works (no `.ts` files exist yet)**

Run: `npm run build`
Expected: success — `dist/index.js` and `dist/index.esm.js` regenerate. Every source file is still `.jsx`/`.js`, so this only proves the rollup edits did not break the existing pipeline.

Run: `npx tsc --noEmit`
Expected: success with no output — `include` matches only `global.d.ts`, which is valid.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json global.d.ts package.json package-lock.json rollup.config.js
git commit -m "Add TypeScript toolchain and rollup wiring"
```

---

## Task 2: `pivot-core/types.ts` — the type backbone

**Files:**
- Modify (rename): `pivot-core/types.js` → `pivot-core/types.ts`
- Read for reference: `options/optionsSchema.js`, `options/optionsPropType.js`

This file holds every shared interface. It imports nothing from the codebase, so it converts first and unblocks everything else.

- [ ] **Step 1: Rename**

```bash
git mv pivot-core/types.js pivot-core/types.ts
```

- [ ] **Step 2: Port the existing JSDoc typedefs to exported interfaces**

Replace every `@typedef` block with a real exported type. One-to-one mapping:

```typescript
export type FieldType = "string" | "number" | "date" | "time" | "month" | "weekday";

export interface FieldMeta {
  type: FieldType;
  caption: string;
}

export type MetadataRow = Record<string, FieldMeta>;
export type DataRow = Record<string, string | number | null>;

export type SortDirection = "asc" | "desc" | "none";
export type AggregationType = "sum" | "count" | "distinctcount" | "avg" | "min" | "max";

export interface SliceField {
  uniqueName: string;
  sort?: SortDirection;
  caption?: string;
}

export interface SliceMeasure {
  uniqueName: string;
  aggregation: AggregationType;
  caption?: string;
  availableAggregations?: AggregationType[];
}

export interface SliceFilter {
  uniqueName: string;
  members?: string[];
  exclude?: string[];
}

export interface Slice {
  rows: SliceField[];
  columns: SliceField[];
  measures: SliceMeasure[];
  expands?: { expandAll?: boolean; expandedMembers?: string[] };
  filters?: SliceFilter[];
  flatOrder?: string[];
}

export interface PivotOptions {
  sorting?: "columns" | "rows" | "none";
  drillThrough?: boolean;
}

export interface Report {
  slice: Slice;
  dataSource?: { data?: unknown[]; dataSourceType?: "json" };
  options?: PivotOptions;
}

export interface TreeNode {
  key: string;
  caption: string;
  depth: number;
  isExpanded: boolean;
  isTotal?: boolean;
  children: TreeNode[];
  rowIndexes: string[];
  field?: string;
  value?: string | number | null;
}

export interface MatrixCell {
  value: number | null;
  formattedValue: string;
  rowKey: string;
  colKey: string;
  measureKey: string;
}

export interface PivotMatrix {
  rowLeaves: TreeNode[];
  colLeaves: TreeNode[];
  rowRoot: TreeNode;
  colRoot: TreeNode;
  cells: Map<string, MatrixCell>;
  measures: SliceMeasure[];
}
```

Delete the trailing `export {};`.

- [ ] **Step 3: Add the engine event type**

The event names are camelCase in the existing code (verified against `PivotEngine.js` `_emit` calls and `AuraPivot.jsx`):

```typescript
export type EngineEvent = "dataChange" | "reportChange" | "formatChange";
export type EngineEventHandler = (...args: unknown[]) => void;
```

- [ ] **Step 4: Add the public `AuraPivotOptions` type**

This is the most consumer-facing type in the shipped `.d.ts`. Translate it from the two existing schema files:
- The top-level shape and the enum unions come from `options/optionsSchema.js` (`DEFAULT_OPTIONS`, `DENSITIES`, `TOTALS_POSITIONS`, etc.).
- The nested element shapes (`data.fields[]`, `data.measures[]`, `format.conditional[]`, …) come from the `PropTypes.shape({...})` blocks in `options/optionsPropType.js` — each `PropTypes.shape` translates one-to-one to an `interface`.

Concrete top-level type (enum unions taken straight from `optionsSchema.js`):

```typescript
export type Density = "Compact" | "Standard" | "Comfortable";
export type TotalsPosition = "before" | "after" | "none";
export type MeasuresAxis = "rows" | "columns";

export interface AuraPivotToolbarOptions {
  visible?: boolean;
  showFields?: boolean;
  showFormat?: boolean;
  showExport?: boolean;
  showFullscreen?: boolean;
}

export interface AuraPivotLayoutOptions {
  showTitle?: boolean;
  title?: string;
  notes?: string;
  density?: Density;
  alternateRows?: boolean;
  enableDrillThrough?: boolean;
  drillThroughStickyColumns?: number;
  totalsRowsPosition?: TotalsPosition;
  totalsRowsSticky?: boolean;
  totalsColumnsPosition?: TotalsPosition;
  totalsColumnsSticky?: boolean;
  measuresAxis?: MeasuresAxis;
}

export interface AuraPivotOptions {
  toolbar?: AuraPivotToolbarOptions;
  layout?: AuraPivotLayoutOptions;
  data?: AuraPivotDataOptions;     // define from optionsPropType.js `data` shape
  format?: AuraPivotFormatOptions; // define from optionsPropType.js `format` shape
}
```

Define `AuraPivotDataOptions` and `AuraPivotFormatOptions` (and the array-element interfaces they reference) by reading the corresponding `PropTypes.shape` blocks in `options/optionsPropType.js`. Keep every property optional (`?`) — `optionsSchema.js` states a host may pass a partial object.

- [ ] **Step 5: Add the ref handle and props types**

`PivotEngine` is converted in Task 4 — to avoid a forward type-import cycle, type the engine slot loosely here and let `AuraPivot.tsx` (Task 9) narrow it:

```typescript
export interface AuraPivotHandle {
  auraPivot: { getOptions: () => AuraPivotOptions };
  engine: unknown; // narrowed to PivotEngine where consumed
}

export interface AuraPivotProps {
  width?: string | number;
  height?: string | number;
  locale?: string;
  localization?: Record<string, unknown>;
  options?: AuraPivotOptions;
  dataSource?: DataRow[];
  onOptionsChange?: (next: AuraPivotOptions) => void;
  beforeToolbarCreated?: (...args: unknown[]) => unknown;
  theme?: object | ((outer: object) => object);
}
```

- [ ] **Step 6: Add the MUI theme augmentation**

Components read custom tokens off the MUI theme (confirmed: `theme.font?.primary` in `AuraPivot.jsx:325`). Without augmentation every custom-token access errors `TS2339`.

```typescript
import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Theme {
    font?: { primary?: string };
  }
  interface ThemeOptions {
    font?: { primary?: string };
  }
}
```

This is a starting point. As later tasks convert components, `tsc` will surface any other custom token the components read off `theme` (`TS2339` on a `theme.*` access) — extend the `Theme`/`ThemeOptions` interfaces here when that happens, in the task that surfaced it.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: success, no output.

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add pivot-core/types.ts
git commit -m "Convert pivot-core/types to TypeScript with public API types"
```

---

## Task 3: `pivot-core/` engine leaves

**Files (rename each, `.js` → `.ts`):**
- `pivot-core/data/DataNormalizer.js`
- `pivot-core/data/DateHierarchyExpander.js`
- `pivot-core/slice/FilterEngine.js`
- `pivot-core/slice/TreeBuilder.js`
- `pivot-core/aggregation/Aggregator.js`
- `pivot-core/format/DateFormatter.js`
- `pivot-core/format/CellFormatter.js`
- `pivot-core/matrix/MatrixComputer.js`
- `pivot-core/export/ExcelExporter.js`

These nine files are framework-agnostic and import only `types.ts`, each other, and npm packages (`exceljs`, `file-saver`). `PivotEngine.js` and `pivot-core/index.js` are deliberately left for Task 4.

- [ ] **Step 1: Rename all nine files**

```bash
git mv pivot-core/data/DataNormalizer.js pivot-core/data/DataNormalizer.ts
git mv pivot-core/data/DateHierarchyExpander.js pivot-core/data/DateHierarchyExpander.ts
git mv pivot-core/slice/FilterEngine.js pivot-core/slice/FilterEngine.ts
git mv pivot-core/slice/TreeBuilder.js pivot-core/slice/TreeBuilder.ts
git mv pivot-core/aggregation/Aggregator.js pivot-core/aggregation/Aggregator.ts
git mv pivot-core/format/DateFormatter.js pivot-core/format/DateFormatter.ts
git mv pivot-core/format/CellFormatter.js pivot-core/format/CellFormatter.ts
git mv pivot-core/matrix/MatrixComputer.js pivot-core/matrix/MatrixComputer.ts
git mv pivot-core/export/ExcelExporter.js pivot-core/export/ExcelExporter.ts
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — many `TS7006` (parameter implicitly has an `any` type), `TS7053`, `TS2531`, `TS18048` (possibly `null`/`undefined`) across the nine files. This is the work list.

- [ ] **Step 3: Annotate the nine files**

Work each error to zero. Guidance:
- Import shared types from `../types` / `../../types` (`MetadataRow`, `DataRow`, `TreeNode`, `MatrixCell`, `PivotMatrix`, `SliceMeasure`, `AggregationType`, `FieldType`, etc.). Use `import type { ... }` for type-only imports (`isolatedModules` is on).
- Annotate every exported function's parameters and return type explicitly — these are the engine's internal API surface and Task 4 depends on them.
- For object maps keyed by field name, use `Record<string, X>` rather than index signatures inline.
- `exceljs` and `file-saver` ship their own types; `import ExcelJS from "exceljs"` and `import { saveAs } from "file-saver"` resolve. In `ExcelExporter.ts`, type the workbook/worksheet via `ExcelJS.Workbook` / `ExcelJS.Worksheet`.
- Raw incoming dataset rows in `DataNormalizer.ts` before normalization are the documented dynamic boundary — `unknown` (preferred) or `any` with the `// dynamic boundary:` comment is acceptable there; everything downstream is typed.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add pivot-core/
git commit -m "Convert pivot-core engine leaves to TypeScript"
```

---

## Task 4: `PivotEngine.ts` + `pivot-core/index.ts`

**Files:**
- Rename: `pivot-core/PivotEngine.js` → `pivot-core/PivotEngine.ts`
- Rename: `pivot-core/index.js` → `pivot-core/index.ts`

`PivotEngine` imports every leaf from Task 3; `pivot-core/index` re-exports `PivotEngine` plus the leaves.

- [ ] **Step 1: Rename**

```bash
git mv pivot-core/PivotEngine.js pivot-core/PivotEngine.ts
git mv pivot-core/index.js pivot-core/index.ts
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` and possibly-`undefined` errors across `PivotEngine.ts`.

- [ ] **Step 3: Type the event bus**

`PivotEngine` holds `this._listeners` (a `Map`) and exposes `on`/`off`/`_emit`. Type them against `EngineEvent` from `types.ts` so no untyped event name slips through:

```typescript
import type { EngineEvent, EngineEventHandler } from "./types";

private _listeners: Map<EngineEvent, Set<EngineEventHandler>> = new Map();

on(event: EngineEvent, handler: EngineEventHandler): void { /* ... */ }
off(event: EngineEvent, handler: EngineEventHandler): void { /* ... */ }
private _emit(event: EngineEvent, ...args: unknown[]): void { /* ... */ }
```

- [ ] **Step 4: Type the engine class members and methods**

- Declare every `this._*` field with an explicit type at the top of the class (TS strict requires class fields be declared/initialized — implicit fields error `TS2339`). Examples: `_rawDataset`, `_metadata: MetadataRow | null`, `_rows: DataRow[]`, `_expandedMeta`, `_expandedRows`, `_dirty: boolean`, `_matrix: PivotMatrix | null`, `_localization`, `_locale: string | undefined`, `_dateFormats: Record<string, string>`, `_fieldOrder: string[]`, `_calculatedFields`, `_drillThroughFields`, `_drillThroughFrozenCount: number`.
- Annotate every public method signature (`setData`, `setReport`, `getReport`, `processMatrix`, `setFormat`, `getFormat`, `getOptions`, `setOptions`, `exportExcel`, `setLocale`, `setLocalization`, `setDateLocalization`, `setFieldCaption`, `getRows`, `getMetadata`, etc.).
- `processMatrix()` returns `PivotMatrix`. `getOptions()` returns the engine options object.
- The raw `options`/`report` objects arriving via `setOptions`/`setReport` are a dynamic boundary — accept `unknown` or a `Partial<...>` and validate, do not force a tight type on the inbound argument.

- [ ] **Step 5: Type `pivot-core/index.ts`**

Re-exports only. With `isolatedModules`, a re-export that is purely a type must use `export type`. `PivotEngine` is a class (value) — `export { PivotEngine }` stays. The named function re-exports (`normalizeDataset`, `expandHierarchies`, `applyAggregation`, `buildTree`, `computeMatrix`, etc.) are values — unchanged. `export default PivotEngine` stays.

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add pivot-core/PivotEngine.ts pivot-core/index.ts
git commit -m "Convert PivotEngine and pivot-core entry to TypeScript"
```

---

## Task 5: React infrastructure — context, hooks, theme, localization

**Files (rename each):**
- `context/PivotContext.jsx` → `.tsx`
- `hooks/usePivotMatrix.js` → `.ts`
- `hooks/usePortalContainer.js` → `.ts`
- `theme/swatches.js` → `.ts`
- `localization/merge.js` → `.ts`

These import only `types.ts`, `pivot-core` (now `.ts`), React, and npm packages.

- [ ] **Step 1: Rename**

```bash
git mv context/PivotContext.jsx context/PivotContext.tsx
git mv hooks/usePivotMatrix.js hooks/usePivotMatrix.ts
git mv hooks/usePortalContainer.js hooks/usePortalContainer.ts
git mv theme/swatches.js theme/swatches.ts
git mv localization/merge.js localization/merge.ts
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` errors across the five files.

- [ ] **Step 3: Annotate**

- `context/PivotContext.tsx` — define a `PivotContextValue` interface (`{ engine: PivotEngine; localization: Record<string, unknown>; locale: string | undefined; options: AuraPivotOptions; fullscreenRef: React.RefObject<HTMLDivElement | null>; isFullscreen: boolean }`) matching the `contextValue` object built in `AuraPivot.jsx:294-311`. Type `createContext<PivotContextValue | null>(null)`. Type `PivotProvider`'s props (`{ value: PivotContextValue; children: React.ReactNode }`).
- `hooks/usePivotMatrix.ts` — signature `(engine: PivotEngine | null | undefined) => { matrix: PivotMatrix | null; loading: boolean }`. Type the `useState` generics explicitly (`useState<PivotMatrix | null>`, `useState<boolean>`).
- `hooks/usePortalContainer.ts` — annotate against its actual return (read the file; it is 14 lines).
- `theme/swatches.ts` — `TONE_STOPS: number[]`; `hexToRgb(hex: string): [number, number, number]`; `rgbToHsl(r: number, g: number, b: number): [number, number, number]`; `hslToHex(h: number, s: number, l: number): string`; `buildSwatches(hex: string): Record<number, string>`; `variantSwatches(variant: { palette: { primary: string; secondary: string; tertiary: string } })`.
- `localization/merge.ts` — type `mergeLocalization` against the dictionary shape (`Record<string, unknown>` deep-merge); read the 24-line file for the exact signature.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add context/ hooks/ theme/ localization/
git commit -m "Convert React infrastructure modules to TypeScript"
```

---

## Task 6: `options/` — schema, prop-types validator, adapter

**Files (rename each, `.js` → `.ts`):**
- `options/optionsSchema.js`
- `options/optionsPropType.js`
- `options/optionsAdapter.js`

`optionsAdapter` imports `pivot-core` and `optionsSchema`; `optionsPropType` imports `optionsSchema` and `prop-types`.

- [ ] **Step 1: Rename**

```bash
git mv options/optionsSchema.js options/optionsSchema.ts
git mv options/optionsPropType.js options/optionsPropType.ts
git mv options/optionsAdapter.js options/optionsAdapter.ts
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` errors; possibly a `prop-types` resolution error (see Step 3).

- [ ] **Step 3: Annotate**

- `optionsSchema.ts` — the exported arrays are best typed as readonly tuples so they double as the source of the union types: `export const DENSITIES = ["Compact", "Standard", "Comfortable"] as const;`. Type `DEFAULT_OPTIONS` as `AuraPivotOptions` (imported from `pivot-core/types`).
- `optionsPropType.ts` — `prop-types` ships its own types; if `tsc` still errors on the import, add `@types/prop-types` to devDependencies (`npm install --save-dev @types/prop-types`). The default export is a validator — type it `PropTypes.Requireable<object>`. **Keep the runtime prop-types validation** — it is not replaced by the TS types (spec decision).
- `optionsAdapter.ts` — `optionsToEngine(engine: PivotEngine, options: AuraPivotOptions | undefined, dataSource: DataRow[] | undefined): void` and `engineToOptions(engine: PivotEngine): AuraPivotOptions`. The raw `options` object before validation is the documented dynamic boundary.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add options/ package.json package-lock.json
git commit -m "Convert options schema and adapter to TypeScript"
```

---

## Task 7: `components/` — toolbar, dialogs, field list, filter bar

**Files (rename each, `.jsx` → `.tsx`):**
- `components/Toolbar/PivotToolbar.jsx`
- `components/FieldList/FieldList.jsx`
- `components/FilterBar/FilterBar.jsx`
- `components/FormatDialog/FormatDialog.jsx`
- `components/CalculatedFieldDialog/CalculatedFieldDialog.jsx`
- `components/DimensionFilterDialog/DimensionFilterDialog.jsx`
- `components/DrillThroughDialog/DrillThroughDialog.jsx`

`PivotTable.jsx` is deliberately left for Task 8 — it composes the others. If `tsc` reports that one of these seven imports `PivotTable`, convert `PivotTable` in this task too (rule 2).

- [ ] **Step 1: Rename the seven files**

```bash
git mv components/Toolbar/PivotToolbar.jsx components/Toolbar/PivotToolbar.tsx
git mv components/FieldList/FieldList.jsx components/FieldList/FieldList.tsx
git mv components/FilterBar/FilterBar.jsx components/FilterBar/FilterBar.tsx
git mv components/FormatDialog/FormatDialog.jsx components/FormatDialog/FormatDialog.tsx
git mv components/CalculatedFieldDialog/CalculatedFieldDialog.jsx components/CalculatedFieldDialog/CalculatedFieldDialog.tsx
git mv components/DimensionFilterDialog/DimensionFilterDialog.jsx components/DimensionFilterDialog/DimensionFilterDialog.tsx
git mv components/DrillThroughDialog/DrillThroughDialog.jsx components/DrillThroughDialog/DrillThroughDialog.tsx
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` on component props and event handlers, possibly `TS2339` on custom `theme.*` tokens.

- [ ] **Step 3: Annotate**

- Define a props `interface` for each component, named `<Component>Props`. Source the prop names from how the parent passes them — e.g. `FieldList` is rendered in `AuraPivot.jsx:399-403` with `open`, `onClose`, `measuresAxis`; `PivotToolbar` at `:347-354` with `beforeToolbarCreated`, `onOpenFields`, `onOpenFormat`, `onExportExcel`, `onToggleFullscreen`, `isFullscreen`.
- Type each component as `function Name(props: NameProps): JSX.Element` (or `React.FC<NameProps>` if the file already uses that style — match the file).
- Event handlers: use the precise React types — `React.MouseEvent<HTMLButtonElement>`, `React.ChangeEvent<HTMLInputElement>`, `(e: React.SyntheticEvent) => void`, etc.
- Pull engine/matrix types from `pivot-core/types`. Consume the `PivotContextValue` type from `context/PivotContext` via the `usePivot()` hook — it is already typed (Task 5).
- If `tsc` reports `TS2339` on a `theme.<token>` access, add that token to the MUI augmentation in `pivot-core/types.ts` (Task 2, Step 6).

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add components/ pivot-core/types.ts
git commit -m "Convert toolbar, dialogs and field list to TypeScript"
```

---

## Task 8: `components/PivotTable.tsx`

**Files:**
- Rename: `components/PivotTable/PivotTable.jsx` → `.tsx`

The largest UI file (~2,500 lines) — the virtualized grid that composes the Task 7 components.

- [ ] **Step 1: Rename**

```bash
git mv components/PivotTable/PivotTable.jsx components/PivotTable/PivotTable.tsx
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` errors within `PivotTable.tsx`.

- [ ] **Step 3: Annotate**

- `react-virtuoso` ships its own types — `import { TableVirtuoso, ... }` resolves. Type its render-prop callbacks against the generic it is instantiated with (the row/leaf type from `pivot-core/types`).
- Type the matrix consumption against `PivotMatrix` / `TreeNode` / `MatrixCell`.
- Define a `PivotTableProps` interface if the component takes props (it is rendered prop-less at `AuraPivot.jsx:382` — if so, `function PivotTable(): JSX.Element`).
- Same MUI augmentation rule as Task 7 — extend `pivot-core/types.ts` if `tsc` surfaces a new `theme.*` token.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add components/PivotTable/PivotTable.tsx pivot-core/types.ts
git commit -m "Convert PivotTable to TypeScript"
```

---

## Task 9: `AuraPivot.tsx` + `index.ts` — public entry

**Files:**
- Rename: `AuraPivot.jsx` → `AuraPivot.tsx`
- Rename: `index.js` → `index.ts`
- Modify: `rollup.config.js` (entry input)

- [ ] **Step 1: Rename**

```bash
git mv AuraPivot.jsx AuraPivot.tsx
git mv index.js index.ts
```

- [ ] **Step 2: Run the typechecker to see the failures**

Run: `npx tsc --noEmit`
Expected: FAIL — implicit-`any` errors in `AuraPivot.tsx`.

- [ ] **Step 3: Annotate `AuraPivot.tsx`**

- Type the component as `forwardRef<AuraPivotHandle, AuraPivotProps>(function Pivot(props, ref) { ... })`, importing both types from `pivot-core/types`.
- `engineRef` holds a `PivotEngine` — `useRef<PivotEngine | null>(null)`.
- The `useImperativeHandle` factory at `:265-274` returns the `AuraPivotHandle` shape — its `engine` field is the concrete `PivotEngine` here (the `unknown` slot from Task 2 is fine; this assignment narrows it at the call site).
- The FREEPLAN token guards (`typeof __FREEPLAN__ !== "undefined"`) compile cleanly against the `global.d.ts` ambient declarations from Task 1.
- `useState` calls: give explicit generics where the initial value is `null` (`useState<SnackState | null>(null)`, `useState<FreeplanBlock | null>(null)` — define small local interfaces for the `snack` and `freeplanBlock` shapes).
- Keep `Pivot.propTypes` — runtime validation is retained (spec decision).

- [ ] **Step 4: Type `index.ts`**

Re-export file. `Pivot` (default + named), `PivotProvider`, `usePivot`, `usePivotMatrix`, `mergeLocalization` are all values — `export { ... }` unchanged. Additionally re-export the public types so consumers can import them:

```typescript
export type {
  AuraPivotProps,
  AuraPivotOptions,
  AuraPivotHandle,
} from "./pivot-core/types";
```

(`export type` is required — `isolatedModules` is on.)

- [ ] **Step 5: Point rollup at the new entry**

In `rollup.config.js`, change the input:
```javascript
  input: "index.ts",
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: success, no output.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: success — `dist/index.js` and `dist/index.esm.js` regenerate. **Every source file is now TypeScript.**

- [ ] **Step 8: Commit**

```bash
git add AuraPivot.tsx index.ts rollup.config.js
git commit -m "Convert AuraPivot component and package entry to TypeScript"
```

---

## Task 10: Declaration emit — `tsc` + `rollup-plugin-dts`

**Files:**
- Create: `rollup.config.dts.js`
- Modify: `package.json` (scripts)

`package.json` already declares `"types": "dist/index.d.ts"` — this task makes that file actually exist.

- [ ] **Step 1: Create `rollup.config.dts.js`**

```javascript
import dts from "rollup-plugin-dts";

// Second build pass: bundle the per-file declarations emitted by `tsc`
// (into dist/types/) down to a single dist/index.d.ts.
export default {
  input: "dist/types/index.d.ts",
  output: { file: "dist/index.d.ts", format: "es" },
  plugins: [dts()],
};
```

- [ ] **Step 2: Add scripts to `package.json`**

Add `typecheck`, and replace `build` / `build:freeplan` / `build:freeplan2` so each runs the declaration pass. The order is: `tsc` emits per-file `.d.ts` into `dist/types/` (and typechecks — a strict failure aborts here), then `rollup -c` builds the JS bundle, then `rollup -c rollup.config.dts.js` bundles the declarations, then the temp dir is removed.

```jsonc
"scripts": {
  "typecheck": "tsc --noEmit",
  "build": "tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/types && rollup -c && rollup -c rollup.config.dts.js && node -e \"require('fs').rmSync('dist/types',{recursive:true,force:true})\"",
  "build:freeplan": "tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/types && cross-env FREEPLAN=1 OBFUSCATOR=1 rollup -c && rollup -c rollup.config.dts.js && node -e \"require('fs').rmSync('dist/types',{recursive:true,force:true})\"",
  "build:freeplan2": "tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/types && cross-env FREEPLAN=1 OBFUSCATOR=0 rollup -c && rollup -c rollup.config.dts.js && node -e \"require('fs').rmSync('dist/types',{recursive:true,force:true})\"",
  "prepublish": "npm run build"
}
```

- [ ] **Step 3: Run the full build**

Run: `npm run build`
Expected: success. `tsc` typechecks (strict) and emits to `dist/types/`, both rollup passes run, the temp dir is removed.

- [ ] **Step 4: Verify the declaration file**

Run: `node -e "const fs=require('fs'); ['dist/index.js','dist/index.esm.js','dist/index.d.ts'].forEach(f=>console.log(f, fs.existsSync(f)))"`
Expected:
```
dist/index.js true
dist/index.esm.js true
dist/index.d.ts true
```

Run: `npx tsc --noEmit dist/index.d.ts`
Expected: success — the bundled declaration file is itself valid TypeScript. Open it and confirm `AuraPivotProps`, `AuraPivotOptions`, and `AuraPivotHandle` are present and exported.

Confirm `dist/types/` was removed:
Run: `node -e "console.log('dist/types exists:', require('fs').existsSync('dist/types'))"`
Expected: `dist/types exists: false`

- [ ] **Step 5: Verify the FREEPLAN build**

Run: `npm run build:freeplan`
Expected: success — produces the obfuscated bundle plus `dist/index.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add rollup.config.dts.js package.json
git commit -m "Emit bundled index.d.ts via tsc and rollup-plugin-dts"
```

---

## Task 11: Update the PresentationApp Vite alias

**Files:**
- Modify: `../PresentationApp/vite.config.js`

`PresentationApp/vite.config.js` aliases `@its/aura-pivot` straight at the Library source. Two converted files are referenced by name. **This task commits in the parent `AuraPivotApp` repo, not the `Library` repo.**

- [ ] **Step 1: Update the non-FREEPLAN entry path**

In `../PresentationApp/vite.config.js`, the `libEntry` constant (around line 15-17):
```javascript
const libEntry = FREEPLAN
  ? path.resolve(libRoot, "dist/index.esm.js")
  : path.resolve(libRoot, "AuraPivot.tsx");
```
(`AuraPivot.jsx` → `AuraPivot.tsx`. The FREEPLAN branch points at `dist/index.esm.js` — unchanged.)

- [ ] **Step 2: Update the theme alias path**

The `@its/aura-pivot/theme` alias (around line 41-42):
```javascript
      {
        find: /^@its\/aura-pivot\/theme$/,
        replacement: path.resolve(libRoot, "theme/swatches.ts"),
      },
```
(`theme/swatches.js` → `theme/swatches.ts`. The `locales/*` alias targets the `localization/` JSON directory — unchanged.)

- [ ] **Step 3: Verify the PresentationApp build**

Run: `npm --prefix ../PresentationApp run build`
Expected: success — Vite/esbuild transpiles the `.ts`/`.tsx` Library source natively. No PresentationApp source change is needed.

- [ ] **Step 4: Verify the PresentationApp dev server**

Run: `npm --prefix ../PresentationApp run dev`
Expected: dev server starts on port 8080 with no resolve/transpile errors. Open the playground, confirm the pivot table renders and toolbar actions work, then stop the server.

- [ ] **Step 5: Commit (in the parent `AuraPivotApp` repo)**

```bash
cd ..
git add PresentationApp/vite.config.js
git commit -m "Point Library Vite alias at the TypeScript source"
cd Library
```

---

## Task 12: Update documentation

**Files:**
- Modify: `CLAUDE.md` (Library repo)
- Modify: `../CLAUDE.md` (parent `AuraPivotApp` repo)

The repo guidance files now describe a state that no longer exists.

- [ ] **Step 1: Update `Library/CLAUDE.md`**

Three corrections:
- The "Build" section says "There is no type-check step — types are JSDoc typedefs in `pivot-core/types.js`." Replace with: the build runs `tsc` for typechecking and declaration emit; `npm run typecheck` runs a check-only pass; types live in `pivot-core/types.ts`.
- The "Conventions" section line "Plain JavaScript + JSX, no TypeScript. Types live in `pivot-core/types.js` as JSDoc typedefs." Replace with: the codebase is TypeScript (`strict: true`); shared types live in `pivot-core/types.ts`.
- The "Architecture" section reference to `pivot-core/types.js` — update to `pivot-core/types.ts`.

- [ ] **Step 2: Update the parent `../CLAUDE.md`**

The "PresentationApp architecture" section states Vite resolves `@its/aura-pivot` to `Library/AuraPivot.jsx`. Update `AuraPivot.jsx` → `AuraPivot.tsx`.

- [ ] **Step 3: Commit the Library doc**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for the TypeScript conversion"
```

- [ ] **Step 4: Commit the parent doc (in the `AuraPivotApp` repo)**

```bash
cd ..
git add CLAUDE.md
git commit -m "Update CLAUDE.md: Library entry is now AuraPivot.tsx"
cd Library
```

---

## Final verification

After Task 12, run the full gate from the `Library` directory:

- [ ] `npx tsc --noEmit` — passes with `strict: true`, no output.
- [ ] `npm run build` — produces `dist/index.js`, `dist/index.esm.js`, `dist/index.d.ts`; no `dist/types/` left behind.
- [ ] `npm run build:freeplan` — produces a working obfuscated bundle plus `dist/index.d.ts`.
- [ ] `npm --prefix ../PresentationApp run build` — succeeds against the converted source.
- [ ] No `.js`/`.jsx` source files remain except `rollup.config.js` and `rollup.config.dts.js`. Verify: `node -e "const g=require('child_process').execSync('git ls-files \"*.js\" \"*.jsx\"').toString().trim().split(String.fromCharCode(10)).filter(f=>!f.startsWith('dist/')&&!f.startsWith('node_modules/')); console.log(g)"` — expected output lists only `rollup.config.js` and `rollup.config.dts.js`.
