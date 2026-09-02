# aura-pivot

A React pivot table that stays responsive when the dataset stops being small.

[![npm](https://img.shields.io/npm/v/aura-pivot.svg)](https://www.npmjs.com/package/aura-pivot)
[![CI](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml/badge.svg)](https://github.com/itsolutions-dev/AuraPivot/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aura-pivot.svg)](https://github.com/itsolutions-dev/AuraPivot/blob/master/LICENSE)

![A sales pivot table with region, category and product nested on the rows and quarters on the columns, totalling revenue, quantity and margin](https://raw.githubusercontent.com/itsolutions-dev/AuraPivot/master/docs/assets/aura-pivot.png)

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

- **Rows are virtualized.** The grid renders through react-virtuoso, so the DOM
  holds the visible window rather than the whole dataset — adding rows does not
  add nodes. Aggregation is a separate, main-thread cost; see
  [Limitations](#limitations).
- **Date fields expand themselves.** Give the pivot a date column and you get
  Year, Quarter, Month, Week, Day, Weekday, Hour and Minute as drillable
  levels, with month and weekday names in the user's language.
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
configuration by clicking and copy the resulting `options` object out. For the
surface that sits outside `options` — the full prop and ref API, the MUI theme
tokens the pivot reads, localization, and the public hooks — see the
[API reference](https://github.com/itsolutions-dev/AuraPivot/blob/master/docs/api-reference.md).

## Limitations

- Aggregation runs on the main thread. A dataset in the millions of rows will
  produce a visible pause on the first compute and on every slice change.
- There is no server-side aggregation mode. The pivot works on data you have
  already loaded into the browser.
- MUI v9 is a hard requirement, not an adapter. There is no headless build.

## Contributing

Bug reports with a reproduction get fixed. See
[CONTRIBUTING.md](https://github.com/itsolutions-dev/AuraPivot/blob/master/CONTRIBUTING.md) for the setup — note that this
repository has no dev server of its own. You see a change through a playground
that lives in the parent repository, which resolves this package by path, so
the clone has to sit inside it in a directory named `Library`. That is the one
non-obvious part.

## License

MIT © IT Solutions S.r.l.
