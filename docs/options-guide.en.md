# AuraPivot — `options` prop guide

`<AuraPivot>` is configured through three props:

| Prop | Type | Purpose |
|---|---|---|
| `dataSource` | `Array<object>` | The data — a plain array of row objects. |
| `options` | `object` | The full configuration (see below). |
| `onOptionsChange` | `(nextOptions) => void` | Fired after every in-component edit. |

`options` and `dataSource` are split on purpose: `dataSource` is the rows,
`options.data.fields` is the schema for those rows.

## Apply model — seed-on-change

`options` is re-applied to the table **only when its object reference
changes**. Re-rendering the host with the same `options` object preserves
edits the user made inside the table. To push a new configuration, pass a new
object.

```jsx
const [options, setOptions] = useState(initialOptions);

<AuraPivot
  dataSource={rows}
  options={options}
  onOptionsChange={setOptions}
/>;
```

Feeding `onOptionsChange` straight back into `options` is safe — the component
recognises its own emitted object and does not re-apply it.

## Schema

### `toolbar`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `visible` | boolean | `true` | Master on/off for the whole toolbar. |
| `showFields` | boolean | `true` | Show the Fields tab. |
| `showFormat` | boolean | `true` | Show the Format tab. |
| `showExport` | boolean | `true` | Show the Export tab. |
| `showFullscreen` | boolean | `true` | Show the Fullscreen button. |

### `layout`

| Key | Type | Allowed / Default | Meaning |
|---|---|---|---|
| `showTitle` | boolean | `true` | Render the title bar. |
| `title` | string | `""` | Title text. |
| `notes` | string | `""` | Footer note text. |
| `density` | string | `Compact` \| `Standard` \| `Comfortable` | Row height. |
| `alternateRows` | boolean | `false` | Zebra striping. |
| `enableDrillThrough` | boolean | `true` | Allow data-cell drill-through. |
| `drillThroughStickyColumns` | integer ≥ 0 | `2` | Left-pinned columns in the drill-through table. |
| `totalsRowsPosition` | string | `before` \| `after` \| `none` | Grand-total row placement. |
| `totalsRowsSticky` | boolean | `false` | Pin grand-total rows on scroll. |
| `totalsColumnsPosition` | string | `before` \| `after` \| `none` | Grand-total column placement. |
| `totalsColumnsSticky` | boolean | `false` | Pin grand-total columns on scroll. |
| `measuresAxis` | string | `rows` \| `columns` | Axis the measures sit on. |

### `data.fields` — the dataset schema

One entry per source column.

| Key | Type | Meaning |
|---|---|---|
| `fieldName` | string | Original column name in `dataSource`. |
| `uniqueName` | string (required) | Identifier referenced by dimensions/measures/filters. |
| `dataType` | `number` \| `string` \| `date` \| `time` \| `month` | Column type. |
| `caption` | string | Display label. |
| `showInDrillThrough` | boolean | Include the field in the drill-through table. |
| `drillThroughOrder` | number | Field position (also the drill-through column order). |
| `dateFormat` | string \| null | Date format token (date fields only). |

### `data.calculatedFields`

| Key | Type | Meaning |
|---|---|---|
| `uniqueName` | string (required) | Identifier. |
| `caption` | string | Display label. |
| `formula` | string (required) | Formula, e.g. `IF(callCount == 0, null, answeredCallCount/callCount)`. |

### `data.dimensions`

| Key | Type | Meaning |
|---|---|---|
| `axis` | `row` \| `column` (required) | Which axis the dimension sits on. |
| `uniqueName` | string (required) | Field identifier. |
| `fieldSort` | object \| null | Member sort descriptor. |

### `data.measures`

| Key | Type | Meaning |
|---|---|---|
| `uniqueName` | string (required) | Field or calculated-field identifier. |
| `aggregation` | `sum` \| `count` \| `distinctcount` \| `avg` \| `min` \| `max` \| `formula` | Aggregation. Use `formula` for calculated fields. |
| `hidden` | boolean | Hide the measure from the grid. |

### `data.filters`

One entry per filtered field. Provide **exactly one** of `members`, `value`,
`range`.

| Key | Type | Meaning |
|---|---|---|
| `uniqueName` | string (required) | Field identifier. |
| `members` | array | Keep only these member values. |
| `value` | any | Keep only this single value. |
| `range` | `{ min, max }` | Keep values within the range. |

### `format`

| Key | Type | Meaning |
|---|---|---|
| `conditionalMode` | `first` \| `all` | Apply the first matching rule, or all. |
| `conditional` | array | Conditional-format rules (below). |
| `values` | object | Number-cell font / number / colour settings. |
| `valuesByMeasure` | object | Per-measure overrides, keyed `"<uniqueName>:<aggregation>"`. |
| `headers` | object | Column-header style. |
| `dimensions` | object | Row-label style. |
| `grandTotals` | object | Grand-total style. |

A `conditional` rule:

| Key | Type | Meaning |
|---|---|---|
| `id` | string | Stable rule id. |
| `measure` | string | Target measure key `"<uniqueName>:<aggregation>"`. |
| `operator` | `eq` \| `ne` \| `gt` \| `gte` \| `lt` \| `lte` \| `between` | Comparison. |
| `value` | number | Comparison value. |
| `value2` | number | Upper bound — **required** when `operator` is `between`. |
| `style` | object | `{ textColor, backgroundColor, fontWeight, italic }`. Colours are `#RRGGBB` or `null`. |

## Reading edits back out

```jsx
function handleChange(next) {
  // `next` is the complete, updated options object.
  saveToServer(next);
  setOptions(next);
}

<AuraPivot dataSource={rows} options={options} onOptionsChange={handleChange} />;
```

`ref.auraPivot.getOptions()` pulls the current schema on demand.
