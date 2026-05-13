import React, { useMemo, useState, useEffect } from "react";
import PropTypes from "prop-types";

// Build-time flag injected by rollup `build-flags` plugin. Outside the
// bundler the token stays unresolved — `typeof` guard prevents
// ReferenceError.
const IS_FREEPLAN =
  typeof __FREEPLAN__ !== "undefined" ? !!__FREEPLAN__ : false;
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
import CalculatedFieldDialog from "../CalculatedFieldDialog/CalculatedFieldDialog";

/**
 * Drag-and-drop configuration panel for rows, columns, measures and filters.
 * The UI is modeled after the auraPivot field list dialog but is built on
 * MUI primitives so it inherits Databeasy's Inter font, pastel accent colors
 * and dark-mode palette automatically.
 *
 * Drag-and-drop is implemented with the native HTML5 DnD API to avoid pulling
 * in a heavyweight dnd library.
 */

const AGGREGATION_LABELS_FALLBACK = {
  sum: "Sum",
  count: "Count",
  distinctcount: "Distinct count",
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
const WDR_AGGREGATION_KEY = {
  sum: "sum",
  count: "count",
  distinctcount: "distinctCount",
  avg: "average",
  min: "min",
  max: "max",
  ratioTotal: "ratioTotal",
  currentRatio: "currentRatio",
};

const resolveAggregationLabel = (t, aggregation) => {
  const wdrKey = WDR_AGGREGATION_KEY[aggregation] || aggregation;
  const entry = t?.aggregations?.[aggregation] ?? t?.aggregations?.[wdrKey];
  if (entry && typeof entry === "object") {
    return (
      entry.caption || AGGREGATION_LABELS_FALLBACK[aggregation] || aggregation
    );
  }
  return entry || AGGREGATION_LABELS_FALLBACK[aggregation] || aggregation;
};

const ZONES = [
  { id: "filters", labelKey: "filters" },
  { id: "rows", labelKey: "rows" },
  { id: "columns", labelKey: "columns" },
  { id: "measures", labelKey: "values" },
];

/**
 * Parses a drag payload. Existing chips send a JSON blob with source zone +
 * index; items coming from the "all fields" list send a plain uniqueName for
 * backward compatibility.
 */
const parseDragPayload = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.uniqueName)
      return parsed;
  } catch (_err) {
    console.log(_err);
    // fall through
  }
  return { source: "all", uniqueName: raw };
};

