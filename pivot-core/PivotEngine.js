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

import { normalizeDataset } from "./data/DataNormalizer";
import { expandHierarchies } from "./data/DateHierarchyExpander";
import { buildTree, findNodeByKey } from "./slice/TreeBuilder";
import { applyFilters } from "./slice/FilterEngine";
import { computeMatrix } from "./matrix/MatrixComputer";
import { exportMatrixToExcel } from "./export/ExcelExporter";
import { formatDateValue, formatSubpartValue } from "./format/DateFormatter";

/**
 * Italian labels for each aggregation. Used as a fallback when no
 * localization dictionary has been pushed to the engine. At runtime
 * `_resolveAggLabel` prefers the caller-supplied `aggregations` section
 * so captions follow the active UI language.
 */
const AGG_LABEL = {
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
const AGG_LOCALE_KEY = {
  sum: "sum",
  count: "count",
  distinctcount: "distinctcount",
  avg: "average",
  min: "min",
  max: "max",
  ratioTotal: "ratioTotal",
  currentRatio: "currentRatio",
};

const DEFAULT_SLICE = {
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
function migrateSort(sort) {
  if (!sort) return null;
  const legacy = sort.direction !== undefined || sort.measure !== undefined;
  if (!legacy) return sort;
  const next = {};
  if (sort.colKey) {
    next.colKey = sort.colKey;
    next.colDirection = sort.direction || "desc";
    next.colMeasure = sort.measure || null;
  }
  if (sort.rowKey) {
    next.rowKey = sort.rowKey;
    next.rowDirection = sort.direction || "desc";
    next.rowMeasure = sort.measure || null;
  }
  return next.colKey || next.rowKey ? next : null;
}

const DEFAULT_OPTIONS = {
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

const DEFAULT_VALUES_FORMAT = {
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

const DEFAULT_HEADERS_FORMAT = {
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_DIMENSIONS_FORMAT = {
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 500,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_GRAND_TOTALS_FORMAT = {
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 700,
  italic: false,
  textColor: null,
  backgroundColor: null,
  textAlign: "left",
};

const DEFAULT_LAYOUT = {
  totalsRowsPosition: "before", // 'before' | 'after' | 'none'
  totalsRowsSticky: false, // pin grand-total row(s) during vertical scroll
  totalsColumnsPosition: "before", // 'before' | 'after' | 'none'
  totalsColumnsSticky: false, // pin grand-total column(s) during horizontal scroll
  alternateRows: false,
};

class PivotEngine {
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
    this._listeners = new Map();
    this._matrix = null;
    this._dirty = true;
    this._dateLocalization = null;
    this._localization = null;
    this._rawDataset = null;
    // BCP-47 locale pushed by the Pivot wrapper. `undefined` means
    // "use the browser default" and is passed verbatim to Intl APIs.
    this._locale = undefined;
    // Per-date-field format: { uniqueName: 'locale-date' | 'locale-datetime' |
    // 'iso' | 'iso-date' | '<pattern>' }. Missing entries use the browser
    // locale short date.
    this._dateFormats = {};
    // User-defined display order for the FieldList "All fields" list. Stored
    // as an array of uniqueNames; fields not present in the array fall back
    // to metadata-iteration order at the tail. Also drives the column order
    // in the drill-through dialog.
    this._fieldOrder = [];
    // Per-field opt-out for the drill-through table. Absent key = visible
    // (default-on, preserves the legacy "show every metadata field" UX).
    this._drillThroughFields = {};
    // Number of left-pinned columns in the drill-through table. Clamped at
    // read time against the count of currently visible fields.
    this._drillThroughFrozenCount = 0;
  }

  // ---- event bus -----------------------------------------------------

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  _emit(event, ...args) {
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

  setData(rawDataset) {
    this._rawDataset = rawDataset;
    const { metadata, rows } = normalizeDataset(rawDataset);
    const expanded = expandHierarchies(metadata, rows, this._dateLocalization);
    this._metadata = metadata;
    this._rows = rows;
    this._expandedMeta = expanded.metadata;
    this._expandedRows = expanded.rows;
    this._dirty = true;
    this._emit("dataChange");
  }

  /**
   * Overrides month/weekday names and the hierarchy-part captions used by
   * the date expander. Accepts the `dates` section of a react-pivot
   * localization dictionary: `{ monthNames, weekdayNames, hierarchyParts }`.
   * If data has already been loaded, re-expands it so the new captions
   * take effect without requiring a manual setData call.
   */
  /**
   * Stores the full localization dictionary so the engine can produce
   * localized captions (grand-total label, measure captions like
   * "Sum Total of <field>"). The dates sub-section should still be
   * pushed separately via setDateLocalization for the date expander.
   */
  setLocalization(localization) {
    this._localization = localization || null;
    this._dirty = true;
    this._emit("dataChange");
  }

  /**
   * Set the BCP-47 locale used by every Intl / localeCompare call inside
   * the engine and its matrix computer. Pass `undefined` to fall back to
   * the runtime's default (i.e. the browser locale).
   */
  setLocale(locale) {
    this._locale = locale || undefined;
    this._dirty = true;
    this._emit("dataChange");
  }

  getLocale() {
    return this._locale;
  }

  _totalCaption() {
    return this._localization?.grid?.total || "Total";
  }

  _resolveAggLabel(agg) {
    const loc = this._localization?.aggregations;
    if (loc) {
      const key = AGG_LOCALE_KEY[agg];
      if (key && loc[key]) return loc[key];
    }
    return AGG_LABEL[agg] || agg;
  }

  setDateLocalization(localization) {
    this._dateLocalization = localization || null;
    if (this._rawDataset) {
      const { metadata, rows } = normalizeDataset(this._rawDataset);
      const expanded = expandHierarchies(
        metadata,
        rows,
        this._dateLocalization,
      );
      this._expandedMeta = expanded.metadata;
      this._expandedRows = expanded.rows;
      this._dirty = true;
      this._emit("dataChange");
    }
  }

  getMetadata() {
    return this._expandedMeta;
  }

  /**
   * Override the display caption for a field (data column or calculated
   * field). Mutates the expanded metadata in place so every consumer
   * (fields list, pivot headers, field chips, format dialog dropdowns)
   * picks up the new label. Pass an empty string or null to revert to the
   * data-source provided caption.
   */
  setFieldCaption(uniqueName, caption) {
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

  getRows() {
    return this._expandedRows;
  }

  // ---- date formatting ---------------------------------------------

  setDateFormat(uniqueName, format) {
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

  getDateFormat(uniqueName) {
    return this._dateFormats[uniqueName] || null;
  }

  getDateFormats() {
    return { ...this._dateFormats };
  }

  setDateFormats(map) {
    this._dateFormats = map && typeof map === "object" ? { ...map } : {};
    this._dirty = true;
    this._emit("formatChange");
  }

  // ---- field order / drill-through config ---------------------------

  getFieldOrder() {
    return [...this._fieldOrder];
  }

  setFieldOrder(order) {
    this._fieldOrder = Array.isArray(order) ? order.filter(Boolean) : [];
    // Display-only: no matrix invalidation. The FieldList + DrillThrough
    // dialog re-render via the dataChange event.
    this._emit("dataChange");
  }

  getDrillThroughConfig() {
    return {
      fields: { ...this._drillThroughFields },
      frozenCount: this._drillThroughFrozenCount,
    };
  }

  setDrillThroughConfig(config) {
    if (!config) return;
    if (config.fields && typeof config.fields === "object") {
      this._drillThroughFields = { ...config.fields };
    }
    if (Number.isFinite(config.frozenCount)) {
      this._drillThroughFrozenCount = Math.max(0, Math.floor(config.frozenCount));
    }
    this._emit("dataChange");
  }

  _buildDimensionFormatter() {
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

  getAvailableFields() {
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

  getCalculatedFields() {
    return this._calculatedFields.map((f) => ({ ...f }));
  }

  setCalculatedFields(fields) {
    this._calculatedFields = Array.isArray(fields)
      ? fields.map((f) => ({ ...f }))
      : [];
    this._dirty = true;
    this._emit("dataChange");
  }

  /**
   * Apply a list of field-config overrides (caption only for now). Each entry
   * is `{ uniqueName, caption }`; missing entries leave the data-source value
   * untouched.
   */
  setFields(fields) {
    if (!Array.isArray(fields)) return;
    fields.forEach((f) => {
      if (!f?.uniqueName) return;
      if (f.caption !== undefined)
        this.setFieldCaption(f.uniqueName, f.caption);
    });
  }

  addCalculatedField({ uniqueName, caption, formula }) {
    const id = uniqueName || `calc_${Date.now()}`;
    this._calculatedFields = [
      ...this._calculatedFields.filter((f) => f.uniqueName !== id),
      { uniqueName: id, caption: caption || id, formula: formula || "0" },
    ];
    this._dirty = true;
    this._emit("dataChange");
  }

  updateCalculatedField(uniqueName, { caption, formula }) {
    this._calculatedFields = this._calculatedFields.map((f) =>
      f.uniqueName === uniqueName
        ? { ...f, caption: caption ?? f.caption, formula: formula ?? f.formula }
        : f,
    );
    this._dirty = true;
    this._emit("dataChange");
  }

  removeCalculatedField(uniqueName) {
    this._calculatedFields = this._calculatedFields.filter(
      (f) => f.uniqueName !== uniqueName,
    );
    // Also remove from any slice arrays where it might have been placed.
    const strip = (arr) =>
      (arr || []).filter((f) => f.uniqueName !== uniqueName);
    this._slice = {
      ...this._slice,
      measures: strip(this._slice.measures),
      rows: strip(this._slice.rows),
      columns: strip(this._slice.columns),
      filters: strip(this._slice.filters),
    };
    this._dirty = true;
    this._emit("dataChange");
  }

  // ---- slice / options ----------------------------------------------

  setSlice(slice, { silent = false } = {}) {
    this._slice = {
      ...DEFAULT_SLICE,
      ...slice,
      rows: slice?.rows || [],
      columns: slice?.columns || [],
      measures: slice?.measures || [],
      expands: slice?.expands || { expandAll: true },
      filters: slice?.filters || [],
      sort: migrateSort(slice?.sort),
    };
    this._dirty = true;
    if (!silent) this._emit("reportChange");
  }

  getSlice() {
    return this._slice;
  }

  setOptions(options) {
    this._options = { ...this._options, ...(options || {}) };
  }

  getOptions() {
    return this._options;
  }

  // ---- format -------------------------------------------------------

  setFormat(format, { silent = false } = {}) {
    if (!format) return;
    // Back-compat: accept `general` as an alias of `values`.
    const incomingValues = format.values || format.general || null;
    const incomingByMeasure =
      format.valuesByMeasure && typeof format.valuesByMeasure === "object"
        ? format.valuesByMeasure
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
              .map(([k, v]) => [k, { ...v }]),
          )
        : { ...this._format.valuesByMeasure },
      headers: {
        ...this._format.headers,
        ...(format.headers || {}),
      },
      grandTotals: {
        ...this._format.grandTotals,
        ...(format.grandTotals || {}),
      },
      dimensions: {
        ...this._format.dimensions,
        ...(format.dimensions || {}),
      },
      layout: {
        ...this._format.layout,
        ...(format.layout || {}),
      },
      conditional: Array.isArray(format.conditional)
        ? format.conditional.map((r) => ({ ...r }))
        : this._format.conditional,
      conditionalMode:
        format.conditionalMode === "all" || format.conditionalMode === "first"
          ? format.conditionalMode
          : this._format.conditionalMode || "first",
    };
    // Layout changes affect total placement and alternating-row metadata that
    // are baked into the matrix output, so invalidate the cached matrix.
    if (format.layout) this._dirty = true;
    if (!silent) this._emit("formatChange");
  }

  getFormat() {
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

  setReport(report) {
    // Programmatic setReport must NOT emit reportChange — consumers
    // commonly invoke it from a useEffect that listens to their local
    // copy of the report, so re-emitting would create an infinite loop.
    if (!report) return;
    if (report.slice) this.setSlice(report.slice, { silent: true });
    if (report.options) this.setOptions(report.options);
    // NOT silent: the grid (PivotTable) listens to `formatChange` to sync
    // its local format snapshot. Without emitting, a programmatic setReport
    // leaves the grid rendering with stale defaults until the user opens
    // and re-applies the FormatDialog.
    if (report.formats) this.setFormat(report.formats);
    if (report.dateFormats && typeof report.dateFormats === "object") {
      this._dateFormats = { ...report.dateFormats };
    }
    if (Array.isArray(report.fieldOrder)) {
      this._fieldOrder = report.fieldOrder.filter(Boolean);
    }
    if (report.drillThrough && typeof report.drillThrough === "object") {
      const dt = report.drillThrough;
      if (dt.fields && typeof dt.fields === "object") {
        this._drillThroughFields = { ...dt.fields };
      }
      if (Number.isFinite(dt.frozenCount)) {
        this._drillThroughFrozenCount = Math.max(0, Math.floor(dt.frozenCount));
      }
    }
    if (Array.isArray(report.calculatedFields)) {
      this._calculatedFields = report.calculatedFields.map((f) => ({ ...f }));
    }
    if (report.dataSource?.data) {
      this.setData(report.dataSource.data);
    } else {
      this._dirty = true;
      this._emit("dataChange");
    }
    this._dirty = true;
  }

  getReport() {
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

  processMatrix() {
    if (!this._dirty && this._matrix) return this._matrix;

    const filteredRows = applyFilters(this._expandedRows, this._slice.filters);

    const rowFields = this._slice.rows || [];
    const hasMeasuresOnRows = rowFields.some(
      (f) => f.uniqueName === "Measures",
    );
    const rowFieldsForTree = rowFields.filter(
      (f) => f.uniqueName !== "Measures",
    );

    const dimensionFormatter = this._buildDimensionFormatter();

    const rowRoot = buildTree({
      rows: filteredRows,
      fields: rowFieldsForTree,
      metadata: this._expandedMeta,
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
      fields: colFieldsForTree,
      metadata: this._expandedMeta,
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
    const enrichMeasure = (m) => {
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
      const applyTemplate = (tpl) =>
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

    this._matrix = computeMatrix({
      rows: filteredRows,
      rowRoot,
      colRoot,
      rowFields: rowFieldsForTree,
      colFields: colFieldsForTree,
      measures: measuresEnriched,
      calculatedFields: calcFieldsEnriched,
      hasMeasuresOnColumns,
      hasMeasuresOnRows,
      sort: this._slice.sort || null,
      layout: this._format.layout,
      metadata: this._expandedMeta,
      locale: this._locale,
    });

    this._dirty = false;
    return this._matrix;
  }

  setSort(colKey, direction = "desc", measure = null) {
    const prev = this._slice.sort || {};
    const next = { ...prev };
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

  setSortByRow(rowKey, direction = "desc", measure = null) {
    const prev = this._slice.sort || {};
    const next = { ...prev };
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
  toggleChildrenExpansion(parentKey, axis = "row") {
    const filteredRows = applyFilters(this._expandedRows, this._slice.filters);
    const sourceFields =
      axis === "column" ? this._slice.columns : this._slice.rows;
    const fields = (sourceFields || []).filter(
      (f) => f.uniqueName !== "Measures",
    );
    const tree = buildTree({
      rows: filteredRows,
      fields,
      metadata: this._expandedMeta,
      expands: this._slice.expands,
      rootCaption: this._totalCaption(),
      locale: this._locale,
    });
    const parent = parentKey ? findNodeByKey(tree, parentKey) : tree;
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

  toggleExpanded(nodeKey) {
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

  markDirty() {
    this._dirty = true;
  }

  // ---- export --------------------------------------------------------

  async exportExcel(filename = "pivot.xlsx") {
    const matrix = this.processMatrix();
    await exportMatrixToExcel({
      matrix,
      filename,
      metadata: this._expandedMeta,
    });
  }
}

export default PivotEngine;
