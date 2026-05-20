/**
 * Type definitions for the pivot-core library.
 * Single source of truth for all shared interfaces and the public AuraPivot API.
 */

import "@mui/material/styles"; // side-effect import — required so the `declare module` augmentation below merges

// ---------------------------------------------------------------------------
// Core engine types (ported from JSDoc typedefs)
// ---------------------------------------------------------------------------

export type FieldType = "string" | "number" | "date" | "time" | "month" | "weekday";

export interface FieldMeta {
  type: FieldType;
  caption: string;
}

export type MetadataRow = Record<string, FieldMeta>;
export type DataRow = Record<string, string | number | null>;

export type SortDirection = "asc" | "desc" | "none";
export type AggregationType = "sum" | "count" | "distinctcount" | "avg" | "min" | "max";

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

export interface PivotOptions {
  sorting?: "columns" | "rows" | "none";
  drillThrough?: boolean;
}

export interface Report {
  slice: Slice;
  dataSource?: { data?: unknown[]; dataSourceType?: "json" };
  options?: PivotOptions;
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

export type EngineEvent = "dataChange" | "reportChange" | "formatChange";
export type EngineEventHandler = (...args: unknown[]) => void;

// ---------------------------------------------------------------------------
// Public AuraPivotOptions types
// (enum unions from optionsSchema.js; shapes from optionsPropType.js)
// ---------------------------------------------------------------------------

export type Density = "Compact" | "Standard" | "Comfortable";
export type TotalsPosition = "before" | "after" | "none";
export type MeasuresAxis = "rows" | "columns";
export type DimensionAxis = "row" | "column";
export type Aggregation = "sum" | "count" | "distinctcount" | "avg" | "min" | "max" | "formula";
export type Operator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "between";
export type ConditionalMode = "first" | "all";
export type DataType = "number" | "string" | "date" | "time" | "month";
/** Wired into the section-format maps (values/headers/dimensions/grandTotals) in Task 6. */
export type TextAlign = "left" | "center" | "right";

// --- toolbar section (from optionsPropType.js toolbar shape) ---

export interface AuraPivotToolbarOptions {
  visible?: boolean;
  showFields?: boolean;
  showFormat?: boolean;
  showExport?: boolean;
  showFullscreen?: boolean;
}

// --- layout section (from optionsPropType.js layout shape) ---

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

// --- data section element shapes (from optionsPropType.js data shape) ---

export interface AuraPivotFieldEntry {
  fieldName?: string;
  uniqueName: string;
  dataType?: DataType;
  caption?: string;
  showInDrillThrough?: boolean;
  drillThroughOrder?: number;
  dateFormat?: string;
}

export interface AuraPivotCalculatedFieldEntry {
  uniqueName: string;
  caption?: string;
  formula: string;
}

export interface AuraPivotDimensionEntry {
  axis: DimensionAxis;
  uniqueName: string;
  fieldSort?: Record<string, unknown>;
}

export interface AuraPivotMeasureEntry {
  uniqueName: string;
  aggregation: Aggregation;
  hidden?: boolean;
}

/** A filter entry carrying exactly one of: members / value / range */
export interface AuraPivotFilterEntry {
  uniqueName?: string;
  members?: string[];
  value?: unknown;
  range?: unknown;
}

export interface AuraPivotDataOptions {
  fields?: AuraPivotFieldEntry[];
  calculatedFields?: AuraPivotCalculatedFieldEntry[];
  dimensions?: AuraPivotDimensionEntry[];
  measures?: AuraPivotMeasureEntry[];
  filters?: AuraPivotFilterEntry[];
}

// --- format section element shapes (from optionsPropType.js format shape) ---

export interface AuraPivotCellStyle {
  /** Hex `#RRGGBB`; `""` means inherit/reset, `null` means unset (see `hexColor` validator in optionsPropType.js). */
  textColor?: string | null;
  /** Hex `#RRGGBB`; `""` means inherit/reset, `null` means unset. */
  backgroundColor?: string | null;
  fontWeight?: number;
  italic?: boolean;
}

export interface AuraPivotConditionalRule {
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
  valuesByMeasure?: Record<string, unknown>;
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
// Ref handle and component props
// ---------------------------------------------------------------------------

export interface AuraPivotHandle {
  auraPivot: { getOptions: () => AuraPivotOptions };
  engine: unknown; // narrowed to PivotEngine where consumed
}

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

// ---------------------------------------------------------------------------
// MUI theme augmentation — custom tokens consumed by AuraPivot.jsx
// (side-effect import lives at the top of the file)
// ---------------------------------------------------------------------------

declare module "@mui/material/styles" {
  interface Theme {
    font?: { primary?: string; mono?: string; display?: string };
    /** Custom border-radius token (unitless number, like shape.borderRadius). */
    borderRadius?: number;
  }
  interface ThemeOptions {
    font?: { primary?: string; mono?: string; display?: string };
    borderRadius?: number;
  }
}
