import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatMeasureValue } from '../aggregation/Aggregator';
import { formatNumberWithFormat } from './CellFormatter';
import { formatDateValue } from './DateFormatter';

/**
 * Formatting runs per cell on every matrix paint; Intl constructors are
 * ~50-200x the cost of .format(). These tests pin the caching contract:
 * once a (locale, options) formatter exists, repeat formatting must not
 * construct new Intl instances.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatMeasureValue caching', () => {
  test('repeat calls construct no new Intl.NumberFormat', () => {
    // Warm every internal options variant for the locale.
    formatMeasureValue(1234.56, 'sum', 'it-IT'); // fractional path
    formatMeasureValue(42, 'sum', 'it-IT'); // integer path
    formatMeasureValue(7.9, 'count', 'it-IT'); // rounded path

    const spy = vi.spyOn(Intl, 'NumberFormat');
    for (let i = 0; i < 50; i += 1) {
      formatMeasureValue(1234.56 + i, 'sum', 'it-IT');
      formatMeasureValue(i, 'sum', 'it-IT');
      formatMeasureValue(i + 0.5, 'count', 'it-IT');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('output identical to a fresh Intl formatter', () => {
    expect(formatMeasureValue(1234.5, 'sum', 'it-IT')).toBe(
      new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1234.5),
    );
    expect(formatMeasureValue(1234, 'sum', 'it-IT')).toBe(
      new Intl.NumberFormat('it-IT').format(1234),
    );
    expect(formatMeasureValue(7.9, 'count', 'en-US')).toBe(
      new Intl.NumberFormat('en-US').format(8),
    );
  });

  test('locales are cached independently', () => {
    expect(formatMeasureValue(1234.5, 'sum', 'it-IT')).not.toBe(
      formatMeasureValue(1234.5, 'sum', 'en-US'),
    );
  });
});

describe('formatNumberWithFormat caching', () => {
  test('system separators resolved without per-call Intl constructions', () => {
    formatNumberWithFormat(1234.56, {}); // warm

    const spy = vi.spyOn(Intl, 'NumberFormat');
    for (let i = 0; i < 50; i += 1) {
      formatNumberWithFormat(1234.56 + i, {});
      formatNumberWithFormat(i, { numberOfDecimals: 2 });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('output uses the system locale separators', () => {
    const sysLocale =
      (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const parts = new Intl.NumberFormat(sysLocale).formatToParts(12345.6);
    const group = parts.find((p) => p.type === 'group')?.value || ',';
    const decimal = parts.find((p) => p.type === 'decimal')?.value || '.';
    expect(formatNumberWithFormat(1234.56, {})).toBe(
      `1${group}234${decimal}56`,
    );
  });
});

describe('formatDateValue caching', () => {
  const d = new Date(2024, 0, 15, 9, 5, 3);

  test('token pattern fallback reuses localized name tables', () => {
    formatDateValue(d, 'dd MMMM yyyy (EEEE)', { locale: 'en-US' }); // warm

    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    for (let i = 0; i < 20; i += 1) {
      formatDateValue(d, 'dd MMMM yyyy (EEEE)', { locale: 'en-US' });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test('localized names correct per locale', () => {
    expect(formatDateValue(d, 'MMMM', { locale: 'en-US' })).toBe('January');
    expect(formatDateValue(d, 'MMMM', { locale: 'it-IT' })).toBe('gennaio');
    expect(formatDateValue(d, 'EEE', { locale: 'en-US' })).toBe('Mon');
  });

  test('locale-date / locale-datetime modes match toLocale* output', () => {
    expect(formatDateValue(d, 'locale-date', { locale: 'it-IT' })).toBe(
      d.toLocaleDateString('it-IT'),
    );
    expect(formatDateValue(d, 'locale-datetime', { locale: 'it-IT' })).toBe(
      d.toLocaleString('it-IT'),
    );
  });
});
