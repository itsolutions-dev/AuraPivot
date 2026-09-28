import React, { useMemo, useState } from 'react';

import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Chip,
  Typography,
  Button,
  Select,
  MenuItem,
  Stack,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Popover,
  TextField,
  Checkbox,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  OutlinedInput,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import CalculateIcon from '@mui/icons-material/Calculate';
import FunctionsIcon from '@mui/icons-material/Functions';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import useEngineVersion from '../../hooks/useEngineVersion';
import CalculatedFieldDialog from '../CalculatedFieldDialog/CalculatedFieldDialog';
import DialogHeader from '../shared/DialogHeader';
import { aggregationLabel, section } from '../shared/l10n';
import { withOpenSession } from '../shared/useOpenSession';
import { MEASURE_AGGREGATIONS } from '../../pivot-core/aggregation/labels';
import { hasOwn } from '../../pivot-core/utils';
import type PivotEngine from '../../pivot-core/PivotEngine';
import type {
  InternalCalculatedField,
  InternalSlice,
  InternalSliceField,
} from '../../pivot-core/PivotEngine';

/**
 * Field list dialog: drag fields between the filters, rows, columns and
 * values zones, and set per-field captions, date formats and drill-through
 * columns. Built on MUI primitives, so it follows the host theme, dark mode
 * included.
 *
 * Drag-and-drop uses the native HTML5 API rather than a dnd library.
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ZoneId = 'rows' | 'columns' | 'measures' | 'filters';

/**
 * An entry of any drop zone. The editor handles the four zones uniformly,
 * so the measure-only properties are optional here.
 */
type ZoneField = InternalSliceField & {
  aggregation?: string;
  hidden?: boolean;
  availableAggregations?: string[];
};

/** The draft slice, with every zone as ZoneField[]. */
interface LocalSlice {
  rows?: ZoneField[];
  columns?: ZoneField[];
  measures?: ZoneField[];
  filters?: ZoneField[];
  [key: string]: unknown;
}

type AvailableField = ReturnType<PivotEngine['getAvailableFields']>[number];

/** A palette entry; a date field groups its hierarchy parts as children. */
interface FieldTreeNode extends AvailableField {
  isDateParent?: boolean;
  /** Header for the remaining parts of a date field that sits in a zone. */
  parentUsed?: boolean;
  partCaption?: string;
  subpart?: string;
  children?: FieldTreeNode[];
}

/** Where a drag started: a zone chip (at `idx`) or the "All fields" palette. */
type DragPayload =
  | { source: 'all'; uniqueName: string }
  | { source: ZoneId; uniqueName: string; idx: number };

interface DateFormatEntry {
  value: string;
  labelKey?: string;
  fallback: string;
}

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

export interface FieldListProps {
  open: boolean;
  onClose: () => void;
  measuresAxis?: 'rows' | 'columns';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZONES: { id: ZoneId; labelKey: string }[] = [
  { id: 'filters', labelKey: 'filters' },
  { id: 'rows', labelKey: 'rows' },
  { id: 'columns', labelKey: 'columns' },
  { id: 'measures', labelKey: 'values' },
];

const isZoneId = (value: unknown): value is ZoneId =>
  ZONES.some((z) => z.id === value);

/**
 * Stable React key for a slice entry. The measures zone may hold the same
 * field several times with different aggregations, so the aggregation is
 * part of the identity — never the array index, since every zone is
 * drag-reorderable.
 */
const chipKey = (item: ZoneField): string =>
  item.aggregation ? `${item.uniqueName}:${item.aggregation}` : item.uniqueName;

// ---------------------------------------------------------------------------
// Drag payload
// ---------------------------------------------------------------------------

/**
 * Private drag type, so a text drag from another page or app is never read
 * as a field. It is not a trust boundary — any page can set any type — so
 * `readDragPayload` checks the shape and the drop handlers check the
 * payload against the current slice.
 */
const DRAG_TYPE = 'application/x-aurapivot-field';

const startDrag = (e: React.DragEvent, payload: DragPayload) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
};

/**
 * The payload of a drag this dialog started, or null for anything else:
 * the source must be the palette or a zone, and a zone source needs a
 * non-negative integer index.
 */
const readDragPayload = (e: React.DragEvent): DragPayload | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { source, uniqueName, idx } = raw as Record<string, unknown>;
  if (typeof uniqueName !== 'string') return null;
  if (source === 'all') return { source, uniqueName };
  if (!isZoneId(source) || typeof idx !== 'number') return null;
  if (!Number.isInteger(idx) || idx < 0) return null;
  return { source, uniqueName, idx };
};

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

const SUBPART_CONFIGURABLE = new Set(Object.keys(SUBPART_PRESETS));

const defaultFormatFor = (subpart: string | null): string | null =>
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

