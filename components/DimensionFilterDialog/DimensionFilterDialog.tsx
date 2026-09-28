import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from '@mui/material';
import {
  applyFilters,
  distinctValuesFor,
  isFilterActive,
} from '../../pivot-core/slice/FilterEngine';
import type { FilterEntry } from '../../pivot-core/slice/FilterEngine';
import type { DataRow } from '../../pivot-core/types';
import { usePivot } from '../../context/PivotContext';
import type {
  InternalSlice,
  InternalSliceField,
} from '../../pivot-core/PivotEngine';
import useEngineVersion from '../../hooks/useEngineVersion';
import { measureCaption, section } from '../shared/l10n';
import { withOpenSession } from '../shared/useOpenSession';
import DialogHeader from '../shared/DialogHeader';
import MemberChecklist from '../shared/MemberChecklist';
import SortDirectionToggle, {
  type SortToggleDirection,
} from '../shared/SortDirectionToggle';
import { measureKeyOf } from '../../pivot-core/matrix/MatrixComputer';

/**
 * Quick-filter dialog reachable from the gear icon rendered beside every
 * row/column grouping dimension in the pivot header.
 *
 * It lists the distinct values of the dimension with a checkbox each.
 * Unchecking one or more values persists a whitelist filter on the slice via
 * `engine.setSlice(...)`, so the same predicate participates in the regular
 * filter pipeline (`FilterEngine.applyFilters`) and is surfaced as a chip in
 * the FilterBar. An all-checked state removes the filter entirely.
 */

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

