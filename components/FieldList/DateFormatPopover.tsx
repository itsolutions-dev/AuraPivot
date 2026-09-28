// Date-format picker for a date field or one of its hierarchy parts, with
// the preset lists it offers.
import React from 'react';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  Popover,
  TextField,
} from '@mui/material';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { section } from '../shared/l10n';

interface DateFormatEntry {
  value: string;
  labelKey?: string;
  fallback: string;
}

// ---------------------------------------------------------------------------
// Date format presets
// ---------------------------------------------------------------------------

const DATE_FORMAT_PRESETS: DateFormatEntry[] = [
  {
    value: 'locale-date',
    labelKey: 'localeDate',
    fallback: 'Browser locale (date)',
  },
  {
    value: 'locale-datetime',
    labelKey: 'localeDateTime',
    fallback: 'Browser locale (date & time)',
  },
  { value: 'iso', labelKey: 'iso', fallback: 'ISO (yyyy-MM-dd HH:mm:ss)' },
  { value: 'iso-date', labelKey: 'isoDate', fallback: 'ISO date (yyyy-MM-dd)' },
  { value: 'custom', labelKey: 'custom', fallback: 'Custom pattern…' },
];

// Per-subpart preset lists + defaults. Keyed by the metadata.subpart value.
const SUBPART_PRESETS: Record<string, { value: string; fallback: string }[]> = {
  month: [
    { value: 'name-full', fallback: 'Full name (January)' },
    { value: 'name-short', fallback: 'Short name (Jan)' },
    { value: 'number', fallback: 'Number (1)' },
    { value: 'number-padded', fallback: 'Padded number (01)' },
  ],
  quarter: [
    { value: 'long', fallback: 'Long (Quarter 1)' },
    { value: 'short', fallback: 'Short (Q1)' },
    { value: 'number', fallback: 'Number (1)' },
  ],
  weekday: [
    { value: 'name-full', fallback: 'Full name (Monday)' },
    { value: 'name-short', fallback: 'Short name (Mon)' },
  ],
  week: [
    { value: 'number', fallback: 'Number (1)' },
    { value: 'long', fallback: 'Long (Week 1)' },
  ],
};

const SUBPART_DEFAULTS: Record<string, string> = {
  month: 'name-full',
  quarter: 'long',
  weekday: 'name-full',
  week: 'number',
};

export const SUBPART_CONFIGURABLE = new Set(Object.keys(SUBPART_PRESETS));

export const defaultFormatFor = (subpart: string | null): string | null =>
  subpart ? SUBPART_DEFAULTS[subpart] || null : 'locale-date';

// ---------------------------------------------------------------------------
// DateFormatPopover
// ---------------------------------------------------------------------------

interface DateFormatPopoverProps {
  anchor: HTMLElement | null;
  uniqueName?: string | null;
  subpart?: string | null;
  value?: string | null;
  onChange: (fmt: string) => void;
  onClose: () => void;
  t: Record<string, unknown>;
}

export const DateFormatPopover = function DateFormatPopover({
  anchor,
  uniqueName,
  subpart,
  value,
  onChange,
  onClose,
  t,
}: DateFormatPopoverProps): React.ReactElement {
  const portalContainer = usePortalContainer();
  const tFL = section(t, 'fieldsList');
  const isSubpart = !!(subpart && SUBPART_PRESETS[subpart]);
  const subpartPresets = isSubpart ? SUBPART_PRESETS[subpart!] : null;
  const subpartLabel = (p: { value: string; fallback: string }): string =>
    section(section(tFL, 'subpartFormats'), subpart!)[p.value] || p.fallback;

  const dateLabel = (p: DateFormatEntry): string =>
    section(tFL, 'dateFormats')[p.labelKey || ''] || p.fallback;

  // For the free date formatter: any non-preset value = custom pattern.
  const datePresetValues = new Set(
    DATE_FORMAT_PRESETS.filter((p) => p.value !== 'custom').map((p) => p.value),
  );
  const dateIsPreset = datePresetValues.has(value || '');
  const dateMode = dateIsPreset ? value || '' : 'custom';
  const datePattern = dateIsPreset ? '' : value || '';

  return (
    <Popover
      open={!!anchor && !!uniqueName}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      container={portalContainer}
    >
      <Box sx={{ p: 2, width: 280 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.75 }}>
          {tFL.dateFormat || 'Date format'}
        </Typography>
        {isSubpart ? (
          <Select
            value={value || SUBPART_DEFAULTS[subpart!]}
            onChange={(e) => onChange(String(e.target.value))}
            size="small"
            fullWidth
            sx={{ mt: 1 }}
          >
            {subpartPresets!.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {subpartLabel(p)}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <>
            <Select
              value={dateMode}
              onChange={(e) => {
                const next = String(e.target.value);
                if (next === 'custom') {
                  onChange(datePattern || 'dd/MM/yyyy');
                } else {
                  onChange(next);
                }
              }}
              size="small"
              fullWidth
              sx={{ mt: 1 }}
            >
              {DATE_FORMAT_PRESETS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {dateLabel(p)}
                </MenuItem>
              ))}
            </Select>
            {dateMode === 'custom' && (
              <TextField
                value={datePattern}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange(e.target.value)
                }
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                placeholder="dd/MM/yyyy HH:mm"
                helperText={
                  tFL.dateFormatHelp ||
                  'Tokens: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H mm m ss s'
                }
              />
            )}
          </>
        )}
      </Box>
    </Popover>
  );
};
