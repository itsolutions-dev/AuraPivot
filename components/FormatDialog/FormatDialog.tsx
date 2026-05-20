import React, { useEffect, useMemo, useState } from 'react';

// Build-time flag injected by rollup `build-flags` plugin. Outside the
// bundler the token stays unresolved — `typeof` guard prevents
// ReferenceError.
declare const __FREEPLAN__: boolean | undefined;
const IS_FREEPLAN =
  typeof __FREEPLAN__ !== 'undefined' ? !!__FREEPLAN__ : false;

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import type { FormatSnapshot, InternalCalculatedField } from '../../pivot-core/PivotEngine';

/**
 * Format customization dialog. Modeled after the auraPivot format panel:
 *
 *   - Tab "Generale": font family, size, weight, italic, text / background
 *     color, alignment and number-format options (decimal places, thousands
 *     separator, currency symbol).
 *   - Tab "Condizionale": an ordered list of rules that apply a style when
 *     a cell's numeric value matches an operator (>, >=, <, <=, =, ≠,
 *     between). Each rule can target a specific measure or all measures.
 *
 * The resulting format object is pushed to the engine via `setFormat()` on
 * "Applica", triggering a re-render of the grid through the `formatChange`
 * event exposed to the PivotContext consumer.
 */

// ---------------------------------------------------------------------------
// Shared style-section shape used for values / headers / dimensions / totals
// ---------------------------------------------------------------------------

