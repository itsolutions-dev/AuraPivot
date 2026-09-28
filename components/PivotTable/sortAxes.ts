/**
 * Sort axes of the pivot grid, and the sort-arrow and sort-by-measure picker
 * state built on them.
 */
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { EnrichedMeasure } from '../../pivot-core/matrix/MatrixComputer';
import type PivotEngine from '../../pivot-core/PivotEngine';
import type { SortMeasureRef } from '../../pivot-core/PivotEngine';
import type { SortToggleDirection } from '../shared/SortDirectionToggle';

/**
 * One sortable axis. A column-header click sorts the rows by that column
 * (engine.setSort); a row-label click sorts the columns by that row
 * (engine.setSortByRow). Each keeps its state in `slice.sort` under its own
 * field names.
 */
export interface SortAxis {
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
    measure: SortMeasureRef | null,
  ) => void;
  AscIcon: typeof ArrowUpwardIcon;
  DescIcon: typeof ArrowUpwardIcon;
  /** Faded hint on unsorted leaves, pointing along the axis it reorders. */
  IdleIcon: typeof ArrowUpwardIcon;
}

export const SORT_AXES: Record<'col' | 'row', SortAxis> = {
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
export interface LeafSort {
  axis: SortAxis;
  direction: string | null;
  tooltip: string;
}

/** State of the sort-by-measure picker menu. */
export interface SortPickerState {
  axis: SortAxis;
  anchorEl: HTMLElement;
  key: string;
  measures: EnrichedMeasure[];
  direction: SortToggleDirection;
}
