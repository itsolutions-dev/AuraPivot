import { afterEach, describe, expect, test, vi } from 'vitest';
import PivotEngine from './index';

/**
 * Zero-config behavior contract: a consumer that passes NO localization
 * dictionary must get a fully English pivot — never blank captions. The
 * fallbacks live in three places: AGG_LABEL + caption templates
 * (PivotEngine), DEFAULT_MONTH/WEEKDAY_NAMES (DateHierarchyExpander),
 * inline literals (components).
 *
 * Plus: setLocalization validates its input in dev and warns instead of
 * silently producing a broken UI.
 */

const dataset = [
  {
    agent: { type: 'string', caption: 'Agent' },
    revenue: { type: 'number', caption: 'Revenue' },
    callMonth: { type: 'month', caption: 'Call Month' },
  },
  { agent: 'Alice', revenue: 1200, callMonth: 3 },
  { agent: 'Bob', revenue: 980, callMonth: 7 },
];

const makeEngine = () => {
  const engine = new PivotEngine();
  engine.setData(dataset);
  engine.setSlice({
    rows: [{ uniqueName: 'agent' }],
    columns: [{ uniqueName: 'Measures' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
    expands: { expandAll: true },
    filters: [],
  });
  return engine;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('zero-config English fallback', () => {
  test('measure captions use the English template', () => {
    const matrix = makeEngine().processMatrix();
    expect(matrix.measures[0].caption).toBe('Sum Total of Revenue');
    expect(matrix.measures[0].grandTotalCaption).toBe('Sum Total of Revenue');
  });

  test('aggregation labels fall back to English for every kind', () => {
    const engine = makeEngine();
    engine.setSlice({
      ...engine.getSlice(),
      measures: [
        { uniqueName: 'revenue', aggregation: 'avg' },
        { uniqueName: 'revenue', aggregation: 'distinctcount' },
      ],
    });
    const captions = engine.processMatrix().measures.map((m) => m.caption);
    expect(captions).toContain('Average Total of Revenue');
    expect(captions).toContain('Distinct count Total of Revenue');
  });

  test('month-typed fields expand to English month names', () => {
    const engine = makeEngine();
    const months = engine.getRows().map((r) => r.callMonth);
    expect(months).toContain('March');
    expect(months).toContain('July');
  });

  test('localized dictionary still wins over the fallback', () => {
    const engine = makeEngine();
    engine.setLocalization({
      grid: { measureCaptionTemplate: '{agg} di {field}' },
      aggregations: { sum: 'Somma' },
    });
    const matrix = engine.processMatrix();
    expect(matrix.measures[0].caption).toBe('Somma di Revenue');
  });
});

describe('setLocalization dev-mode validation', () => {
  test('warns on a non-object dictionary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeEngine().setLocalization(42);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('localization'),
      expect.anything(),
    );
  });

  test('warns when a known section has a non-object value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeEngine().setLocalization({ grid: 'not-a-section' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('grid'),
      expect.anything(),
    );
  });

  test('does not warn on a valid dictionary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeEngine().setLocalization({
      grid: { total: 'Totale' },
      aggregations: { sum: 'Somma' },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('does not warn on null/undefined (explicit reset is legal)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine();
    engine.setLocalization(null);
    engine.setLocalization(undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  test('invalid dictionary falls back to English instead of breaking', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine();
    engine.setLocalization(42);
    expect(engine.processMatrix().measures[0].caption).toBe(
      'Sum Total of Revenue',
    );
  });
});