interface SectionValues {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  textColor?: string | null;
  backgroundColor?: string | null;
  textAlign?: string;
  thousandSeparator?: string;
  decimalSeparator?: string;
  numberOfDecimals?: string | number;
  currencySymbol?: string;
  currencyOther?: string;
  currencyAlignment?: string;
  nullValue?: string;
  percentage?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Conditional-rule related shapes
// ---------------------------------------------------------------------------

interface RuleStyle {
  textColor?: string;
  backgroundColor?: string;
  fontWeight?: number;
  italic?: boolean;
  fontSize?: number | string;
  fontFamily?: string;
  textAlign?: string;
}

interface ExpressionClause {
  id?: string;
  kind?: 'dim' | 'measure';
  target?: string;
  operator?: string;
  value?: string | number;
  value2?: string | number;
  not?: boolean;
}

interface Expression {
  join?: 'and' | 'or';
  clauses: ExpressionClause[];
}

interface ConditionalRule {
  id?: string;
  measure?: string;
  operator?: string;
  value?: number | string;
  value2?: number | string;
  valueKind?: string;
  value2Kind?: string;
  valueRef?: string;
  value2Ref?: string;
  mode?: string;
  style?: RuleStyle;
  expression?: Expression;
}

// ---------------------------------------------------------------------------
// Measure entry used internally in the dialog
// ---------------------------------------------------------------------------

interface MeasureEntry {
  uniqueName: string;
  aggregation: string;
  measureKey: string;
  caption: string;
  hidden: boolean;
}

interface DimensionEntry {
  uniqueName: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Layout state shape
// ---------------------------------------------------------------------------

interface LayoutValues {
  totalsRowsPosition?: string;
  totalsRowsSticky?: boolean;
  totalsColumnsPosition?: string;
  totalsColumnsSticky?: boolean;
  alternateRows?: boolean;
  enableDrillThrough?: boolean;
  density?: string;
  title?: string;
  note?: string;
  [key: string]: unknown;
}

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

const ColorSwatches = function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
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
// DEFAULT_RULE_STYLE
// ---------------------------------------------------------------------------

const DEFAULT_RULE_STYLE: RuleStyle = {
  textColor: '#000000',
  backgroundColor: '#FFEB3B',
  fontWeight: 600,
  italic: false,
};

// ---------------------------------------------------------------------------
// ColorField
// ---------------------------------------------------------------------------

interface ColorFieldProps {
  label: string;
  value?: string | null;
  onChange: (color: string | null) => void;
}

const ColorField = function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <Stack
      sx={{
        marginTop: (theme) => theme.spacing(1),
        marginBottom: (theme) => theme.spacing(1),
        alignItems: 'flex-start',
      }}
      direction="row"
      spacing={2}
    >
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
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

const SectionLabel = function SectionLabel({ children }: SectionLabelProps) {
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
// SectionEditor
// ---------------------------------------------------------------------------

interface SectionEditorProps {
  section: SectionValues;
  setSection: (next: SectionValues) => void;
  showNumberFormat?: boolean;
  showAlignment?: boolean;
}

const SectionEditor = function SectionEditor({
  section,
  setSection,
  showNumberFormat,
  showAlignment = true,
}: SectionEditorProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const patch = (upd: Partial<SectionValues>) => setSection({ ...section, ...upd });
  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 1.25 }}>
        <SectionLabel>
          {tF.sectionTypography || 'Typography'}
        </SectionLabel>
        <Stack direction="row" spacing={2}>
          <Stack sx={{ gap: 0.5, flex: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {tF.font || 'Font'}
            </Typography>
            <Select
              size="small"
              value={section.fontFamily || 'inherit'}
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
          </Stack>
          <Stack sx={{ gap: 0.5, width: 160 }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {tF.fontSize || 'Size'} ({section.fontSize || 13}px)
            </Typography>
            <Slider
              size="small"
              min={10}
              max={24}
              sx={(theme) => ({ fontSize: theme.typography.fontSize })}
              onChange={(_, v) => patch({ fontSize: v as number })}
            />
          </Stack>
        </Stack>
      </Stack>

      <Stack sx={{ gap: 8.25 }}>
        <SectionLabel>
          {tF.sectionStyle || 'Style & alignment'}
        </SectionLabel>
        <Stack direction="row" spacing={1.5} style={{ alignItems: 'center' }}>
          <ToggleButtonGroup
            size="small"
            value={[
              (section.fontWeight ?? 400) >= 600 ? 'bold' : null,
              section.italic ? 'italic' : null,
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
                value={section.textAlign}
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
        <SectionLabel>
          {tF.sectionColors || 'Colors'}
        </SectionLabel>
        <ColorField
          label={tF.textColorLabel || 'Text color'}
          value={section.textColor as string | null | undefined}
          onChange={(v) => patch({ textColor: v })}
        />
        <ColorField
          label={tF.bgColorLabel || 'Background color'}
          value={section.backgroundColor as string | null | undefined}
          onChange={(v) => patch({ backgroundColor: v })}
        />
      </Stack>

      {showNumberFormat && (
        <>
          <Divider
            sx={{
              marginTop: (theme) => theme.spacing(1),
              marginBottom: (theme) => theme.spacing(1),
            }}
          />

          <SectionLabel>
            {tF.numberFormat || 'NUMBER FORMAT'}
          </SectionLabel>

          <Stack direction="row" spacing={1.5}>
            <Stack sx={{ gap: 0.5, flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.thousandSeparator || 'Thousand Separator'}
              </Typography>
              <Select
                size="small"
                value={section.thousandSeparator ?? 'System'}
                onChange={(e) => patch({ thousandSeparator: e.target.value as string })}
              >
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value="None">{tF.none || 'None'}</MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </Stack>
            <Stack sx={{ gap: 0.5, flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.decimalSeparator || 'Decimal Separator'}
              </Typography>
              <Select
                size="small"
                value={section.decimalSeparator ?? 'System'}
                onChange={(e) => patch({ decimalSeparator: e.target.value as string })}
              >
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value=".">.</MenuItem>
                <MenuItem value=",">,</MenuItem>
              </Select>
            </Stack>
            <Stack sx={{ gap: 0.5, flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.numberOfDecimals || 'Number of decimals'}
              </Typography>
              <Select
                size="small"
                value={section.numberOfDecimals ?? 'Default'}
                onChange={(e) => patch({ numberOfDecimals: e.target.value as string })}
              >
                <MenuItem value="Default">{tF.default || 'Default'}</MenuItem>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
            <Stack sx={{ gap: 0.5, flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.currencySymbol || 'Currency symbol'}
              </Typography>
              <Select
                size="small"
                value={section.currencySymbol ?? 'None'}
                onChange={(e) => patch({ currencySymbol: e.target.value as string })}
              >
                <MenuItem value="None">{tF.none || 'None'}</MenuItem>
                <MenuItem value="System">{tF.system || 'System'}</MenuItem>
                <MenuItem value="$">$</MenuItem>
                <MenuItem value="€">€</MenuItem>
                <MenuItem value="£">£</MenuItem>
                <MenuItem value="Other">{tF.other || 'Other'}</MenuItem>
              </Select>
            </Stack>
            <FormControlLabel
              sx={{ alignSelf: 'flex-end', flex: 1, ml: 0 }}
              control={
                <Switch
                  checked={!!section.percentage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ percentage: e.target.checked })}
                />
              }
              label={tF.percentage || 'Format as percentage'}
            />
          </Stack>

          {section.currencySymbol && section.currencySymbol !== 'None' && (
            <Stack
              direction="row"
              spacing={1.5}
              style={{ alignItems: 'flex-end' }}
            >
              {section.currencySymbol === 'Other' && (
                <TextField
                  size="small"
                  label={tF.currencyOther || 'Symbol'}
                  value={section.currencyOther || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ currencyOther: e.target.value })}
                  sx={{ flex: 1 }}
                />
              )}
              <Stack sx={{ gap: 0.5, flex: 1 }}>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {tF.currencyAlignment || 'Currency alignment'}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={section.currencyAlignment || 'Left'}
                  onChange={(_, v: string | null) => v && patch({ currencyAlignment: v })}
                >
                  <ToggleButton value="Left" sx={{ textTransform: 'none' }}>
                    {tF.left || 'Left'}
                  </ToggleButton>
                  <ToggleButton value="Right" sx={{ textTransform: 'none' }}>
                    {tF.right || 'Right'}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          )}

          <Stack
            direction="row"
            spacing={1.5}
            sx={(theme) => ({
              alignItems: 'center',
              marginTop: theme.spacing(2),
            })}
          >
            <Stack sx={{ gap: 0.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.nullValue || 'Null Value'}
              </Typography>
              <TextField
                size="small"
                value={section.nullValue ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ nullValue: e.target.value })}
              />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// TotalsPositionEditor
// ---------------------------------------------------------------------------

interface TotalsPositionEditorProps {
  layout: LayoutValues;
  setLayout: (next: LayoutValues) => void;
}

const TotalsPositionEditor = function TotalsPositionEditor({
  layout,
  setLayout,
}: TotalsPositionEditorProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const patch = (upd: Partial<LayoutValues>) => setLayout({ ...layout, ...upd });
  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>
          {tF.totalsPosition || 'TOTALS POSITION'}
        </SectionLabel>
        <Typography
          variant="caption"
          sx={(theme) => ({ opacity: 0.7, marginBottom: theme.spacing(2) })}
        >
          {tF.totalsPositionDesc ||
            'Defines whether subtotals and the grand total are displayed before or after the data they aggregate.'}
        </Typography>
      </Stack>

      <Stack
        direction="row"
        style={{
          alignItems: 'center',
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 140 }}>
          {tF.totalsPerRow || 'Totals per row'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.totalsRowsPosition || 'before'}
          onChange={(_, v: string | null) => v && patch({ totalsRowsPosition: v })}
        >
          <ToggleButton value="before" sx={{ textTransform: 'none' }}>
            {tF.beforeData || 'Before data'}
          </ToggleButton>
          <ToggleButton value="after" sx={{ textTransform: 'none' }}>
            {tF.afterData || 'After data'}
          </ToggleButton>
          <ToggleButton value="none" sx={{ textTransform: 'none' }}>
            {tF.noTotals || 'None'}
          </ToggleButton>
        </ToggleButtonGroup>
        {(layout.totalsRowsPosition || 'before') !== 'none' && (
          <FormControlLabel
            sx={{ ml: 1 }}
            control={
              <Switch
                size="small"
                checked={!!layout.totalsRowsSticky}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ totalsRowsSticky: e.target.checked })}
              />
            }
            label={tF.stickyTotals || 'Pin during scroll'}
          />
        )}
      </Stack>

      <Stack
        direction="row"
        style={{
          alignItems: 'center',
        }}
      >
        <Typography variant="body2" sx={{ minWidth: 140 }}>
          {tF.totalsPerColumn || 'Totals per column'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.totalsColumnsPosition || 'before'}
          onChange={(_, v: string | null) => v && patch({ totalsColumnsPosition: v })}
        >
          <ToggleButton value="before" sx={{ textTransform: 'none' }}>
            {tF.beforeData || 'Before data'}
          </ToggleButton>
          <ToggleButton value="after" sx={{ textTransform: 'none' }}>
            {tF.afterData || 'After data'}
          </ToggleButton>
          <ToggleButton value="none" sx={{ textTransform: 'none' }}>
            {tF.noTotals || 'None'}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// LayoutTab
// ---------------------------------------------------------------------------

interface LayoutTabProps {
  layout: LayoutValues;
  setLayout: (next: LayoutValues) => void;
}

const LayoutTab = function LayoutTab({ layout, setLayout }: LayoutTabProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const patch = (upd: Partial<LayoutValues>) => setLayout({ ...layout, ...upd });
  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.title || 'TITLE'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {tF.titleDesc || 'Shown above the toolbar. Leave empty to hide.'}
        </Typography>
        <TextField
          size="small"
          value={layout.title ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ title: e.target.value })}
          placeholder={tF.titlePlaceholder || 'Report title'}
          sx={{ mt: 1 }}
        />
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.density || 'DENSITY'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {tF.densityDesc || 'Controls cell height, padding and font size of the grid.'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.density || 'Standard'}
          onChange={(_, v: string | null) => v && patch({ density: v })}
          sx={(theme) => ({
            alignSelf: 'flex-start',
            marginTop: theme.spacing(2),
          })}
        >
          <ToggleButton value="Compact" sx={{ textTransform: 'none' }}>
            {tF.densityCompact || 'Compact'}
          </ToggleButton>
          <ToggleButton value="Standard" sx={{ textTransform: 'none' }}>
            {tF.densityStandard || 'Standard'}
          </ToggleButton>
          <ToggleButton value="Comfortable" sx={{ textTransform: 'none' }}>
            {tF.densityComfortable || 'Comfortable'}
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>
          {tF.readability || 'READABILITY'}
        </SectionLabel>
        <FormControlLabel
          control={
            <Switch
              checked={!!layout.alternateRows}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ alternateRows: e.target.checked })}
            />
          }
          label={
            tF.alternateRows ||
            'Alternate rows (zebra stripes for easier reading)'
          }
        />
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>
          {tF.enableDrillThrough || 'DRILLTHROUGH'}
        </SectionLabel>
        <FormControlLabel
          control={
            <Switch
              checked={layout.enableDrillThrough !== false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ enableDrillThrough: e.target.checked })}
            />
          }
          label={
            tF.enableDrillThroughToggle ||
            'Enable drill-through (double-click a cell to see underlying rows)'
          }
        />
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(2),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.note || 'NOTE'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {tF.noteDesc || 'Shown below the grid. Leave empty to hide.'}
        </Typography>
        <TextField
          size="small"
          value={layout.note ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ note: e.target.value })}
          placeholder={tF.notePlaceholder || 'Add a note…'}
          multiline
          minRows={2}
          maxRows={6}
          sx={{ mt: 1 }}
        />
      </Stack>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// ClauseEditor
