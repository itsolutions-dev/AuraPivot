import React, {
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { darken, lighten } from "@mui/material/styles";
import { TableVirtuoso } from "react-virtuoso";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SettingsIcon from "@mui/icons-material/Settings";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import { findNodeByKey } from "../../pivot-core/slice/TreeBuilder";
import { usePivot } from "../../context/PivotContext";
import usePivotMatrix from "../../hooks/usePivotMatrix";
import {
  resolveCellStyle,
  formatNumberWithFormat,
  getValuesSection,
} from "../../pivot-core/format/CellFormatter";
import DimensionFilterDialog from "../DimensionFilterDialog/DimensionFilterDialog";
import DrillThroughDialog from "../DrillThroughDialog/DrillThroughDialog";

const INDENT_PX = 16;
const CELL_MIN_WIDTH = 96;
const CHEVRON_COL_WIDTH = 32;
const LABEL_COL_WIDTH = 240;

const DENSITY = {
  Compact: {
    rowHeight: 20,
    rowPaddingY: "1px",
    rowLineHeight: "18px",
    bodyFontSizeRate: 0.85,
    bodyPaddingX: "8px",
    headerRowHeight: 36,
    headerCellMinHeight: 22,
    headerFontSizeRate: 0.85,
    headerPaddingY: "2px",
    headerPaddingX: "8px",
  },
  Standard: {
    rowHeight: 24,
    rowPaddingY: "2px",
    rowLineHeight: "20px",
    bodyFontSizeRate: 1,
    bodyPaddingX: "10px",
    headerRowHeight: 48,
    headerCellMinHeight: 26,
    headerFontSizeRate: 1,
    headerPaddingY: "4px",
    headerPaddingX: "10px",
  },
  Comfortable: {
    rowHeight: 32,
    rowPaddingY: "6px",
    rowLineHeight: "20px",
    bodyFontSizeRate: 1.25,
    bodyPaddingX: "12px",
    headerRowHeight: 56,
    headerCellMinHeight: 32,
    headerFontSizeRate: 1.25,
    headerPaddingY: "8px",
    headerPaddingX: "12px",
  },
};
const resolveDensity = (key) => DENSITY[key] || DENSITY.Standard;

// Scale a CSS fontSize value ("13px" | "0.9rem" | 13) by a numeric rate.
// Returns a CSS string with the original unit (defaults to px) or undefined
// when no input is provided so the caller can fall back to its own default.
const scaleFontSize = (raw, rate = 1, fallback) => {
  const r = typeof rate === "number" && rate > 0 ? rate : 1;
  if (raw == null || raw === "") {
    return fallback != null ? scaleFontSize(fallback, r) : undefined;
  }
  if (typeof raw === "number") return `${raw * r}px`;
  const m = String(raw).match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m) return raw;
  const n = parseFloat(m[1]);
  const unit = m[2] || "px";
  return `${n * r}${unit}`;
};

/* const AGG_SYMBOL = {
  sum: 'Σ',
  count: 'N',
  distinctcount: 'N*',
  avg: 'x̄',
  min: 'min',
  max: 'max',
};
 */
/**
 * Compact-mode virtualized pivot grid. Renders:
 *   - A sticky multi-row header built from the column tree leaves and
 *     (optionally) measure captions
 *   - A body of data rows produced by flattening the row tree
 *
 * Every body row is virtualized via react-virtuoso so datasets of tens of
 * thousands of rows render without DOM overflow.
 */
