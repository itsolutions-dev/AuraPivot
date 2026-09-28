import React, { useMemo, useCallback, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { TableVirtuoso } from 'react-virtuoso';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { isFilterActive } from '../../pivot-core/slice/FilterEngine';
import { usePivot } from '../../context/PivotContext';
import usePivotMatrix from '../../hooks/usePivotMatrix';
import useEngineVersion from '../../hooks/useEngineVersion';
import {
  resolveCellStyle,
  formatNumberWithFormat,
  getValuesSection,
} from '../../pivot-core/format/CellFormatter';
import type { FormatObject } from '../../pivot-core/format/CellFormatter';
import type { AxisLeaf } from '../../pivot-core/matrix/MatrixComputer';
import type { TreeNode } from '../../pivot-core/types';
import type {
  InternalSlice,
  SortMeasureRef,
} from '../../pivot-core/PivotEngine';
import DimensionFilterDialog from '../DimensionFilterDialog/DimensionFilterDialog';
import DrillThroughDialog from '../DrillThroughDialog/DrillThroughDialog';
import { measureCaption, section } from '../shared/l10n';
import { SORT_AXES } from './sortAxes';
import type { LeafSort, SortAxis, SortPickerState } from './sortAxes';
import {
  CELL_MIN_WIDTH,
  CHEVRON_COL_WIDTH,
  INDENT_PX,
  LABEL_COL_WIDTH,
  baseKey,
  cellBaseKey,
  headerBg,
  nodeKeyOf,
  resolveDensity,
} from './layout';
import { SortMeasureMenu } from './SortMeasureMenu';
import { DimensionHeaderCell, HeaderCell } from './HeaderCells';
import { BodyLabelCell, BodyValueCell, ChevronCell } from './BodyCells';
import type { HiddenMeasureItem } from './BodyCells';
import { useStickyGrandTotalColumns } from './useStickyGrandTotalColumns';
import { buildDrillThrough } from './drillThrough';
import type { DrillThroughData } from './drillThrough';
import { measureKeyOf } from '../../pivot-core/matrix/MatrixComputer';

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
        s.add(measureKeyOf(m));
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
        m.aggregation !== 'formula' && !hiddenMeasures.has(measureKeyOf(m)),
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

  const { handleScrollerRef, stickyColStyle } = useStickyGrandTotalColumns({
    colLeaves,
    stickyColTotals,
    colsTotalsPosition,
    stickyRowTotals,
    chevronColWidth,
  });

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
  // The options prop and the Format dialog toggle both write
  // format.layout.enableDrillThrough; `engine.setOptions` / `setReport` can
  // still switch it off through the engine options.
  const drillThroughEnabled =
    format?.layout?.enableDrillThrough !== false &&
    options?.enableDrillThrough !== false;

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
      const ref = sort[axis.measureField] as SortMeasureRef | null;
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
      const measure = current?.[axis.measureField] as SortMeasureRef | null;
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

  const [drill, setDrill] = useState<DrillThroughData | null>(null);

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
          const measureKey = measureKeyOf(m);
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
      setDrill(buildDrillThrough(matrix, rowNode, colKey, captionFor));
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
            // Resolved once per cell; conditional rules call the getter once
            // per operand.
            const byMeasure = cellsByBase.get(
              cellBaseKey(rowNode.key, col.key),
            );
            const getMeasureValue = (target: string | null | undefined) => {
              if (!target || !byMeasure) return null;
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

export default PivotTable;
