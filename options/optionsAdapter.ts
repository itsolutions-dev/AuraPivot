// Translation layer between the public `options` prop schema and the
// framework-agnostic PivotEngine. Pure functions — no React, no engine
// internals touched.

import type PivotEngine from "../pivot-core";
import type { AuraPivotOptions, AuraPivotFieldEntry, DataRow } from "../pivot-core/types";
import type { InternalOptions } from "../pivot-core/PivotEngine";
import type { FilterEntry } from "../pivot-core/slice/FilterEngine";

/**
 * Apply an `options` schema object (and the separate `dataSource` rows) to a
 * PivotEngine instance. Grid expansion state (`slice.expands`) and the
 * column/row sort (`slice.sort`) are read from the engine and preserved —
 * they are driven by the grid, not by this prop.
 */
export function optionsToEngine(
  engine: PivotEngine,
  options: AuraPivotOptions | undefined,
  dataSource: DataRow[] | undefined,
): void {
  const o: AuraPivotOptions = options || {};
  const data = o.data || {};
  const fields: AuraPivotFieldEntry[] = Array.isArray(data.fields) ? data.fields : [];
  // `uniqueName` is required on AuraPivotFieldEntry; the `as string` matches the
  // original JS contract — fall back through to fieldName without injecting an
  // empty-string sentinel for the (unreachable) all-falsy case.
  const keyOf = (f: AuraPivotFieldEntry): string => (f.uniqueName || f.fieldName) as string;

  // ---- dataset: build [metadata, ...rows] from data.fields + dataSource ----
  if (fields.length) {
    const metadata: Record<string, { type: string; caption: string | undefined }> = {};
    fields.forEach((f) => {
      // `dataType` is optional in the schema — default an untyped field to
      // "string" so the engine never receives `type: undefined`.
      metadata[keyOf(f)] = { type: f.dataType || "string", caption: f.caption };
    });
    engine.setData([metadata, ...(dataSource || [])]);
  } else {
    engine.setData(dataSource || []);
  }

  // ---- per-field date formats ----
  const dateFormats: Record<string, string> = {};
  fields.forEach((f) => {
    if (f.dateFormat) dateFormats[keyOf(f)] = f.dateFormat;
  });
  engine.setDateFormats(dateFormats);

  // ---- drill-through visibility + sticky columns ----
  const dtFields: Record<string, boolean> = {};
  fields.forEach((f) => {
    if (f.showInDrillThrough !== undefined) {
      dtFields[keyOf(f)] = !!f.showInDrillThrough;
    }
  });
  engine.setDrillThroughConfig({
    fields: dtFields,
    frozenCount: o.layout?.drillThroughStickyColumns ?? 0,
  });

  // ---- field display order, derived from drillThroughOrder ----
  const fieldOrder = fields
    .filter((f) => f.drillThroughOrder != null)
    .slice()
    .sort((a, b) => (a.drillThroughOrder ?? 0) - (b.drillThroughOrder ?? 0))
    .map(keyOf);
  engine.setFieldOrder(fieldOrder);

  // ---- calculated fields ----
  engine.setCalculatedFields(
    Array.isArray(data.calculatedFields) ? data.calculatedFields : [],
  );

  // ---- slice: dimensions / measures / filters (preserve expands + sort) ----
  const prev = engine.getSlice() || {};
  const rows: Array<{ uniqueName: string; fieldSort?: Record<string, unknown> }> = [];
  const columns: Array<{ uniqueName: string; fieldSort?: Record<string, unknown> }> = [];
  (Array.isArray(data.dimensions) ? data.dimensions : []).forEach((d) => {
    const entry: { uniqueName: string; fieldSort?: Record<string, unknown> } = { uniqueName: d.uniqueName };
    if (d.fieldSort != null) entry.fieldSort = d.fieldSort;
    if (d.axis === "column") columns.push(entry);
    else rows.push(entry);
  });
  // The `Measures` pseudo-field places the measure axis on rows or columns.
  if (o.layout?.measuresAxis === "rows") rows.push({ uniqueName: "Measures" });
  else columns.push({ uniqueName: "Measures" });
  const measures = (Array.isArray(data.measures) ? data.measures : []).map(
    (m) => ({
      uniqueName: m.uniqueName,
      aggregation: m.aggregation,
      hidden: !!m.hidden,
    }),
  );
  engine.setSlice({
    ...prev,
    rows,
    columns,
    measures,
    // Public→internal boundary: the schema marks `uniqueName` optional and
    // `range` unknown; FilterEngine skips entries it cannot read.
    filters: (Array.isArray(data.filters)
      ? data.filters
      : []) as unknown as FilterEntry[],
  });

  // ---- format (font/number/colour sections + conditional + layout) ----
  engine.setFormat({
    values: o.format?.values,
    valuesByMeasure: o.format?.valuesByMeasure,
    headers: o.format?.headers,
    dimensions: o.format?.dimensions,
    grandTotals: o.format?.grandTotals,
    conditional: o.format?.conditional,
    conditionalMode: o.format?.conditionalMode,
    layout: { ...(o.layout || {}) },
  });

  // ---- engine options: toolbar visibility + mirrored enableDrillThrough ----
  // `engine.setOptions` shallow-merges, so a partial `toolbar` would wipe the
  // engine's other toolbar flags — merge over the current toolbar instead.
  const currentOpts: InternalOptions = engine.getOptions() || {};
  engine.setOptions({
    toolbar: { ...(currentOpts.toolbar || {}), ...(o.toolbar || {}) },
    enableDrillThrough: o.layout?.enableDrillThrough,
  });
}

