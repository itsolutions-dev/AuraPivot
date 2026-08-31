import React, { useMemo, useState } from "react";

import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Chip,
  Typography,
  Divider,
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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import CalculateIcon from "@mui/icons-material/Calculate";
import FunctionsIcon from "@mui/icons-material/Functions";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TuneIcon from "@mui/icons-material/Tune";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { usePivot } from "../../context/PivotContext";
import { usePortalContainer } from "../../hooks/usePortalContainer";
import useEngineVersion from "../../hooks/useEngineVersion";
import CalculatedFieldDialog from "../CalculatedFieldDialog/CalculatedFieldDialog";
import type { InternalSlice } from "../../pivot-core/PivotEngine";

/**
 * Drag-and-drop configuration panel for rows, columns, measures and filters.
 * The UI is modeled after the auraPivot field list dialog but is built on
 * MUI primitives
 * and dark-mode palette automatically.
 *
 * Drag-and-drop is implemented with the native HTML5 DnD API to avoid pulling
 * in a heavyweight dnd library.
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface InternalSliceField {
  uniqueName: string;
  sort?: string;
  aggregation?: string;
  hidden?: boolean;
  availableAggregations?: string[];
  fieldSort?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Local mutable slice shape used by the drag-and-drop editor.
 * Kept separate from PivotEngine's InternalSlice because the DnD logic
 * treats all zone arrays uniformly as InternalSliceField[]. */
interface LocalSlice {
  rows?: InternalSliceField[];
  columns?: InternalSliceField[];
  measures?: InternalSliceField[];
  filters?: InternalSliceField[];
  [key: string]: unknown;
}

interface AvailableField {
  uniqueName: string;
  caption?: string;
  isCalculated?: boolean;
  type?: string;
  availableAggregations?: string[];
}

interface CalculatedField {
  uniqueName: string;
  caption?: string;
  formula?: string;
}

interface FieldTreeNode extends AvailableField {
  isDateParent?: boolean;
  isDatePart?: boolean;
  parentUsed?: boolean;
  partKey?: string;
  partCaption?: string;
  subpart?: string;
  children?: FieldTreeNode[];
}

interface DragPayload {
  source: string;
  uniqueName: string;
  idx?: number;
  aggregation?: string;
}

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
  measuresAxis?: "rows" | "columns";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATION_LABELS_FALLBACK: Record<string, string> = {
  sum: "Sum",
  count: "Count",
  distinctCount: "Distinct count",
  avg: "Average",
  min: "Min",
  max: "Max",
  ratioTotal: "Ratio to total",
  currentRatio: "Current ratio",
};

/**
 * The auraPivot localization schema stores aggregation entries as objects
 * (`{ caption, totalCaption, grandTotalCaption }`) and uses camelCase keys
 * (`distinctCount`, `average`). Map our internal keys onto that schema and
 * unwrap the caption so React never receives an object as a child.
 */
const WDR_AGGREGATION_KEY: Record<string, string> = {
  sum: "sum",
  count: "count",
  distinctCount: "distinctCount",
  avg: "average",
  min: "min",
  max: "max",
  ratioTotal: "ratioTotal",
  currentRatio: "currentRatio",
};

const resolveAggregationLabel = (
  t: Record<string, unknown>,
  aggregation: string,
): string => {
  const wdrKey = WDR_AGGREGATION_KEY[aggregation] || aggregation;
  const tagg =
    (t as Record<string, Record<string, unknown>>)?.aggregations ?? {};
  const entry = tagg[aggregation] ?? tagg[wdrKey];
  if (entry && typeof entry === "object") {
    return (
      (entry as Record<string, string>).caption ||
      AGGREGATION_LABELS_FALLBACK[aggregation] ||
      aggregation
    );
  }
  return (
    (entry as string) || AGGREGATION_LABELS_FALLBACK[aggregation] || aggregation
  );
};

const ZONES: { id: string; labelKey: string }[] = [
  { id: "filters", labelKey: "filters" },
  { id: "rows", labelKey: "rows" },
  { id: "columns", labelKey: "columns" },
  { id: "measures", labelKey: "values" },
];

/**
 * Stable React key for a slice entry. The measures zone may hold the same
 * field several times with different aggregations, so the aggregation is
 * part of the identity — never the array index, since every zone is
 * drag-reorderable.
 */
const chipKey = (item: InternalSliceField): string =>
  item.aggregation ? `${item.uniqueName}:${item.aggregation}` : item.uniqueName;

/**
 * Parses a drag payload. Existing chips send a JSON blob with source zone +
 * index; items coming from the "all fields" list send a plain uniqueName for
 * backward compatibility (a bare uniqueName is not JSON, so the parse failure
 * is the expected path for those — not an error worth logging).
 */
const parseDragPayload = (raw: string): DragPayload | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as Record<string, unknown>).uniqueName
    )
      return parsed as DragPayload;
  } catch {
    // fall through: plain-uniqueName payload from the "all fields" list.
  }
  return { source: "all", uniqueName: raw };
};

// ---------------------------------------------------------------------------
// Date format presets
// ---------------------------------------------------------------------------

const DATE_FORMAT_PRESETS: DateFormatEntry[] = [
  {
    value: "locale-date",
    labelKey: "localeDate",
    fallback: "Browser locale (date)",
  },
  {
    value: "locale-datetime",
    labelKey: "localeDateTime",
    fallback: "Browser locale (date & time)",
  },
  { value: "iso", labelKey: "iso", fallback: "ISO (yyyy-MM-dd HH:mm:ss)" },
  { value: "iso-date", labelKey: "isoDate", fallback: "ISO date (yyyy-MM-dd)" },
  { value: "custom", labelKey: "custom", fallback: "Custom pattern…" },
];

// Per-subpart preset lists + defaults. Keyed by the metadata.subpart value.
const SUBPART_PRESETS: Record<string, { value: string; fallback: string }[]> = {
  month: [
    { value: "name-full", fallback: "Full name (January)" },
    { value: "name-short", fallback: "Short name (Jan)" },
    { value: "number", fallback: "Number (1)" },
    { value: "number-padded", fallback: "Padded number (01)" },
  ],
  quarter: [
    { value: "long", fallback: "Long (Quarter 1)" },
    { value: "short", fallback: "Short (Q1)" },
    { value: "number", fallback: "Number (1)" },
  ],
  weekday: [
    { value: "name-full", fallback: "Full name (Monday)" },
    { value: "name-short", fallback: "Short name (Mon)" },
  ],
  week: [
    { value: "number", fallback: "Number (1)" },
    { value: "long", fallback: "Long (Week 1)" },
  ],
};

