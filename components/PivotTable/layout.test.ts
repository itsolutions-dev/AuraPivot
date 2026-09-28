import { describe, expect, test } from 'vitest';
import { resolveDensity } from './layout';

describe('resolveDensity', () => {
  test('a persisted density key only matches a preset of its own', () => {
    const standard = resolveDensity('Standard');
    expect(resolveDensity('Compact')).not.toBe(standard);
    for (const key of ['constructor', '__proto__', 'bogus', null, undefined]) {
      expect(resolveDensity(key)).toBe(standard);
    }
  });
});