const PivotTable = function PivotTable() {
  const { engine, localization: t, options } = usePivot();
  const { matrix, loading } = usePivotMatrix(engine);
  const [format, setFormat] = useState(() => engine.getFormat());
  const [slice, setSliceState] = useState(() => engine.getSlice());
  const sort = slice?.sort || null;
  const [dimensionFilter, setDimensionFilter] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // When measures live on rows and there are 2+ measures, clicking a column
  // header opens this picker so the user chooses which measure drives the
  // sort. Anchor element is the clicked HeaderCell, colKey is the target.
  const [sortPicker, setSortPicker] = useState(null);
  // Mirror of `sortPicker` for row-driven sort: clicking a row label opens
  // this picker when measures live on the column axis and there are 2+ of
  // them, so the user can choose which measure drives the column ordering.
  const [rowSortPicker, setRowSortPicker] = useState(null);

  useEffect(() => {
    const onFormat = () => setFormat(engine.getFormat());
    const onReport = () => setSliceState({ ...engine.getSlice() });
    engine.on("formatChange", onFormat);
    engine.on("reportChange", onReport);
    engine.on("dataChange", onReport);
    return () => {
      engine.off("formatChange", onFormat);
      engine.off("reportChange", onReport);
      engine.off("dataChange", onReport);
    };
  }, [engine]);

  const compact = (options?.grid?.type || "compact") === "compact";

  const handleToggle = useCallback(
    (nodeKey) => {
      // Go through setSlice instead of the dedicated toggleExpanded helper
      // so the reportChange emission carries the full updated slice — some
      // downstream listeners (FieldList, FilterBar) snapshot the slice and
      // would otherwise overwrite a fresh `expandedMembers` if their next
      // setSlice runs from a stale snapshot.
      const slice = engine.getSlice();
      const toggled = new Set(slice.expands?.expandedMembers || []);
      if (toggled.has(nodeKey)) toggled.delete(nodeKey);
      else toggled.add(nodeKey);
      engine.setSlice({
        ...slice,
        expands: {
          ...(slice.expands || {}),
          expandedMembers: Array.from(toggled),
        },
      });
    },
    [engine],
  );

  // When the "Valori" (Measures) field is placed on the row axis, each tree
  // node is rendered once per measure; these helpers extract the underlying
  // tree-node key that owns expansion state and the node itself via findNode.
  const nodeKeyOf = (rowNode) => rowNode?.nodeKey || rowNode?.key;

  const hiddenMeasures = useMemo(() => {
    const s = new Set();
    (slice.measures || []).forEach((m) => {
      if (m?.hidden && m.uniqueName) {
        s.add(`${m.uniqueName}:${m.aggregation}`);
      }
    });
    return s;
  }, [slice.measures]);

  const measureKeyHidden = (mk) => {
    if (!mk) return false;
    return hiddenMeasures.has(String(mk));
  };

  const colLeaves = useMemo(() => {
    let leaves = matrix?.colLeaves || [];
    if (hiddenMeasures.size > 0) {
      leaves = leaves.filter((c) => !measureKeyHidden(c.measureKey));
    }
    // currentRatio on the grand-total column always collapses to 100%, so
    // when it is the only measure on the slice the grand-total column adds
    // no information — drop it from the visible leaves.
    const visibleMeasures = (matrix?.measures || []).filter(
      (m) =>
        m.aggregation !== "formula" &&
        !hiddenMeasures.has(`${m.uniqueName}:${m.aggregation}`),
    );
    const onlyCurrentRatio =
      visibleMeasures.length === 1 &&
      visibleMeasures[0].aggregation === "currentRatio";
    if (onlyCurrentRatio) {
      leaves = leaves.filter((c) => !(c.isTotal && c.depth === -1));
    }
    return leaves;
  }, [matrix?.colLeaves, matrix?.measures, hiddenMeasures]);

  const rowLeaves = useMemo(() => {
    const leaves = matrix?.rowLeaves || [];
    if (hiddenMeasures.size === 0) return leaves;
    return leaves.filter((r) => !measureKeyHidden(r.measureKey));
  }, [matrix?.rowLeaves, hiddenMeasures]);

  // Sticky grand totals — read the layout flags once.
  const stickyRowTotals = !!format?.layout?.totalsRowsSticky;
  const stickyColTotals = !!format?.layout?.totalsColumnsSticky;
  const rowsTotalsPosition = format?.layout?.totalsRowsPosition || "before";
  const colsTotalsPosition = format?.layout?.totalsColumnsPosition || "before";

  // When totalsRowsSticky is on, pin the grand-total row(s) (depth -1).
  // "before": they are already the leading rows — keep them in the data and
  // pin via Virtuoso's `topItemCount`. "after": pull them out and render them
  // in the fixed (sticky) footer. Stuffing a data row into the sticky <thead>
  // breaks Virtuoso's header measurement, so `topItemCount` is used instead.
  const { dataRows, gtRows, gtSlot, topItemCount } = useMemo(() => {
    const off = {
      dataRows: rowLeaves,
      gtRows: [],
      gtSlot: null,
      topItemCount: 0,
    };
    if (!stickyRowTotals || rowsTotalsPosition === "none") return off;
    const isGT = (r) => !!(r?.isTotal && r.depth === -1);
    if (rowsTotalsPosition === "before") {
      let n = 0;
      while (n < rowLeaves.length && isGT(rowLeaves[n])) n += 1;
      return n > 0 ? { ...off, topItemCount: n } : off;
    }
    const gt = [];
    const body = [];
    for (const r of rowLeaves) {
      if (isGT(r)) gt.push(r);
      else body.push(r);
    }
    if (gt.length === 0) return off;
    return { dataRows: body, gtRows: gt, gtSlot: "footer", topItemCount: 0 };
  }, [rowLeaves, stickyRowTotals, rowsTotalsPosition]);

  // In perRow layout every data-context leaf expands into N consecutive
  // measure rows. The zebra needs to shade each group distinctly while still
  // alternating measures inside the group, yielding four shade levels instead
  // of two. For layouts without measures-on-rows the meta collapses to the
  // usual one-stripe-per-row pattern.
  const rowMeta = useMemo(() => {
    const hasMeasuresOnRows = dataRows.some((l) => l?.measureKey);
    const meta = new Array(dataRows.length);
    let groupIndex = -1;
    let groupStart = 0;
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const isFirstOfGroup = !r?.measureKey || r.isFirstMeasure === true;
      if (isFirstOfGroup) {
        groupIndex += 1;
        groupStart = i;
      }
      meta[i] = { groupIndex, measureIdx: i - groupStart };
    }
    return { hasMeasuresOnRows, meta };
  }, [dataRows]);

  // Chevron column grows with the deepest row so the chevron icon can be
  // indented per depth and never overlaps the sticky label column.
  const maxRowIndent = useMemo(() => {
    let m = 0;
    for (const r of rowLeaves) {
      const d = Math.max(0, r?.depth || 0);
      if (d > m) m = d;
    }
    return m * INDENT_PX;
  }, [rowLeaves]);
  // With measures on rows and at most one row dimension every row is either
  // a measure leaf or a single-level dimension leaf — no expandable hierarchy
  // exists, so the chevron column never carries a control and only wastes
  // horizontal space. Drop it entirely.
  const rowDimensionCount = (slice.rows || []).filter(
    (f) => f && f.uniqueName !== "Measures",
  ).length;
  const hideChevronCol = !!matrix?.measuresOnRows && rowDimensionCount <= 1;
  const chevronColWidth = hideChevronCol ? 0 : CHEVRON_COL_WIDTH + maxRowIndent;

  // Sticky grand-total columns keep their normal width — forcing a width
  // shrinks them. Instead every data-column header carries a `data-pvt-ci`
  // attribute; after layout its real `offsetLeft` is measured and the sticky
  // cell is pinned to that exact device-pixel offset, so the columns neither
  // overlap nor leave seams while scrolling, at any width.
  const scrollerElRef = useRef(null);
  const scrollerObsRef = useRef(null);
  const [measureTick, setMeasureTick] = useState(0);
  const handleScrollerRef = useCallback((node) => {
    if (scrollerObsRef.current) {
      scrollerObsRef.current.disconnect();
      scrollerObsRef.current = null;
    }
    scrollerElRef.current =
      node && typeof node.querySelectorAll === "function" ? node : null;
    if (!scrollerElRef.current) return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(scrollerElRef.current);
    scrollerObsRef.current = ro;
    setMeasureTick((t) => t + 1);
  }, []);

  // `colGeom` maps each data-column index to its measured natural offsetLeft,
  // plus `__cw` (the table's full content width). `null` when sticky is off.
  const [colGeom, setColGeom] = useState(null);
  useLayoutEffect(() => {
    const scroller = scrollerElRef.current;
    if (!scroller || !stickyColTotals || colsTotalsPosition === "none") {
      setColGeom((prev) => (prev === null ? prev : null));
      return;
    }
    const ths = scroller.querySelectorAll("thead th[data-pvt-ci]");
    if (!ths.length) return;
    const geom = {};
    let contentWidth = 0;
    ths.forEach((th) => {
      geom[th.getAttribute("data-pvt-ci")] = th.offsetLeft;
      const right = th.offsetLeft + th.offsetWidth;
      if (right > contentWidth) contentWidth = right;
    });
    geom.__cw = contentWidth;
    setColGeom((prev) => {
      if (prev) {
        const keys = Object.keys(geom);
        const same =
          keys.length === Object.keys(prev).length &&
          keys.every((k) => prev[k] === geom[k]);
        if (same) return prev;
      }
      return geom;
    });
  }, [
    colLeaves,
    measureTick,
    stickyColTotals,
    colsTotalsPosition,
    chevronColWidth,
  ]);

  // Sticky grand-total column — grand-total col leaves (depth -1) pin to the
  // left ("before") or right ("after") edge during horizontal scroll, at the
  // exact measured offset. Returns a style fragment, or null.
  const stickyColStyle = useCallback(
    (col, ci, isHeader) => {
      if (!stickyColTotals || colsTotalsPosition === "none") return null;
      if (!(col?.isTotal && col.depth === -1)) return null;
      if (!colGeom || colGeom[String(ci)] == null) return null;
      // Header cells live inside Virtuoso's own <thead> stacking context, so a
      // high zIndex there is safe — and necessary, because the scrolling
      // column headers carry positioned content (MUI IconButtons are
      // `position: relative`) that would otherwise paint over them.
      // Body cells must stay below the pinned grand-total row (topItemCount /
      // fixed footer, both zIndex 1) when totalsRowsSticky is on, so they drop
      // to zIndex 0 then; otherwise zIndex 1 to cover positioned cell content.
      const zIndex = isHeader ? 3 : stickyRowTotals ? 0 : 1;
      if (colsTotalsPosition === "after") {
        // Right offset = distance from this column's right edge (== the next
        // column's measured left) to the table's content right edge.
        const nextLeft = colGeom[String(ci + 1)];
        const rightEdge = nextLeft == null ? colGeom.__cw : nextLeft;
        return {
          position: "sticky",
          right: colGeom.__cw - rightEdge,
          zIndex,
        };
      }
      return { position: "sticky", left: colGeom[String(ci)], zIndex };
    },
    [stickyColTotals, colsTotalsPosition, colGeom, stickyRowTotals],
  );

  const totalWidth = useMemo(
    () =>
      chevronColWidth +
      LABEL_COL_WIDTH +
      CELL_MIN_WIDTH * Math.max(1, colLeaves.length),
    [chevronColWidth, colLeaves.length],
  );

  const headerStyle = useMemo(
    () => resolveCellStyle({ format, scope: "headers" }),
    [format],
  );
  const dimensionStyle = useMemo(
    () => resolveCellStyle({ format, scope: "dimensions" }),
    [format],
  );
  const grandTotalLabelStyle = useMemo(
    () => resolveCellStyle({ format, scope: "grandTotals" }),
    [format],
  );
  const grandTotalValueStyle = useMemo(() => {
    const base = resolveCellStyle({ format, scope: "grandTotals" });
    // Grand-total value cells still live on the value axis — if the user
    // hasn't explicitly set an alignment for the grand-totals section fall
    // back to the values alignment so numbers stay right-justified.
    if (base && !format?.grandTotals?.textAlign) {
      return { ...base, textAlign: format?.values?.textAlign || "right" };
    }
    return base;
  }, [format]);
  // Data columns should share their text-align with the value cells below
  // them so numbers line up against their header.
  const dataAlign = format?.values?.textAlign || "right";
  const density = useMemo(
    () => resolveDensity(format?.layout?.density),
    [format?.layout?.density],
  );

  const applySort = useCallback(
    (colKey, measure) => {
      const current = engine.getSlice()?.sort || null;
      const sameMeasureKey = (a, b) =>
        (a?.uniqueName || null) === (b?.uniqueName || null) &&
        (a?.aggregation || null) === (b?.aggregation || null);
      let nextDirection = "desc";
      if (
        current &&
        current.colKey === colKey &&
        sameMeasureKey(current.colMeasure, measure)
      ) {
        if (current.colDirection === "desc") nextDirection = "asc";
        else if (current.colDirection === "asc") nextDirection = null;
      }
      engine.setSort(
        nextDirection ? colKey : null,
        nextDirection,
        nextDirection ? measure || null : null,
      );
    },
    [engine],
  );

  const handleHeaderClick = useCallback(
    (colKey, evt) => {
      if (!colKey) return;
      const measuresOnRows = !!matrix?.measuresOnRows;
      // Grand-total column = leaf at depth -1 with isTotal. Currentratio
      // collapses to 100% on the grand-total column so sorting by it is
      // meaningless — hide the option there but keep it for normal columns.
      const targetCol = (matrix?.colLeaves || []).find((c) => c.key === colKey);
      const isGrandTotalCol = !!(targetCol?.isTotal && targetCol?.depth === -1);
      // Computed (formula) fields are valid sort keys — their values live
      // in the same matrix cells under the `formula` aggregation suffix.
      const sortableMeasures = (matrix?.measures || []).filter(
        (m) => !isGrandTotalCol || m.aggregation !== "currentRatio",
      );
      if (measuresOnRows && sortableMeasures.length > 1) {
        const current = engine.getSlice()?.sort || null;
        setSortPicker({
          anchorEl: evt?.currentTarget || null,
          colKey,
          measures: sortableMeasures,
          direction:
            current && current.colKey === colKey
              ? current.colDirection
              : "desc",
        });
        return;
      }
      applySort(colKey, null);
    },
    [
      engine,
      matrix?.measuresOnRows,
      matrix?.measures,
      matrix?.colLeaves,
      applySort,
    ],
  );

  const applySortByRow = useCallback(
    (rowKey, measure) => {
      const current = engine.getSlice()?.sort || null;
      const sameMeasureKey = (a, b) =>
        (a?.uniqueName || null) === (b?.uniqueName || null) &&
        (a?.aggregation || null) === (b?.aggregation || null);
      let nextDirection = "desc";
      if (
        current &&
        current.rowKey === rowKey &&
        sameMeasureKey(current.rowMeasure, measure)
      ) {
        if (current.rowDirection === "desc") nextDirection = "asc";
        else if (current.rowDirection === "asc") nextDirection = null;
      }
      engine.setSortByRow(
        nextDirection ? rowKey : null,
        nextDirection,
        nextDirection ? measure || null : null,
      );
    },
    [engine],
  );

  const handleLabelClick = useCallback(
    (rowKey, rowNode, evt) => {
      if (!rowKey) return;
      const measuresOnCols = !!matrix?.measuresOnColumns;
      // Grand-total row = leaf at depth -1 with isTotal. Skip currentRatio
      // (every cell collapses to 100% there) — same caveat as the column
      // header sort.
      const isGrandTotalRow = !!(rowNode?.isTotal && rowNode?.depth === -1);
      const sortableMeasures = (matrix?.measures || []).filter(
        (m) => !isGrandTotalRow || m.aggregation !== "currentRatio",
      );
      if (measuresOnCols && sortableMeasures.length > 1) {
        const current = engine.getSlice()?.sort || null;
        setRowSortPicker({
          anchorEl: evt?.currentTarget || null,
          rowKey,
          measures: sortableMeasures,
          direction:
            current && current.rowKey === rowKey
              ? current.rowDirection
              : "desc",
        });
        return;
      }
      applySortByRow(rowKey, null);
    },
    [engine, matrix?.measuresOnColumns, matrix?.measures, applySortByRow],
  );

  const metadata = engine.getMetadata();

  const totalCaption = useMemo(() => {
    const measures = matrix?.measures;
    // When Measures live on the column axis (perColumn), the grand-total ROW
    // header carries no measure context — every measure shows up as its own
    // column leaf. Keep the label plain so it doesn't duplicate column captions.
    if (matrix?.measuresOnColumns) {
      return t?.grid?.total || "Total";
    }
    if (!measures || measures.length === 0) {
      return t?.grid?.grandTotal || "Grand Total";
    }
    // The measure captions are pre-built by the engine in the shape
    // "<AggLabel> Totale di <FieldCaption>"; prepend the matching symbol so
    // the grand-total row reads e.g. "Σ Somma Totale di Chiamate risposte".
    if (measures.length === 1) {
      const m = measures[0];
      const agg = m.aggregation || "sum";
      //const sym = AGG_SYMBOL[agg] || '';
      const sym = "";
      const composite =
        m.grandTotalCaption ||
        m.caption ||
        metadata?.[m.uniqueName]?.caption ||
        m.uniqueName;
      return sym ? `${sym} ${composite}` : composite;
    }
    return measures
      .map((m) => {
        const agg = m.aggregation || "sum";
        //const sym = AGG_SYMBOL[agg] || '';
        const sym = "";
        const composite =
          m.grandTotalCaption ||
          m.caption ||
          metadata?.[m.uniqueName]?.caption ||
          m.uniqueName;
        return sym ? `${sym} ${composite}` : composite;
      })
      .join(" · ");
  }, [matrix?.measures, matrix?.measuresOnColumns, metadata, t]);

  const captionFor = useCallback(
    (uniqueName) => {
      if (uniqueName === "Measures") {
        return t?.fieldsList?.values || "Values";
      }
      return metadata[uniqueName]?.caption || uniqueName;
    },
    [metadata, t],
  );

  const aggLabel = useCallback(
    (a) => {
      if (!a) return "";
      const wdrKey = { distinctcount: "distinctCount", avg: "average" }[a] || a;
      const raw = t?.aggregations?.[a] ?? t?.aggregations?.[wdrKey];
      if (raw && typeof raw === "object") return raw.caption || a;
      return raw || a;
    },
    [t],
  );

  const rowDimensions = useMemo(
    () => (slice.rows || []).filter((f) => f.uniqueName !== "Measures"),
    [slice.rows],
  );
  const colDimensions = useMemo(
    () => (slice.columns || []).filter((f) => f.uniqueName !== "Measures"),
    [slice.columns],
  );

  const activeFilterFields = useMemo(() => {
    const s = new Set();
    (slice.filters || []).forEach((f) => {
      if (!f || !f.uniqueName) return;
      const hasMembers = Array.isArray(f.members) && f.members.length > 0;
      const hasRange = f.range && (f.range.min != null || f.range.max != null);
      const hasValue =
        f.value !== undefined && f.value !== null && f.value !== "";
      if (hasMembers || hasRange || hasValue) s.add(f.uniqueName);
    });
    return s;
  }, [slice.filters]);

  const openDimensionFilter = (uniqueName) =>
    setDimensionFilter({
      uniqueName,
      caption: captionFor(uniqueName),
    });

  const [drill, setDrill] = useState(null);

  const getHiddenMeasureItems = useCallback(
    (rowNode, col) => {
      if (hiddenMeasures.size === 0 || !matrix) return [];
      const rowKeyBase = String(rowNode.key).split("||M:")[0];
      const colKeyBase = String(col.key).split("||M:")[0];
      const hiddenList = (slice.measures || []).filter((m) => m?.hidden);
      return hiddenList.map((m) => {
        const targetKey = `${m.uniqueName}:${m.aggregation}`;
        let found = null;
        for (const [k, v] of matrix.cells) {
          const sep = k.indexOf("::");
          if (sep < 0) continue;
          const rk = k.slice(0, sep);
          const ck = k.slice(sep + 2);
          if (rk.split("||M:")[0] !== rowKeyBase) continue;
          if (ck.split("||M:")[0] !== colKeyBase) continue;
          const mk = v?.measureKey;
          if (mk === targetKey) {
            found = { value: v.value, measureKey: mk };
            break;
          }
        }
        const section = found
          ? getValuesSection(format, found.measureKey)
          : null;
        const base = captionFor(m.uniqueName);
        const agg = aggLabel(m.aggregation);
        return {
          uniqueName: m.uniqueName,
          caption: agg ? `${base} (${agg})` : base,
          aggregation: m.aggregation,
          formatted: found ? formatNumberWithFormat(found.value, section) : "—",
        };
      });
    },
    [hiddenMeasures, matrix, slice.measures, format, captionFor, aggLabel],
  );

  const handleToggleChildren = useCallback(
    (parentKey) => {
      if (parentKey != null) {
        // Per-row "expand/collapse level below": flip the isExpanded state
        // of every direct child of parentKey. The parent stays open; only
        // the level below (grandchildren of parentKey) appears or hides.
        engine.toggleChildrenExpansion(parentKey);
        return;
      }
      // Global toggle: collapse only when the tree is already fully
      // expanded; otherwise expand. The grand-total root (`__root__`) is
      // kept expanded in both states — collapsing it would hide the whole
      // grid. Per-node exceptions are otherwise cleared so the whole tree
      // (rows + cols) ends up in a single uniform state.
      const current = engine.getSlice();
      const expands = current.expands || {};
      const fullyExpanded =
        expands.expandAll !== false &&
        (expands.expandedMembers || []).length === 0;
      engine.setSlice({
        ...current,
        expands: {
          ...expands,
          expandAll: !fullyExpanded,
          // When collapsing, flip the root back to expanded via the
          // exception set so grand totals stay visible.
          expandedMembers: fullyExpanded ? ["__root__"] : [],
        },
      });
    },
    [engine],
  );

  /**
   * Called when the user clicks a non-null value cell. Walks the row/col
   * trees from the matrix to intersect the two node row-index buckets, then
   * opens the drill-through dialog with the corresponding source records.
   */
  const openDrillThrough = useCallback(
    (rowKey, colKey, rowNode) => {
      if (!matrix) return;
      // Strip the measure suffix ("||M:...") to look up the actual column
      // node in colRoot — measures live on top of columns, not in the tree.
      const baseColKey = String(colKey).split("||M:")[0];
      const colNode = findNodeByKey(matrix.colRoot, baseColKey);
      const source = matrix.sourceRows || [];
      const rowIndexes = rowNode?.rowIndexes || [];
      const colIndexes = colNode?.rowIndexes || [];
      if (rowIndexes.length === 0 || colIndexes.length === 0) {
        setDrill({ open: true, rows: [], breadcrumbs: [] });
        return;
      }
      const [small, large] =
        rowIndexes.length < colIndexes.length
          ? [rowIndexes, colIndexes]
          : [colIndexes, rowIndexes];
      const smallSet = new Set(small);
      const intersected = large.filter((i) => smallSet.has(i));
      const rows = intersected.map((i) => source[i]).filter(Boolean);

      // Breadcrumbs: ancestor chain of rowNode and colNode (skipping roots).
      const buildBreadcrumbs = (root, targetKey) => {
        if (!root || !targetKey) return [];
        const path = [];
        const walk = (node, trail) => {
          if (!node) return false;
          const nextTrail = [...trail, node];
          if (node.key === targetKey) {
            path.push(...nextTrail);
            return true;
          }
          for (const c of node.children || []) {
            if (walk(c, nextTrail)) return true;
          }
          return false;
        };
        walk(root, []);
        return path
          .filter((n) => !n.isTotal && n.field)
          .map((n) => ({
            field: captionFor(n.field),
            value: n.caption,
          }));
      };
      const rowNodeKey = rowNode?.nodeKey || rowNode?.key;
      const breadcrumbs = [
        ...buildBreadcrumbs(matrix.rowRoot, rowNodeKey),
        ...buildBreadcrumbs(matrix.colRoot, baseColKey),
      ];
      if (rowNode?.measureKey) {
        const [uniqueName] = rowNode.measureKey.split(":");
        breadcrumbs.push({
          field: captionFor("Measures") || "Values",
          value: rowNode.measureCaption || uniqueName,
        });
      }
      setDrill({ open: true, rows, breadcrumbs });
    },
    [matrix, captionFor],
  );

  const renderHeader = useCallback(
    () => (
      <>
        {filtersExpanded &&
          (rowDimensions.length > 0 || colDimensions.length > 0) && (
            <tr style={{ height: density.headerRowHeight }}>
              <th
                colSpan={hideChevronCol ? 1 : 2}
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  minWidth: chevronColWidth + LABEL_COL_WIDTH,
                  width: chevronColWidth + LABEL_COL_WIDTH,
                  boxSizing: "border-box",
                }}
              >
                <DimensionHeaderCell
                  dims={rowDimensions}
                  captionFor={captionFor}
                  activeFilters={activeFilterFields}
                  onOpen={openDimensionFilter}
                  fallback={""}
                  style={headerStyle}
                  density={density}
                />
              </th>
              <th
                colSpan={Math.max(1, colLeaves.length)}
                style={{ boxSizing: "border-box" }}
              >
                <DimensionHeaderCell
                  dims={colDimensions}
                  captionFor={captionFor}
                  activeFilters={activeFilterFields}
                  onOpen={openDimensionFilter}
                  fallback={""}
                  style={{ ...headerStyle, textAlign: "left" }}
                  density={density}
                />
              </th>
            </tr>
          )}
        <tr style={{ height: density.headerRowHeight }}>
          {!hideChevronCol && (
            <th
              style={{
                position: "sticky",
                left: 0,
                zIndex: 3,
                minWidth: chevronColWidth,
                width: chevronColWidth,
                boxSizing: "border-box",
              }}
            >
              <Box
                sx={(theme) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: density.headerCellMinHeight,
                  backgroundColor:
                    headerStyle?.backgroundColor ||
                    (theme.palette.mode === "dark"
                      ? theme.palette.primary[900]
                      : theme.palette.primary[100]),
                })}
              >
                {(rowDimensions.length > 0 || colDimensions.length > 0) && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleChildren(null);
                    }}
                    title={t?.grid?.expandCollapseAll || "Expand/Collapse all"}
                    sx={(theme) => ({
                      p: 0,
                      width: 18,
                      height: 18,
                      "& svg": {
                        fontSize: theme.typography.button.fontSize,
                      },
                    })}
                  >
                    <UnfoldMoreIcon fontSize="inherit" />
                  </IconButton>
                )}
              </Box>
            </th>
          )}
          <th
            style={{
              position: "sticky",
              left: chevronColWidth,
              zIndex: 3,
              minWidth: LABEL_COL_WIDTH,
              width: LABEL_COL_WIDTH,
              boxSizing: "border-box",
            }}
          >
            <HeaderCell
              primary
              style={headerStyle}
              density={density}
              action={
                rowDimensions.length > 0 || colDimensions.length > 0 ? (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiltersExpanded((v) => !v);
                    }}
                    title={
                      filtersExpanded
                        ? t?.grid?.collapseFilters || "Collapse filters"
                        : t?.grid?.expandFilters || "Expand filters"
                    }
                    sx={(theme) => ({
                      p: 0,
                      mr: 0.25,
                      width: 18,
                      height: 18,
                      color:
                        activeFilterFields.size > 0
                          ? "primary.main"
                          : "inherit",
                      "& svg": { fontSize: theme.typography.button.fontSize },
                    })}
                  >
                    {filtersExpanded ? (
                      <ExpandLessIcon fontSize="inherit" />
                    ) : (
                      <FilterAltIcon fontSize="inherit" />
                    )}
                  </IconButton>
                ) : null
              }
            >
              {/*               {t?.fieldsList?.rows || 'Rows'} */}
            </HeaderCell>
          </th>
          {colLeaves.map((col, ci) => {
            const colSticky = stickyColStyle(col, ci, true);
            const isSorted = sort && sort.colKey === col.key;
            // Hover tooltip describes the active sort criteria — column,
            // measure (when measures live on rows and the user picked one),
            // and direction. Only meaningful when this column is the sorted
            // one; otherwise the icon shows the inactive placeholder.
            const sortTooltip = (() => {
              if (!isSorted) return "";
              const dirLabel =
                sort.colDirection === "asc"
                  ? t?.grid?.sortAsc || "Ascending"
                  : t?.grid?.sortDesc || "Descending";
              let measureLabel = "";
              if (sort.colMeasure) {
                const m = (matrix?.measures || []).find(
                  (mm) =>
                    mm.uniqueName === sort.colMeasure.uniqueName &&
                    mm.aggregation === sort.colMeasure.aggregation,
                );
                if (m) measureLabel = ` — ${m.caption || m.uniqueName}`;
              }
              return `${col.caption || ""}${measureLabel} (${dirLabel})`;
            })();
            // Mirror the row chevron behavior on the column axis: when a col
            // header corresponds to an internal tree node (has children) and
            // isn't a total/repeat-of-measure, render a chevron that toggles
            // its expansion. Only the first measure copy of a node owns the
            // chevron when measures live on cols, to avoid duplicates.
            const colHasChildren = col.children && col.children.length > 0;
            const colShowsControls =
              col.measureKey == null || col.isFirstMeasure === true;
            const showColChevron =
              colHasChildren && !col.isTotal && colShowsControls && compact;
            return (
              <th
                key={col.key}
                data-pvt-ci={ci}
                className={colSticky ? "pvt-sticky-col" : undefined}
                style={{
                  minWidth: CELL_MIN_WIDTH,
                  boxSizing: "border-box",
                  ...colSticky,
                }}
              >
                <HeaderCell
                  style={{ ...headerStyle, textAlign: dataAlign }}
                  density={density}
                  sortable
                  sortDirection={isSorted ? sort.colDirection : null}
                  sortTooltip={sortTooltip}
                  onClick={(e) => handleHeaderClick(col.key, e)}
                  prefix={
                    showColChevron ? (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(col.nodeKey || col.key);
                        }}
                        title={
                          col.isExpanded !== false
                            ? t?.grid?.collapseChildren || "Collapse"
                            : t?.grid?.expandChildren || "Expand"
                        }
                        sx={(theme) => ({
                          p: 0,
                          mr: 0.25,
                          width: 16,
                          height: 16,
                          "& svg": {
                            fontSize: theme.typography.button.fontSize,
                          },
                        })}
                      >
                        {col.isExpanded !== false ? (
                          <ExpandMoreIcon fontSize="inherit" />
                        ) : (
                          <ChevronRightIcon fontSize="inherit" />
                        )}
                      </IconButton>
                    ) : null
                  }
                >
                  {col.caption}
                </HeaderCell>
              </th>
            );
          })}
        </tr>
      </>
    ),
    [
      colLeaves,
      t,
      headerStyle,
      dataAlign,
      sort,
      handleHeaderClick,
      rowDimensions,
      colDimensions,
      handleToggle,
      handleToggleChildren,
      captionFor,
      activeFilterFields,
      filtersExpanded,
      density,
      compact,
      hideChevronCol,
      chevronColWidth,
      stickyColStyle,
    ],
  );

  const alternateRows = !!format?.layout?.alternateRows;

  const buildDimValueMap = (root) => {
    const out = new Map();
    if (!root) return out;
    const walk = (node, accum) => {
      const next =
        node.field && !node.isTotal
          ? { ...accum, [node.field]: node.value }
          : accum;
      out.set(node.key, next);
      (node.children || []).forEach((c) => walk(c, next));
    };
    walk(root, {});
    return out;
  };
  const rowDimMap = useMemo(
    () => buildDimValueMap(matrix?.rowRoot),
    [matrix?.rowRoot],
  );
  const colDimMap = useMemo(
    () => buildDimValueMap(matrix?.colRoot),
    [matrix?.colRoot],
  );

  const renderRow = useCallback(
    (rowNode, index) => {
      if (!rowNode) return null;

      const hasChildren = rowNode.children && rowNode.children.length > 0;
      // Next-level toggle (UnfoldMore) only makes sense if at least one
      // direct child has its own children — otherwise expanding the level
      // below would do nothing.
      const hasGrandchildren =
        hasChildren &&
        rowNode.children.some((c) => c && c.children && c.children.length > 0);
      const indent = Math.max(0, rowNode.depth) * INDENT_PX;
      // Grand total is the root-level synthetic node (depth === -1). We shade
      // it noticeably deeper than per-group subtotals so it reads as the
      // summary row even in bright themes where action.selected is barely
      // distinguishable from the paper background.
      const isGrandTotal = !!rowNode.isTotal && rowNode.depth === -1;
      // Shade levels 0..3: group parity (0|2) + measure parity within group (0|1).
      // Non-perRow layouts keep the classic single stripe at level 1.
      let shade = 0;
      if (alternateRows && !rowNode.isTotal) {
        if (rowMeta.hasMeasuresOnRows) {
          const m = rowMeta.meta[index];
          if (m) shade = (m.groupIndex % 2) * 2 + (m.measureIdx % 2);
        } else if (index % 2 === 1) {
          shade = 1;
        }
      }
      // When measures live on the row axis each tree node is repeated once
      // per measure. Show the expand chevron / collapse-children icon only
      // on the first measure row to avoid visual duplication.
      const showNodeControls =
        rowNode.measureKey == null || rowNode.isFirstMeasure === true;

      const showChevron =
        hasChildren && compact && showNodeControls && !rowNode.isTotal;

      return (
        <>
          {!hideChevronCol && (
            <td
              className={`pvt-chevron${showChevron ? "" : " pvt-chevron-empty"}`}
              style={{
                position: "sticky",
                left: 0,
                zIndex: 1,
                minWidth: chevronColWidth,
                width: chevronColWidth,
                boxSizing: "border-box",
                verticalAlign: "middle",
                textAlign: "center",
                cursor: showChevron ? "pointer" : "default",
              }}
              onClick={
                showChevron
                  ? (e) => {
                      e.stopPropagation();
                      handleToggle(nodeKeyOf(rowNode));
                    }
                  : undefined
              }
            >
              <ChevronCell
                show={showChevron}
                expanded={rowNode.isExpanded !== false}
                onToggle={() => handleToggle(nodeKeyOf(rowNode))}
                isGrandTotal={isGrandTotal}
                isTotal={rowNode.isTotal}
                shade={shade}
                density={density}
                indent={indent}
              />
            </td>
          )}
          <td
            className="pvt-label"
            style={{
              position: "sticky",
              left: chevronColWidth,
              zIndex: 1,
              minWidth: LABEL_COL_WIDTH,
              width: LABEL_COL_WIDTH,
              boxSizing: "border-box",
            }}
          >
            <BodyLabelCell
              indent={indent}
              isTotal={rowNode.isTotal}
              isGrandTotal={isGrandTotal}
              onToggleChildren={
                hasGrandchildren && !rowNode.isTotal && showNodeControls
                  ? () => handleToggleChildren(nodeKeyOf(rowNode))
                  : undefined
              }
              caption={
                rowNode.isTotal && !rowNode.measureKey
                  ? totalCaption
                  : rowNode.caption
              }
              style={isGrandTotal ? grandTotalLabelStyle : dimensionStyle}
              shade={shade}
              density={density}
              sortable
              sortDirection={
                sort && sort.rowKey === rowNode.key ? sort.rowDirection : null
              }
              sortTooltip={(() => {
                if (!sort || sort.rowKey !== rowNode.key) return "";
                const dirLabel =
                  sort.rowDirection === "asc"
                    ? t?.grid?.sortAsc || "Ascending"
                    : t?.grid?.sortDesc || "Descending";
                let measureLabel = "";
                if (sort.rowMeasure) {
                  const m = (matrix?.measures || []).find(
                    (mm) =>
                      mm.uniqueName === sort.rowMeasure.uniqueName &&
                      mm.aggregation === sort.rowMeasure.aggregation,
                  );
                  if (m) measureLabel = ` — ${m.caption || m.uniqueName}`;
                }
                return `${rowNode.caption || ""}${measureLabel} (${dirLabel})`;
              })()}
              onSortClick={(e) => handleLabelClick(rowNode.key, rowNode, e)}
            />
          </td>
          {colLeaves.map((col, ci) => {
            const cell = matrix.cells.get(`${rowNode.key}::${col.key}`);
            const colSticky = stickyColStyle(col, ci, false);
            const measureKey = cell?.measureKey || col.measureKey || null;
            const getMeasureValue = (target) => {
              if (!target) return null;
              const rowKeyBase = String(rowNode.key).split("||M:")[0];
              const colKeyBase = String(col.key).split("||M:")[0];
              const wantsExact = String(target).includes(":");
              for (const [k, v] of matrix.cells) {
                const sep = k.indexOf("::");
                if (sep < 0) continue;
                const rk = k.slice(0, sep);
                const ck = k.slice(sep + 2);
                if (rk.split("||M:")[0] !== rowKeyBase) continue;
                if (ck.split("||M:")[0] !== colKeyBase) continue;
                const mk = v?.measureKey;
                if (!mk) continue;
                if (wantsExact) {
                  if (mk === target) return v.value;
                } else if (mk.startsWith(`${target}:`)) {
                  return v.value;
                }
              }
              return null;
            };
            const rowBaseKey = String(rowNode.nodeKey || rowNode.key).split(
              "||M:",
            )[0];
            const colBaseKey = String(col.key).split("||M:")[0];
            const dimensionValues = {
              ...(rowDimMap.get(rowBaseKey) || {}),
              ...(colDimMap.get(colBaseKey) || {}),
            };
            const resolved = resolveCellStyle({
              format,
              cell,
              measureKey,
              getMeasureValue,
              dimensionValues,
            });
            // ratioTotal stores its value as a fraction (0..1). Default the
            // presentation to percentage unless the user set an explicit
            // per-measure `percentage` override in the Values tab — that way
            // "format as percentage" / decimal-count changes from the dialog
            // flow straight through to the grid.
            const aggFromKey = measureKey
              ? String(measureKey).split(":")[1]
              : null;
            let effectiveSection = getValuesSection(format, measureKey);
            if (
              (aggFromKey === "ratioTotal" || aggFromKey === "currentRatio") &&
              effectiveSection
            ) {
              const uniqueName = String(measureKey).split(":")[0];
              const byMeasure = format?.valuesByMeasure || {};
              const override = byMeasure[measureKey] || byMeasure[uniqueName];
              const userSetPercentage =
                override &&
                Object.prototype.hasOwnProperty.call(override, "percentage");
              if (!userSetPercentage) {
                effectiveSection = { ...effectiveSection, percentage: true };
              }
            }
            const isTotalOfTotalCell = !!rowNode.isTotal && !!col.isTotal;
            const hideCurrentRatioOnTotal =
              aggFromKey === "currentRatio" &&
              (isTotalOfTotalCell || !!col.isTotal);
            const displayValue = hideCurrentRatioOnTotal
              ? ""
              : cell
                ? formatNumberWithFormat(cell.value, effectiveSection) ||
                  cell.formattedValue
                : "";
            const cellClickable =
              options?.enableDrillThrough !== false &&
              !hideCurrentRatioOnTotal &&
              cell &&
              cell.value !== null &&
              cell.value !== undefined;
            const gtCellStyle = isGrandTotal
              ? grandTotalValueStyle
                ? {
                    ...grandTotalValueStyle,
                    textAlign:
                      getValuesSection(format, measureKey)?.textAlign ||
                      "right",
                  }
                : grandTotalValueStyle
              : null;
            return (
              <td
                key={col.key}
                className={colSticky ? "pvt-sticky-col" : undefined}
                style={{
                  minWidth: CELL_MIN_WIDTH,
                  boxSizing: "border-box",
                  ...colSticky,
                }}
              >
                <BodyValueCell
                  isTotal={rowNode.isTotal}
                  isGrandTotal={isGrandTotal}
                  style={isGrandTotal ? gtCellStyle : resolved}
                  shade={shade}
                  density={density}
                  clickable={cellClickable}
                  onClick={
                    cellClickable
                      ? () => openDrillThrough(rowNode.key, col.key, rowNode)
                      : undefined
                  }
                  hiddenMeasureItems={
                    hiddenMeasures.size > 0
                      ? getHiddenMeasureItems(rowNode, col)
                      : null
                  }
                  hiddenMeasuresLabel={
                    t?.grid?.hiddenMeasures || "Hidden measures"
                  }
                  error={cell?.error || null}
                  errorLabel={t?.grid?.formulaError || "Formula error"}
                >
                  {displayValue}
                </BodyValueCell>
              </td>
            );
          })}
        </>
      );
    },
    [
      rowMeta,
      colLeaves,
      stickyColStyle,
      matrix,
      hiddenMeasures,
      getHiddenMeasureItems,
      compact,
      handleToggle,
      handleToggleChildren,
      handleLabelClick,
      openDrillThrough,
      t,
      sort,
      format,
      dimensionStyle,
      grandTotalLabelStyle,
      grandTotalValueStyle,
      alternateRows,
      density,
      rowDimMap,
      colDimMap,
      chevronColWidth,
      hideChevronCol,
      options?.enableDrillThrough,
    ],
  );

  // totalsRowsSticky "after" — render the grand-total row(s) in the fixed
  // (sticky) footer.
  const renderFooterTotals = useCallback(
    () => (
      <>
        {gtRows.map((r, i) => (
          <tr key={`gt-row-${r.key}`} style={{ height: density.rowHeight }}>
            {renderRow(r, i)}
          </tr>
        ))}
      </>
    ),
    [gtRows, renderRow, density.rowHeight],
  );

  if (!matrix) return null;

  if (rowLeaves.length === 0 || colLeaves.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">
          {t?.grid?.empty || "No data to display"}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        "& table": {
          borderCollapse: "separate",
          borderSpacing: 0,
          minWidth: totalWidth,
          tableLayout: "fixed",
        },
        "& thead tr": {
          backgroundColor:
            theme.palette.mode === "dark"
              ? theme.palette.primary[900]
              : theme.palette.primary[100],
        },
        "& thead th": {
          padding: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          textAlign: "left",
          fontWeight: theme.typography.button.fontWeight,
          fontSize: theme.typography.button.fontSize,
          color: theme.palette.text.secondary,
        },
        // Sticky grand-total column header: a plain <th> is transparent (only
        // <thead tr> carries a background), so once it detaches as a sticky
        // cell the scrolling column headers bleed through it. Give it an
        // opaque background matching the header row.
        "& thead th.pvt-sticky-col": {
          backgroundColor:
            theme.palette.mode === "dark"
              ? theme.palette.primary[900]
              : theme.palette.primary[100],
        },
        // Sticky grand-total column body cells must stay opaque even on row
        // hover — `action.hover` is translucent, so otherwise the
        // horizontally-scrolled data cells bleed through them.
        "& tbody td.pvt-sticky-col, & tbody tr:hover td.pvt-sticky-col": {
          backgroundColor: theme.palette.background.paper,
        },
        "& tbody td": {
          padding: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          fontSize: theme.typography.body2.fontSize,
          backgroundColor: theme.palette.background.paper,
        },
        "& tbody tr:hover td": {
          backgroundColor: theme.palette.action.hover,
        },
        // Chevron col never paints its own right border — the label col owns
        // the vertical separator (see `.pvt-label` rule). Top border drawn
        // explicitly so each chevron cell shows a horizontal divider above
        // it (the default `& tbody td` rule only emits borderBottom and
        // borderRight). Empty chevron cells (no icon) hide bg/hover but
        // keep the top border so col 1 still gets the row demarcation.
        "& tbody td.pvt-chevron": {
          borderRight: "none",
          borderBottom: "none",
          borderTop: `1px solid ${theme.palette.divider}`,
        },
        "& tbody td.pvt-chevron-empty, & tbody tr:hover td.pvt-chevron-empty": {
          borderTop: "none",
          // Opaque (not transparent): the chevron col is sticky, so a
          // see-through cell would let data cells bleed under it on
          // horizontal scroll.
          backgroundColor: theme.palette.background.paper,
          pointerEvents: "none",
        },
        "& tbody td.pvt-label": {
          borderLeft: `1px solid ${theme.palette.divider}`,
        },
        // The fixed-footer grand-total row ("after") lives in <tfoot>, which
        // the `& tbody td` rules never reach — give it the same padding,
        // borders and opaque background so it matches the body and stays
        // opaque while rows scroll underneath.
        "& tfoot td": {
          padding: 0,
          borderTop: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          fontSize: theme.typography.body2.fontSize,
          backgroundColor: theme.palette.background.paper,
        },
      })}
    >
      {loading && (
        <Box
          sx={(theme) => ({
            position: "absolute",
            top: 0,
            right: 0,
            px: 1.5,
            py: 0.5,
            fontSize: theme.typography.caption.fontSize,
            color: "primary.main",
            zIndex: 4,
          })}
        >
          {t?.grid?.loading || "Processing…"}
        </Box>
      )}
      <TableVirtuoso
        key={colLeaves.map((c) => c.key).join("|")}
        style={{ height: "100%" }}
        scrollerRef={handleScrollerRef}
        data={dataRows}
        topItemCount={topItemCount}
        fixedHeaderContent={renderHeader}
        fixedFooterContent={
          gtSlot === "footer" ? renderFooterTotals : undefined
        }
        itemContent={(index, row) => renderRow(row, index)}
      />
      <DimensionFilterDialog
        open={!!dimensionFilter}
        uniqueName={dimensionFilter?.uniqueName}
        caption={dimensionFilter?.caption}
        onClose={() => setDimensionFilter(null)}
      />
      <DrillThroughDialog
        open={!!drill?.open}
        rows={drill?.rows}
        breadcrumbs={drill?.breadcrumbs}
        onClose={() => setDrill(null)}
      />
      <Menu
        open={!!sortPicker}
        anchorEl={sortPicker?.anchorEl || null}
        onClose={() => setSortPicker(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={(theme) => ({
              fontWeight: theme.typography.button.fontWeight,
              flex: 1,
            })}
          >
            {t?.grid?.sortByMeasure || "Sort by measure"}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={sortPicker?.direction || "desc"}
            onChange={(_, v) =>
              v && setSortPicker((p) => (p ? { ...p, direction: v } : p))
            }
          >
            <Tooltip
              title={t?.grid?.sortAsc || "Ascending"}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="asc"
                aria-label={t?.grid?.sortAsc || "Ascending"}
                sx={{
                  p: 0.25,
                  lineHeight: 1,
                  "&.Mui-selected svg": { color: "primary.main" },
                }}
              >
                <ArrowUpwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={t?.grid?.sortDesc || "Descending"}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="desc"
                aria-label={t?.grid?.sortDesc || "Descending"}
                sx={{
                  p: 0.25,
                  lineHeight: 1,
                  "&.Mui-selected svg": { color: "primary.main" },
                }}
              >
                <ArrowDownwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Box>
        {(sortPicker?.measures || []).map((m) => {
          const key = `${m.uniqueName}:${m.aggregation}`;
          const isActive =
            !!sort &&
            !!sortPicker &&
            sort.colKey === sortPicker.colKey &&
            sort.colMeasure?.uniqueName === m.uniqueName &&
            sort.colMeasure?.aggregation === m.aggregation;
          return (
            <MenuItem
              key={key}
              selected={isActive}
              onClick={() => {
                engine.setSort(
                  sortPicker.colKey,
                  sortPicker.direction || "desc",
                  { uniqueName: m.uniqueName, aggregation: m.aggregation },
                );
                setSortPicker(null);
              }}
              sx={{ fontWeight: isActive ? 700 : 400 }}
            >
              {m.caption || m.uniqueName}
            </MenuItem>
          );
        })}
        {sort && sortPicker && sort.colKey === sortPicker.colKey && (
          <MenuItem
            onClick={() => {
              engine.setSort(null, null);
              setSortPicker(null);
            }}
            sx={{ color: "error.main", borderTop: 1, borderColor: "divider" }}
          >
            {t?.grid?.removeSort || "Remove sort"}
          </MenuItem>
        )}
      </Menu>
      <Menu
        open={!!rowSortPicker}
        anchorEl={rowSortPicker?.anchorEl || null}
        onClose={() => setRowSortPicker(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={(theme) => ({
              fontWeight: theme.typography.button.fontWeight,
              flex: 1,
            })}
          >
            {t?.grid?.sortByMeasure || "Sort by measure"}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={rowSortPicker?.direction || "desc"}
            onChange={(_, v) =>
              v && setRowSortPicker((p) => (p ? { ...p, direction: v } : p))
            }
          >
            <Tooltip
              title={t?.grid?.sortAsc || "Ascending"}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="asc"
                aria-label={t?.grid?.sortAsc || "Ascending"}
                sx={{
                  p: 0.25,
                  lineHeight: 1,
                  "&.Mui-selected svg": { color: "primary.main" },
                }}
              >
                <ArrowForwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={t?.grid?.sortDesc || "Descending"}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="desc"
                aria-label={t?.grid?.sortDesc || "Descending"}
                sx={{
                  p: 0.25,
                  lineHeight: 1,
                  "&.Mui-selected svg": { color: "primary.main" },
                }}
              >
                <ArrowBackIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Box>
        {(rowSortPicker?.measures || []).map((m) => {
          const key = `${m.uniqueName}:${m.aggregation}`;
          const isActive =
            !!sort &&
            !!rowSortPicker &&
            sort.rowKey === rowSortPicker.rowKey &&
            sort.rowMeasure?.uniqueName === m.uniqueName &&
            sort.rowMeasure?.aggregation === m.aggregation;
          return (
            <MenuItem
              key={key}
              selected={isActive}
              onClick={() => {
                engine.setSortByRow(
                  rowSortPicker.rowKey,
                  rowSortPicker.direction || "desc",
                  { uniqueName: m.uniqueName, aggregation: m.aggregation },
                );
                setRowSortPicker(null);
              }}
              sx={{ fontWeight: isActive ? 700 : 400 }}
            >
              {m.caption || m.uniqueName}
            </MenuItem>
          );
        })}
        {sort && rowSortPicker && sort.rowKey === rowSortPicker.rowKey && (
          <MenuItem
            onClick={() => {
              engine.setSortByRow(null, null);
              setRowSortPicker(null);
            }}
            sx={{ color: "error.main", borderTop: 1, borderColor: "divider" }}
          >
            {t?.grid?.removeSort || "Remove sort"}
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

const DimensionHeaderCell = function DimensionHeaderCell({
  dims,
  captionFor,
  activeFilters,
  onOpen,
  fallback,
  style,
  density,
}) {
  const d = density || DENSITY.Standard;
  const align = style?.textAlign || "left";
  const justify =
    align === "right"
      ? "flex-end"
      : align === "center"
        ? "center"
        : "flex-start";
  if (!dims || dims.length === 0) {
    return (
      <Box
        sx={(theme) => ({
          px: d.headerPaddingX,
          py: d.headerPaddingY,
          minHeight: d.headerCellMinHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: justify,
          fontFamily: style?.fontFamily || "inherit",
          fontWeight: style?.fontWeight || 600,
          fontSize: scaleFontSize(
            style?.fontSize,
            d.headerFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          color:
            style?.color ||
            (theme.palette.mode === "dark"
              ? theme.palette.primary[500]
              : theme.palette.primary[600]),
          fontStyle: "italic",
          opacity: 0.7,
          backgroundColor:
            style?.backgroundColor ||
            (theme.palette.mode === "dark"
              ? theme.palette.primary[900]
              : theme.palette.primary[100]),
        })}
      >
        {fallback}
      </Box>
    );
  }
  return (
    <Box
      sx={(theme) => ({
        px: "6px",
        py: "3px",
        minHeight: d.headerCellMinHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        gap: 0.5,
        flexWrap: "wrap",
        backgroundColor:
          style?.backgroundColor ||
          (theme.palette.mode === "dark"
            ? theme.palette.primary[900]
            : theme.palette.primary[100]),
      })}
    >
      {dims.map((dim) => {
        const active = activeFilters.has(dim.uniqueName);
        return (
          <Box
            key={dim.uniqueName}
            sx={(theme) => ({
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              px: "6px",
              py: "1px",
              borderRadius: theme.shape.borderRadius,
              border: `1px solid ${
                active ? theme.palette.primary.main : theme.palette.divider
              }`,
              backgroundColor: active
                ? theme.palette.action.selected
                : theme.palette.background.paper,
              color: active
                ? theme.palette.primary.main
                : style?.color || theme.palette.text.secondary,
              fontFamily: style?.fontFamily || "inherit",
              fontWeight: style?.fontWeight || 600,
              fontSize: scaleFontSize(
                style?.fontSize,
                d.headerFontSizeRate,
                theme.typography.body2.fontSize,
              ),
              fontStyle: style?.fontStyle || "normal",
              whiteSpace: "nowrap",
            })}
          >
            {active && (
              <FilterAltIcon
                sx={(theme) => ({
                  fontSize: theme.typography.button.fontSize,
                  color: "primary.main",
                  mr: "2px",
                })}
              />
            )}
            <span>{captionFor(dim.uniqueName)}</span>
            <IconButton
              size="small"
              onClick={() => onOpen(dim.uniqueName)}
              sx={(theme) => ({
                p: 0,
                ml: "2px",
                width: 16,
                height: 16,
                "& svg": { fontSize: theme.typography.button.fontSize },
              })}
            >
              <SettingsIcon fontSize="inherit" />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
};

DimensionHeaderCell.propTypes = {
  dims: PropTypes.array,
  captionFor: PropTypes.func.isRequired,
  activeFilters: PropTypes.instanceOf(Set).isRequired,
  onOpen: PropTypes.func.isRequired,
  fallback: PropTypes.string,
  style: PropTypes.object,
  density: PropTypes.object,
};

const HeaderCell = function HeaderCell({
  children,
  primary,
  style,
  density,
  sortable,
  sortDirection,
  sortTooltip,
  onClick,
  action,
  prefix,
}) {
  const d = density || DENSITY.Standard;
  const align = style?.textAlign || "left";
  const justify =
    align === "right"
      ? "flex-end"
      : align === "center"
        ? "center"
        : "flex-start";
  return (
    <Box
      onClick={sortable ? onClick : undefined}
      sx={(theme) => ({
        px: d.headerPaddingX,
        py: d.headerPaddingY,
        minHeight: d.headerCellMinHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        gap: 0.25,
        cursor: sortable ? "pointer" : "default",
        userSelect: "none",
        backgroundColor:
          style?.backgroundColor ||
          (theme.palette.mode === "dark"
            ? theme.palette.primary[900]
            : theme.palette.primary[100]),
        fontFamily: style?.fontFamily || "inherit",
        fontWeight: style?.fontWeight || 600,
        fontStyle: style?.fontStyle || "normal",
        color:
          style?.color ||
          (primary ? theme.palette.primary.main : theme.palette.text.secondary),
        fontSize: scaleFontSize(
          style?.fontSize,
          d.headerFontSizeRate,
          theme.typography.body2.fontSize,
        ),
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        transition: "background-color 120ms ease",
        "&:hover": sortable
          ? {
              backgroundColor: theme.palette.action.hover,
            }
          : undefined,
      })}
    >
      {prefix}
      <Box
        component="span"
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: align,
        }}
      >
        {children}
      </Box>
      {sortable && sortDirection === "asc" && (
        <Tooltip title={sortTooltip || ""} disableInteractive arrow>
          <ArrowUpwardIcon
            sx={(theme) => ({
              fontSize: theme.typography.subtitle2.fontSize,
              color: "primary.main",
            })}
          />
        </Tooltip>
      )}
      {sortable && sortDirection === "desc" && (
        <Tooltip title={sortTooltip || ""} disableInteractive arrow>
          <ArrowDownwardIcon
            sx={(theme) => ({
              fontSize: theme.typography.subtitle2.fontSize,
              color: "primary.main",
            })}
          />
        </Tooltip>
      )}
      {sortable && !sortDirection && (
        <ArrowDownwardIcon
          sx={(theme) => ({
            fontSize: theme.typography.subtitle2.fontSize,
            opacity: 0.2,
            flexShrink: 0,
          })}
        />
      )}
      {action && (
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

HeaderCell.propTypes = {
  children: PropTypes.node,
  primary: PropTypes.bool,
  style: PropTypes.object,
  density: PropTypes.object,
  sortable: PropTypes.bool,
  sortDirection: PropTypes.oneOf(["asc", "desc", null]),
  sortTooltip: PropTypes.string,
  onClick: PropTypes.func,
  action: PropTypes.node,
  prefix: PropTypes.node,
};

const SHADE_AMOUNT = [0, 0.04, 0.08, 0.12];

const tintForMode = (color, amount, mode) => {
  if (!color || !amount) return color;
  try {
    return mode === "dark" ? lighten(color, amount) : darken(color, amount);
  } catch {
    return color;
  }
};

const GRAND_TOTAL_TINT = 0.18;

const ChevronCell = function ChevronCell({
  show,
  expanded,
  onToggle,
  isGrandTotal,
  isTotal,
  shade,
  style,
  density,
  indent,
}) {
  const d = density || DENSITY.Standard;
  return (
    <Box
      sx={(theme) => {
        const amt = SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))];
        const basePaper = theme.palette.background.paper;
        const stripedBg = tintForMode(basePaper, amt, theme.palette.mode);
        const grandTotalBg = tintForMode(
          basePaper,
          GRAND_TOTAL_TINT,
          theme.palette.mode,
        );
        return {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: `${(indent || 0) + 7}px`,
          width: "100%",
          height: "100%",
          minHeight: d.rowHeight,
          backgroundColor: show
            ? isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : stripedBg
            : "transparent",
        };
      }}
    >
      {show && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          sx={(theme) => ({
            p: 0,
            width: 18,
            height: 18,
            "& svg": { fontSize: theme.typography.body2.fontSize },
            backgroundColor:
              style?.backgroundColor ||
              (theme.palette.mode === "dark"
                ? theme.palette.primary[900]
                : theme.palette.primary[100]),
          })}
        >
          {expanded ? (
            <ExpandMoreIcon fontSize="inherit" />
          ) : (
            <ExpandLessIcon fontSize="inherit" />
          )}
        </IconButton>
      )}
    </Box>
  );
};

ChevronCell.propTypes = {
  show: PropTypes.bool,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func,
  isGrandTotal: PropTypes.bool,
  isTotal: PropTypes.bool,
  shade: PropTypes.number,
  density: PropTypes.object,
  indent: PropTypes.number,
};

const BodyLabelCell = function BodyLabelCell({
  indent,
  isTotal,
  isGrandTotal,
  caption,
  onToggleChildren,
  style,
  shade,
  density,
  sortable,
  sortDirection,
  sortTooltip,
  onSortClick,
}) {
  const { localization: t } = usePivot();
  const d = density || DENSITY.Standard;
  return (
    <Box
      onClick={sortable ? onSortClick : undefined}
      sx={(theme) => {
        const amt = SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))];
        const basePaper = theme.palette.background.paper;
        const stripedBg = tintForMode(basePaper, amt, theme.palette.mode);
        const grandTotalBg = tintForMode(
          basePaper,
          GRAND_TOTAL_TINT,
          theme.palette.mode,
        );
        return {
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          paddingLeft: `${indent + 4}px`,
          paddingRight: "8px",
          paddingTop: d.rowPaddingY,
          paddingBottom: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || "inherit",
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || "normal",
          fontWeight: isGrandTotal
            ? style?.fontWeight || 700
            : isTotal
              ? 700
              : style?.fontWeight || 500,
          backgroundColor:
            style?.backgroundColor ||
            (isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : stripedBg),
          color: style?.color || theme.palette.text.primary,
          textAlign: style?.textAlign || "left",
          cursor: sortable ? "pointer" : "default",
          userSelect: sortable ? "none" : "auto",
          transition: "background-color 120ms ease",
          "&:hover": sortable
            ? { backgroundColor: theme.palette.action.hover }
            : undefined,
        };
      }}
    >
      <Box
        component="span"
        sx={{
          flex: "1 1 auto",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </Box>
      {sortable && sortDirection === "asc" && (
        <Tooltip title={sortTooltip || ""} disableInteractive arrow>
          <ArrowForwardIcon
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: "primary.main",
              flexShrink: 0,
            })}
          />
        </Tooltip>
      )}
      {sortable && sortDirection === "desc" && (
        <Tooltip title={sortTooltip || ""} disableInteractive arrow>
          <ArrowBackIcon
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: "primary.main",
              flexShrink: 0,
            })}
          />
        </Tooltip>
      )}
      {sortable && !sortDirection && (
        <ArrowForwardIcon
          sx={(theme) => ({
            fontSize: theme.typography.body2.fontSize,
            opacity: 0.2,
            flexShrink: 0,
          })}
        />
      )}
      {onToggleChildren && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleChildren();
          }}
          title={
            t?.grid?.expandCollapseChildren || "Expand / Collapse level below"
          }
          sx={(theme) => ({
            p: 0,
            ml: 0.5,
            flexShrink: 0,
            width: 16,
            height: 16,
            opacity: 0.55,
            "&:hover": { opacity: 1 },
            "& svg": { fontSize: theme.typography.body2.fontSize },
          })}
        >
          <UnfoldMoreIcon fontSize="inherit" />
        </IconButton>
      )}
    </Box>
  );
};

