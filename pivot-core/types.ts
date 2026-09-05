/**
 * Type definitions for the pivot-core library.
 * Single source of truth for all shared interfaces and the public AuraPivot API.
 */

// ---------------------------------------------------------------------------
// Core engine types (ported from JSDoc typedefs)
// ---------------------------------------------------------------------------

export type FieldType =
  'string' | 'number' | 'date' | 'time' | 'month' | 'weekday';

export interface FieldMeta {
  type: FieldType;
  caption: string;
}

export type MetadataRow = Record<string, FieldMeta>;
export type DataRow = Record<string, string | number | null>;

export type SortDirection = 'asc' | 'desc' | 'none';
export type AggregationType =
  'sum' | 'count' | 'distinctcount' | 'avg' | 'min' | 'max';

export interface SliceField {
  uniqueName: string;
  sort?: SortDirection;
  caption?: string;
}

export interface SliceMeasure {
  uniqueName: string;
  aggregation: AggregationType;
  caption?: string;
  availableAggregations?: AggregationType[];
}

export interface SliceFilter {
  uniqueName: string;
  members?: string[];
  exclude?: string[];
}

export interface Slice {
  rows: SliceField[];
  columns: SliceField[];
  measures: SliceMeasure[];
  expands?: { expandAll?: boolean; expandedMembers?: string[] };
  filters?: SliceFilter[];
  flatOrder?: string[];
}

export interface TreeNode {
  key: string;
  caption: string;
  depth: number;
  isExpanded: boolean;
  isTotal?: boolean;
  children: TreeNode[];
  rowIndexes: number[];
  field?: string;
  value?: string | number | null;
  /** Axis-leaf only: group node whose aggregate is suppressed (totals 'none'). */
  totalsHidden?: boolean;
  /**
   * Axis-leaf only, totals 'after': header clone emitted above the group's
   * children. Carries the expand/collapse control; its cells stay empty
   * because the aggregate belongs to the matching `isSubtotal` row.
   */
  isGroupHeader?: boolean;
  /**
   * Axis-leaf only, totals 'after': the group node emitted below its own
   * children as the subtotal row, paired with an `isGroupHeader` clone.
   */
  isSubtotal?: boolean;
}

export interface MatrixCell {
  value: number | null;
  formattedValue: string;
  rowKey: string;
  colKey: string;
  measureKey: string | null;
}

export interface PivotMatrix {
  rowLeaves: TreeNode[];
  colLeaves: TreeNode[];
  rowRoot: TreeNode;
  colRoot: TreeNode;
  cells: Map<string, MatrixCell>;
  measures: SliceMeasure[];
}

// ---------------------------------------------------------------------------
// Engine event types
// ---------------------------------------------------------------------------

export type EngineEvent = 'dataChange' | 'reportChange' | 'formatChange';
export type EngineEventHandler = (...args: unknown[]) => void;

// ---------------------------------------------------------------------------
// Public AuraPivotOptions types
// (enum unions from optionsSchema.js)
// ---------------------------------------------------------------------------

export type Density = 'Compact' | 'Standard' | 'Comfortable';
export type TotalsPosition = 'before' | 'after' | 'none';
export type MeasuresAxis = 'rows' | 'columns';
export type DimensionAxis = 'row' | 'column';
export type Aggregation =
  'sum' | 'count' | 'distinctcount' | 'avg' | 'min' | 'max' | 'formula';
export type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
export type ConditionalMode = 'first' | 'all';
export type DataType = 'number' | 'string' | 'date' | 'time' | 'month';
/** Wired into the section-format maps (values/headers/dimensions/grandTotals) in Task 6. */
export type TextAlign = 'left' | 'center' | 'right';

// --- toolbar section ---

export interface AuraPivotToolbarOptions {
  visible?: boolean;
  showFields?: boolean;
  showFormat?: boolean;
  showExport?: boolean;
  showFullscreen?: boolean;
}

// --- layout section ---

export interface AuraPivotLayoutOptions {
  showTitle?: boolean;
  title?: string;
  notes?: string;
  density?: Density;
  alternateRows?: boolean;
  enableDrillThrough?: boolean;
  drillThroughStickyColumns?: number;
  totalsRowsPosition?: TotalsPosition;
  totalsRowsSticky?: boolean;
  totalsColumnsPosition?: TotalsPosition;
  totalsColumnsSticky?: boolean;
  measuresAxis?: MeasuresAxis;
}

// --- data section element shapes ---

export interface AuraPivotFieldEntry {
  fieldName?: string;
  uniqueName: string;
  dataType?: DataType;
  caption?: string;
  showInDrillThrough?: boolean;
  drillThroughOrder?: number;
  dateFormat?: string | null;
}

export interface AuraPivotCalculatedFieldEntry {
  uniqueName: string;
  caption?: string;
  formula: string;
}

export interface AuraPivotDimensionEntry {
  axis: DimensionAxis;
  uniqueName: string;
  fieldSort?: Record<string, unknown> | null;
}

export interface AuraPivotMeasureEntry {
  uniqueName: string;
  /** Defaults to `"sum"` when omitted — see `PivotEngine`'s slice builder. */
  aggregation?: Aggregation;
  hidden?: boolean;
}

/** A filter entry carrying exactly one of: members / value / range */
export interface AuraPivotFilterEntry {
  uniqueName: string;
  members?: unknown[];
  value?: unknown;
  range?: { min?: number; max?: number };
}

export interface AuraPivotDataOptions {
  fields?: AuraPivotFieldEntry[];
  calculatedFields?: AuraPivotCalculatedFieldEntry[];
  dimensions?: AuraPivotDimensionEntry[];
  measures?: AuraPivotMeasureEntry[];
  filters?: AuraPivotFilterEntry[];
}

// --- format section element shapes ---

export interface AuraPivotCellStyle {
  /** Hex `#RRGGBB`; `""` means inherit/reset, `null` means unset. */
  textColor?: string | null;
  /** Hex `#RRGGBB`; `""` means inherit/reset, `null` means unset. */
  backgroundColor?: string | null;
  fontWeight?: number;
  italic?: boolean;
}

export interface AuraPivotConditionalRule {
  /** Stable rule id. */
  id?: string;
  /** Target measure key. */
  measure?: string;
  operator?: Operator;
  value?: unknown;
  value2?: unknown;
  style?: AuraPivotCellStyle;
}

export interface AuraPivotFormatOptions {
  conditionalMode?: ConditionalMode;
  conditional?: AuraPivotConditionalRule[];
  /** Section format map — keys are measure/field unique names; values are format objects */
  values?: Record<string, unknown>;
  valuesByMeasure?: Record<string, Record<string, unknown>>;
  headers?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
  grandTotals?: Record<string, unknown>;
}

// --- top-level options shape ---

export interface AuraPivotOptions {
  toolbar?: AuraPivotToolbarOptions;
  layout?: AuraPivotLayoutOptions;
  data?: AuraPivotDataOptions;
  format?: AuraPivotFormatOptions;
}

// ---------------------------------------------------------------------------
// Component props
//
// The ref handle is declared in AuraPivot.tsx, where PivotEngine can be named
// without dragging the React layer into the framework-agnostic core.
// ---------------------------------------------------------------------------

export interface AuraPivotProps {
  width?: string | number;
  height?: string | number;
  locale?: string;
  localization?: Record<string, unknown>;
  options?: AuraPivotOptions;
  dataSource?: DataRow[];
  onOptionsChange?: (next: AuraPivotOptions) => void;
  beforeToolbarCreated?: (...args: unknown[]) => unknown;
  theme?: object | ((outer: object) => object);
}
