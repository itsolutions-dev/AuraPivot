# @its/aura-pivot

A new powerful React pivot table library.

Built on MUI v9, React 18+, and react-virtuoso. No row limit. Full AuraPivot report compatibility.

---

## Key differences from AuraPivot

|                   | AuraPivot | AuraPivot                                      |
| ----------------- | --------- | ---------------------------------------------- |
| Row limit         | ~1 MB     | None                                           |
| Rendering         | DOM       | Virtualized (react-virtuoso)                   |
| Theming           | Custom    | MUI v9 (inherits or override via `theme` prop) |
| Date hierarchies  | Manual    | Auto-expanded                                  |
| Calculated fields | No        | Yes                                            |
| Excel export      | Plugin    | Built-in (exceljs)                             |

---

## Installation

```bash
npm install @its/aura-pivot
```

Peer dependencies (must be installed separately):

```bash
npm install react react-dom @mui/material @emotion/react @emotion/styled react-intl
```

---

## Quick start

```jsx
import AuraPivot from "@its/aura-pivot";

function MyReport() {
  const ref = useRef();

  const global = {
    dataSource: {
      data: myDataset, // [metadata, ...rows] — AuraPivot format
    },
    options: {
      drillThrough: true,
    },
  };

  return (
    <AuraPivot
      ref={ref}
      width="100%"
      height={600}
      global={global}
      reportChange={(report) => console.log("report changed", report)}
    />
  );
}
```

---

## Props

| Prop                     | Type                | Default         | Description                                                                                                                                                                                                   |
| ------------------------ | ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global`                 | `object`            | —               | Main config object. Contains `dataSource` and `options`.                                                                                                                                                      |
| `global.dataSource.data` | `array`             | —               | Dataset in AuraPivot format: `[metadataRow, ...dataRows]`.                                                                                                                                                    |
| `global.options`         | `PivotOptions`      | See below       | Grid type, sorting mode, drill-through, configurator button.                                                                                                                                                  |
| `localization`           | `object`            | `{}`            | Localization dictionary. **Required for any visible labels.** No bundled fallback — pass a dict from `@its/aura-pivot/locales/<lang>.json` or your i18next setup.                                             |
| `width`                  | `string \| number`  | `'100%'`        | Container width.                                                                                                                                                                                              |
| `height`                 | `string \| number`  | `'100%'`        | Container height.                                                                                                                                                                                             |
| `toolbar`                | `boolean`           | `true`          | Show the toolbar (Fields / Format / Export buttons).                                                                                                                                                          |
| `locale`                 | `string`            | browser default | BCP-47 locale tag (`'en'`, `'it-IT'`, …). Controls number formatting, date formatting, and string sorting. Pass `undefined` to follow the browser.                                                            |
| `reportChange`           | `function`          | —               | Called with the current `Report` object whenever the user changes the pivot layout.                                                                                                                           |
| `beforeToolbarCreated`   | `function`          | —               | Receives `{ getTabs }` — use it to inject custom toolbar tabs.                                                                                                                                                |
| `theme`                  | `Theme \| function` | —               | Optional MUI theme object (or callback `(outerTheme) => theme`). When set the pivot subtree is wrapped in a `ThemeProvider`. When omitted the component inherits the host app theme. See [Theming](#theming). |

### `PivotOptions`

```js
{
  sorting: 'columns' | 'rows' | 'none',    // default: 'columns'
  drillThrough: boolean,                   // default: false
}
```

---

## Ref API

Attach a ref to `<AuraPivot>` to programmatically read or set the pivot report.

```jsx
const ref = useRef();

// AuraPivot-compatible read/write
ref.current.AuraPivot.getReport(); // → Report
ref.current.AuraPivot.setReport(report); // sets report without emitting reportchange

