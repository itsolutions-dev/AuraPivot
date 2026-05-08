import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
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
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import CalculatedFieldDialog from '../CalculatedFieldDialog/CalculatedFieldDialog';

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
  sum: 'Sum',
  count: 'Count',
  distinctcount: 'Distinct count',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  ratioTotal: 'Ratio to total',
  currentRatio: 'Current ratio',
};

/**
 * The auraPivot localization schema stores aggregation entries as objects
 * (`{ caption, totalCaption, grandTotalCaption }`) and uses camelCase keys
 * (`distinctCount`, `average`). Map our internal keys onto that schema and
 * unwrap the caption so React never receives an object as a child.
 */
const WDR_AGGREGATION_KEY = {
  sum: 'sum',
  count: 'count',
  distinctcount: 'distinctCount',
  avg: 'average',
  min: 'min',
  max: 'max',
  ratioTotal: 'ratioTotal',
  currentRatio: 'currentRatio',
};

const resolveAggregationLabel = (t, aggregation) => {
  const wdrKey = WDR_AGGREGATION_KEY[aggregation] || aggregation;
  const entry = t?.aggregations?.[aggregation] ?? t?.aggregations?.[wdrKey];
  if (entry && typeof entry === 'object') {
    return (
      entry.caption || AGGREGATION_LABELS_FALLBACK[aggregation] || aggregation
    );
  }
  return entry || AGGREGATION_LABELS_FALLBACK[aggregation] || aggregation;
};