const DateFormatPopover = function DateFormatPopover({
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

// ---------------------------------------------------------------------------
// NumericField
// ---------------------------------------------------------------------------

interface NumericFieldProps {
  value?: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  helperText?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
}

/**
 * Self-contained numeric input modeled after the Material UI NumberField recipe.
 * Uses only primitives already shipped by `@mui/material` (no Base UI dep) so
 * the library keeps its existing peer-dependency surface. Renders as an
 * OutlinedInput flanked by two IconButton adornments; the native browser spin
 * buttons are hidden so increment / decrement are driven exclusively by the
 * adornment buttons (consistent visuals across browsers).
 */
const NumericField = function NumericField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  helperText,
  size = 'small',
  fullWidth = false,
}: NumericFieldProps): React.ReactElement {
  const clamp = (raw: number): number => {
    let n = Number.isFinite(raw) ? raw : 0;
    if (Number.isFinite(min)) n = Math.max(min!, n);
    if (Number.isFinite(max)) n = Math.min(max!, n);
    return n;
  };
  const commit = (next: number) => onChange?.(clamp(next));
  const current = Number.isFinite(value) ? value! : 0;

  return (
    <FormControl size={size} fullWidth={fullWidth} variant="outlined">
      {label && <InputLabel shrink>{label}</InputLabel>}
      <OutlinedInput
        size={size}
        value={current}
        notched={!!label}
        label={label}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const v = parseFloat(e.target.value);
          commit(Number.isFinite(v) ? v : 0);
        }}
        startAdornment={
          <InputAdornment position="start">
            <IconButton
              size="small"
              aria-label="decrement"
              disabled={Number.isFinite(min) && current <= min!}
              onClick={() => commit(current - step)}
              sx={(theme) => ({
                borderRadius: 1.5,
                color: theme.palette.text.secondary,
                '&:hover': {
                  color: theme.palette.primary.main,
                  backgroundColor: theme.palette.action.hover,
                },
              })}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              size="small"
              aria-label="increment"
              disabled={Number.isFinite(max) && current >= max!}
              onClick={() => commit(current + step)}
              sx={(theme) => ({
                borderRadius: 1.5,
                color: theme.palette.text.secondary,
                '&:hover': {
                  color: theme.palette.primary.main,
                  backgroundColor: theme.palette.action.hover,
                },
              })}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
        inputProps={{
          inputMode: 'numeric',
          style: {
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            MozAppearance: 'textfield',
          },
        }}
        sx={{
          '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button':
            {
              WebkitAppearance: 'none',
              margin: 0,
            },
        }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------

interface DropZoneProps {
  zone: ZoneId;
  /** The whole zone array, Measures anchor included. */
  items: ZoneField[];
  label: string;
  dropHint: string;
  onDrop: (
    zone: ZoneId,
    payload: DragPayload,
    targetIdx: number | null,
  ) => void;
  renderItem: (item: ZoneField, idx: number) => React.ReactNode;
}

const DropZone = function DropZone({
  zone,
  items,
  label,
  dropHint,
  onDrop,
  renderItem,
}: DropZoneProps): React.ReactElement {
  const [over, setOver] = useState<boolean>(false);

  // `targetIdx` is the chip dropped on (insert before it), or null for the
  // zone background (append).
  const drop = (e: React.DragEvent, targetIdx: number | null) => {
    e.preventDefault();
    setOver(false);
    const payload = readDragPayload(e);
    if (payload) onDrop(zone, payload, targetIdx);
  };

  // The Measures anchor gets no chip (the "Show totals" toggle places it)
  // but keeps its slot, so chip indices match the zone array the slice
  // edits address.
  const isEmpty = items.every((item) => item.uniqueName === 'Measures');

  return (
    <Box
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => drop(e, null)}
      sx={(theme) => ({
        borderRadius: 2,
        border: `1px dashed ${
          over ? theme.palette.primary.main : theme.palette.divider
        }`,
        backgroundColor: over
          ? theme.palette.action.hover
          : theme.palette.background.default,
        p: 1.5,
        minHeight: 96,
        transition: 'all 150ms ease',
      })}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, opacity: 0.75, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Stack direction="row" sx={{ gap: 0, flexWrap: 'wrap', mt: 0.75 }}>
        {isEmpty && (
          <Typography
            variant="body2"
            sx={{ opacity: 0.5, fontStyle: 'italic' }}
          >
            {dropHint}
          </Typography>
        )}
        {items.map((item, idx) =>
          item.uniqueName === 'Measures' ? null : (
            // Each chip is both a drag source (to move to another zone) and
            // a drop target (to reorder / insert at a specific position).
            <Box
              key={chipKey(item)}
              draggable
              onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                e.stopPropagation();
                startDrag(e, {
                  source: zone,
                  uniqueName: item.uniqueName,
                  idx,
                });
              }}
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                e.stopPropagation();
                drop(e, idx);
              }}
              sx={{
                cursor: 'grab',
                mr: '4px',
                mt: '4px',
                '&:active': { cursor: 'grabbing' },
              }}
            >
              {renderItem(item, idx)}
            </Box>
          ),
        )}
      </Stack>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Rows of the "All fields" palette
// ---------------------------------------------------------------------------

interface RowActionProps {
  /** Tooltip; MUI also makes it the button's accessible name. */
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  color?: string;
  children: React.ReactNode;
}

/**
 * Compact icon button on a palette row or a chip. The click stops at the
 * button, so it never reaches the draggable row or chip around it.
 */
const RowAction = function RowAction({
  title,
  onClick,
  color,
  children,
}: RowActionProps): React.ReactElement {
  const button = (
    <IconButton
      size="small"
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onClick(e);
      }}
      sx={(theme) => ({
        p: '2px',
        '& svg': { fontSize: theme.typography.fontSize },
        color,
      })}
    >
      {children}
    </IconButton>
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
};

interface PaletteRowProps {
  uniqueName: string;
  /** Already on rows, columns or filters: listed, but not draggable again. */
  used: boolean;
  /** Defaults to `!used`. A row that cannot be dragged is dimmed. */
  draggable?: boolean;
  /** Controls placed before the drag handle. */
  leading?: React.ReactNode;
  dropProps?: Pick<
    React.HTMLAttributes<HTMLDivElement>,
    'onDragOver' | 'onDrop'
  >;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
}

