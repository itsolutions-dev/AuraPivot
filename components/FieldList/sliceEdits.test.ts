import { describe, expect, test } from 'vitest';
import type React from 'react';
import {
  DRAG_TYPE,
  applyZoneDrop,
  ensureMeasuresAnchor,
  readDragPayload,
  stripFromSlice,
} from './sliceEdits';
import type { FieldLookup } from './sliceEdits';
import type { LocalSlice } from './types';

const dragEvent = (data: Record<string, string>) =>
  ({
    dataTransfer: { getData: (type: string) => data[type] ?? '' },
  }) as unknown as React.DragEvent;

describe('readDragPayload', () => {
  const read = (payload: unknown) =>
    readDragPayload(dragEvent({ [DRAG_TYPE]: JSON.stringify(payload) }));

  test('accepts palette and zone payloads', () => {
    expect(read({ source: 'all', uniqueName: 'a' })).toEqual({
      source: 'all',
      uniqueName: 'a',
    });
    expect(read({ source: 'rows', uniqueName: 'a', idx: 2 })).toEqual({
      source: 'rows',
      uniqueName: 'a',
      idx: 2,
    });
  });

  test.each([
    ['another MIME type', dragEvent({ 'text/plain': '{"source":"all"}' })],
    ['invalid JSON', dragEvent({ [DRAG_TYPE]: '{' })],
  ])('ignores %s', (_, event) => {
    expect(readDragPayload(event)).toBeNull();
  });

  test.each([
    { source: '__proto__', uniqueName: 'a', idx: 0 },
    { source: 'expands', uniqueName: 'a', idx: 0 },
    { source: 'rows', uniqueName: 'a', idx: -1 },
    { source: 'rows', uniqueName: 'a', idx: 1.5 },
    { source: 'rows', uniqueName: 'a' },
    { source: 'all', uniqueName: 42 },
  ])('rejects %j', (payload) => {
    expect(read(payload)).toBeNull();
  });
});

describe('applyZoneDrop', () => {
  const lookup: FieldLookup = {
    isKnownField: (name) => ['region', 'agent', 'amount'].includes(name),
    allowedAggsFor: () => ['sum', 'count'],
    isCalculated: () => false,
  };
  const slice: LocalSlice = {
    rows: [{ uniqueName: 'region' }, { uniqueName: 'agent' }],
    columns: [{ uniqueName: 'Measures' }],
    measures: [{ uniqueName: 'amount', aggregation: 'sum' }],
    filters: [{ uniqueName: 'agent', members: ['Ann'] }],
  };

  test('a palette field joins a zone and leaves the other axis', () => {
    const next = applyZoneDrop(
      slice,
      'columns',
      { source: 'all', uniqueName: 'region' },
      null,
      lookup,
    );
    expect(next?.rows).toEqual([{ uniqueName: 'agent' }]);
    expect(next?.columns?.map((f) => f.uniqueName)).toEqual([
      'Measures',
      'region',
    ]);
  });

  test('moving down within a zone lands before the target', () => {
    const three: LocalSlice = {
      rows: [{ uniqueName: 'a' }, { uniqueName: 'b' }, { uniqueName: 'c' }],
    };
    const next = applyZoneDrop(
      three,
      'rows',
      { source: 'rows', uniqueName: 'a', idx: 0 },
      2,
      { ...lookup, isKnownField: () => true },
    );
    expect(next?.rows?.map((f) => f.uniqueName)).toEqual(['b', 'a', 'c']);
  });

  test('a field dropped on Values takes the first unused aggregation', () => {
    const next = applyZoneDrop(
      slice,
      'measures',
      { source: 'all', uniqueName: 'amount' },
      null,
      lookup,
    );
    expect(next?.measures).toEqual([
      { uniqueName: 'amount', aggregation: 'sum' },
      { uniqueName: 'amount', aggregation: 'count' },
    ]);
    // With every aggregation in use, the drop does nothing.
    expect(
      applyZoneDrop(
        next!,
        'measures',
        { source: 'all', uniqueName: 'amount' },
        null,
        lookup,
      ),
    ).toBeNull();
  });

  test('a measures reorder keeps the entry as it is', () => {
    const two: LocalSlice = {
      measures: [
        { uniqueName: 'amount', aggregation: 'sum' },
        { uniqueName: 'amount', aggregation: 'count', hidden: true },
      ],
    };
    const next = applyZoneDrop(
      two,
      'measures',
      { source: 'measures', uniqueName: 'amount', idx: 1 },
      0,
      lookup,
    );
    expect(next?.measures).toEqual([
      { uniqueName: 'amount', aggregation: 'count', hidden: true },
      { uniqueName: 'amount', aggregation: 'sum' },
    ]);
  });

  test('a field dragged onto Filters keeps its existing predicate', () => {
    const next = applyZoneDrop(
      slice,
      'filters',
      { source: 'rows', uniqueName: 'agent', idx: 1 },
      null,
      lookup,
    );
    expect(next?.filters).toEqual([{ uniqueName: 'agent', members: ['Ann'] }]);
    expect(next?.rows).toEqual([{ uniqueName: 'region' }]);
  });

  test.each([
    ['an unknown palette field', { source: 'all', uniqueName: 'nope' }],
    [
      'a chip index holding another field',
      { source: 'rows', uniqueName: 'agent', idx: 0 },
    ],
    [
      'the Measures anchor',
      { source: 'columns', uniqueName: 'Measures', idx: 0 },
    ],
  ] as const)('ignores %s', (_, payload) => {
    expect(applyZoneDrop(slice, 'rows', payload, null, lookup)).toBeNull();
  });
});

describe('stripFromSlice / ensureMeasuresAnchor', () => {
  test('stripping removes a field from every zone', () => {
    const next = stripFromSlice(
      {
        rows: [{ uniqueName: 'a' }],
        columns: [{ uniqueName: 'a' }, { uniqueName: 'b' }],
        measures: [{ uniqueName: 'a', aggregation: 'sum' }],
        filters: [{ uniqueName: 'a' }],
      },
      'a',
    );
    expect(next).toEqual({
      rows: [],
      columns: [{ uniqueName: 'b' }],
      measures: [],
      filters: [],
    });
  });

  test('the anchor is added once, on the requested axis', () => {
    expect(ensureMeasuresAnchor({ rows: [] }, 'rows').rows).toEqual([
      { uniqueName: 'Measures' },
    ]);
    expect(ensureMeasuresAnchor({}, undefined).columns).toEqual([
      { uniqueName: 'Measures' },
    ]);
    const anchored: LocalSlice = { columns: [{ uniqueName: 'Measures' }] };
    expect(ensureMeasuresAnchor(anchored, 'rows')).toBe(anchored);
  });
});