// ---------------------------------------------------------------------------

const DIM_OPS = ['equals', 'startsWith', 'endsWith', 'contains'];
const NUM_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'];

interface ClauseEditorProps {
  clause: ExpressionClause;
  dimensions: DimensionEntry[];
  measures: MeasureEntry[];
  onChange: (next: ExpressionClause) => void;
  onRemove: () => void;
}

const ClauseEditor = function ClauseEditor({
  clause,
  dimensions,
  measures,
  onChange,
  onRemove,
}: ClauseEditorProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string> & { operators?: Record<string, string> }>)?.formatDialog ?? {};
  const tFl = (t as Record<string, Record<string, string>>)?.fieldsList ?? {};
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const patch = (upd: Partial<ExpressionClause>) => onChange({ ...clause, ...upd });
  const targetValue =
    clause.kind === 'dim'
      ? `dim:${clause.target || ''}`
      : `meas:${clause.target || ''}`;

  const handleTargetChange = (e: { target: { value: unknown } }) => {
    const v = String(e.target.value || '');
    if (v.startsWith('dim:')) {
      onChange({
        ...clause,
        kind: 'dim',
        target: v.slice(4),
        operator: 'equals',
        value: '',
        value2: undefined,
      });
    } else {
      onChange({
        ...clause,
        kind: 'measure',
        target: v.slice(5),
        operator: 'gt',
        value: 0,
        value2: undefined,
      });
    }
  };

  const dimOpsLabels: Record<string, string> = {
    equals: tF.exprEquals || 'Equals',
    startsWith: tF.exprStartsWith || 'Starts with',
    endsWith: tF.exprEndsWith || 'Ends with',
    contains: tF.exprContains || 'Contains',
  };
  // dynamic boundary: operators is a nested object in localization
  const tOps = (tF as unknown as { operators?: Record<string, string> }).operators ?? {};
  const numOpsLabels: Record<string, string> = {
    gt: tOps.gt || '> Greater than',
    gte: tOps.gte || '≥ Greater or equal',
    lt: tOps.lt || '< Less than',
    lte: tOps.lte || '≤ Less or equal',
    eq: tOps.eq || '= Equal',
    neq: tOps.neq || '≠ Not equal',
    between: tOps.between || 'Between',
  };

  const ops = clause.kind === 'dim' ? DIM_OPS : NUM_OPS;
  const opLabels = clause.kind === 'dim' ? dimOpsLabels : numOpsLabels;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ rowGap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Select
        size="small"
        value={targetValue}
        onChange={(e) => handleTargetChange(e)}
        sx={{ minWidth: 220 }}
        displayEmpty
      >
        {dimensions.length > 0 && (
          <MenuItem value="" disabled>
            <em>{tF.dimensions || 'Dimensions'}</em>
          </MenuItem>
        )}
        {dimensions.map((d) => (
          <MenuItem key={`dim:${d.uniqueName}`} value={`dim:${d.uniqueName}`}>
            {d.caption}
          </MenuItem>
        ))}
        {visibleMeasures.length > 0 && (
          <MenuItem value="" disabled>
            <em>{tFl.values || 'Measures'}</em>
          </MenuItem>
        )}
        {visibleMeasures.map((m) => (
          <MenuItem key={`meas:${m.measureKey}`} value={`meas:${m.measureKey}`}>
            {m.caption || m.uniqueName}
          </MenuItem>
        ))}
      </Select>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={!!clause.not}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ not: e.target.checked })}
          />
        }
        label={tF.exprNot || 'NOT'}
      />

      <Select
        size="small"
        value={clause.operator || ops[0]}
        onChange={(e) => patch({ operator: e.target.value as string })}
        sx={{ minWidth: 160 }}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>
            {opLabels[op]}
          </MenuItem>
        ))}
      </Select>

      {clause.kind === 'dim' ? (
        <TextField
          size="small"
          value={clause.value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value: e.target.value })}
          sx={{ width: 200 }}
          label={tF.exprValue || 'Value'}
        />
      ) : (
        <>
          <TextField
            size="small"
            type="number"
            value={clause.value ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value: Number(e.target.value) })}
            sx={{ width: 140 }}
            label={tF.ruleValue || 'Value'}
          />
          {clause.operator === 'between' && (
            <TextField
              size="small"
              type="number"
              value={clause.value2 ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value2: Number(e.target.value) })}
              sx={{ width: 140 }}
              label={tF.ruleValueUpperBound || 'Upper bound'}
            />
          )}
        </>
      )}

      <IconButton size="small" onClick={onRemove}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// ExpressionDialog
