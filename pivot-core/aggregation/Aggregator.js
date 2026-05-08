/**
 * Pure aggregation functions.
 * Input is an array of numeric values; output is a single number (or null if
 * the input set is empty).
 */

const sum = (values) =>
  values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

const count = (values) => values.length;

const distinctcount = (values) => new Set(values).size;

const avg = (values) => {
  if (values.length === 0) return null;
  return sum(values) / values.length;
};

const min = (values) => {
  if (values.length === 0) return null;
  let m = Infinity;
  values.forEach((v) => {
    if (Number.isFinite(v) && v < m) m = v;
  });
  return m === Infinity ? null : m;
};

const max = (values) => {
  if (values.length === 0) return null;
  let m = -Infinity;
  values.forEach((v) => {
    if (Number.isFinite(v) && v > m) m = v;
  });
  return m === -Infinity ? null : m;
};

export const AGGREGATIONS = {
  sum,
  count,
  distinctcount,
  avg,
  min,
  max,
};

export const applyAggregation = (type, values) => {
  const fn = AGGREGATIONS[type] || count;
  return fn(values);
};

export const formatMeasureValue = (value, aggregation, locale) => {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return '';
  // `locale || undefined` lets Intl fall back to the browser's default
  // when the caller didn't specify a locale.
  const loc = locale || undefined;
  /*   if (aggregation === 'ratioTotal') {
    return new Intl.NumberFormat(loc).format(value);
  } */
  if (aggregation === 'count' || aggregation === 'distinctcount') {
    return new Intl.NumberFormat(loc).format(Math.round(value));
  }
  if (Number.isInteger(value)) {
    return new Intl.NumberFormat(loc).format(value);
  }
  return new Intl.NumberFormat(loc, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
