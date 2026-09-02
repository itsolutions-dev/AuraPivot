# API reference

Reference material for `aura-pivot`: the component prop and ref surface, the
data and report shapes, the MUI theme tokens the pivot reads, localization, and
the public hooks. Every key of the `options` prop is documented separately on
the [documentation site](https://aurapivot-docs.web.app); some sections
include a screenshot of what the option does, with more coverage landing over
time — go there for the schema, and stay here for the parts that live outside
`options`.

---

## Props

| Prop                   | Type                | Default         | Description                                                                                                                                                                                                   |
| ---------------------- | ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`              | `PivotOptions`      | —               | Full configuration (`toolbar` / `layout` / `data` / `format` sections). Applied **seed-on-change**: re-applied only when the object reference changes. See [docs/options-guide.en.md](options-guide.en.md).   |
| `dataSource`           | `array`             | —               | Plain array of row objects. The schema for those rows lives in `options.data.fields`.                                                                                                                         |
| `onOptionsChange`      | `function`          | —               | Called with the complete updated `options` object after every in-component edit. Feeding it straight back into `options` is safe (loop guard).                                                                |
| `localization`         | `object`            | English         | Localization dictionary. English fallbacks are built in — omit the prop and the pivot renders fully in English. For other languages pass a dict from `aura-pivot/locales/<lang>.json` or your i18next setup.  |
| `width`                | `string \| number`  | `'100%'`        | Container width.                                                                                                                                                                                              |
| `height`               | `string \| number`  | `'100%'`        | Container height.                                                                                                                                                                                             |
| `locale`               | `string`            | browser default | BCP-47 locale tag (`'en'`, `'it-IT'`, …). Controls number formatting, date formatting, and string sorting. Pass `undefined` to follow the browser.                                                            |
| `beforeToolbarCreated` | `function`          | —               | Receives `{ getTabs }` — use it to inject custom toolbar tabs. String icons may be raw `<svg>` markup (sanitized before rendering).                                                                           |
| `theme`                | `Theme \| function` | —               | Optional MUI theme object (or callback `(outerTheme) => theme`). When set the pivot subtree is wrapped in a `ThemeProvider`. When omitted the component inherits the host app theme. See [Theming](#theming). |

Toolbar visibility is part of `options`, not a prop: `options.toolbar.visible`
(master switch) plus `showFields` / `showFormat` / `showExport` /
`showFullscreen` per tab.

TypeScript: the package ships `dist/index.d.ts` — `PivotOptions`,
`AuraPivotProps`, `AuraPivotRef` and the hook types are all importable.

---

## Ref API

Attach a ref to `<AuraPivot>` to read the current configuration on demand or
reach the raw engine.

```jsx
const ref = useRef();

// Pull the current options schema (same shape onOptionsChange emits)
ref.current.auraPivot.getOptions(); // → PivotOptions

// Raw engine escape hatch for advanced use
ref.current.engine; // PivotEngine instance
```

The legacy `getReport` / `setReport` pair is still reachable through
`ref.current.engine` but is no longer part of the public prop/ref surface —
use the `options` round-trip instead.

---

## Data format

`dataSource` is a plain array of row objects; the schema for those rows lives
in `options.data.fields`:

```js
const rows = [
  { callDate: "2024-03-15", agentName: "Alice", revenue: 1200 },
  { callDate: "2024-03-16", agentName: "Bob", revenue: 980 },
  // ...
];

const options = {
  data: {
    fields: [
      { uniqueName: "callDate", dataType: "date", caption: "Call Date" },
      { uniqueName: "agentName", dataType: "string", caption: "Agent" },
      { uniqueName: "revenue", dataType: "number", caption: "Revenue" },
    ],
    // dimensions / measures / filters / calculatedFields …
  },
};
```

Field inference only happens when `options.data.fields` is omitted or an
**entirely empty array** — in that case every key on the first row of
`dataSource` becomes a field. Once `data.fields` has even one entry, that
list is authoritative: any row key not declared there is silently dropped,
not inferred. Declare every field you need in the pivot. (Internally the
engine still consumes the legacy AuraPivot `[metadata, ...rows]` shape — the
adapter assembles it from `options.data.fields` + `dataSource`.)

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

The configuration that flows in and out of the pivot is the `options` object
(via the `options` prop / `onOptionsChange` / `ref.auraPivot.getOptions()`):

```js
{
  toolbar: { visible: true, showExport: true /* … */ },
  layout:  { measuresAxis: 'columns', totalsRowsPosition: 'before' /* … */ },
  data: {
    fields:     [{ uniqueName: 'callDate', dataType: 'date' } /* … */],
    dimensions: [
      { axis: 'row', uniqueName: 'callDate.Year' },
      { axis: 'column', uniqueName: 'agentName' },
    ],
    measures:   [{ uniqueName: 'revenue', aggregation: 'sum' }],
    filters:    [{ uniqueName: 'agentName', members: ['Alice', 'Bob'] }],
    calculatedFields: [{ uniqueName: 'margin', formula: 'sum("revenue") - sum("cost")' }],
  },
  format: { conditional: [/* … */], values: {/* … */} },
}
```

The full schema is documented in [docs/options-guide.en.md](options-guide.en.md).

### Aggregation types

`sum` · `count` · `distinctcount` · `avg` · `min` · `max`

Derived aggregations also available: `ratioTotal` (% of grand total), `currentRatio` (% of parent subtotal), `formula` (calculated field expression).

### Sort direction per field

There is no `sort` property on a dimension entry. Sort is configured through
`fieldSort`, an object with a `mode` of `'alpha'` (sort by the member's own
value) or `'measure'` (sort by a measure's aggregated value):

```js
// Alphabetical, descending
{
  axis: 'row',
  uniqueName: 'callDate.Year',
  fieldSort: { mode: 'alpha', direction: 'desc' },
}

// By a measure's aggregated value
{
  axis: 'row',
  uniqueName: 'agentName',
  fieldSort: {
    mode: 'measure',
    direction: 'desc',
    measure: { uniqueName: 'revenue', aggregation: 'sum' },
  },
}
```

`direction` is `'asc' | 'desc' | 'none'`. Omitting `fieldSort` (or `mode`)
falls back to alphabetical ascending.

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
import { createTheme } from "@mui/material/styles";
import AuraPivot from "aura-pivot";

const pivotTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1a73e8" },
    background: { paper: "#ffffff", default: "#f7f9fc" },
    divider: "#e0e4eb",
  },
  typography: { fontFamily: "Roboto, sans-serif" },
  // Custom token consumed by the pivot Box wrapper:
  font: { primary: "Roboto, sans-serif" },
});

<AuraPivot theme={pivotTheme} options={options} dataSource={rows} />;
```

### Partial override (merge with host theme)

Pass a callback `(outerTheme) => theme` to keep the host palette/typography and only patch what you need. MUI's `ThemeProvider` invokes the callback with the outer theme.

```jsx
import { createTheme } from "@mui/material/styles";
import AuraPivot from "aura-pivot";

const pivotTheme = (outer) =>
  createTheme({
    ...outer,
    palette: {
      ...outer.palette,
      primary: { main: "#0b8043" },
    },
    font: { ...(outer.font || {}), primary: "Inter, sans-serif" },
  });

<AuraPivot theme={pivotTheme} options={options} dataSource={rows} />;
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

English works out of the box — every label has a built-in English fallback,
so the `localization` prop is only needed for other languages (or to override
specific English captions). Full dictionary JSONs are **not** bundled into the
library code: Italian and English dictionaries ship as separate JSON files
under `aura-pivot/locales/`. A malformed dictionary is rejected with a
`console.warn` in development builds and the pivot falls back to English.

### Static import (small apps, single language)

```jsx
import AuraPivot from "aura-pivot";
import en from "aura-pivot/locales/en.json";

<AuraPivot localization={en} locale="en" options={options} dataSource={rows} />;
```

### Per-instance overrides

```jsx
import AuraPivot, { mergeLocalization } from "aura-pivot";
import en from "aura-pivot/locales/en.json";

const localization = mergeLocalization(en, {
  grid: { grandTotal: "Overall Total" },
  aggregations: { sum: "Total" },
});

<AuraPivot
  localization={localization}
  locale="en"
  options={options}
  dataSource={rows}
/>;
```

`mergeLocalization(base, override)` does a shallow merge per top-level section.

### Lazy loading with i18next + i18next-http-backend

For apps that ship many languages or want to load translations on demand, wire `i18next` with `i18next-http-backend` and feed the loaded resource bundle into the `localization` prop.

1. Copy the JSON files you want to host (you can start from `node_modules/aura-pivot/dist/locales/{it,en}.json`) into your public folder, e.g. `public/locales/<lng>/pivot.json`. Add new languages by dropping new JSON files in the same shape.
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
import AuraPivot from "aura-pivot";

function PivotPanel(props) {
  const { i18n } = useTranslation("pivot");
  const localization = i18n.getResourceBundle(i18n.language, "pivot");
  return (
    <AuraPivot
      locale={i18n.language}
      localization={localization}
      options={props.options}
      dataSource={props.rows}
    />
  );
}
```

`changeLanguage('fr')` triggers a one-time HTTP fetch of `/locales/fr/pivot.json`; the component re-renders with the new dictionary automatically.

---

## Advanced: hooks

Use `usePivotMatrix(engine)` to read the computed matrix from sibling components outside the pivot. Grab the engine through the component ref:

```jsx
import AuraPivot, { usePivotMatrix } from "aura-pivot";

function MatrixStats({ engine }) {
  const { matrix, loading } = usePivotMatrix(engine);
  if (loading) return <span>Computing…</span>;
  return (
    <span>
      {matrix.rowLeaves.length} rows × {matrix.colLeaves.length} columns
    </span>
  );
}

function App() {
  const [engine, setEngine] = useState(null);

  return (
    <>
      <AuraPivot
        ref={(r) => setEngine(r?.engine ?? null)}
        options={options}
        dataSource={rows}
      />
      {engine && <MatrixStats engine={engine} />}
    </>
  );
}
```

`usePivotMatrix` subscribes to the engine's `dataChange`, `reportChange`, and `formatChange` events (via `useSyncExternalStore` — tear-free under React 18+ concurrent rendering) and returns `{ matrix, loading }`. Components sharing one engine share one snapshot and a single recompute. For datasets above 5 000 rows the recompute is deferred one macrotask so the loading indicator can paint first.

`PivotProvider` / `usePivot` are also exported for advanced composition. The provider takes a full context `value` of shape `{ engine, localization, locale, options, fullscreenRef, isFullscreen }` — it is the same context the pivot's internal components read.

---

## Compatibility notes

- React peer range is `>=18`. Library is developed against React 19 in devDependencies but does not use features unavailable on 18.
- MUI v9 is required. Components read `theme.font?.primary` and the ambient palette for theming — no hardcoded colors.
- `@emotion/react` and `@emotion/styled` are peer dependencies (required by MUI v9 styling engine).
- The `Measures` string is a reserved `uniqueName` used as a pseudo-field to control whether measures appear on rows or columns. Do not use it as a real field name in your dataset.
