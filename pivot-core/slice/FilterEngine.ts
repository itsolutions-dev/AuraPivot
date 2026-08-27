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

import type { DataRow } from "../types";

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

const evaluateFilter = (filter: FilterEntry, row: DataRow): boolean => {
  const raw = row?.[filter.uniqueName];

  if (Array.isArray(filter.members) && filter.members.length > 0) {
    const allowed = new Set(filter.members.map((m) => String(m)));
    if (!allowed.has(String(raw))) return false;
  }
  if (Array.isArray(filter.exclude) && filter.exclude.length > 0) {
    const denied = new Set(filter.exclude.map((m) => String(m)));
    if (denied.has(String(raw))) return false;
  }
  if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
    const wanted = String(filter.value);
    if (String(raw) !== wanted) {
      if (!(DATE_ONLY.test(wanted) && sameCalendarDay(raw, wanted))) {
        return false;
      }
    }
  }
  if (filter.range && (filter.range.min != null || filter.range.max != null)) {
    const v = toComparable(raw);
    if (v === null) return false;
    const min = toComparable(filter.range.min);
    const max = toComparable(filter.range.max);
    if (min !== null && v < min) return false;
    if (max !== null && v > max) return false;
  }
  if (filter.search) {
    const needle = String(filter.search).toLowerCase();
    if (!String(raw ?? '').toLowerCase().includes(needle)) return false;
  }
  return true;
};

export const applyFilters = (rows: DataRow[], filters: FilterEntry[] | null | undefined): DataRow[] => {
  if (!filters || filters.length === 0) return rows;
  const active = filters.filter(
    (f: FilterEntry) =>
      f &&
      f.uniqueName &&
      ((Array.isArray(f.members) && f.members.length > 0) ||
        (Array.isArray(f.exclude) && f.exclude.length > 0) ||
        (f.value !== undefined && f.value !== null && f.value !== '') ||
        (f.range && (f.range.min != null || f.range.max != null)) ||
        f.search)
  );
  if (active.length === 0) return rows;

  return rows.filter((row: DataRow) => {
    for (const filter of active) {
      if (!evaluateFilter(filter, row)) return false;
    }
    return true;
  });
};
