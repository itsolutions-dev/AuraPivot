import { describe, expect, test } from 'vitest';
import { buildTree } from '../slice/TreeBuilder';
import { computeMatrix } from './MatrixComputer';

/**
 * Covers the two mirrored axis sorts: `sort.colKey` reorders row-tree
 * siblings by the values in one column, `sort.rowKey` reorders column-tree
 * siblings by the values in one row. Both run through the same shared
 * helper, so a break in one shows up here.
 */

const rows = [
  { region: 'North', year: '2024', amount: 30 },
  { region: 'South', year: '2024', amount: 10 },
  { region: 'East', year: '2024', amount: 20 },
];

const metadata = {
  region: { caption: 'Region', type: 'string' as const },
  year: { caption: 'Year', type: 'string' as const },
  amount: { caption: 'Amount', type: 'number' as const },
};

const rowFields = [{ uniqueName: 'region', caption: 'Region' }];
const colFields = [{ uniqueName: 'year', caption: 'Year' }];
const measures = [{ uniqueName: 'amount', aggregation: 'sum' }];

const run = (sort: Record<string, unknown> | null) =>
  computeMatrix({
    rows,
    rowRoot: buildTree({
      rows,
      fields: rowFields,
      metadata,
      expands: {},
      rootCaption: 'Total',
    }),
    colRoot: buildTree({
      rows,
      fields: colFields,
      metadata,
      expands: {},
      rootCaption: 'Total',
    }),
    rowFields,
    colFields,
    measures,
    hasMeasuresOnColumns: false,
    sort,
    layout: { totalsRowsPosition: 'none', totalsColumnsPosition: 'none' },
    metadata,
  });

const captionsOf = (leaves: { caption?: string }[]) =>
  leaves.map((l) => l.caption);

describe('computeMatrix — axis sorts', () => {
  test('unsorted keeps the tree order', () => {
    expect(captionsOf(run(null).rowLeaves)).toEqual(['East', 'North', 'South']);
  });

  test('colKey sort orders rows by that column, both directions', () => {
    const colKey = run(null).colLeaves[0].key;
    expect(captionsOf(run({ colKey, colDirection: 'asc' }).rowLeaves)).toEqual([
      'South',
      'East',
      'North',
    ]);
    expect(captionsOf(run({ colKey, colDirection: 'desc' }).rowLeaves)).toEqual(
      ['North', 'East', 'South'],
    );
  });

  test('rowKey sort orders columns by that row', () => {
    const wide = [
      { region: 'North', year: '2023', amount: 5 },
      { region: 'North', year: '2024', amount: 50 },
      { region: 'North', year: '2022', amount: 500 },
    ];
    const matrix = computeMatrix({
      rows: wide,
      rowRoot: buildTree({
        rows: wide,
        fields: rowFields,
        metadata,
        expands: {},
        rootCaption: 'Total',
      }),
      colRoot: buildTree({
        rows: wide,
        fields: colFields,
        metadata,
        expands: {},
        rootCaption: 'Total',
      }),
      rowFields,
      colFields,
      measures,
      hasMeasuresOnColumns: false,
      sort: null,
      layout: { totalsRowsPosition: 'none', totalsColumnsPosition: 'none' },
      metadata,
    });
    const rowKey = matrix.rowLeaves[0].key;
    const sorted = computeMatrix({
      rows: wide,
      rowRoot: buildTree({
        rows: wide,
        fields: rowFields,
        metadata,
        expands: {},
        rootCaption: 'Total',
      }),
      colRoot: buildTree({
        rows: wide,
        fields: colFields,
        metadata,
        expands: {},
        rootCaption: 'Total',
      }),
      rowFields,
      colFields,
      measures,
      hasMeasuresOnColumns: false,
      sort: { rowKey, rowDirection: 'asc' },
      layout: { totalsRowsPosition: 'none', totalsColumnsPosition: 'none' },
      metadata,
    });
    expect(captionsOf(sorted.colLeaves)).toEqual(['2023', '2024', '2022']);
  });
});
