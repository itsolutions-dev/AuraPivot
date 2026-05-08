import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';

/**
 * Horizontal bar rendered above the grid. Shows one chip per field dropped
 * into the "Filter report" slot. Clicking a chip opens a popover that adapts
 * to the field type:
 *
 *   - string:              single / multi select with distinct values + search
 *   - number:              single value OR min/max range
 *   - date / time / month: date range (min/max)
 *
 * When the user applies changes, the slice is updated on the engine which
 * triggers the normal reportChange → matrix recomputation cycle.
 */

const MODES_BY_TYPE = {
  string: [
    { value: 'single', label: 'Single value' },
    { value: 'multi', label: 'Multiple values' },
  ],
  number: [
    { value: 'single', label: 'Single value' },
    { value: 'multi', label: 'Multiple values' },
    { value: 'range', label: 'Range' },
  ],
  date: [
    { value: 'single', label: 'Single date' },
    { value: 'range', label: 'Range' },
  ],
  time: [{ value: 'range', label: 'Range' }],
  month: [
    { value: 'single', label: 'Single value' },
    { value: 'multi', label: 'Multiple values' },
  ],
  weekday: [
    { value: 'single', label: 'Single value' },
    { value: 'multi', label: 'Multiple values' },
  ],
};

const inferInitialMode = (filter, type) => {
  if (filter?.range) return 'range';
  if (Array.isArray(filter?.members) && filter.members.length > 1)
    return 'multi';
  if (
    filter?.value !== undefined &&
    filter?.value !== null &&
    filter.value !== ''
  ) {
    return 'single';
  }
  const modes = MODES_BY_TYPE[type] || MODES_BY_TYPE.string;
  return modes[0]?.value || 'multi';
};

const filterSummary = (filter, t) => {
  if (filter?.range && (filter.range.min != null || filter.range.max != null)) {
    const { min, max } = filter.range;
    if (min != null && max != null) return `${min} … ${max}`;
    if (min != null) return `≥ ${min}`;
    return `≤ ${max}`;
  }
  if (Array.isArray(filter?.members) && filter.members.length > 0) {
    if (filter.members.length === 1) return String(filter.members[0]);
    return `${filter.members.length} ${t?.filterBar?.values || 'values'}`;
  }
  if (
    filter?.value !== undefined &&
    filter?.value !== null &&
    filter?.value !== ''
  ) {
    return `= ${filter.value}`;
  }
  return t?.filterBar?.all || 'All';
};

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

const toDateInputValue = (value) => {
  if (!value) return '';
  // Accept ISO strings, timestamps, or `dd/mm/yyyy`.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const t = Date.parse(value);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return '';
};