export interface DimensionFilterDialogProps {
  open: boolean;
  uniqueName?: string;
  caption?: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SortPick {
  /** 'alpha' or `${measureUniqueName}:${aggregation}`. */
  by: string;
  direction: SortToggleDirection;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const findFieldAxis = (
  slice: InternalSlice,
  uniqueName: string | undefined,
): 'rows' | 'columns' | null => {
  if ((slice.rows || []).some((f) => f.uniqueName === uniqueName))
    return 'rows';
  if ((slice.columns || []).some((f) => f.uniqueName === uniqueName))
    return 'columns';
  return null;
};

/** The sort currently stored on the dimension's slice field. */
const readSortPick = (
  slice: InternalSlice,
  uniqueName: string | undefined,
): SortPick => {
  const axis = findFieldAxis(slice, uniqueName);
  const field = axis
    ? (slice[axis] || []).find((f) => f.uniqueName === uniqueName)
    : null;
  const fs = field?.fieldSort as
    | {
        mode?: string;
        direction?: string;
        measure?: { uniqueName: string; aggregation?: string };
      }
    | undefined;
  if (fs && fs.mode === 'measure' && fs.measure?.uniqueName) {
    return {
      by: `${fs.measure.uniqueName}:${fs.measure.aggregation || 'sum'}`,
      direction: fs.direction === 'desc' ? 'desc' : 'asc',
    };
  }
  return {
    by: 'alpha',
    direction: ((fs && fs.direction) ||
      field?.sort ||
      'asc') as SortToggleDirection,
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** The predicates of a filter entry that pick members: what this edits. */
const memberPredicates = ({ members, exclude, value }: FilterEntry) => ({
  members,
  exclude,
  value,
});

const withoutMemberPredicates = (
  entry: FilterEntry | undefined,
): Partial<FilterEntry> => {
  if (!entry) return {};
  const {
    members: _members,
    exclude: _exclude,
    value: _value,
    ...rest
  } = entry;
  return rest;
};

const DimensionFilterDialog = function DimensionFilterDialog({
  open,
  uniqueName,
  caption,
  onClose,
}: DimensionFilterDialogProps): React.ReactElement {
  const { engine, localization: t, locale } = usePivot();

  const tDim = section(t, 'dimensionFilter');
  const tButtons = section(t, 'buttons');

  // `engine` is a stable object that mutates in place — the version counter
  // is the dependency that actually moves (see useEngineVersion).
  const engineVersion = useEngineVersion(engine);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slice = useMemo(() => engine.getSlice(), [engine, engineVersion]);

  const sliceMeasures = useMemo(
    () =>
      open
        ? (slice.measures || [])
            .filter(
              (m) =>
                m.aggregation !== 'formula' && m.aggregation !== 'currentRatio',
            )
            .map((m) => ({
              key: measureKeyOf(m),
              caption: measureCaption(engine, m, t),
            }))
        : [],
    [engine, slice, open, t],
  );

  const distinct = useMemo(
    () =>
      open && uniqueName ? distinctValuesFor(engine, uniqueName, locale) : [],
    // engineVersion is a manual version counter: the engine mutates in place,
    // so this is how the memo learns the underlying rows changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engineVersion, uniqueName, open, locale],
  );

  // Drafts seed from the slice on mount; the wrapper at the bottom remounts
  // this body on every open.
  // Checked = the members the field's member predicates let through, so an
  // exclude or single-value filter set elsewhere opens as it filters.
  const [seed] = useState<Set<string>>(() => {
    const existing = (slice.filters || []).find(
      (f) => f.uniqueName === uniqueName,
    );
    const passing = existing
      ? applyFilters(
          distinct.map((v) => ({ [uniqueName!]: v }) as DataRow),
          [{ uniqueName: uniqueName!, ...memberPredicates(existing) }],
        ).map((row) => row[uniqueName!])
      : distinct;
    return new Set(passing.map(String));
  });
  const [checked, setChecked] = useState<Set<string>>(seed);
  const [sortPick, setSortPick] = useState<SortPick>(() =>
    readSortPick(slice, uniqueName),
  );

  // Column sort (engine.setSort) is reordered after the dimension fieldSort
  // by MatrixComputer, so an active column sort silently overrides whatever
  // the user picks here; so does the row-driven sort (engine.setSortByRow)
  // for a dimension on the columns axis. Surface that as a banner so the
  // choice doesn't appear ignored.
  const axis = findFieldAxis(slice, uniqueName);
  const hasColumnSort = !!slice.sort?.colKey && axis === 'rows';
  const hasRowSort = !!slice.sort?.rowKey && axis === 'columns';

  const buildFieldSort = (): Record<string, unknown> => {
    if (sortPick.by === 'alpha') {
      return { mode: 'alpha', direction: sortPick.direction };
    }
    const [mName, mAgg] = sortPick.by.split(':');
    return {
      mode: 'measure',
      measure: { uniqueName: mName, aggregation: mAgg || 'sum' },
      direction: sortPick.direction,
    };
  };

  const applyFieldSortToAxis = (
    axisArr: InternalSliceField[] | undefined,
  ): InternalSliceField[] =>
    (axisArr || []).map((f) =>
      f.uniqueName === uniqueName
        ? {
            ...f,
            fieldSort: buildFieldSort(),
            // TreeBuilder still reads `field.sort` for the alphabetical
            // pre-order while fieldSort is in measure mode, and the measure
            // sort is stable: tied values keep the last alpha direction.
            ...(sortPick.by === 'alpha' ? { sort: sortPick.direction } : {}),
          }
        : f,
    );

  const handleApply = () => {
    const current = engine.getSlice();
    const filters = (current.filters || []).filter(
      (f) => f.uniqueName !== uniqueName,
    );
    const previous = (current.filters || []).find(
      (f) => f.uniqueName === uniqueName,
    );
    const unchanged =
      checked.size === seed.size && [...seed].every((v) => checked.has(v));
    const allSelected =
      distinct.length > 0 && distinct.every((v) => checked.has(String(v)));
    // This dialog edits which members pass; any range / search predicate
    // on the field stays. An untouched selection keeps its predicate as it
    // was (an exclude list stays an exclude list).
    const next: FilterEntry =
      unchanged && previous
        ? previous
        : {
            ...withoutMemberPredicates(previous),
            uniqueName: uniqueName!,
            ...(allSelected ? {} : { members: Array.from(checked) }),
          };
    if (isFilterActive(next)) filters.push(next);

    engine.setSlice({
      ...current,
      rows: applyFieldSortToAxis(current.rows),
      columns: applyFieldSortToAxis(current.columns),
      filters,
    });
    onClose();
  };

  const handleClear = () => {
    const current = engine.getSlice();
    const filters = (current.filters || []).filter(
      (f) => f.uniqueName !== uniqueName,
    );
    engine.setSlice({ ...current, filters });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogHeader
        title={caption || uniqueName}
        subtitle={tDim.subtitle || 'Select the values to include in the pivot.'}
        onClose={onClose}
      />
      <DialogContent dividers>
        {hasColumnSort && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {tDim.columnSortNotice ||
              'A column sort is active and takes precedence over this sort.'}
          </Alert>
        )}
        {hasRowSort && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {tDim.rowSortNotice ||
              'A row sort is active and takes precedence over this sort.'}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>{tDim.sortBy || 'Sort by'}</InputLabel>
            <Select
              label={tDim.sortBy || 'Sort by'}
              value={sortPick.by}
              onChange={(e) =>
                setSortPick((p) => ({ ...p, by: String(e.target.value) }))
              }
            >
              <MenuItem value="alpha">{caption || uniqueName}</MenuItem>
              {sliceMeasures.map((m) => (
                <MenuItem key={m.key} value={m.key}>
                  {m.caption}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <SortDirectionToggle
            value={sortPick.direction}
            onChange={(direction) => setSortPick((p) => ({ ...p, direction }))}
          />
        </Stack>
        <MemberChecklist
          values={distinct}
          selected={checked}
          onChange={setChecked}
          labels={tDim}
          maxHeight={340}
        />
      </DialogContent>
      <DialogActions style={{ padding: '16px' }}>
        <Button onClick={handleClear}>
          {tButtons.removeFilter || 'Remove filter'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{tButtons.cancel || 'Cancel'}</Button>
        <Button onClick={handleApply} variant="contained">
          {tButtons.apply || 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default withOpenSession(DimensionFilterDialog);
