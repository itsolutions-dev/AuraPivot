import React, { useState } from 'react';

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { withIds } from '../../utils/ids';
import DialogHeader from '../shared/DialogHeader';
import { measureCaption, section } from '../shared/l10n';
import { withOpenSession } from '../shared/useOpenSession';
import { ConditionalTab } from './conditional/ConditionalTab';
import { DEFAULTS } from './defaults';
import { LayoutTab, TotalsPositionEditor } from './LayoutTab';
import { SectionEditor } from './SectionEditor';
import type {
  ConditionalRule,
  DimensionEntry,
  LayoutValues,
  MeasureEntry,
  SectionValues,
} from './types';

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
// Rule ids
// ---------------------------------------------------------------------------

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