const SUBPART_DEFAULTS: Record<string, string> = {
  month: "name-full",
  quarter: "long",
  weekday: "name-full",
  week: "number",
};

const SUBPART_CONFIGURABLE = new Set(Object.keys(SUBPART_PRESETS));

const defaultFormatFor = (subpart: string | null): string | null =>
  subpart ? SUBPART_DEFAULTS[subpart] || null : "locale-date";

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
  // dynamic boundary: localization is Record<string,unknown>
  const tFL = (t as Record<string, Record<string, unknown>>)?.fieldsList ?? {};
  const isSubpart = !!(subpart && SUBPART_PRESETS[subpart]);
  const subpartPresets = isSubpart ? SUBPART_PRESETS[subpart!] : null;
  const subpartLabel = (p: { value: string; fallback: string }): string =>
    (
      tFL.subpartFormats as Record<string, Record<string, string>> | undefined
    )?.[subpart!]?.[p.value] || p.fallback;

  const dateLabel = (p: DateFormatEntry): string =>
    (tFL.dateFormats as Record<string, string> | undefined)?.[
      p.labelKey || ""
    ] || p.fallback;

  // For the free date formatter: any non-preset value = custom pattern.
  const datePresetValues = new Set(
    DATE_FORMAT_PRESETS.filter((p) => p.value !== "custom").map((p) => p.value),
  );
  const dateIsPreset = datePresetValues.has(value || "");
  const dateMode = dateIsPreset ? value || "" : "custom";
  const datePattern = dateIsPreset ? "" : value || "";

  return (
    <Popover
      open={!!anchor && !!uniqueName}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      container={portalContainer}
    >
      <Box sx={{ p: 2, width: 280 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.75 }}>
          {(tFL.dateFormat as string | undefined) || "Date format"}
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
                if (next === "custom") {
                  onChange(datePattern || "dd/MM/yyyy");
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
            {dateMode === "custom" && (
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
                  (tFL.dateFormatHelp as string | undefined) ||
                  "Tokens: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H mm m ss s"
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
  size?: "small" | "medium";
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
  size = "small",
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
                "&:hover": {
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
                "&:hover": {
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
          inputMode: "numeric",
          style: {
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
            MozAppearance: "textfield",
          },
        }}
        sx={{
          "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
            {
              WebkitAppearance: "none",
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
  zone: string;
  items: InternalSliceField[];
  label: string;
  dropHint: string;
  onDrop: (
    zone: string,
    payload: DragPayload,
    targetIdx: number | null,
  ) => void;
  renderItem: (item: InternalSliceField, idx: number) => React.ReactNode;
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

  return (
    <Box
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setOver(false);
        const payload = parseDragPayload(e.dataTransfer.getData("text/plain"));
        if (payload) onDrop(zone, payload, null);
      }}
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
        transition: "all 150ms ease",
      })}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, opacity: 0.75, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Stack direction="row" sx={{ gap: 0, flexWrap: "wrap", mt: 0.75 }}>
        {items.length === 0 && (
          <Typography
            variant="body2"
            sx={{ opacity: 0.5, fontStyle: "italic" }}
          >
            {dropHint}
          </Typography>
        )}
        {items.map((item, idx) => {
          // Each chip is both a drag source (to move to another zone) and a
          // drop target (to reorder / insert at a specific position).
          const dragProps = {
            draggable: true as const,
            onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                "text/plain",
                JSON.stringify({
                  source: zone,
                  uniqueName: item.uniqueName,
                  idx,
                }),
              );
              e.dataTransfer.effectAllowed = "move";
            },
            onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            },
            onDrop: (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              const payload = parseDragPayload(
                e.dataTransfer.getData("text/plain"),
              );
              if (payload) onDrop(zone, payload, idx);
            },
          };
          return (
            <Box
              key={chipKey(item)}
              sx={{
                cursor: "grab",
                mr: "4px",
                mt: "4px",
                "&:active": { cursor: "grabbing" },
              }}
              {...dragProps}
            >
              {renderItem(item, idx)}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Main FieldList component
// ---------------------------------------------------------------------------

/** The measure axis needs an anchor field on one of the two zones. */
const ensureMeasuresAnchor = (
  s: LocalSlice,
  measuresAxis: FieldListProps["measuresAxis"],
): LocalSlice => {
  const inRows = (s.rows || []).some((f) => f.uniqueName === "Measures");
  const inCols = (s.columns || []).some((f) => f.uniqueName === "Measures");
  if (inRows || inCols) return s;
  // Default placement honors the `measuresAxis` prop; columns otherwise.
  if (measuresAxis === "rows") {
    return { ...s, rows: [...(s.rows || []), { uniqueName: "Measures" }] };
  }
  return { ...s, columns: [...(s.columns || []), { uniqueName: "Measures" }] };
};

/** Drop a field from every zone of the local draft slice. */
const stripFromSlice = (s: LocalSlice, uniqueName: string): LocalSlice => ({
  ...s,
  rows: (s.rows || []).filter((f) => f.uniqueName !== uniqueName),
  columns: (s.columns || []).filter((f) => f.uniqueName !== uniqueName),
  measures: (s.measures || []).filter((f) => f.uniqueName !== uniqueName),
  filters: (s.filters || []).filter((f) => f.uniqueName !== uniqueName),
});

const FieldListBody = function FieldListBody({
  open,
  onClose,
  measuresAxis,
}: FieldListProps): React.ReactElement {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  // Every draft below is seeded once, on mount: the wrapper remounts this
  // body each time the dialog opens, so there is no reset effect and an
  // engine event can never overwrite an edit the user has not applied yet.
  const [slice, setSliceState] = useState<LocalSlice>(() =>
    ensureMeasuresAnchor(
      engine.getSlice() as unknown as LocalSlice,
      measuresAxis,
    ),
  );
  const [calcDialog, setCalcDialog] = useState<{
    open: boolean;
    editField: CalculatedField | null;
  }>({
    open: false,
    editField: null,
  });

  // Calculated fields are the exception: the nested CalculatedFieldDialog
  // commits them to the engine immediately, so they are read back rather
  // than drafted.
  const engineVersion = useEngineVersion(engine);
  const calcFields = useMemo<CalculatedField[]>(
    () => engine.getCalculatedFields(),
    [engine, engineVersion],
  );

  // Local draft of per-date-field formats. Committed to the engine on Apply.
  const [dateFormats, setDateFormats] = useState<Record<string, string>>(
    () => engine.getDateFormats(),
  );
  // Local drafts for the "All fields" reorder and the drill-through config.
  // Persisted on Apply via engine.setFieldOrder / setDrillThroughConfig.
  const [fieldOrder, setFieldOrder] = useState<string[]>(
    () => engine.getFieldOrder(),
  );
  const [drillThroughFields, setDrillThroughFields] = useState<
    Record<string, boolean | undefined>
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
  const [captionEditor, setCaptionEditor] = useState<{
    anchor: HTMLElement | null;
    uniqueName: string | null;
    value: string;
  }>({
    anchor: null,
    uniqueName: null,
    value: "",
  });

  // dynamic boundary: localization is Record<string,unknown>
  const tFL = (t as Record<string, Record<string, string>>)?.fieldsList ?? {};
  const tButtons = (t as Record<string, Record<string, string>>)?.buttons ?? {};

  const openCaptionEditor = (target: HTMLElement, uniqueName: string) => {
    const meta = engine.getMetadata()[
      uniqueName
    ];
    const calc = calcFields.find((c) => c.uniqueName === uniqueName);
    const current = meta?.caption || calc?.caption || uniqueName;
    setCaptionEditor({ anchor: target, uniqueName, value: current });
  };

  const saveCaption = () => {
    if (!captionEditor.uniqueName) return;
    engine.setFieldCaption(
      captionEditor.uniqueName,
      captionEditor.value,
    );
    setCaptionEditor({ anchor: null, uniqueName: null, value: "" });
  };

  // Filter-slot fields are intentionally NOT removed from the available list:
  // a user may want the same dimension both as a page-level filter AND as a
  // row/column/measure. Rows/columns/measures, on the other hand, are mutually
  // exclusive because a field can only occupy one of those slots at a time.
  //
  // The "Valori" axis-anchor field (uniqueName === 'Measures') is hidden from
  // the available list and from the row/column chips: its placement is now
  // controlled by the "Mostra i totali" toggle below.
  // A field stays in the palette until every one of its supported
  // aggregations has been placed in the measures zone — so the user can drag
  // the same field multiple times to get a Sum, an Avg, a Count … side by
  // side. Rows / columns still consume the field exclusively.
  const DEFAULT_NUMERIC_AGGS = [
    "sum",
    "count",
    "distinctCount",
    "avg",
    "min",
    "max",
    "ratioTotal",
    "currentRatio",
  ];
  const allowedAggsFor = (uniqueName: string): string[] => {
    if (calcFields.some((c) => c.uniqueName === uniqueName)) return ["formula"];
    const meta = (
      engine.getMetadata() as Record<
        string,
        { availableAggregations?: string[] }
      >
    )[uniqueName];
    return meta?.availableAggregations || DEFAULT_NUMERIC_AGGS;
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

  const availableFields = useMemo<AvailableField[]>(() => {
    const all = engine.getAvailableFields() as AvailableField[];
    const measureAggs = new Map<string, Set<string>>();
    (slice.measures || []).forEach((m) => {
      if (!measureAggs.has(m.uniqueName))
        measureAggs.set(m.uniqueName, new Set());
      measureAggs.get(m.uniqueName)!.add(m.aggregation || "");
    });
    return all.filter((f) => {
      if (f.uniqueName === "Measures") return false;
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
    const meta = engine.getMetadata() as Record<
      string,
      { type?: string; caption?: string; subpart?: string }
    >;
    const partsLoc =
      (t as Record<string, Record<string, Record<string, string>>>)?.dates
        ?.hierarchyParts || {};
    const partLabel = (p: string): string => partsLoc[p.toLowerCase()] || p;

    const childrenByParent = new Map<string, FieldTreeNode[]>();
    const leftover: FieldTreeNode[] = [];
    availableFields.forEach((f) => {
      const m = f.uniqueName.match(
        /^(.+)\.(Year|Quarter|Month|Week|Day|Weekday|Hour|Minute)$/,
      );
      if (m && meta[m[1]]?.type === "date") {
        if (!childrenByParent.has(m[1])) childrenByParent.set(m[1], []);
        const subpart = meta[f.uniqueName]?.subpart || m[2].toLowerCase();
        childrenByParent.get(m[1])!.push({
          ...f,
          isDatePart: true,
          partKey: m[2],
          partCaption: partLabel(m[2]),
          subpart,
        });
      } else {
        leftover.push(f as FieldTreeNode);
      }
    });

    const nodes: FieldTreeNode[] = [];
    leftover.forEach((f) => {
      if (meta[f.uniqueName]?.type === "date") {
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

  // Derive the current "Mostra i totali" axis from the slice. The Measures
  // anchor lives on either rows or columns; default to columns when missing.
  const currentMeasuresAxis = useMemo<"rows" | "columns">(() => {
    if ((slice.rows || []).some((f) => f.uniqueName === "Measures"))
      return "rows";
    return "columns";
  }, [slice]);

  const handleMeasuresAxisChange = (
    _e: React.MouseEvent,
    value: string | null,
  ) => {
    if (!value || value === currentMeasuresAxis) return;
    const next = { ...slice };
    next.rows = (next.rows || []).filter((f) => f.uniqueName !== "Measures");
    next.columns = (next.columns || []).filter(
      (f) => f.uniqueName !== "Measures",
    );
    const anchor: InternalSliceField = { uniqueName: "Measures" };
    if (value === "rows") {
      next.rows = [...next.rows, anchor];
    } else {
      next.columns = [...next.columns, anchor];
    }
    setSliceState(next);
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    uniqueName: string,
  ) => {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ source: "all", uniqueName }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  /**
   * Handles every drop inside the configuration grid. Payload shape:
   *   { source: 'all' | 'rows' | 'columns' | 'measures' | 'filters',
   *     uniqueName: string,
   *     idx?: number,              // index in `source` zone (chip moves)
   *     aggregation?: string }     // preserved when moving a measure around
   *
   * `targetIdx` is the index of the chip the payload was dropped ON (insert
   * before) or `null` when dropped on the zone background (append).
   */
  const addFieldToZone = (
    zone: string,
    payload: DragPayload,
    targetIdx: number | null,
  ) => {
    const { source, uniqueName, idx: sourceIdx } = payload;
    // The "Valori" anchor is no longer drag-and-droppable from the field list:
    // its axis is governed exclusively by the "Mostra i totali" toggle.
    if (uniqueName === "Measures") return;

    // --- Pre-validate measure capacity --------------------------------
    // When dropping into measures from a non-measures source, pick the
    // first aggregation not yet consumed by another measure entry of the
    // same field. If all supported aggregations are in use, abort before
    // mutating any slice zone.
    let chosenAgg: string | null = null;
    if (zone === "measures" && source !== "measures") {
      const allowed = allowedAggsFor(uniqueName);
      const usedAgg = new Set(
        (slice.measures || [])
          .filter((m) => m.uniqueName === uniqueName)
          .map((m) => m.aggregation),
      );
      chosenAgg = allowed.find((a) => !usedAgg.has(a)) ?? null;
      if (!chosenAgg) return;
    }

    const next = { ...slice } as LocalSlice &
      Record<string, InternalSliceField[]>;
    const pop = (
      list: InternalSliceField[] | undefined,
      name: string,
    ): InternalSliceField[] =>
      (list || []).filter((f) => f.uniqueName !== name);
    const popAt = (
      list: InternalSliceField[] | undefined,
      i: number,
    ): InternalSliceField[] => (list || []).filter((_, j) => j !== i);

    // Pull the source entry out of its current zone (if any) so we can
    // re-use its aggregation / metadata when re-inserting.
    let moving: InternalSliceField = { uniqueName };
    if (source && source !== "all" && next[source]) {
      const arr: InternalSliceField[] =
        (next[source] as InternalSliceField[]) || [];
      const entry = arr[sourceIdx ?? -1];
      if (entry && entry.uniqueName === uniqueName) moving = { ...entry };
      next[source] = popAt(arr, sourceIdx ?? -1);
    }

    // Build the entry to insert based on the target zone.
    let entry: InternalSliceField = moving;
    if (zone === "measures") {
      // On measures → measures reorder preserve the source aggregation.
      // Otherwise use the pre-picked chosenAgg (guaranteed unique per field).
      entry = {
        uniqueName,
        aggregation:
          source === "measures"
            ? moving.aggregation ||
              (calcFields.some((c) => c.uniqueName === uniqueName)
                ? "formula"
                : "sum")
            : chosenAgg!,
      };
    } else if (zone === "filters") {
      // Preserve any existing predicate: if the chip came from filters itself,
      // `moving` already carries it (popAt removed it). Otherwise look it up
      // in the current filters list (cross-zone drag of a field that also
      // happened to be a page-level filter).
      if (source === "filters") {
        entry = moving;
      } else {
        const existing = (next.filters || []).find(
          (f) => f.uniqueName === uniqueName,
        );
        entry = existing || { uniqueName };
      }
    } else {
      entry = { uniqueName };
    }

    if (zone === "filters") {
      // Filters never strip from rows/cols/measures and never duplicate.
      const current = (next.filters || []).filter(
        (f) => f.uniqueName !== uniqueName,
      );
      let insertAt = targetIdx == null ? current.length : targetIdx;
      if (
        source === "filters" &&
        sourceIdx != null &&
        targetIdx != null &&
        sourceIdx < targetIdx
      ) {
        // Compensate for the removal offset when moving downward in the same list.
        insertAt = Math.max(0, targetIdx - 1);
      }
      current.splice(insertAt, 0, entry);
      next.filters = current;
    } else if (zone === "measures") {
      // Measures accept multiple entries of the same field (one per
      // aggregation). Strip only from rows/cols when the field arrives
      // from the palette or a cross-zone move. Keep siblings in measures.
      if (
        source === "all" ||
        source === "filters" ||
        source === "rows" ||
        source === "columns"
      ) {
        next.rows = pop(next.rows, uniqueName);
        next.columns = pop(next.columns, uniqueName);
      }
      const current = [...(next.measures || [])];
      let insertAt = targetIdx == null ? current.length : targetIdx;
      if (
        source === "measures" &&
        sourceIdx != null &&
        targetIdx != null &&
        sourceIdx < targetIdx
      ) {
        insertAt = Math.max(0, targetIdx - 1);
      }
      current.splice(insertAt, 0, entry);
      next.measures = current;
    } else {
      // Rows / columns: the field is a dimension here, so strip every
      // measure entry of the same field (the user is moving it out of the
      // measures zone entirely).
      if (source === "all" || source === "filters") {
        next.rows = pop(next.rows, uniqueName);
        next.columns = pop(next.columns, uniqueName);
        next.measures = pop(next.measures, uniqueName);
      } else if (source !== zone) {
        next.rows = pop(next.rows, uniqueName);
        next.columns = pop(next.columns, uniqueName);
        next.measures = pop(next.measures, uniqueName);
      }
      const current = [...((next[zone] as InternalSliceField[]) || [])];
      const dedup = current.filter((f) => f.uniqueName !== uniqueName);
      let insertAt = targetIdx == null ? dedup.length : targetIdx;
      if (
        source === zone &&
        sourceIdx != null &&
        targetIdx != null &&
        sourceIdx < targetIdx
      ) {
        insertAt = Math.max(0, targetIdx - 1);
      }
      dedup.splice(insertAt, 0, entry);
      next[zone] = dedup;
    }
    setSliceState(next);
  };

  const removeFromZone = (zone: string, idx: number) => {
    const next = { ...slice } as LocalSlice &
      Record<string, InternalSliceField[]>;
    next[zone] = ((next[zone] as InternalSliceField[]) || []).filter(
      (_, i) => i !== idx,
    );
    setSliceState(next);
  };

  const changeAggregation = (idx: number, aggregation: string) => {
    const next = { ...slice };
    next.measures = (next.measures || []).map((m, i) =>
      i === idx ? { ...m, aggregation } : m,
    );
    setSliceState(next);
  };

  const toggleMeasureHidden = (idx: number) => {
    const next = { ...slice };
    next.measures = (next.measures || []).map((m, i) =>
      i === idx ? { ...m, hidden: !m.hidden } : m,
    );
    setSliceState(next);
  };

  const visibleMeasureCount = (slice.measures || []).filter(
    (m) => !m.hidden,
  ).length;
  const canApply =
    (slice.measures || []).length === 0 || visibleMeasureCount > 0;

  const handleApply = () => {
    engine.setDateFormats(
      dateFormats,
    );
    engine.setFieldOrder(fieldOrder);
    engine.setDrillThroughConfig({
      fields: drillThroughFields as Record<string, boolean>,
      frozenCount,
    });
    // LocalSlice keeps every zone as InternalSliceField[] for uniform DnD, so
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
    const currentOrder = fieldsTree.map((n) => n.uniqueName);
    const without = currentOrder.filter((n) => n !== uniqueName);
    let insertAt = targetUniqueName
      ? without.indexOf(targetUniqueName)
      : without.length;
    if (insertAt < 0) insertAt = without.length;
    without.splice(insertAt, 0, uniqueName);
    setFieldOrder(without);
  };

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

  const captionFor = (uniqueName: string): string => {
    if (uniqueName === "Measures") {
      return tFL.values || "Values";
    }
    const meta = (engine.getMetadata() as Record<string, { caption?: string }>)[
      uniqueName
    ];
    if (meta?.caption) return meta.caption;
    const calc = calcFields.find((c) => c.uniqueName === uniqueName);
    if (calc?.caption) return calc.caption;
    return uniqueName;
  };

  const renderFieldChip = (zone: string) =>
    function FieldChip(
      item: InternalSliceField,
      idx: number,
    ): React.ReactElement {
      return (
        <Chip
          key={chipKey(item)}
          icon={
            item.uniqueName === "Measures" ? (
              <FunctionsIcon fontSize="small" />
            ) : undefined
          }
          label={captionFor(item.uniqueName)}
          size="small"
          onDelete={() => removeFromZone(zone, idx)}
          deleteIcon={<DeleteOutlineIcon />}
          sx={{
            borderRadius: 2,
            ...(item.uniqueName === "Measures" && {
              backgroundColor: (theme) => theme.palette.primary.main + "22",
              border: (theme) => `1px solid ${theme.palette.primary.main}66`,
            }),
          }}
        />
      );
    };

  const renderMeasureChip = (zone: string) =>
    function MeasureChip(
      item: InternalSliceField,
      idx: number,
    ): React.ReactElement {
      const isHidden = !!item.hidden;
      const calcField = calcFields.find(
        (c) => c.uniqueName === item.uniqueName,
      );
      const isCalculated = !!calcField;
      const allowed = isCalculated
        ? ["formula"]
        : item.availableAggregations || [
            "sum",
            "count",
            "distinctCount",
            "avg",
            "min",
            "max",
            "ratioTotal",
            "currentRatio",
          ];
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
          key={chipKey(item)}
          onDelete={() => removeFromZone(zone, idx)}
          deleteIcon={<DeleteOutlineIcon />}
          sx={{
            borderRadius: 2,
            height: "auto",
            py: 0.5,
            opacity: isHidden ? 0.55 : 1,
            textDecoration: isHidden ? "line-through" : "none",
          }}
          label={
            <Stack direction="row" sx={{ alignItems: "center" }} spacing={0.5}>
              <Tooltip
                title={
                  isHidden
                    ? tFL.showMeasure || "Show measure"
                    : tFL.hideMeasure || "Hide measure"
                }
              >
                <IconButton
                  size="small"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    toggleMeasureHidden(idx);
                  }}
                  sx={(theme) => ({
                    p: "2px",
                    "& svg": { fontSize: theme.typography.fontSize },
                  })}
                >
                  {isHidden ? (
                    <VisibilityOffIcon fontSize="inherit" />
                  ) : (
                    <VisibilityIcon fontSize="inherit" />
                  )}
                </IconButton>
              </Tooltip>
              {isCalculated && (
                <Tooltip
                  title={tFL.calculatedFieldTooltip || "Calculated field"}
                >
                  <CalculateIcon
                    fontSize="small"
                    sx={{ color: "primary.main" }}
                  />
                </Tooltip>
              )}
              <Typography
                variant="caption"
                sx={(theme) => ({
                  fontWeight: theme.typography.caption.fontWeight,
                })}
              >
                {captionFor(item.uniqueName)}
              </Typography>
              <Select
                value={item.aggregation || ""}
                onChange={(e) => changeAggregation(idx, String(e.target.value))}
                variant="standard"
                disableUnderline
                sx={(theme) => ({
                  fontSize: theme.typography.fontSize,
                  "& .MuiSelect-select": { py: 0 },
                })}
              >
                {selectable.map((a) => (
                  <MenuItem key={a} value={a} dense>
                    {resolveAggregationLabel(t, a)}
                  </MenuItem>
                ))}
              </Select>
              {isCalculated && (
                <>
                  <Tooltip title={tButtons.edit || "Edit"}>
                    <IconButton
                      size="small"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        setCalcDialog({
                          open: true,
                          editField: calcField!,
                        });
                      }}
                      sx={(theme) => ({
                        p: "2px",
                        "& svg": { fontSize: theme.typography.fontSize },
                      })}
                    >
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={tButtons.delete || "Delete"}>
                    <IconButton
                      size="small"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        // The engine also strips the field from its own
                        // slice — mirror that into the draft so Apply does
                        // not resurrect it.
                        engine.removeCalculatedField(item.uniqueName);
                        setSliceState((prev) =>
                          stripFromSlice(prev, item.uniqueName),
                        );
                      }}
                      sx={(theme) => ({
                        p: "2px",
                        "& svg": { fontSize: theme.typography.fontSize },
                        color: "error.main",
                      })}
                    >
                      <DeleteOutlineIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
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
        <DialogTitle sx={{ pr: 6 }}>
          {tFL.title || "Fields"}
          <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
            {tFL.subtitle || "Drag and drop fields to arrange them"}
          </Typography>
          <IconButton
            onClick={onClose}
            sx={{ position: "absolute", top: 8, right: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 2 }}>
            <Box style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, opacity: 0.75 }}
                >
                  {tFL.allFields || "All fields"}
                </Typography>
                <Tooltip
                  arrow
                  placement="top"
                  title={
                    tFL.drillThroughOrder ||
                    "Tick a field to include it in the drill-through table. Drag rows to reorder — the order here is the column order in the drill-through."
                  }
                >
                  <InfoOutlinedIcon
                    sx={(theme) => ({
                      fontSize: theme.typography.caption.fontSize,
                      opacity: 0.65,
                      cursor: "help",
                    })}
                  />
                </Tooltip>
              </Box>
              <Box
                onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  const payload = parseDragPayload(
                    e.dataTransfer.getData("text/plain"),
                  );
                  if (
                    payload &&
                    payload.source === "all" &&
                    payload.uniqueName
                  ) {
                    reorderFieldList(payload.uniqueName, null);
                  }
                }}
                sx={(theme) => ({
                  mt: 0.75,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  p: 1,
                  overflowY: "auto",
                })}
              >
                {availableFields.length === 0 && (
                  <Typography
                    variant="body2"
                    sx={{ opacity: 0.5, fontStyle: "italic" }}
                  >
                    —
                  </Typography>
                )}
                <Stack sx={{ gap: 0 }}>
                  {fieldsTree.map((f) => {
                    if (f.isDateParent) {
                      const isExpanded = expandedDates.has(f.uniqueName);
                      const isUsedAsDim = usedAsDimensionSet.has(f.uniqueName);
                      const draggable = !f.parentUsed && !isUsedAsDim;
                      const dimmed = f.parentUsed || isUsedAsDim;
                      return (
                        <Box key={f.uniqueName} sx={{ mt: "4px" }}>
                          <Tooltip
                            title={
                              isUsedAsDim
                                ? tFL.fieldUsedTooltip ||
                                  "Field already used — remove it from rows/columns/filters to drag it elsewhere"
                                : ""
                            }
                            disableHoverListener={!isUsedAsDim}
                            disableFocusListener={!isUsedAsDim}
                          >
                            <Box
                              draggable={draggable}
                              onDragStart={
                                draggable
                                  ? (e: React.DragEvent<HTMLDivElement>) =>
                                      handleDragStart(e, f.uniqueName)
                                  : undefined
                              }
                              onDragOver={(
                                e: React.DragEvent<HTMLDivElement>,
                              ) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const payload = parseDragPayload(
                                  e.dataTransfer.getData("text/plain"),
                                );
                                if (
                                  payload &&
                                  payload.source === "all" &&
                                  payload.uniqueName
                                ) {
                                  reorderFieldList(
                                    payload.uniqueName,
                                    f.uniqueName,
                                  );
                                }
                              }}
                              style={{ alignItems: "center" }}
                              sx={(theme) => ({
                                display: "flex",
                                gap: 0.5,
                                cursor: draggable ? "grab" : "default",
                                px: 1,
                                py: 0.5,
                                borderRadius: 1.5,
                                backgroundColor: dimmed
                                  ? "transparent"
                                  : theme.palette.action.hover,
                                border: "1px solid transparent",
                                "&:hover": {
                                  backgroundColor: dimmed
                                    ? theme.palette.action.hover
                                    : theme.palette.action.selected,
                                },
                                opacity: dimmed ? 0.55 : 1,
                                margin: theme.spacing(0.5, 0, 0.5, 2),
                              })}
                            >
                              <IconButton
                                size="small"
                                onClick={(
                                  e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                  e.stopPropagation();
                                  toggleDateExpanded(f.uniqueName);
                                }}
                                sx={(theme) => ({
                                  p: "2px",
                                  "& svg": {
                                    fontSize: theme.typography.fontSize,
                                  },
                                })}
                              >
                                {isExpanded ? (
                                  <ExpandMoreIcon fontSize="inherit" />
                                ) : (
                                  <ChevronRightIcon fontSize="inherit" />
                                )}
                              </IconButton>
                              {draggable ? (
                                <DragIndicatorIcon
                                  fontSize="small"
                                  sx={{ opacity: 0.5 }}
                                />
                              ) : (
                                <Box sx={{ width: 20 }} />
                              )}
                              <CalendarMonthIcon
                                fontSize="small"
                                sx={{ color: "primary.main", opacity: 0.7 }}
                              />
                              <Typography variant="body2" sx={{ flex: 1 }}>
                                {f.caption}
                              </Typography>
                              <Tooltip
                                title={tFL.renameField || "Rename field"}
                              >
                                <IconButton
                                  size="small"
                                  onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                  ) => {
                                    e.stopPropagation();
                                    openCaptionEditor(
                                      e.currentTarget,
                                      f.uniqueName,
                                    );
                                  }}
                                  sx={(theme) => ({
                                    p: "2px",
                                    "& svg": {
                                      fontSize: theme.typography.fontSize,
                                    },
                                  })}
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={tFL.dateFormat || "Date format"}>
                                <IconButton
                                  size="small"
                                  onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                  ) => {
                                    e.stopPropagation();
                                    setFormatEditor({
                                      anchor: e.currentTarget,
                                      uniqueName: f.uniqueName,
                                      subpart: null,
                                    });
                                  }}
                                  sx={(theme) => ({
                                    p: "2px",
                                    "& svg": {
                                      fontSize: theme.typography.fontSize,
                                    },
                                  })}
                                >
                                  <TuneIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip
                                title={
                                  tFL.showInDrillThrough ||
                                  "Show in drill-through"
                                }
                              >
                                <Checkbox
                                  size="small"
                                  checked={isDrillThroughOn(f.uniqueName)}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                  ) => {
                                    e.stopPropagation();
                                    toggleDrillThroughField(f.uniqueName);
                                  }}
                                  onClick={(e: React.MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                  sx={{ p: "2px" }}
                                />
                              </Tooltip>
                            </Box>
                          </Tooltip>
                          {isExpanded &&
                            (f.children || []).map((c) => {
                              const childUsed = usedAsDimensionSet.has(
                                c.uniqueName,
                              );
                              const childDraggable = !childUsed;
                              return (
                                <Tooltip
                                  key={c.uniqueName}
                                  title={
                                    childUsed
                                      ? tFL.fieldUsedTooltip ||
                                        "Field already used — remove it from rows/columns/filters to drag it elsewhere"
                                      : ""
                                  }
                                  disableHoverListener={!childUsed}
                                  disableFocusListener={!childUsed}
                                >
                                  <Box
                                    draggable={childDraggable}
                                    onDragStart={
                                      childDraggable
                                        ? (
                                            e: React.DragEvent<HTMLDivElement>,
                                          ) => handleDragStart(e, c.uniqueName)
                                        : undefined
                                    }
                                    style={{ alignItems: "center" }}
                                    sx={(theme) => ({
                                      display: "flex",
                                      gap: 0.5,
                                      cursor: childDraggable
                                        ? "grab"
                                        : "default",
                                      pl: 4,
                                      pr: 1,
                                      py: 0.5,
                                      mt: "4px",
                                      borderRadius: 1.5,
                                      backgroundColor:
                                        theme.palette.action.hover,
                                      border: "1px solid transparent",
                                      opacity: childUsed ? 0.55 : 1,
                                      "&:hover": {
                                        backgroundColor:
                                          theme.palette.action.selected,
                                      },
                                    })}
                                  >
                                    {childDraggable ? (
                                      <DragIndicatorIcon
                                        fontSize="small"
                                        sx={{ opacity: 0.5 }}
                                      />
                                    ) : (
                                      <Box sx={{ width: 20 }} />
                                    )}
                                    <Typography
                                      variant="body2"
                                      sx={{ flex: 1 }}
                                    >
                                      {c.partCaption}
                                    </Typography>
                                    <Tooltip
                                      title={tFL.renameField || "Rename field"}
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={(
                                          e: React.MouseEvent<HTMLButtonElement>,
                                        ) => {
                                          e.stopPropagation();
                                          openCaptionEditor(
                                            e.currentTarget,
                                            c.uniqueName,
                                          );
                                        }}
                                        sx={(theme) => ({
                                          p: "2px",
                                          "& svg": {
                                            fontSize: theme.typography.fontSize,
                                          },
                                        })}
                                      >
                                        <EditIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                    {SUBPART_CONFIGURABLE.has(
                                      c.subpart || "",
                                    ) && (
                                      <Tooltip
                                        title={tFL.dateFormat || "Date format"}
                                      >
                                        <IconButton
                                          size="small"
                                          onClick={(
                                            e: React.MouseEvent<HTMLButtonElement>,
                                          ) => {
                                            e.stopPropagation();
                                            setFormatEditor({
                                              anchor: e.currentTarget,
                                              uniqueName: c.uniqueName,
                                              subpart: c.subpart || null,
                                            });
                                          }}
                                          sx={(theme) => ({
                                            p: "2px",
                                            "& svg": {
                                              fontSize:
                                                theme.typography.fontSize,
                                            },
                                          })}
                                        >
                                          <TuneIcon fontSize="inherit" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Box>
                                </Tooltip>
                              );
                            })}
                        </Box>
                      );
                    }
                    const isUsedAsDim = usedAsDimensionSet.has(f.uniqueName);
                    const draggable = !isUsedAsDim;
                    return (
                      <Tooltip
                        key={f.uniqueName}
                        title={
                          isUsedAsDim
                            ? tFL.fieldUsedTooltip ||
                              "Field already used — remove it from rows/columns/filters to drag it elsewhere"
                            : ""
                        }
                        disableHoverListener={!isUsedAsDim}
                        disableFocusListener={!isUsedAsDim}
                      >
                        <Box
                          draggable={draggable}
                          onDragStart={
                            draggable
                              ? (e: React.DragEvent<HTMLDivElement>) =>
                                  handleDragStart(e, f.uniqueName)
                              : undefined
                          }
                          onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const payload = parseDragPayload(
                              e.dataTransfer.getData("text/plain"),
                            );
                            if (
                              payload &&
                              payload.source === "all" &&
                              payload.uniqueName
                            ) {
                              reorderFieldList(
                                payload.uniqueName,
                                f.uniqueName,
                              );
                            }
                          }}
                          style={{ alignItems: "center" }}
                          sx={(theme) => ({
                            display: "flex",
                            gap: 0.5,
                            cursor: draggable ? "grab" : "default",
                            px: 1,
                            py: 0.5,
                            mt: "4px",
                            borderRadius: 1.5,
                            backgroundColor: f.isCalculated
                              ? (theme.palette.tertiary?.main ||
                                  theme.palette.primary.main) + "18"
                              : theme.palette.action.hover,
                            border: f.isCalculated
                              ? `1px solid ${
                                  theme.palette.tertiary?.main ||
                                  theme.palette.primary.main
                                }40`
                              : "1px solid transparent",
                            opacity: isUsedAsDim ? 0.55 : 1,
                            "&:hover": {
                              backgroundColor: theme.palette.action.selected,
                            },
                          })}
                        >
                          {draggable ? (
                            <DragIndicatorIcon
                              fontSize="small"
                              sx={{ opacity: 0.5 }}
                            />
                          ) : (
                            <Box sx={{ width: 20 }} />
                          )}
                          {f.uniqueName === "Measures" && (
                            <Tooltip
                              title={
                                tFL.measuresAxisTooltip ||
                                "Special aggregation field — drag to Rows or Columns to choose the values axis"
                              }
                            >
                              <FunctionsIcon
                                fontSize="small"
                                sx={{ color: "primary.main" }}
                              />
                            </Tooltip>
                          )}
                          {f.isCalculated && (
                            <Tooltip
                              title={
                                tFL.calculatedFieldTooltip || "Calculated field"
                              }
                            >
                              <CalculateIcon
                                fontSize="small"
                                sx={{ color: "primary.main" }}
                              />
                            </Tooltip>
                          )}
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {f.caption}
                          </Typography>
                          {!f.isCalculated && f.uniqueName !== "Measures" && (
                            <Tooltip title={tFL.renameField || "Rename field"}>
                              <IconButton
                                size="small"
                                onClick={(
                                  e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                  e.stopPropagation();
                                  openCaptionEditor(
                                    e.currentTarget,
                                    f.uniqueName,
                                  );
                                }}
                                sx={(theme) => ({
                                  p: "2px",
                                  "& svg": {
                                    fontSize: theme.typography.fontSize,
                                  },
                                })}
                              >
                                <EditIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {!f.isCalculated &&
                            f.uniqueName !== "Measures" && (
                              <Tooltip
                                title={
                                  tFL.showInDrillThrough ||
                                  "Show in drill-through"
                                }
                              >
                                <Checkbox
                                  size="small"
                                  checked={isDrillThroughOn(f.uniqueName)}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                  ) => {
                                    e.stopPropagation();
                                    toggleDrillThroughField(f.uniqueName);
                                  }}
                                  onClick={(e: React.MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                  sx={{ p: "2px" }}
                                />
                              </Tooltip>
                            )}
                          {f.isCalculated && (
                            <>
                              <Tooltip title={tButtons.edit || "Edit"}>
                                <IconButton
                                  size="small"
                                  onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                  ) => {
                                    e.stopPropagation();
                                    setCalcDialog({
                                      open: true,
                                      editField:
                                        calcFields.find(
                                          (c) => c.uniqueName === f.uniqueName,
                                        ) || (f as CalculatedField),
                                    });
                                  }}
                                  sx={(theme) => ({
                                    p: "2px",
                                    "& svg": {
                                      fontSize: theme.typography.fontSize,
                                    },
                                  })}
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={tButtons.delete || "Delete"}>
                                <IconButton
                                  size="small"
                                  onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                  ) => {
                                    e.stopPropagation();
                                    (
                                      engine.removeCalculatedField as (
                                        un: string,
                                      ) => void
                                    )(f.uniqueName);
                                  }}
                                  sx={(theme) => ({
                                    p: "2px",
                                    "& svg": {
                                      fontSize: theme.typography.fontSize,
                                    },
                                    color: "error.main",
                                  })}
                                >
                                  <DeleteOutlineIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Box>

              <Button
                size="large"
                startIcon={<CalculateIcon />}
                onClick={() => setCalcDialog({ open: true, editField: null })}
                sx={{ mt: 1, width: "100%", justifyContent: "flex-start" }}
              >
                {tFL.addCalculated || "Add calculated value"}
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
                    "Frozen drill-through columns"
                  }
                  helperText={
                    tFL.drillThroughStickyColumnsHelp ||
                    "Number of left-pinned columns"
                  }
                />
              </Box>
            </Box>

            <Box>
              <Box
                style={{ alignItems: "center" }}
                sx={{
                  display: "flex",
                  gap: 1,
                  mb: 1.25,
                  flexWrap: "wrap",
                }}
              >
                <FunctionsIcon
                  fontSize="small"
                  sx={{ color: "primary.main" }}
                />
                <Typography
                  variant="caption"
                  sx={(theme) => ({
                    fontWeight: theme.typography.h6.fontWeight,
                  })}
                >
                  {tFL.showTotals || "Show totals"}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={currentMeasuresAxis}
                  onChange={handleMeasuresAxisChange}
                  sx={{ ml: "auto" }}
                >
                  <ToggleButton
                    value="rows"
                    sx={{ textTransform: "none", py: 0.25 }}
                  >
                    {tFL.perRow || "Per row"}
                  </ToggleButton>
                  <ToggleButton
                    value="columns"
                    sx={{ textTransform: "none", py: 0.25 }}
                  >
                    {tFL.perColumn || "Per column"}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Stack sx={{ gap: 1.25 }}>
                {ZONES.map((zone) => {
                  const items = (
                    (slice[zone.id] as InternalSliceField[]) || []
                  ).filter((f) => f.uniqueName !== "Measures");
                  const label =
                    tFL[zone.id === "measures" ? "values" : zone.id] || zone.id;
                  return (
                    <DropZone
                      key={zone.id}
                      zone={zone.id}
                      items={items}
                      label={label}
                      dropHint={tFL.dropField || "Drop field here"}
                      onDrop={addFieldToZone}
                      renderItem={
                        zone.id === "measures"
                          ? renderMeasureChip(zone.id)
                          : renderFieldChip(zone.id)
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions style={{ padding: 16 }}>
          {!canApply && (
            <Typography
              variant="caption"
              sx={{ color: "error.main", mr: "auto" }}
            >
              {tFL.atLeastOneVisibleMeasure ||
                "At least one measure must be visible."}
            </Typography>
          )}
          <Button onClick={onClose}>{tButtons.cancel || "Cancel"}</Button>
          <Button
            onClick={handleApply}
            variant="contained"
            disabled={!canApply}
          >
            {tButtons.apply || "Apply"}
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
          formatEditor.uniqueName
            ? dateFormats[formatEditor.uniqueName] ||
              defaultFormatFor(formatEditor.subpart)
            : defaultFormatFor(formatEditor.subpart)
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
        onClose={() =>
          setCaptionEditor({ anchor: null, uniqueName: null, value: "" })
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        container={portalContainer}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, opacity: 0.75, display: "block", mb: 1 }}
          >
            {tFL.renameField || "Rename field"}
          </Typography>
          <TextField
            size="small"
            fullWidth
            autoFocus
            value={captionEditor.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCaptionEditor((s) => ({ ...s, value: e.target.value }))
            }
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") saveCaption();
              if (e.key === "Escape")
                setCaptionEditor({
                  anchor: null,
                  uniqueName: null,
                  value: "",
                });
            }}
          />
          <Stack
            direction="row"
            sx={{ justifyContent: "flex-end", gap: 1, mt: 1 }}
          >
            <Button
              size="small"
              onClick={() =>
                setCaptionEditor({
                  anchor: null,
                  uniqueName: null,
                  value: "",
                })
              }
            >
              {tButtons.cancel || "Cancel"}
            </Button>
            <Button size="small" variant="contained" onClick={saveCaption}>
              {tButtons.save || "Save"}
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
};

/**
 * Thin wrapper that gives the body a new key on every open, so all of its
 * drafts re-seed from the engine without a reset effect.
 */
const FieldList = function FieldList(props: FieldListProps): React.ReactElement {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    // Adjusting state during render (React's documented alternative to an
    // effect): no extra commit, the body mounts already seeded.
    setWasOpen(props.open);
    if (props.open) setSession((n) => n + 1);
  }
  return <FieldListBody key={session} {...props} />;
};

export default FieldList;
