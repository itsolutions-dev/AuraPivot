/**
 * Memoized Intl formatter factory.
 *
 * Formatting runs per cell on every matrix paint, and Intl constructors are
 * roughly 50-200x the cost of a .format() call. Formatters are immutable, so
 * one instance per (locale, options) pair lives here for the page lifetime.
 * The key space is tiny in practice: a handful of locales times a handful of
 * option shapes — no eviction needed.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

const keyOf = (
  locale: string | undefined,
  options: object | undefined,
): string => `${locale ?? ''}|${options ? JSON.stringify(options) : ''}`;

export const getNumberFormat = (
  locale?: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat => {
  const key = keyOf(locale, options);
  let fmt = numberFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, fmt);
  }
  return fmt;
};

export const getDateTimeFormat = (
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = keyOf(locale, options);
  let fmt = dateTimeFormats.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, fmt);
  }
  return fmt;
};
