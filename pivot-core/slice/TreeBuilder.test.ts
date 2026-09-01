import { describe, expect, test } from 'vitest';
import { buildTree, flattenTreeCompact } from './TreeBuilder';
import type { TreeNode } from '../types';
import { computeMatrix } from '../matrix/MatrixComputer';

const rows = [
  { region: 'North', city: 'Oslo', amount: 1 },
  { region: 'North', city: 'Bergen', amount: 2 },
  { region: 'South', city: 'Rome', amount: 3 },
];

const metadata = {
  region: { caption: 'Region', type: 'string' as const },
  city: { caption: 'City', type: 'string' as const },
  amount: { caption: 'Amount', type: 'number' as const },
};

const fields = [
  { uniqueName: 'region', caption: 'Region' },
  { uniqueName: 'city', caption: 'City' },
];

const makeTree = (expands = {}) =>
  buildTree({ rows, fields, metadata, expands, rootCaption: 'Total' });

const captions = (nodes: TreeNode[]) => nodes.map((n) => n.caption);

describe('flattenTreeCompact — totalsPosition "none"', () => {
  test('keeps group rows so they can still be expanded/collapsed', () => {
    const out = flattenTreeCompact(makeTree(), { totalsPosition: 'none' });
    expect(captions(out)).toEqual(['North', 'Bergen', 'Oslo', 'South', 'Rome']);
  });

  test('omits the grand-total row', () => {
    const out = flattenTreeCompact(makeTree(), { totalsPosition: 'none' });
    expect(out.some((n) => n.isTotal && n.depth === -1)).toBe(false);
  });

  test('a collapsed group still emits its own row', () => {
    const tree = makeTree({ expandedMembers: ['__root__|region:North'] });
    const out = flattenTreeCompact(tree, { totalsPosition: 'none' });
    expect(captions(out)).toEqual(['North', 'South', 'Rome']);
  });

  test('renders children even when the (hidden) root is collapsed', () => {
    const tree = makeTree({ expandedMembers: ['__root__'] });
    const out = flattenTreeCompact(tree, { totalsPosition: 'none' });
    expect(captions(out)).toEqual(['North', 'Bergen', 'Oslo', 'South', 'Rome']);
  });
});

describe('flattenTreeCompact — totalsPosition "before"/"after"', () => {
  test('"before" puts each total row ahead of its children', () => {
    const out = flattenTreeCompact(makeTree(), { totalsPosition: 'before' });
    expect(captions(out)).toEqual([
      'Total',
      'North',
      'Bergen',
      'Oslo',
      'South',
      'Rome',
    ]);
  });

  test('"after" puts each total row after its children', () => {
    const out = flattenTreeCompact(makeTree(), { totalsPosition: 'after' });
    expect(captions(out)).toEqual([
      'Bergen',
      'Oslo',
      'North',
      'Rome',
      'South',
      'Total',
    ]);
  });
});

describe('flattenTreeCompact — totalsPosition "after" with group headers', () => {
  const flatten = (expands = {}) =>
    flattenTreeCompact(makeTree(expands), {
      totalsPosition: 'after',
      emitGroupHeaders: true,
    });

  test('an expanded group keeps a header row above its children', () => {
    const out = flatten();
    expect(captions(out)).toEqual([
      'North',
      'Bergen',
      'Oslo',
      'North',
      'South',
      'Rome',
      'South',
      'Total',
    ]);
  });

  test('only the trailing copy is flagged as the subtotal', () => {
    const out = flatten();
    expect(
      out.map((n) => [n.caption, !!n.isGroupHeader, !!n.isSubtotal]),
    ).toEqual([
      ['North', true, false],
      ['Bergen', false, false],
      ['Oslo', false, false],
      ['North', false, true],
      ['South', true, false],
      ['Rome', false, false],
      ['South', false, true],
      ['Total', false, false],
    ]);
  });

  test('a collapsed group stays a single row carrying its own total', () => {
    const out = flatten({ expandedMembers: ['__root__|region:North'] });
    expect(captions(out)).toEqual(['North', 'South', 'Rome', 'South', 'Total']);
    expect(out[0].isGroupHeader).toBeUndefined();
    expect(out[0].isSubtotal).toBeUndefined();
  });

  test('the grand-total root is never split — it only trails', () => {
    const out = flatten();
    expect(out.filter((n) => n.depth === -1).map((n) => n.caption)).toEqual([
      'Total',
    ]);
  });
});

describe('computeMatrix — totalsRowsPosition "none"', () => {
  const measures = [{ uniqueName: 'amount', aggregation: 'sum' }];

  const matrixFor = (totalsRowsPosition: string) => {
    const rowRoot = buildTree({ rows, fields, metadata, rootCaption: 'Total' });
    const colRoot = buildTree({
      rows,
      fields: [],
      metadata,
      rootCaption: 'Total',
    });
    return computeMatrix({
      rows,
      rowRoot,
      colRoot,
      rowFields: fields,
      measures,
      hasMeasuresOnColumns: false,
      layout: { totalsRowsPosition },
      metadata,
    });
  };

  test('group rows are flagged so their aggregate is not rendered', () => {
    const { rowLeaves } = matrixFor('none');
    const north = rowLeaves.find((r) => r.caption === 'North');
    const oslo = rowLeaves.find((r) => r.caption === 'Oslo');
    expect(north?.totalsHidden).toBe(true);
    expect(oslo?.totalsHidden).toBe(false);
  });

  test('nothing is flagged when totals are visible', () => {
    const { rowLeaves } = matrixFor('before');
    expect(rowLeaves.every((r) => !r.totalsHidden)).toBe(true);
  });

  test('"after" splits expanded groups into a blank header and a subtotal', () => {
    const { rowLeaves } = matrixFor('after');
    expect(rowLeaves.map((r) => r.caption)).toEqual([
      'North',
      'Bergen',
      'Oslo',
      'North',
      'South',
      'Rome',
      'South',
      'Total',
    ]);
    // The header carries the control, the subtotal carries the aggregate.
    expect(rowLeaves[0].totalsHidden).toBe(true);
    expect(rowLeaves[3].totalsHidden).toBe(false);
    expect(rowLeaves[3].isSubtotal).toBe(true);
  });

  test('"after" leaves the column axis unsplit', () => {
    const rowRoot = buildTree({
      rows,
      fields: [],
      metadata,
      rootCaption: 'Total',
    });
    const colRoot = buildTree({ rows, fields, metadata, rootCaption: 'Total' });
    const { colLeaves } = computeMatrix({
      rows,
      rowRoot,
      colRoot,
      colFields: fields,
      measures,
      hasMeasuresOnColumns: false,
      layout: { totalsColumnsPosition: 'after' },
      metadata,
    });
    expect(colLeaves.map((c) => c.caption)).toEqual([
      'Bergen',
      'Oslo',
      'North',
      'Rome',
      'South',
      'Total',
    ]);
  });
});
