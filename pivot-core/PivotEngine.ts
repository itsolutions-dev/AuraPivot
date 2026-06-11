/**
 * Orchestrator class. Replicates the subset of the auraPivot engine API
 * that is actually consumed by the DBE-CRM app:
 *
 *   - setData(rawDataset)
 *   - setReport(report)
 *   - getReport()
 *   - processMatrix()
 *   - setFormat(format) / getFormat()
 *   - on(event, handler) / off(event, handler)
 *
 * All computation happens in-process. The PivotTable React component offloads
 * expensive pipelines (>5000 rows) to a Web Worker via the WorkerBridge hook;
 * for smaller datasets the matrix is produced synchronously inside
 * processMatrix() so the first render is immediate.
 */

import type {
  EngineEvent,
  EngineEventHandler,
  MetadataRow,
  DataRow,
  TreeNode,
} from "./types";
import type { ExpandedMetadataRow } from "./data/DateHierarchyExpander";
import type { ComputedMatrix, EnrichedMeasure } from "./matrix/MatrixComputer";
import { normalizeDataset } from "./data/DataNormalizer";
import { expandHierarchies } from "./data/DateHierarchyExpander";
import type { RichSliceField } from "./slice/TreeBuilder";
import { buildTree, findNodeByKey } from "./slice/TreeBuilder";
import { applyFilters } from "./slice/FilterEngine";
import type { FilterEntry } from "./slice/FilterEngine";
import { computeMatrix } from "./matrix/MatrixComputer";
import { exportMatrixToExcel } from "./export/ExcelExporter";
import { formatDateValue, formatSubpartValue } from "./format/DateFormatter";

// ---------------------------------------------------------------------------
// Engine-internal type definitions
// ---------------------------------------------------------------------------

/** A calculated field as stored internally by the engine. */
export interface InternalCalculatedField {
  uniqueName: string;
  caption: string;
  formula: string;
}

