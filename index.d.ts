/**
 * Public type declarations for @its/aura-pivot.
 *
 * Hand-maintained and copied to dist/ at build time (see `copyTypes` in
 * rollup.config.js). Keep in sync with the public surface re-exported from
 * index.js and the schema documented in docs/options-guide.en.md.
 */

import * as React from "react";

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

/**
 * Localization dictionary — nested sections of caption strings. Ships
 * unbundled: import one from `@its/aura-pivot/locales/en.json` /
 * `…/locales/it.json` or supply your own object with the same shape.
 */
export interface LocalizationDictionary {
  fieldsList?: Record<string, string>;
  grid?: Record<string, string>;
  aggregations?: Record<string, string>;
  buttons?: Record<string, string>;
  toolbar?: Record<string, string>;
  filterBar?: Record<string, string>;
  filterEditor?: Record<string, string>;
  dimensionFilter?: Record<string, string>;
  drillThrough?: Record<string, string>;
  calculatedField?: Record<string, string>;
  formatDialog?: Record<string, string>;
  /** Month / weekday names and date-related labels. */
  dates?: Record<string, unknown>;
  freeplan?: Record<string, string>;
  [section: string]: unknown;
}

/**
 * Merges `override` over `base` one section level deep (section objects are
 * merged, anything else is replaced). Use to layer per-instance caption
 * overrides over a stock dictionary.
 */
export declare function mergeLocalization(
  base: LocalizationDictionary | null | undefined,
  override: LocalizationDictionary | null | undefined
): LocalizationDictionary;

// ---------------------------------------------------------------------------
// `options` schema (see docs/options-guide.en.md)
// ---------------------------------------------------------------------------

export interface PivotToolbarOptions {
  /** Master on/off for the whole toolbar. Default `true`. */
  visible?: boolean;
  showFields?: boolean;
  showFormat?: boolean;
  showExport?: boolean;
  showFullscreen?: boolean;
  [key: string]: unknown;
}

export interface PivotLayoutOptions {
  showTitle?: boolean;
  title?: string;
  notes?: string;
  density?: "Compact" | "Standard" | "Comfortable";
  alternateRows?: boolean;
  enableDrillThrough?: boolean;
  drillThroughStickyColumns?: number;
  totalsRowsPosition?: "before" | "after" | "none";
  totalsRowsSticky?: boolean;
  totalsColumnsPosition?: "before" | "after" | "none";
  totalsColumnsSticky?: boolean;
  measuresAxis?: "rows" | "columns";
  [key: string]: unknown;
}

export interface PivotFieldDef {
  /** Identifier referenced by dimensions / measures / filters. */
  uniqueName: string;
  /** Original column name in `dataSource` (defaults to `uniqueName`). */
  fieldName?: string;
  dataType?: "number" | "string" | "date" | "time" | "month";
  caption?: string;
  showInDrillThrough?: boolean;
  drillThroughOrder?: number;
  dateFormat?: string | null;
  [key: string]: unknown;
}

export interface PivotCalculatedFieldDef {
  uniqueName: string;
  caption?: string;
  /** e.g. `IF(callCount == 0, 0, answeredCallCount / callCount)` */
  formula: string;
  [key: string]: unknown;
}

