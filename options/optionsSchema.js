// Enum constants for the `options` prop schema. Single source of truth for
// both the runtime adapter (optionsAdapter.js) and the PropTypes validator
// (optionsPropType.js).

export const DENSITIES = ["Compact", "Standard", "Comfortable"];
export const TOTALS_POSITIONS = ["before", "after", "none"];
export const MEASURES_AXES = ["rows", "columns"];
export const DIMENSION_AXES = ["row", "column"];
export const AGGREGATIONS = [
  "sum",
  "count",
  "distinctcount",
  "avg",
  "min",
  "max",
  "formula",
];
export const OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "between"];
export const CONDITIONAL_MODES = ["first", "all"];
export const DATA_TYPES = ["number", "string", "date", "time", "month"];
export const TEXT_ALIGNS = ["left", "center", "right"];

// Canonical default schema. A host may pass a partial object; the adapter
// treats missing branches as empty.
export const DEFAULT_OPTIONS = {
  toolbar: {
    visible: true,
    showFields: true,
    showFormat: true,
    showExport: true,
    showFullscreen: true,
  },
  layout: {
    showTitle: true,
    title: "",
    notes: "",
    density: "Standard",
    alternateRows: false,
    enableDrillThrough: true,
    drillThroughStickyColumns: 2,
    totalsRowsPosition: "before",
    totalsRowsSticky: false,
    totalsColumnsPosition: "before",
    totalsColumnsSticky: false,
    measuresAxis: "columns",
  },
  data: {
    fields: [],
    calculatedFields: [],
    dimensions: [],
    measures: [],
    filters: [],
  },
  format: {
    conditionalMode: "first",
    conditional: [],
    values: {},
    valuesByMeasure: {},
    headers: {},
    dimensions: {},
    grandTotals: {},
  },
};
