import React, {
  useMemo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { darken, lighten } from '@mui/material/styles';
import { TableVirtuoso } from 'react-virtuoso';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { findNodeByKey } from '../../pivot-core/slice/TreeBuilder';
import { isFilterActive } from '../../pivot-core/slice/FilterEngine';
import { usePivot } from '../../context/PivotContext';
import usePivotMatrix from '../../hooks/usePivotMatrix';
import useEngineVersion from '../../hooks/useEngineVersion';
import usePortalContainer from '../../hooks/usePortalContainer';
import {
  resolveCellStyle,
  formatNumberWithFormat,
  getValuesSection,
} from '../../pivot-core/format/CellFormatter';
import type {
  CellStyle,
  FormatObject,
} from '../../pivot-core/format/CellFormatter';
import type {
  AxisLeaf,
  EnrichedMeasure,
} from '../../pivot-core/matrix/MatrixComputer';
import type { DataRow, TreeNode } from '../../pivot-core/types';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';
import type PivotEngine from '../../pivot-core/PivotEngine';
import type { InternalSlice, InternalSort } from '../../pivot-core/PivotEngine';
import DimensionFilterDialog from '../DimensionFilterDialog/DimensionFilterDialog';
import DrillThroughDialog from '../DrillThroughDialog/DrillThroughDialog';
import SortDirectionToggle from '../shared/SortDirectionToggle';
import type { SortToggleDirection } from '../shared/SortDirectionToggle';
import { measureCaption, section } from '../shared/l10n';

/** Measure reference used by the sort pickers. */
interface MeasureRef {
  uniqueName: string;
  aggregation: string;
}

/**
 * One sortable axis. A column-header click sorts the rows by that column
 * (engine.setSort); a row-label click sorts the columns by that row
 * (engine.setSortByRow). Each keeps its state in `slice.sort` under its own
 * field names.
 */
interface SortAxis {
  keyField: 'colKey' | 'rowKey';
  dirField: 'colDirection' | 'rowDirection';
  measureField: 'colMeasure' | 'rowMeasure';
  /**
   * Matrix flag for measures on the other axis. A leaf then spans every
   * measure, so a click asks which one drives the sort.
   */
  measuresAcross: 'measuresOnRows' | 'measuresOnColumns';
  apply: (
    engine: PivotEngine,
    key: string | null,
    direction: string | null,
    measure: MeasureRef | null,
  ) => void;
  AscIcon: typeof ArrowUpwardIcon;
  DescIcon: typeof ArrowUpwardIcon;
  /** Faded hint on unsorted leaves, pointing along the axis it reorders. */
  IdleIcon: typeof ArrowUpwardIcon;
}

const SORT_AXES: Record<'col' | 'row', SortAxis> = {
  col: {
    keyField: 'colKey',
    dirField: 'colDirection',
    measureField: 'colMeasure',
    measuresAcross: 'measuresOnRows',
    apply: (engine, key, direction, measure) =>
      engine.setSort(key, direction, measure),
    AscIcon: ArrowUpwardIcon,
    DescIcon: ArrowDownwardIcon,
    IdleIcon: ArrowDownwardIcon,
  },
  row: {
    keyField: 'rowKey',
    dirField: 'rowDirection',
    measureField: 'rowMeasure',
    measuresAcross: 'measuresOnColumns',
    apply: (engine, key, direction, measure) =>
      engine.setSortByRow(key, direction, measure),
    AscIcon: ArrowForwardIcon,
    DescIcon: ArrowBackIcon,
    IdleIcon: ArrowForwardIcon,
  },
};

/** A leaf's sort arrow: its axis, the active direction and the hover text. */
interface LeafSort {
  axis: SortAxis;
  direction: string | null;
  tooltip: string;
}

/** State of the sort-by-measure picker menu. */
interface SortPickerState {
  axis: SortAxis;
  anchorEl: HTMLElement;
  key: string;
  measures: EnrichedMeasure[];
  direction: SortToggleDirection;
}

/** One entry of the hidden-measures hover tooltip. */
interface HiddenMeasureItem {
  uniqueName: string;
  caption: string;
  aggregation: string;
  formatted: string;
}

// Theme palettes built from a full color object carry numeric shades
// (100..900) at runtime, but MUI's PaletteColor type only declares
// light/main/dark. Themes built from { main } alone return undefined and
// every caller falls back.
const primaryShade = (primary: unknown, key: number): string | undefined =>
  (primary as Record<number, string | undefined>)[key];

/** Default header background: a light primary tint, a deep one in dark mode. */
const headerBg = (theme: Theme): string | undefined =>
  primaryShade(
    theme.palette.primary,
    theme.palette.mode === 'dark' ? 900 : 100,
  );

/** Flex justification matching a text alignment. */
const justifyFor = (align: string): string =>
  align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

/** An axis key without its "||M:<measure>" variant suffix. */
const baseKey = (key: string): string => String(key).split('||M:')[0];

/** Key of a row/column pair in the `cellsByBase` index. */
const cellBaseKey = (rowKey: string, colKey: string): string =>
  `${baseKey(rowKey)}::${baseKey(colKey)}`;

// With the Measures field on rows each tree node is rendered once per
// measure; `nodeKey` names the underlying tree node, which owns the
// expansion state.
const nodeKeyOf = (leaf: AxisLeaf): string => leaf.nodeKey || leaf.key;

const INDENT_PX = 16;
const CELL_MIN_WIDTH = 96;
const CHEVRON_COL_WIDTH = 32;
const LABEL_COL_WIDTH = 240;

const DENSITY = {
  Compact: {
    rowHeight: 20,
    rowPaddingY: '1px',
    rowLineHeight: '18px',
    bodyFontSizeRate: 0.85,
    bodyPaddingX: '8px',
    headerRowHeight: 36,
    headerCellMinHeight: 22,
    headerFontSizeRate: 0.85,
    headerPaddingY: '2px',
    headerPaddingX: '8px',
  },
  Standard: {
    rowHeight: 24,
    rowPaddingY: '2px',
    rowLineHeight: '20px',
    bodyFontSizeRate: 1,
    bodyPaddingX: '10px',
    headerRowHeight: 48,
    headerCellMinHeight: 26,
    headerFontSizeRate: 1,
    headerPaddingY: '4px',
    headerPaddingX: '10px',
  },
  Comfortable: {
    rowHeight: 32,
    rowPaddingY: '6px',
    rowLineHeight: '20px',
    bodyFontSizeRate: 1.25,
    bodyPaddingX: '12px',
    headerRowHeight: 56,
    headerCellMinHeight: 32,
    headerFontSizeRate: 1.25,
    headerPaddingY: '8px',
    headerPaddingX: '12px',
  },
};
type DensityConfig = (typeof DENSITY)[keyof typeof DENSITY];
const resolveDensity = (key?: string | null): DensityConfig =>
  DENSITY[key as keyof typeof DENSITY] || DENSITY.Standard;

// Scale a CSS fontSize value ("13px" | "0.9rem" | 13) by a numeric rate.
// Returns a CSS string with the original unit (defaults to px) or undefined
// when no input is provided so the caller can fall back to its own default.
const scaleFontSize = (
  raw: string | number | null | undefined,
  rate = 1,
  fallback?: string | number,
): string | undefined => {
  const r = typeof rate === 'number' && rate > 0 ? rate : 1;
  if (raw == null || raw === '') {
    return fallback != null ? scaleFontSize(fallback, r) : undefined;
  }
  if (typeof raw === 'number') return `${raw * r}px`;
  const m = String(raw).match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m) return String(raw);
  const n = parseFloat(m[1]);
  const unit = m[2] || 'px';
  return `${n * r}${unit}`;
};

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
  const { engine, localization, options } = usePivot();
  // section() returns a fresh {} for a missing section; memoizing keeps the
  // callbacks below that read it stable across renders.
  const tGrid = useMemo(() => section(localization, 'grid'), [localization]);
  const { matrix, loading } = usePivotMatrix(engine);
  // The engine object mutates in place, so its state is read through a memo
  // keyed on the shared subscription counter (see useEngineVersion).
  const engineVersion = useEngineVersion(engine);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const format = useMemo(() => engine.getFormat(), [engine, engineVersion]);
  const slice = useMemo<InternalSlice>(
    () => engine.getSlice(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engineVersion],
  );
  // Engine snapshot and formatter input share their runtime shape; their
  // index signatures make them nominally incompatible — single boundary cast.
  const formatObj = format as unknown as FormatObject;
  const sort = slice?.sort || null;
  const [dimensionFilter, setDimensionFilter] = useState<{
    uniqueName: string;
    caption: string;
  } | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // Opened by a column-header or row-label click when that leaf spans
  // several measures, so the user chooses which one drives the sort.
  const [sortPicker, setSortPicker] = useState<SortPickerState | null>(null);

  const compact = (options?.grid?.type || 'compact') === 'compact';

  const handleToggle = useCallback(
    (nodeKey: string) => {
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

  const hiddenMeasures = useMemo(() => {
    const s = new Set<string>();
    (slice.measures || []).forEach((m) => {
      if (m?.hidden && m.uniqueName) {
        s.add(`${m.uniqueName}:${m.aggregation}`);
      }
    });
    return s;
  }, [slice.measures]);

  const colLeaves = useMemo(() => {
    let leaves = matrix?.colLeaves || [];
    if (hiddenMeasures.size > 0) {
      leaves = leaves.filter(
        (c) => !(c.measureKey && hiddenMeasures.has(c.measureKey)),
      );
    }
    // currentRatio on the grand-total column always collapses to 100%, so
    // when it is the only measure on the slice the grand-total column adds
    // no information — drop it from the visible leaves.
    const visibleMeasures = (matrix?.measures || []).filter(
      (m) =>
        m.aggregation !== 'formula' &&
        !hiddenMeasures.has(`${m.uniqueName}:${m.aggregation}`),
    );
    const onlyCurrentRatio =
      visibleMeasures.length === 1 &&
      visibleMeasures[0].aggregation === 'currentRatio';
    if (onlyCurrentRatio) {
      leaves = leaves.filter((c) => !(c.isTotal && c.depth === -1));
    }
    return leaves;
  }, [matrix?.colLeaves, matrix?.measures, hiddenMeasures]);

  const rowLeaves = useMemo(() => {
    const leaves = matrix?.rowLeaves || [];
    if (hiddenMeasures.size === 0) return leaves;
    return leaves.filter(
      (r) => !(r.measureKey && hiddenMeasures.has(r.measureKey)),
    );
  }, [matrix?.rowLeaves, hiddenMeasures]);

  // Sticky grand totals — read the layout flags once.
  const stickyRowTotals = !!format?.layout?.totalsRowsSticky;
  const stickyColTotals = !!format?.layout?.totalsColumnsSticky;
  const rowsTotalsPosition = format?.layout?.totalsRowsPosition || 'before';
  const colsTotalsPosition = format?.layout?.totalsColumnsPosition || 'before';

  // When totalsRowsSticky is on, pin the grand-total row(s) (depth -1).
  // "before": they are already the leading rows — keep them in the data and
  // pin via Virtuoso's `topItemCount`. "after": pull them out and render them
  // in the fixed (sticky) footer. Stuffing a data row into the sticky <thead>
  // breaks Virtuoso's header measurement, so `topItemCount` is used instead.
  const { dataRows, gtRows, gtSlot, topItemCount } = useMemo(() => {
    const off = {
      dataRows: rowLeaves,
      gtRows: [] as AxisLeaf[],
      gtSlot: null as string | null,
      topItemCount: 0,
    };
    if (!stickyRowTotals || rowsTotalsPosition === 'none') return off;
    const isGT = (r: AxisLeaf) => !!(r?.isTotal && r.depth === -1);
    if (rowsTotalsPosition === 'before') {
      let n = 0;
      while (n < rowLeaves.length && isGT(rowLeaves[n])) n += 1;
      return n > 0 ? { ...off, topItemCount: n } : off;
    }
    const gt: AxisLeaf[] = [];
    const body: AxisLeaf[] = [];
    for (const r of rowLeaves) {
      if (isGT(r)) gt.push(r);
      else body.push(r);
    }
    if (gt.length === 0) return off;
    return { dataRows: body, gtRows: gt, gtSlot: 'footer', topItemCount: 0 };
  }, [rowLeaves, stickyRowTotals, rowsTotalsPosition]);

  // In perRow layout every data-context leaf expands into N consecutive
  // measure rows. The zebra needs to shade each group distinctly while still
  // alternating measures inside the group, yielding four shade levels instead
  // of two. For layouts without measures-on-rows the meta collapses to the
  // usual one-stripe-per-row pattern.
  const rowMeta = useMemo(() => {
    const hasMeasuresOnRows = dataRows.some((l) => l?.measureKey);
    const meta = new Array<{ groupIndex: number; measureIdx: number }>(
      dataRows.length,
    );
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

  const rowDimensions = useMemo(
    () => (slice.rows || []).filter((f) => f.uniqueName !== 'Measures'),
    [slice.rows],
  );
  const colDimensions = useMemo(
    () => (slice.columns || []).filter((f) => f.uniqueName !== 'Measures'),
    [slice.columns],
  );

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
  const hideChevronCol = !!matrix?.measuresOnRows && rowDimensions.length <= 1;
  const chevronColWidth = hideChevronCol ? 0 : CHEVRON_COL_WIDTH + maxRowIndent;

  // Sticky grand-total columns keep their normal width — forcing a width
  // shrinks them. Instead every data-column header carries a `data-pvt-ci`
  // attribute; after layout its real `offsetLeft` is measured and the sticky
  // cell is pinned to that exact device-pixel offset, so the columns neither
  // overlap nor leave seams while scrolling, at any width.
  const scrollerElRef = useRef<HTMLElement | null>(null);
  const scrollerObsRef = useRef<ResizeObserver | null>(null);
  const [measureTick, setMeasureTick] = useState(0);
  const handleScrollerRef = useCallback((node: HTMLElement | Window | null) => {
    if (scrollerObsRef.current) {
      scrollerObsRef.current.disconnect();
      scrollerObsRef.current = null;
    }
    scrollerElRef.current = node && node instanceof HTMLElement ? node : null;
    if (!scrollerElRef.current) return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(scrollerElRef.current);
    scrollerObsRef.current = ro;
    setMeasureTick((t) => t + 1);
  }, []);

  // `colGeom` maps each data-column index to its measured natural offsetLeft,
  // plus `__cw` (the table's full content width). `null` when sticky is off.
  const [colGeom, setColGeom] = useState<Record<string, number> | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollerElRef.current;
    if (!scroller || !stickyColTotals || colsTotalsPosition === 'none') {
      setColGeom((prev) => (prev === null ? prev : null));
      return;
    }
    const ths = scroller.querySelectorAll<HTMLTableCellElement>(
      'thead th[data-pvt-ci]',
    );
    if (!ths.length) return;
    const geom: Record<string, number> = {};
    let contentWidth = 0;
    ths.forEach((th) => {
      geom[th.getAttribute('data-pvt-ci') ?? ''] = th.offsetLeft;
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
    (
      col: AxisLeaf,
      ci: number,
      isHeader: boolean,
    ): React.CSSProperties | null => {
      if (!stickyColTotals || colsTotalsPosition === 'none') return null;
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
      if (colsTotalsPosition === 'after') {
        // Right offset = distance from this column's right edge (== the next
        // column's measured left) to the table's content right edge.
        const nextLeft = colGeom[String(ci + 1)];
        const rightEdge = nextLeft == null ? colGeom.__cw : nextLeft;
        return {
          position: 'sticky',
          right: colGeom.__cw - rightEdge,
          zIndex,
        };
      }
      return { position: 'sticky', left: colGeom[String(ci)], zIndex };
    },
    [stickyColTotals, colsTotalsPosition, colGeom, stickyRowTotals],
  );

  const totalWidth =
    chevronColWidth +
    LABEL_COL_WIDTH +
    CELL_MIN_WIDTH * Math.max(1, colLeaves.length);

  const headerStyle = useMemo(
    () => resolveCellStyle({ format: formatObj, scope: 'headers' }),
    [formatObj],
  );
  const dimensionStyle = useMemo(
    () => resolveCellStyle({ format: formatObj, scope: 'dimensions' }),
    [formatObj],
  );
  const grandTotalStyle = useMemo(
    () => resolveCellStyle({ format: formatObj, scope: 'grandTotals' }),
    [formatObj],
  );
  // Data columns should share their text-align with the value cells below
  // them so numbers line up against their header.
  const dataAlign = format?.values?.textAlign || 'right';
  const density = resolveDensity(format?.layout?.density as string | undefined);
  // Both the Format dialog toggle and the options prop's
  // layout.enableDrillThrough land in format.layout; unset means on.
  const drillThroughEnabled = format?.layout?.enableDrillThrough !== false;

  // Direction and hover text of a leaf's sort arrow. The tooltip names the
  // measure too when the sort was keyed on one from the picker.
  const leafSortFor = useCallback(
    (axis: SortAxis, leaf: AxisLeaf): LeafSort => {
      if (!sort || sort[axis.keyField] !== leaf.key) {
        return { axis, direction: null, tooltip: '' };
      }
      const direction = sort[axis.dirField] ?? null;
      const dirLabel =
        direction === 'asc'
          ? tGrid.sortAsc || 'Ascending'
          : tGrid.sortDesc || 'Descending';
      const ref = sort[axis.measureField] as Partial<MeasureRef> | null;
      const m = ref
        ? (matrix?.measures || []).find(
            (mm) =>
              mm.uniqueName === ref.uniqueName &&
              mm.aggregation === ref.aggregation,
          )
        : undefined;
      const measureLabel = m ? ` — ${m.caption || m.uniqueName}` : '';
      return {
        axis,
        direction,
        tooltip: `${leaf.caption || ''}${measureLabel} (${dirLabel})`,
      };
    },
    [sort, tGrid, matrix?.measures],
  );

  const handleSortClick = useCallback(
    (axis: SortAxis, leaf: AxisLeaf, evt: React.MouseEvent<HTMLElement>) => {
      if (!leaf.key) return;
      const current = engine.getSlice()?.sort || null;
      // Computed (formula) fields are valid sort keys — their values live in
      // the same matrix cells under the `formula` aggregation suffix.
      // Grand-total leaves leave out currentRatio: on the grand-total column
      // it is 100% in every row, so sorting by it is meaningless.
      const isGrandTotal = !!(leaf.isTotal && leaf.depth === -1);
      const measures = (matrix?.measures || []).filter(
        (m) => !isGrandTotal || m.aggregation !== 'currentRatio',
      );
      if (matrix?.[axis.measuresAcross] && measures.length > 1) {
        setSortPicker({
          axis,
          anchorEl: evt.currentTarget,
          key: leaf.key,
          measures,
          direction:
            current?.[axis.keyField] === leaf.key &&
            current[axis.dirField] === 'asc'
              ? 'asc'
              : 'desc',
        });
        return;
      }
      // Clicks cycle desc → asc → off. A sort keyed on a measure picked
      // earlier is replaced, starting over at desc.
      const measure = current?.[
        axis.measureField
      ] as Partial<MeasureRef> | null;
      let next: string | null = 'desc';
      if (
        current?.[axis.keyField] === leaf.key &&
        !measure?.uniqueName &&
        !measure?.aggregation
      ) {
        if (current[axis.dirField] === 'desc') next = 'asc';
        else if (current[axis.dirField] === 'asc') next = null;
      }
      axis.apply(engine, next ? leaf.key : null, next, null);
    },
    [engine, matrix],
  );

  const metadata = engine.getMetadata();

  const totalCaption = useMemo(() => {
    // When Measures live on the column axis (perColumn), the grand-total ROW
    // header carries no measure context — every measure shows up as its own
    // column leaf. Keep the label plain so it doesn't duplicate column captions.
    if (matrix?.measuresOnColumns) {
      return tGrid.total || 'Total';
    }
    const measures = matrix?.measures || [];
    if (measures.length === 0) {
      return tGrid.grandTotal || 'Grand Total';
    }
    // The engine pre-builds a grand-total caption per measure from the
    // dictionary template ("Total of {field} ({agg})").
    return measures
      .map(
        (m) =>
          m.grandTotalCaption ||
          m.caption ||
          metadata?.[m.uniqueName]?.caption ||
          m.uniqueName,
      )
      .join(' · ');
  }, [matrix?.measures, matrix?.measuresOnColumns, metadata, tGrid]);

  // Caption of a totals-'after' subtotal row. The member name is templated
  // ("IT" → "IT Total") so the row reads as the group's closing total rather
  // than as a second copy of its header; with measures on rows the measure
  // suffix is re-appended after the template.
  const subtotalCaption = useCallback(
    (rowNode: AxisLeaf) => {
      const template = tGrid.subtotalCaptionTemplate || '{member} Total';
      const member = rowNode.memberCaption ?? rowNode.caption;
      const labelled = template.replace('{member}', member);
      return rowNode.measureCaption
        ? `${labelled} — ${rowNode.measureCaption}`
        : labelled;
    },
    [tGrid],
  );

  const captionFor = useCallback(
    (uniqueName: string) => {
      if (uniqueName === 'Measures') {
        return section(localization, 'fieldsList').values || 'Values';
      }
      return metadata[uniqueName]?.caption || uniqueName;
    },
    [metadata, localization],
  );

  const activeFilterFields = useMemo(
    () =>
      new Set(
        (slice.filters || []).filter(isFilterActive).map((f) => f.uniqueName),
      ),
    [slice.filters],
  );

  const openDimensionFilter = useCallback(
    (uniqueName: string) =>
      setDimensionFilter({
        uniqueName,
        caption: captionFor(uniqueName),
      }),
    [captionFor],
  );

  const [drill, setDrill] = useState<{
    rows: DataRow[];
    breadcrumbs: { field?: string; value?: string }[];
  } | null>(null);

  // One index per matrix: "<rowBase>::<colBase>" -> measureKey -> value,
  // where a base key is the axis key with its "||M:<measure>" variant suffix
  // stripped. It lets a cell reach its sibling measures (conditional-format
  // operands, the hidden-measures tooltip) without scanning every cell.
  // Insertion order is preserved, so the first cell per measure wins.
  const cellsByBase = useMemo(() => {
    const idx = new Map<string, Map<string, number | null>>();
    if (!matrix) return idx;
    for (const [k, v] of matrix.cells) {
      const sep = k.indexOf('::');
      if (sep < 0) continue;
      const mk = v?.measureKey;
      if (!mk) continue;
      const base = cellBaseKey(k.slice(0, sep), k.slice(sep + 2));
      let byMeasure = idx.get(base);
      if (!byMeasure) {
        byMeasure = new Map();
        idx.set(base, byMeasure);
      }
      if (!byMeasure.has(mk)) byMeasure.set(mk, v.value);
    }
    return idx;
  }, [matrix]);

  const hiddenMeasureItemsFor = useCallback(
    (rowNode: AxisLeaf, col: AxisLeaf): HiddenMeasureItem[] => {
      if (hiddenMeasures.size === 0 || !matrix) return [];
      const byMeasure = cellsByBase.get(cellBaseKey(rowNode.key, col.key));
      return (slice.measures || [])
        .filter((m) => m?.hidden)
        .map((m) => {
          const measureKey = `${m.uniqueName}:${m.aggregation}`;
          return {
            uniqueName: m.uniqueName,
            caption: measureCaption(engine, m, localization),
            aggregation: m.aggregation,
            formatted: byMeasure?.has(measureKey)
              ? formatNumberWithFormat(
                  byMeasure.get(measureKey) ?? null,
                  getValuesSection(formatObj, measureKey),
                )
              : '—',
          };
        });
    },
    [
      engine,
      localization,
      hiddenMeasures,
      matrix,
      cellsByBase,
      slice.measures,
      formatObj,
    ],
  );

  const handleToggleChildren = useCallback(
    (parentKey: string | null) => {
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
          expandedMembers: fullyExpanded ? ['__root__'] : [],
        },
      });
    },
    [engine],
  );

  // Same predicate the global branch of handleToggleChildren uses, so the
  // button's icon always matches what the next click will do.
  const gridFullyExpanded = useMemo(() => {
    const expands = slice.expands || {};
    return (
      expands.expandAll !== false &&
      (expands.expandedMembers || []).length === 0
    );
  }, [slice.expands]);

  /**
   * Opens the drill-through dialog for a value cell with the source records
   * both the row leaf and the column node aggregate: the intersection of
   * their row-index buckets.
   */
  const openDrillThrough = useCallback(
    (rowNode: AxisLeaf, colKey: string) => {
      if (!matrix) return;
      // Measures sit on top of the columns, not in the column tree — look
      // the node up by its base key.
      const baseColKey = baseKey(colKey);
      const colNode = findNodeByKey(matrix.colRoot, baseColKey);
      const source = matrix.sourceRows || [];
      const rowIndexes = rowNode?.rowIndexes || [];
      const colIndexes = colNode?.rowIndexes || [];
      if (rowIndexes.length === 0 || colIndexes.length === 0) {
        setDrill({ rows: [], breadcrumbs: [] });
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
      const buildBreadcrumbs = (
        root: TreeNode | null | undefined,
        targetKey: string | null | undefined,
      ) => {
        if (!root || !targetKey) return [];
        const path: TreeNode[] = [];
        const walk = (node: TreeNode, trail: TreeNode[]): boolean => {
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
            field: captionFor(String(n.field)),
            value: n.caption,
          }));
      };
      const breadcrumbs = [
        ...buildBreadcrumbs(matrix.rowRoot, nodeKeyOf(rowNode)),
        ...buildBreadcrumbs(matrix.colRoot, baseColKey),
      ];
      if (rowNode?.measureKey) {
        const [uniqueName] = rowNode.measureKey.split(':');
        breadcrumbs.push({
          field: captionFor('Measures'),
          value: rowNode.measureCaption || uniqueName,
        });
      }
      setDrill({ rows, breadcrumbs });
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
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  minWidth: chevronColWidth + LABEL_COL_WIDTH,
                  width: chevronColWidth + LABEL_COL_WIDTH,
                  boxSizing: 'border-box',
                }}
              >
                <DimensionHeaderCell
                  dims={rowDimensions}
                  captionFor={captionFor}
                  activeFilters={activeFilterFields}
                  onOpen={openDimensionFilter}
                  style={headerStyle}
                  density={density}
                />
              </th>
              <th
                colSpan={Math.max(1, colLeaves.length)}
                style={{ boxSizing: 'border-box' }}
              >
                <DimensionHeaderCell
                  dims={colDimensions}
                  captionFor={captionFor}
                  activeFilters={activeFilterFields}
                  onOpen={openDimensionFilter}
                  style={{ ...headerStyle, textAlign: 'left' }}
                  density={density}
                />
              </th>
            </tr>
          )}
        <tr style={{ height: density.headerRowHeight }}>
          {!hideChevronCol && (
            <th
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 3,
                minWidth: chevronColWidth,
                width: chevronColWidth,
                boxSizing: 'border-box',
              }}
            >
              <Box
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  minHeight: density.headerCellMinHeight,
                  backgroundColor:
                    headerStyle?.backgroundColor || headerBg(theme),
                })}
              >
                {(rowDimensions.length > 0 || colDimensions.length > 0) && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleChildren(null);
                    }}
                    title={tGrid.expandCollapseAll || 'Expand/Collapse all'}
                    sx={(theme) => ({
                      p: 0,
                      width: 18,
                      height: 18,
                      '& svg': {
                        fontSize: theme.typography.button.fontSize,
                      },
                    })}
                  >
                    {gridFullyExpanded ? (
                      <UnfoldLessIcon fontSize="inherit" />
                    ) : (
                      <UnfoldMoreIcon fontSize="inherit" />
                    )}
                  </IconButton>
                )}
              </Box>
            </th>
          )}
          <th
            style={{
              position: 'sticky',
              left: chevronColWidth,
              zIndex: 3,
              minWidth: LABEL_COL_WIDTH,
              width: LABEL_COL_WIDTH,
              boxSizing: 'border-box',
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
                        ? tGrid.collapseFilters || 'Collapse filters'
                        : tGrid.expandFilters || 'Expand filters'
                    }
                    sx={(theme) => ({
                      p: 0,
                      mr: 0.25,
                      width: 18,
                      height: 18,
                      color:
                        activeFilterFields.size > 0
                          ? 'primary.main'
                          : 'inherit',
                      '& svg': { fontSize: theme.typography.button.fontSize },
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
            />
          </th>
          {colLeaves.map((col, ci) => {
            const colSticky = stickyColStyle(col, ci, true);
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
                className={colSticky ? 'pvt-sticky-col' : undefined}
                style={{
                  minWidth: CELL_MIN_WIDTH,
                  boxSizing: 'border-box',
                  ...colSticky,
                }}
              >
                <HeaderCell
                  style={{ ...headerStyle, textAlign: dataAlign }}
                  density={density}
                  sort={leafSortFor(SORT_AXES.col, col)}
                  onClick={(e) => handleSortClick(SORT_AXES.col, col, e)}
                  prefix={
                    showColChevron ? (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(nodeKeyOf(col));
                        }}
                        title={
                          col.isExpanded !== false
                            ? tGrid.collapseChildren || 'Collapse'
                            : tGrid.expandChildren || 'Expand'
                        }
                        sx={(theme) => ({
                          p: 0,
                          mr: 0.25,
                          width: 16,
                          height: 16,
                          '& svg': {
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
      tGrid,
      headerStyle,
      dataAlign,
      leafSortFor,
      handleSortClick,
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
      gridFullyExpanded,
      openDimensionFilter,
    ],
  );

  const alternateRows = !!format?.layout?.alternateRows;

  const buildDimValueMap = (root: TreeNode | null | undefined) => {
    const out = new Map<string, Record<string, unknown>>();
    if (!root) return out;
    const walk = (node: TreeNode, accum: Record<string, unknown>) => {
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

  // Takes Virtuoso's `itemContent` argument order so it can be passed as-is.
  const renderRow = useCallback(
    (index: number, rowNode: AxisLeaf) => {
      if (!rowNode || !matrix) return null;

      const hasChildren = rowNode.children && rowNode.children.length > 0;
      // Next-level toggle (UnfoldMore) only makes sense if at least one
      // direct child has its own children — otherwise expanding the level
      // below would do nothing.
      const hasGrandchildren =
        hasChildren &&
        rowNode.children.some((c) => c && c.children && c.children.length > 0);
      // Drives the level-below button icon — engine.toggleChildrenExpansion
      // decides its direction with the very same predicate.
      const childrenExpanded =
        hasChildren && rowNode.children.every((c) => c.isExpanded !== false);
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

      // With totals 'after' a group renders as two rows: the header clone on
      // top and the subtotal below its children. The controls belong to the
      // header only — duplicating them on the subtotal row would give the
      // same node two chevrons.
      const showChevron =
        hasChildren &&
        compact &&
        showNodeControls &&
        !rowNode.isTotal &&
        !rowNode.isSubtotal;

      return (
        <>
          {!hideChevronCol && (
            <td
              className={`pvt-chevron${showChevron ? '' : ' pvt-chevron-empty'}`}
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 1,
                minWidth: chevronColWidth,
                width: chevronColWidth,
                boxSizing: 'border-box',
                verticalAlign: 'middle',
                textAlign: 'center',
                cursor: showChevron ? 'pointer' : 'default',
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
              position: 'sticky',
              left: chevronColWidth,
              zIndex: 1,
              minWidth: LABEL_COL_WIDTH,
              width: LABEL_COL_WIDTH,
              boxSizing: 'border-box',
            }}
          >
            <BodyLabelCell
              indent={indent}
              isTotal={rowNode.isTotal}
              isGrandTotal={isGrandTotal}
              onToggleChildren={
                hasGrandchildren &&
                !rowNode.isTotal &&
                !rowNode.isSubtotal &&
                showNodeControls
                  ? () => handleToggleChildren(nodeKeyOf(rowNode))
                  : undefined
              }
              childrenExpanded={childrenExpanded}
              caption={
                rowNode.isTotal && !rowNode.measureKey
                  ? totalCaption
                  : rowNode.isSubtotal
                    ? subtotalCaption(rowNode)
                    : rowNode.caption
              }
              style={isGrandTotal ? grandTotalStyle : dimensionStyle}
              shade={shade}
              density={density}
              sort={leafSortFor(SORT_AXES.row, rowNode)}
              onSortClick={(e) => handleSortClick(SORT_AXES.row, rowNode, e)}
            />
          </td>
          {colLeaves.map((col, ci) => {
            const cell = matrix.cells.get(`${rowNode.key}::${col.key}`);
            const colSticky = stickyColStyle(col, ci, false);
            const measureKey = cell?.measureKey || col.measureKey || null;
            const getMeasureValue = (target: string | null | undefined) => {
              if (!target) return null;
              const byMeasure = cellsByBase.get(
                cellBaseKey(rowNode.key, col.key),
              );
              if (!byMeasure) return null;
              if (String(target).includes(':')) {
                return byMeasure.has(target) ? byMeasure.get(target)! : null;
              }
              for (const [mk, v] of byMeasure) {
                if (mk.startsWith(`${target}:`)) return v;
              }
              return null;
            };
            const dimensionValues = {
              ...(rowDimMap.get(baseKey(nodeKeyOf(rowNode))) || {}),
              ...(colDimMap.get(baseKey(col.key)) || {}),
            };
            const resolved = resolveCellStyle({
              format: formatObj,
              cell,
              measureKey,
              getMeasureValue,
              dimensionValues,
            });
            // ratioTotal and currentRatio store fractions (0..1). Default the
            // presentation to percentage unless the user set an explicit
            // per-measure `percentage` override in the Values tab — that way
            // "format as percentage" / decimal-count changes from the dialog
            // flow straight through to the grid.
            const aggFromKey = measureKey
              ? String(measureKey).split(':')[1]
              : null;
            let effectiveSection = getValuesSection(formatObj, measureKey);
            if (
              (aggFromKey === 'ratioTotal' || aggFromKey === 'currentRatio') &&
              effectiveSection
            ) {
              const uniqueName = String(measureKey).split(':')[0];
              const byMeasure = format?.valuesByMeasure || {};
              const override =
                (measureKey ? byMeasure[measureKey] : undefined) ||
                byMeasure[uniqueName];
              const userSetPercentage =
                override &&
                Object.prototype.hasOwnProperty.call(override, 'percentage');
              if (!userSetPercentage) {
                effectiveSection = { ...effectiveSection, percentage: true };
              }
            }
            const hideCurrentRatioOnTotal =
              aggFromKey === 'currentRatio' && !!col.isTotal;
            // Totals turned off ('none'): the group row/column is kept only
            // to carry its expand/collapse control, so its cells stay empty.
            const hideAsTotal = !!rowNode.totalsHidden || !!col.totalsHidden;
            const displayValue =
              hideCurrentRatioOnTotal || hideAsTotal
                ? ''
                : cell
                  ? formatNumberWithFormat(cell.value, effectiveSection) ||
                    cell.formattedValue
                  : '';
            const cellClickable = !!(
              drillThroughEnabled &&
              !hideCurrentRatioOnTotal &&
              !hideAsTotal &&
              cell &&
              cell.value !== null &&
              cell.value !== undefined
            );
            // Grand-total values take the grand-totals style but keep the
            // value alignment, so numbers line up with the rows above.
            const valueStyle = hideAsTotal
              ? undefined
              : isGrandTotal
                ? grandTotalStyle && {
                    ...grandTotalStyle,
                    textAlign: effectiveSection?.textAlign || 'right',
                  }
                : resolved;
            return (
              <td
                key={col.key}
                className={colSticky ? 'pvt-sticky-col' : undefined}
                style={{
                  minWidth: CELL_MIN_WIDTH,
                  boxSizing: 'border-box',
                  ...colSticky,
                }}
              >
                <BodyValueCell
                  isTotal={rowNode.isTotal}
                  isGrandTotal={isGrandTotal}
                  style={valueStyle}
                  shade={shade}
                  density={density}
                  clickable={cellClickable}
                  onClick={
                    cellClickable
                      ? () => openDrillThrough(rowNode, col.key)
                      : undefined
                  }
                  getHiddenMeasureItems={
                    hiddenMeasures.size > 0
                      ? () => hiddenMeasureItemsFor(rowNode, col)
                      : undefined
                  }
                  hiddenMeasuresLabel={
                    tGrid.hiddenMeasures || 'Hidden measures'
                  }
                  error={cell?.error || null}
                  errorLabel={tGrid.formulaError || 'Formula error'}
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
      cellsByBase,
      hiddenMeasures,
      hiddenMeasureItemsFor,
      compact,
      handleToggle,
      handleToggleChildren,
      handleSortClick,
      leafSortFor,
      openDrillThrough,
      subtotalCaption,
      tGrid,
      format,
      formatObj,
      dimensionStyle,
      grandTotalStyle,
      alternateRows,
      density,
      rowDimMap,
      colDimMap,
      chevronColWidth,
      hideChevronCol,
      drillThroughEnabled,
      totalCaption,
    ],
  );

  // totalsRowsSticky "after" — render the grand-total row(s) in the fixed
  // (sticky) footer.
  const renderFooterTotals = useCallback(
    () => (
      <>
        {gtRows.map((r, i) => (
          <tr key={`gt-row-${r.key}`} style={{ height: density.rowHeight }}>
            {renderRow(i, r)}
          </tr>
        ))}
      </>
    ),
    [gtRows, renderRow, density.rowHeight],
  );

  // No matrix yet: above the row threshold usePivotMatrix defers the first
  // compute so the loader can paint — show it instead of a blank panel.
  if (!matrix) {
    return loading ? (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'primary.main',
        }}
      >
        {tGrid.loading || 'Processing…'}
      </Box>
    ) : null;
  }

  if (rowLeaves.length === 0 || colLeaves.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">
          {tGrid.empty || 'No data to display'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        '& table': {
          borderCollapse: 'separate',
          borderSpacing: 0,
          minWidth: totalWidth,
          tableLayout: 'fixed',
        },
        '& thead tr': {
          backgroundColor: headerBg(theme),
        },
        '& thead th': {
          padding: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          textAlign: 'left',
          fontWeight: theme.typography.button.fontWeight,
          fontSize: theme.typography.button.fontSize,
          color: theme.palette.text.secondary,
        },
        // Sticky grand-total column header: a plain <th> is transparent (only
        // <thead tr> carries a background), so once it detaches as a sticky
        // cell the scrolling column headers bleed through it. Give it an
        // opaque background matching the header row.
        '& thead th.pvt-sticky-col': {
          backgroundColor: headerBg(theme),
        },
        // Sticky grand-total column body cells must stay opaque even on row
        // hover — `action.hover` is translucent, so otherwise the
        // horizontally-scrolled data cells bleed through them.
        '& tbody td.pvt-sticky-col, & tbody tr:hover td.pvt-sticky-col': {
          backgroundColor: theme.palette.background.paper,
        },
        // Same guard for the left-frozen row-header columns (`pvt-label` and
        // `pvt-chevron` carrying an icon): the row-hover rule below repaints
        // every cell with translucent `action.hover`, which would let the
        // horizontally-scrolled data cells bleed through these sticky cells
        // on mouseover. Mirrors `pvt-sticky-col` / `pvt-chevron-empty`.
        '& tbody tr:hover td.pvt-label, & tbody tr:hover td.pvt-chevron': {
          backgroundColor: theme.palette.background.paper,
        },
        '& tbody td': {
          padding: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          fontSize: theme.typography.body2.fontSize,
          backgroundColor: theme.palette.background.paper,
        },
        '& tbody tr:hover td': {
          backgroundColor: theme.palette.action.hover,
        },
        // Chevron col never paints its own right border — the label col owns
        // the vertical separator (see `.pvt-label` rule). Top border drawn
        // explicitly so each chevron cell shows a horizontal divider above
        // it (the default `& tbody td` rule only emits borderBottom and
        // borderRight). Empty chevron cells (no icon) hide bg/hover but
        // keep the top border so col 1 still gets the row demarcation.
        '& tbody td.pvt-chevron': {
          borderRight: 'none',
          borderBottom: 'none',
          borderTop: `1px solid ${theme.palette.divider}`,
        },
        '& tbody td.pvt-chevron-empty, & tbody tr:hover td.pvt-chevron-empty': {
          borderTop: 'none',
          // Opaque (not transparent): the chevron col is sticky, so a
          // see-through cell would let data cells bleed under it on
          // horizontal scroll.
          backgroundColor: theme.palette.background.paper,
          pointerEvents: 'none',
        },
        '& tbody td.pvt-label': {
          borderLeft: `1px solid ${theme.palette.divider}`,
        },
        // The fixed-footer grand-total row ("after") lives in <tfoot>, which
        // the `& tbody td` rules never reach — give it the same padding,
        // borders and opaque background so it matches the body and stays
        // opaque while rows scroll underneath.
        '& tfoot td': {
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
            position: 'absolute',
            top: 0,
            right: 0,
            px: 1.5,
            py: 0.5,
            fontSize: theme.typography.caption.fontSize,
            color: 'primary.main',
            zIndex: 4,
          })}
        >
          {tGrid.loading || 'Processing…'}
        </Box>
      )}
      <TableVirtuoso
        key={colLeaves.map((c) => c.key).join('|')}
        style={{ height: '100%' }}
        scrollerRef={handleScrollerRef}
        data={dataRows}
        topItemCount={topItemCount}
        fixedHeaderContent={renderHeader}
        fixedFooterContent={
          gtSlot === 'footer' ? renderFooterTotals : undefined
        }
        itemContent={renderRow}
      />
      <DimensionFilterDialog
        open={!!dimensionFilter}
        uniqueName={dimensionFilter?.uniqueName}
        caption={dimensionFilter?.caption}
        onClose={() => setDimensionFilter(null)}
      />
      <DrillThroughDialog
        open={!!drill}
        rows={drill?.rows}
        breadcrumbs={drill?.breadcrumbs}
        onClose={() => setDrill(null)}
      />
      <SortMeasureMenu
        picker={sortPicker}
        sort={sort}
        onDirectionChange={(direction) =>
          setSortPicker((p) => (p ? { ...p, direction } : p))
        }
        onClose={() => setSortPicker(null)}
      />
    </Box>
  );
};

interface SortMeasureMenuProps {
  picker: SortPickerState | null;
  sort: InternalSort | null;
  onDirectionChange: (direction: SortToggleDirection) => void;
  onClose: () => void;
}

/** Lets the user pick the measure, and direction, a sort is keyed on. */
const SortMeasureMenu = function SortMeasureMenu({
  picker,
  sort,
  onDirectionChange,
  onClose,
}: SortMeasureMenuProps) {
  const { engine, localization } = usePivot();
  const portalContainer = usePortalContainer();
  const tGrid = section(localization, 'grid');
  // When the picked leaf is the sorted one, its measure is marked and the
  // sort can be removed.
  const sortedHere =
    !!picker && !!sort && sort[picker.axis.keyField] === picker.key;
  const activeMeasure =
    picker && sortedHere
      ? (sort?.[picker.axis.measureField] as Partial<MeasureRef> | null)
      : null;
  return (
    <Menu
      open={!!picker}
      anchorEl={picker?.anchorEl || null}
      onClose={onClose}
      container={portalContainer}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          sx={(theme) => ({
            fontWeight: theme.typography.button.fontWeight,
            flex: 1,
          })}
        >
          {tGrid.sortByMeasure || 'Sort by measure'}
        </Typography>
        <SortDirectionToggle
          dense
          value={picker?.direction || 'desc'}
          onChange={onDirectionChange}
          AscIcon={picker?.axis.AscIcon}
          DescIcon={picker?.axis.DescIcon}
        />
      </Box>
      {picker &&
        picker.measures.map((m) => {
          const isActive =
            activeMeasure?.uniqueName === m.uniqueName &&
            activeMeasure?.aggregation === m.aggregation;
          return (
            <MenuItem
              key={`${m.uniqueName}:${m.aggregation}`}
              selected={isActive}
              onClick={() => {
                picker.axis.apply(engine, picker.key, picker.direction, {
                  uniqueName: m.uniqueName,
                  aggregation: m.aggregation,
                });
                onClose();
              }}
              sx={(theme) => ({
                fontSize: theme.typography.fontSize,
                fontWeight: isActive ? 700 : 200,
              })}
            >
              {m.caption || m.uniqueName}
            </MenuItem>
          );
        })}
      {picker && sortedHere && (
        <MenuItem
          onClick={() => {
            picker.axis.apply(engine, null, null, null);
            onClose();
          }}
          sx={(theme) => ({
            fontSize: theme.typography.fontSize,
            color: 'error.main',
            borderTop: 1,
            borderColor: 'divider',
          })}
        >
          {tGrid.removeSort || 'Remove sort'}
        </MenuItem>
      )}
    </Menu>
  );
};

interface DimensionHeaderCellProps {
  dims?: InternalSlice['rows'];
  captionFor: (uniqueName: string) => string;
  activeFilters: Set<string>;
  onOpen: (uniqueName: string) => void;
  style?: Partial<CellStyle> | null;
  density: DensityConfig;
}

const DimensionHeaderCell = function DimensionHeaderCell({
  dims,
  captionFor,
  activeFilters,
  onOpen,
  style,
  density: d,
}: DimensionHeaderCellProps) {
  const justify = justifyFor(style?.textAlign || 'left');
  if (!dims || dims.length === 0) {
    // An axis without dimensions still paints its share of the header row.
    return (
      <Box
        sx={(theme) => ({
          px: d.headerPaddingX,
          py: d.headerPaddingY,
          minHeight: d.headerCellMinHeight,
          opacity: 0.7,
          backgroundColor: style?.backgroundColor || headerBg(theme),
        })}
      />
    );
  }
  return (
    <Box
      sx={(theme) => ({
        px: '6px',
        py: '3px',
        minHeight: d.headerCellMinHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        gap: 0.5,
        flexWrap: 'wrap',
        backgroundColor: style?.backgroundColor || headerBg(theme),
      })}
    >
      {dims.map((dim) => {
        const active = activeFilters.has(dim.uniqueName);
        return (
          <Box
            key={dim.uniqueName}
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              px: '6px',
              py: '1px',
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
              fontFamily: style?.fontFamily || 'inherit',
              fontWeight: style?.fontWeight || 600,
              fontSize: scaleFontSize(
                style?.fontSize,
                d.headerFontSizeRate,
                theme.typography.body2.fontSize,
              ),
              fontStyle: style?.fontStyle || 'normal',
              whiteSpace: 'nowrap',
            })}
          >
            {active && (
              <FilterAltIcon
                sx={(theme) => ({
                  fontSize: theme.typography.button.fontSize,
                  color: 'primary.main',
                  mr: '2px',
                })}
              />
            )}
            <span>{captionFor(dim.uniqueName)}</span>
            <IconButton
              size="small"
              onClick={() => onOpen(dim.uniqueName)}
              sx={(theme) => ({
                p: 0,
                ml: '2px',
                width: 16,
                height: 16,
                '& svg': { fontSize: theme.typography.button.fontSize },
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

interface HeaderCellProps {
  children?: React.ReactNode;
  primary?: boolean;
  style?: Partial<CellStyle> | null;
  density: DensityConfig;
  /** Set on sortable headers: clicks call `onClick` and an arrow shows. */
  sort?: LeafSort;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  action?: React.ReactNode;
  prefix?: React.ReactNode;
}

const HeaderCell = function HeaderCell({
  children,
  primary,
  style,
  density: d,
  sort,
  onClick,
  action,
  prefix,
}: HeaderCellProps) {
  const sortable = !!sort;
  const align = style?.textAlign || 'left';
  return (
    <Box
      onClick={sortable ? onClick : undefined}
      sx={(theme) => ({
        px: d.headerPaddingX,
        py: d.headerPaddingY,
        minHeight: d.headerCellMinHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justifyFor(align),
        gap: 0.25,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        backgroundColor: style?.backgroundColor || headerBg(theme),
        fontFamily: style?.fontFamily || 'inherit',
        fontWeight: style?.fontWeight || 600,
        fontStyle: style?.fontStyle || 'normal',
        color:
          style?.color ||
          (primary ? theme.palette.primary.main : theme.palette.text.secondary),
        fontSize: scaleFontSize(
          style?.fontSize,
          d.headerFontSizeRate,
          theme.typography.body2.fontSize,
        ),
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background-color 120ms ease',
        '&:hover': sortable
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
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: align,
        }}
      >
        {children}
      </Box>
      {sort && <SortIndicator {...sort} variant="subtitle2" />}
      {action && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

interface SortIndicatorProps extends LeafSort {
  /** Typography variant whose font size the arrow takes. */
  variant: 'subtitle2' | 'body2';
}

/** Active-sort arrow with a tooltip naming the criteria, or a faded hint. */
const SortIndicator = function SortIndicator({
  axis,
  direction,
  tooltip,
  variant,
}: SortIndicatorProps) {
  const portalContainer = usePortalContainer();
  const iconSx = (theme: Theme) => ({
    fontSize: theme.typography[variant].fontSize,
    flexShrink: 0,
  });
  if (!direction) {
    const { IdleIcon } = axis;
    return <IdleIcon sx={(theme) => ({ ...iconSx(theme), opacity: 0.2 })} />;
  }
  const Icon =
    direction === 'asc'
      ? axis.AscIcon
      : direction === 'desc'
        ? axis.DescIcon
        : null;
  if (!Icon) return null;
  return (
    <Tooltip
      title={tooltip}
      disableInteractive
      arrow
      slotProps={{ popper: { container: portalContainer } }}
    >
      <Icon sx={(theme) => ({ ...iconSx(theme), color: 'primary.main' })} />
    </Tooltip>
  );
};

const SHADE_AMOUNT = [0, 0.04, 0.08, 0.12];

// darken/lighten throw on colors they cannot parse (CSS variables, named
// colors); those are left untouched.
const safeTint = (
  tint: typeof darken,
  color: string,
  amount: number,
): string => {
  try {
    return tint(color, amount);
  } catch {
    return color;
  }
};

const safeDarken = (color: string, amount: number): string =>
  safeTint(darken, color, amount);

const tintForMode = (color: string, amount: number, mode: string) =>
  !color || !amount
    ? color
    : safeTint(mode === 'dark' ? lighten : darken, color, amount);

const GRAND_TOTAL_TINT = 0.18;

/** Striped-row and grand-total background tints for the current theme. */
const rowTints = (
  theme: Theme,
  shade: number | undefined,
): { stripedBg: string; grandTotalBg: string } => {
  const basePaper = theme.palette.background.paper;
  return {
    stripedBg: tintForMode(
      basePaper,
      SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))],
      theme.palette.mode,
    ),
    grandTotalBg: tintForMode(basePaper, GRAND_TOTAL_TINT, theme.palette.mode),
  };
};

interface ChevronCellProps {
  show?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  isGrandTotal?: boolean;
  isTotal?: boolean;
  shade?: number;
  density: DensityConfig;
  indent?: number;
}

const ChevronCell = function ChevronCell({
  show,
  expanded,
  onToggle,
  isGrandTotal,
  isTotal,
  shade,
  density: d,
  indent,
}: ChevronCellProps) {
  return (
    <Box
      sx={(theme) => {
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: `${(indent || 0) + 7}px`,
          width: '100%',
          height: '100%',
          minHeight: d.rowHeight,
          backgroundColor: show
            ? isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : stripedBg
            : 'transparent',
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
            '& svg': { fontSize: theme.typography.body2.fontSize },
            backgroundColor: headerBg(theme),
          })}
        >
          {expanded ? (
            <ExpandMoreIcon fontSize="inherit" />
          ) : (
            <ChevronRightIcon fontSize="inherit" />
          )}
        </IconButton>
      )}
    </Box>
  );
};

interface BodyLabelCellProps {
  indent: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  caption?: React.ReactNode;
  onToggleChildren?: () => void;
  childrenExpanded?: boolean;
  style?: Partial<CellStyle> | null;
  shade?: number;
  density: DensityConfig;
  sort: LeafSort;
  onSortClick: (e: React.MouseEvent<HTMLElement>) => void;
}

const BodyLabelCell = function BodyLabelCell({
  indent,
  isTotal,
  isGrandTotal,
  caption,
  onToggleChildren,
  childrenExpanded,
  style,
  shade,
  density: d,
  sort,
  onSortClick,
}: BodyLabelCellProps) {
  const { localization } = usePivot();
  const tGrid = section(localization, 'grid');
  return (
    <Box
      onClick={onSortClick}
      sx={(theme) => {
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          paddingLeft: `${indent + 4}px`,
          paddingRight: '8px',
          paddingTop: d.rowPaddingY,
          paddingBottom: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || 'inherit',
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || 'normal',
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
          textAlign: style?.textAlign || 'left',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 120ms ease',
          '&:hover': { backgroundColor: theme.palette.action.hover },
          // User-configured format values (textAlign, fontWeight) are plain
          // strings - cast at the dynamic-style boundary.
        } as SystemStyleObject<Theme>;
      }}
    >
      <Box
        component="span"
        sx={{
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {caption}
      </Box>
      <SortIndicator {...sort} variant="body2" />
      {onToggleChildren && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleChildren();
          }}
          title={
            tGrid.expandCollapseChildren || 'Expand / Collapse level below'
          }
          sx={(theme) => ({
            p: 0,
            ml: 0.5,
            flexShrink: 0,
            width: 16,
            height: 16,
            opacity: 0.55,
            '&:hover': { opacity: 1 },
            '& svg': { fontSize: theme.typography.body2.fontSize },
          })}
        >
          {childrenExpanded ? (
            <UnfoldLessIcon fontSize="inherit" />
          ) : (
            <UnfoldMoreIcon fontSize="inherit" />
          )}
        </IconButton>
      )}
    </Box>
  );
};

/** Slots that restyle a Tooltip as a bordered paper card. */
const cardTooltipSlotProps = (
  container: HTMLElement | null | undefined,
  borderColor: string,
  maxWidth: number,
) => ({
  popper: { container },
  tooltip: {
    sx: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      border: 1,
      borderColor,
      boxShadow: 3,
      p: 1,
      maxWidth,
    },
  },
  arrow: { sx: { color: 'background.paper' } },
});

const TooltipHeading = function TooltipHeading({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        fontWeight: theme.typography.h2.fontWeight,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color,
        mb: 0.5,
      })}
    >
      {children}
    </Typography>
  );
};

interface HiddenMeasuresListProps {
  label?: string;
  getItems: () => HiddenMeasureItem[];
}

// Rendered only while its tooltip is open, so the hidden measures are
// formatted on hover rather than for every visible cell on every render.
const HiddenMeasuresList = function HiddenMeasuresList({
  label,
  getItems,
}: HiddenMeasuresListProps) {
  return (
    <Box sx={{ minWidth: 200 }}>
      <TooltipHeading color="primary.main">{label}</TooltipHeading>
      <Box
        component="dl"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          m: 0,
          '& dt,& dd': { m: 0 },
        }}
      >
        {getItems().map((it, i) => (
          <Box
            key={`${it.uniqueName}:${it.aggregation}`}
            sx={(theme) => ({
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 1.5,
              py: 0.25,
              borderTop:
                i === 0 ? 'none' : `1px dashed ${theme.palette.divider}`,
            })}
          >
            <Typography
              component="dt"
              variant="caption"
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
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
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: theme.typography.h2.fontWeight,
                color: 'text.primary',
              })}
            >
              {it.formatted}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

interface BodyValueCellProps {
  children?: React.ReactNode;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  style?: Partial<CellStyle> | null;
  shade?: number;
  density: DensityConfig;
  clickable?: boolean;
  onClick?: () => void;
  /** Set when the slice hides measures; called only once the tooltip opens. */
  getHiddenMeasureItems?: () => HiddenMeasureItem[];
  hiddenMeasuresLabel?: string;
  error?: string | null;
  errorLabel?: string;
}

const BodyValueCell = function BodyValueCell({
  children,
  isTotal,
  isGrandTotal,
  style,
  shade,
  density: d,
  clickable,
  onClick,
  getHiddenMeasureItems,
  hiddenMeasuresLabel,
  error,
  errorLabel,
}: BodyValueCellProps) {
  const portalContainer = usePortalContainer();
  const ruleBg = style?.backgroundColor;
  const ruleColor = style?.color;
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
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          px: d.bodyPaddingX,
          py: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || 'inherit',
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || 'normal',
          textAlign: style?.textAlign || 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: style?.fontWeight ?? (isTotal ? 700 : 400),
          cursor: clickable ? 'pointer' : 'default',
          backgroundColor:
            effectiveBg ||
            (isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : shadeAmt > 0
                  ? stripedBg
                  : 'transparent'),
          color: effectiveColor || theme.palette.text.primary,
          transition: 'background-color 80ms ease',
          '&:hover': clickable
            ? {
                backgroundColor: effectiveBg
                  ? safeDarken(effectiveBg, 0.1)
                  : theme.palette.action.focus,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }
            : undefined,
          // Same dynamic-style boundary cast as BodyLabelCell.
        } as SystemStyleObject<Theme>;
      }}
    >
      {error ? (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            width: '100%',
            justifyContent: justifyFor(style?.textAlign || 'right'),
          }}
        >
          <span>{children}</span>
          <ErrorOutlineIcon
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: 'error.main',
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
        slotProps={cardTooltipSlotProps(portalContainer, 'error.main', 360)}
        title={
          <Box>
            <TooltipHeading color="error.main">{errorLabel}</TooltipHeading>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
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
  if (!getHiddenMeasureItems) return cellBox;
  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={250}
      leaveDelay={50}
      slotProps={cardTooltipSlotProps(portalContainer, 'divider', 320)}
      title={
        <HiddenMeasuresList
          label={hiddenMeasuresLabel}
          getItems={getHiddenMeasureItems}
        />
      }
    >
      {cellBox}
    </Tooltip>
  );
};

export default PivotTable;