// Raw engine for advanced use
ref.current.engine; // PivotEngine instance
```

`setReport` intentionally does **not** fire `reportchange`. Calling it from inside a `reportchange` handler is safe — it will not cause an infinite loop.

---

## Data format

The dataset follows the AuraPivot `[metadata, ...rows]` convention:

```js
const data = [
  // First row: metadata (field → { type, caption })
  {
    callDate: { type: "date", caption: "Call Date" },
    agentName: { type: "string", caption: "Agent" },
    revenue: { type: "number", caption: "Revenue" },
  },
  // Remaining rows: data
  { callDate: "2024-03-15", agentName: "Alice", revenue: 1200 },
  { callDate: "2024-03-16", agentName: "Bob", revenue: 980 },
  // ...
];
```

If the metadata header row is absent, AuraPivot synthesizes it from the first data row.

### Field types

| Type        | Description                                 |
| ----------- | ------------------------------------------- |
| `'string'`  | Dimension — used for grouping and filtering |
| `'number'`  | Measure candidate — summed, averaged, etc.  |
| `'date'`    | Triggers automatic date hierarchy expansion |
| `'time'`    | Time value                                  |
| `'month'`   | Month label                                 |
| `'weekday'` | Weekday label                               |

### Date hierarchies

Fields typed as `date` are automatically expanded into virtual sub-fields:

```
callDate.Year
callDate.Quarter
callDate.Month
callDate.Week
callDate.Day
callDate.Weekday
callDate.Hour
callDate.Minute
```

These virtual fields appear in the field list and can be used as row/column dimensions like any other field.

---

## Report structure

The `Report` object that flows in and out of the pivot (via `reportchange` / `setReport` / `getReport`):

```js
{
  slice: {
    rows:     [{ uniqueName: 'callDate.Year' }],
    columns:  [{ uniqueName: 'agentName' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum', caption: 'Total Revenue' }],
    filters:  [{ uniqueName: 'agentName', exclude: ['Charlie'] }],
    expands:  { expandAll: true },
  },
  options: { /* PivotOptions */ },
  dataSource: { data: [ /* dataset */ ] },
}
```

### Aggregation types

`sum` · `count` · `distinctcount` · `avg` · `min` · `max`

Derived aggregations also available: `ratioTotal` (% of grand total), `currentRatio` (% of parent subtotal), `formula` (calculated field expression).

### Sort direction per field

```js
{ uniqueName: 'callDate.Year', sort: 'asc' | 'desc' | 'none' }
```

---

## Theming

The pivot reads colors, typography, spacing, and the optional `theme.font?.primary` token from the ambient MUI theme. By default it inherits whatever `<ThemeProvider>` wraps the host app — no extra wiring is needed when its look should match the rest of the application.

Pass the `theme` prop to override that behavior and scope a custom theme to the pivot subtree only. Useful when:

- the pivot must look different from the rest of the host app (e.g. light pivot inside a dark dashboard),
- the host app is not on MUI and you want to inject a self-contained theme for the pivot,
- you need to tweak a few palette / typography tokens without touching the global theme.

### Full theme override

Pass any object produced by `createTheme`. It fully replaces the ambient theme inside the pivot.

```jsx
import { createTheme } from '@mui/material/styles';
import AuraPivot from '@its/aura-pivot';

const pivotTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1a73e8' },
    background: { paper: '#ffffff', default: '#f7f9fc' },
    divider: '#e0e4eb',
  },
  typography: { fontFamily: 'Roboto, sans-serif' },
  // Custom token consumed by the pivot Box wrapper:
  font: { primary: 'Roboto, sans-serif' },
});

<AuraPivot theme={pivotTheme} global={{ ... }} />
```

### Partial override (merge with host theme)

Pass a callback `(outerTheme) => theme` to keep the host palette/typography and only patch what you need. MUI's `ThemeProvider` invokes the callback with the outer theme.

```jsx
import { createTheme } from '@mui/material/styles';
import AuraPivot from '@its/aura-pivot';

const pivotTheme = (outer) =>
  createTheme({
    ...outer,
    palette: {
      ...outer.palette,
      primary: { main: '#0b8043' },
    },
    font: { ...(outer.font || {}), primary: 'Inter, sans-serif' },
  });

<AuraPivot theme={pivotTheme} global={{ ... }} />
```

### Tokens read by the pivot

If you build a custom theme from scratch, make sure these tokens exist — components fall back to MUI defaults where possible but the wrapper Box reads them directly:

| Token                      | Used for                                            |
| -------------------------- | --------------------------------------------------- |
| `palette.background.paper` | Pivot container background                          |
| `palette.text.primary`     | Default text color                                  |
| `palette.divider`          | Container border, header separators                 |
| `palette.primary.main`     | Toolbar accents, selection highlights               |
| `palette.action.hover`     | Row / cell hover state                              |
| `palette.mode`             | `'light' \| 'dark'` — toggles dark-mode adjustments |
| `font.primary`             | Custom font-family token (falls back to `'Inter'`)  |
| `typography.fontFamily`    | MUI components (toolbar, dialogs)                   |

Dark mode works out of the box — set `palette.mode: 'dark'` on the theme you pass.

---

## Localization

The library does **not** bundle any locale dictionary. Pass one to the `localization` prop. Italian and English dictionaries are shipped as separate JSON files under `@its/aura-pivot/locales/`.

### Static import (small apps, single language)

```jsx
import AuraPivot from '@its/aura-pivot';
import en from '@its/aura-pivot/locales/en.json';

