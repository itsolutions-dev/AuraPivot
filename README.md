# aurapivot

A React pivot table that stays responsive when the dataset stops being small.

[![npm](https://img.shields.io/npm/v/aurapivot.svg)](https://www.npmjs.com/package/aurapivot)
[![CI](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml/badge.svg)](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aurapivot.svg)](https://github.com/itsolutions-dev/AuraPivot/blob/master/LICENSE)

![A sales pivot table with region, category and product nested on the rows and quarters on the columns, totalling revenue, quantity and margin](https://raw.githubusercontent.com/itsolutions-dev/AuraPivot/master/docs/assets/aura-pivot.png)

**[Live playground](https://aurapivot.dev)** · **[Documentation](https://docs.aurapivot.dev)** · **[API reference](docs/api-reference.md)**

## Install

```bash
npm install aurapivot
npm install react react-dom @mui/material @emotion/react @emotion/styled
```

The second line is peer dependencies. If you are already using MUI — and the
reason to pick this library is usually that you are — you have them.

## Quickstart

```jsx
import { useState } from "react";
import AuraPivot from "aurapivot";

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

That is a working pivot with a toolbar, a field list, filtering, sorting,
drill-through and Excel export. `onOptionsChange` hands you the full
configuration back every time the user changes something, so persisting a
report is `JSON.stringify` and restoring it is passing the object back in.

## Examples

### Drill through time you never modelled

Your table has one flat `date` column. You want Year → Quarter, without adding
a single column to your dataset:

```js
const options = {
  data: {
    fields: [
      { uniqueName: "orderDate", dataType: "date", caption: "Order date" },
      { uniqueName: "country", dataType: "string", caption: "Country" },
      { uniqueName: "revenue", dataType: "number", caption: "Revenue" },
    ],
    dimensions: [
      { axis: "row", uniqueName: "orderDate.Year" },
      { axis: "row", uniqueName: "orderDate.Quarter" },
      { axis: "column", uniqueName: "country" },
    ],
    measures: [{ uniqueName: "revenue", aggregation: "sum" }],
  },
};
```

Typing a field as `date` generates eight virtual levels — `.Year`, `.Quarter`,
`.Month`, `.Week`, `.Day`, `.Weekday`, `.Hour`, `.Minute` — with month and
weekday names in the user's language. They show up in the field list like any
other field, so the user can nest and reorder them by dragging.

### A margin column that never reaches `eval()`

Calculated fields are strings, and strings that turn into code are usually
where a Content-Security-Policy conversation starts. Not here: formulas go
through a hand-written tokenizer and AST walker, so the library runs under a
`script-src` that forbids `unsafe-eval`.

```js
data: {
  // …fields as above, plus a `cost` field
  calculatedFields: [
    {
      uniqueName: "marginPct",
      caption: "Margin %",
      formula:
        'IF(sum("revenue") == 0, 0, (sum("revenue") - sum("cost")) / sum("revenue") * 100)',
    },
  ],
  measures: [
    { uniqueName: "revenue", aggregation: "sum" },
    { uniqueName: "marginPct", aggregation: "formula" }, // ← formula, not sum
  ],
}
```

The expression is re-evaluated at every row/column intersection against that
cell's own aggregates, so the margin is right on subtotals and grand totals
too — not an average of averages. `IF`, `ABS`, `MIN`, `MAX`, the `AND`/`OR`
keywords and `^` are part of the grammar, and a bare field name is shorthand
for `sum("field")`.

### Make the bad numbers look bad

```js
format: {
  conditionalMode: "first", // "first": first matching rule wins. "all": layer them.
  conditional: [
    {
      id: "loss",
      measure: "marginPct:formula", // "<uniqueName>:<aggregation>"
      operator: "lt",
      value: 0,
      style: {
        textColor: "#ffffff",
        backgroundColor: "#b3261e",
        fontWeight: 700,
      },
    },
    {
      id: "thin",
      measure: "marginPct:formula",
      operator: "between",
      value: 0,
      value2: 15, // required by `between`
      style: { textColor: "#8a5a00", italic: true },
    },
  ],
}
```

Operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte` and `between`. The same
rules are what the built-in Format dialog writes, so anything a user sets by
clicking comes back to you through `onOptionsChange` in exactly this shape.

### A saved report is just JSON

```jsx
function SavedReport({ reportId, rows }) {
  const [options, setOptions] = useState(null);

  useEffect(() => {
    fetch(`/api/reports/${reportId}`)
      .then((r) => r.json())
      .then(setOptions);
  }, [reportId]);

  if (!options) return null;

  return (
    <AuraPivot
      height={600}
      options={options}
      dataSource={rows}
      onOptionsChange={(next) => {
        setOptions(next);
        fetch(`/api/reports/${reportId}`, {
          method: "PUT",
          body: JSON.stringify(next),
        });
      }}
    />
  );
}
```

`options` is applied **seed-on-change** — re-read only when the object
_reference_ changes — and feeding back the object `onOptionsChange` just gave
you is a no-op. There is no render loop to guard against, which is why the
snippet above can be this short.

### Your own KPIs, computed by the pivot

The engine is a plain TypeScript object with an event bus, and `usePivotMatrix`
subscribes to it. A sibling component can read the same computed matrix without
triggering a second aggregation pass:

```jsx
import { useState } from "react";
import AuraPivot, { usePivotMatrix } from "aurapivot";

function MatrixStats({ engine }) {
  const { matrix, loading } = usePivotMatrix(engine);
  if (loading || !matrix) return <span>Computing…</span>;
  return (
    <span>
      {matrix.rowLeaves.length} rows × {matrix.colLeaves.length} columns
    </span>
  );
}

function Dashboard({ options, rows }) {
  const [engine, setEngine] = useState(null);

  return (
    <>
      {engine && <MatrixStats engine={engine} />}
      <AuraPivot
        ref={(r) => setEngine(r?.engine ?? null)}
        options={options}
        dataSource={rows}
      />
    </>
  );
}
```

Every consumer of one engine shares a single snapshot and a single recompute,
through `useSyncExternalStore` — tear-free under React 18+ concurrent
rendering.

### It already speaks English, and it will speak yours

```jsx
import AuraPivot, { mergeLocalization } from "aurapivot";
import it from "aurapivot/locales/it.json";

<AuraPivot
  locale="it-IT"
  localization={mergeLocalization(it, {
    grid: { grandTotal: "Totale complessivo" },
  })}
  options={options}
  dataSource={rows}
/>;
```

Omit both props and everything still renders in English: the fallbacks live in
the code, not in a dictionary you have to remember to ship. `locale` is a
BCP-47 tag threaded through every `Intl` call — number formatting, date
formatting and string collation all follow it.

## What you get

- **Rows are virtualized.** The grid renders through react-virtuoso, so the DOM
  holds the visible window rather than the whole dataset — adding rows does not
  add nodes. Aggregation is a separate, main-thread cost; see
  [Limitations](#limitations).
- **Date fields expand themselves.** Eight drillable levels from one column,
  localized.
- **Calculated fields without `eval`.** A tokenizer and an AST evaluator, so a
  strict CSP is not a blocker.
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

The [documentation site](https://docs.aurapivot.dev) covers every key of the
`options` schema, with screenshots for a growing subset of them. The
[playground](https://aurapivot.dev) lets you build a configuration by clicking
and copy the resulting `options` object out.

In this repository:

- [docs/api-reference.md](docs/api-reference.md) — props, ref API, data shapes,
  theme tokens, localization and the public hooks
- [docs/options-guide.en.md](docs/options-guide.en.md) — every key of the
  `options` object ([italiano](docs/options-guide.it.md))

## Limitations

- Aggregation runs on the main thread. A dataset in the millions of rows will
  produce a visible pause on the first compute and on every slice change.
- There is no server-side aggregation mode. The pivot works on data you have
  already loaded into the browser.
- MUI v9 is a hard requirement, not an adapter. There is no headless build.

## Contributing

Bug reports with a reproduction get fixed. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the checks CI runs, and the
changeset every user-visible change needs.

## License

[MIT](LICENSE).