BodyLabelCell.propTypes = {
  indent: PropTypes.number,
  isTotal: PropTypes.bool,
  isGrandTotal: PropTypes.bool,
  caption: PropTypes.string,
  onToggleChildren: PropTypes.func,
  style: PropTypes.object,
  shade: PropTypes.number,
  density: PropTypes.object,
  sortable: PropTypes.bool,
  sortDirection: PropTypes.oneOf(["asc", "desc", null]),
  sortTooltip: PropTypes.string,
  onSortClick: PropTypes.func,
};

const BodyValueCell = function BodyValueCell({
  children,
  isTotal,
  isGrandTotal,
  style,
  shade,
  density,
  clickable,
  onClick,
  hiddenMeasureItems,
  hiddenMeasuresLabel,
  error,
  errorLabel,
}) {
  const d = density || DENSITY.Standard;
  const ruleBg = style?.backgroundColor;
  const ruleColor = style?.color;
  const safeDarken = (c, amount) => {
    try {
      return darken(c, amount);
    } catch {
      return c;
    }
  };
  const shadeAmt = SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))];
  // Grand totals: use user-defined colors verbatim — the user picks them in
  // the dedicated tab and expects them to show as-is. Subtotals still get a
  // small darken against their section color so they stand out from the
  // surrounding data.
  const effectiveBg = ruleBg
    ? isGrandTotal
      ? ruleBg
      : isTotal
        ? safeDarken(ruleBg, 0.25)
        : shadeAmt > 0
          ? safeDarken(ruleBg, shadeAmt + 0.05)
          : ruleBg
    : null;
  const effectiveColor = ruleColor
    ? isGrandTotal
      ? ruleColor
      : isTotal
        ? safeDarken(ruleColor, 0.25)
        : ruleColor
    : null;
  const cellBox = (
    <Box
      onClick={clickable ? onClick : undefined}
      sx={(theme) => {
        const basePaper = theme.palette.background.paper;
        const stripedBg = tintForMode(basePaper, shadeAmt, theme.palette.mode);
        const grandTotalBg = tintForMode(
          basePaper,
          GRAND_TOTAL_TINT,
          theme.palette.mode,
        );
        return {
          px: d.bodyPaddingX,
          py: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || "inherit",
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || "normal",
          textAlign: style?.textAlign || "right",
          fontVariantNumeric: "tabular-nums",
          fontWeight: style?.fontWeight ?? (isTotal ? 700 : 400),
          cursor: clickable ? "pointer" : "default",
          backgroundColor:
            effectiveBg ||
            (isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : shadeAmt > 0
                  ? stripedBg
                  : "transparent"),
          color: effectiveColor || theme.palette.text.primary,
          transition: "background-color 80ms ease",
          "&:hover": clickable
            ? {
                backgroundColor: effectiveBg
                  ? safeDarken(effectiveBg, 0.1)
                  : theme.palette.action.focus,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }
            : undefined,
        };
      }}
    >
      {error ? (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            width: "100%",
            justifyContent:
              style?.textAlign === "left"
                ? "flex-start"
                : style?.textAlign === "center"
                  ? "center"
                  : "flex-end",
          }}
        >
          <span>{children}</span>
          <ErrorOutlineIcon
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: "error.main",
              flexShrink: 0,
            })}
          />
        </Box>
      ) : (
        children
      )}
    </Box>
  );
  if (error) {
    return (
      <Tooltip
        arrow
        placement="top"
        enterDelay={150}
        leaveDelay={50}
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: "background.paper",
              color: "text.primary",
              border: (theme) => `1px solid ${theme.palette.error.main}`,
              boxShadow: 3,
              p: 1,
              maxWidth: 360,
            },
          },
          arrow: { sx: { color: "background.paper" } },
        }}
        title={
          <Box>
            <Typography
              variant="caption"
              sx={(theme) => ({
                display: "block",
                fontWeight: theme.typography.h2.fontWeight,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                color: "error.main",
                mb: 0.5,
              })}
            >
              {errorLabel}
            </Typography>
            <Typography
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {error}
            </Typography>
          </Box>
        }
      >
        {cellBox}
      </Tooltip>
    );
  }
  if (!hiddenMeasureItems || hiddenMeasureItems.length === 0) return cellBox;
  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={250}
      leaveDelay={50}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            border: (theme) => `1px solid ${theme.palette.divider}`,
            boxShadow: 3,
            p: 1,
            maxWidth: 320,
          },
        },
        arrow: { sx: { color: "background.paper" } },
      }}
      title={
        <Box sx={{ minWidth: 200 }}>
          <Typography
            variant="caption"
            sx={(theme) => ({
              display: "block",
              fontWeight: theme.typography.h2.fontWeight,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              color: "primary.main",
              mb: 0.5,
            })}
          >
            {hiddenMeasuresLabel}
          </Typography>
          <Stack component="dl" gap={0.25} sx={{ m: 0, "& dt,& dd": { m: 0 } }}>
            {hiddenMeasureItems.map((it, i) => (
              <Stack
                key={`${it.uniqueName}:${it.aggregation}`}
                direction="row"
                alignItems="baseline"
                spacing={1.5}
                sx={(theme) => ({
                  py: 0.25,
                  borderTop:
                    i === 0 ? "none" : `1px dashed ${theme.palette.divider}`,
                })}
              >
                <Typography
                  component="dt"
                  variant="caption"
                  sx={(theme) => ({
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    opacity: 0.8,
                    fontWeight: theme.typography.subtitle1.fontWeight,
                  })}
                >
                  {it.caption}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  sx={(theme) => ({
                    flexShrink: 0,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: theme.typography.h2.fontWeight,
                    color: "text.primary",
                  })}
                >
                  {it.formatted}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      }
    >
      {cellBox}
    </Tooltip>
  );
};

BodyValueCell.propTypes = {
  children: PropTypes.node,
  isTotal: PropTypes.bool,
  isGrandTotal: PropTypes.bool,
  style: PropTypes.object,
  shade: PropTypes.number,
  density: PropTypes.object,
  clickable: PropTypes.bool,
  onClick: PropTypes.func,
  hiddenMeasureItems: PropTypes.array,
  hiddenMeasuresLabel: PropTypes.string,
  error: PropTypes.string,
  errorLabel: PropTypes.string,
};

export default PivotTable;
