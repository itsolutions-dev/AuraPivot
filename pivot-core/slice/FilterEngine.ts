/**
 * Applies slice.filters[] to the raw data rows before the tree builders run.
 *
 * Supported filter shapes (all keyed by `uniqueName`):
 *   - { members: [...] }              → whitelist of allowed values
 *   - { exclude: [...] }              → blacklist of forbidden values
 *   - { value: X }                    → strict equality (single value)
 *   - { range: { min?, max? } }       → numeric / date range (inclusive)
 *   - { search: 'substring' }         → case-insensitive contains
 *
 * Multiple predicates on the same filter entry are AND-combined. Multiple
 * filters on the same field produce an AND across the respective predicates.
 */

import type { DataRow } from '../types';

/** Full runtime filter shape accepted by the engine (superset of SliceFilter). */
export interface FilterEntry {
  uniqueName: string;
  members?: string[];
  exclude?: string[];
  value?: unknown;
  range?: { min?: unknown; max?: unknown };
  search?: string;
}

type Comparable = number | string | null;

const toComparable = (value: unknown): Comparable => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(value));
  if (Number.isFinite(t)) return t;
  return String(value);
};

/** `yyyy-mm-dd`, the value an `<input type="date">` produces. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A single-value filter on a date field carries a bare calendar day, while
 * the underlying row usually holds a full ISO timestamp or a Date — string
 * equality would never match. Compare on the local calendar day instead,
 * the same convention DateFormatter/DateHierarchyExpander use.
 */
const sameCalendarDay = (raw: unknown, dayValue: string): boolean => {
  const ts = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  if (!Number.isFinite(ts)) return false;
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` ===
    dayValue
  );
};

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || v === '';

const hasRange = (f: FilterEntry): boolean =>
  !!f.range && (f.range.min != null || f.range.max != null);

const nonEmptyList = (list: unknown): list is unknown[] =>
  Array.isArray(list) && list.length > 0;

type RowPredicate = (row: DataRow) => boolean;

/**
 * Turns one filter entry into a row predicate, or `null` when the entry
 * constrains nothing. Everything that does not depend on the row (member
 * sets, parsed range bounds, lower-cased needle) is computed here once
 * instead of once per row.
 */
const compileFilter = (filter: FilterEntry): RowPredicate | null => {
  if (!filter || !filter.uniqueName) return null;
  const field = filter.uniqueName;
  const checks: ((raw: unknown) => boolean)[] = [];

  if (nonEmptyList(filter.members)) {
    const allowed = new Set(filter.members.map((m) => String(m)));
    checks.push((raw) => allowed.has(String(raw)));
  }
  if (nonEmptyList(filter.exclude)) {
    const denied = new Set(filter.exclude.map((m) => String(m)));
    checks.push((raw) => !denied.has(String(raw)));
  }
  if (!isBlank(filter.value)) {
    const wanted = String(filter.value);
    const isDay = DATE_ONLY.test(wanted);
    checks.push(
      (raw) =>
        String(raw) === wanted || (isDay && sameCalendarDay(raw, wanted)),
    );
  }
  if (hasRange(filter)) {
    const min = toComparable(filter.range!.min);
    const max = toComparable(filter.range!.max);
    checks.push((raw) => {
      const v = toComparable(raw);
      if (v === null) return false;
      if (min !== null && v < min) return false;
      if (max !== null && v > max) return false;
      return true;
    });
  }
  if (filter.search) {
    const needle = String(filter.search).toLowerCase();
    checks.push((raw) =>
      String(raw ?? '')
        .toLowerCase()
        .includes(needle),
    );
  }
  if (checks.length === 0) return null;
  return (row) => {
    const raw = row?.[field];
    return checks.every((check) => check(raw));
  };
};

/** Whether a filter entry constrains anything (drives the "active" badges). */
export const isFilterActive = (filter: FilterEntry): boolean =>
  !!filter &&
  !!filter.uniqueName &&
  (nonEmptyList(filter.members) ||
    nonEmptyList(filter.exclude) ||
    !isBlank(filter.value) ||
    hasRange(filter) ||
    !!filter.search);

export const applyFilters = (
  rows: DataRow[],
  filters: FilterEntry[] | null | undefined,
): DataRow[] => {
  if (!filters || filters.length === 0) return rows;
  const active = filters
    .map(compileFilter)
    .filter((p): p is RowPredicate => p !== null);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((matches) => matches(row)));
};

/**
 * Distinct, sorted, non-empty values of one field across the engine's rows.
 * Backs the member pickers in FilterBar and DimensionFilterDialog.
 */
export const distinctValuesFor = (
  engine: { getRows: () => Record<string, unknown>[] },
  uniqueName: string,
  locale: string | undefined,
): unknown[] => {
  const seen = new Map<string, unknown>();
  engine.getRows().forEach((row) => {
    const v = row?.[uniqueName];
    if (v === null || v === undefined || v === '') return;
    const key = String(v);
    if (!seen.has(key)) seen.set(key, v);
  });
  return Array.from(seen.values()).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), locale || undefined, {
      numeric: true,
    });
  });
};