/** One "All fields" row, a drag source for the zones. */
const PaletteRow = function PaletteRow({
  uniqueName,
  used,
  draggable = !used,
  leading,
  dropProps,
  sx,
  children,
}: PaletteRowProps): React.ReactElement {
  const tFL = section(usePivot().localization, 'fieldsList');
  return (
    <Tooltip
      title={
        used
          ? tFL.fieldUsedTooltip ||
            'Field already used — remove it from rows/columns/filters to drag it elsewhere'
          : ''
      }
      disableHoverListener={!used}
      disableFocusListener={!used}
    >
      <Box
        draggable={draggable}
        onDragStart={
          draggable
            ? (e: React.DragEvent<HTMLDivElement>) =>
                startDrag(e, { source: 'all', uniqueName })
            : undefined
        }
        {...dropProps}
        style={{ alignItems: 'center' }}
        sx={[
          (theme) => ({
            display: 'flex',
            gap: 0.5,
            cursor: draggable ? 'grab' : 'default',
            py: 0.5,
            borderRadius: 1.5,
            backgroundColor: theme.palette.action.hover,
            border: '1px solid transparent',
            opacity: draggable ? 1 : 0.55,
            '&:hover': { backgroundColor: theme.palette.action.selected },
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {leading}
        {draggable ? (
          <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.5 }} />
        ) : (
          <Box sx={{ width: 20 }} />
        )}
        {children}
      </Box>
    </Tooltip>
  );
};

// ---------------------------------------------------------------------------
// Main FieldList component
// ---------------------------------------------------------------------------

/** The measure axis needs an anchor field on one of the two zones. */
const ensureMeasuresAnchor = (
  s: LocalSlice,
  measuresAxis: FieldListProps['measuresAxis'],
): LocalSlice => {
  const inRows = (s.rows || []).some((f) => f.uniqueName === 'Measures');
  const inCols = (s.columns || []).some((f) => f.uniqueName === 'Measures');
  if (inRows || inCols) return s;
  // Default placement honors the `measuresAxis` prop; columns otherwise.
  if (measuresAxis === 'rows') {
    return { ...s, rows: [...(s.rows || []), { uniqueName: 'Measures' }] };
  }
  return { ...s, columns: [...(s.columns || []), { uniqueName: 'Measures' }] };
};

const without = (
  list: ZoneField[] | undefined,
  uniqueName: string,
): ZoneField[] => (list || []).filter((f) => f.uniqueName !== uniqueName);

/** Drop a field from every zone of the local draft slice. */
const stripFromSlice = (s: LocalSlice, uniqueName: string): LocalSlice => ({
  ...s,
  rows: without(s.rows, uniqueName),
  columns: without(s.columns, uniqueName),
  measures: without(s.measures, uniqueName),
  filters: without(s.filters, uniqueName),
});

const NO_CAPTION_EDIT = {
  anchor: null as HTMLElement | null,
  uniqueName: null as string | null,
  value: '',
};

const FieldListBody = function FieldListBody({
  open,
  onClose,
  measuresAxis,
}: FieldListProps): React.ReactElement {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  // Every draft below is seeded once, on mount: withOpenSession remounts
  // this body each time the dialog opens, so there is no reset effect and
  // an engine event can never overwrite an edit the user has not applied.
  const [slice, setSliceState] = useState<LocalSlice>(() =>
    ensureMeasuresAnchor(
      engine.getSlice() as unknown as LocalSlice,
      measuresAxis,
    ),
  );
  const [calcDialog, setCalcDialog] = useState<{
    open: boolean;
    editField: InternalCalculatedField | null;
  }>({
    open: false,
    editField: null,
  });

  // Calculated fields are the exception: the nested CalculatedFieldDialog
  // commits them to the engine immediately, so they are read back rather
  // than drafted.
  const engineVersion = useEngineVersion(engine);
  const calcFields = useMemo<InternalCalculatedField[]>(
    () => engine.getCalculatedFields(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engineVersion],
  );
  const calcField = (uniqueName: string) =>
    calcFields.find((c) => c.uniqueName === uniqueName);

  // Local draft of per-date-field formats. Committed to the engine on Apply.
  const [dateFormats, setDateFormats] = useState<Record<string, string>>(() =>
    engine.getDateFormats(),
  );
  // Local drafts for the "All fields" reorder and the drill-through config.
  // Persisted on Apply via engine.setFieldOrder / setDrillThroughConfig.
  const [fieldOrder, setFieldOrder] = useState<string[]>(() =>
    engine.getFieldOrder(),
  );
  const [drillThroughFields, setDrillThroughFields] = useState<
    Record<string, boolean>
  >(() => engine.getDrillThroughConfig().fields);
  const [frozenCount, setFrozenCount] = useState<number>(
    () => engine.getDrillThroughConfig().frozenCount,
  );
  // Popover anchor/state for the per-field format editor. `subpart` selects
  // the preset list; null means the parent date field (free date formatter).
  const [formatEditor, setFormatEditor] = useState<{
    anchor: HTMLElement | null;
    uniqueName: string | null;
    subpart: string | null;
  }>({
    anchor: null,
    uniqueName: null,
    subpart: null,
  });
  const [captionEditor, setCaptionEditor] = useState(NO_CAPTION_EDIT);

  const tFL = section(t, 'fieldsList');
  const tButtons = section(t, 'buttons');

  const captionFor = (uniqueName: string): string =>
    engine.getMetadata()[uniqueName]?.caption ||
    calcField(uniqueName)?.caption ||
    uniqueName;

  const openCaptionEditor = (target: HTMLElement, uniqueName: string) =>
    setCaptionEditor({
      anchor: target,
      uniqueName,
      value: captionFor(uniqueName),
    });

  const closeCaptionEditor = () => setCaptionEditor(NO_CAPTION_EDIT);

  const saveCaption = () => {
    if (!captionEditor.uniqueName) return;
    engine.setFieldCaption(captionEditor.uniqueName, captionEditor.value);
    closeCaptionEditor();
  };

  // A drop payload is outside data, so it may only name a field the dialog
  // could have shown.
  const isKnownField = (uniqueName: string): boolean =>
    hasOwn(engine.getMetadata(), uniqueName) || !!calcField(uniqueName);

  // The aggregations a field dragged into Values can take.
  const allowedAggsFor = (uniqueName: string): readonly string[] => {
    if (calcField(uniqueName)) return ['formula'];
    // A raw metadata row may restrict a field's aggregations; the engine's
    // metadata type does not declare the property.
    const meta = (
      engine.getMetadata() as Record<
        string,
        { availableAggregations?: string[] }
      >
    )[uniqueName];
    return meta?.availableAggregations || MEASURE_AGGREGATIONS;
  };

  // Set of uniqueNames currently used as a dimension (rows / columns / filters).
  // These remain visible in "All fields" but become non-draggable per UX spec.
  // Measures usage is intentionally excluded: the same field can be dropped
  // into measures multiple times with different aggregations.
  const usedAsDimensionSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    (slice.rows || []).forEach((f) => set.add(f.uniqueName));
    (slice.columns || []).forEach((f) => set.add(f.uniqueName));
    (slice.filters || []).forEach((f) => set.add(f.uniqueName));
    return set;
  }, [slice]);

  // A field used as a measure stays listed until each of its aggregations is
  // placed, so the user can drag it again for a Sum, an Avg, a Count … side
  // by side. The Measures axis anchor is never listed: the "Show totals"
  // toggle places it.
  const availableFields = useMemo<AvailableField[]>(() => {
    const all = engine.getAvailableFields();
    const measureAggs = new Map<string, Set<string>>();
    (slice.measures || []).forEach((m) => {
      if (!measureAggs.has(m.uniqueName))
        measureAggs.set(m.uniqueName, new Set());
      measureAggs.get(m.uniqueName)!.add(m.aggregation || '');
    });
    return all.filter((f) => {
      if (f.uniqueName === 'Measures') return false;
      // Used-as-dimension fields are kept visible (dimmed in the UI).
      if (usedAsDimensionSet.has(f.uniqueName)) return true;
      const used = measureAggs.get(f.uniqueName);
      if (!used) return true;
      const allowed = allowedAggsFor(f.uniqueName);
      return allowed.some((a) => !used.has(a));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, slice, calcFields, usedAsDimensionSet]);

  // Group synthetic date-hierarchy sub-fields ({parent}.Year/.Month/.Day/.Hour)
  // under their parent date field so the available list renders as a tree. Each
  // sub-part is independently draggable, so the user can put e.g. Year+Month
  // on rows and get two nested dimensions in the pivot layout.
  const fieldsTree = useMemo<FieldTreeNode[]>(() => {
    const meta = engine.getMetadata();
    const partsLoc = section(section(t, 'dates'), 'hierarchyParts');
    const partLabel = (p: string): string => partsLoc[p.toLowerCase()] || p;

    const childrenByParent = new Map<string, FieldTreeNode[]>();
    const leftover: FieldTreeNode[] = [];
    availableFields.forEach((f) => {
      const m = f.uniqueName.match(
        /^(.+)\.(Year|Quarter|Month|Week|Day|Weekday|Hour|Minute)$/,
      );
      if (m && meta[m[1]]?.type === 'date') {
        if (!childrenByParent.has(m[1])) childrenByParent.set(m[1], []);
        const subpart = meta[f.uniqueName]?.subpart || m[2].toLowerCase();
        childrenByParent.get(m[1])!.push({
          ...f,
          partCaption: partLabel(m[2]),
          subpart,
        });
      } else {
        leftover.push(f);
      }
    });

    const nodes: FieldTreeNode[] = [];
    leftover.forEach((f) => {
      if (meta[f.uniqueName]?.type === 'date') {
        nodes.push({
          ...f,
          isDateParent: true,
          children: childrenByParent.get(f.uniqueName) || [],
        });
        childrenByParent.delete(f.uniqueName);
      } else {
        nodes.push(f);
      }
    });
    // If the parent date has been moved to a zone, its remaining available
    // sub-parts are still surfaced as a grouped (non-draggable) header so the
    // visual hierarchy is preserved.
    childrenByParent.forEach((children, parent) => {
      nodes.push({
        uniqueName: parent,
        caption: meta[parent]?.caption || parent,
        type: 'date',
        isDateParent: true,
        parentUsed: true,
        children,
      });
    });
    // Apply user-defined ordering. Fields not in the saved order list keep
    // their natural position at the end (stable sort preserves it).
    if (fieldOrder && fieldOrder.length > 0) {
      const rank = new Map(fieldOrder.map((n, i) => [n, i]));
      nodes.sort((a, b) => {
        const ra = rank.has(a.uniqueName) ? rank.get(a.uniqueName)! : Infinity;
        const rb = rank.has(b.uniqueName) ? rank.get(b.uniqueName)! : Infinity;
        return ra - rb;
      });
    }
    return nodes;
  }, [availableFields, engine, t, fieldOrder]);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleDateExpanded = (uniqueName: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(uniqueName)) next.delete(uniqueName);
      else next.add(uniqueName);
      return next;
    });
  };

  // The "Show totals" axis is wherever the Measures anchor sits.
  const currentMeasuresAxis: 'rows' | 'columns' = (slice.rows || []).some(
    (f) => f.uniqueName === 'Measures',
  )
    ? 'rows'
    : 'columns';

  const handleMeasuresAxisChange = (
    _e: React.MouseEvent,
    value: 'rows' | 'columns' | null,
  ) => {
    if (!value || value === currentMeasuresAxis) return;
    setSliceState(
      ensureMeasuresAnchor(stripFromSlice(slice, 'Measures'), value),
    );
  };

  /**
   * Applies a drop on `zone`. `targetIdx` is the chip the payload was
   * dropped on (insert before it), or null for the zone background (append).
   */
  const addFieldToZone = (
    zone: ZoneId,
    payload: DragPayload,
    targetIdx: number | null,
  ) => {
    const { source, uniqueName } = payload;
    const sourceIdx = payload.source === 'all' ? null : payload.idx;
    // The Measures anchor's axis is set by the "Show totals" toggle alone.
    if (uniqueName === 'Measures') return;
    // Act only on a known palette field or, for a chip move, on the chip
    // that really sits at that index: anything else did not come from here.
    const moving: ZoneField | undefined =
      payload.source === 'all'
        ? { uniqueName }
        : slice[payload.source]?.[payload.idx];
    if (moving?.uniqueName !== uniqueName) return;
    if (source === 'all' && !isKnownField(uniqueName)) return;

    // When dropping into measures from elsewhere, pick the first
    // aggregation no other measure entry of the same field uses yet. With
    // all of them in use, the drop does nothing.
    let chosenAgg: string | undefined;
    if (zone === 'measures' && source !== 'measures') {
      const usedAgg = new Set(
        (slice.measures || [])
          .filter((m) => m.uniqueName === uniqueName)
          .map((m) => m.aggregation),
      );
      chosenAgg = allowedAggsFor(uniqueName).find((a) => !usedAgg.has(a));
      if (!chosenAgg) return;
    }

    const next: LocalSlice = { ...slice };
    if (source !== 'all') {
      next[source] = (next[source] || []).filter((_, i) => i !== sourceIdx);
    }
    const insertInto = (list: ZoneField[], entry: ZoneField): ZoneField[] => {
      let at = targetIdx ?? list.length;
      // Moving down within one zone: taking the chip out shifted the
      // target up by one.
      if (
        source === zone &&
        sourceIdx != null &&
        targetIdx != null &&
        sourceIdx < targetIdx
      ) {
        at = targetIdx - 1;
      }
      const out = [...list];
      out.splice(at, 0, entry);
      return out;
    };

    if (zone === 'filters') {
      // Filters never strip from rows/cols/measures and never duplicate.
      // A moved filter chip keeps its predicate, and so does a field dragged
      // in from another zone that already is a filter.
      const existing =
        source === 'filters'
          ? moving
          : (next.filters || []).find((f) => f.uniqueName === uniqueName);
      next.filters = insertInto(
        without(next.filters, uniqueName),
        existing || { uniqueName },
      );
    } else if (zone === 'measures') {
      // Measures accept one entry per aggregation of the same field, so
      // siblings stay; a field arriving from elsewhere leaves rows / cols.
      if (source !== 'measures') {
        next.rows = without(next.rows, uniqueName);
        next.columns = without(next.columns, uniqueName);
      }
      next.measures = insertInto(
        next.measures || [],
        // A reorder keeps the chip as it is (aggregation, hidden flag).
        source === 'measures'
          ? {
              ...moving,
              aggregation:
                moving.aggregation ||
                (calcField(uniqueName) ? 'formula' : 'sum'),
            }
          : { uniqueName, aggregation: chosenAgg },
      );
    } else {
      // Rows / columns: the field is a dimension here, so it leaves the
      // other axis and every measure entry.
      if (source !== zone) {
        next.rows = without(next.rows, uniqueName);
        next.columns = without(next.columns, uniqueName);
        next.measures = without(next.measures, uniqueName);
      }
      next[zone] = insertInto(without(next[zone], uniqueName), { uniqueName });
    }
    setSliceState(next);
  };

  const removeFromZone = (zone: ZoneId, idx: number) =>
    setSliceState({
      ...slice,
      [zone]: (slice[zone] || []).filter((_, i) => i !== idx),
    });

  const updateMeasure = (
    idx: number,
    patch: { aggregation?: string; hidden?: boolean },
  ) =>
    setSliceState({
      ...slice,
      measures: (slice.measures || []).map((m, i) =>
        i === idx ? { ...m, ...patch } : m,
      ),
    });

  const visibleMeasureCount = (slice.measures || []).filter(
    (m) => !m.hidden,
  ).length;
  const canApply =
    (slice.measures || []).length === 0 || visibleMeasureCount > 0;

  const handleApply = () => {
    engine.setDateFormats(dateFormats);
    engine.setFieldOrder(fieldOrder);
    engine.setDrillThroughConfig({ fields: drillThroughFields, frozenCount });
    // LocalSlice keeps every zone as ZoneField[] for uniform DnD, so
    // measures lack the engine's required `aggregation` at the type level;
    // the zone handlers always set it before Apply.
    engine.setSlice(slice as Partial<InternalSlice>);
    onClose?.();
  };

  // Move `uniqueName` to the slot immediately before `targetUniqueName` in the
  // local `fieldOrder` draft. The order array is rebuilt from the current
  // tree so untouched fields keep their displayed position even before the
  // first explicit reorder.
  const reorderFieldList = (
    uniqueName: string,
    targetUniqueName: string | null,
  ) => {
    if (!uniqueName || uniqueName === targetUniqueName) return;
    if (!isKnownField(uniqueName)) return;
    const currentOrder = fieldsTree.map((n) => n.uniqueName);
    const order = currentOrder.filter((n) => n !== uniqueName);
    let insertAt = targetUniqueName
      ? order.indexOf(targetUniqueName)
      : order.length;
    if (insertAt < 0) insertAt = order.length;
    order.splice(insertAt, 0, uniqueName);
    setFieldOrder(order);
  };

  // Palette rows, and the list background, are drop targets for reordering
  // the list itself: insert before `target`, or append for null.
  const reorderDropProps = (target: string | null) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = readDragPayload(e);
      if (payload?.source === 'all') {
        reorderFieldList(payload.uniqueName, target);
      }
    },
  });

  const toggleDrillThroughField = (uniqueName: string) => {
    setDrillThroughFields((prev) => {
      const current = prev[uniqueName];
      const wasOn = current === undefined ? true : !!current;
      const next = { ...prev, [uniqueName]: !wasOn };
      return next;
    });
  };

  const isDrillThroughOn = (uniqueName: string): boolean => {
    const v = drillThroughFields[uniqueName];
    return v === undefined ? true : !!v;
  };

  const updateDateFormat = (
    uniqueName: string,
    format: string,
    subpart: string | null,
  ) => {
    setDateFormats((prev) => {
      const next = { ...prev };
      const def = defaultFormatFor(subpart || null);
      if (!format || format === def) delete next[uniqueName];
      else next[uniqueName] = format;
      return next;
    });
  };

  const calculatedIcon = (
    <Tooltip title={tFL.calculatedFieldTooltip || 'Calculated field'}>
      <CalculateIcon fontSize="small" sx={{ color: 'primary.main' }} />
    </Tooltip>
  );

  const renameAction = (uniqueName: string) => (
    <RowAction
      title={tFL.renameField || 'Rename field'}
      onClick={(e) => openCaptionEditor(e.currentTarget, uniqueName)}
    >
      <EditIcon fontSize="inherit" />
    </RowAction>
  );

  const dateFormatAction = (uniqueName: string, subpart: string | null) => (
    <RowAction
      title={tFL.dateFormat || 'Date format'}
      onClick={(e) =>
        setFormatEditor({ anchor: e.currentTarget, uniqueName, subpart })
      }
    >
      <TuneIcon fontSize="inherit" />
    </RowAction>
  );

  const drillThroughToggle = (uniqueName: string) => (
    <Tooltip title={tFL.showInDrillThrough || 'Show in drill-through'}>
      <Checkbox
        size="small"
        checked={isDrillThroughOn(uniqueName)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          e.stopPropagation();
          toggleDrillThroughField(uniqueName);
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        sx={{ p: '2px' }}
      />
    </Tooltip>
  );

  // Shared by a calculated field's measure chip and its palette row.
  const calcFieldActions = (calc: InternalCalculatedField) => (
    <>
      <RowAction
        title={tButtons.edit || 'Edit'}
        onClick={() => setCalcDialog({ open: true, editField: calc })}
      >
        <EditIcon fontSize="inherit" />
      </RowAction>
      <RowAction
        title={tButtons.delete || 'Delete'}
        color="error.main"
        onClick={() => {
          // Deleting commits at once, like the nested dialog's edits. The
          // engine strips the field from its own slice; the draft must
          // follow, or Apply would write the dangling reference back.
          engine.removeCalculatedField(calc.uniqueName);
          setSliceState((prev) => stripFromSlice(prev, calc.uniqueName));
        }}
      >
        <DeleteOutlineIcon fontSize="inherit" />
      </RowAction>
    </>
  );

  const measureChip = (item: ZoneField, idx: number): React.ReactElement => {
    const isHidden = !!item.hidden;
    const calc = calcField(item.uniqueName);
    const allowed: readonly string[] = calc
      ? ['formula']
      : item.availableAggregations || MEASURE_AGGREGATIONS;
    // A field can appear multiple times in measures — one entry per
    // aggregation — so hide from this chip's dropdown the aggregations
    // that sibling chips of the same field have already consumed.
    const usedBySiblings = new Set(
      (slice.measures || [])
        .filter((m, i) => m.uniqueName === item.uniqueName && i !== idx)
        .map((m) => m.aggregation),
    );
    const selectable = allowed.filter(
      (a) => a === item.aggregation || !usedBySiblings.has(a),
    );
    return (
      <Chip
        onDelete={() => removeFromZone('measures', idx)}
        deleteIcon={<DeleteOutlineIcon />}
        sx={{
          borderRadius: 2,
          height: 'auto',
          py: 0.5,
          opacity: isHidden ? 0.55 : 1,
          textDecoration: isHidden ? 'line-through' : 'none',
        }}
        label={
          <Stack direction="row" sx={{ alignItems: 'center' }} spacing={0.5}>
            <RowAction
              title={
                isHidden
                  ? tFL.showMeasure || 'Show measure'
                  : tFL.hideMeasure || 'Hide measure'
              }
              onClick={() => updateMeasure(idx, { hidden: !isHidden })}
            >
              {isHidden ? (
                <VisibilityOffIcon fontSize="inherit" />
              ) : (
                <VisibilityIcon fontSize="inherit" />
              )}
            </RowAction>
            {calc && calculatedIcon}
            <Typography
              variant="caption"
              sx={(theme) => ({
                fontWeight: theme.typography.caption.fontWeight,
              })}
            >
              {captionFor(item.uniqueName)}
            </Typography>
            <Select
              value={item.aggregation || ''}
              onChange={(e) =>
                updateMeasure(idx, { aggregation: String(e.target.value) })
              }
              variant="standard"
              disableUnderline
              sx={(theme) => ({
                fontSize: theme.typography.fontSize,
                '& .MuiSelect-select': { py: 0 },
              })}
            >
              {selectable.map((a) => (
                <MenuItem key={a} value={a} dense>
                  {aggregationLabel(t, a)}
                </MenuItem>
              ))}
            </Select>
            {calc && calcFieldActions(calc)}
          </Stack>
        }
      />
    );
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="md"
        container={portalContainer}
      >
        <DialogHeader
          title={tFL.title || 'Fields'}
          subtitle={tFL.subtitle || 'Drag and drop fields to arrange them'}
          onClose={onClose}
        />
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexWrap: 'wrap',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, opacity: 0.75 }}
                >
                  {tFL.allFields || 'All fields'}
                </Typography>
                <Tooltip
                  arrow
                  placement="top"
                  title={
                    tFL.drillThroughOrder ||
                    'Tick a field to include it in the drill-through table. Drag rows to reorder — the order here is the column order in the drill-through.'
                  }
                >
                  <InfoOutlinedIcon
                    sx={(theme) => ({
                      fontSize: theme.typography.caption.fontSize,
                      opacity: 0.65,
                      cursor: 'help',
                    })}
                  />
                </Tooltip>
              </Box>
              <Box
                {...reorderDropProps(null)}
                sx={(theme) => ({
                  mt: 0.75,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  p: 1,
                  overflowY: 'auto',
                })}
              >
                {availableFields.length === 0 && (
                  <Typography
                    variant="body2"
                    sx={{ opacity: 0.5, fontStyle: 'italic' }}
                  >
                    —
                  </Typography>
                )}
                <Stack sx={{ gap: 0 }}>
                  {fieldsTree.map((f) => {
                    const used = usedAsDimensionSet.has(f.uniqueName);
                    if (f.isDateParent) {
                      const isExpanded = expandedDates.has(f.uniqueName);
                      const draggable = !f.parentUsed && !used;
                      return (
                        <Box key={f.uniqueName} sx={{ mt: '4px' }}>
                          <PaletteRow
                            uniqueName={f.uniqueName}
                            used={used}
                            draggable={draggable}
                            leading={
                              <RowAction
                                onClick={() => toggleDateExpanded(f.uniqueName)}
                              >
                                {isExpanded ? (
                                  <ExpandMoreIcon fontSize="inherit" />
                                ) : (
                                  <ChevronRightIcon fontSize="inherit" />
                                )}
                              </RowAction>
                            }
                            dropProps={reorderDropProps(f.uniqueName)}
                            sx={(theme) => ({
                              px: 1,
                              margin: theme.spacing(0.5, 0, 0.5, 2),
                              ...(!draggable && {
                                backgroundColor: 'transparent',
                                '&:hover': {
                                  backgroundColor: theme.palette.action.hover,
                                },
                              }),
                            })}
                          >
                            <CalendarMonthIcon
                              fontSize="small"
                              sx={{ color: 'primary.main', opacity: 0.7 }}
                            />
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {f.caption}
                            </Typography>
                            {renameAction(f.uniqueName)}
                            {dateFormatAction(f.uniqueName, null)}
                            {drillThroughToggle(f.uniqueName)}
                          </PaletteRow>
                          {isExpanded &&
                            (f.children || []).map((c) => (
                              <PaletteRow
                                key={c.uniqueName}
                                uniqueName={c.uniqueName}
                                used={usedAsDimensionSet.has(c.uniqueName)}
                                sx={{ pl: 4, pr: 1, mt: '4px' }}
                              >
                                <Typography variant="body2" sx={{ flex: 1 }}>
                                  {c.partCaption}
                                </Typography>
                                {renameAction(c.uniqueName)}
                                {SUBPART_CONFIGURABLE.has(c.subpart || '') &&
                                  dateFormatAction(
                                    c.uniqueName,
                                    c.subpart || null,
                                  )}
                              </PaletteRow>
                            ))}
                        </Box>
                      );
                    }
                    const calc = f.isCalculated
                      ? calcField(f.uniqueName)
                      : undefined;
                    return (
                      <PaletteRow
                        key={f.uniqueName}
                        uniqueName={f.uniqueName}
                        used={used}
                        dropProps={reorderDropProps(f.uniqueName)}
                        sx={(theme) => {
                          const accent =
                            theme.palette.tertiary?.main ||
                            theme.palette.primary.main;
                          return {
                            px: 1,
                            mt: '4px',
                            ...(f.isCalculated && {
                              backgroundColor: accent + '18',
                              border: `1px solid ${accent}40`,
                            }),
                          };
                        }}
                      >
                        {f.isCalculated && calculatedIcon}
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {f.caption}
                        </Typography>
                        {f.isCalculated ? (
                          calc && calcFieldActions(calc)
                        ) : (
                          <>
                            {renameAction(f.uniqueName)}
                            {drillThroughToggle(f.uniqueName)}
                          </>
                        )}
                      </PaletteRow>
                    );
                  })}
                </Stack>
              </Box>

              <Button
                size="large"
                startIcon={<CalculateIcon />}
                onClick={() => setCalcDialog({ open: true, editField: null })}
                sx={{ mt: 1, width: '100%', justifyContent: 'flex-start' }}
              >
                {tFL.addCalculated || 'Add calculated value'}
              </Button>

              <Box sx={{ mt: 1.5 }}>
                <NumericField
                  fullWidth
                  size="small"
                  min={0}
                  step={1}
                  value={frozenCount}
                  onChange={(v) => setFrozenCount(v)}
                  label={
                    tFL.drillThroughStickyColumns ||
                    'Frozen drill-through columns'
                  }
                  helperText={
                    tFL.drillThroughStickyColumnsHelp ||
                    'Number of left-pinned columns'
                  }
                />
              </Box>
            </Box>

            <Box>
              <Box
                style={{ alignItems: 'center' }}
                sx={{
                  display: 'flex',
                  gap: 1,
                  mb: 1.25,
                  flexWrap: 'wrap',
                }}
              >
                <FunctionsIcon
                  fontSize="small"
                  sx={{ color: 'primary.main' }}
                />
                <Typography
                  variant="caption"
                  sx={(theme) => ({
                    fontWeight: theme.typography.h6.fontWeight,
                  })}
                >
                  {tFL.showTotals || 'Show totals'}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={currentMeasuresAxis}
                  onChange={handleMeasuresAxisChange}
                  sx={{ ml: 'auto' }}
                >
                  <ToggleButton
                    value="rows"
                    sx={{ textTransform: 'none', py: 0.25 }}
                  >
                    {tFL.perRow || 'Per row'}
                  </ToggleButton>
                  <ToggleButton
                    value="columns"
                    sx={{ textTransform: 'none', py: 0.25 }}
                  >
                    {tFL.perColumn || 'Per column'}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Stack sx={{ gap: 1.25 }}>
                {ZONES.map((zone) => (
                  <DropZone
                    key={zone.id}
                    zone={zone.id}
                    items={slice[zone.id] || []}
                    label={tFL[zone.labelKey] || zone.id}
                    dropHint={tFL.dropField || 'Drop field here'}
                    onDrop={addFieldToZone}
                    renderItem={(item, idx) =>
                      zone.id === 'measures' ? (
                        measureChip(item, idx)
                      ) : (
                        <Chip
                          label={captionFor(item.uniqueName)}
                          size="small"
                          onDelete={() => removeFromZone(zone.id, idx)}
                          deleteIcon={<DeleteOutlineIcon />}
                          sx={{ borderRadius: 2 }}
                        />
                      )
                    }
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions style={{ padding: 16 }}>
          {!canApply && (
            <Typography
              variant="caption"
              sx={{ color: 'error.main', mr: 'auto' }}
            >
              {tFL.atLeastOneVisibleMeasure ||
                'At least one measure must be visible.'}
            </Typography>
          )}
          <Button onClick={onClose}>{tButtons.cancel || 'Cancel'}</Button>
          <Button
            onClick={handleApply}
            variant="contained"
            disabled={!canApply}
          >
            {tButtons.apply || 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>
      <CalculatedFieldDialog
        open={calcDialog.open}
        editField={calcDialog.editField}
        onClose={() => setCalcDialog({ open: false, editField: null })}
      />
      <DateFormatPopover
        anchor={formatEditor.anchor}
        uniqueName={formatEditor.uniqueName}
        subpart={formatEditor.subpart}
        value={
          (formatEditor.uniqueName && dateFormats[formatEditor.uniqueName]) ||
          defaultFormatFor(formatEditor.subpart)
        }
        onChange={(fmt) =>
          formatEditor.uniqueName &&
          updateDateFormat(formatEditor.uniqueName, fmt, formatEditor.subpart)
        }
        onClose={() =>
          setFormatEditor({ anchor: null, uniqueName: null, subpart: null })
        }
        t={t}
      />
      <Popover
        open={!!captionEditor.anchor && !!captionEditor.uniqueName}
        anchorEl={captionEditor.anchor}
        onClose={closeCaptionEditor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        container={portalContainer}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, opacity: 0.75, display: 'block', mb: 1 }}
          >
            {tFL.renameField || 'Rename field'}
          </Typography>
          <TextField
            size="small"
            fullWidth
            // The rename popover exists to take this input; focus moves into
            // it on open, as in a dialog.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={captionEditor.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCaptionEditor((s) => ({ ...s, value: e.target.value }))
            }
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') saveCaption();
              if (e.key === 'Escape') closeCaptionEditor();
            }}
          />
          <Stack
            direction="row"
            sx={{ justifyContent: 'flex-end', gap: 1, mt: 1 }}
          >
            <Button size="small" onClick={closeCaptionEditor}>
              {tButtons.cancel || 'Cancel'}
            </Button>
            <Button size="small" variant="contained" onClick={saveCaption}>
              {tButtons.save || 'Save'}
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
};

export default withOpenSession(FieldListBody);