/**
 * Read a PivotEngine instance back into an `options` schema object. The
 * inverse of `optionsToEngine`. The raw `dataSource` rows are intentionally
 * not included — `options` carries configuration only.
 */
export function engineToOptions(engine: PivotEngine): AuraPivotOptions {
  const slice = engine.getSlice() || {};
  const format = engine.getFormat() || {};
  const meta = engine.getMetadata() || {};
  const dt = engine.getDrillThroughConfig() || { fields: {}, frozenCount: 0 };
  const dateFormats = engine.getDateFormats() || {};
  const fieldOrder = engine.getFieldOrder() || [];
  const engOpts: InternalOptions = engine.getOptions() || {};
  const rows = slice.rows || [];
  const columns = slice.columns || [];

  // Base fields only — virtual date-hierarchy columns carry a `subpart`.
  const orderOf = (name: string): number | null => {
    const i = fieldOrder.indexOf(name);
    return i < 0 ? null : i + 1;
  };
  const fields = Object.entries(meta)
    .filter(([, m]) => !m.subpart)
    .map(([uniqueName, m]) => ({
      fieldName: uniqueName,
      uniqueName,
      // m.type is FieldType | string (ExpandedFieldMeta); narrow to DataType at
      // the public boundary via the final cast on the return value below.
      dataType: m.type,
      caption: m.caption || uniqueName,
      showInDrillThrough:
        dt.fields?.[uniqueName] === undefined ? true : !!dt.fields[uniqueName],
      drillThroughOrder: orderOf(uniqueName),
      dateFormat: dateFormats[uniqueName] || null,
    }));

  const dimensions: Array<{
    axis: "row" | "column";
    uniqueName: string;
    fieldSort: Record<string, unknown> | null;
  }> = [];
  rows.forEach((f) => {
    if (f.uniqueName !== "Measures") {
      dimensions.push({
        axis: "row",
        uniqueName: f.uniqueName,
        fieldSort: f.fieldSort || null,
      });
    }
  });
  columns.forEach((f) => {
    if (f.uniqueName !== "Measures") {
      dimensions.push({
        axis: "column",
        uniqueName: f.uniqueName,
        fieldSort: f.fieldSort || null,
      });
    }
  });

  const measuresAxis: "rows" | "columns" = rows.some((f) => f.uniqueName === "Measures")
    ? "rows"
    : "columns";

  const toolbar = engOpts.toolbar || {};

  // The engine's InternalFormat / InternalOptions are a superset of
  // AuraPivotOptions. We build a plain object that satisfies the public shape
  // and narrow via `as unknown as AuraPivotOptions` to avoid noise from the
  // extra internal keys (e.g. ExpandedFieldMeta.subpart, LayoutFormat extra
  // props) that exist on engine snapshots but are not part of the public API.
  const result = {
    toolbar: {
      visible: toolbar.visible !== false,
      showFields: toolbar.showFields !== false,
      showFormat: toolbar.showFormat !== false,
      showExport: toolbar.showExport !== false,
      showFullscreen: toolbar.showFullscreen !== false,
    },
    layout: {
      ...(format.layout || {}),
      measuresAxis,
      drillThroughStickyColumns: dt.frozenCount || 0,
    },
    data: {
      fields,
      calculatedFields: engine.getCalculatedFields() || [],
      dimensions,
      measures: (slice.measures || []).map((m) => ({
        uniqueName: m.uniqueName,
        aggregation: m.aggregation,
        hidden: !!m.hidden,
      })),
      filters: slice.filters || [],
    },
    format: {
      conditionalMode: format.conditionalMode || "first",
      conditional: format.conditional || [],
      values: format.values || {},
      valuesByMeasure: format.valuesByMeasure || {},
      headers: format.headers || {},
      dimensions: format.dimensions || {},
      grandTotals: format.grandTotals || {},
    },
  };

  return result as unknown as AuraPivotOptions;
}
