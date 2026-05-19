// Translation layer between the public `options` prop schema and the
// framework-agnostic PivotEngine. Pure functions — no React, no engine
// internals touched.

/**
 * Apply an `options` schema object (and the separate `dataSource` rows) to a
 * PivotEngine instance. Grid expansion state (`slice.expands`) and the
 * column/row sort (`slice.sort`) are read from the engine and preserved —
 * they are driven by the grid, not by this prop.
 *
 * @param {object} engine     - a PivotEngine instance
 * @param {object} options    - the `options` schema (may be partial)
 * @param {Array}  dataSource - plain array of row objects (may be undefined)
 */
export function optionsToEngine(engine, options, dataSource) {
  const o = options || {};
  const data = o.data || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const keyOf = (f) => f.uniqueName || f.fieldName;

  // ---- dataset: build [metadata, ...rows] from data.fields + dataSource ----
  if (fields.length) {
    const metadata = {};
    fields.forEach((f) => {
      metadata[keyOf(f)] = { type: f.dataType, caption: f.caption };
    });
    engine.setData([metadata, ...(dataSource || [])]);
  } else {
    engine.setData(dataSource || []);
  }

  // ---- per-field date formats ----
  const dateFormats = {};
  fields.forEach((f) => {
    if (f.dateFormat) dateFormats[keyOf(f)] = f.dateFormat;
  });
  engine.setDateFormats(dateFormats);

  // ---- drill-through visibility + sticky columns ----
  const dtFields = {};
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
    .sort((a, b) => a.drillThroughOrder - b.drillThroughOrder)
    .map(keyOf);
  engine.setFieldOrder(fieldOrder);

  // ---- calculated fields ----
  engine.setCalculatedFields(
    Array.isArray(data.calculatedFields) ? data.calculatedFields : [],
  );

  // ---- slice: dimensions / measures / filters (preserve expands + sort) ----
  const prev = engine.getSlice() || {};
  const rows = [];
  const columns = [];
  (Array.isArray(data.dimensions) ? data.dimensions : []).forEach((d) => {
    const entry = { uniqueName: d.uniqueName };
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
    filters: Array.isArray(data.filters) ? data.filters : [],
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
  engine.setOptions({
    toolbar: o.toolbar || {},
    enableDrillThrough: o.layout?.enableDrillThrough,
  });
}

/**
 * Read a PivotEngine instance back into an `options` schema object. The
 * inverse of `optionsToEngine`. The raw `dataSource` rows are intentionally
 * not included — `options` carries configuration only.
 *
 * @param {object} engine - a PivotEngine instance
 * @returns {object} an `options` schema object
 */
export function engineToOptions(engine) {
  const slice = engine.getSlice() || {};
  const format = engine.getFormat() || {};
  const meta = engine.getMetadata() || {};
  const dt = engine.getDrillThroughConfig() || { fields: {}, frozenCount: 0 };
  const dateFormats = engine.getDateFormats() || {};
  const fieldOrder = engine.getFieldOrder() || [];
  const engOpts = engine.getOptions() || {};
  const rows = slice.rows || [];
  const columns = slice.columns || [];

  // Base fields only — virtual date-hierarchy columns carry a `subpart`.
  const orderOf = (name) => {
    const i = fieldOrder.indexOf(name);
    return i < 0 ? null : i + 1;
  };
  const fields = Object.entries(meta)
    .filter(([, m]) => !m.subpart)
    .map(([uniqueName, m]) => ({
      fieldName: uniqueName,
      uniqueName,
      dataType: m.type,
      caption: m.caption || uniqueName,
      showInDrillThrough:
        dt.fields?.[uniqueName] === undefined ? true : !!dt.fields[uniqueName],
      drillThroughOrder: orderOf(uniqueName),
      dateFormat: dateFormats[uniqueName] || null,
    }));

  const dimensions = [];
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

  const measuresAxis = rows.some((f) => f.uniqueName === "Measures")
    ? "rows"
    : "columns";

  const toolbar = engOpts.toolbar || {};

  return {
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
}
