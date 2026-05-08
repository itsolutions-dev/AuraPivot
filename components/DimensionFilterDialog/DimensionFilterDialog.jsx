import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
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
import { usePortalContainer } from '../../hooks/usePortalContainer';

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

const distinctValuesFor = (engine, uniqueName, locale) => {
  const seen = new Map();
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

const DimensionFilterDialog = function DimensionFilterDialog({
  open,
  uniqueName,
  caption,
  onClose,
}) {
  const { engine, localization: t, locale } = usePivot();
  const portalContainer = usePortalContainer();
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  // `sortBy` is either 'alpha' or `${measureUniqueName}:${aggregation}`.
  const [sortBy, setSortBy] = useState('alpha');
  const [sortDirection, setSortDirection] = useState('asc');
  // Column sort (engine.setSort) is reordered after the dimension fieldSort
  // by MatrixComputer, so an active column sort silently overrides whatever
  // the user picks here. Surface that as a banner so the choice doesn't
  // appear ignored.
  const [hasColumnSort, setHasColumnSort] = useState(false);
  // Same caveat for the row-driven sort (engine.setSortByRow): when the
  // dimension is on the columns axis, an active row sort overrides this
  // dialog's pick.
  const [hasRowSort, setHasRowSort] = useState(false);

  // Resolve the underlying field caption for each measure (e.g. "Revenue"
  // rather than "Sum Total of Revenue"). Calculated fields carry their
  // own caption; regular measures fall back to the dataset metadata.
  const aggLabel = (a) => {
    const wdrKey = { distinctcount: 'distinctCount', avg: 'average' }[a] || a;
    const raw = t?.aggregations?.[a] ?? t?.aggregations?.[wdrKey];
    if (raw && typeof raw === 'object') return raw.caption || a;
    return raw || a;
  };
  const sliceMeasures = useMemo(() => {
    if (!open) return [];
    const slice = engine.getSlice();
    const metadata = engine.getMetadata();
    const calcByName = new Map(
      engine.getCalculatedFields().map((f) => [f.uniqueName, f])
    );
    return (slice.measures || [])
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
  }, [engine, open, t]);

  const findFieldAxis = () => {
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
    [engine, uniqueName, open, locale]
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
    const fs = field?.fieldSort;
    if (fs && fs.mode === 'measure' && fs.measure?.uniqueName) {
      setSortBy(`${fs.measure.uniqueName}:${fs.measure.aggregation || 'sum'}`);
      setSortDirection(fs.direction === 'desc' ? 'desc' : 'asc');
    } else {
      setSortBy('alpha');
      setSortDirection((fs && fs.direction) || field?.sort || 'asc');
    }
    setHasColumnSort(!!slice?.sort?.colKey && axis === 'rows');
    setHasRowSort(!!slice?.sort?.rowKey && axis === 'columns');
  }, [open, uniqueName, engine, distinct]);

  const filteredDistinct = useMemo(() => {
    if (!search) return distinct;
    const needle = search.toLowerCase();
    return distinct.filter((v) => String(v).toLowerCase().includes(needle));
  }, [distinct, search]);

  const allChecked =
    filteredDistinct.length > 0 &&
    filteredDistinct.every((v) => checked.has(String(v)));

  const toggleOne = (v) => {
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

  const buildFieldSort = () => {
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

  const applyFieldSortToAxis = (axisArr) =>
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
        uniqueName,
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
          {t?.dimensionFilter?.subtitle ||
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
            {t?.dimensionFilter?.columnSortNotice ||
              'A column sort is active and takes precedence over this sort.'}
          </Alert>
        )}
        {hasRowSort && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {t?.dimensionFilter?.rowSortNotice ||
              'A row sort is active and takes precedence over this sort.'}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>{t?.dimensionFilter?.sortBy || 'Sort by'}</InputLabel>
            <Select
              label={t?.dimensionFilter?.sortBy || 'Sort by'}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
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
            onChange={(_, v) => v && setSortDirection(v)}
          >
            <Tooltip
              title={t?.grid?.sortAsc || 'Ascending'}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="asc"
                aria-label={t?.grid?.sortAsc || 'Ascending'}
              >
                <ArrowUpwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip
              title={t?.grid?.sortDesc || 'Descending'}
              disableInteractive
              arrow
            >
              <ToggleButton
                value="desc"
                aria-label={t?.grid?.sortDesc || 'Descending'}
              >
                <ArrowDownwardIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Stack>
        <TextField
          size="small"
          fullWidth
          placeholder={t?.dimensionFilter?.search || 'Search…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  {t?.dimensionFilter?.selectAll || 'Select all'} (
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
              {t?.dimensionFilter?.noValues || 'No values.'}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions style={{ padding: '16px' }}>
        <Button onClick={handleClear}>
          {t?.buttons?.removeFilter || 'Remove filter'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t?.buttons?.cancel || 'Cancel'}</Button>
        <Button onClick={handleApply} variant="contained">
          {t?.buttons?.apply || 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

DimensionFilterDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  uniqueName: PropTypes.string,
  caption: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default DimensionFilterDialog;
