import { describe, expect, test, vi } from 'vitest';
import PivotEngine from './PivotEngine';
import { optionsToEngine } from '../options/optionsAdapter';

const listen = (engine: PivotEngine) => {
  const seen: string[] = [];
  (['dataChange', 'reportChange', 'formatChange'] as const).forEach((e) =>
    engine.on(e, () => seen.push(e)),
  );
  return seen;
};

describe('PivotEngine#batch', () => {
  test('holds events until the batch ends, then emits each once', () => {
    const engine = new PivotEngine();
    const seen = listen(engine);
    engine.batch(() => {
      engine.setData([{ a: 1 }]);
      engine.setSlice({ rows: [{ uniqueName: 'a' }] });
      engine.setData([{ a: 2 }]);
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['dataChange', 'reportChange']);
  });

  test('nested batches flush with the outermost one', () => {
    const engine = new PivotEngine();
    const seen = listen(engine);
    engine.batch(() => {
      engine.batch(() => engine.setData([{ a: 1 }]));
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['dataChange']);
  });

  test('still emits when the batched function throws', () => {
    const engine = new PivotEngine();
    const seen = listen(engine);
    expect(() =>
      engine.batch(() => {
        engine.setData([{ a: 1 }]);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(seen).toEqual(['dataChange']);
  });

  test('an options apply recomputes the matrix once', () => {
    const engine = new PivotEngine();
    const spy = vi.spyOn(engine, 'processMatrix');
    engine.on('dataChange', () => engine.processMatrix());
    engine.on('reportChange', () => engine.processMatrix());
    engine.on('formatChange', () => engine.processMatrix());
    optionsToEngine(
      engine,
      {
        data: {
          fields: [
            { uniqueName: 'region', dataType: 'string' },
            { uniqueName: 'amount', dataType: 'number' },
          ],
          dimensions: [{ axis: 'row', uniqueName: 'region' }],
          measures: [{ uniqueName: 'amount' }],
        },
      },
      [{ region: 'North', amount: 1 }],
    );
    // One call per distinct event; only the first one computes, the rest
    // hit the memoized matrix.
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.results.map((r) => r.value)).toEqual(
      Array(3).fill(spy.mock.results[0].value),
    );
  });
});

describe('blank members', () => {
  const blankCaption = (engine: PivotEngine) => {
    engine.setData([{ region: null, amount: 1 }]);
    engine.setSlice({
      rows: [{ uniqueName: 'region' }],
      measures: [{ uniqueName: 'amount', aggregation: 'sum' }],
    });
    return engine.processMatrix().rowRoot.children[0].caption;
  };

  test('default to an English caption', () => {
    expect(blankCaption(new PivotEngine())).toBe('(blank)');
  });

  test('follow grid.blankMember from the localization dictionary', () => {
    const engine = new PivotEngine();
    engine.setLocalization({ grid: { blankMember: '(vuoto)' } });
    expect(blankCaption(engine)).toBe('(vuoto)');
  });
});

describe('aggregations', () => {
  const rows = [
    { region: 'North', agent: 'Ann' },
    { region: 'North', agent: 'Ann' },
    { region: 'North', agent: 'Bob' },
  ];

  test("the saved 'distinctCount' spelling computes a distinct count", () => {
    const engine = new PivotEngine();
    engine.setData(rows);
    engine.setSlice({
      measures: [{ uniqueName: 'agent', aggregation: 'distinctCount' }],
    });
    expect(engine.getSlice().measures[0].aggregation).toBe('distinctcount');
    const m = engine.processMatrix();
    const cell = m.cells.get(`${m.rowLeaves[0].key}::${m.colLeaves[0].key}`);
    expect(cell?.value).toBe(2);
  });

  test('measure captions use the dictionary spelling of the aggregation', () => {
    const engine = new PivotEngine();
    engine.setLocalization({
      aggregations: { distinctCount: 'Conteggio distinto' },
      grid: { measureCaptionTemplate: '{agg} di {field}' },
    });
    engine.setData(rows);
    engine.setSlice({
      measures: [{ uniqueName: 'agent', aggregation: 'distinctcount' }],
    });
    expect(engine.processMatrix().measures[0].caption).toBe(
      'Conteggio distinto di agent',
    );
  });
});
