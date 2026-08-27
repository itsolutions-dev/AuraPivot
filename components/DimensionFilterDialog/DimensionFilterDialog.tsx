import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { usePivot } from '../../context/PivotContext';
import type { InternalSliceField } from '../../pivot-core/PivotEngine';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import useEngineVersion from '../../hooks/useEngineVersion';

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

interface SliceMeasureEntry {
  uniqueName: string;
  aggregation: string;
  caption: string;
}

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const distinctValuesFor = (
  engine: { getRows: () => Record<string, unknown>[] },
  uniqueName: string,
  locale: string | undefined,
): unknown[] => {
  const seen = new Map<string, unknown>();
  engine.getRows().forEach((row) => {
    const v = row?.[uniqueName];
    if (v === null || v === undefined || v === '') return;
    const key = String(v);
    if (!seen.has(key)) seen.set(key, v);
  });
  return Array.from(seen.values()).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), locale || undefined, {
      numeric: true,
    });
  });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DimensionFilterDialog = function DimensionFilterDialog({
  open,
  uniqueName,
  caption,
  onClose,
}: DimensionFilterDialogProps): React.ReactElement {
  const { engine, localization: t, locale } = usePivot();
  const portalContainer = usePortalContainer();
  const [search, setSearch] = useState<string>('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  // `sortBy` is either 'alpha' or `${measureUniqueName}:${aggregation}`.
  const [sortBy, setSortBy] = useState<string>('alpha');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // Column sort (engine.setSort) is reordered after the dimension fieldSort
  // by MatrixComputer, so an active column sort silently overrides whatever
  // the user picks here. Surface that as a banner so the choice doesn't
  // appear ignored.
  const [hasColumnSort, setHasColumnSort] = useState<boolean>(false);
  // Same caveat for the row-driven sort (engine.setSortByRow): when the
  // dimension is on the columns axis, an active row sort overrides this
  // dialog's pick.
  const [hasRowSort, setHasRowSort] = useState<boolean>(false);

  // dynamic boundary: localization is Record<string,unknown>
  const tDim = (t as Record<string, Record<string, string>>)?.dimensionFilter ?? {};
  const tGrid = (t as Record<string, Record<string, string>>)?.grid ?? {};
  const tButtons = (t as Record<string, Record<string, string>>)?.buttons ?? {};

  // Resolve the underlying field caption for each measure (e.g. "Revenue"
  // rather than "Sum Total of Revenue"). Calculated fields carry their
  // own caption; regular measures fall back to the dataset metadata.
  const aggLabel = (a: string): string => {
    const wdrKey = ({ distinctcount: 'distinctCount', avg: 'average' } as Record<string, string>)[a] || a;
    const tagg = (t as Record<string, Record<string, unknown>>)?.aggregations ?? {};
    const raw = tagg[a] ?? tagg[wdrKey];
    if (raw && typeof raw === 'object') return (raw as Record<string, string>).caption || a;
    return (raw as string) || a;
  };

  // `engine` is a stable object that mutates in place — the version counter
  // is the dependency that actually moves (see useEngineVersion).
  const engineVersion = useEngineVersion(engine);

  const sliceMeasures = useMemo<SliceMeasureEntry[]>(() => {
    if (!open) return [];
    const slice = engine.getSlice();
    const metadata = engine.getMetadata();
    const calcByName = new Map<string, { caption?: string }>(
      engine.getCalculatedFields().map((f) => [f.uniqueName, f])
    );
    return ((slice.measures as { uniqueName: string; aggregation: string }[]) || [])
      .filter(
        (m) => m.aggregation !== 'formula' && m.aggregation !== 'currentRatio'
      )
      .map((m) => {
        const base =
          calcByName.get(m.uniqueName)?.caption ||
          metadata?.[m.uniqueName]?.caption ||
          m.uniqueName;
        return {
          ...m,
          caption: `${base} (${aggLabel(m.aggregation)})`,
        };
      });
  }, [engine, engineVersion, open, t]);  // eslint-disable-line react-hooks/exhaustive-deps

  const findFieldAxis = (): 'rows' | 'columns' | null => {
    const slice = engine.getSlice();
    if ((slice.rows || []).some((f) => f.uniqueName === uniqueName))
      return 'rows';
    if ((slice.columns || []).some((f) => f.uniqueName === uniqueName))
      return 'columns';
    return null;
  };

  const distinct = useMemo(
    () =>
      open && uniqueName ? distinctValuesFor(engine, uniqueName, locale) : [],
    [engine, engineVersion, uniqueName, open, locale]
  );

  useEffect(() => {
    if (!open || !uniqueName) return;
    const slice = engine.getSlice();
    const existing = (slice.filters || []).find(
      (f) => f.uniqueName === uniqueName
    );
    // No filter OR an "allow everything" filter → check all values.
    if (!existing || !Array.isArray(existing.members)) {
      setChecked(new Set(distinct.map(String)));
    } else {
      setChecked(new Set(existing.members.map(String)));
    }
    setSearch('');

    // Preload current sort state from the slice field (rows or columns).
    const axis = findFieldAxis();
    const field = axis
      ? (slice[axis] || []).find((f) => f.uniqueName === uniqueName)
      : null;
    const fs = field?.fieldSort as { mode?: string; direction?: string; measure?: { uniqueName: string; aggregation?: string } } | undefined;
    if (fs && fs.mode === 'measure' && fs.measure?.uniqueName) {
      setSortBy(`${fs.measure.uniqueName}:${fs.measure.aggregation || 'sum'}`);
      setSortDirection(fs.direction === 'desc' ? 'desc' : 'asc');
    } else {
      setSortBy('alpha');
      setSortDirection(((fs && fs.direction) || field?.sort || 'asc') as SortDirection);
    }
    setHasColumnSort(!!(slice?.sort?.colKey) && axis === 'rows');
    setHasRowSort(!!(slice?.sort?.rowKey) && axis === 'columns');
  }, [open, uniqueName, engine, distinct]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDistinct = useMemo(() => {
    if (!search) return distinct;
    const needle = search.toLowerCase();
    return distinct.filter((v) => String(v).toLowerCase().includes(needle));
  }, [distinct, search]);

  const allChecked =
    filteredDistinct.length > 0 &&
    filteredDistinct.every((v) => checked.has(String(v)));

  const toggleOne = (v: unknown) => {
    const s = String(v);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredDistinct.forEach((v) => next.delete(String(v)));
      } else {
        filteredDistinct.forEach((v) => next.add(String(v)));
      }
      return next;
    });
  };

  const buildFieldSort = (): Record<string, unknown> => {
    if (sortBy === 'alpha') {
      return { mode: 'alpha', direction: sortDirection };
    }
    const [mName, mAgg] = sortBy.split(':');
    return {
      mode: 'measure',
      measure: { uniqueName: mName, aggregation: mAgg || 'sum' },
      direction: sortDirection,
    };
  };

  const applyFieldSortToAxis = (
    axisArr: InternalSliceField[] | undefined
  ): InternalSliceField[] =>
    (axisArr || []).map((f) =>
      f.uniqueName === uniqueName
        ? {
            ...f,
            fieldSort: buildFieldSort(),
            // Keep legacy `sort` in sync for alpha mode so consumers that
            // still read `field.sort` stay consistent.
            ...(sortBy === 'alpha' ? { sort: sortDirection } : {}),
          }
        : f
    );

  const handleApply = () => {
    const slice = engine.getSlice();
    const filters = (slice.filters || []).filter(
      (f) => f.uniqueName !== uniqueName
    );
    const allSelected =
      distinct.length > 0 && distinct.every((v) => checked.has(String(v)));

    if (!allSelected) {
      // Keep previous predicates (e.g. range/search) if present.
      const previous = (slice.filters || []).find(
        (f) => f.uniqueName === uniqueName
      );
      filters.push({
        ...(previous || {}),
        uniqueName: uniqueName!,
        members: Array.from(checked),
      });
    }

    engine.setSlice({
      ...slice,
      rows: applyFieldSortToAxis(slice.rows),
      columns: applyFieldSortToAxis(slice.columns),
      filters,
    });
    onClose?.();
  };

  const handleClear = () => {
    const slice = engine.getSlice();
    const filters = (slice.filters || []).filter(
      (f) => f.uniqueName !== uniqueName
    );
    engine.setSlice({ ...slice, filters });
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {caption || uniqueName}
        <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
          {tDim.subtitle ||
            'Select the values to include in the pivot.'}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
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
              value={sortBy}
              onChange={(e) => setSortBy(String(e.target.value))}
            >
              <MenuItem value="alpha">{caption || uniqueName}</MenuItem>
              {sliceMeasures.map((m) => {
                const key = `${m.uniqueName}:${m.aggregation}`;
                return (
                  <MenuItem key={key} value={key}>
                    {m.caption || m.uniqueName}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={sortDirection}
            onChange={(_, v: SortDirection | null) => v && setSortDirection(v)}
          >
            <Tooltip
              title={tGrid.sortAsc || 'Ascending'}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="asc"
                aria-label={tGrid.sortAsc || 'Ascending'}
              >
                <ArrowUpwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={tGrid.sortDesc || 'Descending'}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="desc"
                aria-label={tGrid.sortDesc || 'Descending'}
              >
                <ArrowDownwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Stack>
        <TextField
          size="small"
          fullWidth
          placeholder={tDim.search || 'Search…'}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
        />
        <Box
          sx={(theme) => ({
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            maxHeight: 340,
            overflowY: 'auto',
            p: 0.5,
          })}
        >
          {filteredDistinct.length > 0 && (
            <FormControlLabel
              sx={{ pl: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={allChecked}
                  indeterminate={
                    !allChecked &&
                    filteredDistinct.some((v) => checked.has(String(v)))
                  }
                  onChange={toggleAll}
                />
              }
              label={
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {tDim.selectAll || 'Select all'} (
                  {filteredDistinct.length})
                </Typography>
              }
            />
          )}
          <Stack>
            {filteredDistinct.map((v) => {
              const s = String(v);
              return (
                <FormControlLabel
                  key={s}
                  sx={{ pl: 1, display: 'flex' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={checked.has(s)}
                      onChange={() => toggleOne(v)}
                    />
                  }
                  label={<Typography variant="body2">{s}</Typography>}
                />
              );
            })}
          </Stack>
          {filteredDistinct.length === 0 && (
            <Typography
              variant="caption"
              sx={{ p: 1, display: 'block', opacity: 0.6, fontStyle: 'italic' }}
            >
              {tDim.noValues || 'No values.'}
            </Typography>
          )}
        </Box>
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

export default DimensionFilterDialog;
