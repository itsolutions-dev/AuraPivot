// Enum constants for the `options` prop schema. Single source of truth for
// the runtime adapter (optionsAdapter.ts).

import type { AuraPivotOptions } from '../pivot-core/types';

export const DENSITIES = ['Compact', 'Standard', 'Comfortable'] as const;
export const TOTALS_POSITIONS = ['before', 'after', 'none'] as const;
export const MEASURES_AXES = ['rows', 'columns'] as const;
export const DIMENSION_AXES = ['row', 'column'] as const;
export const AGGREGATIONS = [
  'sum',
  'count',
  'distinctcount',
  'avg',
  'min',
  'max',
  'formula',
] as const;
export const OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
] as const;
export const CONDITIONAL_MODES = ['first', 'all'] as const;
export const DATA_TYPES = [
  'number',
  'string',
  'date',
  'time',
  'month',
] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

// Canonical default schema. A host may pass a partial object; the adapter
// treats missing branches as empty.
export const DEFAULT_OPTIONS: AuraPivotOptions = {
  toolbar: {
    visible: true,
    showFields: true,
    showFormat: true,
    showExport: true,
    showFullscreen: true,
  },
  layout: {
    showTitle: true,
    title: '',
    notes: '',
    density: 'Standard',
    alternateRows: false,
    enableDrillThrough: true,
    drillThroughStickyColumns: 2,
    totalsRowsPosition: 'before',
    totalsRowsSticky: false,
    totalsColumnsPosition: 'before',
    totalsColumnsSticky: false,
    measuresAxis: 'columns',
  },
  data: {
    fields: [],
    calculatedFields: [],
    dimensions: [],
    measures: [],
    filters: [],
  },
  format: {
    conditionalMode: 'first',
    conditional: [],
    values: {},
    valuesByMeasure: {},
    headers: {},
    dimensions: {},
    grandTotals: {},
  },
};
