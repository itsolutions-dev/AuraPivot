import React, { useMemo, useState } from 'react';

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
import type { SxProps, Theme } from '@mui/material/styles';
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
import { newId, withIds } from '../../utils/ids';
import {
  DEFAULT_DIMENSIONS_FORMAT,
  DEFAULT_GRAND_TOTALS_FORMAT,
  DEFAULT_HEADERS_FORMAT,
  DEFAULT_LAYOUT,
  DEFAULT_VALUES_FORMAT,
} from '../../pivot-core/PivotEngine';
import type {
  CellStyleFormat,
  LayoutFormat,
} from '../../pivot-core/PivotEngine';
import DialogHeader from '../shared/DialogHeader';
import { measureCaption, section } from '../shared/l10n';
import { withOpenSession } from '../shared/useOpenSession';

/**
 * Format dialog: edits the engine's format state across six tabs.
 *
 *   - Layout: title, note, density, zebra rows, drill-through on/off.
 *   - Headers / Dimensions: typography, style and colors of those cells.
 *   - Values: the same plus number format, for all measures or one measure.
 *   - Conditional: ordered rules that restyle a value cell when it matches a
 *     comparison, or an expression over dimensions and measures.
 *   - Grand totals: totals placement and pinning, plus their styling.
 *
 * Every tab edits a draft; Apply hands them all to `engine.setFormat()` and
 * Reset restores the engine defaults.
 */

// ---------------------------------------------------------------------------
// Shared style-section shape used for values / headers / dimensions / totals
// ---------------------------------------------------------------------------

type SectionValues = CellStyleFormat;

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

/**
 * Rules (and their expression clauses) are rendered as a drag-reorderable
 * list, so every entry needs a stable id to key on. Configurations persisted
 * before ids existed get one backfilled on load.
 */
const normalizeRules = (
  incoming: ConditionalRule[] | null | undefined,
): ConditionalRule[] =>
  withIds(incoming, 'r').map((rule) =>
    rule.expression
      ? {
          ...rule,
          expression: {
            ...rule.expression,
            clauses: withIds(rule.expression.clauses, 'c'),
          },
        }
      : rule,
  );

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

