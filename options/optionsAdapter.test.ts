import { describe, expect, test } from 'vitest';
import PivotEngine from '../pivot-core';
import { optionsToEngine, engineToOptions } from './optionsAdapter';
import type { AuraPivotOptions } from '../pivot-core/types';

/**
 * The options round-trip IS the public API contract: hosts persist what
 * onOptionsChange emits and feed it back as the `options` prop. Two
 * guarantees matter:
 *   1. semantic preservation — nothing the host configured is lost;
 *   2. stability — emit(apply(emit(x))) === emit(apply(x)), so a host that
 *      clones/persists emissions can never drift or loop.
 */

const rows = [
  { callDate: '2024-03-15', agent: 'Alice', region: 'North', revenue: 1200, cost: 700 },
  { callDate: '2024-06-02', agent: 'Bob', region: 'South', revenue: 980, cost: 500 },
  { callDate: '2024-06-20', agent: 'Alice', region: 'South', revenue: 300, cost: 100 },
];

const richOptions = {
  toolbar: {
    visible: true,
    showFields: true,
    showFormat: false,
    showExport: true,
    showFullscreen: false,
  },
  layout: {
    measuresAxis: 'columns',
    enableDrillThrough: true,
    drillThroughStickyColumns: 2,
    totalsRowsPosition: 'after',
    alternateRows: true,
    density: 'Compact',
  },
  data: {
    fields: [
      {
        uniqueName: 'callDate',
        dataType: 'date',
        caption: 'Call Date',
        dateFormat: 'dd/MM/yyyy',
      },
      {
        uniqueName: 'agent',
        dataType: 'string',
        caption: 'Agent',
        showInDrillThrough: false,
      },
      {
        uniqueName: 'region',
        dataType: 'string',
        caption: 'Region',
        drillThroughOrder: 1,
      },
      { uniqueName: 'revenue', dataType: 'number', caption: 'Revenue' },
      { uniqueName: 'cost', dataType: 'number', caption: 'Cost' },
    ],
    calculatedFields: [
      { uniqueName: 'margin', caption: 'Margin', formula: 'sum("revenue") - sum("cost")' },
    ],
    dimensions: [
      { axis: 'row', uniqueName: 'agent' },
      { axis: 'column', uniqueName: 'region' },
    ],
    measures: [
      { uniqueName: 'revenue', aggregation: 'sum', hidden: false },
      { uniqueName: 'cost', aggregation: 'avg', hidden: true },
    ],
    filters: [{ uniqueName: 'agent', members: ['Alice', 'Bob'] }],
  },
  format: {
    conditionalMode: 'all',
    conditional: [
      { operator: 'gt', value: 1000, style: { backgroundColor: '#ffe' } },
    ],
    values: { numberOfDecimals: 2, textAlign: 'right' },
    valuesByMeasure: { 'revenue:sum': { currencySymbol: '€' } },
    headers: { fontWeight: 700 },
    dimensions: { textColor: '#333' },
    grandTotals: { backgroundColor: '#eee' },
  },
} as unknown as AuraPivotOptions;

const apply = (options: AuraPivotOptions | undefined) => {
  const engine = new PivotEngine();
  optionsToEngine(engine, options, rows);
  return engine;
};

// Assertions probe deep into the emitted schema; the runtime shape is the
// thing under test, so the static optionality of AuraPivotOptions only adds
// noise here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Emitted = any;

