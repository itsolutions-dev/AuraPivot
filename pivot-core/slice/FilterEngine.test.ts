import { describe, expect, test } from 'vitest';
import type { DataRow } from '../types';
import { applyFilters, distinctValuesFor } from './FilterEngine';

const rows: DataRow[] = [
  { region: 'North', amount: 30, day: '2024-03-15T09:30:00' },
  { region: 'South', amount: 10, day: '2024-03-16T18:00:00' },
  { region: 'East', amount: 20, day: '2024-03-17T00:00:00' },
  { region: null, amount: 5, day: null },
];

const regions = (out: DataRow[]) => out.map((r) => r.region);

describe('applyFilters', () => {
  test('no filters, or only empty ones, returns the input array', () => {
    expect(applyFilters(rows, null)).toBe(rows);
    expect(applyFilters(rows, [])).toBe(rows);
    expect(
      applyFilters(rows, [
        { uniqueName: 'region', members: [] },
        { uniqueName: 'region', value: '' },
        { uniqueName: '', members: ['North'] },
      ]),
    ).toBe(rows);
  });

  test('members whitelists, exclude blacklists, compared as strings', () => {
    expect(
      regions(
        applyFilters(rows, [
          { uniqueName: 'region', members: ['North', 'East'] },
        ]),
      ),
    ).toEqual(['North', 'East']);
    expect(
      regions(
        applyFilters(rows, [{ uniqueName: 'region', exclude: ['North'] }]),
      ),
    ).toEqual(['South', 'East', null]);
    expect(
      applyFilters(rows, [{ uniqueName: 'amount', members: ['30'] }]),
    ).toHaveLength(1);
  });

  test('value matches exactly, or on the calendar day for a date-only value', () => {
    expect(
      regions(applyFilters(rows, [{ uniqueName: 'region', value: 'South' }])),
    ).toEqual(['South']);
    expect(
      regions(applyFilters(rows, [{ uniqueName: 'day', value: '2024-03-16' }])),
    ).toEqual(['South']);
  });

  test('range is inclusive and drops blank values', () => {
    expect(
      regions(
        applyFilters(rows, [
          { uniqueName: 'amount', range: { min: 10, max: 20 } },
        ]),
      ),
    ).toEqual(['South', 'East']);
    expect(
      regions(
        applyFilters(rows, [
          { uniqueName: 'day', range: { min: '2024-03-16', max: null } },
        ]),
      ),
    ).toEqual(['South', 'East']);
  });

  test('search is a case-insensitive substring match', () => {
    expect(
      regions(applyFilters(rows, [{ uniqueName: 'region', search: 'TH' }])),
    ).toEqual(['North', 'South']);
  });

  test('predicates on one entry and across entries are AND-combined', () => {
    expect(
      regions(
        applyFilters(rows, [
          { uniqueName: 'region', members: ['North', 'South'], search: 'no' },
          { uniqueName: 'amount', range: { min: 1 } },
        ]),
      ),
    ).toEqual(['North']);
  });
});

describe('distinctValuesFor', () => {
  test('returns sorted non-blank distinct values', () => {
    const engine = { getRows: () => rows };
    expect(distinctValuesFor(engine, 'region', 'en')).toEqual([
      'East',
      'North',
      'South',
    ]);
    expect(distinctValuesFor(engine, 'amount', 'en')).toEqual([5, 10, 20, 30]);
  });
});
