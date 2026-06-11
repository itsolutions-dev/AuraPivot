/**
 * Pure aggregation functions.
 * Input is an array of numeric values; output is a single number (or null if
 * the input set is empty).
 */

import type { AggregationType } from "../types";
import { getNumberFormat } from "../format/intlCache";

const sum = (values: number[]): number =>
  values.reduce((acc: number, v: number) => acc + (Number.isFinite(v) ? v : 0), 0);

const count = (values: number[]): number => values.length;

const distinctcount = (values: number[]): number => new Set(values).size;

const avg = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return sum(values) / values.length;
};

const min = (values: number[]): number | null => {
  if (values.length === 0) return null;
  let m = Infinity;
  values.forEach((v: number) => {
    if (Number.isFinite(v) && v < m) m = v;
  });
  return m === Infinity ? null : m;
};

const max = (values: number[]): number | null => {
  if (values.length === 0) return null;
  let m = -Infinity;
  values.forEach((v: number) => {
    if (Number.isFinite(v) && v > m) m = v;
  });
  return m === -Infinity ? null : m;
};

export const AGGREGATIONS: Record<string, (values: number[]) => number | null> = {
  sum,
  count,
  distinctcount,
  avg,
  min,
  max,
};

export const applyAggregation = (type: AggregationType | string, values: number[]): number | null => {
  const fn = AGGREGATIONS[type] || count;
  return fn(values);
};

export const formatMeasureValue = (value: number | null | undefined, aggregation: string, locale?: string): string => {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return '';
  // `locale || undefined` lets Intl fall back to the browser's default
  // when the caller didn't specify a locale.
  const loc = locale || undefined;
  if (aggregation === 'count' || aggregation === 'distinctcount') {
    return getNumberFormat(loc).format(Math.round(value));
  }
  if (Number.isInteger(value)) {
    return getNumberFormat(loc).format(value);
  }
  return getNumberFormat(loc, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
