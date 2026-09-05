// Runtime schema constants for the `options` prop.

import type { AuraPivotOptions } from '../pivot-core/types';

export const AGGREGATIONS = [
  'sum',
  'count',
  'distinctcount',
  'avg',
  'min',
  'max',
  'formula',
] as const;

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