const ZONES = [
  { id: 'filters', labelKey: 'filters' },
  { id: 'rows', labelKey: 'rows' },
  { id: 'columns', labelKey: 'columns' },
  { id: 'measures', labelKey: 'values' },
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
    if (parsed && typeof parsed === 'object' && parsed.uniqueName)
      return parsed;
  } catch (_err) {
    console.log(_err);
    // fall through
  }
  return { source: 'all', uniqueName: raw };
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
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = parseDragPayload(e.dataTransfer.getData('text/plain'));
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
        transition: 'all 150ms ease',
      })}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, opacity: 0.75, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
        {items.length === 0 && (
          <Typography
            variant="body2"
            sx={{ opacity: 0.5, fontStyle: 'italic' }}
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
                'text/plain',
                JSON.stringify({
                  source: zone,
                  uniqueName: item.uniqueName,
                  idx,
                })
              );
              e.dataTransfer.effectAllowed = 'move';
            },
            onDragOver: (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
            },
            onDrop: (e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              const payload = parseDragPayload(
                e.dataTransfer.getData('text/plain')
              );
              if (payload) onDrop(zone, payload, idx);
            },
          };
          return (
            <Box
              key={`${item.uniqueName}-${idx}`}
              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
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
const SUBPART_PRESETS = {
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

const SUBPART_DEFAULTS = {
  month: 'name-full',
  quarter: 'long',
  weekday: 'name-full',
  week: 'number',
};

const SUBPART_CONFIGURABLE = new Set(Object.keys(SUBPART_PRESETS));

const defaultFormatFor = (subpart) =>
  subpart ? SUBPART_DEFAULTS[subpart] || null : 'locale-date';

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
    DATE_FORMAT_PRESETS.filter((p) => p.value !== 'custom').map((p) => p.value)
  );
  const dateIsPreset = datePresetValues.has(value);
  const dateMode = dateIsPreset ? value : 'custom';
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
          {t?.fieldsList?.dateFormat || 'Date format'}
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
                onChange={(e) => onChange(e.target.value)}
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                placeholder="dd/MM/yyyy HH:mm"
                helperText={
                  t?.fieldsList?.dateFormatHelp ||
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

DateFormatPopover.propTypes = {
  anchor: PropTypes.any,
  uniqueName: PropTypes.string,
  subpart: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  t: PropTypes.object,
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
    engine.getCalculatedFields()
  );

  // Local draft of per-date-field formats. Committed to the engine on Apply.
  const [dateFormats, setDateFormats] = useState(() => engine.getDateFormats());
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
    value: '',
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
    setCaptionEditor({ anchor: null, uniqueName: null, value: '' });
  };

  useEffect(() => {
    if (!open) return undefined;
    const ensureMeasuresAnchor = (s) => {
      const inRows = (s.rows || []).some((f) => f.uniqueName === 'Measures');
      const inCols = (s.columns || []).some((f) => f.uniqueName === 'Measures');
      if (inRows || inCols) return s;
      // Default placement: on columns (matches the "Per colonna" toggle default).
      return {
        ...s,
        columns: [...(s.columns || []), { uniqueName: 'Measures' }],
      };
    };
    const sync = () =>
      setSliceState(ensureMeasuresAnchor({ ...engine.getSlice() }));
    const syncCalc = () => setCalcFields(engine.getCalculatedFields());
    const syncDateFormats = () => setDateFormats(engine.getDateFormats());
    engine.on('reportChange', sync);
    engine.on('dataChange', syncCalc);
    engine.on('formatChange', syncDateFormats);
    sync();
    syncCalc();
    syncDateFormats();
    return () => {
      engine.off('reportChange', sync);
      engine.off('dataChange', syncCalc);
      engine.off('formatChange', syncDateFormats);
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
    'sum',
    'count',
    'distinctcount',
    'avg',
    'min',
    'max',
    'ratioTotal',
    'currentRatio',
  ];
  const allowedAggsFor = (uniqueName) => {
    if (calcFields.some((c) => c.uniqueName === uniqueName)) return ['formula'];
    const meta = engine.getMetadata()[uniqueName];
    return meta?.availableAggregations || DEFAULT_NUMERIC_AGGS;
  };
  const availableFields = useMemo(() => {
    const all = engine.getAvailableFields();
    const inRowsCols = new Set(
      [...(slice.rows || []), ...(slice.columns || [])].map((f) => f.uniqueName)
    );
    const measureAggs = new Map();
    (slice.measures || []).forEach((m) => {
      if (!measureAggs.has(m.uniqueName))
        measureAggs.set(m.uniqueName, new Set());
      measureAggs.get(m.uniqueName).add(m.aggregation);
    });
    return all.filter((f) => {
      if (f.uniqueName === 'Measures') return false;
      if (inRowsCols.has(f.uniqueName)) return false;
      const used = measureAggs.get(f.uniqueName);
      if (!used) return true;
      const allowed = allowedAggsFor(f.uniqueName);
      return allowed.some((a) => !used.has(a));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, slice, calcFields]);

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
        /^(.+)\.(Year|Quarter|Month|Week|Day|Weekday|Hour|Minute)$/
      );
      if (m && meta[m[1]]?.type === 'date') {
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
        isDateParent: true,
        parentUsed: true,
        children,
      });
    });
    return nodes;
  }, [availableFields, engine, t]);

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
    if ((slice.rows || []).some((f) => f.uniqueName === 'Measures'))
      return 'rows';
    return 'columns';
  }, [slice]);

  const handleMeasuresAxisChange = (_e, value) => {
    if (!value || value === measuresAxis) return;
    const next = { ...slice };
    next.rows = (next.rows || []).filter((f) => f.uniqueName !== 'Measures');
    next.columns = (next.columns || []).filter(
      (f) => f.uniqueName !== 'Measures'
    );
    const anchor = { uniqueName: 'Measures' };
    if (value === 'rows') {
      next.rows = [...next.rows, anchor];
    } else {
      next.columns = [...next.columns, anchor];
    }
    setSliceState(next);
  };

  const handleDragStart = (e, uniqueName) => {
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'all', uniqueName })
    );
    e.dataTransfer.effectAllowed = 'move';
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
    if (uniqueName === 'Measures') return;

    // --- Pre-validate measure capacity --------------------------------
    // When dropping into measures from a non-measures source, pick the
    // first aggregation not yet consumed by another measure entry of the
    // same field. If all supported aggregations are in use, abort before
    // mutating any slice zone.
    let chosenAgg = null;
    if (zone === 'measures' && source !== 'measures') {
      const allowed = allowedAggsFor(uniqueName);
      const usedAgg = new Set(
        (slice.measures || [])
          .filter((m) => m.uniqueName === uniqueName)
          .map((m) => m.aggregation)
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
    if (source && source !== 'all' && next[source]) {
      const arr = next[source] || [];
      const entry = arr[sourceIdx];
      if (entry && entry.uniqueName === uniqueName) moving = { ...entry };
      next[source] = popAt(arr, sourceIdx);
    }

    // Build the entry to insert based on the target zone.
    let entry = moving;
    if (zone === 'measures') {
      // On measures → measures reorder preserve the source aggregation.
      // Otherwise use the pre-picked chosenAgg (guaranteed unique per field).
      entry = {
        uniqueName,
        aggregation:
          source === 'measures'
            ? moving.aggregation ||
              (calcFields.some((c) => c.uniqueName === uniqueName)
                ? 'formula'
                : 'sum')
            : chosenAgg,
      };
    } else if (zone === 'filters') {
      // Preserve any existing predicate: if the chip came from filters itself,
      // `moving` already carries it (popAt removed it). Otherwise look it up
      // in the current filters list (cross-zone drag of a field that also
      // happened to be a page-level filter).
      if (source === 'filters') {
        entry = moving;
      } else {
        const existing = (next.filters || []).find(
          (f) => f.uniqueName === uniqueName
        );
        entry = existing || { uniqueName };
      }
    } else {
      entry = { uniqueName };
    }

    if (zone === 'filters') {
      // Filters never strip from rows/cols/measures and never duplicate.
      const current = (next.filters || []).filter(
        (f) => f.uniqueName !== uniqueName
      );
      let insertAt = targetIdx == null ? current.length : targetIdx;
      if (
        source === 'filters' &&
        sourceIdx != null &&
        targetIdx != null &&
        sourceIdx < targetIdx
      ) {
        // Compensate for the removal offset when moving downward in the same list.
        insertAt = Math.max(0, targetIdx - 1);
      }
      current.splice(insertAt, 0, entry);
      next.filters = current;
    } else if (zone === 'measures') {
      // Measures accept multiple entries of the same field (one per
      // aggregation). Strip only from rows/cols when the field arrives
      // from the palette or a cross-zone move. Keep siblings in measures.
      if (
        source === 'all' ||
        source === 'filters' ||
        source === 'rows' ||
        source === 'columns'
      ) {
        next.rows = pop(next.rows, uniqueName);
        next.columns = pop(next.columns, uniqueName);
      }
      const current = [...(next.measures || [])];
      let insertAt = targetIdx == null ? current.length : targetIdx;
      if (
        source === 'measures' &&
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
      if (source === 'all' || source === 'filters') {
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
      i === idx ? { ...m, aggregation } : m
    );
    setSliceState(next);
  };

  const toggleMeasureHidden = (idx) => {
    const next = { ...slice };
    next.measures = (next.measures || []).map((m, i) =>
      i === idx ? { ...m, hidden: !m.hidden } : m
    );
    setSliceState(next);
  };

  const visibleMeasureCount = (slice.measures || []).filter(
    (m) => !m.hidden
  ).length;
  const canApply =
    (slice.measures || []).length === 0 || visibleMeasureCount > 0;

  const handleApply = () => {
    engine.setDateFormats(dateFormats);
    engine.setSlice(slice);
    onClose?.();
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
    if (uniqueName === 'Measures') {
      return t?.fieldsList?.values || 'Values';
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
            item.uniqueName === 'Measures' ? (
              <FunctionsIcon fontSize="small" />
            ) : undefined
          }
          label={captionFor(item.uniqueName)}
          size="small"
          onDelete={() => removeFromZone(zone, idx)}
          deleteIcon={<DeleteOutlineIcon />}
          sx={{
            borderRadius: 2,
            ...(item.uniqueName === 'Measures' && {
              backgroundColor: (theme) => theme.palette.primary.main + '22',
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
        (c) => c.uniqueName === item.uniqueName
      );
      const isCalculated = !!calcField;
      const allowed = isCalculated
        ? ['formula']
        : item.availableAggregations || [
            'sum',
            'count',
            'distinctcount',
            'avg',
            'min',
            'max',
            'ratioTotal',
            'currentRatio',
          ];
      // A field can appear multiple times in measures — one entry per
      // aggregation — so hide from this chip's dropdown the aggregations
      // that sibling chips of the same field have already consumed.
      const usedBySiblings = new Set(
        (slice.measures || [])
          .filter((m, i) => m.uniqueName === item.uniqueName && i !== idx)
          .map((m) => m.aggregation)
      );
      const selectable = allowed.filter(
        (a) => a === item.aggregation || !usedBySiblings.has(a)
      );
      return (
        <Chip
          key={`${item.uniqueName}-${idx}`}
          onDelete={() => removeFromZone(zone, idx)}
          deleteIcon={<DeleteOutlineIcon />}
          sx={{
            borderRadius: 2,
            height: 'auto',
            py: 0.5,
            opacity: isHidden ? 0.55 : 1,
            textDecoration: isHidden ? 'line-through' : 'none',
          }}
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Tooltip
                title={
                  isHidden
                    ? t?.fieldsList?.showMeasure || 'Show measure'
                    : t?.fieldsList?.hideMeasure || 'Hide measure'
                }
              >
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMeasureHidden(idx);
                  }}
                  sx={{ p: '2px', '& svg': { fontSize: 14 } }}
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
                    t?.fieldsList?.calculatedFieldTooltip || 'Calculated field'
                  }
                >
                  <CalculateIcon
                    fontSize="small"
                    sx={{ color: 'primary.main' }}
                  />
                </Tooltip>
              )}
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {captionFor(item.uniqueName)}
              </Typography>
              <Select
                value={item.aggregation}
                onChange={(e) => changeAggregation(idx, e.target.value)}
                variant="standard"
                disableUnderline
                sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0 } }}
              >
                {selectable.map((a) => (
                  <MenuItem key={a} value={a} dense>
                    {resolveAggregationLabel(t, a)}
                  </MenuItem>
                ))}
              </Select>
              {isCalculated && (
                <>
                  <Tooltip title={t?.buttons?.edit || 'Edit'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCalcDialog({
                          open: true,
                          editField: calcField,
                        });
                      }}
                      sx={{ p: '2px', '& svg': { fontSize: 14 } }}
                    >
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t?.buttons?.delete || 'Delete'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.removeCalculatedField(item.uniqueName);
                      }}
                      sx={{
                        p: '2px',
                        '& svg': { fontSize: 14 },
                        color: 'error.main',
                      }}
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
          {t?.fieldsList?.title || 'Fields'}
          <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
            {t?.fieldsList?.subtitle || 'Drag and drop fields to arrange them'}
          </Typography>
          <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', top: 8, right: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, opacity: 0.75 }}
              >
                {t?.fieldsList?.allFields || 'All fields'}
              </Typography>
              <Box
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
                <Stack gap={0.5}>
                  {fieldsTree.map((f) => {
                    if (f.isDateParent) {
                      const isExpanded = expandedDates.has(f.uniqueName);
                      const draggable = !f.parentUsed;
                      return (
                        <Box key={f.uniqueName}>
                          <Box
                            draggable={draggable}
                            onDragStart={
                              draggable
                                ? (e) => handleDragStart(e, f.uniqueName)
                                : undefined
                            }
                            sx={(theme) => ({
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              cursor: draggable ? 'grab' : 'default',
                              px: 1,
                              py: 0.5,
                              borderRadius: 1.5,
                              backgroundColor: f.parentUsed
                                ? 'transparent'
                                : theme.palette.action.hover,
                              border: '1px solid transparent',
                              '&:hover': {
                                backgroundColor: f.parentUsed
                                  ? theme.palette.action.hover
                                  : theme.palette.action.selected,
                              },
                              opacity: f.parentUsed ? 0.6 : 1,
                            })}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDateExpanded(f.uniqueName);
                              }}
                              sx={{ p: '2px', '& svg': { fontSize: 18 } }}
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
                              sx={{ color: 'primary.main', opacity: 0.7 }}
                            />
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {f.caption}
                            </Typography>
                            <Tooltip
                              title={
                                t?.fieldsList?.renameField || 'Rename field'
                              }
                            >
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCaptionEditor(
                                    e.currentTarget,
                                    f.uniqueName
                                  );
                                }}
                                sx={{ p: '2px', '& svg': { fontSize: 14 } }}
                              >
                                <EditIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip
                              title={t?.fieldsList?.dateFormat || 'Date format'}
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
                                sx={{ p: '2px', '& svg': { fontSize: 14 } }}
                              >
                                <TuneIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          {isExpanded &&
                            f.children.map((c) => (
                              <Box
                                key={c.uniqueName}
                                draggable
                                onDragStart={(e) =>
                                  handleDragStart(e, c.uniqueName)
                                }
                                sx={(theme) => ({
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  cursor: 'grab',
                                  pl: 4,
                                  pr: 1,
                                  py: 0.5,
                                  mt: 0.25,
                                  borderRadius: 1.5,
                                  backgroundColor: theme.palette.action.hover,
                                  border: '1px solid transparent',
                                  '&:hover': {
                                    backgroundColor:
                                      theme.palette.action.selected,
                                  },
                                })}
                              >
                                <DragIndicatorIcon
                                  fontSize="small"
                                  sx={{ opacity: 0.5 }}
                                />
                                <Typography variant="body2" sx={{ flex: 1 }}>
                                  {c.partCaption}
                                </Typography>
                                <Tooltip
                                  title={
                                    t?.fieldsList?.renameField || 'Rename field'
                                  }
                                >
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCaptionEditor(
                                        e.currentTarget,
                                        c.uniqueName
                                      );
                                    }}
                                    sx={{
                                      p: '2px',
                                      '& svg': { fontSize: 14 },
                                    }}
                                  >
                                    <EditIcon fontSize="inherit" />
                                  </IconButton>
                                </Tooltip>
                                {SUBPART_CONFIGURABLE.has(c.subpart) && (
                                  <Tooltip
                                    title={
                                      t?.fieldsList?.dateFormat || 'Date format'
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
                                      sx={{
                                        p: '2px',
                                        '& svg': { fontSize: 14 },
                                      }}
                                    >
                                      <TuneIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            ))}
                        </Box>
                      );
                    }
                    return (
                      <Box
                        key={f.uniqueName}
                        draggable={!f.isCalculated || true}
                        onDragStart={(e) => handleDragStart(e, f.uniqueName)}
                        sx={(theme) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          cursor: 'grab',
                          px: 1,
                          py: 0.5,
                          borderRadius: 1.5,
                          backgroundColor: f.isCalculated
                            ? theme.palette.primary.main + '18'
                            : theme.palette.action.hover,
                          border: f.isCalculated
                            ? `1px solid ${theme.palette.primary.main}40`
                            : '1px solid transparent',
                          '&:hover': {
                            backgroundColor: theme.palette.action.selected,
                          },
                        })}
                      >
                        <DragIndicatorIcon
                          fontSize="small"
                          sx={{ opacity: 0.5 }}
                        />
                        {f.uniqueName === 'Measures' && (
                          <Tooltip
                            title={
                              t?.fieldsList?.measuresAxisTooltip ||
                              'Special aggregation field — drag to Rows or Columns to choose the values axis'
                            }
                          >
                            <FunctionsIcon
                              fontSize="small"
                              sx={{ color: 'primary.main' }}
                            />
                          </Tooltip>
                        )}
                        {f.isCalculated && (
                          <Tooltip
                            title={
                              t?.fieldsList?.calculatedFieldTooltip ||
                              'Calculated field'
                            }
                          >
                            <CalculateIcon
                              fontSize="small"
                              sx={{ color: 'primary.main' }}
                            />
                          </Tooltip>
                        )}
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {f.caption}
                        </Typography>
                        {!f.isCalculated && f.uniqueName !== 'Measures' && (
                          <Tooltip
                            title={t?.fieldsList?.renameField || 'Rename field'}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCaptionEditor(
                                  e.currentTarget,
                                  f.uniqueName
                                );
                              }}
                              sx={{ p: '2px', '& svg': { fontSize: 14 } }}
                            >
                              <EditIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {f.isCalculated && (
                          <>
                            <Tooltip title={t?.buttons?.edit || 'Edit'}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCalcDialog({
                                    open: true,
                                    editField:
                                      calcFields.find(
                                        (c) => c.uniqueName === f.uniqueName
                                      ) || f,
                                  });
                                }}
                                sx={{ p: '2px', '& svg': { fontSize: 14 } }}
                              >
                                <EditIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t?.buttons?.delete || 'Delete'}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  engine.removeCalculatedField(f.uniqueName);
                                }}
                                sx={{
                                  p: '2px',
                                  '& svg': { fontSize: 14 },
                                  color: 'error.main',
                                }}
                              >
                                <DeleteOutlineIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>

              <Button
                size="small"
                startIcon={<CalculateIcon />}
                onClick={() => setCalcDialog({ open: true, editField: null })}
                sx={{ mt: 1, width: '100%', justifyContent: 'flex-start' }}
              >
                {t?.fieldsList?.addCalculated || 'Add calculated value'}
              </Button>
            </Box>

            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.25,
                  flexWrap: 'wrap',
                }}
              >
                <FunctionsIcon
                  fontSize="small"
                  sx={{ color: 'primary.main' }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {t?.fieldsList?.showTotals || 'Show totals'}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={measuresAxis}
                  onChange={handleMeasuresAxisChange}
                  sx={{ ml: 'auto' }}
                >
                  <ToggleButton
                    value="rows"
                    sx={{ textTransform: 'none', py: 0.25 }}
                  >
                    {t?.fieldsList?.perRow || 'Per row'}
                  </ToggleButton>
                  <ToggleButton
                    value="columns"
                    sx={{ textTransform: 'none', py: 0.25 }}
                  >
                    {t?.fieldsList?.perColumn || 'Per column'}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Stack gap={1.25}>
                {ZONES.map((zone) => {
                  const items = (slice[zone.id] || []).filter(
                    (f) => f.uniqueName !== 'Measures'
                  );
                  const label =
                    t?.fieldsList?.[
                      zone.id === 'measures' ? 'values' : zone.id
                    ] || zone.id;
                  return (
                    <DropZone
                      key={zone.id}
                      zone={zone.id}
                      items={items}
                      label={label}
                      dropHint={t?.fieldsList?.dropField || 'Drop field here'}
                      onDrop={addFieldToZone}
                      renderItem={
                        zone.id === 'measures'
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
              sx={{ color: 'error.main', mr: 'auto' }}
            >
              {t?.fieldsList?.atLeastOneVisibleMeasure ||
                'At least one measure must be visible.'}
            </Typography>
          )}
          <Button onClick={onClose}>{t?.buttons?.cancel || 'Cancel'}</Button>
          <Button
            onClick={handleApply}
            variant="contained"
            disabled={!canApply}
          >
            {t?.buttons?.apply || 'Apply'}
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
          setCaptionEditor({ anchor: null, uniqueName: null, value: '' })
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        container={portalContainer}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, opacity: 0.75, display: 'block', mb: 1 }}
          >
            {t?.fieldsList?.renameField || 'Rename field'}
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
              if (e.key === 'Enter') saveCaption();
              if (e.key === 'Escape')
                setCaptionEditor({
                  anchor: null,
                  uniqueName: null,
                  value: '',
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
                  value: '',
                })
              }
            >
              {t?.buttons?.cancel || 'Cancel'}
            </Button>
            <Button size="small" variant="contained" onClick={saveCaption}>
              {t?.buttons?.save || 'Save'}
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