/** Engine-internal slice field (may have extra fields beyond SliceField). */
interface InternalSliceField {
  uniqueName: string;
  sort?: string;
  caption?: string;
  fieldSort?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Engine-internal slice measure (wider aggregation than public type). */
interface InternalSliceMeasure {
  uniqueName: string;
  aggregation: string;
  caption?: string;
  availableAggregations?: string[];
  [key: string]: unknown;
}

/** Engine-internal expands config. */
interface InternalExpands {
  expandAll?: boolean;
  expandedMembers?: string[];
  [key: string]: unknown;
}

/** Engine-internal sort config (dual-axis, post-migration). */
interface InternalSort {
  colKey?: string;
  colDirection?: string;
  colMeasure?: unknown;
  rowKey?: string;
  rowDirection?: string;
  rowMeasure?: unknown;
  [key: string]: unknown;
}

/** Engine-internal slice — wider than the public Slice type. */
export interface InternalSlice {
  rows: InternalSliceField[];
  columns: InternalSliceField[];
  measures: InternalSliceMeasure[];
  expands: InternalExpands;
  filters: FilterEntry[];
  sort?: InternalSort | null;
  [key: string]: unknown;
}

/** Cell style format fields (values, headers, dimensions, grandTotals). */
interface CellStyleFormat {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  textColor?: string | null;
  backgroundColor?: string | null;
  textAlign?: string;
  thousandSeparator?: string;
  decimalSeparator?: string;
  numberOfDecimals?: string | number;
  currencySymbol?: string;
  currencyOther?: string;
  currencyAlignment?: string;
  nullValue?: string;
  percentage?: boolean;
  [key: string]: unknown;
}

/** Layout format section. */
interface LayoutFormat {
  totalsRowsPosition?: string;
  totalsRowsSticky?: boolean;
  totalsColumnsPosition?: string;
  totalsColumnsSticky?: boolean;
  alternateRows?: boolean;
  [key: string]: unknown;
}

/** A conditional formatting rule as stored internally. */
interface ConditionalRule {
  operator?: string;
  value?: unknown;
  value2?: unknown;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Engine-internal format state. */
interface InternalFormat {
  values: CellStyleFormat;
  valuesByMeasure: Record<string, CellStyleFormat>;
  headers: CellStyleFormat;
  grandTotals: CellStyleFormat;
  dimensions: CellStyleFormat;
  layout: LayoutFormat;
  conditional: ConditionalRule[];
  conditionalMode: "first" | "all";
}

/** Engine-internal options (superset of public AuraPivotOptions). */
export interface InternalOptions {
  grid?: { type?: string; showHeaders?: boolean; [key: string]: unknown };
  sorting?: string;
  enableDrillThrough?: boolean;
  toolbar?: {
    showExport?: boolean;
    showFullscreen?: boolean;
    showFormat?: boolean;
    showFields?: boolean;
    showReset?: boolean;
    visible?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Localization shape (superset — engine reads sub-keys dynamically). */
interface InternalLocalization {
  grid?: {
    total?: string;
    measureCaptionTemplate?: string;
    grandTotalMeasureCaptionTemplate?: string;
    [key: string]: unknown;
  };
  aggregations?: Record<string, string>;
  dates?: unknown;
  [key: string]: unknown;
}

/** Date localization pushed by setDateLocalization. */
interface DateLocalization {
  monthNames?: string[];
  weekdayNames?: string[];
  hierarchyParts?: Record<string, string>;
  quarterLabel?: string;
  quarterShortPrefix?: string;
  weekLabel?: string;
  [key: string]: unknown;
}

/** Drill-through per-field visibility config. */
type DrillThroughFieldsMap = Record<string, boolean>;

/**
 * Typed snapshot returned by `getFormat()`. Keys match exactly what the method
 * returns; `general` is a back-compat alias for `values`.
 */
export interface FormatSnapshot {
  values: CellStyleFormat;
  valuesByMeasure: Record<string, CellStyleFormat>;
  headers: CellStyleFormat;
  grandTotals: CellStyleFormat;
  dimensions: CellStyleFormat;
  layout: LayoutFormat;
  /** Back-compat alias for `values` — several call sites still read `general`. */
  general: CellStyleFormat;
  conditional: ConditionalRule[];
  conditionalMode: "first" | "all";
}

/**
 * Typed snapshot returned by `getReport()`. Mirrors the shape consumed by
 * `setReport()` so the round-trip is type-safe.
 */
export interface ReportSnapshot {
  slice: InternalSlice;
  options: InternalOptions;
  formats: FormatSnapshot;
  dateFormats: Record<string, string>;
  fieldOrder: string[];
  drillThrough: {
    fields: DrillThroughFieldsMap;
    frozenCount: number;
  };
  calculatedFields: InternalCalculatedField[];
  dataSource: {
    dataSourceType: string;
    data: [MetadataRow, ...DataRow[]];
  };
}

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

/**
 * Italian labels for each aggregation. Used as a fallback when no
 * localization dictionary has been pushed to the engine. At runtime
 * `_resolveAggLabel` prefers the caller-supplied `aggregations` section
 * so captions follow the active UI language.
 */
const AGG_LABEL: Record<string, string> = {
  sum: "Sum",
  count: "Count",
  distinctcount: "Distinct count",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
  formula: "Calculated",
  ratioTotal: "Ratio to total",
  currentRatio: "Current ratio",
};

// Maps the engine's internal aggregation keys onto the keys used inside
// the react-pivot localization dictionaries (which use `average` instead
// of `avg`).
const AGG_LOCALE_KEY: Record<string, string> = {
  sum: "sum",
  count: "count",
  distinctcount: "distinctcount",
  avg: "average",
  min: "min",
  max: "max",
  ratioTotal: "ratioTotal",
  currentRatio: "currentRatio",
};

const DEFAULT_SLICE: InternalSlice = {
  rows: [],
  columns: [],
  measures: [],
  expands: { expandAll: true },
  filters: [],
};

// Migrate legacy single-axis sort `{ colKey|rowKey, direction, measure }` to
// the dual-axis shape `{ colKey, colDirection, colMeasure, rowKey,
// rowDirection, rowMeasure }`. Reports saved before the dual-axis change
// keep working after a reload.
function migrateSort(sort: unknown): InternalSort | null {
  if (!sort) return null;
  const s = sort as Record<string, unknown>;
  const legacy = s["direction"] !== undefined || s["measure"] !== undefined;
  if (!legacy) return s as InternalSort;
  const next: InternalSort = {};
  if (s["colKey"]) {
    next.colKey = s["colKey"] as string;
    next.colDirection = (s["direction"] as string) || "desc";
    next.colMeasure = s["measure"] || null;
  }
  if (s["rowKey"]) {
    next.rowKey = s["rowKey"] as string;
    next.rowDirection = (s["direction"] as string) || "desc";
    next.rowMeasure = s["measure"] || null;
  }
  return next.colKey || next.rowKey ? next : null;
}

const DEFAULT_OPTIONS: InternalOptions = {
  grid: { type: "compact", showHeaders: false },
  sorting: "columns",
  enableDrillThrough: true,
  // Toolbar button visibility — set to false to hide a tab.
  toolbar: {
    //showReset: true,
    showExport: true,
    showFullscreen: true,
    showFormat: true,
    showFields: true,
  },
};

const DEFAULT_VALUES_FORMAT: CellStyleFormat = {
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 400,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "right",
  thousandSeparator: "System",
  decimalSeparator: "System",
  numberOfDecimals: "Default",
  currencySymbol: "None",
  currencyOther: "",
  currencyAlignment: "Left",
  nullValue: "",
  percentage: false,
};

const DEFAULT_HEADERS_FORMAT: CellStyleFormat = {
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_DIMENSIONS_FORMAT: CellStyleFormat = {
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 500,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_GRAND_TOTALS_FORMAT: CellStyleFormat = {
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 700,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_LAYOUT: LayoutFormat = {
  totalsRowsPosition: "before", // 'before' | 'after' | 'none'
  totalsRowsSticky: false, // pin grand-total row(s) during vertical scroll
  totalsColumnsPosition: "before", // 'before' | 'after' | 'none'
  totalsColumnsSticky: false, // pin grand-total column(s) during horizontal scroll
  alternateRows: false,
};

class PivotEngine {
  // ---- class field declarations ----------------------------------------

  /** Raw metadata from normalizeDataset (pre-expansion). */
  private _metadata: MetadataRow;
  /** Raw data rows from normalizeDataset (pre-expansion). */
  private _rows: DataRow[];
  /** Date-hierarchy-expanded metadata (used everywhere downstream). */
  private _expandedMeta: ExpandedMetadataRow;
  /** Date-hierarchy-expanded data rows. */
  private _expandedRows: DataRow[];
  /** Current slice (rows/columns/measures/filters/expands/sort). */
  private _slice: InternalSlice;
  /** Engine-internal options (superset of public AuraPivotOptions). */
  private _options: InternalOptions;
  /** Current format state. */
  private _format: InternalFormat;
  /** Calculated fields defined by the user. */
  private _calculatedFields: InternalCalculatedField[];
  /** Event listeners map. */
  private readonly _listeners: Map<EngineEvent, Set<EngineEventHandler>> = new Map();
  /** Cached pivot matrix (null when dirty or never computed). */
  private _matrix: ComputedMatrix | null;
  /** Whether the cached matrix is stale and needs recomputation. */
  private _dirty: boolean;
  /** Date localization (month names, weekday names, hierarchy labels). */
  private _dateLocalization: DateLocalization | null;
  /** Full localization dictionary (grid labels, aggregation captions, etc.). */
  private _localization: InternalLocalization | null;
  /** Raw dataset as passed to setData (needed for re-expansion on locale change). */
  private _rawDataset: unknown;
  /**
   * BCP-47 locale pushed by the Pivot wrapper. `undefined` means
   * "use the browser default" and is passed verbatim to Intl APIs.
   */
  private _locale: string | undefined;
  /**
   * Per-date-field format: { uniqueName: 'locale-date' | 'locale-datetime' |
   * 'iso' | 'iso-date' | '<pattern>' }. Missing entries use the browser
   * locale short date.
   */
  private _dateFormats: Record<string, string>;
  /**
   * User-defined display order for the FieldList "All fields" list. Stored
   * as an array of uniqueNames; fields not present in the array fall back
   * to metadata-iteration order at the tail. Also drives the column order
   * in the drill-through dialog.
   */
  private _fieldOrder: string[];
  /**
   * Per-field opt-out for the drill-through table. Absent key = visible
   * (default-on, preserves the legacy "show every metadata field" UX).
   */
  private _drillThroughFields: DrillThroughFieldsMap;
  /**
   * Number of left-pinned columns in the drill-through table. Clamped at
   * read time against the count of currently visible fields.
   */
  private _drillThroughFrozenCount: number;

  constructor() {
    this._metadata = {};
    this._rows = [];
    this._expandedMeta = {};
    this._expandedRows = [];
    this._slice = { ...DEFAULT_SLICE };
    this._options = { ...DEFAULT_OPTIONS };
    this._format = {
      values: { ...DEFAULT_VALUES_FORMAT },
      valuesByMeasure: {},
      headers: { ...DEFAULT_HEADERS_FORMAT },
      grandTotals: { ...DEFAULT_GRAND_TOTALS_FORMAT },
      dimensions: { ...DEFAULT_DIMENSIONS_FORMAT },
      layout: { ...DEFAULT_LAYOUT },
      conditional: [],
      conditionalMode: "first",
    };
    this._calculatedFields = [];
    this._matrix = null;
    this._dirty = true;
    this._dateLocalization = null;
    this._localization = null;
    this._rawDataset = null;
    this._locale = undefined;
    this._dateFormats = {};
    this._fieldOrder = [];
    this._drillThroughFields = {};
    this._drillThroughFrozenCount = 0;
  }

  // ---- event bus -----------------------------------------------------

  on(event: EngineEvent, handler: EngineEventHandler): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
  }

  off(event: EngineEvent, handler: EngineEventHandler): void {
    this._listeners.get(event)?.delete(handler);
  }

  private _emit(event: EngineEvent, ...args: unknown[]): void {
    this._listeners.get(event)?.forEach((h) => {
      try {
        h(...args);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[PivotEngine] listener error", e);
      }
    });
  }

  // ---- data ----------------------------------------------------------

  setData(rawDataset: unknown): void {
    this._rawDataset = rawDataset;
    // dynamic boundary: cast unknown → unknown[] (normalizeDataset validates at runtime)
    const { metadata, rows } = normalizeDataset(rawDataset as unknown[]);
    const expanded = expandHierarchies(metadata, rows, this._dateLocalization ?? undefined);
    this._metadata = metadata;
    this._rows = rows;
    this._expandedMeta = expanded.metadata;
    this._expandedRows = expanded.rows;
    this._dirty = true;
    this._emit("dataChange");
  }

  /**
   * Stores the full localization dictionary so the engine can produce
   * localized captions (grand-total label, measure captions like
   * "Sum Total of <field>"). The dates sub-section should still be
   * pushed separately via setDateLocalization for the date expander.
   */
  setLocalization(localization: unknown): void {
    // A malformed dictionary is rejected (English fallback stays active) and
    // reported via console.warn in development builds — silently accepting
    // it would produce a broken UI with no clue why.
    this._localization = this._validateLocalization(localization);
    this._dirty = true;
    this._emit("dataChange");
  }

  private _validateLocalization(
    localization: unknown,
  ): InternalLocalization | null {
    if (localization === null || localization === undefined) return null;
    const isDev =
      typeof process === "undefined" ||
      process.env?.NODE_ENV !== "production";
    if (typeof localization !== "object" || Array.isArray(localization)) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.warn(
          "[PivotEngine] invalid localization dictionary: expected an object of sections, got",
          localization,
        );
      }
      return null;
    }
    if (isDev) {
      for (const [section, value] of Object.entries(
        localization as Record<string, unknown>,
      )) {
        if (
          value !== null &&
          value !== undefined &&
          (typeof value !== "object" || Array.isArray(value))
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[PivotEngine] localization section "${section}" should be an object, got`,
            value,
          );
        }
      }
    }
    return localization as InternalLocalization;
  }

  /**
   * Set the BCP-47 locale used by every Intl / localeCompare call inside
   * the engine and its matrix computer. Pass `undefined` to fall back to
   * the runtime's default (i.e. the browser locale).
   */
  setLocale(locale: string | undefined): void {
    this._locale = locale || undefined;
    this._dirty = true;
    this._emit("dataChange");
  }

  getLocale(): string | undefined {
    return this._locale;
  }

  private _totalCaption(): string {
    return this._localization?.grid?.total || "Total";
  }

  private _resolveAggLabel(agg: string): string {
    const loc = this._localization?.aggregations;
    if (loc) {
      const key = AGG_LOCALE_KEY[agg];
      if (key && loc[key]) return loc[key];
    }
    return AGG_LABEL[agg] || agg;
  }

  setDateLocalization(localization: unknown): void {
    this._dateLocalization = (localization as DateLocalization) || null;
    if (this._rawDataset) {
      // dynamic boundary: cast unknown → unknown[] (normalizeDataset validates at runtime)
      const { metadata, rows } = normalizeDataset(this._rawDataset as unknown[]);
      const expanded = expandHierarchies(
        metadata,
        rows,
        this._dateLocalization ?? undefined,
      );
      this._expandedMeta = expanded.metadata;
      this._expandedRows = expanded.rows;
      this._dirty = true;
      this._emit("dataChange");
    }
  }

  getMetadata(): ExpandedMetadataRow {
    return this._expandedMeta;
  }

  /**
   * Override the display caption for a field (data column or calculated
   * field). Mutates the expanded metadata in place so every consumer
   * (fields list, pivot headers, field chips, format dialog dropdowns)
   * picks up the new label. Pass an empty string or null to revert to the
   * data-source provided caption.
   */
  setFieldCaption(uniqueName: string, caption: string | null | undefined): void {
    if (!uniqueName) return;
    const calc = this._calculatedFields.find(
      (f) => f.uniqueName === uniqueName,
    );
    if (calc) {
      this.updateCalculatedField(uniqueName, {
        caption: caption || uniqueName,
      });
      return;
    }
    const target = this._expandedMeta?.[uniqueName];
    if (!target) return;
    target.caption = caption && caption.trim() ? caption : uniqueName;
    // Mirror into the raw metadata too so re-expansion keeps the rename.
    if (this._metadata?.[uniqueName]) {
      this._metadata[uniqueName].caption = target.caption;
    }
    this._dirty = true;
    this._emit("dataChange");
  }

  getRows(): DataRow[] {
    return this._expandedRows;
  }

  // ---- date formatting ---------------------------------------------

  setDateFormat(uniqueName: string, format: string | null | undefined): void {
    if (!uniqueName) return;
    if (!format) {
      const next = { ...this._dateFormats };
      delete next[uniqueName];
      this._dateFormats = next;
    } else {
      this._dateFormats = { ...this._dateFormats, [uniqueName]: format };
    }
    this._dirty = true;
    this._emit("formatChange");
  }

  getDateFormat(uniqueName: string): string | null {
    return this._dateFormats[uniqueName] || null;
  }

  getDateFormats(): Record<string, string> {
    return { ...this._dateFormats };
  }

  setDateFormats(map: unknown): void {
    this._dateFormats = map && typeof map === "object" ? { ...(map as Record<string, string>) } : {};
    this._dirty = true;
    this._emit("formatChange");
  }

  // ---- field order / drill-through config ---------------------------

  getFieldOrder(): string[] {
    return [...this._fieldOrder];
  }

  setFieldOrder(order: unknown): void {
    this._fieldOrder = Array.isArray(order) ? (order as unknown[]).filter(Boolean) as string[] : [];
    // Display-only: no matrix invalidation. The FieldList + DrillThrough
    // dialog re-render via the dataChange event.
    this._emit("dataChange");
  }

  getDrillThroughConfig(): { fields: DrillThroughFieldsMap; frozenCount: number } {
    return {
      fields: { ...this._drillThroughFields },
      frozenCount: this._drillThroughFrozenCount,
    };
  }

  setDrillThroughConfig(config: unknown): void {
    if (!config) return;
    const c = config as { fields?: unknown; frozenCount?: unknown };
    if (c.fields && typeof c.fields === "object") {
      this._drillThroughFields = { ...(c.fields as DrillThroughFieldsMap) };
    }
    if (Number.isFinite(c.frozenCount)) {
      this._drillThroughFrozenCount = Math.max(0, Math.floor(c.frozenCount as number));
    }
    this._emit("dataChange");
  }

  /**
   * Returns a callback matching the `BuildTreeOptions.formatValue` signature.
   * Cast is safe: RichSliceField is structurally compatible with InternalSliceField
   * and MetadataRow is compatible with ExpandedMetadataRow at runtime.
   */
  private _buildDimensionFormatter(): (field: RichSliceField, value: string | number | null) => string | undefined {
    const dateFormats = this._dateFormats;
    const meta = this._expandedMeta;
    const monthNames = this._dateLocalization?.monthNames;
    const weekdayNames = this._dateLocalization?.weekdayNames;
    const quarterLabel = this._dateLocalization?.quarterLabel;
    const quarterShortPrefix = this._dateLocalization?.quarterShortPrefix;
    const weekLabel = this._dateLocalization?.weekLabel;
    return (field, value) => {
      if (!field) return undefined;
      const m = meta[field.uniqueName];
      if (!m) return undefined;
      if (
        m.subpart &&
        m.subpart !== "year" &&
        m.subpart !== "day" &&
        m.subpart !== "hour" &&
        m.subpart !== "minute"
      ) {
        const format = dateFormats[field.uniqueName] || null;
        return formatSubpartValue(value, m.subpart, format, {
          monthNames,
          weekdayNames,
          quarterLabel,
          quarterShortPrefix,
          weekLabel,
        });
      }
      if (m.type === "date") {
        const format = dateFormats[field.uniqueName] || "locale-date";
        return formatDateValue(value, format, { monthNames, weekdayNames });
      }
      return undefined;
    };
  }

  getAvailableFields(): Array<{ uniqueName: string; caption: string; type: string; isCalculated?: boolean; formula?: string }> {
    const base = Object.entries(this._expandedMeta).map(
      ([uniqueName, meta]) => ({
        uniqueName,
        caption: meta.caption || uniqueName,
        type: meta.type,
      }),
    );
    const calc = this._calculatedFields.map((f) => ({
      uniqueName: f.uniqueName,
      caption: f.caption,
      type: "number",
      isCalculated: true,
      formula: f.formula,
    }));
    return [...base, ...calc];
  }

  // ---- calculated fields --------------------------------------------

  getCalculatedFields(): InternalCalculatedField[] {
    return this._calculatedFields.map((f) => ({ ...f }));
  }

  setCalculatedFields(fields: unknown): void {
    this._calculatedFields = Array.isArray(fields)
      ? (fields as unknown[]).map((f) => ({ ...(f as InternalCalculatedField) }))
      : [];
    this._dirty = true;
    this._emit("dataChange");
  }

  /**
   * Apply a list of field-config overrides (caption only for now). Each entry
   * is `{ uniqueName, caption }`; missing entries leave the data-source value
   * untouched.
   */
  setFields(fields: unknown): void {
    if (!Array.isArray(fields)) return;
    (fields as unknown[]).forEach((f) => {
      const field = f as { uniqueName?: string; caption?: string } | null;
      if (!field?.uniqueName) return;
      if (field.caption !== undefined)
        this.setFieldCaption(field.uniqueName, field.caption);
    });
  }

  addCalculatedField({ uniqueName, caption, formula }: { uniqueName?: string; caption?: string; formula?: string }): void {
    const id = uniqueName || `calc_${Date.now()}`;
    this._calculatedFields = [
      ...this._calculatedFields.filter((f) => f.uniqueName !== id),
      { uniqueName: id, caption: caption || id, formula: formula || "0" },
    ];
    this._dirty = true;
    this._emit("dataChange");
  }

  updateCalculatedField(uniqueName: string, { caption, formula }: { caption?: string; formula?: string }): void {
    this._calculatedFields = this._calculatedFields.map((f) =>
      f.uniqueName === uniqueName
        ? { ...f, caption: caption ?? f.caption, formula: formula ?? f.formula }
        : f,
    );
    this._dirty = true;
    this._emit("dataChange");
  }

  removeCalculatedField(uniqueName: string): void {
    this._calculatedFields = this._calculatedFields.filter(
      (f) => f.uniqueName !== uniqueName,
    );
    // Also remove from any slice arrays where it might have been placed.
    const strip = (arr: InternalSliceField[] | InternalSliceMeasure[] | FilterEntry[]) =>
      (arr || []).filter((f) => f.uniqueName !== uniqueName);
    this._slice = {
      ...this._slice,
      measures: strip(this._slice.measures) as InternalSliceMeasure[],
      rows: strip(this._slice.rows) as InternalSliceField[],
      columns: strip(this._slice.columns) as InternalSliceField[],
      filters: strip(this._slice.filters) as FilterEntry[],
    };
    this._dirty = true;
    this._emit("dataChange");
  }

  // ---- slice / options ----------------------------------------------

  setSlice(slice: unknown, { silent = false } = {}): void {
    const s = (slice || {}) as Record<string, unknown>;
    this._slice = {
      ...DEFAULT_SLICE,
      ...s,
      rows: (s["rows"] as InternalSliceField[]) || [],
      columns: (s["columns"] as InternalSliceField[]) || [],
      measures: (s["measures"] as InternalSliceMeasure[]) || [],
      expands: (s["expands"] as InternalExpands) || { expandAll: true },
      filters: (s["filters"] as FilterEntry[]) || [],
      sort: migrateSort(s["sort"]),
    };
    this._dirty = true;
    if (!silent) this._emit("reportChange");
  }

  getSlice(): InternalSlice {
    return { ...this._slice };
  }

  setOptions(options: unknown): void {
    this._options = { ...this._options, ...(options || {}) } as InternalOptions;
  }

  getOptions(): InternalOptions {
    return this._options;
  }

  // ---- format -------------------------------------------------------

  setFormat(format: unknown, { silent = false } = {}): void {
    if (!format) return;
    const f = format as Record<string, unknown>;
    // Back-compat: accept `general` as an alias of `values`.
    const incomingValues = (f["values"] || f["general"] || null) as Record<string, unknown> | null;
    const incomingByMeasure =
      f["valuesByMeasure"] && typeof f["valuesByMeasure"] === "object"
        ? (f["valuesByMeasure"] as Record<string, unknown>)
        : null;
    this._format = {
      values: {
        ...this._format.values,
        ...(incomingValues || {}),
      },
      valuesByMeasure: incomingByMeasure
        ? Object.fromEntries(
            Object.entries(incomingByMeasure)
              .filter(([, v]) => v && typeof v === "object")
              .map(([k, v]) => [k, { ...(v as CellStyleFormat) }]),
          )
        : { ...this._format.valuesByMeasure },
      headers: {
        ...this._format.headers,
        ...((f["headers"] as Record<string, unknown>) || {}),
      },
      grandTotals: {
        ...this._format.grandTotals,
        ...((f["grandTotals"] as Record<string, unknown>) || {}),
      },
      dimensions: {
        ...this._format.dimensions,
        ...((f["dimensions"] as Record<string, unknown>) || {}),
      },
      layout: {
        ...this._format.layout,
        ...((f["layout"] as Record<string, unknown>) || {}),
      },
      conditional: Array.isArray(f["conditional"])
        ? (f["conditional"] as unknown[]).map((r) => ({ ...(r as ConditionalRule) }))
        : this._format.conditional,
      conditionalMode:
        f["conditionalMode"] === "all" || f["conditionalMode"] === "first"
          ? (f["conditionalMode"] as "first" | "all")
          : this._format.conditionalMode || "first",
    };
    // Layout changes affect total placement and alternating-row metadata that
    // are baked into the matrix output, so invalidate the cached matrix.
    if (f["layout"]) this._dirty = true;
    if (!silent) this._emit("formatChange");
  }

  getFormat(): FormatSnapshot {
    return {
      values: { ...this._format.values },
      valuesByMeasure: Object.fromEntries(
        Object.entries(this._format.valuesByMeasure || {}).map(([k, v]) => [
          k,
          { ...v },
        ]),
      ),
      headers: { ...this._format.headers },
      grandTotals: { ...this._format.grandTotals },
      dimensions: { ...this._format.dimensions },
      layout: { ...this._format.layout },
      // Back-compat alias — several call sites still read `general`.
      general: { ...this._format.values },
      conditional: this._format.conditional.map((r) => ({ ...r })),
      conditionalMode: this._format.conditionalMode || "first",
    };
  }

  // ---- report (auraPivot-compatible) -----------------------------

  setReport(report: unknown): void {
    // Programmatic setReport must NOT emit reportChange — consumers
    // commonly invoke it from a useEffect that listens to their local
    // copy of the report, so re-emitting would create an infinite loop.
    if (!report) return;
    const r = report as Record<string, unknown>;
    if (r["slice"]) this.setSlice(r["slice"], { silent: true });
    if (r["options"]) this.setOptions(r["options"]);
    // NOT silent: the grid (PivotTable) listens to `formatChange` to sync
    // its local format snapshot. Without emitting, a programmatic setReport
    // leaves the grid rendering with stale defaults until the user opens
    // and re-applies the FormatDialog.
    if (r["formats"]) this.setFormat(r["formats"]);
    if (r["dateFormats"] && typeof r["dateFormats"] === "object") {
      this._dateFormats = { ...(r["dateFormats"] as Record<string, string>) };
    }
    if (Array.isArray(r["fieldOrder"])) {
      this._fieldOrder = (r["fieldOrder"] as unknown[]).filter(Boolean) as string[];
    }
    if (r["drillThrough"] && typeof r["drillThrough"] === "object") {
      const dt = r["drillThrough"] as Record<string, unknown>;
      if (dt["fields"] && typeof dt["fields"] === "object") {
        this._drillThroughFields = { ...(dt["fields"] as DrillThroughFieldsMap) };
      }
      if (Number.isFinite(dt["frozenCount"])) {
        this._drillThroughFrozenCount = Math.max(0, Math.floor(dt["frozenCount"] as number));
      }
    }
    if (Array.isArray(r["calculatedFields"])) {
      this._calculatedFields = (r["calculatedFields"] as unknown[]).map((f) => ({ ...(f as InternalCalculatedField) }));
    }
    const ds = r["dataSource"] as Record<string, unknown> | undefined;
    if (ds?.["data"]) {
      this.setData(ds["data"]);
    } else {
      this._dirty = true;
      this._emit("dataChange");
    }
    this._dirty = true;
  }

  getReport(): ReportSnapshot {
    /*     const slice = { ...this._slice };
    if (slice.expands) {
      const { expandedMembers: _omit, ...restExpands } = slice.expands;
      slice.expands = restExpands;
    } */
    return {
      slice: this._slice,
      options: this._options,
      formats: this.getFormat(),
      dateFormats: { ...this._dateFormats },
      fieldOrder: [...this._fieldOrder],
      drillThrough: {
        fields: { ...this._drillThroughFields },
        frozenCount: this._drillThroughFrozenCount,
      },
      calculatedFields: this._calculatedFields.map((f) => ({ ...f })),
      dataSource: {
        dataSourceType: "json",
        data: [this._metadata, ...this._rows],
      },
    };
  }

  // ---- computation --------------------------------------------------

  processMatrix(): ComputedMatrix {
    if (!this._dirty && this._matrix) return this._matrix;

    // _slice.filters is FilterEntry[] — matches applyFilters's second parameter directly.
    const filteredRows = applyFilters(this._expandedRows, this._slice.filters);

    const rowFields = this._slice.rows || [];
    const hasMeasuresOnRows = rowFields.some(
      (f) => f.uniqueName === "Measures",
    );
    const rowFieldsForTree = rowFields.filter(
      (f) => f.uniqueName !== "Measures",
    );

    const dimensionFormatter = this._buildDimensionFormatter();

    // Casts: InternalSliceField is structurally compatible with RichSliceField at runtime;
    // ExpandedMetadataRow.type is string (superset of FieldType) — safe to cast.
    const rowRoot = buildTree({
      rows: filteredRows,
      fields: rowFieldsForTree as unknown as RichSliceField[],
      metadata: this._expandedMeta as unknown as MetadataRow,
      expands: this._slice.expands,
      rootCaption: this._totalCaption(),
      formatValue: dimensionFormatter,
      locale: this._locale,
    });

    const colFields = this._slice.columns || [];
    const hasMeasuresOnColumns = colFields.some(
      (f) => f.uniqueName === "Measures",
    );
    const colFieldsForTree = colFields.filter(
      (f) => f.uniqueName !== "Measures",
    );

    const colRoot = buildTree({
      rows: filteredRows,
      fields: colFieldsForTree as unknown as RichSliceField[],
      metadata: this._expandedMeta as unknown as MetadataRow,
      expands: this._slice.expands,
      rootCaption: this._totalCaption(),
      formatValue: dimensionFormatter,
      locale: this._locale,
    });

    // Enrich every measure with a human-readable caption of the shape
    // "<AggLabel> Totale di <FieldCaption>" so the axis leaves produced by
    // the matrix (either in column headers or as row labels when "Valori"
    // lives on the row axis) show a descriptive label instead of the raw
    // datasource field uniqueName.
    const calcByName = new Map(
      this._calculatedFields.map((f) => [f.uniqueName, f]),
    );
    const enrichMeasure = (m: InternalSliceMeasure): EnrichedMeasure => {
      const calc = calcByName.get(m.uniqueName);
      const fieldCaption =
        calc?.caption ||
        this._expandedMeta[m.uniqueName]?.caption ||
        m.uniqueName;
      const agg = m.aggregation || "sum";
      const aggLabel = this._resolveAggLabel(agg);
      const template =
        this._localization?.grid?.measureCaptionTemplate ||
        "{agg} Total of {field}";
      const grandTotalTemplate =
        this._localization?.grid?.grandTotalMeasureCaptionTemplate || template;
      const applyTemplate = (tpl: string): string =>
        tpl.replace("{agg}", aggLabel).replace("{field}", fieldCaption);
      return {
        ...m,
        caption:
          m.caption ||
          (agg === "formula" ? fieldCaption : applyTemplate(template)),
        grandTotalCaption:
          agg === "formula" ? fieldCaption : applyTemplate(grandTotalTemplate),
      };
    };
    const measuresEnriched = (this._slice.measures || []).map(enrichMeasure);
    const calcFieldsEnriched = this._calculatedFields.map((f) => ({
      ...f,
      caption: f.caption || f.uniqueName,
    }));

    // Casts: InternalSliceField ≈ RichSliceField,
    // InternalSort ≈ SortConfig, ExpandedMetadataRow ≈ MetadataRow — all safe at runtime.
    this._matrix = computeMatrix({
      rows: filteredRows,
      rowRoot,
      colRoot,
      rowFields: rowFieldsForTree as unknown as RichSliceField[],
      colFields: colFieldsForTree as unknown as RichSliceField[],
      measures: measuresEnriched,
      calculatedFields: calcFieldsEnriched as unknown as Parameters<typeof computeMatrix>[0]["calculatedFields"],
      hasMeasuresOnColumns,
      hasMeasuresOnRows,
      sort: (this._slice.sort || null) as unknown as Parameters<typeof computeMatrix>[0]["sort"],
      layout: this._format.layout,
      metadata: this._expandedMeta as unknown as MetadataRow,
      locale: this._locale,
    });

    this._dirty = false;
    return this._matrix;
  }

  setSort(colKey: string | null | undefined, direction: string | null = "desc", measure: unknown = null): void {
    const prev = this._slice.sort || {};
    const next: InternalSort = { ...prev };
    if (colKey && direction) {
      next.colKey = colKey;
      next.colDirection = direction;
      next.colMeasure = measure || null;
    } else {
      delete next.colKey;
      delete next.colDirection;
      delete next.colMeasure;
    }
    const hasAny = next.colKey || next.rowKey;
    this._slice = { ...this._slice, sort: hasAny ? next : null };
    this._dirty = true;
    this._emit("reportChange");
  }

  setSortByRow(rowKey: string | null | undefined, direction: string | null = "desc", measure: unknown = null): void {
    const prev = this._slice.sort || {};
    const next: InternalSort = { ...prev };
    if (rowKey && direction) {
      next.rowKey = rowKey;
      next.rowDirection = direction;
      next.rowMeasure = measure || null;
    } else {
      delete next.rowKey;
      delete next.rowDirection;
      delete next.rowMeasure;
    }
    const hasAny = next.colKey || next.rowKey;
    this._slice = { ...this._slice, sort: hasAny ? next : null };
    this._dirty = true;
    this._emit("reportChange");
  }

  /**
   * Bulk-toggles the expansion state of every direct child of `parentKey`
   * (or every depth-1 row node when `parentKey` is null/undefined — i.e. the
   * tree root). The new state is the opposite of the current majority state:
   * if all children are currently expanded it collapses them, otherwise it
   * expands them all.
   *
   * This powers the "expand all / collapse all" icons rendered next to
   * dimension captions and the "Righe" header in the pivot grid.
   */
  toggleChildrenExpansion(parentKey: string | null | undefined, axis: string = "row"): void {
    const filteredRows = applyFilters(this._expandedRows, this._slice.filters);
    const sourceFields =
      axis === "column" ? this._slice.columns : this._slice.rows;
    const fields = (sourceFields || []).filter(
      (f) => f.uniqueName !== "Measures",
    );
    const tree = buildTree({
      rows: filteredRows,
      fields: fields as unknown as RichSliceField[],
      metadata: this._expandedMeta as unknown as MetadataRow,
      expands: this._slice.expands,
      rootCaption: this._totalCaption(),
      locale: this._locale,
    });
    const parent: TreeNode | null = parentKey ? findNodeByKey(tree, parentKey) : tree;
    if (!parent || !parent.children || parent.children.length === 0) return;

    const allExpanded = parent.children.every((c) => c.isExpanded !== false);
    const targetExpanded = !allExpanded;
    const defaults = this._slice.expands || {};
    const defaultExpanded = defaults.expandAll !== false;
    const toggled = new Set(defaults.expandedMembers || []);
    parent.children.forEach((c) => {
      if (targetExpanded === defaultExpanded) toggled.delete(c.key);
      else toggled.add(c.key);
    });
    this._slice = {
      ...this._slice,
      expands: { ...defaults, expandedMembers: Array.from(toggled) },
    };
    this._dirty = true;
    this._emit("reportChange");
  }

  toggleExpanded(nodeKey: string): void {
    const slice = this._slice;
    const toggled = new Set(slice.expands?.expandedMembers || []);
    if (toggled.has(nodeKey)) toggled.delete(nodeKey);
    else toggled.add(nodeKey);
    this._slice = {
      ...slice,
      expands: {
        ...(slice.expands || {}),
        expandedMembers: Array.from(toggled),
      },
    };
    this._dirty = true;
    this._emit("reportChange");
  }

  markDirty(): void {
    this._dirty = true;
  }

  // ---- export --------------------------------------------------------

  async exportExcel(filename: string = "pivot.xlsx"): Promise<void> {
    const matrix = this.processMatrix();
    await exportMatrixToExcel({
      matrix,
      filename,
      metadata: this._expandedMeta as unknown as MetadataRow,
    });
  }
}

export default PivotEngine;