<AuraPivot localization={en} locale="en" global={{ ... }} />
```

### Per-instance overrides

```jsx
import AuraPivot, { mergeLocalization } from '@its/aura-pivot';
import en from '@its/aura-pivot/locales/en.json';

const localization = mergeLocalization(en, {
  grid: { grandTotal: 'Overall Total' },
  aggregations: { sum: 'Total' },
});

<AuraPivot localization={localization} locale="en" global={{ ... }} />
```

`mergeLocalization(base, override)` does a shallow merge per top-level section.

### Lazy loading with i18next + i18next-http-backend

For apps that ship many languages or want to load translations on demand, wire `i18next` with `i18next-http-backend` and feed the loaded resource bundle into the `localization` prop.

1. Copy the JSON files you want to host (you can start from `node_modules/@its/aura-pivot/dist/locales/{it,en}.json`) into your public folder, e.g. `public/locales/<lng>/pivot.json`. Add new languages by dropping new JSON files in the same shape.
2. Initialize `i18next`:

```js
import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    ns: ["pivot"],
    defaultNS: "pivot",
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
  });
```

3. Read the bundle for the active language and pass it to `<AuraPivot>`:

```jsx
import { useTranslation } from "react-i18next";
import AuraPivot from "@its/aura-pivot";

function PivotPanel(props) {
  const { i18n } = useTranslation("pivot");
  const localization = i18n.getResourceBundle(i18n.language, "pivot");
  return (
    <AuraPivot
      locale={i18n.language}
      localization={localization}
      global={props.global}
    />
  );
}
```

`changeLanguage('fr')` triggers a one-time HTTP fetch of `/locales/fr/pivot.json`; the component re-renders with the new dictionary automatically.

---

## Advanced: context and hooks

Use `AuraPivotProvider` + `useAuraPivot` to share engine state with sibling components outside the pivot:

```jsx
import { AuraPivotProvider, useAuraPivotMatrix } from "@its/aura-pivot";

function MatrixStats() {
  const { matrix, loading } = useAuraPivotMatrix();
  if (loading) return <span>Computing…</span>;
  return (
    <span>
      {matrix.rowLeaves.length} rows × {matrix.colLeaves.length} columns
    </span>
  );
}

function App() {
  const engineRef = useRef();

  return (
    <AuraPivotProvider engine={engineRef.current?.engine}>
      <AuraPivot ref={engineRef} global={global} />
      <MatrixStats />
    </AuraPivotProvider>
  );
}
```

`useAuraPivotMatrix` subscribes to `datachange`, `reportchange`, and `formatchange` events and returns `{ matrix: PivotMatrix, loading: boolean }`. For datasets above 5 000 rows the recompute is deferred one microtask so the loading indicator can paint first.

---

## Build

```bash
npm run build
```

Outputs:

| File                | Format   | Use                            |
| ------------------- | -------- | ------------------------------ |
| `dist/index.js`     | CommonJS | Legacy bundlers, Node          |
| `dist/index.esm.js` | ESM      | Webpack, Vite, modern bundlers |

Requires Node ≥ 18 (Rollup config uses import assertions).

---

## Compatibility notes

- React peer range is `>=18`. Library is developed against React 19 in devDependencies but does not use features unavailable on 18.
- MUI v9 is required. Components read `theme.font?.primary` and the ambient palette for theming — no hardcoded colors.
- `@emotion/react` and `@emotion/styled` are peer dependencies (required by MUI v9 styling engine).
- `react-intl` is a peer dependency; it must be present in the host app even if not explicitly used.
- The `Measures` string is a reserved `uniqueName` used as a pseudo-field to control whether measures appear on rows or columns. Do not use it as a real field name in your dataset.

---

## License

Private package — distributed under the terms of the host organization's internal license.
