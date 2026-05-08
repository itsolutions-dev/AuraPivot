# `global` prop reference

Single configuration object passed to `<AuraPivot global={...} />`. Carries the dataset, layout (slice), display options, formatting, calculated fields, and toolbar wiring. A complete example lives in [`sample.json`](./sample.json).

```jsx
<AuraPivot
  global={{
    dataSource: { /* ... */ },
    options:    { /* ... */ },
  }}
/>
```

Top-level keys:

| Key                    | Type     | Required | Purpose                                                          |
| ---------------------- | -------- | -------- | ---------------------------------------------------------------- |
| `dataSource`           | `object` | yes      | Dataset in AuraPivot `[metadata, ...rows]` shape.                |
| `options`              | `object` | no       | Grid / toolbar / sorting / format / slice / fields wiring.       |

---

## 1. `dataSource`

```jsonc
{
  "dataSourceType": "json",
  "data": [ metadataRow, ...dataRows ]
}
```

| Field             | Type     | Description                                                                                                                                            |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataSourceType`  | `string` | Always `"json"`. Carried for AuraPivot round-tripping; the engine ignores it.                                                                          |
| `data`            | `array`  | First element is the metadata row `{ <field>: { type, caption } }`. Remaining elements are flat data rows. If the metadata row is missing it is synthesized from the first data row. |

### Field types

| `type`     | Treated as                                                  |
| ---------- | ----------------------------------------------------------- |
| `string`   | Dimension                                                   |
| `number`   | Measure candidate (sum / count / avg / …)                   |
| `date`     | Triggers automatic hierarchy expansion (Year / Quarter / Month / Week / Day / Weekday / Hour / Minute virtual fields) |
| `time`     | Time of day                                                 |
| `month`    | Month label                                                 |
| `weekday`  | Weekday label                                               |

---

## 2. `options`

All sub-keys are optional. Engine defaults shown.

```jsonc
{
  "grid":               { "type": "compact", "showHeaders": false },
  "sorting":            "columns",
  "enableDrillThrough": true,
  "toolbar":            { "visible": true, "showFields": true, ... },
  "fields":             [ /* caption overrides */ ],
  "calculatedFields":   [ /* derived measures */ ],
  "formats":            { /* see §2.5 */ },
  "slides":             { /* slice — see §2.6 */ }
}
```

### 2.1 `options.grid`

Controls the rendered grid mode.

| Field          | Type      | Default     | Description                                                       |
| -------------- | --------- | ----------- | ----------------------------------------------------------------- |
| `type`         | `string`  | `"compact"` | Grid layout. Only `"compact"` is implemented currently.           |
| `showHeaders`  | `boolean` | `false`     | When `true`, renders dimension-name headers above the column tree. |

### 2.2 `options.sorting`

`"columns" | "rows" | "none"` — default `"columns"`. Picks the axis along which the user can sort by clicking value-cell headers.

### 2.3 `options.enableDrillThrough`

`boolean` — default `true`. Toggles the click handler that opens `DrillThroughDialog` with the underlying source rows of a value cell. Set to `false` to disable.

### 2.4 `options.toolbar`

Toolbar visibility flags.

| Field             | Type      | Default | Description                                                                          |
| ----------------- | --------- | ------- | ------------------------------------------------------------------------------------ |
| `visible`         | `boolean` | `true`  | Hide/show the entire toolbar (read by `AuraPivot.jsx`).                              |
| `showFields`      | `boolean` | `true`  | Show the **Fields** tab (`wdr-tab-fields`).                                          |
| `showFormat`      | `boolean` | `true`  | Show the **Format** tab (`wdr-tab-format`).                                          |
| `showExport`      | `boolean` | `true`  | Show the **Export** tab (`wdr-tab-export`).                                          |
| `showFullscreen`  | `boolean` | `true`  | Show the **Fullscreen** tab (`wdr-tab-fullscreen`).                                  |
| `showReset`       | `boolean` | `true`  | Show consumer-injected reset buttons (`reset-*` ids — wired via `beforeToolbarCreated`). |

### 2.5 `options.fields`

Two distinct shapes — the engine branches on the JS type:

- **Array** `[{ uniqueName, caption }]` — caption overrides for data fields (and calculated fields). Missing entries leave the data-source caption untouched. Forwarded via `engine.setFields(...)`.
- **Boolean** — legacy shorthand routed to the toolbar visibility flag for the Fields tab. Prefer `options.toolbar.showFields` for new code.

### 2.6 `options.calculatedFields`

```jsonc
[
  {
    "uniqueName": "avgRevenuePerCall",
    "caption":    "Avg revenue / call",
    "formula":    "sum(\"revenue\") / count(\"revenue\")"
  }
]
```

| Field        | Type     | Description                                                                       |
| ------------ | -------- | --------------------------------------------------------------------------------- |
| `uniqueName` | `string` | Stable id used inside `slides.measures[].uniqueName`.                             |
| `caption`    | `string` | Display caption.                                                                  |
| `formula`    | `string` | Expression. Aggregation calls: `sum("field")`, `count(...)`, `distinctcount(...)`, `avg(...)`, `min(...)`, `max(...)`. Arithmetic: `+ - * /` and parentheses. |

To use a calculated field as a measure, add it to `slides.measures` with `aggregation: "formula"`.

### 2.7 `options.formats`

Style baseline plus conditional rules. Pushed via `engine.setFormat(...)`. Aliased: `general` is accepted as a synonym of `values` for back-compat (read paths expose both).

```jsonc
{
  "values":           { /* default cell style + number format */ },
  "valuesByMeasure":  { "<measureKey>": { /* per-measure overrides */ } },
  "headers":          { /* column-header style */ },
  "dimensions":       { /* row-dimension cell style */ },
  "grandTotals":      { /* grand-total row/col style */ },
  "layout":           { "totalsRowsPosition": "before", "totalsColumnsPosition": "before", "alternateRows": false },
  "conditional":      [ /* ordered list of rules */ ],
  "conditionalMode":  "first"
}
```

#### `formats.values` / `valuesByMeasure[<measureKey>]`

`<measureKey>` is `<uniqueName>:<aggregation>` (e.g. `revenue:sum`). Per-measure entries override `values` for that single measure.

| Field                | Type             | Default     | Description                                                          |
| -------------------- | ---------------- | ----------- | -------------------------------------------------------------------- |
| `fontFamily`         | `string`         | `"inherit"` | Cell font family.                                                    |
| `fontSize`           | `number`         | `13`        | Pixel size.                                                          |
| `fontWeight`         | `number\|string` | `400`       | CSS font-weight.                                                     |
| `italic`             | `boolean`        | `false`     | Italic toggle.                                                       |
| `textColor`          | `string\|null`   | `null`      | Hex color or `null` for theme default.                               |
| `backgroundColor`    | `string\|null`   | `null`      | Hex color or `null`.                                                 |
| `textAlign`          | `string`         | `"right"`   | `"left" \| "center" \| "right"`.                                     |
| `thousandSeparator`  | `string`         | `"System"`  | `"System" \| "." \| "," \| " " \| "None"`.                           |
| `decimalSeparator`   | `string`         | `"System"`  | `"System" \| "." \| ","`.                                            |
| `numberOfDecimals`   | `number\|string` | `"Default"` | Integer or `"Default"` (browser locale).                             |
| `currencySymbol`     | `string`         | `"None"`    | Currency glyph or `"None"`. Use `"Other"` together with `currencyOther`. |
| `currencyOther`      | `string`         | `""`        | Free-text symbol used when `currencySymbol === "Other"`.             |
| `currencyAlignment`  | `string`         | `"Left"`    | `"Left" \| "Right"`.                                                 |
| `nullValue`          | `string`         | `""`        | Replacement for null/empty cells.                                    |
| `percentage`         | `boolean`        | `false`     | Render as percentage.                                                |

#### `formats.headers` / `formats.dimensions` / `formats.grandTotals`

Same shape as `values` but only the typographic + color subset (`fontFamily`, `fontSize`, `fontWeight`, `italic`, `textColor`, `backgroundColor`, `textAlign`).

#### `formats.layout`

| Field                    | Type      | Default    | Description                                       |
| ------------------------ | --------- | ---------- | ------------------------------------------------- |
| `totalsRowsPosition`     | `string`  | `"before"` | `"before" \| "after"` — total rows above or below children. |
| `totalsColumnsPosition`  | `string`  | `"before"` | Same for column totals.                           |
| `alternateRows`          | `boolean` | `false`    | Zebra striping.                                   |

Layout changes invalidate the cached matrix (re-computation on next `processMatrix()`).

#### `formats.conditional[]`

Ordered list. Each rule:

| Field         | Type           | Description                                                                                        |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `id`          | `string`       | Stable id (UI uses it for drag-reorder + react keys).                                              |
| `measure`     | `string\|null` | `<measureKey>` to scope to a single measure, or `null`/omitted for "all measures".                 |
| `operator`    | `string`       | `gt \| gte \| lt \| lte \| eq \| neq \| between \| expression` (legacy: `equals`, `startsWith`, `endsWith`, `contains` for string dims). |
| `valueKind`   | `string`       | `"const"` (numeric literal) or `"measure"` (compare against another measure value).                |
| `value`       | `number`       | Constant operand.                                                                                  |
| `valueRef`    | `string`       | Used when `valueKind === "measure"` — `<measureKey>` of the right-hand side.                       |
| `value2Kind`  | `string`       | Same shape as `valueKind`, for `between` rules.                                                    |
| `value2`      | `number`       | Upper bound when `operator === "between"`.                                                         |
| `value2Ref`   | `string`       | `<measureKey>` for the upper bound when measure-compared.                                          |
| `expression`  | `object`       | Compound rule: `{ join: "and"|"or", clauses: [{ kind, operator, ... }] }`.                         |
| `style`       | `object`       | `{ textColor?, backgroundColor?, fontWeight?, italic? }`.                                          |

#### `formats.conditionalMode`

`"first" | "all"` — default `"first"`. `first` stops at the first matching rule; `all` merges every match (later rules overwrite earlier ones for overlapping style keys).

### 2.8 `options.slides` (slice / report layout)

Defines what is on rows, columns, measures, plus filters, expansion state, and sort. Passed to `engine.setSlice(slice, { silent: true })` so prop-driven changes do **not** re-emit `reportChange`.

```jsonc
{
  "rows":     [ { "uniqueName": "callDate.Year" } ],
  "columns":  [ { "uniqueName": "agentName" }, { "uniqueName": "Measures" } ],
  "measures": [ { "uniqueName": "revenue", "aggregation": "sum" } ],
  "filters":  [ { "uniqueName": "country", "members": ["IT", "FR"] } ],
  "expands":  { "expandAll": true, "expandedMembers": [] },
  "sort":     { "colKey": "...", "colDirection": "desc", "colMeasure": "revenue:sum" }
}
```

#### `slides.rows[]` / `slides.columns[]`

Each entry: `{ uniqueName, caption?, sort? }`.

- `uniqueName` is a real field name, a virtual date sub-field (`callDate.Year`, `callDate.Month`, …), **or** the reserved string `"Measures"` (pseudo-field that places the measures axis on rows / columns).
- `sort`: `"asc" | "desc" | "none"` — default field-level sort direction.

#### `slides.measures[]`

| Field                    | Type     | Description                                                                                              |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `uniqueName`             | `string` | Field name (or calculated-field id).                                                                     |
| `aggregation`            | `string` | `sum \| count \| distinctcount \| avg \| min \| max \| ratioTotal \| currentRatio \| formula`.           |
| `caption`                | `string` | Optional override for the measure caption (otherwise the `grid.measureCaptionTemplate` produces it).     |
| `availableAggregations`  | `string[]` | Optional whitelist of aggregations the user may pick in the field-list dialog.                         |

Derived aggregations: `ratioTotal` (% of grand total), `currentRatio` (% of parent subtotal), `formula` (calculated field).

#### `slides.filters[]`

Each entry is `{ uniqueName, ...predicates }`. Multiple predicates on the same entry are AND-combined; multiple filters on the same field also AND.

| Predicate     | Shape                       | Effect                                              |
| ------------- | --------------------------- | --------------------------------------------------- |
| `members`     | `string[]`                  | Whitelist of allowed values.                        |
| `exclude`     | `string[]`                  | Blacklist of forbidden values.                      |
| `value`       | `string\|number`            | Strict equality.                                    |
| `range`       | `{ min?, max? }`            | Numeric / date range, inclusive.                    |
| `search`      | `string`                    | Case-insensitive substring match.                   |

#### `slides.expands`

| Field             | Type       | Default | Description                                                                |
| ----------------- | ---------- | ------- | -------------------------------------------------------------------------- |
| `expandAll`       | `boolean`  | `true`  | Default expansion state of every node.                                     |
| `expandedMembers` | `string[]` | `[]`    | Per-key exception list (toggled relative to `expandAll`).                  |

#### `slides.sort`

Dual-axis sort. Both column and row axes can be sorted simultaneously:

| Field            | Type            | Description                                                |
| ---------------- | --------------- | ---------------------------------------------------------- |
| `colKey`         | `string`        | Column-tree node key sorted on (e.g. `agentName\|Alice`).  |
| `colDirection`   | `"asc"\|"desc"` | Direction.                                                 |
| `colMeasure`     | `string\|null`  | `<measureKey>` to sort by, or `null` for sum of measures.  |
| `rowKey`         | `string`        | Row-tree node key.                                         |
| `rowDirection`   | `"asc"\|"desc"` | Direction.                                                 |
| `rowMeasure`     | `string\|null`  | Measure key.                                               |

Legacy reports with `{ colKey, direction, measure }` are auto-migrated to the dual-axis shape on load.

---

## 3. Round-tripping with `getReport()` / `setReport()`

`ref.current.auraPivot.getReport()` returns a serializable snapshot whose `dataSource.data` round-trips in the same `[metadata, ...rows]` shape. The same object can be passed back into `setReport(report)` to restore state. `setReport` does **not** emit `reportChange` — it is safe to call it from inside a `reportChange` listener.

Note that `getReport()` returns `slice` / `options` / `formats` / `calculatedFields` / `dateFormats` at the **report root**, not nested under `options.slides` / `options.formats`. The `global` prop accepts the nested wiring for ergonomic JSX configuration; the report shape is the auraPivot-compatible flat layout.

---

## 4. See also

- [`sample.json`](./sample.json) — full example consuming every documented key.
- [`README.md`](./README.md) — top-level package docs (props, theming, localization).
- `pivot-core/PivotEngine.js` — defaults are at the top of the file (`DEFAULT_OPTIONS`, `DEFAULT_VALUES_FORMAT`, …).
