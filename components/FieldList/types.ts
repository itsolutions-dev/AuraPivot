// Local types of the field list dialog: its zones, the draft slice it edits,
// the "All fields" palette tree and the drag payload.
import type PivotEngine from '../../pivot-core/PivotEngine';
import type { InternalSliceField } from '../../pivot-core/PivotEngine';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export type ZoneId = 'rows' | 'columns' | 'measures' | 'filters';

/**
 * An entry of any drop zone. The editor handles the four zones uniformly,
 * so the measure-only properties are optional here.
 */
export type ZoneField = InternalSliceField & {
  aggregation?: string;
  hidden?: boolean;
  availableAggregations?: string[];
};

/** The draft slice, with every zone as ZoneField[]. */
export interface LocalSlice {
  rows?: ZoneField[];
  columns?: ZoneField[];
  measures?: ZoneField[];
  filters?: ZoneField[];
  [key: string]: unknown;
}

export type AvailableField = ReturnType<
  PivotEngine['getAvailableFields']
>[number];

/** A palette entry; a date field groups its hierarchy parts as children. */
export interface FieldTreeNode extends AvailableField {
  isDateParent?: boolean;
  /** Header for the remaining parts of a date field that sits in a zone. */
  parentUsed?: boolean;
  partCaption?: string;
  subpart?: string;
  children?: FieldTreeNode[];
}

/** Where a drag started: a zone chip (at `idx`) or the "All fields" palette. */
export type DragPayload =
  | { source: 'all'; uniqueName: string }
  | { source: ZoneId; uniqueName: string; idx: number };