// ---------------------------------------------------------------------------

interface ExpressionDialogProps {
  open: boolean;
  onClose: () => void;
  value?: Expression | null;
  onChange: (next: Expression) => void;
  dimensions: DimensionEntry[];
  measures: MeasureEntry[];
}

const ExpressionDialog = function ExpressionDialog({
  open,
  onClose,
  value,
  onChange,
  dimensions,
  measures,
}: ExpressionDialogProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const tB = (t as Record<string, Record<string, string>>)?.buttons ?? {};
  const portalContainer = usePortalContainer();
  const [draft, setDraft] = useState<Expression>(
    () => value || { join: 'and', clauses: [] },
  );

  useEffect(() => {
    if (open) setDraft(value || { join: 'and', clauses: [] });
  }, [open, value]);

  const addClause = () => {
    const firstDim = dimensions[0];
    const firstMeasure = measures.find((m) => !m.hidden);
    const newClause: ExpressionClause | null = firstDim
      ? {
          id: `c${Date.now()}`,
          target: firstDim.uniqueName,
          kind: 'dim',
          operator: 'equals',
          value: '',
          not: false,
        }
      : firstMeasure
        ? {
            id: `c${Date.now()}`,
            target: firstMeasure.measureKey,
            kind: 'measure',
            operator: 'gt',
            value: 0,
            not: false,
          }
        : null;
    if (!newClause) return;
    setDraft({ ...draft, clauses: [...draft.clauses, newClause] });
  };

  const updateClause = (idx: number, next: ExpressionClause) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.map((c, i) => (i === idx ? next : c)),
    });

  const removeClause = (idx: number) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.filter((_, i) => i !== idx),
    });

  const apply = () => {
    onChange(draft);
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {tF.expressionTitle || 'Expression'}
        <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
          {tF.expressionSubtitle ||
            'Combine clauses on dimensions and measures. The expression is evaluated per cell; the rule fires when it returns true.'}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 3, py: 3 }}>
        <Stack sx={{ gap: 2.5 }}>
          <Stack direction="row" spacing={2} style={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {tF.expressionJoin || 'Combine clauses with'}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={draft.join || 'and'}
              onChange={(_, v: string | null) => v && setDraft({ ...draft, join: v as 'and' | 'or' })}
            >
              <ToggleButton value="and" sx={{ textTransform: 'none' }}>
                {tF.exprAnd || 'AND'}
              </ToggleButton>
              <ToggleButton value="or" sx={{ textTransform: 'none' }}>
                {tF.exprOr || 'OR'}
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={addClause}
            >
              {tF.addClause || 'Add clause'}
            </Button>
          </Stack>
          {draft.clauses.length === 0 && (
            <Box
              sx={(theme) => ({
                border: `1px dashed ${theme.palette.divider}`,
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                color: theme.palette.text.secondary,
              })}
            >
              <Typography variant="body2">
                {tF.noClauses || 'No clauses defined.'}
              </Typography>
            </Box>
          )}
          {draft.clauses.map((c, idx) => (
            <ClauseEditor
              key={c.id || idx}
              clause={c}
              dimensions={dimensions}
              measures={measures}
              onChange={(next) => updateClause(idx, next)}
              onRemove={() => removeClause(idx)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose}>{tB.cancel || 'Cancel'}</Button>
        <Button onClick={apply} variant="contained">
          {tB.apply || 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// RuleEditor
// ---------------------------------------------------------------------------

interface RuleEditorProps {
  rule: ConditionalRule;
  measures: MeasureEntry[];
  dimensions?: DimensionEntry[];
  onChange: (next: ConditionalRule) => void;
  onRemove: () => void;
  index: number;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLSpanElement>, idx: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>, idx: number) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, idx: number) => void;
  onDragEnd?: () => void;
}

const RuleEditor = function RuleEditor({
  rule,
  measures,
  dimensions = [],
  onChange,
  onRemove,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: RuleEditorProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string> & { operators?: Record<string, string> }>)?.formatDialog ?? {};
  // dynamic boundary: operators is a nested object in localization
  const tOps = (tF as unknown as { operators?: Record<string, string> }).operators ?? {};
  const patch = (upd: Partial<ConditionalRule>) => onChange({ ...rule, ...upd });
  const [exprOpen, setExprOpen] = useState(false);
  const isExpression = rule.operator === 'expression';
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  // Helper: match a stored rule.measure (either measureKey or legacy
  // uniqueName) against a measures[] entry.
  const measureEntryMatches = (m: MeasureEntry, stored: string | undefined) => {
    if (!stored || !m) return false;
    if (stored === m.measureKey) return true;
    // Legacy: stored value was uniqueName — accept it for back-compat.
    if (!String(stored).includes(':') && stored === m.uniqueName) return true;
    return false;
  };
  const otherMeasures = useMemo(
    () => measures.filter((m) => !measureEntryMatches(m, rule.measure)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measures, rule.measure],
  );
  const measureCompareAvailable = !!rule.measure && otherMeasures.length > 0;

  const operators = useMemo(
    () => [
      {
        value: 'gt',
        label: tOps.gt || 'Greater than (>)',
      },
      {
        value: 'gte',
        label: tOps.gte || 'Greater or equal (≥)',
      },
      { value: 'lt', label: tOps.lt || 'Less than (<)' },
      {
        value: 'lte',
        label: tOps.lte || 'Less or equal (≤)',
      },
      { value: 'eq', label: tOps.eq || 'Equal (=)' },
      {
        value: 'neq',
        label: tOps.neq || 'Not equal (≠)',
      },
      {
        value: 'between',
        label: tOps.between || 'Between',
      },
      // FREEPLAN: the `expression` operator is removed from the list.
      ...(IS_FREEPLAN
        ? []
        : [
            {
              value: 'expression',
              label: tOps.expression || 'Expression',
            },
          ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const OP_SYMBOLS: Record<string, string> = {
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    eq: '=',
    neq: '≠',
    between: '∈',
    expression: 'ƒ(x)',
  };
  const measureLabel = rule.measure
    ? measures.find((m) => measureEntryMatches(m, rule.measure))?.caption ||
      rule.measure
    : tF.allMeasures || 'All measures';
  const opSym = OP_SYMBOLS[rule.operator || 'gt'];
  const formatOperand = (kind: string | undefined, val: unknown, ref: string | undefined) => {
    if (kind === 'measure') {
      if (!ref) return '?';
      const c =
        measures.find((m) => measureEntryMatches(m, ref))?.caption || ref;
      return `[${c}]`;
    }
    return `${val ?? '?'}`;
  };
  const expressionSummary = (() => {
    const n = rule.expression?.clauses?.length || 0;
    const join = (rule.expression?.join || 'and').toUpperCase();
    if (n === 0) return tF.noClauses || 'no clauses';
    return `${n} ${
      n === 1
        ? tF.clauseOne || 'clause'
        : tF.clauseMany || 'clauses'
    } (${join})`;
  })();
  const exprRight = isExpression
    ? expressionSummary
    : rule.operator === 'between'
      ? `[${formatOperand(rule.valueKind, rule.value, rule.valueRef)}, ${formatOperand(rule.value2Kind, rule.value2, rule.value2Ref)}]`
      : formatOperand(rule.valueKind, rule.value, rule.valueRef);
  const ruleTitle = `${measureLabel} ${opSym} ${exprRight}`;

  return (
    <Accordion
      disableGutters
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => onDragOver?.(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => onDrop?.(e, index)}
      sx={(theme) => ({
        border: `1px solid ${
          isDropTarget ? theme.palette.primary.main : theme.palette.divider
        }`,
        borderRadius: 2,
        opacity: isDragging ? 0.4 : 1,
        '&:before': { display: 'none' },
      })}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <Stack
          direction="row"
          style={{ alignItems: 'center' }}
          spacing={1.5}
          sx={{ width: '100%' }}
        >
          <Box
            component="span"
            draggable
            onDragStart={(e: React.DragEvent<HTMLSpanElement>) => onDragStart?.(e, index)}
            onDragEnd={onDragEnd}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ alignItems: 'center' }}
            sx={{
              display: 'inline-flex',
              cursor: 'grab',
              color: 'text.secondary',
              '&:active': { cursor: 'grabbing' },
            }}
            title="Drag to reorder"
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
          <Typography
            variant="caption"
            sx={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}
          >
            #{index + 1}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
            {ruleTitle}
          </Typography>
          <Box
            sx={(theme) => ({
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              fontSize:
                rule.style?.fontSize || theme.typography.caption.fontSize || 13,
              fontFamily: rule.style?.fontFamily || 'inherit',
              fontWeight: rule.style?.fontWeight || 400,
              fontStyle: rule.style?.italic ? 'italic' : 'normal',
              color: rule.style?.textColor || 'inherit',
              backgroundColor: rule.style?.backgroundColor || 'transparent',
            })}
          >
            {tF.preview || 'preview'}
          </Box>
          <IconButton
            size="small"
            component="span"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2.5, py: 2.5 }}>
        <Stack direction="column" spacing={2.5}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Select
              size="small"
              value={
                rule.measure
                  ? measures.find((m) => measureEntryMatches(m, rule.measure))
                      ?.measureKey || ''
                  : ''
              }
              onChange={(e) => {
                const nextMeasure = (e.target.value as string) || undefined;
                const upd: Partial<ConditionalRule> = { measure: nextMeasure };
                const remaining = visibleMeasures.filter(
                  (m) => m.measureKey !== nextMeasure,
                );
                const canCompare = !!nextMeasure && remaining.length > 0;
                if (!canCompare) {
                  if (rule.valueKind === 'measure') {
                    upd.valueKind = 'constant';
                    upd.valueRef = undefined;
                  }
                  if (rule.value2Kind === 'measure') {
                    upd.value2Kind = 'constant';
                    upd.value2Ref = undefined;
                  }
                } else {
                  if (rule.valueRef === nextMeasure) upd.valueRef = undefined;
                  if (rule.value2Ref === nextMeasure) upd.value2Ref = undefined;
                }
                patch(upd);
              }}
              displayEmpty
              sx={{ width: 220, flexShrink: 0 }}
            >
              <MenuItem value="">
                <em>{tF.allMeasures || 'All measures'}</em>
              </MenuItem>
              {visibleMeasures.map((m) => (
                <MenuItem key={m.measureKey} value={m.measureKey}>
                  {m.caption || m.uniqueName}
                </MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={rule.operator || 'gt'}
              onChange={(e) => patch({ operator: e.target.value as string })}
              sx={{ width: 180, flexShrink: 0 }}
            >
              {operators.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>

            {!isExpression && (
              <>
                <Select
                  size="small"
                  value={rule.valueKind || 'constant'}
                  onChange={(e) => patch({ valueKind: e.target.value as string })}
                  sx={{ width: 120, flexShrink: 0 }}
                >
                  <MenuItem value="constant">
                    {tF.ruleValueConstant || 'Constant'}
                  </MenuItem>
                  {measureCompareAvailable && (
                    <MenuItem value="measure">
                      {tF.ruleValueMeasure || 'Measure'}
                    </MenuItem>
                  )}
                </Select>

                {(rule.valueKind || 'constant') === 'measure' ? (
                  <Select
                    size="small"
                    value={
                      rule.valueRef
                        ? measures.find((m) =>
                            measureEntryMatches(m, rule.valueRef),
                          )?.measureKey || ''
                        : ''
                    }
                    onChange={(e) => patch({ valueRef: e.target.value as string })}
                    displayEmpty
                    sx={{ width: 220, flexShrink: 0 }}
                  >
                    <MenuItem value="" disabled>
                      <em>
                        {tF.selectMeasure || 'Select measure'}
                      </em>
                    </MenuItem>
                    {otherMeasures.map((m) => (
                      <MenuItem key={m.measureKey} value={m.measureKey}>
                        {m.caption || m.uniqueName}
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <TextField
                    size="small"
                    type="number"
                    value={rule.value ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value: Number(e.target.value) })}
                    sx={{ width: 160, flexShrink: 0 }}
                    label={tF.ruleValue || 'Value'}
                  />
                )}
              </>
            )}

            {isExpression && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setExprOpen(true)}
                >
                  {tF.editExpression || 'Edit expression'}
                </Button>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {expressionSummary}
                </Typography>
              </>
            )}
          </Stack>

          {rule.operator === 'between' && !isExpression && (
            <Stack direction="row" spacing={1} style={{ alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  width: 408,
                  flexShrink: 0,
                  opacity: 0.75,
                  textAlign: 'right',
                  pr: 1,
                }}
              >
                {tF.ruleValueAnd || 'and'}
              </Typography>
              <Select
                size="small"
                value={rule.value2Kind || 'constant'}
                onChange={(e) => patch({ value2Kind: e.target.value as string })}
                sx={{ width: 120, flexShrink: 0 }}
              >
                <MenuItem value="constant">
                  {tF.ruleValueConstant || 'Constant'}
                </MenuItem>
                {measureCompareAvailable && (
                  <MenuItem value="measure">
                    {tF.ruleValueMeasure || 'Measure'}
                  </MenuItem>
                )}
              </Select>

              {(rule.value2Kind || 'constant') === 'measure' ? (
                <Select
                  size="small"
                  value={
                    rule.value2Ref
                      ? measures.find((m) =>
                          measureEntryMatches(m, rule.value2Ref),
                        )?.measureKey || ''
                      : ''
                  }
                  onChange={(e) => patch({ value2Ref: e.target.value as string })}
                  displayEmpty
                  sx={{ width: 220, flexShrink: 0 }}
                >
                  <MenuItem value="" disabled>
                    <em>
                      {tF.selectMeasure || 'Select measure'}
                    </em>
                  </MenuItem>
                  {otherMeasures.map((m) => (
                    <MenuItem key={m.measureKey} value={m.measureKey}>
                      {m.caption || m.uniqueName}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <TextField
                  size="small"
                  type="number"
                  value={rule.value2 ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value2: Number(e.target.value) })}
                  sx={{ width: 160, flexShrink: 0 }}
                  label={tF.ruleValueUpperBound || 'Upper bound'}
                />
              )}
            </Stack>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          style={{ alignItems: 'center' }}
          sx={{ mt: 2 }}
        >
          <SectionLabel>
            {tF.conditionalModeLabel || 'Evaluation mode'}
          </SectionLabel>
          <Select
            size="small"
            value={rule.mode || 'inherit'}
            onChange={(e) => patch({ mode: e.target.value as string })}
            sx={{ width: 180, flexShrink: 0 }}
          >
            <MenuItem value="inherit">
              {tF.conditionalModeInherit || 'Inherit'}
            </MenuItem>
            <MenuItem value="first">
              {tF.conditionalModeFirst ||
                'Stop at the first rule matched'}
            </MenuItem>
            <MenuItem value="all">
              {tF.conditionalModeAll || 'Evaluate all the rules'}
            </MenuItem>
          </Select>
        </Stack>

        <Divider
          sx={{
            marginTop: (theme) => theme.spacing(1),
            marginBottom: (theme) => theme.spacing(1),
          }}
        />

        <SectionEditor
          section={(rule.style || {}) as SectionValues}
          setSection={(next: SectionValues) => onChange({ ...rule, style: next as RuleStyle })}
        />

        <Stack direction="row" sx={{ mt: 2 }}>
          <Box sx={{ flex: 1 }} />
          <Box
            sx={(theme) => ({
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              fontFamily: rule.style?.fontFamily || 'inherit',
              fontSize:
                rule.style?.fontSize || theme.typography.caption.fontSize || 13,
              fontWeight: rule.style?.fontWeight || 400,
              fontStyle: rule.style?.italic ? 'italic' : 'normal',
              textAlign: rule.style?.textAlign || 'left',
              color: rule.style?.textColor || 'inherit',
              backgroundColor: rule.style?.backgroundColor || 'transparent',
              fontVariantNumeric: 'tabular-nums',
            })}
          >
            {tF.preview || 'preview'}
          </Box>
        </Stack>
      </AccordionDetails>
      <ExpressionDialog
        open={exprOpen}
        onClose={() => setExprOpen(false)}
        value={rule.expression}
        onChange={(next: Expression) => patch({ expression: next })}
        dimensions={dimensions}
        measures={measures}
      />
    </Accordion>
  );
};

// ---------------------------------------------------------------------------
// ConditionalTab
// ---------------------------------------------------------------------------

interface ConditionalTabProps {
  rules: ConditionalRule[];
  setRules: (next: ConditionalRule[]) => void;
  measures: MeasureEntry[];
  dimensions?: DimensionEntry[];
  mode?: string;
  setMode?: (mode: string) => void;
}

const ConditionalTab = function ConditionalTab({
  rules,
  setRules,
  measures,
  dimensions = [],
  mode,
  setMode,
}: ConditionalTabProps) {
  // dynamic boundary: localization is Record<string, unknown> from context
  const { localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLSpanElement>, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch {
      // some browsers require data to be set
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dropIndex) setDropIndex(idx);
  };
  const handleDragLeave = () => {
    // no-op; dropIndex is updated on next dragOver
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...rules];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setRules(next);
    setDragIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const addRule = () => {
    setRules([
      ...rules,
      {
        id: `r${Date.now()}`,
        measure: undefined,
        operator: 'gt',
        value: 0,
        style: { ...DEFAULT_RULE_STYLE },
      },
    ]);
  };

  const updateRule = (idx: number, next: ConditionalRule) =>
    setRules(rules.map((r, i) => (i === idx ? next : r)));

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  const effectiveMode = mode === 'all' ? 'all' : 'first';
  const modeDescription =
    effectiveMode === 'all'
      ? tF.conditionalModeAllDesc ||
        'Rules are evaluated from top to bottom; every matching rule is applied — later rules override earlier ones for the properties they set.'
      : tF.conditionalModeFirstDesc ||
        'Rules are evaluated from top to bottom; the first matching rule is applied.';

  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 0.75 }}>
        <SectionLabel>
          {tF.conditionalModeLabel || 'Evaluation mode'}
        </SectionLabel>
        <Select
          size="small"
          value={effectiveMode}
          onChange={(e) => setMode?.(e.target.value as string)}
        >
          <MenuItem value="first">
            {tF.conditionalModeFirst ||
              'Stop at the first rule matched'}
          </MenuItem>
          <MenuItem value="all">
            {tF.conditionalModeAll || 'Evaluate all the rules'}
          </MenuItem>
        </Select>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {modeDescription}
        </Typography>
      </Stack>
      <Divider
        sx={{
          marginTop: (theme) => theme.spacing(1),
          marginBottom: (theme) => theme.spacing(1),
        }}
      />
      <Stack
        direction="row"
        sx={{ marginBottom: (theme) => theme.spacing(1) }}
        style={{ alignItems: 'center' }}
      >
        <Typography variant="caption" sx={{ opacity: 0.75, flex: 1 }}>
          {tF.rulesDesc || 'Drag to reorder rules.'}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addRule}
          variant="outlined"
        >
          {tF.addRule || 'Add rule'}
        </Button>
      </Stack>
      {rules.length === 0 && (
        <Box
          sx={(theme) => ({
            border: `1px dashed ${theme.palette.divider}`,
            // dynamic boundary: theme.borderRadius is a custom token declared in pivot-core/types.ts
            borderRadius: theme.borderRadius,
            p: 3,
            textAlign: 'center',
            color: theme.palette.text.secondary,
            marginTop: theme.spacing(1),
          })}
        >
          <Typography variant="body2">
            {tF.noRules || 'No rules defined.'}
          </Typography>
        </Box>
      )}
      {rules.map((r, idx) => (
        <RuleEditor
          key={r.id || idx}
          rule={r}
          index={idx}
          measures={measures}
          dimensions={dimensions}
          onChange={(next: ConditionalRule) => updateRule(idx, next)}
          onRemove={() => removeRule(idx)}
          isDragging={dragIndex === idx}
          isDropTarget={
            dropIndex === idx && dragIndex !== null && dragIndex !== idx
          }
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// DEFAULTS
// ---------------------------------------------------------------------------

const DEFAULTS = {
  values: {
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 400,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: 'right',
    thousandSeparator: 'System',
    decimalSeparator: 'System',
    numberOfDecimals: 'Default',
    currencySymbol: 'None',
    currencyOther: '',
    currencyAlignment: 'Left',
    nullValue: '',
    percentage: false,
  } as SectionValues,
  headers: {
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: 'left',
  } as SectionValues,
  grandTotals: {
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: 'left',
  } as SectionValues,
  dimensions: {
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    italic: false,
    textColor: null,
    backgroundColor: null,
    textAlign: 'left',
  } as SectionValues,
  layout: {
    totalsRowsPosition: 'before',
    totalsRowsSticky: false,
    totalsColumnsPosition: 'before',
    totalsColumnsSticky: false,
    alternateRows: false,
    enableDrillThrough: true,
    density: 'Standard',
    title: '',
    note: '',
  } as LayoutValues,
};

// ---------------------------------------------------------------------------
// FormatDialog (main export)
// ---------------------------------------------------------------------------

export interface FormatDialogProps {
  open: boolean;
  onClose: () => void;
}

const FormatDialog = function FormatDialog({ open, onClose }: FormatDialogProps): React.ReactElement {
  // dynamic boundary: engine and localization come from context with broad types
  const { engine, localization: t } = usePivot();
  const tF = (t as Record<string, Record<string, string>>)?.formatDialog ?? {};
  const tB = (t as Record<string, Record<string, string>>)?.buttons ?? {};
  const tTb = (t as Record<string, Record<string, string>>)?.toolbar ?? {};
  const portalContainer = usePortalContainer();
  const [tab, setTab] = useState(0);

  const getFormat = (): FormatSnapshot => engine.getFormat();

  const [values, setValues] = useState<SectionValues>(() => (getFormat().values as SectionValues) ?? { ...DEFAULTS.values });
  const [headers, setHeaders] = useState<SectionValues>(() => (getFormat().headers as SectionValues) ?? { ...DEFAULTS.headers });
  const [grandTotals, setGrandTotals] = useState<SectionValues>(
    () => (getFormat().grandTotals as SectionValues) || { ...DEFAULTS.grandTotals },
  );
  const [dimensions, setDimensions] = useState<SectionValues>(
    () => (getFormat().dimensions as SectionValues) ?? { ...DEFAULTS.dimensions },
  );
  const [layout, setLayout] = useState<LayoutValues>(
    () => (getFormat().layout as LayoutValues) || { ...DEFAULTS.layout },
  );
  const [rules, setRules] = useState<ConditionalRule[]>(() => (getFormat().conditional as ConditionalRule[]) ?? []);
  const [conditionalMode, setConditionalMode] = useState<string>(
    () => getFormat().conditionalMode || 'first',
  );
  const [valuesByMeasure, setValuesByMeasure] = useState<Record<string, SectionValues>>(
    () => (getFormat().valuesByMeasure as Record<string, SectionValues>) || {},
  );
  const [valuesTarget, setValuesTarget] = useState('__default__');

  useEffect(() => {
    if (!open) return;
    const current = getFormat();
    setValues((current.values as SectionValues) ?? { ...DEFAULTS.values });
    setHeaders((current.headers as SectionValues) ?? { ...DEFAULTS.headers });
    setGrandTotals((current.grandTotals as SectionValues) || { ...DEFAULTS.grandTotals });
    setDimensions((current.dimensions as SectionValues) ?? { ...DEFAULTS.dimensions });
    setLayout((current.layout as LayoutValues) || { ...DEFAULTS.layout });
    setRules((current.conditional as ConditionalRule[]) ?? []);
    setConditionalMode(current.conditionalMode || 'first');
    setValuesByMeasure((current.valuesByMeasure as Record<string, SectionValues>) || {});
    setValuesTarget('__default__');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine]);

  const calcByName = new Map<string, InternalCalculatedField>(
    engine.getCalculatedFields().map((f) => [f.uniqueName, f]),
  );
  const aggLabel = (a: string) => {
    const wdrKey = ({ distinctCount: 'distinctCount', avg: 'average' } as Record<string, string>)[a] || a;
    const tAgg = (t as Record<string, Record<string, unknown>>)?.aggregations ?? {};
    const raw = tAgg[a] ?? tAgg[wdrKey];
    if (raw && typeof raw === 'object') return (raw as Record<string, string>).caption || a;
    return (raw as string) || a;
  };
  const measures: MeasureEntry[] = (engine.getSlice().measures || []).map((m) => ({
    uniqueName: m.uniqueName,
    aggregation: m.aggregation,
    measureKey: `${m.uniqueName}:${m.aggregation}`,
    caption: (() => {
      const base =
        (engine.getMetadata() as Record<string, { caption?: string }>)[m.uniqueName]?.caption ||
        calcByName.get(m.uniqueName)?.caption ||
        m.uniqueName;
      return `${base} (${aggLabel(m.aggregation)})`;
    })(),
    hidden: !!m.hidden,
  }));

  const dimensionFields: DimensionEntry[] = (() => {
    const slice = engine.getSlice();
    const meta = engine.getMetadata() as Record<string, { caption?: string }>;
    const seen = new Set<string>();
    const out: DimensionEntry[] = [];
    [...(slice.rows || []), ...(slice.columns || [])].forEach((f) => {
      if (!f || f.uniqueName === 'Measures') return;
      if (seen.has(f.uniqueName)) return;
      seen.add(f.uniqueName);
      out.push({
        uniqueName: f.uniqueName,
        caption: meta[f.uniqueName]?.caption || f.uniqueName,
      });
    });
    return out;
  })();

  const handleApply = () => {
    engine.setFormat({
      values,
      valuesByMeasure,
      headers,
      grandTotals,
      dimensions,
      layout,
      conditional: rules,
      conditionalMode,
    });
    onClose?.();
  };

  const handleReset = () => {
    engine.setFormat({
      values: { ...DEFAULTS.values },
      valuesByMeasure: {},
      headers: { ...DEFAULTS.headers },
      grandTotals: { ...DEFAULTS.grandTotals },
      dimensions: { ...DEFAULTS.dimensions },
      layout: { ...DEFAULTS.layout },
      conditional: [],
      conditionalMode: 'first',
    });
    onClose?.();
  };

  const activeValuesSection: SectionValues =
    valuesTarget === '__default__'
      ? values
      : { ...values, ...(valuesByMeasure[valuesTarget] || {}) };

  const setActiveValuesSection = (next: SectionValues) => {
    if (valuesTarget === '__default__') {
      setValues(next);
    } else {
      setValuesByMeasure({ ...valuesByMeasure, [valuesTarget]: next });
    }
  };

  const clearMeasureOverride = () => {
    if (valuesTarget === '__default__') return;
    const rest = { ...valuesByMeasure };
    delete rest[valuesTarget];
    setValuesByMeasure(rest);
  };

  const hasMeasureOverride =
    valuesTarget !== '__default__' && !!valuesByMeasure[valuesTarget];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6, pt: 2.5, pb: 2 }}>
        {tTb.format || 'Format'}
        <Typography
          variant="caption"
          component="div"
          sx={{ opacity: 0.7, mt: 0.5 }}
        >
          {tF.subtitle ||
            'Customize cell display and conditional formatting rules.'}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 12, right: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={(theme) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3,
          '& .MuiTab-root': { textTransform: 'none', minHeight: 44 },
        })}
      >
        <Tab label={tF['tabs.layout'] || tF.tabsLayout || 'Layout'} />
        <Tab label={tF['tabs.headers'] || tF.tabsHeaders || 'Headers'} />
        <Tab label={tF['tabs.dimensions'] || tF.tabsDimensions || 'Dimensions'} />
        <Tab label={tF['tabs.values'] || tF.tabsValues || 'Values'} />
        <Tab label={tF['tabs.conditional'] || tF.tabsConditional || 'Conditional'} />
        <Tab label={tF['tabs.grandTotals'] || tF.tabsGrandTotals || 'Grand totals'} />
      </Tabs>
      <DialogContent sx={{ px: 3, py: 3 }}>
        {tab === 0 && <LayoutTab layout={layout} setLayout={setLayout} />}
        {tab === 1 && (
          <SectionEditor section={headers} setSection={setHeaders} />
        )}
        {tab === 2 && (
          <SectionEditor section={dimensions} setSection={setDimensions} />
        )}
        {tab === 3 && (
          <Stack sx={{ gap: 3 }}>
            <Stack direction="row" spacing={2} style={{ alignItems: 'center' }}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {tF.valuesTarget || 'Apply to'}
              </Typography>
              <Select
                size="small"
                value={valuesTarget}
                onChange={(e) => setValuesTarget(e.target.value as string)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="__default__">
                  <em>
                    {tF.valuesDefault || 'Default (all measures)'}
                  </em>
                </MenuItem>
                {measures.map((m) => (
                  <MenuItem key={m.measureKey} value={m.measureKey}>
                    {valuesByMeasure[m.measureKey] ? '● ' : ''}
                    {m.caption || m.uniqueName}
                  </MenuItem>
                ))}
              </Select>
              {hasMeasureOverride && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={clearMeasureOverride}
                >
                  {tF.clearOverride || 'Use default'}
                </Button>
              )}
            </Stack>
            <Divider
              sx={{
                marginTop: (theme) => theme.spacing(1),
                marginBottom: (theme) => theme.spacing(1),
              }}
            />
            <SectionEditor
              key={valuesTarget}
              section={activeValuesSection}
              setSection={setActiveValuesSection}
              showNumberFormat
            />
          </Stack>
        )}
        {tab === 4 && (
          <ConditionalTab
            rules={rules}
            setRules={setRules}
            measures={measures}
            dimensions={dimensionFields}
            mode={conditionalMode}
            setMode={setConditionalMode}
          />
        )}
        {tab === 5 && (
          <Stack sx={{ gap: 3 }}>
            <TotalsPositionEditor layout={layout} setLayout={setLayout} />
            <Divider
              sx={{
                marginTop: (theme) => theme.spacing(1),
                marginBottom: (theme) => theme.spacing(1),
              }}
            />
            <SectionEditor
              section={grandTotals}
              setSection={setGrandTotals}
              showAlignment={false}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={handleReset} color="inherit">
          {tB.reset || 'Reset'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{tB.cancel || 'Cancel'}</Button>
        <Button onClick={handleApply} variant="contained">
          {tB.apply || 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FormatDialog;