/** The engine's layout section, plus the keys this dialog also stores there. */
interface LayoutValues extends LayoutFormat {
  enableDrillThrough?: boolean;
  density?: string;
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

const SectionEditor = function SectionEditor({
  // Renamed so it does not shadow the `section` l10n helper.
  section: values,
  setSection,
  showNumberFormat,
  showAlignment = true,
}: SectionEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<SectionValues>) =>
    setSection({ ...values, ...upd });
  const fontSize = values.fontSize || 13;
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
            label={`${tF.fontSize || 'Size'} (${fontSize}px)`}
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

// ---------------------------------------------------------------------------
// TotalsPositionEditor
// ---------------------------------------------------------------------------

/** The layout keys and row caption of each totals axis. */
const TOTALS_AXES = [
  {
    position: 'totalsRowsPosition',
    sticky: 'totalsRowsSticky',
    labelKey: 'totalsPerRow',
    fallback: 'Totals per row',
  },
  {
    position: 'totalsColumnsPosition',
    sticky: 'totalsColumnsSticky',
    labelKey: 'totalsPerColumn',
    fallback: 'Totals per column',
  },
] as const;

interface TotalsPositionEditorProps {
  layout: LayoutValues;
  setLayout: (next: LayoutValues) => void;
}

const TotalsPositionEditor = function TotalsPositionEditor({
  layout,
  setLayout,
}: TotalsPositionEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<LayoutValues>) =>
    setLayout({ ...layout, ...upd });
  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.totalsPosition || 'TOTALS POSITION'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7, mb: 2 }}>
          {tF.totalsPositionDesc ||
            'Defines whether subtotals and the grand total are displayed before or after the data they aggregate.'}
        </Typography>
      </Stack>

      {TOTALS_AXES.map((axis) => {
        const position = layout[axis.position] || 'before';
        return (
          <Stack
            key={axis.position}
            direction="row"
            style={{ alignItems: 'center' }}
          >
            <Typography variant="body2" sx={{ minWidth: 140 }}>
              {tF[axis.labelKey] || axis.fallback}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={position}
              onChange={(_, v: string | null) =>
                v && patch({ [axis.position]: v })
              }
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
            {position !== 'none' && (
              <FormControlLabel
                sx={{ ml: 1 }}
                control={
                  <Switch
                    size="small"
                    checked={!!layout[axis.sticky]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patch({ [axis.sticky]: e.target.checked })
                    }
                  />
                }
                label={tF.stickyTotals || 'Pin during scroll'}
              />
            )}
          </Stack>
        );
      })}
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
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<LayoutValues>) =>
    setLayout({ ...layout, ...upd });
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            patch({ title: e.target.value })
          }
          placeholder={tF.titlePlaceholder || 'Report title'}
          sx={{ mt: 1 }}
        />
      </Stack>
      <Divider sx={{ mt: 2, mb: 1 }} />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.density || 'DENSITY'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {tF.densityDesc ||
            'Controls cell height, padding and font size of the grid.'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout.density || 'Standard'}
          onChange={(_, v: string | null) => v && patch({ density: v })}
          sx={{ alignSelf: 'flex-start', mt: 2 }}
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
      <Divider sx={{ mt: 2, mb: 1 }} />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.readability || 'READABILITY'}</SectionLabel>
        <FormControlLabel
          control={
            <Switch
              checked={!!layout.alternateRows}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                patch({ alternateRows: e.target.checked })
              }
            />
          }
          label={
            tF.alternateRows ||
            'Alternate rows (zebra stripes for easier reading)'
          }
        />
      </Stack>
      <Divider sx={{ mt: 2, mb: 1 }} />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.enableDrillThrough || 'DRILLTHROUGH'}</SectionLabel>
        <FormControlLabel
          control={
            <Switch
              checked={layout.enableDrillThrough !== false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                patch({ enableDrillThrough: e.target.checked })
              }
            />
          }
          label={
            tF.enableDrillThroughToggle ||
            'Enable drill-through (click a cell to see underlying rows)'
          }
        />
      </Stack>
      <Divider sx={{ mt: 2, mb: 1 }} />
      <Stack sx={{ gap: 0.5 }}>
        <SectionLabel>{tF.note || 'NOTE'}</SectionLabel>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {tF.noteDesc || 'Shown below the grid. Leave empty to hide.'}
        </Typography>
        <TextField
          size="small"
          value={layout.note ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            patch({ note: e.target.value })
          }
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
// Operators and measure references
// ---------------------------------------------------------------------------

interface OperatorDef {
  /** Short form in a rule's summary line; text matches never appear there. */
  symbol?: string;
  /** Flat `formatDialog` key; without one, `formatDialog.operators.<op>`. */
  l10nKey?: string;
  fallback: string;
}

const OPERATORS: Record<string, OperatorDef> = {
  gt: { symbol: '>', fallback: 'Greater than (>)' },
  gte: { symbol: '≥', fallback: 'Greater or equal (≥)' },
  lt: { symbol: '<', fallback: 'Less than (<)' },
  lte: { symbol: '≤', fallback: 'Less or equal (≤)' },
  eq: { symbol: '=', fallback: 'Equal (=)' },
  neq: { symbol: '≠', fallback: 'Not equal (≠)' },
  // The summary shows its operands as an interval.
  between: { symbol: '∈', fallback: 'Between' },
  expression: { symbol: 'ƒ(x)', fallback: 'Expression' },
  equals: { l10nKey: 'exprEquals', fallback: 'Equals' },
  startsWith: { l10nKey: 'exprStartsWith', fallback: 'Starts with' },
  endsWith: { l10nKey: 'exprEndsWith', fallback: 'Ends with' },
  contains: { l10nKey: 'exprContains', fallback: 'Contains' },
};

const DIM_OPS = ['equals', 'startsWith', 'endsWith', 'contains'];
const NUM_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'];
/** A rule can also delegate its condition to an expression. */
const RULE_OPS = [...NUM_OPS, 'expression'];

