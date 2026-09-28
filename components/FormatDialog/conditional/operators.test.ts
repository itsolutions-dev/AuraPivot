import { describe, expect, test } from 'vitest';
import { operatorDef, operatorLabel } from './operators';

describe('operator lookups from persisted rules', () => {
  test('known operators resolve, prototype keys do not', () => {
    expect(operatorDef('gt')?.symbol).toBeDefined();
    for (const op of ['__proto__', 'constructor', 'toString', undefined]) {
      expect(operatorDef(op)).toBeUndefined();
    }
  });

  test('an unknown operator is labelled by its key instead of throwing', () => {
    expect(operatorLabel({}, '__proto__')).toBe('__proto__');
    expect(operatorLabel({}, 'between')).toBe('Between');
  });
});
