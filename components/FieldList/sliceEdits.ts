// The zones, the drag payload (write and validated read) and the pure edits
// the field list applies to its draft slice.
import type React from 'react';
import type { DragPayload, LocalSlice, ZoneField, ZoneId } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ZONES: { id: ZoneId; labelKey: string }[] = [
  { id: 'filters', labelKey: 'filters' },
  { id: 'rows', labelKey: 'rows' },
  { id: 'columns', labelKey: 'columns' },
  { id: 'measures', labelKey: 'values' },
];

const isZoneId = (value: unknown): value is ZoneId =>
  ZONES.some((z) => z.id === value);

// ---------------------------------------------------------------------------
// Drag payload
// ---------------------------------------------------------------------------

/**
 * Private drag type, so a text drag from another page or app is never read
 * as a field. It is not a trust boundary — any page can set any type — so
 * `readDragPayload` checks the shape and the drop handlers check the
 * payload against the current slice.
 */
export const DRAG_TYPE = 'application/x-aurapivot-field';

export const startDrag = (e: React.DragEvent, payload: DragPayload) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
};

/**
 * The payload of a drag this dialog started, or null for anything else:
 * the source must be the palette or a zone, and a zone source needs a
 * non-negative integer index.
 */
export const readDragPayload = (e: React.DragEvent): DragPayload | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { source, uniqueName, idx } = raw as Record<string, unknown>;
  if (typeof uniqueName !== 'string') return null;
  if (source === 'all') return { source, uniqueName };
  if (!isZoneId(source) || typeof idx !== 'number') return null;
  if (!Number.isInteger(idx) || idx < 0) return null;
  return { source, uniqueName, idx };
};

// ---------------------------------------------------------------------------
// Slice edits
// ---------------------------------------------------------------------------

/** The measure axis needs an anchor field on one of the two zones. */
export const ensureMeasuresAnchor = (
  s: LocalSlice,
  measuresAxis: 'rows' | 'columns' | undefined,
): LocalSlice => {
  const inRows = (s.rows || []).some((f) => f.uniqueName === 'Measures');
  const inCols = (s.columns || []).some((f) => f.uniqueName === 'Measures');
  if (inRows || inCols) return s;
  // Default placement honors the `measuresAxis` prop; columns otherwise.
  if (measuresAxis === 'rows') {
    return { ...s, rows: [...(s.rows || []), { uniqueName: 'Measures' }] };
  }
  return { ...s, columns: [...(s.columns || []), { uniqueName: 'Measures' }] };
};

const without = (
  list: ZoneField[] | undefined,
  uniqueName: string,
): ZoneField[] => (list || []).filter((f) => f.uniqueName !== uniqueName);

/** Drop a field from every zone of the local draft slice. */
export const stripFromSlice = (
  s: LocalSlice,
  uniqueName: string,
): LocalSlice => ({
  ...s,
  rows: without(s.rows, uniqueName),
  columns: without(s.columns, uniqueName),
  measures: without(s.measures, uniqueName),
  filters: without(s.filters, uniqueName),
});

/** What a drop needs to know about a field; the dialog asks the engine. */
export interface FieldLookup {
  /** A drop payload is outside data, so it may only name a known field. */
  isKnownField: (uniqueName: string) => boolean;
  /** The aggregations a field dragged into Values can take. */
  allowedAggsFor: (uniqueName: string) => readonly string[];
  /** A calculated field aggregates as `formula`. */
  isCalculated: (uniqueName: string) => boolean;
}

/**
 * Applies a drop on `zone`. `targetIdx` is the chip the payload was
 * dropped on (insert before it), or null for the zone background (append).
 * Returns the next slice, or null when the drop does nothing.
 */
export const applyZoneDrop = (
  slice: LocalSlice,
  zone: ZoneId,
  payload: DragPayload,
  targetIdx: number | null,
  { isKnownField, allowedAggsFor, isCalculated }: FieldLookup,
): LocalSlice | null => {
  const { source, uniqueName } = payload;
  const sourceIdx = payload.source === 'all' ? null : payload.idx;
  // The Measures anchor's axis is set by the "Show totals" toggle alone.
  if (uniqueName === 'Measures') return null;
  // Act only on a known palette field or, for a chip move, on the chip
  // that really sits at that index: anything else did not come from here.
  const moving: ZoneField | undefined =
    payload.source === 'all'
      ? { uniqueName }
      : slice[payload.source]?.[payload.idx];
  if (moving?.uniqueName !== uniqueName) return null;
  if (source === 'all' && !isKnownField(uniqueName)) return null;

  // When dropping into measures from elsewhere, pick the first
  // aggregation no other measure entry of the same field uses yet. With
  // all of them in use, the drop does nothing.
  let chosenAgg: string | undefined;
  if (zone === 'measures' && source !== 'measures') {
    const usedAgg = new Set(
      (slice.measures || [])
        .filter((m) => m.uniqueName === uniqueName)
        .map((m) => m.aggregation),
    );
    chosenAgg = allowedAggsFor(uniqueName).find((a) => !usedAgg.has(a));
    if (!chosenAgg) return null;
  }

  const next: LocalSlice = { ...slice };
  if (source !== 'all') {
    next[source] = (next[source] || []).filter((_, i) => i !== sourceIdx);
  }
  const insertInto = (list: ZoneField[], entry: ZoneField): ZoneField[] => {
    let at = targetIdx ?? list.length;
    // Moving down within one zone: taking the chip out shifted the
    // target up by one.
    if (
      source === zone &&
      sourceIdx != null &&
      targetIdx != null &&
      sourceIdx < targetIdx
    ) {
      at = targetIdx - 1;
    }
    const out = [...list];
    out.splice(at, 0, entry);
    return out;
  };

  if (zone === 'filters') {
    // Filters never strip from rows/cols/measures and never duplicate.
    // A moved filter chip keeps its predicate, and so does a field dragged
    // in from another zone that already is a filter.
    const existing =
      source === 'filters'
        ? moving
        : (next.filters || []).find((f) => f.uniqueName === uniqueName);
    next.filters = insertInto(
      without(next.filters, uniqueName),
      existing || { uniqueName },
    );
  } else if (zone === 'measures') {
    // Measures accept one entry per aggregation of the same field, so
    // siblings stay; a field arriving from elsewhere leaves rows / cols.
    if (source !== 'measures') {
      next.rows = without(next.rows, uniqueName);
      next.columns = without(next.columns, uniqueName);
    }
    next.measures = insertInto(
      next.measures || [],
      // A reorder keeps the chip as it is (aggregation, hidden flag).
      source === 'measures'
        ? {
            ...moving,
            aggregation:
              moving.aggregation ||
              (isCalculated(uniqueName) ? 'formula' : 'sum'),
          }
        : { uniqueName, aggregation: chosenAgg },
    );
  } else {
    // Rows / columns: the field is a dimension here, so it leaves the
    // other axis and every measure entry.
    if (source !== zone) {
      next.rows = without(next.rows, uniqueName);
      next.columns = without(next.columns, uniqueName);
      next.measures = without(next.measures, uniqueName);
    }
    next[zone] = insertInto(without(next[zone], uniqueName), { uniqueName });
  }
  return next;
};
