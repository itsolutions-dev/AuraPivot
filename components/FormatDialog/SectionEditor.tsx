// The cell-style editor (typography, style & alignment, colors, number
// format) used by the section tabs and by conditional rules, with its color
// and labelled-field helpers and the uppercase SectionLabel the tabs share.

import React from 'react';

import {
  Box,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import { usePivot } from '../../context/PivotContext';
import { section } from '../shared/l10n';
import type { SectionValues } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
];

const PRESET_COLORS = [
  '#000000',
  '#FFFFFF',
  '#9E9E9E',
  '#F44336',
  '#E91E63',
  '#9C27B0',
  '#673AB7',
  '#3F51B5',
  '#2196F3',
  '#03A9F4',
  '#00BCD4',
  '#009688',
  '#4CAF50',
  '#8BC34A',
  '#CDDC39',
  '#FFEB3B',
  '#FFC107',
  '#FF9800',
  '#FF5722',
  '#795548',
];

// ---------------------------------------------------------------------------
// ColorSwatches
// ---------------------------------------------------------------------------

interface ColorSwatchesProps {
  value?: string | null;
  onChange: (color: string) => void;
}

const ColorSwatches = function ColorSwatches({
  value,
  onChange,
}: ColorSwatchesProps) {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      {PRESET_COLORS.map((c) => {
        const selected = value && value.toLowerCase() === c.toLowerCase();
        return (
          <Box
            key={c}
            component="button"
            type="button"
            onClick={() => onChange(c)}
            sx={(theme) => ({
              width: 20,
              height: 20,
              borderRadius: '50%',
              cursor: 'pointer',
              backgroundColor: c,
              padding: 0,
              border: selected
                ? `2px solid ${theme.palette.primary.main}`
                : `1px solid ${theme.palette.divider}`,
              boxShadow: selected
                ? `0 0 0 1px ${theme.palette.background.paper} inset`
                : 'none',
            })}
          />
        );
      })}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// ColorField
// ---------------------------------------------------------------------------

interface ColorFieldProps {
  label: string;
  value?: string | null;
  onChange: (color: string | null) => void;
}

const ColorField = function ColorField({
  label,
  value,
  onChange,
}: ColorFieldProps) {
  return (
    <Stack sx={{ my: 1, alignItems: 'flex-start' }} direction="row" spacing={2}>
      <Typography
        variant="caption"
        sx={{ minWidth: 110, opacity: 0.75, pt: 0.5 }}
      >
        {label}
      </Typography>
      <Stack spacing={1} sx={{ flex: 1 }}>
        <ColorSwatches value={value} onChange={onChange} />
        <Stack direction="row" style={{ alignItems: 'center' }} spacing={1}>
          <Box
            component="input"
            type="color"
            value={value || '#000000'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            sx={{
              width: 36,
              height: 28,
              border: 'none',
              borderRadius: 1,
              cursor: 'pointer',
              backgroundColor: 'transparent',
              padding: 0,
            }}
          />
          <TextField
            size="small"
            value={value || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            placeholder="#RRGGBB"
            sx={(theme) => ({
              flex: 1,
              '& input': {
                fontFamily: 'monospace',
                fontSize: theme.typography.fontSize,
              },
            })}
          />
          {value && (
            <IconButton size="small" onClick={() => onChange(null)}>
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// SectionLabel
// ---------------------------------------------------------------------------

interface SectionLabelProps {
  children: React.ReactNode;
}

export const SectionLabel = function SectionLabel({
  children,
}: SectionLabelProps) {
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        fontWeight: theme.typography.caption.fontWeight,
        opacity: 0.75,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        my: 1.0,
      })}
    >
      {children}
    </Typography>
  );
};

// ---------------------------------------------------------------------------
// LabeledField
// ---------------------------------------------------------------------------

interface LabeledFieldProps {
  label: React.ReactNode;
  /** Fixed width; without one the field shares its row with its siblings. */
  width?: number;
  children: React.ReactNode;
}

const LabeledField = function LabeledField({
  label,
  width,
  children,
}: LabeledFieldProps) {
  return (
    <Stack
      sx={{ gap: 0.5, ...(width === undefined ? { flex: 1 } : { width }) }}
    >
      <Typography variant="caption" sx={{ opacity: 0.75 }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// SectionEditor
// ---------------------------------------------------------------------------

interface SectionEditorProps {
  section: SectionValues;
  setSection: (next: SectionValues) => void;
  showNumberFormat?: boolean;
  showAlignment?: boolean;
}

/** A font size in px, when it is a bare number or a px length. */
const toPx = (size: unknown): number | null => {
  if (typeof size === 'number') return Number.isFinite(size) ? size : null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(String(size ?? ''));
  return m ? Number(m[1]) : null;
};

export const SectionEditor = function SectionEditor({
  // Renamed so it does not shadow the `section` l10n helper.
  section: values,
  setSection,
  showNumberFormat,
  showAlignment = true,
}: SectionEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<SectionValues>) =>
    setSection({ ...values, ...upd });
  // The engine keeps any CSS length ('14px', '1.2em'); the slider works in
  // px, so a non-px size shows as written and the thumb at the default.
  const sizePx = toPx(values.fontSize);
  const fontSize = sizePx ?? 13;
  const sizeLabel = sizePx != null ? `${sizePx}px` : String(values.fontSize);
  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 1.25 }}>
        <SectionLabel>{tF.sectionTypography || 'Typography'}</SectionLabel>
        <Stack direction="row" spacing={2}>
          <LabeledField label={tF.font || 'Font'}>
            <Select
              size="small"
              value={values.fontFamily || 'inherit'}
              onChange={(e) => patch({ fontFamily: e.target.value as string })}
            >
              <MenuItem value="inherit">
                <em>{tF.fontDefault || 'Default (theme)'}</em>
              </MenuItem>
              {FONT_FAMILIES.map((f) => (
                <MenuItem key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </MenuItem>
              ))}
            </Select>
          </LabeledField>
          <LabeledField
            label={`${tF.fontSize || 'Size'} (${sizeLabel})`}
            width={160}
          >
            <Slider
              size="small"
              min={10}
              max={24}
              value={fontSize}
              sx={(theme) => ({ fontSize: theme.typography.fontSize })}
              onChange={(_, v) => patch({ fontSize: v as number })}
            />
          </LabeledField>
        </Stack>
      </Stack>

      <Stack sx={{ gap: 1.25 }}>
        <SectionLabel>{tF.sectionStyle || 'Style & alignment'}</SectionLabel>
        <Stack direction="row" spacing={1.5} style={{ alignItems: 'center' }}>
          <ToggleButtonGroup
            size="small"
            value={[
              (values.fontWeight ?? 400) >= 600 ? 'bold' : null,
              values.italic ? 'italic' : null,
            ].filter(Boolean)}
            onChange={(_, v: string[]) => {
              patch({
                fontWeight: v.includes('bold') ? 700 : 400,
                italic: v.includes('italic'),
              });
            }}
          >
            <ToggleButton value="bold">
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="italic">
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>

          {showAlignment && (
            <>
              <Divider orientation="vertical" flexItem />

              <ToggleButtonGroup
                size="small"
                exclusive
                value={values.textAlign}
                onChange={(_, v: string | null) => v && patch({ textAlign: v })}
              >
                <ToggleButton value="left">
                  <FormatAlignLeftIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="center">
                  <FormatAlignCenterIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="right">
                  <FormatAlignRightIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </>
          )}
        </Stack>
      </Stack>

      <Stack sx={{ gap: 1.5 }}>
        <SectionLabel>{tF.sectionColors || 'Colors'}</SectionLabel>
        <ColorField
          label={tF.textColorLabel || 'Text color'}
          value={values.textColor as string | null | undefined}
          onChange={(v) => patch({ textColor: v })}
        />
        <ColorField
          label={tF.bgColorLabel || 'Background color'}
          value={values.backgroundColor as string | null | undefined}
          onChange={(v) => patch({ backgroundColor: v })}
        />
      </Stack>

      {showNumberFormat && (
        <>
          <Divider sx={{ my: 1 }} />

          <SectionLabel>{tF.numberFormat || 'NUMBER FORMAT'}</SectionLabel>

          <Stack direction="row" spacing={1.5}>
            <LabeledField label={tF.thousandSeparator || 'Thousand Separator'}>
              <Select
                size="small"
                value={values.thousandSeparator ?? 'System'}
                onChange={(e) =>
                  patch({ thousandSeparator: e.target.value as string })
                }
              >
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value="None">{tF.none || 'None'}</MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </LabeledField>
            <LabeledField label={tF.decimalSeparator || 'Decimal Separator'}>
              <Select
                size="small"
                value={values.decimalSeparator ?? 'System'}
                onChange={(e) =>
                  patch({ decimalSeparator: e.target.value as string })
                }
              >
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </LabeledField>
            <LabeledField label={tF.numberOfDecimals || 'Number of decimals'}>
              <Select
                size="small"
                value={values.numberOfDecimals ?? 'Default'}
                onChange={(e) =>
                  patch({ numberOfDecimals: e.target.value as string })
                }
              >
                <MenuItem value="Default">{tF.default || 'Default'}</MenuItem>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </LabeledField>
            <LabeledField label={tF.currencySymbol || 'Currency symbol'}>
              <Select
                size="small"
                value={values.currencySymbol ?? 'None'}
                onChange={(e) =>
                  patch({ currencySymbol: e.target.value as string })
                }
              >
                <MenuItem value="None">{tF.none || 'None'}</MenuItem>
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value="$">$</MenuItem>
                <MenuItem value="€">€</MenuItem>
                <MenuItem value="£">£</MenuItem>
                <MenuItem value="Other">{tF.other || 'Other'}</MenuItem>
              </Select>
            </LabeledField>
            <FormControlLabel
              sx={{ alignSelf: 'flex-end', flex: 1, ml: 0 }}
              control={
                <Switch
                  checked={!!values.percentage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    patch({ percentage: e.target.checked })
                  }
                />
              }
              label={tF.percentage || 'Format as percentage'}
            />
          </Stack>

          {values.currencySymbol && values.currencySymbol !== 'None' && (
            <Stack
              direction="row"
              spacing={1.5}
              style={{ alignItems: 'flex-end' }}
            >
              {values.currencySymbol === 'Other' && (
                <TextField
                  size="small"
                  label={tF.currencyOther || 'Symbol'}
                  value={values.currencyOther || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    patch({ currencyOther: e.target.value })
                  }
                  sx={{ flex: 1 }}
                />
              )}
              <LabeledField
                label={tF.currencyAlignment || 'Currency alignment'}
              >
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={values.currencyAlignment || 'Left'}
                  onChange={(_, v: string | null) =>
                    v && patch({ currencyAlignment: v })
                  }
                >
                  <ToggleButton value="Left" sx={{ textTransform: 'none' }}>
                    {tF.left || 'Left'}
                  </ToggleButton>
                  <ToggleButton value="Right" sx={{ textTransform: 'none' }}>
                    {tF.right || 'Right'}
                  </ToggleButton>
                </ToggleButtonGroup>
              </LabeledField>
            </Stack>
          )}

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', mt: 2 }}
          >
            <Stack sx={{ gap: 0.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.nullValue || 'Null Value'}
              </Typography>
              <TextField
                size="small"
                value={values.nullValue ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patch({ nullValue: e.target.value })
                }
              />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
};