export interface PivotDimensionDef {
  axis: "row" | "column";
  uniqueName: string;
  fieldSort?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type PivotAggregation =
  | "sum"
  | "count"
  | "distinctcount"
  | "avg"
  | "min"
  | "max"
  | "formula";

export interface PivotMeasureDef {
  uniqueName: string;
  aggregation?: PivotAggregation;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface PivotFilterDef {
  uniqueName: string;
  /** Provide exactly one of `members`, `value`, `range`. */
  members?: unknown[];
  value?: unknown;
  range?: { min?: number; max?: number };
  [key: string]: unknown;
}

export interface PivotDataOptions {
  fields?: PivotFieldDef[];
  calculatedFields?: PivotCalculatedFieldDef[];
  dimensions?: PivotDimensionDef[];
  measures?: PivotMeasureDef[];
  filters?: PivotFilterDef[];
  [key: string]: unknown;
}

export interface PivotConditionalRule {
  id?: string;
  /** Target measure key `"<uniqueName>:<aggregation>"`. */
  measure?: string;
  operator: string;
  value?: number;
  value2?: number;
  style?: {
    textColor?: string | null;
    backgroundColor?: string | null;
    fontWeight?: number | string;
    italic?: boolean;
  };
  [key: string]: unknown;
}

export interface PivotFormatOptions {
  conditionalMode?: "first" | "all";
  conditional?: PivotConditionalRule[];
  values?: Record<string, unknown>;
  valuesByMeasure?: Record<string, Record<string, unknown>>;
  headers?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
  grandTotals?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PivotOptions {
  toolbar?: PivotToolbarOptions;
  layout?: PivotLayoutOptions;
  data?: PivotDataOptions;
  format?: PivotFormatOptions;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Engine / matrix (escape-hatch surface; intentionally loose)
// ---------------------------------------------------------------------------

export type PivotEngineEvent = "dataChange" | "reportChange" | "formatChange";

export interface ComputedMatrix {
  rowLeaves: Array<Record<string, unknown>>;
  colLeaves: Array<Record<string, unknown>>;
  /** Keyed `"<rowKey>||<colKey>||<measureKey>"`. */
  cells: Map<string, Record<string, unknown>>;
  measures: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Raw engine escape hatch (`ref.engine`). The full method surface is
 * internal; the members below are the supported subset.
 */
export interface PivotEngine {
  on(event: PivotEngineEvent, handler: () => void): void;
  off(event: PivotEngineEvent, handler: () => void): void;
  processMatrix(): ComputedMatrix;
  getRows(): Array<Record<string, unknown>>;
  getOptions(): Record<string, unknown>;
  setOptions(patch: Record<string, unknown>): void;
  getFormat(): Record<string, unknown>;
  setLocale(locale: string | undefined): void;
  setLocalization(dictionary: LocalizationDictionary): void;
  exportExcel(fileName?: string): Promise<void>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Toolbar customization (`beforeToolbarCreated`)
// ---------------------------------------------------------------------------

export interface ToolbarTab {
  id: string;
  title: string;
  handler?: () => void;
  /** Built-in icon name, raw `<svg>` markup (sanitized) or a ReactNode. */
  icon?: string | React.ReactNode;
  iconOnly?: boolean;
  rightGroup?: boolean;
  menu?: ToolbarTab[];
  [key: string]: unknown;
}

export interface ToolbarApi {
  getTabs: () => ToolbarTab[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AuraPivotRef {
  auraPivot: {
    /** Returns the current `options` schema. */
    getOptions: () => PivotOptions;
  };
  /** Raw engine escape hatch. */
  engine: PivotEngine;
}

export interface AuraPivotProps {
  width?: string | number;
  height?: string | number;
  /** BCP-47 locale for every Intl / localeCompare call. `undefined` = browser default. */
  locale?: string;
  localization?: LocalizationDictionary;
  /** Applied seed-on-change: re-applied only when the object reference changes. */
  options?: PivotOptions;
  /** Plain array of row objects; the schema lives in `options.data.fields`. */
  dataSource?: Array<Record<string, unknown>>;
  /** Fired after every in-component edit with the complete updated options. */
  onOptionsChange?: (nextOptions: PivotOptions) => void;
  beforeToolbarCreated?: (toolbar: ToolbarApi) => void;
  /** MUI theme object, or `(outerTheme) => theme` for partial overrides. */
  theme?: Record<string, unknown> | ((outerTheme: unknown) => unknown);
}

export declare const Pivot: React.ForwardRefExoticComponent<
  AuraPivotProps & React.RefAttributes<AuraPivotRef>
>;

// ---------------------------------------------------------------------------
// Context + hooks
// ---------------------------------------------------------------------------

export interface PivotContextValue {
  engine: PivotEngine;
  localization: LocalizationDictionary;
  locale: string | undefined;
  options: Record<string, unknown>;
  fullscreenRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
}

export declare const PivotProvider: React.FC<{
  value: PivotContextValue;
  children?: React.ReactNode;
}>;

export declare function usePivot(): PivotContextValue;

export declare function usePivotMatrix(
  engine: PivotEngine | null | undefined
): { matrix: ComputedMatrix | null; loading: boolean };

export default Pivot;
