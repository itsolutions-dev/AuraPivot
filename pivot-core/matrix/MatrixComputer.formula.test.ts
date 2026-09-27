import { describe, expect, test, vi } from 'vitest';
import { buildTree } from '../slice/TreeBuilder';
import { computeMatrix } from './MatrixComputer';

/**
 * Calculated fields evaluated through computeMatrix: aggregator calls,
 * bare field references, running sums and the error surface a cell shows.
 */

const rows = [
  { region: 'North', year: '2023', amount: 30, 'net.value': 3 },
  { region: 'North', year: '2024', amount: 10, 'net.value': 1 },
  { region: 'South', year: '2024', amount: -4, 'net.value': 2 },
];

const metadata = {
  region: { caption: 'Region', type: 'string' as const },
  year: { caption: 'Year', type: 'string' as const },
  amount: { caption: 'Amount', type: 'number' as const },
  'net.value': { caption: 'Net', type: 'number' as const },
};

const rowFields = [{ uniqueName: 'region' }];
const colFields = [{ uniqueName: 'year' }];

const run = (formula: string) =>
  computeMatrix({
    rows,
    rowRoot: buildTree({ rows, fields: rowFields, metadata }),
    colRoot: buildTree({ rows, fields: colFields, metadata }),
    rowFields,
    colFields,
    measures: [{ uniqueName: 'calc', aggregation: 'formula' }],
    calculatedFields: [{ uniqueName: 'calc', formula }],
    hasMeasuresOnColumns: false,
    metadata,
  });

/** Cell values keyed `<row caption>/<column caption>`. */
const valuesOf = (formula: string) => {
  const m = run(formula);
  const out: Record<string, number | null> = {};
  for (const r of m.rowLeaves) {
    for (const c of m.colLeaves) {
      out[`${r.caption}/${c.caption}`] =
        m.cells.get(`${r.key}::${c.key}`)?.value ?? null;
    }
  }
  return out;
};

const errorOf = (formula: string) => {
  const m = run(formula);
  const cell = m.cells.get(`${m.rowLeaves[0].key}::${m.colLeaves[0].key}`);
  return cell?.error ?? null;
};

describe('computeMatrix — calculated fields', () => {
  test('aggregator calls resolve against each intersection', () => {
    expect(valuesOf('sum("amount") * 2')).toEqual({
      'Total/Total': 72,
      'Total/2023': 60,
      'Total/2024': 12,
      'North/Total': 80,
      'North/2023': 60,
      'North/2024': 20,
      'South/Total': -8,
      // An empty intersection resolves sum() to 0, not to a blank cell.
      'South/2023': 0,
      'South/2024': -8,
    });
  });

  test('count / distinctcount of an empty intersection are 0', () => {
    expect(valuesOf('count("amount") + 1')['South/2023']).toBe(1);
    expect(valuesOf('distinctcount("region") + 1')['South/2023']).toBe(1);
  });

  test('bare field references mean sum(field), dotted names included', () => {
    expect(valuesOf('amount + net.value')['North/Total']).toBe(44);
  });

  test('IF / ABS / MIN / MAX work on resolved values', () => {
    expect(valuesOf('IF(sum("amount") > 0, 1, -1)')['South/Total']).toBe(-1);
    expect(valuesOf('ABS(amount)')['South/Total']).toBe(4);
    expect(valuesOf('MAX(amount, 15)')['North/2024']).toBe(15);
  });

  test('running sums accumulate down the rows of each column', () => {
    const v = valuesOf('runningsum("amount")');
    expect(v['North/Total']).toBe(40);
    expect(v['South/Total']).toBe(36);
    expect(v['North/2024']).toBe(10);
    expect(v['South/2024']).toBe(6);
  });

  test('division by zero and syntax errors surface as cell errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(errorOf('sum("amount") / 0')).toBe('Division by zero');
      expect(errorOf('sum("amount") +')).toBe('Unexpected end of formula');
      expect(errorOf('unknownField * 2')).toBe(
        "Unknown identifier 'unknownField' in formula",
      );
    } finally {
      spy.mockRestore();
    }
  });

  test('a resolved negative value keeps its sign under ^', () => {
    // Textual substitution used to produce "-4 ^ 2", which parses as -(4^2).
    expect(valuesOf('sum("amount") ^ 2')['South/Total']).toBe(16);
  });

  test('errors quote the reference as written and are logged once', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(errorOf('sum("amount") amount')).toBe(
        "Unexpected token 'amount' in formula",
      );
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