const FilterEditor = function FilterEditor({ filter, meta, onApply, onClose }) {
  const { engine, localization: t, locale } = usePivot();
  const type = meta?.type || 'string';
  const [mode, setMode] = useState(() => inferInitialMode(filter, type));
  const [members, setMembers] = useState(() =>
    Array.isArray(filter?.members) ? filter.members.map(String) : []
  );
  const [value, setValue] = useState(() =>
    filter?.value != null ? String(filter.value) : ''
  );
  const [range, setRange] = useState(() => ({
    min: filter?.range?.min ?? '',
    max: filter?.range?.max ?? '',
  }));
  const [search, setSearch] = useState('');

  const distinct = useMemo(
    () => distinctValuesFor(engine, filter.uniqueName, locale),
    [engine, filter.uniqueName, locale]
  );

  const filteredDistinct = useMemo(() => {
    if (!search) return distinct;
    const needle = search.toLowerCase();
    return distinct.filter((v) => String(v).toLowerCase().includes(needle));
  }, [distinct, search]);

  const allChecked =
    filteredDistinct.length > 0 &&
    filteredDistinct.every((v) => members.includes(String(v)));

  const toggleAll = () => {
    if (allChecked) {
      setMembers(
        members.filter((m) => !filteredDistinct.some((v) => String(v) === m))
      );
    } else {
      const next = new Set(members);
      filteredDistinct.forEach((v) => next.add(String(v)));
      setMembers(Array.from(next));
    }
  };

  const toggleOne = (v) => {
    const s = String(v);
    if (mode === 'single') {
      setMembers([s]);
      setValue(s);
      return;
    }
    setMembers((prev) =>
      prev.includes(s) ? prev.filter((m) => m !== s) : [...prev, s]
    );
  };

  const handleApply = () => {
    const next = { uniqueName: filter.uniqueName };
    if (mode === 'multi') {
      if (members.length > 0) next.members = [...members];
    } else if (mode === 'single') {
      if (value !== '') next.value = value;
    } else if (mode === 'range') {
      const min = range.min === '' ? null : range.min;
      const max = range.max === '' ? null : range.max;
      if (min != null || max != null) next.range = { min, max };
    }
    onApply(next);
  };

  const handleClear = () => {
    onApply({ uniqueName: filter.uniqueName });
  };

  const availableModes = MODES_BY_TYPE[type] || MODES_BY_TYPE.string;
  const isDateLike = type === 'date' || type === 'time';

  const getModeLabel = (value, fallback) => {
    if (value === 'single' && isDateLike)
      return t?.filterEditor?.modeSingleDate || fallback;
    const map = {
      single: t?.filterEditor?.modeSingle,
      multi: t?.filterEditor?.modeMulti,
      range: t?.filterEditor?.modeRange,
    };
    return map[value] || fallback;
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {meta?.caption || filter.uniqueName}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {availableModes.length > 1 && (
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={mode}
          onChange={(_, v) => v && setMode(v)}
          sx={{ mb: 1.5 }}
        >
          {availableModes.map((m) => (
            <ToggleButton
              key={m.value}
              value={m.value}
              sx={{ textTransform: 'none' }}
            >
              {getModeLabel(m.value, m.label)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {mode === 'range' && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            size="small"
            label={t?.filterEditor?.rangeFrom || 'From'}
            type={isDateLike ? 'date' : 'number'}
            value={isDateLike ? toDateInputValue(range.min) : range.min}
            onChange={(e) => setRange({ ...range, min: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            size="small"
            label={t?.filterEditor?.rangeTo || 'To'}
            type={isDateLike ? 'date' : 'number'}
            value={isDateLike ? toDateInputValue(range.max) : range.max}
            onChange={(e) => setRange({ ...range, max: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>
      )}

      {mode === 'single' && !isDateLike && (
        <TextField
          size="small"
          fullWidth
          label={t?.filterEditor?.value || 'Value'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          sx={{ mb: 1 }}
        />
      )}

      {mode === 'single' && isDateLike && (
        <TextField
          size="small"
          fullWidth
          type="date"
          label={t?.filterEditor?.date || 'Date'}
          value={toDateInputValue(value)}
          onChange={(e) => setValue(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 1 }}
        />
      )}

      {(mode === 'multi' || (mode === 'single' && !isDateLike)) && (
        <>
          <TextField
            size="small"
            fullWidth
            placeholder={t?.filterEditor?.search || 'Search…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 1 }}
          />
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              maxHeight: 220,
              overflowY: 'auto',
              p: 0.5,
            })}
          >
            {mode === 'multi' && filteredDistinct.length > 0 && (
              <FormControlLabel
                sx={{ pl: 1 }}
                control={
                  <Checkbox
                    size="small"
                    checked={allChecked}
                    indeterminate={!allChecked && members.length > 0}
                    onChange={toggleAll}
                  />
                }
                label={
                  <Typography variant="caption">
                    {t?.filterEditor?.selectAll || 'Select all'}
                  </Typography>
                }
              />
            )}
            {filteredDistinct.map((v) => {
              const s = String(v);
              const checked =
                mode === 'multi' ? members.includes(s) : value === s;
              return (
                <FormControlLabel
                  key={s}
                  sx={{ pl: 1, display: 'flex' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={checked}
                      onChange={() => toggleOne(v)}
                    />
                  }
                  label={<Typography variant="body2">{s}</Typography>}
                />
              );
            })}
            {filteredDistinct.length === 0 && (
              <Typography
                variant="caption"
                sx={{ p: 1, opacity: 0.6, fontStyle: 'italic' }}
              >
                {t?.filterEditor?.noValues || 'No values.'}
              </Typography>
            )}
          </Box>
        </>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button size="small" onClick={handleClear}>
          {t?.buttons?.removeFilter || 'Remove filter'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose}>
          {t?.buttons?.cancel || 'Cancel'}
        </Button>
        <Button size="small" variant="contained" onClick={handleApply}>
          {t?.buttons?.apply || 'Apply'}
        </Button>
      </Stack>
    </Box>
  );
};

FilterEditor.propTypes = {
  filter: PropTypes.object.isRequired,
  meta: PropTypes.object,
  onApply: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const FilterBar = function FilterBar() {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  const [slice, setSliceState] = useState(() => engine.getSlice());
  const [activeIdx, setActiveIdx] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    const sync = () => setSliceState({ ...engine.getSlice() });
    engine.on('reportChange', sync);
    engine.on('dataChange', sync);
    return () => {
      engine.off('reportChange', sync);
      engine.off('dataChange', sync);
    };
  }, [engine]);

  const filters = slice.filters || [];
  if (filters.length === 0) return null;

  const updateFilter = (idx, next) => {
    const nextSlice = { ...slice };
    nextSlice.filters = filters.map((f, i) => (i === idx ? next : f));
    engine.setSlice(nextSlice);
    setActiveIdx(null);
    setAnchorEl(null);
  };

  const removeFilter = (idx) => {
    const nextSlice = { ...slice };
    nextSlice.filters = filters.filter((_, i) => i !== idx);
    engine.setSlice(nextSlice);
  };

  const metadata = engine.getMetadata();

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.75,
        borderBottom: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.default,
      })}
    >
      <FilterAltIcon fontSize="small" sx={{ opacity: 0.6 }} />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, opacity: 0.7, mr: 0.5 }}
      >
        {t?.filterBar?.title || 'Filters'}
      </Typography>
      {filters.map((filter, idx) => {
        const meta = metadata[filter.uniqueName];
        const caption = meta?.caption || filter.uniqueName;
        const summary = filterSummary(filter, t);
        const isActive =
          (Array.isArray(filter.members) && filter.members.length > 0) ||
          (filter.value !== undefined &&
            filter.value !== null &&
            filter.value !== '') ||
          (filter.range &&
            (filter.range.min != null || filter.range.max != null));
        return (
          <Chip
            key={`${filter.uniqueName}-${idx}`}
            size="small"
            color={isActive ? 'primary' : 'default'}
            variant={isActive ? 'filled' : 'outlined'}
            clickable
            onClick={(e) => {
              setActiveIdx(idx);
              setAnchorEl(e.currentTarget);
            }}
            onDelete={() => removeFilter(idx)}
            deleteIcon={<ClearIcon />}
            label={
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                <b>{caption}</b>: {summary}
              </Box>
            }
            sx={{ borderRadius: 2 }}
          />
        );
      })}

      <Popover
        open={activeIdx !== null}
        anchorEl={anchorEl}
        onClose={() => {
          setActiveIdx(null);
          setAnchorEl(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        container={portalContainer}
      >
        {activeIdx !== null && filters[activeIdx] && (
          <FilterEditor
            filter={filters[activeIdx]}
            meta={metadata[filters[activeIdx].uniqueName]}
            onApply={(next) => updateFilter(activeIdx, next)}
            onClose={() => {
              setActiveIdx(null);
              setAnchorEl(null);
            }}
          />
        )}
      </Popover>
    </Box>
  );
};

export default FilterBar;
