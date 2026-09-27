/**
 * Aggregation vocabulary shared by the engine and the UI: the keys a measure
 * can carry, their dictionary keys and their English fallback captions.
 */

/** Aggregations offered for a regular (non-calculated) measure, in menu order. */
export const MEASURE_AGGREGATIONS = [
  'sum',
  'count',
  'distinctcount',
  'avg',
  'min',
  'max',
  'ratioTotal',
  'currentRatio',
] as const;

/** Where the dictionary spelling differs from the engine key. */
const DICTIONARY_KEY: Record<string, string> = {
  distinctcount: 'distinctCount',
  avg: 'average',
};

const ENGLISH: Record<string, string> = {
  sum: 'Sum',
  count: 'Count',
  distinctcount: 'Distinct count',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  formula: 'Calculated',
  ratioTotal: 'Ratio to total',
  currentRatio: 'Current ratio',
};

/**
 * Earlier FieldList builds stored the dictionary spelling `distinctCount` as
 * the aggregation itself, which the engine silently computed as a plain
 * count. Saved options carrying it are read as the distinct count they meant.
 */
export const normalizeAggregation = <T extends string | undefined>(agg: T): T =>
  (agg === 'distinctCount' ? 'distinctcount' : agg) as T;

/**
 * Caption for an aggregation from a localization dictionary's
 * `aggregations` section. Entries may be plain strings or
 * `{ caption, … }` objects; missing ones fall back to English.
 */
export const aggregationLabel = (
  localization: unknown,
  agg: string,
): string => {
  const section = (localization as { aggregations?: unknown } | null)
    ?.aggregations as Record<string, unknown> | undefined;
  const entry = section?.[agg] ?? section?.[DICTIONARY_KEY[agg] ?? agg];
  const caption =
    entry && typeof entry === 'object'
      ? (entry as { caption?: unknown }).caption
      : entry;
  return typeof caption === 'string' && caption ? caption : ENGLISH[agg] || agg;
};
