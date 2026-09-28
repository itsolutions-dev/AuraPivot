import { afterEach, describe, expect, test } from 'vitest';
import PivotEngine from './PivotEngine';
import { applyAggregation } from './aggregation/Aggregator';
import { sanitizeStyleValues } from './format/styleValues';
import { evaluateFormulaExpression } from './matrix/FormulaEvaluator';
import { computeMatrix } from './matrix/MatrixComputer';
import { buildTree } from './slice/TreeBuilder';

/**
 * Regression tests for input that comes from persisted, user-editable
 * reports and datasets.
 */

describe('field captions cannot reach Object.prototype', () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).caption;
    delete (Object as unknown as Record<string, unknown>).caption;
  });

  test.each(['__proto__', 'constructor', 'toString'])(
    "setFields ignores '%s'",
    (uniqueName) => {
      const engine = new PivotEngine();
      engine.setData([{ region: 'North' }]);
      engine.setFields([{ uniqueName, caption: 'POLLUTED' }]);
      expect(({} as Record<string, unknown>).caption).toBeUndefined();
      expect((Object as unknown as Record<string, unknown>).caption).toBe(
        undefined,
      );
    },
  );

  test('own fields are still renamed', () => {
    const engine = new PivotEngine();
    engine.setData([{ region: 'North' }]);
    engine.setFields([{ uniqueName: 'region', caption: 'Area' }]);
    expect(engine.getMetadata().region.caption).toBe('Area');
  });
});

describe('format style values', () => {
  test('values that could close a CSS declaration are dropped', () => {
    expect(
      sanitizeStyleValues({
        backgroundColor: 'red;}.x{outline:1px solid blue',
        textColor: '#123456',
        fontFamily: 'Inter;}body{display:none',
        fontSize: '12px;}',
        fontWeight: '700}',
        textAlign: 'left;',
        italic: true,
      }),
    ).toEqual({ textColor: '#123456', italic: true });
  });

  test('ordinary values, resets and unsets survive', () => {
    const style = {
      textColor: '',
      backgroundColor: null,
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      fontWeight: 600,
      textAlign: 'center',
    };
    expect(sanitizeStyleValues(style)).toEqual(style);
    expect(
      sanitizeStyleValues({
        textColor: 'rgba(0, 0, 0, 0.5)',
        fontSize: '1.2em',
      }),
    ).toEqual({ textColor: 'rgba(0, 0, 0, 0.5)', fontSize: '1.2em' });
  });

  test('setFormat applies it to every section and conditional rule', () => {
    const engine = new PivotEngine();
    const evil = 'red;}.x{color:red';
    engine.setFormat({
      values: { backgroundColor: evil },
      headers: { textColor: evil },
      valuesByMeasure: { 'amount:sum': { textColor: evil } },
      conditional: [{ operator: 'gt', value: 1, style: { textColor: evil } }],
    });
    const f = engine.getFormat();
    expect(f.values.backgroundColor).toBeNull(); // default kept
    expect(f.headers.textColor).toBeNull();
    expect(f.valuesByMeasure['amount:sum']).toEqual({});
    expect(f.conditional[0].style).toEqual({});
  });
});

describe('aggregation names from a report', () => {
  test.each(['valueOf', 'hasOwnProperty', '__proto__', 'constructor'])(
    "'%s' falls back to count instead of throwing",
    (name) => {
      expect(applyAggregation(name, [1, 2, 3])).toBe(3);
    },
  );
});

describe('formula evaluator bounds', () => {
  test('deep nesting is a readable error, not a stack overflow', () => {
    expect(() =>
      evaluateFormulaExpression(`${'('.repeat(1000)}1${')'.repeat(1000)}`),
    ).toThrow('Formula is nested too deeply');
    expect(() => evaluateFormulaExpression(`${'-'.repeat(1000)}1`)).toThrow(
      'Formula is nested too deeply',
    );
  });

  test('oversized input is rejected up front', () => {
    expect(() => evaluateFormulaExpression('1+'.repeat(6000) + '1')).toThrow(
      'Formula is too long',
    );
  });

  test('prototype keys are not functions', () => {
    expect(() => evaluateFormulaExpression('constructor(1)')).toThrow(
      "Unknown function 'constructor'",
    );
  });

  test('MAX / MIN take long argument lists', () => {
    const args = Array.from({ length: 2000 }, (_, i) => i).join(',');
    expect(evaluateFormulaExpression(`MAX(${args})`)).toBe(1999);
    expect(evaluateFormulaExpression(`MIN(${args})`)).toBe(0);
  });
});

describe('dataset keys that look like formula syntax', () => {
  const valueOf = (rows: Record<string, number>[], formula: string) => {
    const matrix = computeMatrix({
      rows,
      rowRoot: buildTree({ rows, fields: [], metadata: {} }),
      colRoot: buildTree({ rows, fields: [], metadata: {} }),
      measures: [{ uniqueName: 'calc', aggregation: 'formula' }],
      calculatedFields: [{ uniqueName: 'calc', formula }],
      hasMeasuresOnColumns: false,
    });
    return matrix.cells.values().next().value?.value;
  };

  test('a numeric key does not replace a literal', () => {
    expect(valueOf([{ a: 5, '2': 1000 }], 'a * 2')).toBe(10);
  });

  test('keyword and function-name keys keep their syntax meaning', () => {
    expect(valueOf([{ a: 5, and: 7 }], 'IF(a > 1 AND a < 9, 1, 0)')).toBe(1);
    expect(valueOf([{ a: 5, IF: 7 }], 'IF(a > 1, 1, 0)')).toBe(1);
    expect(valueOf([{ a: 5, max: 7 }], 'MAX(a, 1) + max')).toBe(12);
  });
});
