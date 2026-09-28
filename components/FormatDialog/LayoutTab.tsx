// The Layout tab (title, density, readability, drill-through, note) and the
// totals-position editor of the Grand totals tab; both edit the layout section.

import React from 'react';

import {
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { usePivot } from '../../context/PivotContext';
import { section } from '../shared/l10n';
import { SectionLabel } from './SectionEditor';
import type { LayoutValues } from './types';

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

export const TotalsPositionEditor = function TotalsPositionEditor({
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

export const LayoutTab = function LayoutTab({
  layout,
  setLayout,
}: LayoutTabProps) {
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
