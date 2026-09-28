import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
import useEngineVersion from '../../hooks/useEngineVersion';
import type { FilterEntry } from '../../pivot-core/slice/FilterEngine';
import {
  distinctValuesFor,
  isFilterActive,
} from '../../pivot-core/slice/FilterEngine';
import { section } from '../shared/l10n';
import MemberChecklist from '../shared/MemberChecklist';

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

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type FilterMode = 'single' | 'multi' | 'range';

interface ModeOption {
  value: FilterMode;
  label: string;
}

const MODES_BY_TYPE: Record<string, ModeOption[]> = {
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

interface FieldMeta {
  type?: string;
  caption?: string;
}

interface FilterEditorProps {
  filter: FilterEntry;
  meta?: FieldMeta;
  onApply: (next: FilterEntry) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

const inferInitialMode = (filter: FilterEntry, type: string): FilterMode => {
  if (filter.range) return 'range';
  // A whitelist of any length opens as one: single mode edits `value`, so a
  // one-member list (what DimensionFilterDialog writes when one value is
  // kept) would show nothing selected there and Apply would drop it.
  if (Array.isArray(filter.members) && filter.members.length > 0)
    return 'multi';
  if (
    filter.value !== undefined &&
    filter.value !== null &&
    filter.value !== ''
  ) {
    return 'single';
  }
  const modes = MODES_BY_TYPE[type] || MODES_BY_TYPE.string;
  return modes[0]?.value || 'multi';
};

const filterSummary = (filter: FilterEntry, t: unknown): string => {
  const range = filter.range;
  const tb = section(t, 'filterBar');
  if (range && (range.min != null || range.max != null)) {
    const { min, max } = range;
    if (min != null && max != null) return `${min} … ${max}`;
    if (min != null) return `≥ ${min}`;
    return `≤ ${max}`;
  }
  if (Array.isArray(filter?.members) && filter.members.length > 0) {
    if (filter.members.length === 1) return String(filter.members[0]);
    return `${filter.members.length} ${tb.values || 'values'}`;
  }
  if (
    filter.value !== undefined &&
    filter.value !== null &&
    filter.value !== ''
  ) {
    return `= ${filter.value}`;
  }
  return tb.all || 'All';
};

const toDateInputValue = (value: unknown): string => {
  if (!value) return '';
  // Accept ISO strings, timestamps, or `dd/mm/yyyy`.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const ts = Date.parse(String(value));
  if (Number.isFinite(ts)) return new Date(ts).toISOString().slice(0, 10);
  return '';
};

// ---------------------------------------------------------------------------
// FilterEditor sub-component
// ---------------------------------------------------------------------------

const FilterEditor = function FilterEditor({
  filter,
  meta,
  onApply,
  onClose,
}: FilterEditorProps): React.ReactElement {
  const { engine, localization: t, locale } = usePivot();
  const type = meta?.type || 'string';
  const [mode, setMode] = useState<FilterMode>(() =>
    inferInitialMode(filter, type),
  );
  const [members, setMembers] = useState<string[]>(() =>
    Array.isArray(filter?.members) ? filter.members.map(String) : [],
  );
  const [value, setValue] = useState<string>(() => {
    return filter.value != null ? String(filter.value) : '';
  });
  const [range, setRange] = useState<{ min: string; max: string }>(() => {
    const r = filter.range;
    return {
      min: r?.min != null ? String(r.min) : '',
      max: r?.max != null ? String(r.max) : '',
    };
  });

  const tb = section(t, 'filterEditor');
  const tButtons = section(t, 'buttons');

  // `engine` alone is not a real dependency: it is the same object for the
  // component's whole life and mutates in place. The version counter is what
  // actually changes when the underlying rows do.
  const engineVersion = useEngineVersion(engine);
  const distinct = useMemo(
    () => distinctValuesFor(engine, filter.uniqueName, locale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engineVersion, filter.uniqueName, locale],
  );

  const pickMembers = (next: Set<string>) => {
    const list = Array.from(next);
    setMembers(list);
    if (mode === 'single') setValue(list[0] ?? '');
  };

  const handleApply = () => {
    const next: Record<string, unknown> = { uniqueName: filter.uniqueName };
    if (mode === 'multi') {
      if (members.length > 0) next.members = [...members];
    } else if (mode === 'single') {
      if (value !== '') next.value = value;
    } else if (mode === 'range') {
      const min = range.min === '' ? null : range.min;
      const max = range.max === '' ? null : range.max;
      if (min != null || max != null) next.range = { min, max };
    }
    onApply(next as unknown as FilterEntry);
  };

  const handleClear = () => {
    onApply({ uniqueName: filter.uniqueName } as FilterEntry);
  };

  const availableModes = MODES_BY_TYPE[type] || MODES_BY_TYPE.string;
  const isDateLike = type === 'date' || type === 'time';

  const getModeLabel = (modeVal: string, fallback: string): string => {
    if (modeVal === 'single' && isDateLike)
      return tb.modeSingleDate || fallback;
    const map: Record<string, string | undefined> = {
      single: tb.modeSingle,
      multi: tb.modeMulti,
      range: tb.modeRange,
    };
    return map[modeVal] || fallback;
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
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
          onChange={(_, v: FilterMode | null) => v && setMode(v)}
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
            label={tb.rangeFrom || 'From'}
            type={isDateLike ? 'date' : 'number'}
            value={isDateLike ? toDateInputValue(range.min) : range.min}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setRange({ ...range, min: e.target.value })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            size="small"
            label={tb.rangeTo || 'To'}
            type={isDateLike ? 'date' : 'number'}
            value={isDateLike ? toDateInputValue(range.max) : range.max}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setRange({ ...range, max: e.target.value })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
        </Stack>
      )}

      {mode === 'single' && !isDateLike && (
        <TextField
          size="small"
          fullWidth
          label={tb.value || 'Value'}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setValue(e.target.value)
          }
          sx={{ mb: 1 }}
        />
      )}

      {mode === 'single' && isDateLike && (
        <TextField
          size="small"
          fullWidth
          type="date"
          label={tb.date || 'Date'}
          value={toDateInputValue(value)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setValue(e.target.value)
          }
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ mb: 1 }}
        />
      )}

      {(mode === 'multi' || (mode === 'single' && !isDateLike)) && (
        <MemberChecklist
          values={distinct}
          selected={new Set(mode === 'multi' ? members : [value])}
          single={mode === 'single'}
          onChange={pickMembers}
          labels={tb}
          maxHeight={220}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button size="small" onClick={handleClear}>
          {tButtons.removeFilter || 'Remove filter'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose}>
          {tButtons.cancel || 'Cancel'}
        </Button>
        <Button size="small" variant="contained" onClick={handleApply}>
          {tButtons.apply || 'Apply'}
        </Button>
      </Stack>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// FilterBar — main exported component (no props)
// ---------------------------------------------------------------------------

/**
 * Stable per-chip identity. `uniqueName` alone is not enough: the engine
 * accepts several filters on the same field (they AND-combine), so the
 * occurrence counter disambiguates them without falling back to the array
 * index, which shifts whenever another chip is removed.
 */
const filterKeys = (filters: FilterEntry[]): string[] => {
  const seen = new Map<string, number>();
  return filters.map((f) => {
    const n = seen.get(f.uniqueName) ?? 0;
    seen.set(f.uniqueName, n + 1);
    return n === 0 ? f.uniqueName : `${f.uniqueName}#${n}`;
  });
};

const FilterBar = function FilterBar(): React.ReactElement | null {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  // The engine mutates in place, so its slice is re-read whenever the shared
  // subscription counter moves (see useEngineVersion) rather than mirrored
  // into local state from an effect.
  const engineVersion = useEngineVersion(engine);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slice = useMemo(() => engine.getSlice(), [engine, engineVersion]);
  // The open popover tracks its chip by key, not by index: removing another
  // chip must not silently re-point the editor at a different filter.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const tb = section(t, 'filterBar');

  const filters: FilterEntry[] = slice.filters || [];
  if (filters.length === 0) return null;

  const keys = filterKeys(filters);
  const activeIdx = activeKey === null ? -1 : keys.indexOf(activeKey);
  const activeFilter = activeIdx >= 0 ? filters[activeIdx] : null;

  const closeEditor = () => {
    setActiveKey(null);
    setAnchorEl(null);
  };

  const updateFilter = (idx: number, next: FilterEntry) => {
    const nextSlice = { ...slice };
    nextSlice.filters = filters.map((f, i) => (i === idx ? next : f));
    engine.setSlice(nextSlice);
    closeEditor();
  };

  const removeFilter = (idx: number) => {
    const nextSlice = { ...slice };
    nextSlice.filters = filters.filter((_, i) => i !== idx);
    engine.setSlice(nextSlice);
    if (idx === activeIdx) closeEditor();
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
        {tb.title || 'Filters'}
      </Typography>
      {filters.map((filter, idx) => {
        const meta = metadata[filter.uniqueName];
        const caption = meta?.caption || filter.uniqueName;
        const summary = filterSummary(filter, t);
        const isActive = isFilterActive(filter);
        return (
          <Chip
            key={keys[idx]}
            size="small"
            color={isActive ? 'secondary' : 'default'}
            variant={isActive ? 'filled' : 'outlined'}
            clickable
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
              setActiveKey(keys[idx]);
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
        open={activeFilter !== null}
        anchorEl={anchorEl}
        onClose={closeEditor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        container={portalContainer}
      >
        {activeFilter && (
          <FilterEditor
            // Remount when the popover switches to another chip: the editor
            // seeds all of its state from `filter` on mount only.
            key={keys[activeIdx]}
            filter={activeFilter}
            meta={metadata[activeFilter.uniqueName]}
            onApply={(next) => updateFilter(activeIdx, next)}
            onClose={closeEditor}
          />
        )}
      </Popover>
    </Box>
  );
};

export default FilterBar;
