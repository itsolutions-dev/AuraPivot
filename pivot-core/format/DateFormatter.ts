/**
 * Formats a raw date value for display inside pivot dimensions.
 *
 * Accepts either ISO strings, timestamps or `Date` instances. Returns the
 * original string representation unchanged when the value cannot be parsed
 * as a date — callers rely on this to pass values of unknown type through
 * without surprises.
 *
 * Format strings:
 *   - falsy / 'locale' / 'locale-date': browser short date (toLocaleDateString)
 *   - 'locale-datetime'               : browser date + time (toLocaleString)
 *   - 'iso'                           : YYYY-MM-DDTHH:mm:ss (truncated ISO)
 *   - 'iso-date'                      : YYYY-MM-DD
 *   - anything else                   : treated as a token pattern. Supported
 *     tokens: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H mm m ss s. Unrecognized
 *     characters are emitted verbatim.
 */

const parseDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const TOKEN_RE = /yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|m|ss|s/g;

const applyPattern = (d: Date, pattern: string, { monthNames, weekdayNames }: { monthNames: string[]; weekdayNames: string[] }): string => {
  return pattern.replace(TOKEN_RE, (tok) => {
    switch (tok) {
      case 'yyyy':
        return String(d.getFullYear());
      case 'yy':
        return pad(d.getFullYear() % 100);
      case 'MMMM':
        return monthNames[d.getMonth()];
      case 'MMM':
        return monthNames[d.getMonth()].slice(0, 3);
      case 'MM':
        return pad(d.getMonth() + 1);
      case 'M':
        return String(d.getMonth() + 1);
      case 'dd':
        return pad(d.getDate());
      case 'd':
        return String(d.getDate());
      case 'EEEE':
        return weekdayNames[d.getDay()];
      case 'EEE':
        return weekdayNames[d.getDay()].slice(0, 3);
      case 'HH':
        return pad(d.getHours());
      case 'H':
        return String(d.getHours());
      case 'mm':
        return pad(d.getMinutes());
      case 'm':
        return String(d.getMinutes());
      case 'ss':
        return pad(d.getSeconds());
      case 's':
        return String(d.getSeconds());
      default:
        return tok;
    }
  });
};

const resolveLocale = (explicit: string | undefined): string => {
  if (explicit) return explicit;
  if (typeof navigator !== 'undefined' && navigator.language)
    return navigator.language;
  return 'en-US';
};

interface FormatDateOptions {
  locale?: string;
  monthNames?: string[];
  weekdayNames?: string[];
}

export const formatDateValue = (value: unknown, format: string | null | undefined, options: FormatDateOptions = {}): string => {
  const d = parseDate(value);
  if (!d) return value === null || value === undefined ? '' : String(value);

  const locale = resolveLocale(options.locale);
  const monthNames = options.monthNames;
  const weekdayNames = options.weekdayNames;

  const mode = format || 'locale-date';
  if (mode === 'locale' || mode === 'locale-date') {
    return d.toLocaleDateString(locale);
  }
  if (mode === 'locale-datetime') {
    return d.toLocaleString(locale);
  }
  if (mode === 'iso') {
    // Drop sub-second precision and the trailing 'Z' so the value is
    // readable but still canonical.
    return d.toISOString().replace(/\.\d+Z$/, 'Z').replace('T', ' ').replace('Z', '');
  }
  if (mode === 'iso-date') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // Token-based pattern.
  if (!monthNames || !weekdayNames) {
    // Fallback tokenizer built on top of Intl when the caller did not
    // pre-resolve localized names.
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    const defMonth = Array.from({ length: 12 }, (_, i) =>
      fmt.format(new Date(2000, i, 1))
    );
    const fmtWd = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const defWd = Array.from({ length: 7 }, (_, i) =>
      fmtWd.format(new Date(2000, 0, 2 + i))
    );
    return applyPattern(d, mode, {
      monthNames: defMonth,
      weekdayNames: defWd,
    });
  }
  return applyPattern(d, mode, { monthNames, weekdayNames });
};

export const DATE_FORMAT_PRESETS = [
  { value: 'locale-date', labelKey: 'localeDate' },
  { value: 'locale-datetime', labelKey: 'localeDateTime' },
  { value: 'iso', labelKey: 'iso' },
  { value: 'iso-date', labelKey: 'isoDate' },
  { value: 'custom', labelKey: 'custom' },
];

/**
 * Formats a date sub-part value (month / quarter / weekday / week) using the
 * localized names + labels. `value` is the raw numeric sub-part stored by the
 * hierarchy expander (month 1-12, quarter 1-4, weekday 0-6, week 1-53).
 *
 * Accepted `format`s per subpart:
 *   - month   : 'name-full' (default) | 'name-short' | 'number' | 'number-padded'
 *   - quarter : 'long' (default)      | 'short'      | 'number'
 *   - weekday : 'name-full' (default) | 'name-short'
 *   - week    : 'number' (default)    | 'long'
 */
interface FormatSubpartOptions {
  monthNames?: string[];
  weekdayNames?: string[];
  quarterLabel?: string;
  quarterShortPrefix?: string;
  weekLabel?: string;
}

export const formatSubpartValue = (value: unknown, subpart: string, format: string | null | undefined, options: FormatSubpartOptions = {}): string => {
  if (value === null || value === undefined || value === '') return '';
  const monthNames = options.monthNames;
  const weekdayNames = options.weekdayNames;
  const quarterLabel = options.quarterLabel || 'Quarter';
  const quarterShortPrefix = options.quarterShortPrefix || 'Q';
  const weekLabel = options.weekLabel || 'Week';

  if (subpart === 'month') {
    const idx = Number(value) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx > 11) return String(value);
    switch (format) {
      case 'name-short':
        return (monthNames?.[idx] || String(idx + 1)).slice(0, 3);
      case 'number':
        return String(idx + 1);
      case 'number-padded':
        return pad(idx + 1);
      case 'name-full':
      default:
        return monthNames?.[idx] || String(idx + 1);
    }
  }
  if (subpart === 'quarter') {
    const q = Number(value);
    if (!Number.isInteger(q) || q < 1 || q > 4) return String(value);
    switch (format) {
      case 'short':
        return `${quarterShortPrefix}${q}`;
      case 'number':
        return String(q);
      case 'long':
      default:
        return `${quarterLabel} ${q}`;
    }
  }
  if (subpart === 'weekday') {
    const idx = Number(value);
    if (!Number.isInteger(idx) || idx < 0 || idx > 6) return String(value);
    switch (format) {
      case 'name-short':
        return (weekdayNames?.[idx] || String(idx)).slice(0, 3);
      case 'name-full':
      default:
        return weekdayNames?.[idx] || String(idx);
    }
  }
  if (subpart === 'week') {
    const w = Number(value);
    if (!Number.isInteger(w)) return String(value);
    switch (format) {
      case 'long':
        return `${weekLabel} ${w}`;
      case 'number':
      default:
        return String(w);
    }
  }
  return String(value);
};