const DropZone = function DropZone({
  zone,
  items,
  label,
  dropHint,
  onDrop,
  renderItem,
}) {
  const [over, setOver] = useState(false);

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
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
      <Stack direction="row" gap={0} sx={{ flexWrap: "wrap", mt: 0.75 }}>
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
            draggable: true,
            onDragStart: (e) => {
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
            onDragOver: (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            },
            onDrop: (e) => {
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
              key={`${item.uniqueName}-${idx}`}
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

DropZone.propTypes = {
  zone: PropTypes.string.isRequired,
  items: PropTypes.array.isRequired,
  label: PropTypes.string.isRequired,
  dropHint: PropTypes.string.isRequired,
  onDrop: PropTypes.func.isRequired,
  renderItem: PropTypes.func.isRequired,
};

const DATE_FORMAT_PRESETS = [
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
const SUBPART_PRESETS = {
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

const SUBPART_DEFAULTS = {
  month: "name-full",
  quarter: "long",
  weekday: "name-full",
  week: "number",
};

const SUBPART_CONFIGURABLE = new Set(Object.keys(SUBPART_PRESETS));

const defaultFormatFor = (subpart) =>
  subpart ? SUBPART_DEFAULTS[subpart] || null : "locale-date";

const DateFormatPopover = function DateFormatPopover({
  anchor,
  uniqueName,
  subpart,
  value,
  onChange,
  onClose,
  t,
}) {
  const portalContainer = usePortalContainer();
  const isSubpart = !!subpart && SUBPART_PRESETS[subpart];
  const subpartPresets = isSubpart ? SUBPART_PRESETS[subpart] : null;
  const subpartLabel = (p) =>
    t?.fieldsList?.subpartFormats?.[subpart]?.[p.value] || p.fallback;

  const dateLabel = (p) =>
    t?.fieldsList?.dateFormats?.[p.labelKey] || p.fallback;

  // For the free date formatter: any non-preset value = custom pattern.
  const datePresetValues = new Set(
    DATE_FORMAT_PRESETS.filter((p) => p.value !== "custom").map((p) => p.value),
  );
  const dateIsPreset = datePresetValues.has(value);
  const dateMode = dateIsPreset ? value : "custom";
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
          {t?.fieldsList?.dateFormat || "Date format"}
        </Typography>
        {isSubpart ? (
          <Select
            value={value || SUBPART_DEFAULTS[subpart]}
            onChange={(e) => onChange(e.target.value)}
            size="small"
            fullWidth
            sx={{ mt: 1 }}
          >
            {subpartPresets.map((p) => (
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
                const next = e.target.value;
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
                onChange={(e) => onChange(e.target.value)}
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                placeholder="dd/MM/yyyy HH:mm"
                helperText={
                  t?.fieldsList?.dateFormatHelp ||
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

DateFormatPopover.propTypes = {
  anchor: PropTypes.any,
  uniqueName: PropTypes.string,
  subpart: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  t: PropTypes.object,
};

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
}) {
  const clamp = (raw) => {
    let n = Number.isFinite(raw) ? raw : 0;
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    return n;
  };
  const commit = (next) => onChange?.(clamp(next));
  const current = Number.isFinite(value) ? value : 0;

  return (
    <FormControl size={size} fullWidth={fullWidth} variant="outlined">
      {label && <InputLabel shrink>{label}</InputLabel>}
      <OutlinedInput
        size={size}
        value={current}
        notched={!!label}
        label={label}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          commit(Number.isFinite(v) ? v : 0);
        }}
        startAdornment={
          <InputAdornment position="start">
            <IconButton
              size="small"
              aria-label="decrement"
              disabled={Number.isFinite(min) && current <= min}
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
              disabled={Number.isFinite(max) && current >= max}
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

NumericField.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  label: PropTypes.string,
  helperText: PropTypes.string,
  size: PropTypes.string,
  fullWidth: PropTypes.bool,
};

const FieldList = function FieldList({ open, onClose }) {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();
  const [slice, setSliceState] = useState(engine.getSlice());
  const [calcDialog, setCalcDialog] = useState({
    open: false,
    editField: null,
  });

  const [calcFields, setCalcFields] = useState(() =>
    engine.getCalculatedFields(),
  );

  // Local draft of per-date-field formats. Committed to the engine on Apply.
  const [dateFormats, setDateFormats] = useState(() => engine.getDateFormats());
  // Local drafts for the "All fields" reorder and the drill-through config.
  // Persisted on Apply via engine.setFieldOrder / setDrillThroughConfig.
  const [fieldOrder, setFieldOrder] = useState(() => engine.getFieldOrder());
  const [drillThroughFields, setDrillThroughFields] = useState(
    () => engine.getDrillThroughConfig().fields,
  );
  const [frozenCount, setFrozenCount] = useState(
    () => engine.getDrillThroughConfig().frozenCount,
  );
  // Popover anchor/state for the per-field format editor. `subpart` selects
  // the preset list; null means the parent date field (free date formatter).
  const [formatEditor, setFormatEditor] = useState({
    anchor: null,
    uniqueName: null,
    subpart: null,
  });
  const [captionEditor, setCaptionEditor] = useState({
    anchor: null,
    uniqueName: null,
    value: "",
  });
  const openCaptionEditor = (target, uniqueName) => {
    const meta = engine.getMetadata()[uniqueName];
    const calc = calcFields.find((c) => c.uniqueName === uniqueName);
    const current = meta?.caption || calc?.caption || uniqueName;
    setCaptionEditor({ anchor: target, uniqueName, value: current });
  };
  const saveCaption = () => {
    if (!captionEditor.uniqueName) return;
    engine.setFieldCaption(captionEditor.uniqueName, captionEditor.value);
    setCaptionEditor({ anchor: null, uniqueName: null, value: "" });
  };

  useEffect(() => {
    if (!open) return undefined;
    const ensureMeasuresAnchor = (s) => {
      const inRows = (s.rows || []).some((f) => f.uniqueName === "Measures");
      const inCols = (s.columns || []).some((f) => f.uniqueName === "Measures");
      if (inRows || inCols) return s;
      // Default placement: on columns (matches the "Per colonna" toggle default).
      return {
        ...s,
        columns: [...(s.columns || []), { uniqueName: "Measures" }],
      };
    };
    const sync = () =>
      setSliceState(ensureMeasuresAnchor({ ...engine.getSlice() }));
    const syncCalc = () => setCalcFields(engine.getCalculatedFields());
    const syncDateFormats = () => setDateFormats(engine.getDateFormats());
    const syncFieldOrder = () => setFieldOrder(engine.getFieldOrder());
    const syncDrillThrough = () => {
      const cfg = engine.getDrillThroughConfig();
      setDrillThroughFields(cfg.fields);
      setFrozenCount(cfg.frozenCount);
    };
    engine.on("reportChange", sync);
    engine.on("dataChange", syncCalc);
    engine.on("formatChange", syncDateFormats);
    sync();
    syncCalc();
    syncDateFormats();
    syncFieldOrder();
    syncDrillThrough();
    return () => {
      engine.off("reportChange", sync);
      engine.off("dataChange", syncCalc);
      engine.off("formatChange", syncDateFormats);
    };
  }, [engine, open]);

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
    "distinctcount",
    "avg",
    "min",
    "max",
    "ratioTotal",
    "currentRatio",
  ];
  const allowedAggsFor = (uniqueName) => {
    if (calcFields.some((c) => c.uniqueName === uniqueName)) return ["formula"];
    const meta = engine.getMetadata()[uniqueName];
    return meta?.availableAggregations || DEFAULT_NUMERIC_AGGS;
  };
  // Set of uniqueNames currently used as a dimension (rows / columns / filters).
  // These remain visible in "All fields" but become non-draggable per UX spec.
  // Measures usage is intentionally excluded: the same field can be dropped
  // into measures multiple times with different aggregations.
  const usedAsDimensionSet = useMemo(() => {
    const set = new Set();
    (slice.rows || []).forEach((f) => set.add(f.uniqueName));
    (slice.columns || []).forEach((f) => set.add(f.uniqueName));
    (slice.filters || []).forEach((f) => set.add(f.uniqueName));
    return set;
  }, [slice]);

  const availableFields = useMemo(() => {
    const all = engine.getAvailableFields();
    const measureAggs = new Map();
    (slice.measures || []).forEach((m) => {
      if (!measureAggs.has(m.uniqueName))
        measureAggs.set(m.uniqueName, new Set());
      measureAggs.get(m.uniqueName).add(m.aggregation);
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
  const fieldsTree = useMemo(() => {
    const meta = engine.getMetadata();
    const partsLoc = t?.dates?.hierarchyParts || {};
    const partLabel = (p) => partsLoc[p.toLowerCase()] || p;

    const childrenByParent = new Map();
    const leftover = [];
    availableFields.forEach((f) => {
      const m = f.uniqueName.match(
        /^(.+)\.(Year|Quarter|Month|Week|Day|Weekday|Hour|Minute)$/,
      );
      if (m && meta[m[1]]?.type === "date") {
        if (!childrenByParent.has(m[1])) childrenByParent.set(m[1], []);
        const subpart = meta[f.uniqueName]?.subpart || m[2].toLowerCase();
        childrenByParent.get(m[1]).push({
          ...f,
          isDatePart: true,
          partKey: m[2],
          partCaption: partLabel(m[2]),
          subpart,
        });
      } else {
        leftover.push(f);
      }
    });

    const nodes = [];
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
        const ra = rank.has(a.uniqueName) ? rank.get(a.uniqueName) : Infinity;
        const rb = rank.has(b.uniqueName) ? rank.get(b.uniqueName) : Infinity;
        return ra - rb;
      });
    }
    return nodes;
  }, [availableFields, engine, t, fieldOrder]);

  const [expandedDates, setExpandedDates] = useState(() => new Set());
  const toggleDateExpanded = (uniqueName) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(uniqueName)) next.delete(uniqueName);
      else next.add(uniqueName);
      return next;
    });
  };

  // Derive the current "Mostra i totali" axis from the slice. The Measures
  // anchor lives on either rows or columns; default to columns when missing.
  const measuresAxis = useMemo(() => {
    if ((slice.rows || []).some((f) => f.uniqueName === "Measures"))
      return "rows";
    return "columns";
  }, [slice]);

  const handleMeasuresAxisChange = (_e, value) => {
    if (!value || value === measuresAxis) return;
    const next = { ...slice };
    next.rows = (next.rows || []).filter((f) => f.uniqueName !== "Measures");
    next.columns = (next.columns || []).filter(
      (f) => f.uniqueName !== "Measures",
    );
    const anchor = { uniqueName: "Measures" };
    if (value === "rows") {
      next.rows = [...next.rows, anchor];
    } else {
      next.columns = [...next.columns, anchor];
    }
    setSliceState(next);
  };

  const handleDragStart = (e, uniqueName) => {
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
  const addFieldToZone = (zone, payload, targetIdx) => {
    const { source, uniqueName, idx: sourceIdx } = payload;
    // The "Valori" anchor is no longer drag-and-droppable from the field list:
    // its axis is governed exclusively by the "Mostra i totali" toggle.
    if (uniqueName === "Measures") return;

    // --- Pre-validate measure capacity --------------------------------
    // When dropping into measures from a non-measures source, pick the
    // first aggregation not yet consumed by another measure entry of the
    // same field. If all supported aggregations are in use, abort before
    // mutating any slice zone.
    let chosenAgg = null;
    if (zone === "measures" && source !== "measures") {
      const allowed = allowedAggsFor(uniqueName);
      const usedAgg = new Set(
        (slice.measures || [])
          .filter((m) => m.uniqueName === uniqueName)
          .map((m) => m.aggregation),
      );
      chosenAgg = allowed.find((a) => !usedAgg.has(a));
      if (!chosenAgg) return;
    }

    const next = { ...slice };
    const pop = (list, name) =>
      (list || []).filter((f) => f.uniqueName !== name);
    const popAt = (list, i) => (list || []).filter((_, j) => j !== i);

    // Pull the source entry out of its current zone (if any) so we can
    // re-use its aggregation / metadata when re-inserting.
    let moving = { uniqueName };
    if (source && source !== "all" && next[source]) {
      const arr = next[source] || [];
      const entry = arr[sourceIdx];
      if (entry && entry.uniqueName === uniqueName) moving = { ...entry };
      next[source] = popAt(arr, sourceIdx);
    }

    // Build the entry to insert based on the target zone.
    let entry = moving;
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
            : chosenAgg,
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
      const current = [...(next[zone] || [])];
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

  const removeFromZone = (zone, idx) => {
    const next = { ...slice };
    next[zone] = (next[zone] || []).filter((_, i) => i !== idx);
    setSliceState(next);
  };

  const changeAggregation = (idx, aggregation) => {
    const next = { ...slice };
    next.measures = (next.measures || []).map((m, i) =>
      i === idx ? { ...m, aggregation } : m,
    );
    setSliceState(next);
  };

  const toggleMeasureHidden = (idx) => {
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
    engine.setDateFormats(dateFormats);
    engine.setFieldOrder(fieldOrder);
    engine.setDrillThroughConfig({
      fields: drillThroughFields,
      frozenCount,
    });
    engine.setSlice(slice);
    onClose?.();
  };

  // Move `uniqueName` to the slot immediately before `targetUniqueName` in the
  // local `fieldOrder` draft. The order array is rebuilt from the current
  // tree so untouched fields keep their displayed position even before the
  // first explicit reorder.
  const reorderFieldList = (uniqueName, targetUniqueName) => {
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

  const toggleDrillThroughField = (uniqueName) => {
    setDrillThroughFields((prev) => {
      const current = prev[uniqueName];
      const wasOn = current === undefined ? true : !!current;
      const next = { ...prev, [uniqueName]: !wasOn };
      return next;
    });
  };

  const isDrillThroughOn = (uniqueName) => {
    const v = drillThroughFields[uniqueName];
    return v === undefined ? true : !!v;
  };

  const updateDateFormat = (uniqueName, format, subpart) => {
    setDateFormats((prev) => {
      const next = { ...prev };
      const def = defaultFormatFor(subpart || null);
      if (!format || format === def) delete next[uniqueName];
      else next[uniqueName] = format;
      return next;
    });
  };

  const captionFor = (uniqueName) => {
    if (uniqueName === "Measures") {
      return t?.fieldsList?.values || "Values";
    }
    const meta = engine.getMetadata()[uniqueName];
    if (meta?.caption) return meta.caption;
    const calc = calcFields.find((c) => c.uniqueName === uniqueName);
    if (calc?.caption) return calc.caption;
    return uniqueName;
  };

  const renderFieldChip = (zone) =>
    function FieldChip(item, idx) {
      return (
        <Chip
          key={`${item.uniqueName}-${idx}`}
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

  const renderMeasureChip = (zone) =>
    function MeasureChip(item, idx) {
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
            "distinctcount",
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
          key={`${item.uniqueName}-${idx}`}
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
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Tooltip
                title={
                  isHidden
                    ? t?.fieldsList?.showMeasure || "Show measure"
                    : t?.fieldsList?.hideMeasure || "Hide measure"
                }
              >
                <IconButton
                  size="small"
                  onClick={(e) => {
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
                  title={
                    t?.fieldsList?.calculatedFieldTooltip || "Calculated field"
                  }
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
                value={item.aggregation}
                onChange={(e) => changeAggregation(idx, e.target.value)}
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
                  <Tooltip title={t?.buttons?.edit || "Edit"}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCalcDialog({
                          open: true,
                          editField: calcField,
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
                  <Tooltip title={t?.buttons?.delete || "Delete"}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.removeCalculatedField(item.uniqueName);
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
          {t?.fieldsList?.title || "Fields"}
          <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
            {t?.fieldsList?.subtitle || "Drag and drop fields to arrange them"}
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
              {IS_FREEPLAN ? null : (
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
                    {t?.fieldsList?.allFields || "All fields"}
                  </Typography>
                  <Tooltip
                    arrow
                    placement="top"
                    title={
                      t?.fieldsList?.drillThroughOrderHint ||
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
              )}
              <Box
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
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
                <Stack gap={0}>
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
                                ? t?.fieldsList?.fieldUsedTooltip ||
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
                                  ? (e) => handleDragStart(e, f.uniqueName)
                                  : undefined
                              }
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e) => {
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
                                onClick={(e) => {
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
                                title={
                                  t?.fieldsList?.renameField || "Rename field"
                                }
                              >
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
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
                              <Tooltip
                                title={
                                  t?.fieldsList?.dateFormat || "Date format"
                                }
                              >
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
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
                              {IS_FREEPLAN ? null : (
                                <Tooltip
                                  title={
                                    t?.fieldsList?.showInDrillThrough ||
                                    "Show in drill-through"
                                  }
                                >
                                  <Checkbox
                                    size="small"
                                    checked={isDrillThroughOn(f.uniqueName)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleDrillThroughField(f.uniqueName);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{ p: "2px" }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </Tooltip>
                          {isExpanded &&
                            f.children.map((c) => {
                              const childUsed = usedAsDimensionSet.has(
                                c.uniqueName,
                              );
                              const childDraggable = !childUsed;
                              return (
                                <Tooltip
                                  key={c.uniqueName}
                                  title={
                                    childUsed
                                      ? t?.fieldsList?.fieldUsedTooltip ||
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
                                        ? (e) =>
                                            handleDragStart(e, c.uniqueName)
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
                                      title={
                                        t?.fieldsList?.renameField ||
                                        "Rename field"
                                      }
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
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
                                    {SUBPART_CONFIGURABLE.has(c.subpart) && (
                                      <Tooltip
                                        title={
                                          t?.fieldsList?.dateFormat ||
                                          "Date format"
                                        }
                                      >
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setFormatEditor({
                                              anchor: e.currentTarget,
                                              uniqueName: c.uniqueName,
                                              subpart: c.subpart,
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
                            ? t?.fieldsList?.fieldUsedTooltip ||
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
                              ? (e) => handleDragStart(e, f.uniqueName)
                              : undefined
                          }
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
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
                              ? theme.palette.primary.main + "18"
                              : theme.palette.action.hover,
                            border: f.isCalculated
                              ? `1px solid ${theme.palette.primary.main}40`
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
                                t?.fieldsList?.measuresAxisTooltip ||
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
                                t?.fieldsList?.calculatedFieldTooltip ||
                                "Calculated field"
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
                            <Tooltip
                              title={
                                t?.fieldsList?.renameField || "Rename field"
                              }
                            >
                              <IconButton
                                size="small"
                                onClick={(e) => {
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
                            f.uniqueName !== "Measures" &&
                            !IS_FREEPLAN && (
                              <Tooltip
                                title={
                                  t?.fieldsList?.showInDrillThrough ||
                                  "Show in drill-through"
                                }
                              >
                                <Checkbox
                                  size="small"
                                  checked={isDrillThroughOn(f.uniqueName)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleDrillThroughField(f.uniqueName);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  sx={{ p: "2px" }}
                                />
                              </Tooltip>
                            )}
                          {f.isCalculated && (
                            <>
                              <Tooltip title={t?.buttons?.edit || "Edit"}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCalcDialog({
                                      open: true,
                                      editField:
                                        calcFields.find(
                                          (c) => c.uniqueName === f.uniqueName,
                                        ) || f,
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
                              <Tooltip title={t?.buttons?.delete || "Delete"}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    engine.removeCalculatedField(f.uniqueName);
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
                {t?.fieldsList?.addCalculated || "Add calculated value"}
              </Button>

              {IS_FREEPLAN ? null : (
                <Box sx={{ mt: 1.5 }}>
                  <NumericField
                    fullWidth
                    size="small"
                    min={0}
                    step={1}
                    value={frozenCount}
                    onChange={(v) => setFrozenCount(v)}
                    label={
                      t?.fieldsList?.freezeColumns ||
                      "Frozen drill-through columns"
                    }
                    helperText={
                      t?.fieldsList?.freezeColumnsHelp ||
                      "Number of left-pinned columns"
                    }
                  />
                </Box>
              )}
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
                  {t?.fieldsList?.showTotals || "Show totals"}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={measuresAxis}
                  onChange={handleMeasuresAxisChange}
                  sx={{ ml: "auto" }}
                >
                  <ToggleButton
                    value="rows"
                    sx={{ textTransform: "none", py: 0.25 }}
                  >
                    {t?.fieldsList?.perRow || "Per row"}
                  </ToggleButton>
                  <ToggleButton
                    value="columns"
                    sx={{ textTransform: "none", py: 0.25 }}
                  >
                    {t?.fieldsList?.perColumn || "Per column"}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Stack gap={1.25}>
                {ZONES.map((zone) => {
                  const items = (slice[zone.id] || []).filter(
                    (f) => f.uniqueName !== "Measures",
                  );
                  const label =
                    t?.fieldsList?.[
                      zone.id === "measures" ? "values" : zone.id
                    ] || zone.id;
                  return (
                    <DropZone
                      key={zone.id}
                      zone={zone.id}
                      items={items}
                      label={label}
                      dropHint={t?.fieldsList?.dropField || "Drop field here"}
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
              {t?.fieldsList?.atLeastOneVisibleMeasure ||
                "At least one measure must be visible."}
            </Typography>
          )}
          <Button onClick={onClose}>{t?.buttons?.cancel || "Cancel"}</Button>
          <Button
            onClick={handleApply}
            variant="contained"
            disabled={!canApply}
          >
            {t?.buttons?.apply || "Apply"}
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
            {t?.fieldsList?.renameField || "Rename field"}
          </Typography>
          <TextField
            size="small"
            fullWidth
            autoFocus
            value={captionEditor.value}
            onChange={(e) =>
              setCaptionEditor((s) => ({ ...s, value: e.target.value }))
            }
            onKeyDown={(e) => {
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
            justifyContent="flex-end"
            gap={1}
            sx={{ mt: 1 }}
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
              {t?.buttons?.cancel || "Cancel"}
            </Button>
            <Button size="small" variant="contained" onClick={saveCaption}>
              {t?.buttons?.save || "Save"}
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
};

FieldList.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FieldList;