const operatorLabel = (tF: Record<string, string>, op: string): string => {
  const def = OPERATORS[op];
  const caption = def.l10nKey ? tF[def.l10nKey] : section(tF, 'operators')[op];
  return caption || def.fallback;
};

/**
 * Whether a stored measure reference (a rule's `measure`, `valueRef`, …)
 * points at `m`. References are measure keys; ones saved before measure keys
 * existed hold the bare uniqueName, which still matches.
 */
const refersTo = (ref: string | undefined, m: MeasureEntry): boolean =>
  !!ref &&
  (ref === m.measureKey ||
    (!String(ref).includes(':') && ref === m.uniqueName));

const findMeasure = (
  measures: MeasureEntry[],
  ref: string | undefined,
): MeasureEntry | undefined => measures.find((m) => refersTo(ref, m));

// ---------------------------------------------------------------------------
// ClauseEditor
// ---------------------------------------------------------------------------

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
  const { localization: t } = usePivot();
  const tF = section(t, 'formatDialog');
  const tFl = section(t, 'fieldsList');
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const patch = (upd: Partial<ExpressionClause>) =>
    onChange({ ...clause, ...upd });
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

  const ops = clause.kind === 'dim' ? DIM_OPS : NUM_OPS;

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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ not: e.target.checked })
            }
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
            {operatorLabel(tF, op)}
          </MenuItem>
        ))}
      </Select>

      {clause.kind === 'dim' ? (
        <TextField
          size="small"
          value={clause.value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            patch({ value: e.target.value })
          }
          sx={{ width: 200 }}
          label={tF.value || 'Value'}
        />
      ) : (
        <>
          <TextField
            size="small"
            type="number"
            value={clause.value ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ value: Number(e.target.value) })
            }
            sx={{ width: 140 }}
            label={tF.ruleValue || 'Value'}
          />
          {clause.operator === 'between' && (
            <TextField
              size="small"
              type="number"
              value={clause.value2 ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                patch({ value2: Number(e.target.value) })
              }
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

const ExpressionDialogBody = function ExpressionDialogBody({
  open,
  onClose,
  value,
  onChange,
  dimensions,
  measures,
}: ExpressionDialogProps) {
  const { localization: t } = usePivot();
  const tF = section(t, 'formatDialog');
  const tB = section(t, 'buttons');
  const portalContainer = usePortalContainer();
  // Seeded once per open (see withOpenSession below). `value` only changes
  // through this dialog's own Apply, which also closes it.
  const [draft, setDraft] = useState<Expression>(
    () => value || { join: 'and', clauses: [] },
  );

  const addClause = () => {
    const firstDim = dimensions[0];
    const firstMeasure = measures.find((m) => !m.hidden);
    const newClause: ExpressionClause | null = firstDim
      ? {
          id: newId('c'),
          target: firstDim.uniqueName,
          kind: 'dim',
          operator: 'equals',
          value: '',
          not: false,
        }
      : firstMeasure
        ? {
            id: newId('c'),
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
      <DialogHeader
        title={tF.expression || 'Expression'}
        subtitle={
          tF.expressionSubtitle ||
          'Combine clauses on dimensions and measures. The expression is evaluated per cell; the rule fires when it returns true.'
        }
        onClose={onClose}
      />
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
              onChange={(_, v: string | null) =>
                v && setDraft({ ...draft, join: v as 'and' | 'or' })
              }
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
              key={c.id}
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

/** Remounted on every open, so Cancel drops the draft. */
const ExpressionDialog = withOpenSession(ExpressionDialogBody);

// ---------------------------------------------------------------------------
// OperandEditor
// ---------------------------------------------------------------------------

interface OperandEditorProps {
  kind?: string;
  value?: number | string;
  measureRef?: string;
  label: string;
  measures: MeasureEntry[];
  /** Measures the operand may reference: all but the rule's own. */
  candidates: MeasureEntry[];
  canReferenceMeasure: boolean;
  onKindChange: (kind: string) => void;
  onValueChange: (value: number) => void;
  onMeasureRefChange: (ref: string) => void;
}

/** One side of a comparison: a constant, or another measure of the cell. */
const OperandEditor = function OperandEditor({
  kind,
  value,
  measureRef,
  label,
  measures,
  candidates,
  canReferenceMeasure,
  onKindChange,
  onValueChange,
  onMeasureRefChange,
}: OperandEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const isMeasure = (kind || 'constant') === 'measure';
  return (
    <>
      <Select
        size="small"
        value={kind || 'constant'}
        onChange={(e) => onKindChange(e.target.value as string)}
        sx={{ width: 120, flexShrink: 0 }}
      >
        <MenuItem value="constant">
          {tF.ruleValueConstant || 'Constant'}
        </MenuItem>
        {canReferenceMeasure && (
          <MenuItem value="measure">
            {tF.ruleValueMeasure || 'Measure'}
          </MenuItem>
        )}
      </Select>

      {isMeasure ? (
        <Select
          size="small"
          value={findMeasure(measures, measureRef)?.measureKey || ''}
          onChange={(e) => onMeasureRefChange(e.target.value as string)}
          displayEmpty
          sx={{ width: 220, flexShrink: 0 }}
        >
          <MenuItem value="" disabled>
            <em>{tF.selectMeasure || 'Select measure'}</em>
          </MenuItem>
          {candidates.map((m) => (
            <MenuItem key={m.measureKey} value={m.measureKey}>
              {m.caption || m.uniqueName}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <TextField
          size="small"
          type="number"
          value={value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onValueChange(Number(e.target.value))
          }
          sx={{ width: 160, flexShrink: 0 }}
          label={label}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// RulePreview
// ---------------------------------------------------------------------------

interface RulePreviewProps {
  style?: RuleStyle;
  sx?: SxProps<Theme>;
}

/** A "preview" chip rendered in the rule's style. */
const RulePreview = function RulePreview({ style = {}, sx }: RulePreviewProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  return (
    <Box
      sx={[
        (theme) => ({
          fontFamily: style.fontFamily || 'inherit',
          fontSize: style.fontSize || theme.typography.caption.fontSize || 13,
          fontWeight: style.fontWeight || 400,
          fontStyle: style.italic ? 'italic' : 'normal',
          color: style.textColor || 'inherit',
          backgroundColor: style.backgroundColor || 'transparent',
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {tF.preview || 'preview'}
    </Box>
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
  onDrop,
  onDragEnd,
}: RuleEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<ConditionalRule>) =>
    onChange({ ...rule, ...upd });
  const [exprOpen, setExprOpen] = useState(false);
  const isExpression = rule.operator === 'expression';
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const otherMeasures = useMemo(
    () => measures.filter((m) => !refersTo(rule.measure, m)),
    [measures, rule.measure],
  );
  const measureCompareAvailable = !!rule.measure && otherMeasures.length > 0;

  const measureLabel = rule.measure
    ? findMeasure(measures, rule.measure)?.caption || rule.measure
    : tF.allMeasures || 'All measures';
  const opSym = OPERATORS[rule.operator || 'gt']?.symbol;
  const formatOperand = (
    kind: string | undefined,
    val: unknown,
    ref: string | undefined,
  ) => {
    if (kind === 'measure') {
      if (!ref) return '?';
      return `[${findMeasure(measures, ref)?.caption || ref}]`;
    }
    return `${val ?? '?'}`;
  };
  const expressionSummary = (() => {
    const n = rule.expression?.clauses?.length || 0;
    const join = (rule.expression?.join || 'and').toUpperCase();
    if (n === 0) return tF.noClauses || 'no clauses';
    return `${n} ${
      n === 1 ? tF.clauseOne || 'clause' : tF.clauseMany || 'clauses'
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
      onDragOver={(e: React.DragEvent<HTMLDivElement>) =>
        onDragOver?.(e, index)
      }
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
            onDragStart={(e: React.DragEvent<HTMLSpanElement>) =>
              onDragStart?.(e, index)
            }
            onDragEnd={onDragEnd}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ alignItems: 'center' }}
            sx={{
              display: 'inline-flex',
              cursor: 'grab',
              color: 'text.secondary',
              '&:active': { cursor: 'grabbing' },
            }}
            title={tF.dragToReorder || 'Drag to reorder'}
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
          <RulePreview
            style={rule.style}
            sx={{ px: 1, py: 0.25, borderRadius: 0.5 }}
          />
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
              value={findMeasure(measures, rule.measure)?.measureKey || ''}
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
              {RULE_OPS.map((op) => (
                <MenuItem key={op} value={op}>
                  {operatorLabel(tF, op)}
                </MenuItem>
              ))}
            </Select>

            {!isExpression && (
              <OperandEditor
                kind={rule.valueKind}
                value={rule.value}
                measureRef={rule.valueRef}
                label={tF.ruleValue || 'Value'}
                onKindChange={(valueKind) => patch({ valueKind })}
                onValueChange={(value) => patch({ value })}
                onMeasureRefChange={(valueRef) => patch({ valueRef })}
                measures={measures}
                candidates={otherMeasures}
                canReferenceMeasure={measureCompareAvailable}
              />
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
              <OperandEditor
                kind={rule.value2Kind}
                value={rule.value2}
                measureRef={rule.value2Ref}
                label={tF.ruleValueUpperBound || 'Upper bound'}
                onKindChange={(value2Kind) => patch({ value2Kind })}
                onValueChange={(value2) => patch({ value2 })}
                onMeasureRefChange={(value2Ref) => patch({ value2Ref })}
                measures={measures}
                candidates={otherMeasures}
                canReferenceMeasure={measureCompareAvailable}
              />
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
              {tF.conditionalModeFirst || 'Stop at the first rule matched'}
            </MenuItem>
            <MenuItem value="all">
              {tF.conditionalModeAll || 'Evaluate all the rules'}
            </MenuItem>
          </Select>
        </Stack>

        <Divider sx={{ my: 1 }} />

        <SectionEditor
          section={(rule.style || {}) as SectionValues}
          setSection={(next: SectionValues) =>
            onChange({ ...rule, style: next as RuleStyle })
          }
        />

        <Stack direction="row" sx={{ mt: 2 }}>
          <Box sx={{ flex: 1 }} />
          <RulePreview
            style={rule.style}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              textAlign: rule.style?.textAlign || 'left',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
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
  const tF = section(usePivot().localization, 'formatDialog');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = (
    e: React.DragEvent<HTMLSpanElement>,
    idx: number,
  ) => {
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
        id: newId('r'),
        measure: undefined,
        operator: 'gt',
        value: 0,
        style: { ...DEFAULT_RULE_STYLE },
      },
    ]);
  };

  const updateRule = (idx: number, next: ConditionalRule) =>
    setRules(rules.map((r, i) => (i === idx ? next : r)));

  const removeRule = (idx: number) =>
    setRules(rules.filter((_, i) => i !== idx));

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
            {tF.conditionalModeFirst || 'Stop at the first rule matched'}
          </MenuItem>
          <MenuItem value="all">
            {tF.conditionalModeAll || 'Evaluate all the rules'}
          </MenuItem>
        </Select>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {modeDescription}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" sx={{ mb: 1 }} style={{ alignItems: 'center' }}>
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
            mt: 1,
          })}
        >
          <Typography variant="body2">
            {tF.noRules || 'No rules defined.'}
          </Typography>
        </Box>
      )}
      {rules.map((r, idx) => (
        <RuleEditor
          key={r.id}
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

/**
 * What Reset restores: the engine's own defaults, plus the layout keys the
 * engine leaves unset but this dialog edits.
 */
const DEFAULTS = {
  values: DEFAULT_VALUES_FORMAT,
  headers: DEFAULT_HEADERS_FORMAT,
  grandTotals: DEFAULT_GRAND_TOTALS_FORMAT,
  dimensions: DEFAULT_DIMENSIONS_FORMAT,
  layout: {
    ...DEFAULT_LAYOUT,
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

/** Tab order, with each tab's `formatDialog.tabs` key and English caption. */
const TABS = [
  ['layout', 'Layout'],
  ['headers', 'Headers'],
  ['dimensions', 'Dimensions'],
  ['values', 'Values'],
  ['conditional', 'Conditional'],
  ['grandTotals', 'Grand totals'],
] as const;

type TabKey = (typeof TABS)[number][0];

const FormatDialogBody = function FormatDialogBody({
  open,
  onClose,
}: FormatDialogProps): React.ReactElement {
  const { engine, localization: t } = usePivot();
  const tF = section(t, 'formatDialog');
  const tTabs = section(tF, 'tabs');
  const tB = section(t, 'buttons');
  const tTb = section(t, 'toolbar');
  const portalContainer = usePortalContainer();
  const [tab, setTab] = useState<TabKey>('layout');

  // The drafts seed once, on mount; withOpenSession below remounts the body
  // on every open, so each session starts from the engine's current format.
  const [initial] = useState(() => engine.getFormat());
  const [values, setValues] = useState<SectionValues>(initial.values);
  const [headers, setHeaders] = useState<SectionValues>(initial.headers);
  const [grandTotals, setGrandTotals] = useState<SectionValues>(
    initial.grandTotals,
  );
  const [dimensions, setDimensions] = useState<SectionValues>(
    initial.dimensions,
  );
  const [layout, setLayout] = useState<LayoutValues>(
    initial.layout as LayoutValues,
  );
  const [rules, setRules] = useState<ConditionalRule[]>(() =>
    normalizeRules(initial.conditional as ConditionalRule[]),
  );
  const [conditionalMode, setConditionalMode] = useState<string>(
    initial.conditionalMode,
  );
  const [valuesByMeasure, setValuesByMeasure] = useState<
    Record<string, SectionValues>
  >(initial.valuesByMeasure);
  const [valuesTarget, setValuesTarget] = useState('__default__');

  const measures: MeasureEntry[] = (engine.getSlice().measures || []).map(
    (m) => ({
      uniqueName: m.uniqueName,
      aggregation: m.aggregation,
      measureKey: `${m.uniqueName}:${m.aggregation}`,
      caption: measureCaption(engine, m, t),
      hidden: !!m.hidden,
    }),
  );

  const dimensionFields: DimensionEntry[] = (() => {
    const slice = engine.getSlice();
    const meta = engine.getMetadata();
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
    // setFormat copies every section, so the shared defaults stay pristine.
    engine.setFormat({
      ...DEFAULTS,
      valuesByMeasure: {},
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
      <DialogHeader
        title={tTb.format || 'Format'}
        subtitle={
          tF.subtitle ||
          'Customize cell display and conditional formatting rules.'
        }
        onClose={onClose}
      />
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={(theme) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: 3,
          '& .MuiTab-root': { textTransform: 'none', minHeight: 44 },
        })}
      >
        {TABS.map(([key, fallback]) => (
          <Tab key={key} value={key} label={tTabs[key] || fallback} />
        ))}
      </Tabs>
      <DialogContent sx={{ px: 3, py: 3 }}>
        {tab === 'layout' && (
          <LayoutTab layout={layout} setLayout={setLayout} />
        )}
        {tab === 'headers' && (
          <SectionEditor section={headers} setSection={setHeaders} />
        )}
        {tab === 'dimensions' && (
          <SectionEditor section={dimensions} setSection={setDimensions} />
        )}
        {tab === 'values' && (
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
                  <em>{tF.valuesDefault || 'Default (all measures)'}</em>
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
            <Divider sx={{ my: 1 }} />
            <SectionEditor
              key={valuesTarget}
              section={activeValuesSection}
              setSection={setActiveValuesSection}
              showNumberFormat
            />
          </Stack>
        )}
        {tab === 'conditional' && (
          <ConditionalTab
            rules={rules}
            setRules={setRules}
            measures={measures}
            dimensions={dimensionFields}
            mode={conditionalMode}
            setMode={setConditionalMode}
          />
        )}
        {tab === 'grandTotals' && (
          <Stack sx={{ gap: 3 }}>
            <TotalsPositionEditor layout={layout} setLayout={setLayout} />
            <Divider sx={{ my: 1 }} />
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

const FormatDialog = withOpenSession(FormatDialogBody);

export default FormatDialog;