describe('options round-trip: semantic preservation', () => {
  const emitted = engineToOptions(apply(richOptions)) as Emitted;

  test('dimensions survive with their axes', () => {
    expect(emitted.data.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ axis: 'row', uniqueName: 'agent' }),
        expect.objectContaining({ axis: 'column', uniqueName: 'region' }),
      ])
    );
    expect(emitted.data.dimensions).toHaveLength(2);
  });

  test('measures survive including hidden flag and aggregation', () => {
    expect(emitted.data.measures).toEqual([
      { uniqueName: 'revenue', aggregation: 'sum', hidden: false },
      { uniqueName: 'cost', aggregation: 'avg', hidden: true },
    ]);
  });

  test('filters survive', () => {
    expect(emitted.data.filters).toEqual([
      { uniqueName: 'agent', members: ['Alice', 'Bob'] },
    ]);
  });

  test('calculated fields survive with formula', () => {
    expect(emitted.data.calculatedFields).toEqual([
      expect.objectContaining({
        uniqueName: 'margin',
        formula: 'sum("revenue") - sum("cost")',
      }),
    ]);
  });

  test('field captions, types, dateFormat and drill-through config survive', () => {
    const byName = Object.fromEntries(
      emitted.data.fields.map((f: { uniqueName: string }) => [f.uniqueName, f])
    );
    expect(byName.callDate).toMatchObject({
      dataType: 'date',
      caption: 'Call Date',
      dateFormat: 'dd/MM/yyyy',
    });
    expect(byName.agent).toMatchObject({ showInDrillThrough: false });
    expect(byName.region).toMatchObject({ drillThroughOrder: 1 });
    expect(byName.revenue).toMatchObject({ dataType: 'number' });
  });

  test('toolbar flags survive', () => {
    expect(emitted.toolbar).toMatchObject({
      visible: true,
      showFields: true,
      showFormat: false,
      showExport: true,
      showFullscreen: false,
    });
  });

  test('layout survives: measuresAxis, drill-through, totals, density', () => {
    expect(emitted.layout).toMatchObject({
      measuresAxis: 'columns',
      enableDrillThrough: true,
      drillThroughStickyColumns: 2,
      totalsRowsPosition: 'after',
      alternateRows: true,
      density: 'Compact',
    });
  });

  test('format sections and conditional rules survive', () => {
    expect(emitted.format.conditionalMode).toBe('all');
    expect(emitted.format.conditional).toEqual([
      expect.objectContaining({ operator: 'gt', value: 1000 }),
    ]);
    expect(emitted.format.values).toMatchObject({
      numberOfDecimals: 2,
      textAlign: 'right',
    });
    expect(emitted.format.valuesByMeasure['revenue:sum']).toMatchObject({
      currencySymbol: '€',
    });
    expect(emitted.format.headers).toMatchObject({ fontWeight: 700 });
    expect(emitted.format.grandTotals).toMatchObject({
      backgroundColor: '#eee',
    });
  });

  test('measuresAxis "rows" variant round-trips', () => {
    const opts = {
      ...richOptions,
      layout: { ...(richOptions.layout || {}), measuresAxis: 'rows' },
    } as unknown as AuraPivotOptions;
    const out = engineToOptions(apply(opts)) as Emitted;
    expect(out.layout.measuresAxis).toBe('rows');
  });
});

describe('options round-trip: stability (host echo contract)', () => {
  test('same engine: re-applying its own emission is a fixed point', () => {
    const engine = apply(richOptions);
    const first = engineToOptions(engine);
    // Host clones/persists the emission, then feeds it back (new reference,
    // so the seed-on-change guard does NOT short-circuit it).
    optionsToEngine(engine, JSON.parse(JSON.stringify(first)), rows);
    const second = engineToOptions(engine);
    expect(second).toEqual(first);
  });

  test('fresh engine: emissions are portable across instances', () => {
    const first = engineToOptions(apply(richOptions));
    const engine2 = new PivotEngine();
    optionsToEngine(engine2, first, rows);
    const second = engineToOptions(engine2);
    expect(second).toEqual(first);
  });

  test('grid-owned state (sort, expands) survives a prop re-apply', () => {
    const engine = apply(richOptions);
    engine.setSort('someColKey', 'asc', { uniqueName: 'revenue', aggregation: 'sum' });
    const sliceBefore = engine.getSlice();
    optionsToEngine(engine, JSON.parse(JSON.stringify(engineToOptions(engine))), rows);
    const sliceAfter = engine.getSlice();
    expect(sliceAfter.sort).toEqual(sliceBefore.sort);
    expect(sliceAfter.expands).toEqual(sliceBefore.expands);
  });
});

describe('options round-trip: degenerate inputs', () => {
  test('undefined options with plain rows still emits a coherent schema', () => {
    const engine = new PivotEngine();
    optionsToEngine(engine, undefined, rows);
    const out = engineToOptions(engine) as Emitted;
    // Fields inferred from the first data row.
    const names = out.data.fields.map((f: { uniqueName: string }) => f.uniqueName);
    expect(names).toEqual(
      expect.arrayContaining(['callDate', 'agent', 'region', 'revenue', 'cost'])
    );
    expect(out.data.measures).toEqual([]);
    // And the emission itself is stable.
    const engine2 = new PivotEngine();
    optionsToEngine(engine2, out, rows);
    expect(engineToOptions(engine2)).toEqual(out);
  });

  test('empty options object behaves like undefined', () => {
    const a = engineToOptions(apply(undefined));
    const b = engineToOptions(apply({} as AuraPivotOptions));
    expect(b).toEqual(a);
  });
});
