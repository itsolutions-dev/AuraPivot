import React, { useMemo, useState } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
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
} from '@mui/material';
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { usePivot } from '../../context/PivotContext';
import useEngineVersion from '../../hooks/useEngineVersion';
import CalculatedFieldDialog from '../CalculatedFieldDialog/CalculatedFieldDialog';
import DialogHeader from '../shared/DialogHeader';
import { aggregationLabel, section } from '../shared/l10n';
import { withOpenSession } from '../shared/useOpenSession';
import { MEASURE_AGGREGATIONS } from '../../pivot-core/aggregation/labels';
import { hasOwn } from '../../pivot-core/utils';
import type {
  InternalCalculatedField,
  InternalSlice,
} from '../../pivot-core/PivotEngine';
import type {
  ZoneId,
  ZoneField,
  LocalSlice,
  AvailableField,
  FieldTreeNode,
  DragPayload,
} from './types';
import {
  ZONES,
  readDragPayload,
  ensureMeasuresAnchor,
  stripFromSlice,
  applyZoneDrop,
} from './sliceEdits';
import {
  SUBPART_CONFIGURABLE,
  defaultFormatFor,
  DateFormatPopover,
} from './DateFormatPopover';
import { NumericField } from './NumericField';
import { DropZone } from './DropZone';
import { RowAction, PaletteRow } from './PaletteRow';

/**
 * Field list dialog: drag fields between the filters, rows, columns and
 * values zones, and set per-field captions, date formats and drill-through
 * columns. Built on MUI primitives, so it follows the host theme, dark mode
 * included.
 *
 * Drag-and-drop uses the native HTML5 API rather than a dnd library.
 */

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

export interface FieldListProps {
  open: boolean;
  onClose: () => void;
  measuresAxis?: 'rows' | 'columns';
}

// ---------------------------------------------------------------------------
// Main FieldList component
// ---------------------------------------------------------------------------

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

  const addFieldToZone = (
    zone: ZoneId,
    payload: DragPayload,
    targetIdx: number | null,
  ) => {
    const next = applyZoneDrop(slice, zone, payload, targetIdx, {
      isKnownField,
      allowedAggsFor,
      isCalculated: (uniqueName) => !!calcField(uniqueName),
    });
    if (next) setSliceState(next);
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
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
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
